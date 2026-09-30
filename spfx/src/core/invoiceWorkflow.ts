/**
 * Životní cyklus podkladu pro fakturaci — čistá logika bez SharePointu a Reactu.
 *
 * Koncept → Ke kontrole → Předáno účtárně → Vyfakturováno → Uhrazeno, kdykoli před úhradou Storno (s důvodem).
 *
 * Pravidla (zadání kap. 8.6 a rozhodnutí z 30. 9. 2026):
 *  - vystavit smí, kdo smí na projektu vystavovat objednávky (PM, asistent, vedení, administrátor); na Režii se nefakturuje;
 *  - **kontrolu** a předání účtárně dělá projektový manažer projektu, vedení a administrátor; podklad vystavený asistentem
 *    proto jde nejdřív „ke kontrole", podklad vystavený PM, vedením nebo administrátorem se může předat účtárně rovnou;
 *  - číslo faktury (Vyfakturováno) a datum úhrady doplňuje ten, kdo s podkladem smí nakládat, nebo role Finance;
 *  - storno a další kroky vždy ověřuje i datová vrstva těsně před zápisem, nejen tlačítka v obrazovce.
 */

import { hasAnyRole, normalizeLogin } from './roles';
import { Role } from './types';
import { Actor, WorkflowError, WorkflowProject, canIssueOrder } from './orderWorkflow';
import { InvoiceBasis, InvoiceStatus, FINAL_INVOICE_STATUSES, validateInvoiceDraft } from './invoiceBases';

export interface InvoiceContext {
  project: WorkflowProject;
  actor: Actor;
  now: Date;
}

export type InvoiceAction = 'edit' | 'submit' | 'handover' | 'return' | 'invoiced' | 'paid' | 'resend' | 'cancel';

/** Co se má při změně stavu zapsat. */
export interface InvoiceChange {
  status: InvoiceStatus;
  /** Věta do auditního logu. */
  auditAction: string;
  handoverDate?: Date;
  accountingInvoiceNo?: string;
  paidDate?: Date;
  cancelReason?: string;
  pdfUrl?: string;
}

function sameLogin(a: string | undefined, b: string | undefined): boolean {
  const x = normalizeLogin(a);
  return x !== '' && x === normalizeLogin(b);
}

/** Smí uživatel na projektu vystavit podklad? Na Režii ne (nemá zákazníka). */
export function canIssueInvoice(project: WorkflowProject, actor: Actor): boolean {
  return !project.isOverhead && canIssueOrder(project, actor);
}

/** Kdo smí s podkladem nakládat: vystavitel, PM projektu, vedení, administrátor. */
export function canManageInvoice(inv: InvoiceBasis, project: WorkflowProject, actor: Actor): boolean {
  return (
    sameLogin(inv.requestedByLogin, actor.login) ||
    sameLogin(project.projectManagerLogin, actor.login) ||
    hasAnyRole(actor.roles, Role.Administrator, Role.Vedeni)
  );
}

/** Kdo smí podklad zkontrolovat a předat účtárně: PM projektu, vedení, administrátor. */
export function canCheckInvoice(project: WorkflowProject, actor: Actor): boolean {
  return sameLogin(project.projectManagerLogin, actor.login) || hasAnyRole(actor.roles, Role.Administrator, Role.Vedeni);
}

/** Číslo faktury a úhradu smí doplnit i finance. */
function canFinalize(inv: InvoiceBasis, project: WorkflowProject, actor: Actor): boolean {
  return canManageInvoice(inv, project, actor) || hasAnyRole(actor.roles, Role.Finance);
}

/** Jde podklad upravovat? Jen koncept a jen tomu, kdo s ním smí nakládat. */
export function canEditInvoice(inv: InvoiceBasis, project: WorkflowProject, actor: Actor): boolean {
  return inv.status === InvoiceStatus.Koncept && canManageInvoice(inv, project, actor);
}

/** Smaže podklad jen administrátor (Jednorázové akce); běžně se podklady stornují. */
export function canDeleteInvoice(actor: Actor): boolean {
  return hasAnyRole(actor.roles, Role.Administrator);
}

