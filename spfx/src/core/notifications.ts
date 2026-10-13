/**
 * Upozornění e-mailem — osobní nastavení příjemce a e-maily k rozpočtům. Čistá logika bez SharePointu a Reactu.
 *
 * Každý uživatel si v Můj profil může upozornění vypnout po skupinách:
 *  - `approvals` — „něco čeká na moje schválení / kontrolu“ (objednávka, podklad pro fakturaci, rozpočet),
 *  - `results` — „výsledek mojí žádosti“ (schváleno, vráceno k úpravě).
 * Bez uloženého nastavení platí, že upozornění jsou zapnutá. Vypnutí se týká jen e-mailu; úkol zůstává vidět v „Čeká na mě“.
 */

import { Recipient, emailFromLogin, membersOf, personRecipient } from './orderNotify';
import { RoleMembership } from './userAdmin';
import { Role } from './types';
import { normalizeLogin } from './roles';

export type NotificationKind = 'approvals' | 'results';

export interface NotificationPrefs {
  approvals: boolean;
  results: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = { approvals: true, results: true };

export const NOTIFICATION_LABELS: Record<NotificationKind, { title: string; hint: string }> = {
  approvals: { title: 'Co čeká na moje schválení nebo kontrolu', hint: 'Objednávky, podklady pro fakturaci a rozpočty, které mám schválit nebo zkontrolovat.' },
  results: { title: 'Výsledek mých žádostí', hint: 'Zpráva, že moje objednávka, podklad nebo rozpočet byly schváleny, vráceny k úpravě nebo zamítnuty.' }
};

/** Klíč příjemce v mapě nastavení: e-mail malými písmeny. */
export function prefsKey(email: string | undefined): string {
  return (email || '').trim().toLowerCase();
}

/** Nastavení z uloženého textu; cokoli nečitelné nebo chybějící znamená „zapnuto“. */
export function prefsFromJson(json: string | undefined): NotificationPrefs {
  let raw: unknown;
  try {
    raw = json ? JSON.parse(json) : undefined;
  } catch {
    raw = undefined;
  }
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { approvals: o.approvals !== false, results: o.results !== false };
}

export function prefsToJson(prefs: NotificationPrefs): string {
  return JSON.stringify({ approvals: prefs.approvals, results: prefs.results });
}

/** Rozdělí příjemce na ty, kterým se e-mail pošle, a ty, kdo si tuto skupinu vypnuli. Neznámý příjemce = zapnuto. */
export function splitByPrefs(recipients: Recipient[], prefs: Record<string, NotificationPrefs>, kind: NotificationKind): { send: Recipient[]; muted: Recipient[] } {
  const send: Recipient[] = [];
  const muted: Recipient[] = [];
  recipients.forEach((r) => {
    const p = prefs[prefsKey(r.email)];
    (p && p[kind] === false ? muted : send).push(r);
  });
  return { send, muted };
}

// --- rozpočet ---------------------------------------------------------------------

/**
 * Komu poslat upozornění, že rozpočet čeká na schválení: vybranému schvalovateli, jinak celému vedení a administrátorům.
 * Žadatel se neupozorňuje sám; adresy se neopakují.
 */
export function budgetApprovalRecipients(approverLogin: string | undefined, approverName: string | undefined, requesterLogin: string, memberships: RoleMembership[]): Recipient[] {
  let found: Recipient[];
  if (approverLogin) {
    const one = personRecipient(approverLogin, approverName, memberships);
    found = one ? [one] : [];
  } else {
    found = [...membersOf(Role.Vedeni, memberships), ...membersOf(Role.Administrator, memberships)];
  }
  const me = emailFromLogin(requesterLogin);
  const seen: string[] = [];
  return found.filter((r) => {
    const key = prefsKey(r.email);
    if ((me && key === prefsKey(me)) || seen.indexOf(key) !== -1) {
      return false;
    }
    seen.push(key);
    return true;
  });
}

/**
 * Žadatel o schválení rozpočtu jako adresát výsledku. Rozpočet si pamatuje jen jméno žadatele, proto se hledá podle jména
 * v členech rolí; když se nenajde, použije se projektový manažer.
 */
export function budgetRequesterRecipient(requesterName: string | undefined, pmLogin: string | undefined, pmName: string | undefined, memberships: RoleMembership[]): Recipient | undefined {
  const name = (requesterName || '').trim().toLowerCase();
  if (name !== '') {
    for (const m of memberships) {
      for (const p of m.members) {
        if ((p.displayName || '').trim().toLowerCase() === name) {
          const one = personRecipient(p.loginName, p.displayName, memberships);
          if (one) {
            return one;
          }
        }
      }
    }
  }
  return pmLogin && normalizeLogin(pmLogin) !== '' ? personRecipient(pmLogin, pmName, memberships) : undefined;
}

export interface BudgetApprovalMailInput {
  projectNumber: string;
  projectName?: string;
  requesterName: string;
  /** Řádky se shrnutím čísel (plán nákupu, tržby, marže). */
  summary: string[];
  link: string;
  companyName: string;
}

/** E-mail schvalovateli: rozpočet čeká na schválení. */
export function budgetApprovalMail(input: BudgetApprovalMailInput): { subject: string; body: string } {
  const lines = [
    'Dobrý den,',
    '',
    `čeká na vás ke schválení realizační rozpočet projektu ${input.projectNumber}${input.projectName ? ' ' + input.projectName : ''}.`,
    '',
    ...input.summary,
    `Žádost podal(a): ${input.requesterName}`,
    '',
    'Projekt otevřete (záložka Realizační rozpočet) a rozpočet schválíte nebo vrátíte k úpravě tady:',
    input.link,
    '',
    'Tento e-mail odeslala aplikace PRM Revoltum jménem žadatele. Upozornění si můžete vypnout v Můj profil.',
    input.companyName
  ];
  return { subject: `Ke schválení: rozpočet projektu ${input.projectNumber}${input.projectName ? ' – ' + input.projectName : ''}`, body: lines.join('\n') };
}

export interface BudgetDecisionMailInput {
  projectNumber: string;
  projectName?: string;
  outcome: 'schvaleno' | 'vraceno';
  decidedBy: string;
  comment?: string;
  link: string;
  companyName: string;
}

/** E-mail žadateli o výsledku schvalování rozpočtu. */
export function budgetDecisionMail(input: BudgetDecisionMailInput): { subject: string; body: string } {
  const approved = input.outcome === 'schvaleno';
  const lines = [
    'Dobrý den,',
    '',
    `rozpočet projektu ${input.projectNumber}${input.projectName ? ' ' + input.projectName : ''} ${approved ? 'byl schválen' : 'byl vrácen k úpravě'}.`,
    `Rozhodl(a): ${input.decidedBy}`
  ];
  if (input.comment) {
    lines.push(`Komentář: ${input.comment}`);
  }
  lines.push('', 'Projekt otevřete tady:', input.link, '', 'Upozornění si můžete vypnout v Můj profil.', input.companyName);
  return { subject: `Rozpočet projektu ${input.projectNumber} ${approved ? 'schválen' : 'vrácen k úpravě'}`, body: lines.join('\n') };
}
