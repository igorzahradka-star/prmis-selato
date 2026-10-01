/**
 * Podklady pro fakturaci v ukázkovém režimu — v paměti, bez SharePointu.
 *
 * Používá **stejné workflow** (`core/invoiceWorkflow`) jako ostrá implementace, takže ukázkový režim ukazuje skutečná
 * pravidla, ne jejich zjednodušenou verzi.
 */

import { CurrentUser, Project } from '../../core/types';
import {
  InvoiceBasis,
  InvoiceStatus,
  filterInvoices,
  invoiceTotals,
  sortInvoicesNewestFirst,
  validateInvoiceDraft
} from '../../core/invoiceBases';
import {
  InvoiceChange,
  InvoiceContext,
  applyInvoiceChange,
  canDeleteInvoice,
  canEditInvoice,
  canIssueInvoice,
  cancelInvoice,
  handOverInvoice,
  markInvoiced,
  markPaid,
  resendInvoice,
  returnInvoice,
  submitInvoice
} from '../../core/invoiceWorkflow';
import { WorkflowError, toActor, toWorkflowProject } from '../../core/orderWorkflow';
import {
  INumberingRepository,
  IInvoiceRepository,
  InvoiceFilter,
  InvoiceHistoryEntry,
  InvoiceInput,
  IProjectRepository
} from '../repositories';

function delay<T>(value: T, ms: number = 150): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

const JAN = { login: 'i:0#.f|membership|jan.novak@revoltum.cz', name: 'Jan Novák' };
const MARTIN = { login: 'i:0#.f|membership|martin.svoboda@revoltum.cz', name: 'Martin Svoboda' };

/** Ukázkové podklady — čísla FP26001 až FP26003, další nový naváže za nimi. */
export const MOCK_INVOICES: InvoiceBasis[] = [
  {
    id: 1,
    number: 'FP26001',
    projectNumber: '25001',
    projectTitle: '25001 ČEZ Distribuce – Havlíčkův Brod – Připojení DS',
    customerName: 'ČEZ Distribuce, a.s.',
    lines: [{ description: 'Záloha 30 % dle SoD čl. 5', quantity: 1, unit: 'kpl', unitPriceNet: 420000 }],
    amountNet: 420000,
    vatRate: 21,
    currency: 'CZK',
    issueDate: new Date(2026, 8, 2),
    taxableDate: new Date(2026, 8, 2),
    dueDate: new Date(2026, 8, 30),
    status: InvoiceStatus.Vyfakturovano,
    requestedByName: JAN.name,
    requestedByLogin: JAN.login,
    handoverDate: new Date(2026, 8, 3),
    accountingInvoiceNo: '2026-0412',
    created: new Date(2026, 8, 2)
  },
  {
    id: 2,
    number: 'FP26002',
    projectNumber: '25002',
    projectTitle: '25002 AgroFarma Lipnice – Lipnice nad Sázavou – FVE',
    customerName: 'AgroFarma Lipnice s.r.o.',
    lines: [
      { description: 'Dodávka FV panelů – 1. etapa', quantity: 1, unit: 'kpl', unitPriceNet: 780000 },
      { description: 'Doprava a vykládka', quantity: 1, unit: 'kpl', unitPriceNet: 18000 }
    ],
    amountNet: 798000,
    vatRate: 21,
    currency: 'CZK',
    issueDate: new Date(2026, 8, 24),
    taxableDate: new Date(2026, 8, 24),
    dueDate: new Date(2026, 9, 24),
    status: InvoiceStatus.KeKontrole,
    requestedByName: MARTIN.name,
    requestedByLogin: MARTIN.login,
    created: new Date(2026, 8, 24)
  },
  {
    id: 3,
    number: 'FP26003',
    projectNumber: '25003',
    projectTitle: '25003 Teplárna Chotěboř – Chotěboř – BESS',
    customerName: 'Teplárna Chotěboř a.s.',
    lines: [{ description: 'Projektová dokumentace BESS – dílčí plnění', quantity: 1, unit: 'kpl', unitPriceNet: 150000 }],
    amountNet: 150000,
    vatRate: 21,
    currency: 'CZK',
    issueDate: new Date(2026, 8, 29),
    taxableDate: new Date(2026, 8, 29),
    dueDate: new Date(2026, 9, 29),
    status: InvoiceStatus.Koncept,
    requestedByName: JAN.name,
    requestedByLogin: JAN.login,
    created: new Date(2026, 8, 29)
  }
];

