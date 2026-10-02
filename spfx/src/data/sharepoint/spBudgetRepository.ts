/**
 * Realizační rozpočet v SharePointu — seznam PRM_BudgetVersions. Na projekt je jedna položka seznamu = jeden rozpočet;
 * obsah (skupiny, položky, sazby profesí) je jeden JSON ve sloupci Content, historie schválení JSON ve sloupci Approvals.
 *
 * Zápis hlídá ETag (souběžná úprava); oprávnění a stav se rozhodují v `core/budget` — skutečná ochrana jsou oprávnění seznamu.
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { CurrentUser, Project } from '../../core/types';
import { toDate } from '../../core/format';
import {
  BudgetApproval,
  BudgetDoc,
  BudgetRecord,
  BudgetStatus,
  approvalsFromJson,
  approvalsToJson,
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
import { getSp, describeSpError, extractStatus } from './spContext';
import { extractEtag } from './spProjectRepository';
import { escapeODataString } from './spSettingsRepository';

const LIST = 'PRM_BudgetVersions';
const AUDIT_LIST = 'PRM_AuditLog';
const AUDIT_ENTITY = 'Rozpočet';

const FIELDS = ['Id', 'Title', 'Project/Id', 'Project/ProjectNumber', 'VersionNo', 'VersionStatus', 'Comment', 'RequestedByName', 'RequestedAt', 'Created', 'Modified', 'Approvals', 'Content'];

interface BudgetItem {
  Id: number;
  Project?: { Id: number; ProjectNumber: string };
  VersionNo?: number;
  VersionStatus?: string;
  Comment?: string;
  RequestedByName?: string;
  RequestedAt?: string;
  Approvals?: string;
  Content?: string;
  Created?: string;
  Modified?: string;
}

const MISSING_HINT =
  'Seznam rozpočtů na webu nemá všechny sloupce, které aplikace potřebuje. ' +
  'Otevřete Instalace a diagnostika a doplňte chybějící části (přidá jen sloupce, nic nesmaže).';

function explain(error: unknown, context: string): string {
  if (extractStatus(error) === 400) {
    return `${context}. ${MISSING_HINT}`;
  }
  return describeSpError(error, context);
}

function mapRecord(item: BudgetItem): BudgetRecord {
  const status = item.VersionStatus === BudgetStatus.KeSchvaleni || item.VersionStatus === BudgetStatus.Schvaleno ? (item.VersionStatus as BudgetStatus) : BudgetStatus.Koncept;
  return {
    id: item.Id,
    projectNumber: item.Project?.ProjectNumber ?? '',
    status,
    requestedByName: item.RequestedByName || undefined,
    requestedAt: toDate(item.RequestedAt),
    comment: item.Comment || undefined,
    approvals: approvalsFromJson(item.Approvals),
    created: toDate(item.Created),
    modified: toDate(item.Modified)
  };
}

export class SpBudgetRepository implements IBudgetRepository {
  public constructor(
    private readonly context: WebPartContext,
    private readonly projects: IProjectRepository
  ) {}

  public async get(projectNumber: string): Promise<{ record: BudgetRecord; doc: BudgetDoc; etag?: string } | undefined> {
    const project = await this.requireProject(projectNumber);
    try {
      const sp = getSp(this.context);
      const items: BudgetItem[] = await sp.web.lists
        .getByTitle(LIST)
        .items.select(...FIELDS)
        .expand('Project')
        .filter(`Project/Id eq ${project.id}`)
        .top(50)();
      if (items.length === 0) {
        return undefined;
      }
      // Starší verze aplikace zakládala víc verzí — bere se ta s nejvyšším číslem (a při shodě nejnovější).
      const item = items.sort((a, b) => (b.VersionNo ?? 0) - (a.VersionNo ?? 0) || b.Id - a.Id)[0];
      return { record: mapRecord(item), doc: budgetFromJson(item.Content), etag: extractEtag(item) };
    } catch (error) {
      throw new Error(explain(error, 'Nepodařilo se načíst rozpočet projektu'));
    }
  }

  public async create(projectNumber: string, doc: BudgetDoc, totals: BudgetTotalsInput, actor: CurrentUser): Promise<BudgetRecord> {
    const project = await this.requireProject(projectNumber);
    if (!canEditBudget(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Na tomto projektu nemáte oprávnění upravovat rozpočet (na Režii se rozpočet nevede).');
    }
    if (await this.get(projectNumber)) {
      throw new WorkflowError('Projekt už rozpočet má. Načtěte stránku znovu.');
    }
    let newId: number | undefined;
    try {
      const sp = getSp(this.context);
      const added = await sp.web.lists.getByTitle(LIST).items.add({
        Title: `${projectNumber} · rozpočet`,
        ProjectId: project.id,
        VersionNo: 1,
        VersionStatus: BudgetStatus.Koncept,
        TotalCost: totals.totalCost,
        TotalSale: totals.totalSale,
        Content: budgetToJson(doc),
        Approvals: approvalsToJson([])
      });
      const a = added as { data?: { Id?: number }; Id?: number };
      newId = a?.data?.Id ?? a?.Id;
    } catch (error) {
      throw new Error(explain(error, 'Rozpočet se nepodařilo založit'));
    }
    if (newId === undefined) {
      throw new Error('Rozpočet se uložil, ale SharePoint nevrátil číslo položky. Načtěte stránku znovu.');
    }
    await this.audit(projectNumber, actor, 'Založen rozpočet', undefined, BudgetStatus.Koncept);
    return mapRecord((await this.load(newId)).item);
  }

  public async save(recordId: number, doc: BudgetDoc, totals: BudgetTotalsInput, actor: CurrentUser, etag?: string): Promise<BudgetRecord> {
    const { item, etag: current } = await this.load(recordId);
    const record = mapRecord(item);
    const project = await this.requireProject(record.projectNumber);
    if (!canEditBudget(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Rozpočet smí upravovat jen projektový manažer, asistent, vedení nebo administrátor.');
    }
    const issues = validateBudget(doc, false);
    if (issues.length > 0) {
      throw new WorkflowError(issues.map((i) => i.message).join(' '));
    }
    await this.write(recordId, { Content: budgetToJson(doc), TotalCost: totals.totalCost, TotalSale: totals.totalSale }, etag ?? current, 'Rozpočet se nepodařilo uložit');
    await this.audit(record.projectNumber, actor, 'Rozpočet uložen', record.status, record.status);
    return mapRecord((await this.load(recordId)).item);
  }

  public async requestApproval(recordId: number, actor: CurrentUser): Promise<BudgetRecord> {
    const { item, etag } = await this.load(recordId);
    const record = mapRecord(item);
    const project = await this.requireProject(record.projectNumber);
    if (record.status === BudgetStatus.KeSchvaleni) {
      throw new WorkflowError('Žádost o schválení už byla podána.');
    }
    if (!canEditBudget(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('O schválení smí požádat jen projektový manažer, asistent, vedení nebo administrátor.');
    }
    const issues = validateBudget(budgetFromJson(item.Content), true);
    if (issues.length > 0) {
      throw new WorkflowError(`O schválení nejde požádat: ${issues.slice(0, 3).map((i) => i.message).join(' ')}`);
    }
    await this.write(recordId, { VersionStatus: BudgetStatus.KeSchvaleni, RequestedByName: actor.displayName, RequestedAt: new Date().toISOString(), Comment: '' }, etag, 'Žádost o schválení se nepodařilo podat');
    await this.audit(record.projectNumber, actor, 'Požádáno o schválení', record.status, BudgetStatus.KeSchvaleni);
    return mapRecord((await this.load(recordId)).item);
  }

  public async approve(recordId: number, totals: BudgetTotalsInput, comment: string | undefined, actor: CurrentUser): Promise<BudgetRecord> {
    const { item, etag } = await this.load(recordId);
    const record = mapRecord(item);
    if (record.status !== BudgetStatus.KeSchvaleni) {
      throw new WorkflowError('Schvalovat jde jen rozpočet, o jehož schválení někdo požádal.');
    }
    if (!canApproveBudget(toActor(actor))) {
      throw new WorkflowError('Rozpočet schvaluje vedení (nebo administrátor).');
    }
    const no = record.approvals.length + 1;
    const approval: BudgetApproval = {
      no,
      at: new Date(),
      byName: actor.displayName,
      comment: comment || undefined,
      cost: totals.totalCost,
      sale: totals.totalSale,
      marginPercent: marginPercent(totals.totalCost, totals.totalSale)
    };
    await this.write(
      recordId,
      { VersionStatus: BudgetStatus.Schvaleno, Approvals: approvalsToJson([...record.approvals, approval]), ApprovedById: actor.id, ApprovedDate: new Date().toISOString(), Comment: comment || '', RequestedByName: '' },
      etag,
      'Rozpočet se nepodařilo schválit'
    );
    await this.audit(record.projectNumber, actor, `Schváleno (záznam č. ${no})${comment ? `: ${comment}` : ''}`, record.status, BudgetStatus.Schvaleno);
    return mapRecord((await this.load(recordId)).item);
  }

  public async reject(recordId: number, comment: string, actor: CurrentUser): Promise<BudgetRecord> {
    const { item, etag } = await this.load(recordId);
    const record = mapRecord(item);
    const project = await this.requireProject(record.projectNumber);
    if (record.status !== BudgetStatus.KeSchvaleni) {
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
    const next = statusAfterReject(record);
    await this.write(recordId, { VersionStatus: next, Comment: approver ? text : '', RequestedByName: '' }, etag, 'Žádost se nepodařilo vrátit');
    await this.audit(record.projectNumber, actor, approver ? `Vráceno k úpravě: ${text}` : 'Žádost o schválení stažena zpět', record.status, next);
    return mapRecord((await this.load(recordId)).item);
  }

  public async history(recordId: number): Promise<BudgetHistoryEntry[]> {
    try {
      const { item } = await this.load(recordId);
      const record = mapRecord(item);
      const sp = getSp(this.context);
      const rows: { Action?: string; PerformedAt?: string; PerformedBy?: { Title: string } }[] = await sp.web.lists
        .getByTitle(AUDIT_LIST)
        .items.select('Action', 'PerformedAt', 'PerformedBy/Title')
        .expand('PerformedBy')
        .filter(`EntityType eq '${AUDIT_ENTITY}' and EntityId eq '${escapeODataString(auditId(record.projectNumber))}'`)
        .orderBy('Id', true)
        .top(300)();
      return rows.map((r) => ({ action: r.Action ?? '', byName: r.PerformedBy?.Title ?? '—', at: toDate(r.PerformedAt) }));
    } catch (error) {
      throw new Error(describeSpError(error, 'Nepodařilo se načíst historii rozpočtu'));
    }
  }

  // --- vnitřní ---

  private async load(id: number): Promise<{ item: BudgetItem; etag?: string }> {
    try {
      const sp = getSp(this.context);
      const item: BudgetItem = await sp.web.lists
        .getByTitle(LIST)
        .items.getById(id)
        .select(...FIELDS)
        .expand('Project')();
      return { item, etag: extractEtag(item) };
    } catch (error) {
      if (extractStatus(error) === 404) {
        throw new WorkflowError('Rozpočet nebyl nalezen. Nejspíš ho někdo smazal, nebo k němu nemáte oprávnění.');
      }
      throw new Error(explain(error, `Nepodařilo se načíst rozpočet č. ${id}`));
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
        throw new WorkflowError('Rozpočet mezitím někdo jiný změnil. Načtěte ho znovu a akci zopakujte — jinak byste přepsali cizí změnu.');
      }
      throw new Error(explain(error, context));
    }
  }

  private async audit(projectNumber: string, actor: CurrentUser, action: string, oldStatus: string | undefined, newStatus: string): Promise<void> {
    try {
      const sp = getSp(this.context);
      await sp.web.lists.getByTitle(AUDIT_LIST).items.add({
        Title: `Rozpočet ${projectNumber}`,
        EntityType: AUDIT_ENTITY,
        EntityId: auditId(projectNumber),
        Action: action.length > 250 ? `${action.slice(0, 247)}…` : action,
        PerformedById: actor.id,
        PerformedAt: new Date().toISOString(),
        OldValue: oldStatus ?? '',
        NewValue: newStatus
      });
    } catch (error) {
      throw new Error(describeSpError(error, `Nepodařilo se zapsat audit rozpočtu ${projectNumber}`));
    }
  }
}

/** Identifikátor rozpočtu v auditním logu. */
function auditId(projectNumber: string): string {
  return `RR-${projectNumber}`;
}
