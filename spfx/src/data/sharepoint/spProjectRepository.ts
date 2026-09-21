/**
 * Čtení a zakládání projektů v seznamu PRM_Projects.
 *
 * Založení projektu (kap. 8.2): přidělí číslo, uloží položku seznamu
 * a založí strukturu složek podle šablony z Nastavení (kap. 8.3). Když
 * založení složek selže, projekt zůstává uložený — jen se vrátí chyba,
 * kterou UI zobrazí s tlačítkem na nový pokus (`retryCreateFolders`).
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { BudgetStatus, Project, ProjectStatus } from '../../core/types';
import { toDate } from '../../core/format';
import { buildProjectFolderPlan } from '../../core/folders';
import {
  IProjectRepository,
  INumberingRepository,
  ISettingsRepository,
  ProjectFilter,
  NewProjectInput,
  CreateProjectResult
} from '../repositories';
import { getSp, getSpForSite, describeSpError } from './spContext';
import { escapeODataString } from './spSettingsRepository';
import { SPFI } from '@pnp/sp';

const PROJECTS_LIST = 'PRM_Projects';

/**
 * Sloupce, které dashboard potřebuje. Načítáme jen je — načítání všech
 * sloupců by u 500 projektů dashboard zpomalilo nad limit 2 s ze zadání.
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
    /** Přihlašovací jméno uživatele — pro filtr „moje projekty". */
    private readonly currentUserId: number,
    private readonly numbering: INumberingRepository,
    private readonly settings: ISettingsRepository
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
      // často narazí na limit 5 000 položek. Projektů jsou stovky, ne miliony.
      const withSearch = applyTextSearch(projects, filter?.search);
      return applyPmFilter(withSearch, filter?.projectManagerNames);
    } catch (error) {
      throw new Error(describeSpError(error, 'Nepodařilo se načíst seznam projektů'));
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
      throw new Error(describeSpError(error, `Nepodařilo se načíst projekt ${projectNumber}`));
    }
  }

  public async create(input: NewProjectInput): Promise<CreateProjectResult> {
    // Číslo se řídí datem založení (dneškem), ne plánovaným zahájením — projekt
    // ve stavu Nabídka může vzniknout, ještě než je známé, kdy se začne realizovat.
    const projectNumber = await this.numbering.allocateNumber('PRJ');
    const sp = getSp(this.context);

    const customerId = input.customerId;
    const projectManagerId = await this.resolveUserId(sp, input.projectManagerName);

    let newId: number | undefined;
    try {
      const added = await sp.web.lists.getByTitle(PROJECTS_LIST).items.add({
        Title: input.title,
        ProjectNumber: projectNumber,
        CustomerId: customerId,
        ProjectManagerId: projectManagerId,
        ProjectStatus: ProjectStatus.Priprava,
        ProjectType: input.projectType,
        // Rok založení (stejný rok jako v přiděleném čísle), ne plánované zahájení.
        ProjectYear: new Date().getFullYear(),
        Location: input.location,
        ContractPriceNet: input.contractPriceNet,
        Currency: input.currency,
        StartDate: input.startDate ? input.startDate.toISOString() : null,
        EndDatePlanned: input.endDatePlanned ? input.endDatePlanned.toISOString() : null,
        IsOverhead: false,
        BudgetStatus: BudgetStatus.Bez
      });
      newId = extractAddedId(added);
    } catch (error) {
      throw new Error(describeSpError(error, `Nepodařilo se uložit projekt ${projectNumber}`));
    }

    const project = (newId !== undefined ? await this.getByNumber(projectNumber) : undefined) ?? {
      id: newId ?? 0,
      projectNumber,
      title: input.title,
      customerName: input.customerName,
      projectManagerName: input.projectManagerName,
      status: ProjectStatus.Priprava,
      projectType: input.projectType,
      location: input.location,
      contractPriceNet: input.contractPriceNet,
      currency: input.currency,
      startDate: input.startDate,
      endDatePlanned: input.endDatePlanned,
      isOverhead: false,
      budgetStatus: BudgetStatus.Bez
    };

    let folderError: string | undefined;
    try {
      const folderUrl = await this.createProjectFolders(project);
      if (folderUrl) {
        await sp.web.lists
          .getByTitle(PROJECTS_LIST)
          .items.getById(project.id)
          .update({ FolderUrl: { Url: folderUrl, Description: project.title } });
        project.folderUrl = folderUrl;
      }
    } catch (error) {
      folderError = describeSpError(
        error,
        'Projekt je uložený, ale založení složek se nepodařilo. Zkuste to prosím znovu tlačítkem níže'
      );
    }

    return { project, folderError };
  }

  public async retryCreateFolders(projectNumber: string): Promise<void> {
    const project = await this.getByNumber(projectNumber);
    if (!project) {
      throw new Error(`Projekt ${projectNumber} nebyl nalezen.`);
    }
    try {
      const folderUrl = await this.createProjectFolders(project);
      if (folderUrl) {
        const sp = getSp(this.context);
        await sp.web.lists
          .getByTitle(PROJECTS_LIST)
          .items.getById(project.id)
          .update({ FolderUrl: { Url: folderUrl, Description: project.title } });
      }
    } catch (error) {
      throw new Error(describeSpError(error, 'Založení složek se znovu nepodařilo'));
    }
  }

  /** Najde ID uživatele webu podle zobrazovaného jména — pro sloupec typu Osoba. */
  private async resolveUserId(sp: SPFI, displayName: string): Promise<number | undefined> {
    if (!displayName) {
      return undefined;
    }
    const users: { Id: number }[] = await sp.web.siteUsers
      .select('Id')
      .filter(`Title eq '${escapeODataString(displayName)}'`)
      .top(1)();
    if (users.length === 0) {
      throw new Error(`Uživatel „${displayName}" se nenašel mezi uživateli webu — musí se na web aspoň jednou přihlásit.`);
    }
    return users[0].Id;
  }

  /**
   * Založí strukturu složek podle šablony z Nastavení a vrátí odkaz na
   * kořenovou složku projektu. `undefined`, pokud v Nastavení není
   * vyplněná knihovna (nedá se tedy nic založit).
   */
  private async createProjectFolders(project: Project): Promise<string | undefined> {
    const settings = await this.settings.get();
    const folders = settings.folders;
    if (!folders.libraryTitle.trim()) {
      return undefined;
    }

    const foldersSp = folders.siteUrl ? getSpForSite(this.context, folders.siteUrl) : getSp(this.context);
    const libraryRoot = await this.getLibraryServerRelativeUrl(foldersSp, folders.libraryTitle);
    // Rok podsložky = rok založení (dnešek), ne plánované zahájení projektu —
    // odpovídá tak roku v přiděleném čísle, i při pozdějším opakovaném pokusu.
    const plan = buildProjectFolderPlan(folders, project.title, new Date());

    for (const relativePath of plan) {
      const fullPath = `${libraryRoot}/${relativePath}`;
      await foldersSp.web.folders.addUsingPath(fullPath);
    }

    const projectFolderPath = `${libraryRoot}/${plan[plan.length - 1]}`;
    const siteAbsoluteUrl = folders.siteUrl || this.context.pageContext.web.absoluteUrl;
    const origin = new URL(siteAbsoluteUrl).origin;
    return `${origin}${projectFolderPath}`;
  }

  /** Server-relativní cesta ke kořeni knihovny — spolehlivější než skládání textu z názvu. */
  private async getLibraryServerRelativeUrl(sp: SPFI, libraryTitle: string): Promise<string> {
    const list = await sp.web.lists
      .getByTitle(libraryTitle)
      .select('RootFolder/ServerRelativeUrl')
      .expand('RootFolder')();
    return (list as { RootFolder: { ServerRelativeUrl: string } }).RootFolder.ServerRelativeUrl;
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

function extractAddedId(added: unknown): number | undefined {
  const a = added as { data?: { Id?: number }; Id?: number };
  return a?.data?.Id ?? a?.Id;
}
