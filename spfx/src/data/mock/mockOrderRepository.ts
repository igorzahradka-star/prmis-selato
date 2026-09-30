/**
 * Objednávky v ukázkovém režimu — v paměti, bez SharePointu.
 *
 * Používá **stejné workflow** (`core/orderWorkflow`) jako ostrá implementace, takže ukázkový režim
 * ukazuje skutečná pravidla schvalování, ne jejich zjednodušenou verzi.
 */

import { CurrentUser, Project } from '../../core/types';
import { ApprovalLevel, OrderAttachment, validateAttachment } from '../../core/orders';
import { ApprovalSettings, fallbackRatesOf } from '../../core/settings';
import { effectiveRates } from '../../core/currency';
import {
  ApprovalRecord,
  INumberingRepository,
  IOrderRepository,
  IPartnerRepository,
  IProjectRepository,
  IRatesRepository,
  ISettingsRepository,
  OrderFilter,
  OrderInput
} from '../repositories';
import {
  OrderStatus,
  PurchaseOrder,
  filterOrders,
  orderTotals,
  sortOrdersNewestFirst,
  validateOrderDraft
} from '../../core/orders';
import {
  Assignee,
  OrderChange,
  WorkflowContext,
  WorkflowError,
  applyOrderChange,
  canAddAttachment,
  canEditOrder,
  canIssueOrder,
  canRemoveAttachment,
  cancelOrder,
  closeOrder,
  decideOrder,
  deliverOrder,
  reassignApprover,
  sendOrder,
  submitOrder,
  toActor,
  toWorkflowProject
} from '../../core/orderWorkflow';

function delay<T>(value: T, ms: number = 150): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

const JAN = { login: 'i:0#.f|membership|jan.novak@revoltum.cz', name: 'Jan Novák' };
const EVA = { login: 'i:0#.f|membership|eva.mala@revoltum.cz', name: 'Eva Malá' };
const MARTIN = { login: 'i:0#.f|membership|martin.svoboda@revoltum.cz', name: 'Martin Svoboda' };
const IGOR = { login: 'i:0#.f|membership|igor.zahradka@revoltum.cz', name: 'Igor Zahrádka' };

/** Ukázkové objednávky — v každém stavu, ve kterém se objednávka dá potkat. */
export const MOCK_ORDERS: PurchaseOrder[] = [
  {
    id: 1,
    orderNumber: 'OBJ-2026-0001',
    projectNumber: '25002',
    projectTitle: '25002 AgroFarma Lipnice – Lipnice nad Sázavou – FVE',
    supplierId: 5,
    supplierName: 'FVE Komponenty s.r.o.',
    subject: 'DC kabely a konektory',
    lines: [
      { description: 'Solární kabel 6 mm², cívka 500 m', quantity: 4, unit: 'ks', unitPriceNet: 18500 },
      { description: 'Konektory MC4 (sada 100 ks)', quantity: 2, unit: 'sada', unitPriceNet: 5000 }
    ],
    amountNet: 84000,
    vatRate: 21,
    currency: 'CZK',
    deliveryDate: new Date(2026, 9, 15),
    paymentTermDays: 30,
    status: OrderStatus.Schvaleno,
    requestedByName: MARTIN.name,
    requestedByLogin: MARTIN.login,
    approvalChain: [{ level: 'pm', approved: true, byName: JAN.name, byLogin: JAN.login, at: new Date(2026, 8, 25, 9, 10) }],
    created: new Date(2026, 8, 24)
  },
  {
    id: 2,
    orderNumber: 'OBJ-2026-0002',
    projectNumber: '25003',
    projectTitle: '25003 Teplárna Chotěboř – Chotěboř – BESS',
    supplierId: 6,
    supplierName: 'ElektroMontáže Vysočina s.r.o.',
    subject: 'Montáž rozvaděčů BESS',
    lines: [{ description: 'Montáž a zapojení rozvaděčů', quantity: 1, unit: 'kpl', unitPriceNet: 350000 }],
    amountNet: 350000,
    vatRate: 21,
    currency: 'CZK',
    deliveryDate: new Date(2026, 10, 20),
    paymentTermDays: 30,
    status: OrderStatus.KeSchvaleni,
    requestedByName: JAN.name,
    requestedByLogin: JAN.login,
    currentApprovalLevel: 'vedeni',
    approvalChain: [{ level: 'vedeni', approved: false }],
    created: new Date(2026, 8, 28)
  },
  {
    id: 3,
    orderNumber: 'OBJ-2026-0003',
    projectNumber: '25001',
    projectTitle: '25001 ČEZ Distribuce – Havlíčkův Brod – Připojení DS',
    supplierId: 5,
    supplierName: 'FVE Komponenty s.r.o.',
    subject: 'Ochrany a jističe',
    lines: [{ description: 'Jistič 3P 63 A', quantity: 10, unit: 'ks', unitPriceNet: 4500 }],
    amountNet: 45000,
    vatRate: 21,
    currency: 'CZK',
    paymentTermDays: 30,
    status: OrderStatus.Koncept,
    requestedByName: IGOR.name,
    requestedByLogin: IGOR.login,
    approvalChain: [],
    created: new Date(2026, 8, 29)
  },
  {
    id: 4,
    orderNumber: 'OBJ-2026-0004',
    projectNumber: '26999',
    projectTitle: '26999 Režie RES 2026',
    isOverheadProject: true,
    supplierName: 'Microsoft Ireland Operations Ltd.',
    subject: 'Licence Microsoft 365',
    lines: [{ description: 'Microsoft 365 Business Premium, roční předplatné', quantity: 12, unit: 'lic.', unitPriceNet: 2300 }],
    amountNet: 27600,
    vatRate: 21,
    currency: 'CZK',
    paymentTermDays: 14,
    status: OrderStatus.KeSchvaleni,
    requestedByName: EVA.name,
    requestedByLogin: EVA.login,
    currentApprovalLevel: 'vedeni',
    approvalChain: [{ level: 'vedeni', approved: false }],
    created: new Date(2026, 8, 29)
  }
];