/** Akce, které má uživatel u podkladu nabídnout (tlačítka). Rozhodnutí se znovu ověřuje při zápisu. */
export function availableInvoiceActions(inv: InvoiceBasis, project: WorkflowProject, actor: Actor): InvoiceAction[] {
  const actions: InvoiceAction[] = [];
  const manage = canManageInvoice(inv, project, actor);
  const check = canCheckInvoice(project, actor);

  switch (inv.status) {
    case InvoiceStatus.Koncept:
      if (manage) {
        actions.push('edit');
        actions.push(check ? 'handover' : 'submit');
      }
      break;
    case InvoiceStatus.KeKontrole:
      if (check) {
        actions.push('handover', 'return');
      } else if (manage) {
        actions.push('return');
      }
      break;
    case InvoiceStatus.Predano:
      if (canFinalize(inv, project, actor)) {
        actions.push('invoiced');
      }
      if (manage) {
        actions.push('resend');
      }
      break;
    case InvoiceStatus.Vyfakturovano:
      if (canFinalize(inv, project, actor)) {
        actions.push('paid');
      }
      if (manage) {
        actions.push('resend');
      }
      break;
    case InvoiceStatus.Uhrazeno:
      if (manage) {
        actions.push('resend');
      }
      break;
    default:
      break;
  }
  if (manage && FINAL_INVOICE_STATUSES.indexOf(inv.status) === -1) {
    actions.push('cancel');
  }
  return actions;
}

/** Podklad čeká na kontrolu právě tímto člověkem? — podklad pro stránku „Čeká na mě". */
export function isWaitingForCheck(inv: InvoiceBasis, project: WorkflowProject, actor: Actor): boolean {
  return inv.status === InvoiceStatus.KeKontrole && canCheckInvoice(project, actor) && !sameLogin(inv.requestedByLogin, actor.login);
}

// --- přechody --------------------------------------------------------------

function requireStatus(inv: InvoiceBasis, allowed: InvoiceStatus[], what: string): void {
  if (allowed.indexOf(inv.status) === -1) {
    throw new WorkflowError(`${what}: podklad ${inv.number} je ve stavu „${inv.status}“, to nejde.`);
  }
}

function requireManage(inv: InvoiceBasis, ctx: InvoiceContext, what: string): void {
  if (!canManageInvoice(inv, ctx.project, ctx.actor)) {
    throw new WorkflowError(
      `${what}: s podkladem ${inv.number} smí nakládat jen jeho vystavitel, projektový manažer projektu, vedení nebo administrátor.`
    );
  }
}

function requireComplete(inv: InvoiceBasis, what: string): void {
  const issues = validateInvoiceDraft(
    {
      projectNumber: inv.projectNumber,
      customerId: inv.customerId,
      customerName: inv.customerName,
      lines: inv.lines,
      vatRate: inv.vatRate,
      currency: inv.currency,
      issueDate: inv.issueDate,
      taxableDate: inv.taxableDate,
      dueDate: inv.dueDate
    },
    true
  );
  if (issues.length > 0) {
    throw new WorkflowError(`${what}: ${issues.slice(0, 3).map((i) => i.message).join(' ')}`);
  }
}

/** Koncept → Ke kontrole. Podklad musí být úplný. */
export function submitInvoice(inv: InvoiceBasis, ctx: InvoiceContext): InvoiceChange {
  requireStatus(inv, [InvoiceStatus.Koncept], 'Předat ke kontrole');
  requireManage(inv, ctx, 'Předat ke kontrole');
  requireComplete(inv, 'Podklad nejde předat ke kontrole');
  return { status: InvoiceStatus.KeKontrole, auditAction: 'Předáno ke kontrole' };
}

/**
 * Předání účtárně — z konceptu (když vystavitel smí kontrolovat sám) nebo po kontrole. Kontrolu dělá PM projektu,
 * vedení nebo administrátor. `sentTo` (adresát e-mailu) a `pdfUrl` (uložené PDF) se zapíšou do historie, resp. k podkladu.
 */
export function handOverInvoice(
  inv: InvoiceBasis,
  ctx: InvoiceContext,
  options?: { sentTo?: string; pdfUrl?: string }
): InvoiceChange {
  requireStatus(inv, [InvoiceStatus.Koncept, InvoiceStatus.KeKontrole], 'Předat účtárně');
  if (!canCheckInvoice(ctx.project, ctx.actor)) {
    throw new WorkflowError(
      `Předat účtárně: podklad smí zkontrolovat a předat jen projektový manažer projektu, vedení nebo administrátor. ` +
        'Podklad vystavený asistentem nejdřív předejte ke kontrole.'
    );
  }
  requireComplete(inv, 'Podklad nejde předat účtárně');
  const sentTo = options && options.sentTo ? options.sentTo.trim() : '';
  return {
    status: InvoiceStatus.Predano,
    handoverDate: ctx.now,
    pdfUrl: options && options.pdfUrl ? options.pdfUrl : undefined,
    auditAction: sentTo ? `Předáno účtárně (${sentTo})` : 'Předáno účtárně'
  };
}

