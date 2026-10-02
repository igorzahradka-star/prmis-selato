/**
 * Realizační rozpočet v SharePointu — seznam PRM_BudgetVersions. Jedna položka seznamu = jedna verze rozpočtu; obsah
 * (skupiny a položky) je jeden JSON ve sloupci Content. Seznam verzí se čte **bez obsahu**, ať je rychlý.
 *
 * Zápis hlídá ETag (souběžná úprava), stav a oprávnění se rozhodují v `core/budget` — skutečná ochrana jsou oprávnění seznamu.
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { CurrentUser, Project } from '../../core/types';
import { toDate } from '../../core/format';
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
import { getSp, describeSpError, extractStatus } from './spContext';
import { extractEtag } from './spProjectRepository';
import { escapeODataString } from './spSettingsRepository';

const LIST = 'PRM_BudgetVersions';
const AUDIT_LIST = 'PRM_AuditLog';
const AUDIT_ENTITY = 'Rozpočet';

const LIST_FIELDS = ['Id', 'Title', 'Project/Id', 'Project/ProjectNumber', 'VersionNo', 'VersionStatus', 'ApprovedBy/Title', 'ApprovedDate', 'Comment', 'TotalCost', 'Author/Title', 'Created', 'Modified'];

interface VersionItem {
  Id: number;
  Project?: { Id: number; ProjectNumber: string };
  VersionNo?: number;
  VersionStatus?: string;
  ApprovedBy?: { Title: string };
  ApprovedDate?: string;
  Comment?: string;
  TotalCost?: number;
  Author?: { Title: string };
  Created?: string;
  Modified?: string;
  Content?: string;
}

const MISSING_HINT =
  'Seznam verzí rozpočtu na webu nemá všechny sloupce, které aplikace potřebuje. ' +
  'Otevřete Instalace a diagnostika a doplňte chybějící části (přidá jen sloupce, nic nesmaže).';

function explain(error: unknown, context: string): string {
  if (extractStatus(error) === 400) {
    return `${context}. ${MISSING_HINT}`;
  }
  return describeSpError(error, context);
}

function mapVersion(item: VersionItem): BudgetVersion {
  const status = item.VersionStatus === BudgetVersionStatus.KeSchvaleni || item.VersionStatus === BudgetVersionStatus.Schvaleno ? (item.VersionStatus as BudgetVersionStatus) : BudgetVersionStatus.Koncept;
  return {
    id: item.Id,
    projectNumber: item.Project?.ProjectNumber ?? '',
    versionNo: item.VersionNo ?? 0,
    status,
    createdByName: item.Author?.Title,
    approvedByName: item.ApprovedBy?.Title,
    approvedAt: toDate(item.ApprovedDate),
    comment: item.Comment || undefined,
    totalCost: item.TotalCost ?? undefined,
    created: toDate(item.Created),
    modified: toDate(item.Modified)
  };
}

export class SpBudgetRepository implements IBudgetRepository {
  public constructor(
    private readonly context: WebPartContext,
    private readonly projects: IProjectRepository
  ) {}

  public async listVersions(projectNumber: string): Promise<BudgetVersion[]> {
    try {
      const sp = getSp(this.context);
      const project = await this.requireProject(projectNumber);
      const items: VersionItem[] = await sp.web.lists
        .getByTitle(LIST)
        .items.select(...LIST_FIELDS)
        .expand('Project', 'ApprovedBy', 'Author')
        .filter(`Project/Id eq ${project.id}`)
        .top(200)();
      return items.map(mapVersion).sort((a, b) => b.versionNo - a.versionNo);
    } catch (error) {
      if (error instanceof WorkflowError) {
        throw error;
      }
      throw new Error(explain(error, 'Nepodařilo se načíst verze rozpočtu'));
    }
  }

  public async getContent(versionId: number): Promise<{ version: BudgetVersion; doc: BudgetDoc; etag?: string }> {
    const { item, etag } = await this.load(versionId);
    return { version: mapVersion(item), doc: budgetFromJson(item.Content), etag };
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
    const versionNo = nextVersionNo(versions);
    let newId: number | undefined;
    try {
      const sp = getSp(this.context);
      const added = await sp.web.lists.getByTitle(LIST).items.add({
        Title: `${projectNumber} · verze ${versionNo}`,
        ProjectId: project.id,
        VersionNo: versionNo,
        VersionStatus: BudgetVersionStatus.Koncept,
        TotalCost: totals.totalCost,
        TotalSale: totals.totalSale,
        Content: budgetToJson(doc)
      });
      const a = added as { data?: { Id?: number }; Id?: number };
      newId = a?.data?.Id ?? a?.Id;
    } catch (error) {
      throw new Error(explain(error, 'Verzi rozpočtu se nepodařilo založit'));
    }
    if (newId === undefined) {
      throw new Error('Verze se uložila, ale SharePoint nevrátil její číslo položky. Načtěte rozpočet znovu.');
    }
    await this.audit(projectNumber, versionNo, actor, 'Založena verze rozpočtu', undefined, BudgetVersionStatus.Koncept);
    return mapVersion((await this.load(newId)).item);
  }

  public async saveContent(versionId: number, doc: BudgetDoc, totals: BudgetTotalsInput, actor: CurrentUser, etag?: string): Promise<BudgetVersion> {
    const { item, etag: current } = await this.load(versionId);
    const version = mapVersion(item);
    const project = await this.requireProject(version.projectNumber);
    requireBudgetStatus(version, [BudgetVersionStatus.Koncept], 'Uložit rozpočet');
    if (!canEditBudget(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Rozpočet smí upravovat jen projektový manažer, asistent, vedení nebo administrátor.');
    }
    const issues = validateBudget(doc, false);
    if (issues.length > 0) {
      throw new WorkflowError(issues.map((i) => i.message).join(' '));
    }
    await this.write(versionId, { Content: budgetToJson(doc), TotalCost: totals.totalCost, TotalSale: totals.totalSale }, etag ?? current, 'Rozpočet se nepodařilo uložit');
    await this.audit(version.projectNumber, version.versionNo, actor, 'Rozpočet uložen', version.status, version.status);
    return mapVersion((await this.load(versionId)).item);
  }

  public async submit(versionId: number, actor: CurrentUser): Promise<BudgetVersion> {
    const { item, etag } = await this.load(versionId);
    const version = mapVersion(item);
    const project = await this.requireProject(version.projectNumber);
    requireBudgetStatus(version, [BudgetVersionStatus.Koncept], 'Odeslat ke schválení');
    if (!canEditBudget(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Ke schválení smí rozpočet odeslat jen projektový manažer, asistent, vedení nebo administrátor.');
    }
    const issues = validateBudget(budgetFromJson(item.Content), true);
    if (issues.length > 0) {
      throw new WorkflowError(`Rozpočet nejde odeslat: ${issues.slice(0, 3).map((i) => i.message).join(' ')}`);
    }
    await this.write(versionId, { VersionStatus: BudgetVersionStatus.KeSchvaleni, Comment: '' }, etag, 'Rozpočet se nepodařilo odeslat ke schválení');
    await this.audit(version.projectNumber, version.versionNo, actor, 'Odesláno ke schválení', version.status, BudgetVersionStatus.KeSchvaleni);
    return mapVersion((await this.load(versionId)).item);
  }

  public async approve(versionId: number, comment: string | undefined, actor: CurrentUser): Promise<BudgetVersion> {
    const { item, etag } = await this.load(versionId);
    const version = mapVersion(item);
    requireBudgetStatus(version, [BudgetVersionStatus.KeSchvaleni], 'Schválit rozpočet');
    if (!canApproveBudget(toActor(actor))) {
      throw new WorkflowError('Rozpočet schvaluje vedení (nebo administrátor).');
    }
    await this.write(
      versionId,
      { VersionStatus: BudgetVersionStatus.Schvaleno, ApprovedById: actor.id, ApprovedDate: new Date().toISOString(), Comment: comment || '' },
      etag,
      'Rozpočet se nepodařilo schválit'
    );
    await this.audit(version.projectNumber, version.versionNo, actor, `Schváleno (baseline verze ${version.versionNo})${comment ? `: ${comment}` : ''}`, version.status, BudgetVersionStatus.Schvaleno);
    return mapVersion((await this.load(versionId)).item);
  }

  public async returnToDraft(versionId: number, comment: string, actor: CurrentUser): Promise<BudgetVersion> {
    const { item, etag } = await this.load(versionId);
    const version = mapVersion(item);
    const project = await this.requireProject(version.projectNumber);
    requireBudgetStatus(version, [BudgetVersionStatus.KeSchvaleni], 'Vrátit rozpočet do konceptu');
    const approver = canApproveBudget(toActor(actor));
    if (!approver && !canEditBudget(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Rozpočet smí vrátit vedení, nebo ho předkladatel stáhnout zpět.');
    }
    if (approver && (comment || '').trim() === '') {
      throw new WorkflowError('Při vrácení rozpočtu napište důvod.');
    }
    const text = (comment || '').trim();
    await this.write(versionId, { VersionStatus: BudgetVersionStatus.Koncept, Comment: text }, etag, 'Rozpočet se nepodařilo vrátit do konceptu');
    await this.audit(version.projectNumber, version.versionNo, actor, text ? `Vráceno do konceptu: ${text}` : 'Staženo zpět do konceptu', version.status, BudgetVersionStatus.Koncept);
    return mapVersion((await this.load(versionId)).item);
  }

  public async history(versionId: number): Promise<BudgetHistoryEntry[]> {
    try {
      const { item } = await this.load(versionId);
      const v = mapVersion(item);
      const sp = getSp(this.context);
      const rows: { Action?: string; PerformedAt?: string; PerformedBy?: { Title: string } }[] = await sp.web.lists
        .getByTitle(AUDIT_LIST)
        .items.select('Action', 'PerformedAt', 'PerformedBy/Title')
        .expand('PerformedBy')
        .filter(`EntityType eq '${AUDIT_ENTITY}' and EntityId eq '${escapeODataString(auditId(v.projectNumber, v.versionNo))}'`)
        .orderBy('Id', true)
        .top(200)();
      return rows.map((r) => ({ action: r.Action ?? '', byName: r.PerformedBy?.Title ?? '—', at: toDate(r.PerformedAt) }));
    } catch (error) {
      throw new Error(describeSpError(error, 'Nepodařilo se načíst historii rozpočtu'));
    }
  }

  // --- vnitřní ---

  private async load(id: number): Promise<{ item: VersionItem; etag?: string }> {
    try {
      const sp = getSp(this.context);
      const item: VersionItem = await sp.web.lists
        .getByTitle(LIST)
        .items.getById(id)
        .select(...LIST_FIELDS, 'Content')
        .expand('Project', 'ApprovedBy', 'Author')();
      return { item, etag: extractEtag(item) };
    } catch (error) {
      if (extractStatus(error) === 404) {
        throw new WorkflowError('Verze rozpočtu nebyla nalezena. Nejspíš ji někdo smazal, nebo k ní nemáte oprávnění.');
      }
      throw new Error(explain(error, `Nepodařilo se načíst verzi rozpočtu č. ${id}`));
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

  private async audit(projectNumber: string, versionNo: number, actor: CurrentUser, action: string, oldStatus: string | undefined, newStatus: string): Promise<void> {
    try {
      const sp = getSp(this.context);
      await sp.web.lists.getByTitle(AUDIT_LIST).items.add({
        Title: `Rozpočet ${projectNumber} v${versionNo}`,
        EntityType: AUDIT_ENTITY,
        EntityId: auditId(projectNumber, versionNo),
        Action: action.length > 250 ? `${action.slice(0, 247)}…` : action,
        PerformedById: actor.id,
        PerformedAt: new Date().toISOString(),
        OldValue: oldStatus ?? '',
        NewValue: newStatus
      });
    } catch (error) {
      throw new Error(describeSpError(error, `Nepodařilo se zapsat audit rozpočtu ${projectNumber} v${versionNo}`));
    }
  }
}

/** Identifikátor verze v auditním logu. */
function auditId(projectNumber: string, versionNo: number): string {
  return `RR-${projectNumber}-v${versionNo}`;
}
