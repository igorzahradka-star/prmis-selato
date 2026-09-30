/**
 * Schvalovací workflow objednávek — čistá logika bez SharePointu a Reactu.
 *
 * Tohle je jediné místo, kde se rozhoduje, kdo smí objednávku vystavit, odeslat ke schválení,
 * schválit, vrátit, zamítnout, odeslat dodavateli, uzavřít a stornovat. Datová vrstva si
 * z tohoto modulu vezme výsledek a zapíše ho; nezávislé rozhodování nemá. A protože kontrola
 * probíhá znovu těsně před zápisem (viz CLAUDE.md, kap. 4), nestačí skrytí tlačítka v obrazovce.
 *
 * Pravidla (zadání kap. 8.5 a rozhodnutí zadavatele z 30. 9. 2026):
 *  - do limitu PM schvaluje PM projektu, nad ním navíc vedení, nad limitem vedení navíc jednatel;
 *  - nad limit jednatele se objednávka schvaluje mimo aplikaci;
 *  - vlastní objednávku nesmí schválit nikdo, nikdy;
 *  - objednávku, kterou vystavil PM, schvaluje vedení (přepínač v Nastavení dovolí PM schválit si ji sám);
 *  - u Režie schvaluje vždy vedení.
 */

import { ApprovalSettings } from './settings';
import { approvalTierIndex } from './approval';
import { hasAnyRole, normalizeLogin, canEditProject } from './roles';
import { Role } from './types';
import { formatMoney } from './format';
import {
  ApprovalLevel,
  ApprovalStep,
  APPROVAL_LEVEL_LABELS,
  FINAL_ORDER_STATUSES,
  OrderStatus,
  PurchaseOrder,
  amountNetInCzk,
  validateOrderDraft
} from './orders';

/** Kdo akci provádí. */
export interface Actor {
  login: string;
  displayName: string;
  roles: Role[];
}

/** Co o projektu workflow potřebuje vědět. */
export interface WorkflowProject {
  projectNumber: string;
  projectManagerLogin?: string;
  assistantLogins?: string[];
  isOverhead: boolean;
}

export interface WorkflowContext {
  project: WorkflowProject;
  settings: ApprovalSettings;
  actor: Actor;
  now: Date;
}

export type OrderAction = 'edit' | 'submit' | 'approve' | 'return' | 'reject' | 'send' | 'deliver' | 'close' | 'cancel';

export type ApprovalDecision = 'Schváleno' | 'Vráceno k úpravě' | 'Zamítnuto';

/** Co se má při změně stavu zapsat. */
export interface OrderChange {
  status: OrderStatus;
  approvalChain: ApprovalStep[];
  currentApprovalLevel?: ApprovalLevel;
  sentDate?: Date;
  cancelReason?: string;
  /** Věta do auditního logu. */
  auditAction: string;
  /** Záznam do historie schvalování (PRM_Approvals); jen u rozhodnutí. */
  approval?: { stepNo: number; decision: ApprovalDecision; comment?: string };
}

/** Chyba pravidla workflow — zpráva je česky a rovnou se ukáže člověku. */
export class WorkflowError extends Error {
  public constructor(message: string) {
    super(message);
    // Překlad do starší verze JavaScriptu jinak zahodí dědičnost a `instanceof WorkflowError` by nefungoval.
    Object.setPrototypeOf(this, WorkflowError.prototype);
    this.name = 'WorkflowError';
  }
}

// --- kdo smí co ----------------------------------------------------------

function sameLogin(a: string | undefined, b: string | undefined): boolean {
  const x = normalizeLogin(a);
  return x !== '' && x === normalizeLogin(b);
}

/**
 * Smí uživatel na projektu vystavit objednávku?
 * Běžný projekt: kdo ho smí upravovat (PM, asistent, vedení, administrátor).
 * Režie: kdo ji uvidí — přístup k ní se přiděluje lidem jednotlivě a hlídá ho SharePoint, takže
 * sem stačí kontrola, že jde o roli, která objednává.
 */