/** Vrácení do konceptu: kontrolor s komentářem (co opravit), vystavitel může podklad stáhnout zpět i bez komentáře. */
export function returnInvoice(inv: InvoiceBasis, comment: string, ctx: InvoiceContext): InvoiceChange {
  requireStatus(inv, [InvoiceStatus.KeKontrole], 'Vrátit do konceptu');
  const isIssuer = sameLogin(inv.requestedByLogin, ctx.actor.login);
  if (!canCheckInvoice(ctx.project, ctx.actor) && !isIssuer) {
    throw new WorkflowError('Vrátit do konceptu smí vystavitel, projektový manažer projektu, vedení nebo administrátor.');
  }
  const text = (comment || '').trim();
  if (!isIssuer && text === '') {
    throw new WorkflowError('Při vrácení napište, co se má opravit.');
  }
  return { status: InvoiceStatus.Koncept, auditAction: text ? `Vráceno do konceptu: ${text}` : 'Staženo zpět do konceptu' };
}

/** Předáno účtárně → Vyfakturováno; doplní se číslo faktury z účetnictví. */
export function markInvoiced(inv: InvoiceBasis, invoiceNo: string, ctx: InvoiceContext): InvoiceChange {
  requireStatus(inv, [InvoiceStatus.Predano], 'Označit jako vyfakturované');
  if (!canFinalize(inv, ctx.project, ctx.actor)) {
    throw new WorkflowError('Číslo faktury smí doplnit vystavitel, projektový manažer, vedení, administrátor nebo finance.');
  }
  const no = (invoiceNo || '').trim();
  if (no === '') {
    throw new WorkflowError('Doplňte číslo faktury z účetnictví.');
  }
  return { status: InvoiceStatus.Vyfakturovano, accountingInvoiceNo: no, auditAction: `Vyfakturováno, faktura ${no}` };
}

/** Vyfakturováno → Uhrazeno; doplní se datum úhrady. */
export function markPaid(inv: InvoiceBasis, paidDate: Date | undefined, ctx: InvoiceContext): InvoiceChange {
  requireStatus(inv, [InvoiceStatus.Vyfakturovano], 'Označit jako uhrazené');
  if (!canFinalize(inv, ctx.project, ctx.actor)) {
    throw new WorkflowError('Úhradu smí zapsat vystavitel, projektový manažer, vedení, administrátor nebo finance.');
  }
  if (!paidDate) {
    throw new WorkflowError('Doplňte datum úhrady.');
  }
  return { status: InvoiceStatus.Uhrazeno, paidDate, auditAction: 'Uhrazeno' };
}

/** Storno — kdykoli před úhradou, vždy s důvodem. Podklady se nemažou, aby řada čísel zůstala bez děr. */
export function cancelInvoice(inv: InvoiceBasis, reason: string, ctx: InvoiceContext): InvoiceChange {
  if (FINAL_INVOICE_STATUSES.indexOf(inv.status) !== -1) {
    throw new WorkflowError(`Stornovat: podklad ${inv.number} je ve stavu „${inv.status}“, to už nejde.`);
  }
  requireManage(inv, ctx, 'Stornovat');
  const text = (reason || '').trim();
  if (text === '') {
    throw new WorkflowError('Při stornu napište důvod.');
  }
  return { status: InvoiceStatus.Storno, cancelReason: text, auditAction: `Stornováno: ${text}` };
}

/** Opakované předání účtárně (e-mail nedorazil / jiná adresa). Stav se nemění, zapíše se do historie. */
export function resendInvoice(
  inv: InvoiceBasis,
  ctx: InvoiceContext,
  options?: { sentTo?: string; pdfUrl?: string }
): InvoiceChange {
  requireStatus(inv, [InvoiceStatus.Predano, InvoiceStatus.Vyfakturovano, InvoiceStatus.Uhrazeno], 'Poslat znovu');
  requireManage(inv, ctx, 'Poslat znovu');
  const sentTo = options && options.sentTo ? options.sentTo.trim() : '';
  return {
    status: inv.status,
    pdfUrl: options && options.pdfUrl ? options.pdfUrl : undefined,
    auditAction: sentTo ? `Posláno účtárně znovu (${sentTo})` : 'Posláno účtárně znovu'
  };
}

/** Podklad po provedení změny stavu. Samotný zápis (SharePoint, paměť) si řeší datová vrstva. */
export function applyInvoiceChange(inv: InvoiceBasis, change: InvoiceChange, now: Date): InvoiceBasis {
  return {
    ...inv,
    status: change.status,
    handoverDate: change.handoverDate ?? inv.handoverDate,
    accountingInvoiceNo: change.accountingInvoiceNo ?? inv.accountingInvoiceNo,
    paidDate: change.paidDate ?? inv.paidDate,
    cancelReason: change.cancelReason ?? inv.cancelReason,
    pdfUrl: change.pdfUrl ?? inv.pdfUrl,
    modified: now
  };
}
