/**
 * Realizační rozpočet v ukázkovém režimu — v paměti, bez SharePointu. Pravidla (kdo smí co) jsou stejná jako v ostré
 * implementaci (`core/budget`). Na projekt je jeden rozpočet; schválení přidá záznam do historie.
 */

import { CurrentUser, Project } from '../../core/types';
import {
  BudgetApproval,
  BudgetDoc,
  BudgetRecord,
  BudgetStatus,
  budgetFromJson,
  budgetToJson,
  canApproveBudget,
  canEditBudget,
  marginPercent,
  statusAfterReject,
  validateBudget
} from '../../core/budget';
import { WorkflowError, toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { BudgetHistoryEntry, BudgetTotalsInput, IBudgetRepository, IProjectRepository } from '../repositories';

function delay<T>(value: T, ms: number = 150): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

interface Stored {
  record: BudgetRecord;
  json: string;
  /** Poslední uložené součty v Kč (jako u ostrého seznamu). */
  totals?: BudgetTotalsInput;
  log: BudgetHistoryEntry[];
}

const clone = (r: BudgetRecord): BudgetRecord => ({ ...r, approvals: r.approvals.map((a) => ({ ...a })) });

/** Ukázkový rozpočet projektu 25001 (zkrácená podoba skutečného rozpočtu z projektu Generální oprava). */
export const MOCK_BUDGET_25001: BudgetDoc = {
  groups: [
    { id: 'g-mat', name: 'Materiál', kind: 'standard', defaultMarkupPercent: 15 },
    { id: 'g-sub', name: 'Subdodávky a služby', kind: 'standard', defaultMarkupPercent: 12 },
    { id: 'g-prace', name: 'Vlastní práce', kind: 'prace', defaultMarkupPercent: 0 },
    { id: 'g-dop', name: 'Doprava', kind: 'standard', defaultMarkupPercent: 0 },
    { id: 'g-rez', name: 'Rezerva', kind: 'rezerva', defaultMarkupPercent: 0 }
  ],
  rates: [
    { id: 's-pm', name: 'Projektový manažer', costRate: 700, saleRate: 1100 },
    { id: 's-mont', name: 'Elektromontér', costRate: 450, saleRate: 700 }
  ],
  items: [
    { id: 'i-1', groupId: 'g-mat', description: 'Panely (NODA)', supplier: 'NODA', category: 'Materiál', currency: 'EUR', quantity: 60000, unit: 'EUR', unitCost: 1, actualQty: 45000, actualCost: 45000 },
    { id: 'i-2', groupId: 'g-mat', description: 'Datová komunikace a rozvodnice', category: 'Materiál', currency: 'CZK', quantity: 1, unitCost: 320000, markupPercent: 25 },
    { id: 'i-3', groupId: 'g-sub', description: 'Montáž a zkoušky (Beltec)', supplier: 'Beltec', category: 'Subdodávky a služby', currency: 'EUR', quantity: 60000, unit: 'EUR', unitCost: 1 },
    { id: 'i-p1', groupId: 'g-prace', description: 'Řízení projektu', currency: 'CZK', quantity: 120, unit: 'h', unitCost: 0, rateId: 's-pm', actualQty: 40 },
    { id: 'i-p2', groupId: 'g-prace', description: 'Montážní práce', currency: 'CZK', quantity: 300, unit: 'h', unitCost: 0, rateId: 's-mont' },
    { id: 'i-4', groupId: 'g-dop', description: 'Doprava Olomouc – Mastířovice', category: 'Doprava', currency: 'CZK', quantity: 1, unitCost: 216571.9, actualQty: 1, actualCost: 216580 },
    { id: 'i-5', groupId: 'g-rez', description: 'Realizační rezerva (3 % z prodeje)', category: 'Rezerva', currency: 'CZK', quantity: 1, unitCost: 0, reservePercent: 3 }
  ],
  // Plán plateb a fakturační milníky (ukázka podle vzoru Excelu „Průběh plateb“).
  payments: [
    { id: 'p-1', itemId: 'i-1', description: 'Panely – záloha', amount: 12000, currency: 'EUR', vat: 'reverse', invoiceDate: '2026-06-10', dueDate: '2026-06-24', paidDate: '2026-06-24' },
    { id: 'p-2', itemId: 'i-1', description: 'Panely – 2. platba', amount: 18000, currency: 'EUR', vat: 'reverse', invoiceDate: '2026-07-20', dueDate: '2026-08-03', paidDate: '2026-08-03' },
    { id: 'p-3', itemId: 'i-1', description: 'Panely – 3. platba', amount: 18000, currency: 'EUR', vat: 'reverse', invoiceDate: '2026-10-15', dueDate: '2026-10-29' },
    { id: 'p-4', itemId: 'i-1', description: 'Panely – doplatek', amount: 12000, currency: 'EUR', vat: 'reverse', invoiceDate: '2026-12-01', dueDate: '2026-12-15' },
    { id: 'p-5', itemId: 'i-4', description: 'Doprava Olomouc – Mastířovice', amount: 216571.9, currency: 'CZK', vat: 'dph21', invoiceDate: '2026-07-05', dueDate: '2026-07-19', paidDate: '2026-07-20' },
    { id: 'p-6', itemId: 'i-2', description: 'Datová komunikace a rozvodnice', amount: 320000, currency: 'CZK', vat: 'dph21', invoiceDate: '2026-11-05', dueDate: '2026-11-19' }
  ],
  income: [
    { id: 'm-1', description: 'Záloha 30 %', plannedDate: '2026-06-01', amount: 1400000, currency: 'CZK', vatRate: 21, dueDays: 14, paidDate: '2026-06-16' },
    { id: 'm-2', description: 'Dílčí plnění – dodávka panelů', plannedDate: '2026-09-30', amount: 1900000, currency: 'CZK', vatRate: 21, dueDays: 30 },
    { id: 'm-3', description: 'Předání díla', plannedDate: '2026-12-15', amount: 1550000, currency: 'CZK', vatRate: 21, dueDays: 30 }
  ]
};

export class MockBudgetRepository implements IBudgetRepository {
  private stored: Stored[] = [];
  private nextId = 1;

  public constructor(private readonly projects: IProjectRepository) {
    const now = new Date();
    const s = this.add('25001', MOCK_BUDGET_25001, 'Igor Zahrádka');
    const approval: BudgetApproval = { no: 1, at: now, byName: 'Igor Zahrádka', comment: 'První schválení', cost: 3_900_000, sale: 4_500_000, marginPercent: marginPercent(3_900_000, 4_500_000) };
    s.record.approvals = [approval];
    s.record.status = BudgetStatus.Schvaleno;
    s.log.push({ action: 'Schváleno (záznam č. 1): První schválení', byName: 'Igor Zahrádka', at: now });
  }

  private add(projectNumber: string, doc: BudgetDoc, by: string): Stored {
    const now = new Date();
    const s: Stored = {
      record: { id: this.nextId++, projectNumber, status: BudgetStatus.Koncept, approvals: [], created: now, modified: now },
      json: budgetToJson(doc),
      log: [{ action: 'Založen rozpočet', byName: by, at: now }]
    };
    this.stored.push(s);
    return s;
  }

  public async listPendingApproval(): Promise<BudgetRecord[]> {
    return this.stored.filter((x) => x.record.status === BudgetStatus.KeSchvaleni).map((x) => clone(x.record));
  }

  public async get(projectNumber: string): Promise<{ record: BudgetRecord; doc: BudgetDoc; etag?: string } | undefined> {
    const s = this.stored.filter((x) => x.record.projectNumber === projectNumber)[0];
    if (!s) {
      return delay(undefined);
    }
    return delay({ record: clone(s.record), doc: budgetFromJson(s.json), etag: String(s.record.modified ? s.record.modified.getTime() : 0) });
  }

  public async create(projectNumber: string, doc: BudgetDoc, totals: BudgetTotalsInput, actor: CurrentUser): Promise<BudgetRecord> {
    const project = await this.requireProject(projectNumber);
    if (!canEditBudget(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Na tomto projektu nemáte oprávnění upravovat rozpočet (na Režii se rozpočet nevede).');
    }
    if (this.stored.some((x) => x.record.projectNumber === projectNumber)) {
      throw new WorkflowError('Projekt už rozpočet má.');
    }
    const created = this.add(projectNumber, doc, actor.displayName);
    created.totals = totals;
    return delay(clone(created.record));
  }

  public async save(recordId: number, doc: BudgetDoc, totals: BudgetTotalsInput, actor: CurrentUser, etag?: string, options?: { auto?: boolean }): Promise<BudgetRecord> {
    const s = this.require(recordId);
    const project = await this.requireProject(s.record.projectNumber);
    if (!canEditBudget(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Rozpočet smí upravovat jen projektový manažer, asistent, vedení nebo administrátor.');
    }
    if (etag !== undefined && etag !== String(s.record.modified ? s.record.modified.getTime() : 0)) {
      throw new WorkflowError('Rozpočet mezitím někdo jiný změnil. Načtěte ho znovu — jinak byste přepsali cizí změnu.');
    }
    const issues = validateBudget(doc, false);
    if (issues.length > 0) {
      throw new WorkflowError(issues.map((i) => i.message).join(' '));
    }
    s.totals = totals;
    s.json = budgetToJson(doc);
    s.record = { ...s.record, modified: new Date(Date.now() + 1) };
    if (!options || !options.auto) {
      this.record(s, actor, 'Rozpočet uložen');
    }
    return delay(clone(s.record));
  }

  public async requestApproval(recordId: number, actor: CurrentUser): Promise<BudgetRecord> {
    const s = this.require(recordId);
    const project = await this.requireProject(s.record.projectNumber);
    if (s.record.status === BudgetStatus.KeSchvaleni) {
      throw new WorkflowError('Žádost o schválení už byla podána.');
    }
    if (!canEditBudget(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('O schválení smí požádat jen projektový manažer, asistent, vedení nebo administrátor.');
    }
    const issues = validateBudget(budgetFromJson(s.json), true);
    if (issues.length > 0) {
      throw new WorkflowError(`O schválení nejde požádat: ${issues.slice(0, 3).map((i) => i.message).join(' ')}`);
    }
    s.record = { ...s.record, status: BudgetStatus.KeSchvaleni, requestedByName: actor.displayName, requestedAt: new Date(), comment: undefined, modified: new Date(Date.now() + 1) };
    this.record(s, actor, 'Požádáno o schválení');
    return delay(clone(s.record));
  }

  public async approve(recordId: number, totals: BudgetTotalsInput, comment: string | undefined, actor: CurrentUser, contractPrice?: { priceNet: number; currency: string }): Promise<BudgetRecord> {
    const s = this.require(recordId);
    if (s.record.status !== BudgetStatus.KeSchvaleni) {
      throw new WorkflowError('Schvalovat jde jen rozpočet, o jehož schválení někdo požádal.');
    }
    if (!canApproveBudget(toActor(actor))) {
      throw new WorkflowError('Rozpočet schvaluje vedení (nebo administrátor).');
    }
    const no = s.record.approvals.length + 1;
    const approval: BudgetApproval = {
      no,
      at: new Date(),
      byName: actor.displayName,
      comment: comment || undefined,
      cost: totals.totalCost,
      sale: totals.totalSale,
      marginPercent: marginPercent(totals.totalCost, totals.totalSale)
    };
    s.record = { ...s.record, status: BudgetStatus.Schvaleno, approvals: [...s.record.approvals, approval], requestedByName: undefined, requestedAt: undefined, modified: new Date(Date.now() + 1) };
    this.record(s, actor, `Schváleno (záznam č. ${no})${comment ? `: ${comment}` : ''}`);
    if (contractPrice) {
      await this.projects.setContractPrice(s.record.projectNumber, contractPrice.priceNet, contractPrice.currency);
      this.record(s, actor, `Smluvní cena projektu přepsána prodejem rozpočtu: ${contractPrice.priceNet} ${contractPrice.currency}`);
    }
    return delay(clone(s.record));
  }

  public async reject(recordId: number, comment: string, actor: CurrentUser): Promise<BudgetRecord> {
    const s = this.require(recordId);
    const project = await this.requireProject(s.record.projectNumber);
    if (s.record.status !== BudgetStatus.KeSchvaleni) {
      throw new WorkflowError('Vracet jde jen rozpočet, který čeká na schválení.');
    }
    const approver = canApproveBudget(toActor(actor));
    if (!approver && !canEditBudget(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Žádost smí vrátit vedení, nebo ji žadatel stáhnout zpět.');
    }
    const text = (comment || '').trim();
    if (approver && text === '') {
      throw new WorkflowError('Při vrácení rozpočtu napište důvod.');
    }
    s.record = { ...s.record, status: statusAfterReject(s.record), comment: approver ? text : undefined, requestedByName: undefined, requestedAt: undefined, modified: new Date(Date.now() + 1) };
    this.record(s, actor, approver ? `Vráceno k úpravě: ${text}` : 'Žádost o schválení stažena zpět');
    return delay(clone(s.record));
  }

  public history(recordId: number): Promise<BudgetHistoryEntry[]> {
    return delay(this.require(recordId).log.map((h) => ({ ...h })));
  }

  private record(s: Stored, actor: CurrentUser, action: string): void {
    s.log.push({ action, byName: actor.displayName, at: new Date() });
  }

  private require(id: number): Stored {
    const s = this.stored.filter((x) => x.record.id === id)[0];
    if (!s) {
      throw new WorkflowError('Rozpočet nebyl nalezen. Nejspíš k němu nemáte oprávnění.');
    }
    return s;
  }

  private async requireProject(projectNumber: string): Promise<Project> {
    const project = await this.projects.getByNumber(projectNumber);
    if (!project) {
      throw new WorkflowError(`Projekt ${projectNumber} nebyl nalezen, nebo na něj nemáte oprávnění.`);
    }
    return project;
  }
}
