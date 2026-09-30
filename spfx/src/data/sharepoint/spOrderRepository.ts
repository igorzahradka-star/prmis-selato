/**
 * Objednávky v seznamu PRM_PurchaseOrders.
 *
 * Pravidla (kdo smí co, schvalovací řetěz) jsou v `core/orderWorkflow`; tenhle soubor jen načte
 * objednávku, nechá workflow rozhodnout a výsledek zapíše — a to **znovu s kontrolou oprávnění**
 * těsně před zápisem (CLAUDE.md, kap. 4). Zápis stavu drží ETag načtené verze: když mezitím
 * objednávku změnil někdo jiný (třeba druhý schvalovatel), SharePoint vrátí HTTP 412 a nic se nezapíše.
 *
 * Pořadí zápisu u změny stavu: nejdřív objednávka, potom záznam o rozhodnutí (PRM_Approvals)
 * a auditní záznam. Kdyby objednávku nešlo uložit (konflikt), nezůstane po ní žádná stopa o změně, která
 * se nestala.
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { CurrentUser, Project } from '../../core/types';
import { toDate } from '../../core/format';
import { isOverheadNumber } from '../../core/overhead';
import {
  ApprovalLevel,
  OrderStatus,
  PurchaseOrder,
  chainFromJson,
  chainToJson,
  filterOrders,
  linesFromJson,
  linesToJson,
  orderTotals,
  sortOrdersNewestFirst,
  validateOrderDraft
} from '../../core/orders';
import {
  OrderChange,
  WorkflowContext,
  WorkflowError,
  applyOrderChange,
  canEditOrder,
  canIssueOrder,
  cancelOrder,
  closeOrder,
  decideOrder,
  deliverOrder,
  sendOrder,
  submitOrder,
  toActor,
  toWorkflowProject
} from '../../core/orderWorkflow';
import {
  ApprovalRecord,
  INumberingRepository,
  IOrderRepository,
  IProjectRepository,
  ISettingsRepository,
  OrderFilter,
  OrderInput
} from '../repositories';
import { getSp, describeSpError, extractStatus } from './spContext';
import { extractEtag } from './spProjectRepository';

const ORDERS_LIST = 'PRM_PurchaseOrders';
const APPROVALS_LIST = 'PRM_Approvals';
const AUDIT_LIST = 'PRM_AuditLog';

const SELECT_FIELDS = [
  'Id',
  'Title',
  'PONumber',
  'Project/Id',
  'Project/ProjectNumber',
  'Supplier/Id',
  'Supplier/Title',
  'Subject',
  'Lines',
  'AmountNet',
  'VATRate',
  'Currency',
  'DeliveryDate',
  'PaymentTermDays',
  'POStatus',
  'RequestedBy/Title',
  'RequestedBy/Name',
  'ApprovalLevel',
  'ApprovalChain',
  'CancelReason',
  'SentDate',
  'Note',
  'Created',
  'Modified'
];
const EXPAND_FIELDS = ['Project', 'Supplier', 'RequestedBy'];

interface OrderItem {
  Id: number;
  PONumber?: string;
  Title?: string;
  Project?: { Id: number; ProjectNumber: string };
  Supplier?: { Id: number; Title: string };
  Subject?: string;
  Lines?: string;
  AmountNet?: number;
  VATRate?: number;
  Currency?: string;
  DeliveryDate?: string;
  PaymentTermDays?: number;
  POStatus?: string;
  RequestedBy?: { Title: string; Name: string };
  ApprovalLevel?: string;
  ApprovalChain?: string;
  CancelReason?: string;
  SentDate?: string;
  Note?: string;
  Created?: string;
  Modified?: string;
}

const MISSING_COLUMNS_HINT =
  'Seznam objednávek na webu nemá všechny sloupce, které aplikace potřebuje. ' +
  'Otevřete Instalace a diagnostika a doplňte chybějící části (přidá jen sloupce, nic nesmaže).';

export class SpOrderRepository implements IOrderRepository {
  public constructor(
    private readonly context: WebPartContext,
    private readonly numbering: INumberingRepository,
    private readonly projects: IProjectRepository,
    private readonly settings: ISettingsRepository
  ) {}

  public async list(filter?: OrderFilter): Promise<PurchaseOrder[]> {
    try {
      const sp = getSp(this.context);
      const items: OrderItem[] = await sp.web.lists
        .getByTitle(ORDERS_LIST)
        .items.select(...SELECT_FIELDS)
        .expand(...EXPAND_FIELDS)
        .orderBy('Id', false)
        .top(2000)();
      // Filtr se dělá v prohlížeči — objednávek jsou stovky a filtr přes hodnoty vyhledávacích sloupců
      // dělá SharePoint jen s indexem a se stránkováním.
      return sortOrdersNewestFirst(filterOrders(items.map(mapOrder), filter));
    } catch (error) {
      throw new Error(explain(error, 'Nepodařilo se načíst objednávky'));
    }
  }

  public async getById(id: number): Promise<PurchaseOrder | undefined> {
    try {
      return (await this.load(id)).order;
    } catch (error) {
      if (extractStatus(error) === 404) {
        return undefined;
      }
      throw new Error(explain(error, `Nepodařilo se načíst objednávku č. ${id}`));
    }
  }

  public async create(input: OrderInput, actor: CurrentUser): Promise<PurchaseOrder> {
    const project = await this.requireProject(input.projectNumber);
    if (!canIssueOrder(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Na tento projekt nemáte oprávnění objednávky vystavovat.');
    }
    assertValid(input);

    // Číslo se přiděluje až po kontrole: nezdařené uložení by jinak spotřebovalo číslo a v řadě by byla díra.
    const orderNumber = await this.numbering.allocateNumber('OBJ');
    let newId: number | undefined;
    try {
      const sp = getSp(this.context);
      const added = await sp.web.lists.getByTitle(ORDERS_LIST).items.add({
        Title: orderNumber,
        PONumber: orderNumber,
        ProjectId: project.id,
        ...toFields(input),
        POStatus: OrderStatus.Koncept,
        RequestedById: actor.id,
        ApprovalChain: '[]'
      });
      newId = extractAddedId(added);
    } catch (error) {
      throw new Error(explain(error, `Objednávku ${orderNumber} se nepodařilo uložit`));
    }
    if (newId === undefined) {
      throw new Error(`Objednávka ${orderNumber} se uložila, ale SharePoint nevrátil její číslo položky. Načtěte seznam znovu.`);
    }
    await this.writeAudit(newId, orderNumber, actor, 'Založena objednávka', undefined, OrderStatus.Koncept);
    return (await this.requireOrder(newId)).order;
  }

  public async update(id: number, input: OrderInput, actor: CurrentUser): Promise<PurchaseOrder> {
    const { order, etag } = await this.requireOrder(id);
    const project = await this.requireProject(order.projectNumber);
    if (!canEditOrder(order, toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError(
        `Objednávku ${order.orderNumber} teď nejde upravovat (stav „${order.status}“, nebo k ní nemáte oprávnění).`
      );
    }
    if (input.projectNumber !== order.projectNumber) {
      throw new WorkflowError('Projekt na vystavené objednávce se nemění. Stornujte ji a vystavte novou.');
    }
    assertValid(input);

    await this.write(id, toFields(input), etag, `Nepodařilo se uložit objednávku ${order.orderNumber}`);
    await this.writeAudit(id, order.orderNumber, actor, 'Upraveno', order.status, order.status);
    return (await this.requireOrder(id)).order;
  }

  public submit(id: number, actor: CurrentUser): Promise<PurchaseOrder> {
    return this.transition(id, actor, (o, c) => submitOrder(o, c));
  }

  public decide(
    id: number,
    decision: 'approve' | 'return' | 'reject',
    comment: string,
    actor: CurrentUser
  ): Promise<PurchaseOrder> {
    return this.transition(id, actor, (o, c) => decideOrder(o, decision, comment, c));
  }

  public send(id: number, actor: CurrentUser): Promise<PurchaseOrder> {
    return this.transition(id, actor, (o, c) => sendOrder(o, c));
  }

  public deliver(id: number, actor: CurrentUser): Promise<PurchaseOrder> {
    return this.transition(id, actor, (o, c) => deliverOrder(o, c));
  }

  public close(id: number, actor: CurrentUser): Promise<PurchaseOrder> {
    return this.transition(id, actor, (o, c) => closeOrder(o, c));
  }

  public cancel(id: number, reason: string, actor: CurrentUser): Promise<PurchaseOrder> {
    return this.transition(id, actor, (o, c) => cancelOrder(o, reason, c));
  }

  public async listApprovals(id: number): Promise<ApprovalRecord[]> {
    try {
      const sp = getSp(this.context);
      const items: {
        StepNo?: number;
        Approver?: { Title: string };
        Decision?: string;
        Comment?: string;
        DecidedAt?: string;
      }[] = await sp.web.lists
        .getByTitle(APPROVALS_LIST)
        .items.select('StepNo', 'Approver/Title', 'Decision', 'Comment', 'DecidedAt')
        .expand('Approver')
        .filter(`EntityType eq 'Objednávka' and EntityId eq ${id}`)
        .orderBy('Id', true)
        .top(200)();
      return items.map((i) => ({
        stepNo: i.StepNo ?? 0,
        approverName: i.Approver?.Title ?? '—',
        decision: i.Decision ?? '',
        comment: i.Comment || undefined,
        decidedAt: toDate(i.DecidedAt)
      }));
    } catch (error) {
      throw new Error(explain(error, 'Nepodařilo se načíst historii schvalování'));
    }
  }

  // --- vnitřní ---

  /** Načte objednávku i s ETagem (otiskem verze) — podle něj se pak hlídá souběžná změna. */
  private async load(id: number): Promise<{ order: PurchaseOrder; etag?: string }> {
    const sp = getSp(this.context);
    const item: OrderItem = await sp.web.lists
      .getByTitle(ORDERS_LIST)
      .items.getById(id)
      .select(...SELECT_FIELDS)
      .expand(...EXPAND_FIELDS)();
    return { order: mapOrder(item), etag: extractEtag(item) };
  }

  private async requireOrder(id: number): Promise<{ order: PurchaseOrder; etag?: string }> {
    try {
      return await this.load(id);
    } catch (error) {
      if (extractStatus(error) === 404) {
        throw new WorkflowError('Objednávka nebyla nalezena. Nejspíš ji někdo smazal, nebo k ní nemáte oprávnění.');
      }
      throw new Error(explain(error, `Nepodařilo se načíst objednávku č. ${id}`));
    }
  }

  private async requireProject(projectNumber: string): Promise<Project> {
    const project = await this.projects.getByNumber(projectNumber);
    if (!project) {
      throw new WorkflowError(`Projekt ${projectNumber} nebyl nalezen, nebo na něj nemáte oprávnění.`);
    }
    return project;
  }

  /** Zápis polí s kontrolou verze; konflikt se nezkouší znovu — šlo by o přepsání cizí změny. */
  private async write(id: number, fields: Record<string, unknown>, etag: string | undefined, context: string): Promise<void> {
    try {
      const sp = getSp(this.context);
      await sp.web.lists.getByTitle(ORDERS_LIST).items.getById(id).update(fields, etag ?? '*');
    } catch (error) {
      if (extractStatus(error) === 412) {
        throw new WorkflowError(
          'Objednávku mezitím někdo jiný změnil. Načtěte ji znovu a akci zopakujte — jinak byste přepsali cizí změnu.'
        );
      }
      throw new Error(explain(error, context));
    }
  }

  /** Společný postup všech změn stavu: načíst, nechat rozhodnout workflow, zapsat. */
  private async transition(
    id: number,
    actor: CurrentUser,
    decide: (order: PurchaseOrder, ctx: WorkflowContext) => OrderChange
  ): Promise<PurchaseOrder> {
    const { order, etag } = await this.requireOrder(id);
    const project = await this.requireProject(order.projectNumber);
    const approvals = (await this.settings.get()).approvals;
    const now = new Date();

    // Rozhodnutí a kontrola oprávnění — stejný kód, který používá obrazovka, ale zde je poslední pojistka.
    const change = decide(order, { project: toWorkflowProject(project), settings: approvals, actor: toActor(actor), now });
    const after = applyOrderChange(order, change, now);

    const fields: Record<string, unknown> = {
      POStatus: after.status,
      ApprovalChain: chainToJson(after.approvalChain),
      ApprovalLevel: after.currentApprovalLevel ?? null
    };
    if (change.sentDate) {
      fields.SentDate = change.sentDate.toISOString();
    }
    if (change.cancelReason) {
      fields.CancelReason = change.cancelReason;
    }
    await this.write(id, fields, etag, `Nepodařilo se změnit stav objednávky ${order.orderNumber}`);

    try {
      if (change.approval) {
        const sp = getSp(this.context);
        await sp.web.lists.getByTitle(APPROVALS_LIST).items.add({
          Title: `${order.orderNumber} — krok ${change.approval.stepNo}`,
          EntityType: 'Objednávka',
          EntityId: id,
          StepNo: change.approval.stepNo,
          ApproverId: actor.id,
          Decision: change.approval.decision,
          Comment: change.approval.comment ?? '',
          DecidedAt: now.toISOString()
        });
      }
      await this.writeAudit(id, order.orderNumber, actor, change.auditAction, order.status, after.status);
    } catch (error) {
      throw new Error(
        `Změna objednávky ${order.orderNumber} se provedla, ale nepodařilo se zapsat záznam o ní (historie schvalování nebo audit). ` +
          `Dejte to vědět správci. (${error instanceof Error ? error.message : String(error)})`
      );
    }
    return (await this.requireOrder(id)).order;
  }

  private async writeAudit(
    id: number,
    orderNumber: string,
    actor: CurrentUser,
    action: string,
    oldStatus: string | undefined,
    newStatus: string
  ): Promise<void> {
    try {
      const sp = getSp(this.context);
      await sp.web.lists.getByTitle(AUDIT_LIST).items.add({
        Title: `Objednávka ${orderNumber}`,
        EntityType: 'Objednávka',
        EntityId: orderNumber,
        Action: action.length > 250 ? `${action.slice(0, 247)}…` : action,
        PerformedById: actor.id,
        PerformedAt: new Date().toISOString(),
        OldValue: oldStatus ?? '',
        NewValue: newStatus
      });
    } catch (error) {
      throw new Error(describeSpError(error, `Nepodařilo se zapsat audit objednávky ${orderNumber} (položka ${id})`));
    }
  }
}