export function canIssueOrder(project: WorkflowProject, actor: Actor): boolean {
  if (project.isOverhead) {
    return hasAnyRole(actor.roles, Role.Administrator, Role.Vedeni, Role.ProjektovyManazer, Role.AsistentPM);
  }
  return canEditProject(actor.roles, actor.login, {
    projectManagerLogin: project.projectManagerLogin,
    assistantLogins: project.assistantLogins
  });
}

/** Kdo smí s objednávkou nakládat: vystavitel, PM projektu, vedení a administrátor. */
export function canManageOrder(order: PurchaseOrder, project: WorkflowProject, actor: Actor): boolean {
  return (
    sameLogin(order.requestedByLogin, actor.login) ||
    sameLogin(project.projectManagerLogin, actor.login) ||
    hasAnyRole(actor.roles, Role.Administrator, Role.Vedeni)
  );
}

/**
 * Smí uživatel schválit daný krok? Vždy platí, že nikdo neschvaluje vlastní objednávku —
 * ani když by mu to role jinak dovolila.
 */
export function mayApproveLevel(level: ApprovalLevel, order: PurchaseOrder, project: WorkflowProject, actor: Actor): boolean {
  if (sameLogin(order.requestedByLogin, actor.login)) {
    return false;
  }
  switch (level) {
    case 'pm':
      return sameLogin(project.projectManagerLogin, actor.login);
    case 'vedeni':
      return hasAnyRole(actor.roles, Role.Vedeni);
    case 'jednatel':
      return hasAnyRole(actor.roles, Role.Jednatel);
  }
}

/** První nevyřízený krok řetězce (index), nebo -1. */
export function currentStepIndex(chain: ApprovalStep[]): number {
  for (let i = 0; i < chain.length; i++) {
    if (!chain[i].approved) {
      return i;
    }
  }
  return -1;
}

/** Čeká objednávka na schválení právě tímto člověkem? — podklad pro stránku „Čeká na mě". */
export function isWaitingFor(order: PurchaseOrder, project: WorkflowProject, actor: Actor): boolean {
  if (order.status !== OrderStatus.KeSchvaleni) {
    return false;
  }
  const i = currentStepIndex(order.approvalChain);
  return i !== -1 && mayApproveLevel(order.approvalChain[i].level, order, project, actor);
}

/** Jde objednávku upravovat? Jen koncept nebo vrácenou a jen těm, kdo s ní smějí nakládat. */
export function canEditOrder(order: PurchaseOrder, project: WorkflowProject, actor: Actor): boolean {
  return (
    (order.status === OrderStatus.Koncept || order.status === OrderStatus.VracenoKUprave) &&
    canManageOrder(order, project, actor)
  );
}

/** Akce, které má uživatel u objednávky nabídnout (tlačítka). Rozhodnutí se znovu ověřuje při zápisu. */
export function availableActions(order: PurchaseOrder, project: WorkflowProject, actor: Actor): OrderAction[] {
  const actions: OrderAction[] = [];
  const manage = canManageOrder(order, project, actor);

  if (canEditOrder(order, project, actor)) {
    actions.push('edit', 'submit');
  }
  if (isWaitingFor(order, project, actor)) {
    actions.push('approve', 'return', 'reject');
  }
  if (manage && order.status === OrderStatus.Schvaleno) {
    actions.push('send');
  }
  if (manage && order.status === OrderStatus.Odeslano) {
    actions.push('deliver');
  }
  if (manage && order.status === OrderStatus.Dodano) {
    actions.push('close');
  }
  if (manage && FINAL_ORDER_STATUSES.indexOf(order.status) === -1) {
    actions.push('cancel');
  }
  return actions;
}

// --- schvalovací řetěz -----------------------------------------------------

export interface ChainInput {
  amountNetCzk: number;
  issuerLogin: string;
  projectManagerLogin?: string;
  isOverhead: boolean;
  settings: ApprovalSettings;
}

/**
 * Sestaví řetěz schválení podle částky, vystavitele a projektu.
 * Kroky jdou v pořadí PM → vedení → jednatel; kroky, které by schvalovala sama osoba
 * vystavitele, se buď vyřídí automaticky (PM si smí schválit sám), nebo vypadnou.
 */
