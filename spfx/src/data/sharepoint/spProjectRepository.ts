/**
 * Čtení zakázek ze seznamu PRM_Projects.
 *
 * Ve Fázi 0 jen čtení — zakládání zakázek, číselné řady a složky přijdou ve Fázi 1.
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { BudgetStatus, Project, ProjectStatus } from '../../core/types';
import { toDate } from '../../core/format';
import { IProjectRepository, ProjectFilter } from '../repositories';
import { getSp, describeSpError } from './spContext';
import { escapeODataString } from './spSettingsRepository';

const PROJECTS_LIST = 'PRM_Projects';

/**
 * Sloupce, které dashboard potřebuje. Načítáme jen je — načítání všech
 * sloupců by u 500 zakázek dashboard zpomalilo nad limit 2 s ze zadání.
 */
const SELECT_FIELDS = [
  'Id',
  'Title',
  'ProjectNumber',
  'ShortName',
  'Customer/Title',
  'ProjectManager/Title',
  'ProjectManager/Name',
  'ProjectStatus',
  'ProjectType',
  'ProjectYear',
  'Location',
  'ContractPriceNet',
  'Currency',
  'StartDate',
  'EndDatePlanned',
  'EndDateActual',
  'NextDeadline',
  'FolderUrl',
  'IsOverhead',
  'BudgetStatus',
  'BudgetBaselineTotal',
  'CostForecastTotal'
];

const EXPAND_FIELDS = ['Customer', 'ProjectManager'];

interface ProjectItem {
  Id: number;
  Title: string;
  ProjectNumber: string;
  ShortName?: string;
  Customer?: { Title: string };
  ProjectManager?: { Title: string; Name: string };
  ProjectStatus?: string;
  ProjectType?: string;
  ProjectYear?: number;
  Location?: string;
  ContractPriceNet?: number;
  Currency?: string;
  StartDate?: string;
  EndDatePlanned?: string;
  EndDateActual?: string;
  NextDeadline?: string;
  FolderUrl?: { Url: string };
  IsOverhead?: boolean;
  BudgetStatus?: string;
  BudgetBaselineTotal?: number;
  CostForecastTotal?: number;
}

export class SpProjectRepository implements IProjectRepository {
  public constructor(
    private readonly context: WebPartContext,
    /** Přihlašovací jméno uživatele — pro filtr „moje zakázky". */
    private readonly currentUserId: number
  ) {}

  public async list(filter?: ProjectFilter): Promise<Project[]> {
    try {
      const sp = getSp(this.context);
      let query = sp.web.lists
        .getByTitle(PROJECTS_LIST)
        .items.select(...SELECT_FIELDS)
        .expand(...EXPAND_FIELDS)
        .orderBy('ProjectNumber', false)
        .top(2000);

      const odata = buildProjectFilter(filter, this.currentUserId);
      if (odata) {
        query = query.filter(odata);
      }

      const items: ProjectItem[] = await query();
      const projects = items.map(mapProject);

      // Fulltext se dělá až v prohlížeči: SharePoint umí `substringof` jen
      // na indexovaných textových sloupcích a kombinace s dalšími filtry
      // často narazí na limit 5 000 položek. Zakázek jsou stovky, ne miliony.
      const withSearch = applyTextSearch(projects, filter?.search);
      return applyPmFilter(withSearch, filter?.projectManagerNames);
    } catch (error) {
      throw new Error(describeSpError(error, 'Nepodařilo se načíst seznam zakázek'));
    }
  }

  public async getByNumber(projectNumber: string): Promise<Project | undefined> {
    try {
      const sp = getSp(this.context);
      const items: ProjectItem[] = await sp.web.lists
        .getByTitle(PROJECTS_LIST)
        .items.select(...SELECT_FIELDS)
        .expand(...EXPAND_FIELDS)
        .filter(`ProjectNumber eq '${escapeODataString(projectNumber)}'`)
        .top(1)();
      return items.length > 0 ? mapProject(items[0]) : undefined;
    } catch (error) {
      throw new Error(describeSpError(error, `Nepodařilo se načíst zakázku ${projectNumber}`));
    }
  }
}

/** Složí OData filtr. Vytaženo ven kvůli testovatelnosti. */
export function buildProjectFilter(
  filter: ProjectFilter | undefined,
  currentUserId: number
): string {
  const f = filter ?? {};
  const parts: string[] = [];

  if (!f.includeOverhead) {
    parts.push('IsOverhead eq 0');
  }
  if (f.onlyMine) {
    // Asistenti jsou UserMulti — na ně OData filtr neumí, dofiltrujeme
    // je v prohlížeči ve Fázi 1, až budou v seznamu data.
    parts.push(`ProjectManagerId eq ${currentUserId}`);
  }
  if (f.statuses && f.statuses.length > 0) {
    parts.push(
      `(${f.statuses.map((s) => `ProjectStatus eq '${escapeODataString(s)}'`).join(' or ')})`
    );
  }
  if (f.projectTypes && f.projectTypes.length > 0) {
    parts.push(
      `(${f.projectTypes.map((t) => `ProjectType eq '${escapeODataString(t)}'`).join(' or ')})`
    );
  }
  if (f.year) {
    parts.push(`ProjectYear eq ${f.year}`);
  }

  return parts.join(' and ');
}

/**
 * Filtr podle jména PM. Stejně jako u asistentů (viz `buildProjectFilter`)
 * OData filtr na zobrazované jméno z Person pole neumí, dofiltruje se tady.
 */
export function applyPmFilter(projects: Project[], names: string[] | undefined): Project[] {
  if (!names || names.length === 0) {
    return projects;
  }
  return projects.filter((p) => !!p.projectManagerName && names.indexOf(p.projectManagerName) !== -1);
}

/** Fulltext přes číslo, název, zákazníka, lokalitu a zkratku. */
export function applyTextSearch(projects: Project[], search: string | undefined): Project[] {
  if (!search || !search.trim()) {
    return projects;
  }
  const q = search.trim().toLocaleLowerCase('cs-CZ');
  return projects.filter((p) =>
    [p.projectNumber, p.title, p.customerName, p.location, p.shortName]
      .filter((v) => !!v)
      .some((v) => (v as string).toLocaleLowerCase('cs-CZ').indexOf(q) !== -1)
  );
}

/** Převede položku seznamu na doménový objekt. */
export function mapProject(item: ProjectItem): Project {
  return {
    id: item.Id,
    projectNumber: item.ProjectNumber,
    title: item.Title,
    shortName: item.ShortName,
    customerName: item.Customer?.Title,
    projectManagerName: item.ProjectManager?.Title,
    status: (item.ProjectStatus as ProjectStatus) ?? ProjectStatus.Nabidka,
    projectType: item.ProjectType,
    location: item.Location,
    contractPriceNet: item.ContractPriceNet,
    currency: item.Currency ?? 'CZK',
    startDate: toDate(item.StartDate),
    endDatePlanned: toDate(item.EndDatePlanned),
    endDateActual: toDate(item.EndDateActual),
    nextDeadline: toDate(item.NextDeadline),
    folderUrl: item.FolderUrl?.Url,
    isOverhead: item.IsOverhead === true,
    budgetStatus: (item.BudgetStatus as BudgetStatus) ?? BudgetStatus.Bez,
    budgetBaselineTotal: item.BudgetBaselineTotal,
    costForecastTotal: item.CostForecastTotal
  };
}