export class MockOrderRepository implements IOrderRepository {
  private orders: PurchaseOrder[];
  private readonly approvals = new Map<number, ApprovalRecord[]>();
  private readonly files = new Map<number, { name: string; blob: Blob; url: string }[]>();
  private nextId: number;

  public constructor(
    private readonly numbering: INumberingRepository,
    private readonly projects: IProjectRepository,
    private readonly settings: ISettingsRepository,
    private readonly partners: IPartnerRepository,
    private readonly rates: IRatesRepository,
    seed: PurchaseOrder[] = MOCK_ORDERS
  ) {
    this.orders = seed.map((o) => ({ ...o, lines: o.lines.map((l) => ({ ...l })), approvalChain: o.approvalChain.map((s) => ({ ...s })) }));
    this.nextId = Math.max(0, ...seed.map((o) => o.id)) + 1;
  }

  public list(filter?: OrderFilter): Promise<PurchaseOrder[]> {
    return delay(sortOrdersNewestFirst(filterOrders(this.orders, filter)));
  }

  public getById(id: number): Promise<PurchaseOrder | undefined> {
    return delay(this.orders.filter((o) => o.id === id)[0]);
  }

  public async create(input: OrderInput, actor: CurrentUser): Promise<PurchaseOrder> {
    const project = await this.projects.getByNumber(input.projectNumber);
    if (!project) {
      throw new WorkflowError(`Projekt ${input.projectNumber} nebyl nalezen, nebo na něj nemáte oprávnění.`);
    }
    if (!canIssueOrder(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Na tento projekt nemáte oprávnění objednávky vystavovat.');
    }
    this.assertValid(input);

    const orderNumber = await this.numbering.allocateNumber('OBJ');
    const order: PurchaseOrder = {
      id: this.nextId++,
      orderNumber,
      projectNumber: project.projectNumber,
      projectTitle: project.title,
      isOverheadProject: project.isOverhead,
      ...(await this.fromInput(input)),
      status: OrderStatus.Koncept,
      requestedByName: actor.displayName,
      requestedByLogin: actor.loginName,
      approvalChain: [],
      created: new Date(),
      modified: new Date()
    };
    this.orders = [...this.orders, order];
    return delay(order);
  }

  public async update(id: number, input: OrderInput, actor: CurrentUser): Promise<PurchaseOrder> {
    const order = this.require(id);
    const project = await this.requireProject(order.projectNumber);
    if (!canEditOrder(order, toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError(`Objednávku ${order.orderNumber} teď nejde upravovat (stav „${order.status}“, nebo k ní nemáte oprávnění).`);
    }
    if (input.projectNumber !== order.projectNumber) {
      throw new WorkflowError('Projekt na vystavené objednávce se nemění. Stornujte ji a vystavte novou.');
    }
    this.assertValid(input);

    const updated: PurchaseOrder = { ...order, ...(await this.fromInput(input)), modified: new Date() };
    this.replace(updated);
    return delay(updated);
  }

  public submit(
    id: number,
    actor: CurrentUser,
    assignees?: Partial<Record<ApprovalLevel, Assignee>>
  ): Promise<PurchaseOrder> {
    return this.transition(id, actor, (o, c) => submitOrder(o, c, assignees));
  }

  public reassign(
    id: number,
    level: ApprovalLevel,
    assignee: Assignee | undefined,
    actor: CurrentUser
  ): Promise<PurchaseOrder> {
    return this.transition(id, actor, (o, c) => reassignApprover(o, level, assignee, c));
  }

  public decide(
    id: number,
    decision: 'approve' | 'return' | 'reject',
    comment: string,
    actor: CurrentUser
  ): Promise<PurchaseOrder> {
    return this.transition(id, actor, (o, c) => decideOrder(o, decision, comment, c));
  }

  public send(id: number, actor: CurrentUser, options?: { sentTo?: string; pdfUrl?: string }): Promise<PurchaseOrder> {
    return this.transition(id, actor, (o, c) => sendOrder(o, c, options));
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

  public listApprovals(id: number): Promise<ApprovalRecord[]> {
    return delay((this.approvals.get(id) ?? []).map((a) => ({ ...a })));
  }

  public listAttachments(id: number): Promise<OrderAttachment[]> {
    return delay((this.files.get(id) ?? []).map((f) => ({ name: f.name, url: f.url, sizeBytes: f.blob.size })));
  }

  public async addAttachment(id: number, file: File, actor: CurrentUser): Promise<OrderAttachment> {
    const order = this.require(id);
    const project = await this.requireProject(order.projectNumber);
    if (!canAddAttachment(order, toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('K této objednávce teď přílohu přidat nemůžete (nemáte oprávnění, nebo je uzavřená či stornovaná).');
    }
    const problem = validateAttachment(file.name, file.size);
    if (problem) {
      throw new WorkflowError(problem);
    }
    // V ukázkovém režimu se soubor drží jen v paměti prohlížeče.
    const url = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '#';
    const list = (this.files.get(id) ?? []).filter((f) => f.name !== file.name);
    list.push({ name: file.name, blob: file, url });
    this.files.set(id, list);
    return delay({ name: file.name, url, sizeBytes: file.size });
  }

  public async removeAttachment(id: number, fileName: string, actor: CurrentUser): Promise<void> {
    const order = this.require(id);
    const project = await this.requireProject(order.projectNumber);
    if (!canRemoveAttachment(order, toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Přílohu jde odebrat jen u konceptu nebo vrácené objednávky.');
    }
    this.files.set(
      id,
      (this.files.get(id) ?? []).filter((f) => f.name !== fileName)
    );
    return delay(undefined);
  }

  public readAttachment(id: number, fileName: string): Promise<Blob> {
    const found = (this.files.get(id) ?? []).filter((f) => f.name === fileName)[0];
    if (!found) {
      return Promise.reject(new WorkflowError('Příloha nebyla nalezena.'));
    }
    return delay(found.blob);
  }

  // --- vnitřní ---

  private require(id: number): PurchaseOrder {
    const order = this.orders.filter((o) => o.id === id)[0];
    if (!order) {
      throw new WorkflowError('Objednávka nebyla nalezena. Nejspíš jste na ni nemají oprávnění.');
    }
    return order;
  }

  private async requireProject(projectNumber: string): Promise<Project> {
    const project = await this.projects.getByNumber(projectNumber);
    if (!project) {
      throw new WorkflowError(`Projekt ${projectNumber} nebyl nalezen, nebo na něj nemáte oprávnění.`);
    }
    return project;
  }

  private assertValid(input: OrderInput): void {
    const issues = validateOrderDraft(input, false);
    if (issues.length > 0) {
      throw new WorkflowError(issues.map((i) => i.message).join(' '));
    }
  }

  private async fromInput(input: OrderInput): Promise<Partial<PurchaseOrder> & Pick<PurchaseOrder, 'subject' | 'lines' | 'amountNet' | 'vatRate' | 'currency'>> {
    let supplierName = input.supplierName;
    if (input.supplierId) {
      const partner = await this.partners.getById(input.supplierId);
      supplierName = partner ? partner.name : supplierName;
    }
    return {
      supplierId: input.supplierId,
      supplierName,
      subject: input.subject.trim(),
      lines: input.lines.map((l) => ({ ...l })),
      amountNet: orderTotals(input.lines, input.vatRate).net,
      vatRate: input.vatRate,
      currency: input.currency,
      deliveryDate: input.deliveryDate,
      paymentTermDays: input.paymentTermDays,
      note: input.note
    };
  }

  private replace(updated: PurchaseOrder): void {
    this.orders = this.orders.map((o) => (o.id === updated.id ? updated : o));
  }

  /** Společný postup všech změn stavu: načíst, nechat rozhodnout workflow, zapsat. */
  private async transition(
    id: number,
    actor: CurrentUser,
    decide: (order: PurchaseOrder, ctx: WorkflowContext) => OrderChange
  ): Promise<PurchaseOrder> {
    const order = this.require(id);
    const project = await this.requireProject(order.projectNumber);
    const approvals: ApprovalSettings = (await this.settings.get()).approvals;
    const now = new Date();

    const rates = effectiveRates(await this.rates.getLatest(), fallbackRatesOf(approvals));
    const change = decide(order, { project: toWorkflowProject(project), settings: approvals, actor: toActor(actor), now, rates });
    const updated = applyOrderChange(order, change, now);
    this.replace(updated);

    if (change.approval) {
      const list = this.approvals.get(id) ?? [];
      list.push({
        stepNo: change.approval.stepNo,
        approverName: actor.displayName,
        decision: change.approval.decision,
        comment: change.approval.comment,
        decidedAt: now
      });
      this.approvals.set(id, list);
    }
    return delay(updated);
  }
}

