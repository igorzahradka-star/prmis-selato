/**
 * Upozornění e-mailem k objednávkám — komu a co napsat. Čistá logika bez SharePointu a Reactu.
 *
 * Odeslání samotné (Microsoft Graph, schránka přihlášeného uživatele) je v datové vrstvě. Tady se jen rozhoduje,
 * kdo má být upozorněn na to, že má schvalovat, a jak e-mail zní. Stejný postup půjde použít i pro další
 * dokumenty ke schválení (podklady pro fakturaci, předávací protokoly) — stačí jiný text a odkaz.
 */

import { normalizeLogin } from './roles';
import { Role } from './types';
import { RoleMembership } from './userAdmin';
import { APPROVAL_LEVEL_LABELS, ApprovalLevel, OrderStatus, PurchaseOrder } from './orders';
import { WorkflowProject, currentStepIndex } from './orderWorkflow';
import { isValidEmail } from './mail';

export interface Recipient {
  email: string;
  name: string;
}

/**
 * Z přihlašovacího jména SharePointu (`i:0#.f|membership|jan.novak@revoltum.cz`) vytáhne e-mail.
 * Funguje u běžných účtů Microsoftu 365; jinde (skupiny, externí hosté s `#ext#`) vrátí `undefined`.
 */
export function emailFromLogin(login: string | undefined): string | undefined {
  const parts = (login || '').split('|');
  const last = parts[parts.length - 1].trim();
  return last.indexOf('#ext#') === -1 && isValidEmail(last) ? last : undefined;
}

/** E-mail člověka: nejdřív z členství v rolích (SharePoint ho zná), jinak z přihlašovacího jména. */
function findRecipient(login: string | undefined, name: string | undefined, memberships: RoleMembership[]): Recipient | undefined {
  if (!login) {
    return undefined;
  }
  const wanted = normalizeLogin(login);
  for (const m of memberships) {
    for (const p of m.members) {
      if (normalizeLogin(p.loginName) === wanted && p.email && isValidEmail(p.email)) {
        return { email: p.email, name: p.displayName || name || p.email };
      }
    }
  }
  const email = emailFromLogin(login);
  return email ? { email, name: name || email } : undefined;
}

export function membersOf(role: Role, memberships: RoleMembership[]): Recipient[] {
  const out: Recipient[] = [];
  memberships
    .filter((m) => m.role === role)
    .forEach((m) =>
      m.members.forEach((p) => {
        const email = p.email && isValidEmail(p.email) ? p.email : emailFromLogin(p.loginName);
        if (email) {
          out.push({ email, name: p.displayName || email });
        }
      })
    );
  return out;
}

/**
 * Komu poslat upozornění, že objednávka čeká na schválení: přiřazenému schvalovateli aktuálního kroku;
 * bez přiřazení všem z příslušné role (PM projektu, členové vedení, jednatelé). Vystavitel se nikdy neupozorňuje
 * na vlastní objednávku; adresy se neopakují.
 */
export function approvalRecipients(order: PurchaseOrder, project: WorkflowProject, memberships: RoleMembership[]): Recipient[] {
  if (order.status !== OrderStatus.KeSchvaleni) {
    return [];
  }
  const index = currentStepIndex(order.approvalChain);
  if (index === -1) {
    return [];
  }
  const step = order.approvalChain[index];
  let found: Recipient[];
  if (step.assignedLogin) {
    const one = findRecipient(step.assignedLogin, step.assignedName, memberships);
    found = one ? [one] : [];
  } else if (step.level === 'pm') {
    const one = findRecipient(project.projectManagerLogin, project.projectManagerName, memberships);
    found = one ? [one] : [];
  } else {
    found = membersOf(step.level === 'vedeni' ? Role.Vedeni : Role.Jednatel, memberships);
  }
  const requester = emailFromLogin(order.requestedByLogin);
  const seen: string[] = [];
  return found.filter((r) => {
    const key = r.email.toLowerCase();
    if ((requester && key === requester.toLowerCase()) || seen.indexOf(key) !== -1) {
      return false;
    }
    seen.push(key);
    return true;
  });
}

/** Adresát podle přihlašovacího jména: nejdřív e-mail ze členství v rolích, jinak z přihlašovacího jména. */
export function personRecipient(login: string | undefined, name: string | undefined, memberships: RoleMembership[]): Recipient | undefined {
  return findRecipient(login, name, memberships);
}

/** Vystavitel jako adresát zprávy o rozhodnutí. */
export function requesterRecipient(order: PurchaseOrder, memberships: RoleMembership[]): Recipient | undefined {
  return findRecipient(order.requestedByLogin, order.requestedByName, memberships);
}

/**
 * Odkaz, který otevře objednávku přímo v aplikaci. `pageUrl` je adresa stránky s aplikací (bez `#`),
 * `route` název cesty (`cekam-na-me` pro schvalovatele, `objednavky` jinak).
 */
export function orderLink(pageUrl: string, route: string, orderId: number): string {
  const base = (pageUrl || '').split('#')[0];
  return `${base}#/${route}/${orderId}`;
}

export interface ApprovalMailInput {
  orderNumber: string;
  projectNumber: string;
  projectName?: string;
  subject: string;
  supplierName?: string;
  /** Částka bez DPH jako text včetně měny. */
  amountText: string;
  requesterName: string;
  level: ApprovalLevel;
  link: string;
  companyName: string;
}

