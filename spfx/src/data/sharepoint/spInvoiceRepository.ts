/**
 * Podklady pro fakturaci v seznamu PRM_InvoiceBases.
 *
 * Stejný postup jako u objednávek (`spOrderRepository`): pravidla jsou v `core/invoiceWorkflow`, tenhle soubor jen načte
 * podklad, nechá workflow rozhodnout a výsledek zapíše — a to **znovu s kontrolou oprávnění** těsně před zápisem
 * (CLAUDE.md, kap. 4). Zápis drží ETag načtené verze (souběžná změna → HTTP 412, nic se nezapíše).
 * Každá změna jde do PRM_AuditLog; z něj se skládá i historie podkladu.
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { CurrentUser, Project } from '../../core/types';
import { toDate } from '../../core/format';
import { OrderAttachment, linesFromJson, linesToJson, validateAttachment } from '../../core/orders';
import {
  InvoiceBasis,
  InvoiceKind,
  InvoiceStatus,
  filterInvoices,
  highestInvoiceSequence,
  invoiceTotals,
  sortInvoicesNewestFirst,
  validateInvoiceDraft
} from '../../core/invoiceBases';
import {
  InvoiceChange,
  InvoiceContext,
  applyInvoiceChange,
  canAddInvoiceAttachment,
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
import { getSp, describeSpError, extractStatus } from './spContext';
import { extractEtag } from './spProjectRepository';
import { escapeODataString } from './spSettingsRepository';

const LIST = 'PRM_InvoiceBases';
const AUDIT_LIST = 'PRM_AuditLog';
const AUDIT_ENTITY = 'Podklad pro fakturaci';

const SELECT_FIELDS = [
  'Id',
  'Title',
  'BasisNumber',
  'Project/Id',
  'Project/ProjectNumber',
  'Customer/Id',
  'Customer/Title',
  'Lines',
  'AmountNet',
  'VATRate',
  'Currency',
  'IssueDate',
  'TaxableDate',
  'DueDate',
  'BasisStatus',
  'RequestedBy/Title',
  'RequestedBy/Name',
  'Note',
  'CancelReason',
  'HandoverDate',
  'InvoiceKind',
  'AccountingInvoiceNo',
  'PaidDate',
  'PdfUrl',
  'Created',
  'Modified'
];
const EXPAND_FIELDS = ['Project', 'Customer', 'RequestedBy'];

interface InvoiceItem {
  Id: number;
  Title?: string;
  BasisNumber?: string;
  Project?: { Id: number; ProjectNumber: string };
  Customer?: { Id: number; Title: string };
  Lines?: string;
  AmountNet?: number;
  VATRate?: number;
  Currency?: string;
  InvoiceKind?: string;
  IssueDate?: string;
  TaxableDate?: string;
  DueDate?: string;
  BasisStatus?: string;
  RequestedBy?: { Title: string; Name: string };
  Note?: string;
  CancelReason?: string;
  HandoverDate?: string;
  AccountingInvoiceNo?: string;
  PaidDate?: string;
  PdfUrl?: { Url: string };
  Created?: string;
  Modified?: string;
}

const MISSING_COLUMNS_HINT =
  'Seznam podkladů pro fakturaci na webu nemá všechny sloupce, které aplikace potřebuje. ' +
  'Otevřete Instalace a diagnostika a doplňte chybějící části (přidá jen sloupce, nic nesmaže).';

export class SpInvoiceRepository implements IInvoiceRepository {
  public constructor(
    private readonly context: WebPartContext,
    private readonly numbering: INumberingRepository,
    private readonly projects: IProjectRepository
  ) {}

  public async list(filter?: InvoiceFilter): Promise<InvoiceBasis[]> {
    try {
      const sp = getSp(this.context);
      const items: InvoiceItem[] = await sp.web.lists
        .getByTitle(LIST)
        .items.select(...SELECT_FIELDS)
        .expand(...EXPAND_FIELDS)
        .orderBy('Id', false)
        .top(2000)();
      return sortInvoicesNewestFirst(filterInvoices(items.map(mapInvoice), filter));
    } catch (error) {
      throw new Error(explain(error, 'Nepodařilo se načíst podklady pro fakturaci'));
    }
  }

  public async getById(id: number): Promise<InvoiceBasis | undefined> {
    try {
      return (await this.load(id)).invoice;
    } catch (error) {
      if (extractStatus(error) === 404) {
        return undefined;
      }
      throw new Error(explain(error, `Nepodařilo se načíst podklad č. ${id}`));
    }
  }

  public async create(input: InvoiceInput, actor: CurrentUser): Promise<InvoiceBasis> {
    const project = await this.requireProject(input.projectNumber);
    if (!canIssueInvoice(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Na tento projekt nemáte oprávnění podklady pro fakturaci vystavovat (na Režii se nefakturuje).');
    }
    assertValid(input);

    // Číslo se přiděluje až po kontrole: nezdařené uložení by jinak spotřebovalo číslo a v řadě by byla díra.
    const number = await this.allocateUniqueNumber();
    let newId: number | undefined;
    try {
      const sp = getSp(this.context);
      const added = await sp.web.lists.getByTitle(LIST).items.add({
        Title: number,
        BasisNumber: number,
        ProjectId: project.id,
        ...toFields(input),
        BasisStatus: InvoiceStatus.Koncept,
        RequestedById: actor.id,
        IssueDate: (input.issueDate ?? new Date()).toISOString()
      });
      newId = extractAddedId(added);
    } catch (error) {
      throw new Error(explain(error, `Podklad ${number} se nepodařilo uložit`));
    }
    if (newId === undefined) {
      throw new Error(`Podklad ${number} se uložil, ale SharePoint nevrátil jeho číslo položky. Načtěte seznam znovu.`);
    }
    await this.writeAudit(newId, number, actor, 'Založen podklad', undefined, InvoiceStatus.Koncept);
    return (await this.requireInvoice(newId)).invoice;
  }

  public async update(id: number, input: InvoiceInput, actor: CurrentUser): Promise<InvoiceBasis> {
    const { invoice, etag } = await this.requireInvoice(id);
    const project = await this.requireProject(invoice.projectNumber);
    if (!canEditInvoice(invoice, toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError(`Podklad ${invoice.number} teď nejde upravovat (stav „${invoice.status}“, nebo k němu nemáte oprávnění).`);
    }
    if (input.projectNumber !== invoice.projectNumber) {
      throw new WorkflowError('Projekt na vystaveném podkladu se nemění. Stornujte ho a vystavte nový.');
    }
    assertValid(input);
    await this.write(id, toFields(input), etag, `Nepodařilo se uložit podklad ${invoice.number}`);
    await this.writeAudit(id, invoice.number, actor, 'Upraveno', invoice.status, invoice.status);
    return (await this.requireInvoice(id)).invoice;
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
    const { invoice } = await this.requireInvoice(id);
    // Audit jde první: smazaný podklad je v koši SharePointu, ale bez záznamu by nebylo vidět, kdo ho smazal.
    await this.writeAudit(
      id,
      invoice.number,
      actor,
      `Podklad smazán administrátorem (projekt ${invoice.projectNumber}, stav „${invoice.status}“)`,
      invoice.status,
      'Smazáno'
    );
    try {
      const sp = getSp(this.context);
      await sp.web.lists.getByTitle(LIST).items.getById(id).recycle();
    } catch (error) {
      throw new Error(explain(error, `Podklad ${invoice.number} se nepodařilo smazat`));
    }
  }

  public async history(id: number): Promise<InvoiceHistoryEntry[]> {
    try {
      const { invoice } = await this.requireInvoice(id);
      const sp = getSp(this.context);
      const rows: { Action?: string; PerformedAt?: string; PerformedBy?: { Title: string } }[] = await sp.web.lists
        .getByTitle(AUDIT_LIST)
        .items.select('Action', 'PerformedAt', 'PerformedBy/Title')
        .expand('PerformedBy')
        .filter(`EntityType eq '${AUDIT_ENTITY}' and EntityId eq '${escapeODataString(invoice.number)}'`)
        .orderBy('Id', true)
        .top(200)();
      return rows.map((r) => ({ action: r.Action ?? '', byName: r.PerformedBy?.Title ?? '—', at: toDate(r.PerformedAt) }));
    } catch (error) {
      throw new Error(describeSpError(error, 'Nepodařilo se načíst historii podkladu'));
    }
  }

  public async listAttachments(id: number): Promise<OrderAttachment[]> {
    try {
      const sp = getSp(this.context);
      const origin = new URL(this.context.pageContext.web.absoluteUrl).origin;
      const files: { FileName: string; ServerRelativeUrl: string }[] = await sp.web.lists.getByTitle(LIST).items.getById(id).attachmentFiles();
      return files.map((f) => ({ name: f.FileName, url: `${origin}${f.ServerRelativeUrl}` }));
    } catch (error) {
      throw new Error(describeSpError(error, 'Nepodařilo se načíst přílohy podkladu'));
    }
  }

  public async addAttachment(id: number, file: File, actor: CurrentUser): Promise<OrderAttachment> {
    const { invoice } = await this.requireInvoice(id);
    const project = await this.requireProject(invoice.projectNumber);
    if (!canAddInvoiceAttachment(invoice, toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('K tomuto podkladu teď přílohu přidat nemůžete (nemáte oprávnění, nebo už je předaný účtárně).');
    }
    const problem = validateAttachment(file.name, file.size);
    if (problem) {
      throw new WorkflowError(problem);
    }
    try {
      const sp = getSp(this.context);
      await sp.web.lists.getByTitle(LIST).items.getById(id).attachmentFiles.add(file.name, file);
    } catch (error) {
      throw new Error(describeSpError(error, `Přílohu „${file.name}“ se nepodařilo nahrát`));
    }
    await this.writeAudit(id, invoice.number, actor, `Příloha přidána: ${file.name}`, invoice.status, invoice.status);
    const found = (await this.listAttachments(id)).filter((a) => a.name === file.name)[0];
    return found ?? { name: file.name, url: '' };
  }

  public async removeAttachment(id: number, fileName: string, actor: CurrentUser): Promise<void> {
    const { invoice } = await this.requireInvoice(id);
    const project = await this.requireProject(invoice.projectNumber);
    if (!canAddInvoiceAttachment(invoice, toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Přílohu jde odebrat jen u konceptu nebo podkladu ke kontrole.');
    }
    // Audit jde první: odebraný soubor je v koši SharePointu, ale bez záznamu by nebylo vidět, kdo ho odebral.
    await this.writeAudit(id, invoice.number, actor, `Příloha odebrána: ${fileName}`, invoice.status, invoice.status);
    try {
      const sp = getSp(this.context);
      await sp.web.lists.getByTitle(LIST).items.getById(id).attachmentFiles.getByName(fileName).delete();
    } catch (error) {
      throw new Error(describeSpError(error, `Přílohu „${fileName}“ se nepodařilo odebrat`));
    }
  }

  public async readAttachment(id: number, fileName: string): Promise<Blob> {
    try {
      const sp = getSp(this.context);
      return await sp.web.lists.getByTitle(LIST).items.getById(id).attachmentFiles.getByName(fileName).getBlob();
    } catch (error) {
      throw new Error(describeSpError(error, `Přílohu „${fileName}“ se nepodařilo načíst`));
    }
  }

  // --- vnitřní ---

  /**
   * Přidělí číslo, které žádný podklad ještě nemá. Čítač je hlavní pojistka; tohle je druhá — kdyby čítač zaostával,
   * číslo by se jinak přidělilo podruhé. Při shodě se čítač dorovná podle nejvyššího existujícího čísla (jen nahoru).
   */
  private async allocateUniqueNumber(): Promise<string> {
    const sp = getSp(this.context);
    for (let attempt = 0; attempt < 5; attempt++) {
      const number = await this.numbering.allocateNumber('FP');
      let taken = false;
      try {
        const same: { Id: number }[] = await sp.web.lists
          .getByTitle(LIST)
          .items.select('Id')
          .filter(`BasisNumber eq '${escapeODataString(number)}'`)
          .top(1)();
        taken = same.length > 0;
      } catch (error) {
        throw new Error(explain(error, 'Nepodařilo se ověřit, že číslo podkladu je volné'));
      }
      if (!taken) {
        return number;
      }
      const year = new Date().getFullYear();
      const rows: { BasisNumber?: string; Title?: string }[] = await sp.web.lists.getByTitle(LIST).items.select('BasisNumber', 'Title').top(5000)();
      const highest = highestInvoiceSequence(
        rows.map((r) => r.BasisNumber || r.Title || ''),
        year
      );
      if (highest > 0) {
        await this.numbering.setCounterAtLeast('FP', year, highest);
      }
    }
    throw new Error('Nepodařilo se přidělit volné číslo podkladu — čítač zaostává za existujícími čísly. Dejte to vědět správci.');
  }

  private async load(id: number): Promise<{ invoice: InvoiceBasis; etag?: string }> {
    const sp = getSp(this.context);
    const item: InvoiceItem = await sp.web.lists
      .getByTitle(LIST)
      .items.getById(id)
      .select(...SELECT_FIELDS)
      .expand(...EXPAND_FIELDS)();
    return { invoice: mapInvoice(item), etag: extractEtag(item) };
  }

  private async requireInvoice(id: number): Promise<{ invoice: InvoiceBasis; etag?: string }> {
    try {
      return await this.load(id);
    } catch (error) {
      if (extractStatus(error) === 404) {
        throw new WorkflowError('Podklad nebyl nalezen. Nejspíš ho někdo smazal, nebo k němu nemáte oprávnění.');
      }
      throw new Error(explain(error, `Nepodařilo se načíst podklad č. ${id}`));
    }
  }

  private async requireProject(projectNumber: string): Promise<Project> {
    const project = await this.projects.getByNumber(projectNumber);
    if (!project) {
      throw new WorkflowError(`Projekt ${projectNumber} nebyl nalezen, nebo na něj nemáte oprávnění.`);
    }
    return project;
  }

  private async write(id: number, fields: Record<string, unknown>, etag: string | undefined, context: string): Promise<void> {
    try {
      const sp = getSp(this.context);
      await sp.web.lists.getByTitle(LIST).items.getById(id).update(fields, etag ?? '*');
    } catch (error) {
      if (extractStatus(error) === 412) {
        throw new WorkflowError('Podklad mezitím někdo jiný změnil. Načtěte ho znovu a akci zopakujte — jinak byste přepsali cizí změnu.');
      }
      throw new Error(explain(error, context));
    }
  }

  /** Společný postup všech změn stavu: načíst, nechat rozhodnout workflow, zapsat. */
  private async transition(
    id: number,
    actor: CurrentUser,
    decide: (invoice: InvoiceBasis, ctx: InvoiceContext) => InvoiceChange
  ): Promise<InvoiceBasis> {
    const { invoice, etag } = await this.requireInvoice(id);
    const project = await this.requireProject(invoice.projectNumber);
    const now = new Date();

    const change = decide(invoice, { project: toWorkflowProject(project), actor: toActor(actor), now });
    const after = applyInvoiceChange(invoice, change, now);

    const fields: Record<string, unknown> = { BasisStatus: after.status };
    if (change.handoverDate) {
      fields.HandoverDate = change.handoverDate.toISOString();
    }
    if (change.accountingInvoiceNo) {
      fields.AccountingInvoiceNo = change.accountingInvoiceNo;
    }
    if (change.paidDate) {
      fields.PaidDate = change.paidDate.toISOString();
    }
    if (change.cancelReason) {
      fields.CancelReason = change.cancelReason;
    }
    if (change.pdfUrl) {
      fields.PdfUrl = { Url: change.pdfUrl, Description: `${invoice.number}.pdf` };
    }
    await this.write(id, fields, etag, `Nepodařilo se změnit stav podkladu ${invoice.number}`);

    try {
      await this.writeAudit(id, invoice.number, actor, change.auditAction, invoice.status, after.status);
    } catch (error) {
      throw new Error(
        `Změna podkladu ${invoice.number} se provedla, ale nepodařilo se zapsat záznam o ní do historie. ` +
          `Dejte to vědět správci. (${error instanceof Error ? error.message : String(error)})`
      );
    }
    return (await this.requireInvoice(id)).invoice;
  }

  private async writeAudit(
    id: number,
    number: string,
    actor: CurrentUser,
    action: string,
    oldStatus: string | undefined,
    newStatus: string
  ): Promise<void> {
    try {
      const sp = getSp(this.context);
      await sp.web.lists.getByTitle(AUDIT_LIST).items.add({
        Title: `Podklad ${number}`,
        EntityType: AUDIT_ENTITY,
        EntityId: number,
        Action: action.length > 250 ? `${action.slice(0, 247)}…` : action,
        PerformedById: actor.id,
        PerformedAt: new Date().toISOString(),
        OldValue: oldStatus ?? '',
        NewValue: newStatus
      });
    } catch (error) {
      throw new Error(describeSpError(error, `Nepodařilo se zapsat audit podkladu ${number} (položka ${id})`));
    }
  }
}