export class MockInvoiceRepository implements IInvoiceRepository {
  private invoices: InvoiceBasis[];
  private readonly log = new Map<number, InvoiceHistoryEntry[]>();
  private nextId: number;

  public constructor(
    private readonly numbering: INumberingRepository,
    private readonly projects: IProjectRepository,
    seed: InvoiceBasis[] = MOCK_INVOICES
  ) {
    this.invoices = seed.map((i) => ({ ...i, lines: i.lines.map((l) => ({ ...l })) }));
    this.nextId = Math.max(0, ...seed.map((i) => i.id)) + 1;
  }

  public list(filter?: InvoiceFilter): Promise<InvoiceBasis[]> {
    return delay(sortInvoicesNewestFirst(filterInvoices(this.invoices, filter)));
  }

  public getById(id: number): Promise<InvoiceBasis | undefined> {
    return delay(this.invoices.filter((i) => i.id === id)[0]);
  }

  public async create(input: InvoiceInput, actor: CurrentUser): Promise<InvoiceBasis> {
    const project = await this.requireProject(input.projectNumber);
    if (!canIssueInvoice(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Na tento projekt nemáte oprávnění podklady pro fakturaci vystavovat (na Režii se nefakturuje).');
    }
    this.assertValid(input);

    const number = await this.numbering.allocateNumber('FP');
    const invoice: InvoiceBasis = {
      id: this.nextId++,
      number,
      projectNumber: project.projectNumber,
      projectTitle: project.title,
      ...this.fromInput(input),
      issueDate: input.issueDate ?? new Date(),
      status: InvoiceStatus.Koncept,
      requestedByName: actor.displayName,
      requestedByLogin: actor.loginName,
      created: new Date(),
      modified: new Date()
    };
    this.invoices = [...this.invoices, invoice];
    this.record(invoice.id, actor, 'Založen podklad');
    return delay(invoice);
  }

  public async update(id: number, input: InvoiceInput, actor: CurrentUser): Promise<InvoiceBasis> {
    const invoice = this.require(id);
    const project = await this.requireProject(invoice.projectNumber);
    if (!canEditInvoice(invoice, toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError(`Podklad ${invoice.number} teď nejde upravovat (stav „${invoice.status}“, nebo k němu nemáte oprávnění).`);
    }
    if (input.projectNumber !== invoice.projectNumber) {
      throw new WorkflowError('Projekt na vystaveném podkladu se nemění. Stornujte ho a vystavte nový.');
    }
    this.assertValid(input);
    const updated: InvoiceBasis = { ...invoice, ...this.fromInput(input), modified: new Date() };
    this.replace(updated);
    this.record(id, actor, 'Upraveno');
    return delay(updated);
  }

  public submit(id: number, actor: CurrentUser): Promise<InvoiceBasis> {
    return this.transition(id, actor, (i, c) => submitInvoice(i, c));
  }

  public handOver(id: number, actor: CurrentUser, options?: { sentTo?: string; pdfUrl?: string }): Promise<InvoiceBasis> {
    return this.transition(id, actor, (i, c) => handOverInvoice(i, c, options));
  }

  public returnToDraft(id: number, comment: string, actor: CurrentUser): Promise<InvoiceBasis> {
    return this.transition(id, actor, (i, c) => returnInvoice(i, comment, c));
  }

  public markInvoiced(id: number, invoiceNo: string, actor: CurrentUser): Promise<InvoiceBasis> {
    return this.transition(id, actor, (i, c) => markInvoiced(i, invoiceNo, c));
  }

  public markPaid(id: number, paidDate: Date, actor: CurrentUser): Promise<InvoiceBasis> {
    return this.transition(id, actor, (i, c) => markPaid(i, paidDate, c));
  }

  public cancel(id: number, reason: string, actor: CurrentUser): Promise<InvoiceBasis> {
    return this.transition(id, actor, (i, c) => cancelInvoice(i, reason, c));
  }

  public resend(id: number, actor: CurrentUser, options?: { sentTo?: string; pdfUrl?: string }): Promise<InvoiceBasis> {
    return this.transition(id, actor, (i, c) => resendInvoice(i, c, options));
  }

  public async delete(id: number, actor: CurrentUser): Promise<void> {
    if (!canDeleteInvoice(toActor(actor))) {
      throw new WorkflowError('Podklad smí smazat jen administrátor PRM.');
    }
    this.require(id);
    this.invoices = this.invoices.filter((i) => i.id !== id);
    this.log.delete(id);
    return delay(undefined);
  }

  public history(id: number): Promise<InvoiceHistoryEntry[]> {
    return delay((this.log.get(id) ?? []).map((h) => ({ ...h })));
  }

  // --- vnitřní ---

  private require(id: number): InvoiceBasis {
    const invoice = this.invoices.filter((i) => i.id === id)[0];
    if (!invoice) {
      throw new WorkflowError('Podklad nebyl nalezen. Nejspíš k němu nemáte oprávnění.');
    }
    return invoice;
  }

  private async requireProject(projectNumber: string): Promise<Project> {
    const project = await this.projects.getByNumber(projectNumber);
    if (!project) {
      throw new WorkflowError(`Projekt ${projectNumber} nebyl nalezen, nebo na něj nemáte oprávnění.`);
    }
    return project;
  }

  private assertValid(input: InvoiceInput): void {
    const issues = validateInvoiceDraft(input, false);
    if (issues.length > 0) {
      throw new WorkflowError(issues.map((i) => i.message).join(' '));
    }
  }

  private fromInput(input: InvoiceInput): Pick<InvoiceBasis, 'kind' | 'customerId' | 'customerName' | 'lines' | 'amountNet' | 'vatRate' | 'currency' | 'issueDate' | 'taxableDate' | 'dueDate' | 'note'> {
    return {
      customerId: input.customerId,
      customerName: input.customerName,
      lines: input.lines.map((l) => ({ ...l })),
      amountNet: invoiceTotals(input.lines, input.vatRate).net,
      vatRate: input.vatRate,
      currency: input.currency,
      issueDate: input.issueDate,
      kind: input.kind,
      taxableDate: input.taxableDate,
      dueDate: input.dueDate,
      note: input.note
    };
  }

  private replace(updated: InvoiceBasis): void {
    this.invoices = this.invoices.map((i) => (i.id === updated.id ? updated : i));
  }

  private record(id: number, actor: CurrentUser, action: string): void {
    const list = this.log.get(id) ?? [];
    list.push({ action, byName: actor.displayName, at: new Date() });
    this.log.set(id, list);
  }

  private async transition(
    id: number,
    actor: CurrentUser,
    decide: (invoice: InvoiceBasis, ctx: InvoiceContext) => InvoiceChange
  ): Promise<InvoiceBasis> {
    const invoice = this.require(id);
    const project = await this.requireProject(invoice.projectNumber);
    const now = new Date();
    const change = decide(invoice, { project: toWorkflowProject(project), actor: toActor(actor), now });
    const updated = applyInvoiceChange(invoice, change, now);
    this.replace(updated);
    this.record(id, actor, change.auditAction);
    return delay(updated);
  }
}
