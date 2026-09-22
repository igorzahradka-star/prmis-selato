/**
 * Smluvní termíny a položky harmonogramu v seznamu PRM_Tasks.
 *
 * Ve Fázi 1 se přes tento repozitář vedou jen **smluvní termíny plnění**
 * jako milníky. Zbytek polí (WBS, předchůdci, baseline, kritická cesta)
 * naplní Fáze 4.
 *
 * Po každé změně se přepočítá `NextDeadline` na projektu. Je to cache:
 * dashboard potřebuje nejbližší termín u stovek projektů naráz a načítat
 * kvůli tomu všechny položky harmonogramu by ho položilo.
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { ProjectTask, TaskType } from '../../core/types';
import { toDate } from '../../core/format';
import { nextContractualDeadline, sortDeadlines } from '../../core/deadlines';
import { ITaskRepository, TaskInput } from '../repositories';
import { getSp, describeSpError } from './spContext';
import { escapeODataString } from './spSettingsRepository';
import { SPFI } from '@pnp/sp';

const TASKS_LIST = 'PRM_Tasks';
const PROJECTS_LIST = 'PRM_Projects';

const SELECT_FIELDS = [
  'Id',
  'Title',
  'Project/ProjectNumber',
  'TaskType',
  'StartDate',
  'FinishDate',
  'IsContractualDeadline',
  'PercentComplete',
  'Responsible/Title',
  'SortOrder'
];

const EXPAND_FIELDS = ['Project', 'Responsible'];

interface TaskItem {
  Id: number;
  Title: string;
  Project?: { ProjectNumber: string };
  TaskType?: string;
  StartDate?: string;
  FinishDate?: string;
  IsContractualDeadline?: boolean;
  PercentComplete?: number;
  Responsible?: { Title: string };
  SortOrder?: number;
}

export class SpTaskRepository implements ITaskRepository {
  public constructor(private readonly context: WebPartContext) {}

  public async listByProject(projectNumber: string): Promise<ProjectTask[]> {
    try {
      const sp = getSp(this.context);
      const items: TaskItem[] = await sp.web.lists
        .getByTitle(TASKS_LIST)
        .items.select(...SELECT_FIELDS)
        .expand(...EXPAND_FIELDS)
        .filter(`Project/ProjectNumber eq '${escapeODataString(projectNumber)}'`)
        .top(500)();
      return sortDeadlines(items.map(mapTask));
    } catch (error) {
      throw new Error(describeSpError(error, `Nepodařilo se načíst termíny projektu ${projectNumber}`));
    }
  }

  public async create(projectNumber: string, input: TaskInput): Promise<ProjectTask> {
    const sp = getSp(this.context);
    const projectId = await this.resolveProjectId(sp, projectNumber);

    let newId: number | undefined;
    try {
      const added = await sp.web.lists.getByTitle(TASKS_LIST).items.add({
        ...(await this.toFields(sp, input)),
        ProjectId: projectId
      });
      newId = extractAddedId(added);
    } catch (error) {
      throw new Error(describeSpError(error, 'Nepodařilo se uložit termín'));
    }

    await this.refreshNextDeadline(projectNumber);
    return { id: newId ?? 0, projectNumber, ...input };
  }

  public async update(id: number, input: TaskInput): Promise<ProjectTask> {
    const sp = getSp(this.context);
    const projectNumber = await this.projectNumberOf(sp, id);

    try {
      await sp.web.lists.getByTitle(TASKS_LIST).items.getById(id).update(await this.toFields(sp, input));
    } catch (error) {
      throw new Error(describeSpError(error, 'Nepodařilo se uložit změnu termínu'));
    }

    await this.refreshNextDeadline(projectNumber);
    return { id, projectNumber, ...input };
  }

  public async remove(id: number): Promise<void> {
    const sp = getSp(this.context);
    const projectNumber = await this.projectNumberOf(sp, id);

    try {
      // Do koše, ne natrvalo — stejně jako u projektu.
      await sp.web.lists.getByTitle(TASKS_LIST).items.getById(id).recycle();
    } catch (error) {
      throw new Error(describeSpError(error, 'Nepodařilo se smazat termín'));
    }

    await this.refreshNextDeadline(projectNumber);
  }

  /**
   * Přepočítá a uloží `NextDeadline` projektu.
   *
   * Selhání se **nepropisuje ven**: termín už je uložený a shodit kvůli
   * neaktuální cache celou operaci by uživatele mátlo. Dashboard ukáže
   * starou hodnotu do příštího přepočtu.
   */
  private async refreshNextDeadline(projectNumber: string): Promise<void> {
    try {
      const tasks = await this.listByProject(projectNumber);
      const next = nextContractualDeadline(tasks);
      const sp = getSp(this.context);
      const projectId = await this.resolveProjectId(sp, projectNumber);
      await sp.web.lists
        .getByTitle(PROJECTS_LIST)
        .items.getById(projectId)
        .update({ NextDeadline: next ? next.toISOString() : null });
    } catch {
      // Cache se dorovná při příští změně termínu.
    }
  }

  private async toFields(sp: SPFI, input: TaskInput): Promise<Record<string, unknown>> {
    return {
      Title: input.title,
      TaskType: input.taskType,
      StartDate: input.startDate ? input.startDate.toISOString() : null,
      FinishDate: input.finishDate ? input.finishDate.toISOString() : null,
      IsContractualDeadline: input.isContractualDeadline,
      PercentComplete: input.percentComplete,
      ResponsibleId: input.responsibleName ? await this.resolveUserId(sp, input.responsibleName) : null
    };
  }

  private async resolveProjectId(sp: SPFI, projectNumber: string): Promise<number> {
    const items: { Id: number }[] = await sp.web.lists
      .getByTitle(PROJECTS_LIST)
      .items.select('Id')
      .filter(`ProjectNumber eq '${escapeODataString(projectNumber)}'`)
      .top(1)();
    if (items.length === 0) {
      throw new Error(`Projekt ${projectNumber} nebyl nalezen.`);
    }
    return items[0].Id;
  }

  private async projectNumberOf(sp: SPFI, taskId: number): Promise<string> {
    const item: TaskItem = await sp.web.lists
      .getByTitle(TASKS_LIST)
      .items.getById(taskId)
      .select('Id', 'Project/ProjectNumber')
      .expand('Project')();
    const number = item.Project?.ProjectNumber;
    if (!number) {
      throw new Error('Termín není navázaný na žádný projekt.');
    }
    return number;
  }

  /** Najde ID uživatele webu podle zobrazovaného jména — pro sloupec typu Osoba. */
  private async resolveUserId(sp: SPFI, displayName: string): Promise<number | undefined> {
    const users: { Id: number }[] = await sp.web.siteUsers
      .select('Id')
      .filter(`Title eq '${escapeODataString(displayName)}'`)
      .top(1)();
    // Odpovědná osoba je nepovinná — když se nenajde, termín se uloží bez ní.
    return users.length > 0 ? users[0].Id : undefined;
  }
}

/** Převede položku seznamu na doménový objekt. */
export function mapTask(item: TaskItem): ProjectTask {
  return {
    id: item.Id,
    projectNumber: item.Project?.ProjectNumber ?? '',
    title: item.Title,
    taskType: (item.TaskType as TaskType) ?? TaskType.Cinnost,
    startDate: toDate(item.StartDate),
    finishDate: toDate(item.FinishDate),
    isContractualDeadline: item.IsContractualDeadline === true,
    percentComplete: item.PercentComplete ?? 0,
    responsibleName: item.Responsible?.Title,
    sortOrder: item.SortOrder
  };
}

function extractAddedId(added: unknown): number | undefined {
  const a = added as { data?: { Id?: number }; Id?: number };
  return a?.data?.Id ?? a?.Id;
}