export function buildApprovalChain(input: ChainInput): { steps: ApprovalStep[]; outsideApp: boolean } {
  const { settings } = input;
  const tier = approvalTierIndex(input.amountNetCzk, settings);
  if (tier === 3) {
    return { steps: [], outsideApp: true };
  }

  let levels: ApprovalLevel[] = tier === 0 ? ['pm'] : tier === 1 ? ['pm', 'vedeni'] : ['pm', 'vedeni', 'jednatel'];

  // Režie: PM ji neschvaluje, vždy rozhoduje vedení.
  if (input.isOverhead && settings.overheadRequiresVedeni) {
    levels = levels.filter((l) => l !== 'pm');
    if (levels.indexOf('vedeni') === -1) {
      levels.unshift('vedeni');
    }
  }

  const issuerIsPm = sameLogin(input.issuerLogin, input.projectManagerLogin);
  const steps: ApprovalStep[] = [];

  levels.forEach((level) => {
    if (level === 'pm' && issuerIsPm) {
      if (settings.pmSelfApprovalEnabled) {
        steps.push({ level: 'pm', approved: true, auto: true });
      }
      // Vypnuté samoschvalování: krok PM vypadne, o objednávce PM rozhoduje vedení.
      return;
    }
    steps.push({ level, approved: false });
  });

  // PM vystavil sám a samoschvalování je vypnuté: jeho krok vypadl a nic nezbylo, rozhoduje vedení.
  if (steps.length === 0) {
    steps.push({ level: 'vedeni', approved: false });
  }
  return { steps, outsideApp: false };
}

// --- přechody --------------------------------------------------------------

function requireStatus(order: PurchaseOrder, allowed: OrderStatus[], what: string): void {
  if (allowed.indexOf(order.status) === -1) {
    throw new WorkflowError(`${what}: objednávka ${order.orderNumber} je ve stavu „${order.status}“, to nejde.`);
  }
}

function requireManage(order: PurchaseOrder, ctx: WorkflowContext, what: string): void {
  if (!canManageOrder(order, ctx.project, ctx.actor)) {
    throw new WorkflowError(
      `${what}: objednávku ${order.orderNumber} smí spravovat jen její vystavitel, projektový manažer projektu, vedení nebo administrátor.`
    );
  }
}

/** Po posledním schválení: stav Schváleno, jinak Ke schválení a kdo je na řadě. */
function afterChain(chain: ApprovalStep[]): { status: OrderStatus; level?: ApprovalLevel } {
  const i = currentStepIndex(chain);
  return i === -1 ? { status: OrderStatus.Schvaleno } : { status: OrderStatus.KeSchvaleni, level: chain[i].level };
}

/** Odeslání objednávky ke schválení. Stačí-li automatické schválení, rovnou skončí jako Schváleno. */
export function submitOrder(order: PurchaseOrder, ctx: WorkflowContext): OrderChange {
  requireStatus(order, [OrderStatus.Koncept, OrderStatus.VracenoKUprave], 'Odeslat ke schválení');
  requireManage(order, ctx, 'Odeslat ke schválení');
  if (!canIssueOrder(ctx.project, ctx.actor) && !sameLogin(order.requestedByLogin, ctx.actor.login)) {
    throw new WorkflowError('Odeslat ke schválení: na tento projekt nemáte oprávnění objednávky vystavovat.');
  }

  const issues = validateOrderDraft(
    {
      projectNumber: order.projectNumber,
      supplierId: order.supplierId,
      supplierName: order.supplierName,
      subject: order.subject,
      lines: order.lines,
      vatRate: order.vatRate,
      currency: order.currency,
      deliveryDate: order.deliveryDate,
      paymentTermDays: order.paymentTermDays
    },
    true
  );
  if (issues.length > 0) {
    throw new WorkflowError(`Objednávku nejde odeslat ke schválení: ${issues.slice(0, 3).map((i) => i.message).join(' ')}`);
  }

  const amountCzk = amountNetInCzk(order.amountNet, order.currency, ctx.settings.eurRateForLimits);
  const { steps, outsideApp } = buildApprovalChain({
    amountNetCzk: amountCzk,
    issuerLogin: order.requestedByLogin,
    projectManagerLogin: ctx.project.projectManagerLogin,
    isOverhead: ctx.project.isOverhead,
    settings: ctx.settings
  });
  if (outsideApp) {
    throw new WorkflowError(
      `Objednávka má ${formatMoney(amountCzk)} bez DPH a překračuje limit jednatele ${formatMoney(ctx.settings.jednatelLimit)}. ` +
        'Takové objednávky se schvalují mimo aplikaci — obraťte se na vedení.'
    );
  }

  const next = afterChain(steps);
  return {
    status: next.status,
    approvalChain: steps,
    currentApprovalLevel: next.level,
    auditAction:
      next.status === OrderStatus.Schvaleno
        ? 'Odesláno ke schválení — schváleno automaticky (vlastní objednávka v limitu PM)'
        : `Odesláno ke schválení (${APPROVAL_LEVEL_LABELS[next.level as ApprovalLevel]})`
  };
}