/** E-mail schvalovateli: co má schválit a kam kliknout. */
export function approvalRequestMail(input: ApprovalMailInput): { subject: string; body: string } {
  const lines = [
    'Dobrý den,',
    '',
    `čeká na vás ke schválení objednávka ${input.orderNumber} (${APPROVAL_LEVEL_LABELS[input.level]}).`,
    '',
    `Projekt: ${input.projectNumber}${input.projectName ? ' ' + input.projectName : ''}`,
    `Dodavatel: ${input.supplierName || '—'}`,
    `Předmět: ${input.subject || '—'}`,
    `Částka bez DPH: ${input.amountText}`,
    `Vystavil: ${input.requesterName}`,
    '',
    'Objednávku otevřete a schválíte (nebo vrátíte) tady:',
    input.link,
    '',
    'Tento e-mail odeslala aplikace PRM Revoltum jménem vystavitele.',
    input.companyName
  ];
  return { subject: `Ke schválení: objednávka ${input.orderNumber} – ${input.subject || input.projectNumber}`, body: lines.join('\n') };
}

export interface DecisionMailInput {
  orderNumber: string;
  subject: string;
  /** Výsledek: schváleno (celé), vráceno k úpravě, zamítnuto. */
  outcome: 'schvaleno' | 'vraceno' | 'zamitnuto';
  decidedBy: string;
  comment?: string;
  link: string;
  companyName: string;
}

const OUTCOME_TEXT: Record<DecisionMailInput['outcome'], { subject: string; line: string }> = {
  schvaleno: { subject: 'schválena', line: 'byla schválena a můžete ji odeslat dodavateli' },
  vraceno: { subject: 'vrácena k úpravě', line: 'byla vrácena k úpravě' },
  zamitnuto: { subject: 'zamítnuta', line: 'byla zamítnuta' }
};

/** E-mail vystaviteli o výsledku schvalování. */
export function decisionMail(input: DecisionMailInput): { subject: string; body: string } {
  const t = OUTCOME_TEXT[input.outcome];
  const lines = [
    'Dobrý den,',
    '',
    `vaše objednávka ${input.orderNumber}${input.subject ? ` (${input.subject})` : ''} ${t.line}.`,
    `Rozhodl(a): ${input.decidedBy}`,
    input.comment ? `Komentář: ${input.comment}` : '',
    '',
    'Objednávku otevřete tady:',
    input.link,
    '',
    input.companyName
  ];
  return {
    subject: `Objednávka ${input.orderNumber} ${t.subject}`,
    body: lines.filter((l, i) => !(l === '' && lines[i - 1] === '' )).join('\n').replace(/\n{3,}/g, '\n\n')
  };
}

// --- podklady pro fakturaci ---------------------------------------------------------

/** Komu poslat upozornění, že podklad čeká na kontrolu: PM projektu (vystavitel se neupozorňuje sám). */
export function invoiceCheckRecipients(
  issuerLogin: string,
  project: WorkflowProject,
  memberships: RoleMembership[]
): Recipient[] {
  const pm = findRecipient(project.projectManagerLogin, project.projectManagerName, memberships);
  const issuer = emailFromLogin(issuerLogin);
  return pm && !(issuer && pm.email.toLowerCase() === issuer.toLowerCase()) ? [pm] : [];
}

export interface InvoiceMailInput {
  number: string;
  projectNumber: string;
  projectName?: string;
  customerName?: string;
  /** Částka bez DPH jako text včetně měny. */
  amountText: string;
  requesterName: string;
  link: string;
  companyName: string;
}

/** E-mail PM: podklad čeká na kontrolu a předání účtárně. */
export function invoiceCheckMail(input: InvoiceMailInput): { subject: string; body: string } {
  const lines = [
    'Dobrý den,',
    '',
    `čeká na vás ke kontrole podklad pro fakturaci ${input.number}.`,
    '',
    `Projekt: ${input.projectNumber}${input.projectName ? ' ' + input.projectName : ''}`,
    `Odběratel: ${input.customerName || '—'}`,
    `Částka bez DPH: ${input.amountText}`,
    `Vystavil: ${input.requesterName}`,
    '',
    'Podklad otevřete, zkontrolujete a předáte účtárně (nebo vrátíte) tady:',
    input.link,
    '',
    'Tento e-mail odeslala aplikace PRM Revoltum jménem vystavitele.',
    input.companyName
  ];
  return { subject: `Ke kontrole: podklad pro fakturaci ${input.number} – ${input.customerName || input.projectNumber}`, body: lines.join('\n') };
}

/** E-mail vystaviteli: podklad byl vrácen k úpravě. */
export function invoiceReturnedMail(input: {
  number: string;
  decidedBy: string;
  comment?: string;
  link: string;
  companyName: string;
}): { subject: string; body: string } {
  const lines = [
    'Dobrý den,',
    '',
    `váš podklad pro fakturaci ${input.number} byl vrácen k úpravě.`,
    `Vrátil(a): ${input.decidedBy}`,
    input.comment ? `Co opravit: ${input.comment}` : '',
    '',
    'Podklad otevřete tady:',
    input.link,
    '',
    input.companyName
  ];
  return {
    subject: `Podklad ${input.number} vrácen k úpravě`,
    body: lines.filter((l, i) => !(l === '' && lines[i - 1] === '')).join('\n')
  };
}
