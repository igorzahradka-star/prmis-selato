/**
 * Realizační rozpočet v ukázkovém režimu — v paměti, bez SharePointu. Pravidla (kdo smí co, jaký stav) jsou stejná jako
 * v ostré implementaci (`core/budget`).
 */

import { CurrentUser, Project } from '../../core/types';
import {
  BudgetDoc,
  BudgetVersion,
  BudgetVersionStatus,
  budgetFromJson,
  budgetToJson,
  canApproveBudget,
  canEditBudget,
  latestVersion,
  nextVersionNo,
  requireBudgetStatus,
  validateBudget
} from '../../core/budget';
import { WorkflowError, toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { BudgetHistoryEntry, BudgetTotalsInput, IBudgetRepository, IProjectRepository } from '../repositories';

function delay<T>(value: T, ms: number = 150): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

interface Stored {
  version: BudgetVersion;
  json: string;
  log: BudgetHistoryEntry[];
}

const clone = (v: BudgetVersion): BudgetVersion => ({ ...v });

/** Ukázkový schválený rozpočet projektu 25001 (zkrácená podoba skutečného rozpočtu z projektu Generální oprava). */
export const MOCK_BUDGET_25001: BudgetDoc = {
  groups: [
    { id: 'g-mat', name: 'Materiál', defaultMarkupPercent: 15 },
    { id: 'g-sub', name: 'Subdodávky a služby', defaultMarkupPercent: 12 },
    { id: 'g-dop', name: 'Doprava', defaultMarkupPercent: 0 },
    { id: 'g-rez', name: 'Rezerva', defaultMarkupPercent: 0 }
  ],
  items: [
    { id: 'i-1', groupId: 'g-mat', description: 'Panely (NODA)', supplier: 'NODA', category: 'Materiál', currency: 'EUR', quantity: 60000, unit: 'EUR', unitCost: 1 },
    { id: 'i-2', groupId: 'g-mat', description: 'Datová komunikace a rozvodnice', category: 'Materiál', currency: 'CZK', quantity: 1, unitCost: 320000, markupPercent: 25 },
    { id: 'i-3', groupId: 'g-sub', description: 'Montáž a zkoušky (Beltec)', supplier: 'Beltec', category: 'Subdodávky a služby', currency: 'EUR', quantity: 60000, unit: 'EUR', unitCost: 1 },
    { id: 'i-4', groupId: 'g-dop', description: 'Doprava Olomouc – Mastířovice', category: 'Doprava', currency: 'CZK', quantity: 1, unitCost: 216571.9 },
    { id: 'i-5', groupId: 'g-rez', description: 'Realizační rezerva', category: 'Rezerva', currency: 'CZK', quantity: 1, unitCost: 150000 }
  ]
};

export class MockBudgetRepository implements IBudgetRepository {
  private stored: Stored[] = [];
  private nextId = 1;

  public constructor(private readonly projects: IProjectRepository) {
    this.add('25001', BudgetVersionStatus.Schvaleno, MOCK_BUDGET_25001, 'Igor Zahrádka');
  }

  private add(projectNumber: string, status: BudgetVersionStatus, doc: BudgetDoc, by: string): Stored {
    const versions = this.stored.filter((s) => s.version.projectNumber === projectNumber).map((s) => s.version);
    const now = new Date();
    const s: Stored = {
      version: {
        id: this.nextId++,
        projectNumber,
        versionNo: nextVersionNo(versions),
        status,
        createdByName: by,
        approvedByName: status === BudgetVersionStatus.Schvaleno ? by : undefined,
        approvedAt: status === BudgetVersionStatus.Schvaleno ? now : undefined,
        created: now,
        modified: now
      },
      json: budgetToJson(doc),
      log: [{ action: 'Založena verze rozpočtu', byName: by, at: now }]
    };
    this.stored.push(s);
    return s;
  }

  public listVersions(projectNumber: string): Promise<BudgetVersion[]> {
    return delay(
      this.stored
        .filter((s) => s.version.projectNumber === projectNumber)
        .map((s) => clone(s.version))
        .sort((a, b) => b.versionNo - a.versionNo)
    );
  }

  public async getContent(versionId: number): Promise<{ version: BudgetVersion; doc: BudgetDoc; etag?: string }> {
    const s = this.require(versionId);
    return delay({ version: clone(s.version), doc: budgetFromJson(s.json), etag: String(s.version.modified ? s.version.modified.getTime() : 0) });
  }

  public async createVersion(projectNumber: string, doc: BudgetDoc, totals: BudgetTotalsInput, actor: CurrentUser): Promise<BudgetVersion> {
    const project = await this.requireProject(projectNumber);
    if (!canEditBudget(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Na tomto projektu nemáte oprávnění upravovat rozpočet (na Režii se rozpočet nevede).');
    }
    const versions = await this.listVersions(projectNumber);
    const last = latestVersion(versions);
    if (last && last.status !== BudgetVersionStatus.Schvaleno) {
      throw new WorkflowError(`Projekt už má rozpracovanou verzi ${last.versionNo} (${last.status}). Novou jde založit až po schválení.`);
    }
    const s = this.add(projectNumber, BudgetVersionStatus.Koncept, doc, actor.displayName);
    s.version.totalCost = totals.totalCost;
    return delay(clone(s.version));
  }

  public async saveContent(versionId: number, doc: BudgetDoc, totals: BudgetTotalsInput, actor: CurrentUser, etag?: string): Promise<BudgetVersion> {
    const s = this.require(versionId);
    const project = await this.requireProject(s.version.projectNumber);
    requireBudgetStatus(s.version, [BudgetVersionStatus.Koncept], 'Uložit rozpočet');
    if (!canEditBudget(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Rozpočet smí upravovat jen projektový manažer, asistent, vedení nebo administrátor.');
    }
    if (etag !== undefined && etag !== String(s.version.modified ? s.version.modified.getTime() : 0)) {
      throw new WorkflowError('Rozpočet mezitím někdo jiný změnil. Načtěte ho znovu — jinak byste přepsali cizí změnu.');
    }
    const issues = validateBudget(doc, false);
    if (issues.length > 0) {
      throw new WorkflowError(issues.map((i) => i.message).join(' '));
    }
    s.json = budgetToJson(doc);
    s.version = { ...s.version, totalCost: totals.totalCost, modified: new Date(Date.now() + 1) };
    this.record(s, actor, 'Rozpočet uložen');
    return delay(clone(s.version));
  }

  public async submit(versionId: number, actor: CurrentUser): Promise<BudgetVersion> {
    const s = this.require(versionId);
    const project = await this.requireProject(s.version.projectNumber);
    requireBudgetStatus(s.version, [BudgetVersionStatus.Koncept], 'Odeslat ke schválení');
    if (!canEditBudget(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Ke schválení smí rozpočet odeslat jen projektový manažer, asistent, vedení nebo administrátor.');
    }
    const issues = validateBudget(budgetFromJson(s.json), true);
    if (issues.length > 0) {
      throw new WorkflowError(`Rozpočet nejde odeslat: ${issues.slice(0, 3).map((i) => i.message).join(' ')}`);
    }
    s.version = { ...s.version, status: BudgetVersionStatus.KeSchvaleni, comment: undefined, modified: new Date() };
    this.record(s, actor, 'Odesláno ke schválení');
    return delay(clone(s.version));
  }

  public async approve(versionId: number, comment: string | undefined, actor: CurrentUser): Promise<BudgetVersion> {
    const s = this.require(versionId);
    requireBudgetStatus(s.version, [BudgetVersionStatus.KeSchvaleni], 'Schválit rozpočet');
    if (!canApproveBudget(toActor(actor))) {
      throw new WorkflowError('Rozpočet schvaluje vedení (nebo administrátor).');
    }
    s.version = { ...s.version, status: BudgetVersionStatus.Schvaleno, approvedByName: actor.displayName, approvedAt: new Date(), comment: comment || undefined, modified: new Date() };
    this.record(s, actor, `Schváleno (baseline verze ${s.version.versionNo})${comment ? `: ${comment}` : ''}`);
    return delay(clone(s.version));
  }

  public async returnToDraft(versionId: number, comment: string, actor: CurrentUser): Promise<BudgetVersion> {
    const s = this.require(versionId);
    const project = await this.requireProject(s.version.projectNumber);
    requireBudgetStatus(s.version, [BudgetVersionStatus.KeSchvaleni], 'Vrátit rozpočet do konceptu');
    const approver = canApproveBudget(toActor(actor));
    if (!approver && !canEditBudget(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Rozpočet smí vrátit vedení, nebo ho předkladatel stáhnout zpět.');
    }
    if (approver && (comment || '').trim() === '') {
      throw new WorkflowError('Při vrácení rozpočtu napište důvod.');
    }
    s.version = { ...s.version, status: BudgetVersionStatus.Koncept, comment: comment.trim() || undefined, modified: new Date() };
    this.record(s, actor, comment.trim() ? `Vráceno do konceptu: ${comment.trim()}` : 'Staženo zpět do konceptu');
    return delay(clone(s.version));
  }

  public history(versionId: number): Promise<BudgetHistoryEntry[]> {
    return delay(this.require(versionId).log.map((h) => ({ ...h })));
  }

  private record(s: Stored, actor: CurrentUser, action: string): void {
    s.log.push({ action, byName: actor.displayName, at: new Date() });
  }

  private require(id: number): Stored {
    const s = this.stored.filter((x) => x.version.id === id)[0];
    if (!s) {
      throw new WorkflowError('Verze rozpočtu nebyla nalezena. Nejspíš k ní nemáte oprávnění.');
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