function assertValid(input: InvoiceInput): void {
  const issues = validateInvoiceDraft(input, false);
  if (issues.length > 0) {
    throw new WorkflowError(issues.map((i) => i.message).join(' '));
  }
}

/** Pole podkladu z formuláře. Zákazník se ukládá odkazem na partnera (`CustomerId`). */
function toFields(input: InvoiceInput): Record<string, unknown> {
  return {
    CustomerId: input.customerId ?? null,
    Lines: linesToJson(input.lines),
    AmountNet: invoiceTotals(input.lines, input.vatRate).net,
    VATRate: input.vatRate,
    Currency: input.currency,
    InvoiceKind: input.kind === InvoiceKind.Zaloha ? InvoiceKind.Zaloha : InvoiceKind.Faktura,
    IssueDate: input.issueDate ? input.issueDate.toISOString() : null,
    TaxableDate: input.taxableDate ? input.taxableDate.toISOString() : null,
    DueDate: input.dueDate ? input.dueDate.toISOString() : null,
    Note: input.note ?? ''
  };
}

function mapInvoice(item: InvoiceItem): InvoiceBasis {
  return {
    id: item.Id,
    number: item.BasisNumber || item.Title || `#${item.Id}`,
    projectNumber: item.Project?.ProjectNumber ?? '',
    customerId: item.Customer?.Id,
    customerName: item.Customer?.Title,
    lines: linesFromJson(item.Lines),
    amountNet: item.AmountNet ?? 0,
    vatRate: item.VATRate ?? 21,
    kind: item.InvoiceKind === InvoiceKind.Zaloha ? InvoiceKind.Zaloha : InvoiceKind.Faktura,
    currency: item.Currency ?? 'CZK',
    issueDate: toDate(item.IssueDate),
    taxableDate: toDate(item.TaxableDate),
    dueDate: toDate(item.DueDate),
    status: (item.BasisStatus as InvoiceStatus) ?? InvoiceStatus.Koncept,
    requestedByName: item.RequestedBy?.Title ?? '',
    requestedByLogin: item.RequestedBy?.Name ?? '',
    note: item.Note || undefined,
    cancelReason: item.CancelReason || undefined,
    handoverDate: toDate(item.HandoverDate),
    accountingInvoiceNo: item.AccountingInvoiceNo || undefined,
    paidDate: toDate(item.PaidDate),
    pdfUrl: item.PdfUrl?.Url || undefined,
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