function assertValid(input: OrderInput): void {
  const issues = validateOrderDraft(input, false);
  if (issues.length > 0) {
    throw new WorkflowError(issues.map((i) => i.message).join(' '));
  }
}

/**
 * Pole objednávky z formuláře. Dodavatel se ukládá odkazem na partnera (`SupplierId`) —
 * dodavatel zadaný jen názvem by se v seznamu ztratil, proto ho formulář nabízí výběrem z partnerů.
 */
function toFields(input: OrderInput): Record<string, unknown> {
  return {
    SupplierId: input.supplierId ?? null,
    Subject: input.subject.trim(),
    Lines: linesToJson(input.lines),
    AmountNet: orderTotals(input.lines, input.vatRate).net,
    VATRate: input.vatRate,
    Currency: input.currency,
    DeliveryDate: input.deliveryDate ? input.deliveryDate.toISOString() : null,
    PaymentTermDays: input.paymentTermDays ?? null,
    Note: input.note ?? ''
  };
}

function mapOrder(item: OrderItem): PurchaseOrder {
  const level = item.ApprovalLevel;
  const projectNumber = item.Project?.ProjectNumber ?? '';
  return {
    id: item.Id,
    orderNumber: item.PONumber || item.Title || `#${item.Id}`,
    projectNumber,
    isOverheadProject: isOverheadNumber(projectNumber),
    supplierId: item.Supplier?.Id,
    supplierName: item.Supplier?.Title,
    subject: item.Subject ?? '',
    lines: linesFromJson(item.Lines),
    amountNet: item.AmountNet ?? 0,
    vatRate: item.VATRate ?? 21,
    currency: item.Currency ?? 'CZK',
    deliveryDate: toDate(item.DeliveryDate),
    paymentTermDays: item.PaymentTermDays,
    status: (item.POStatus as OrderStatus) ?? OrderStatus.Koncept,
    requestedByName: item.RequestedBy?.Title ?? '',
    requestedByLogin: item.RequestedBy?.Name ?? '',
    currentApprovalLevel: level === 'pm' || level === 'vedeni' || level === 'jednatel' ? (level as ApprovalLevel) : undefined,
    approvalChain: chainFromJson(item.ApprovalChain),
    note: item.Note || undefined,
    cancelReason: item.CancelReason || undefined,
    sentDate: toDate(item.SentDate),
    created: toDate(item.Created),
    modified: toDate(item.Modified)
  };
}

function extractAddedId(added: unknown): number | undefined {
  const a = added as { data?: { Id?: number }; Id?: number };
  return a?.data?.Id ?? a?.Id;
}

/** Chybu SharePointu převede na větu; HTTP 400 na tomhle seznamu znamená chybějící sloupce. */
function explain(error: unknown, context: string): string {
  if (extractStatus(error) === 400) {
    return `${context}. ${MISSING_COLUMNS_HINT}`;
  }
  return describeSpError(error, context);
}