/** Rozhodnutí schvalovatele: schválit, vrátit k úpravě, zamítnout. */
export function decideOrder(
  order: PurchaseOrder,
  decision: 'approve' | 'return' | 'reject',
  comment: string,
  ctx: WorkflowContext
): OrderChange {
  requireStatus(order, [OrderStatus.KeSchvaleni], 'Rozhodnout o objednávce');

  const index = currentStepIndex(order.approvalChain);
  if (index === -1) {
    throw new WorkflowError(`Objednávka ${order.orderNumber} nemá žádný nevyřízený krok schvalování.`);
  }
  const step = order.approvalChain[index];
  if (sameLogin(order.requestedByLogin, ctx.actor.login)) {
    throw new WorkflowError('Vlastní objednávku nesmíte schválit, vrátit ani zamítnout. Musí to udělat někdo jiný.');
  }
  if (!mayApproveLevel(step.level, order, ctx.project, ctx.actor)) {
    throw new WorkflowError(
      `Teď schvaluje ${APPROVAL_LEVEL_LABELS[step.level]}. Vy k tomu kroku oprávnění nemáte.`
    );
  }
  const text = (comment || '').trim();
  if (decision !== 'approve' && text === '') {
    throw new WorkflowError(
      decision === 'return'
        ? 'Při vrácení k úpravě napište, co se má změnit.'
        : 'Při zamítnutí napište důvod.'
    );
  }

  if (decision === 'approve') {
    const chain = order.approvalChain.map((s, i) =>
      i === index
        ? { ...s, approved: true, byName: ctx.actor.displayName, byLogin: ctx.actor.login, at: ctx.now }
        : s
    );
    const next = afterChain(chain);
    return {
      status: next.status,
      approvalChain: chain,
      currentApprovalLevel: next.level,
      auditAction:
        next.status === OrderStatus.Schvaleno
          ? `Schváleno (${APPROVAL_LEVEL_LABELS[step.level]}) — schvalování dokončeno`
          : `Schváleno (${APPROVAL_LEVEL_LABELS[step.level]}) — dále ${APPROVAL_LEVEL_LABELS[next.level as ApprovalLevel]}`,
      approval: { stepNo: index + 1, decision: 'Schváleno', comment: text || undefined }
    };
  }

  if (decision === 'return') {
    return {
      status: OrderStatus.VracenoKUprave,
      // Po úpravě se schvaluje znovu od začátku — schválení platí pro konkrétní znění objednávky.
      approvalChain: [],
      auditAction: `Vráceno k úpravě (${APPROVAL_LEVEL_LABELS[step.level]})`,
      approval: { stepNo: index + 1, decision: 'Vráceno k úpravě', comment: text }
    };
  }

  return {
    status: OrderStatus.Zamitnuto,
    approvalChain: order.approvalChain,
    auditAction: `Zamítnuto (${APPROVAL_LEVEL_LABELS[step.level]})`,
    approval: { stepNo: index + 1, decision: 'Zamítnuto', comment: text }
  };
}

/** Odeslání schválené objednávky dodavateli. */
export function sendOrder(order: PurchaseOrder, ctx: WorkflowContext): OrderChange {
  requireStatus(order, [OrderStatus.Schvaleno], 'Odeslat dodavateli');
  requireManage(order, ctx, 'Odeslat dodavateli');
  return {
    status: OrderStatus.Odeslano,
    approvalChain: order.approvalChain,
    sentDate: ctx.now,
    auditAction: 'Odesláno dodavateli'
  };
}

/** Označení objednávky jako dodané. */
export function deliverOrder(order: PurchaseOrder, ctx: WorkflowContext): OrderChange {
  requireStatus(order, [OrderStatus.Odeslano], 'Označit jako dodané');
  requireManage(order, ctx, 'Označit jako dodané');
  return { status: OrderStatus.Dodano, approvalChain: order.approvalChain, sentDate: order.sentDate, auditAction: 'Označeno jako dodané' };
}

/** Uzavření dodané objednávky. */
export function closeOrder(order: PurchaseOrder, ctx: WorkflowContext): OrderChange {
  requireStatus(order, [OrderStatus.Dodano], 'Uzavřít objednávku');
  requireManage(order, ctx, 'Uzavřít objednávku');
  return { status: OrderStatus.Uzavreno, approvalChain: order.approvalChain, sentDate: order.sentDate, auditAction: 'Uzavřeno' };
}

/** Storno — kdykoli před uzavřením, vždy s důvodem. Objednávky se nemažou, aby řada čísel zůstala bez děr. */
export function cancelOrder(order: PurchaseOrder, reason: string, ctx: WorkflowContext): OrderChange {
  if (FINAL_ORDER_STATUSES.indexOf(order.status) !== -1) {
    throw new WorkflowError(`Stornovat: objednávka ${order.orderNumber} je ve stavu „${order.status}“, to už nejde.`);
  }
  requireManage(order, ctx, 'Stornovat');
  const text = (reason || '').trim();
  if (text === '') {
    throw new WorkflowError('Při stornu napište důvod.');
  }
  return {
    status: OrderStatus.Storno,
    approvalChain: order.approvalChain,
    cancelReason: text,
    sentDate: order.sentDate,
    auditAction: `Stornováno: ${text}`
  };
}

// --- pomocné převody -------------------------------------------------------

/** Přihlášený uživatel jako účastník workflow. */
export function toActor(user: { loginName: string; displayName: string; roles: Role[] }): Actor {
  return { login: user.loginName, displayName: user.displayName, roles: user.roles };
}

/** Projekt jako podklad pro workflow. */
export function toWorkflowProject(project: {
  projectNumber: string;
  projectManagerLogin?: string;
  assistantLogins?: string[];
  isOverhead: boolean;
}): WorkflowProject {
  return {
    projectNumber: project.projectNumber,
    projectManagerLogin: project.projectManagerLogin,
    assistantLogins: project.assistantLogins,
    isOverhead: project.isOverhead
  };
}

/** Objednávka po provedení změny stavu. Samotný zápis (SharePoint, paměť) si řeší datová vrstva. */
export function applyOrderChange(order: PurchaseOrder, change: OrderChange, now: Date): PurchaseOrder {
  return {
    ...order,
    status: change.status,
    approvalChain: change.approvalChain,
    currentApprovalLevel: change.currentApprovalLevel,
    sentDate: change.sentDate ?? order.sentDate,
    cancelReason: change.cancelReason ?? order.cancelReason,
    modified: now
  };
}

/** Kdo objednávku schvaluje, jako věta: „Projektový manažer → Vedení". Automaticky vyřízený krok se označí. */
export function describeApprovalRoute(steps: ApprovalStep[]): string {
  if (steps.length === 0) {
    return 'bez schvalování';
  }
  return steps
    .map((s) => APPROVAL_LEVEL_LABELS[s.level] + (s.auto ? ' (automaticky)' : ''))
    .join(' → ');
}
