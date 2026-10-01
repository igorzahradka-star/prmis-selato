/**
 * Čtení a zakládání projektů v seznamu PRM_Projects.
 *
 * Založení projektu (kap. 8.2): přidělí číslo, uloží položku seznamu
 * a založí strukturu složek podle šablony z Nastavení (kap. 8.3). Když
 * založení složek selže, projekt zůstává uložený — jen se vrátí chyba,
 * kterou UI zobrazí s tlačítkem na nový pokus (`retryCreateFolders`).
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { BudgetStatus, CurrentUser, LEGACY_STATUS_UZAVRENO, Project, ProjectStatus } from '../../core/types';
import { toDate } from '../../core/format';
import { canDeleteProject, canEditProject } from '../../core/roles';
import { StatusChange } from '../../core/projectStatus';
import {
  AccessGroup,
  OVERHEAD_ACCESS_ROLES,
  ProjectAccessState,
  accessGroupsForRoles,
  canManageProjectAccess
} from '../../core/projectAccess';
import { buildProjectFolderPlan, projectFolderName, projectFolderRoot } from '../../core/folders';
import { ProjectRemovalPreview, ProjectRemovalResult, RemovalCount, projectFolderRemovalTarget } from '../../core/projectDeletion';
import {
  overheadProjectNumber,
  overheadProjectTitle,
  isOverheadNumber,
  OVERHEAD_PROJECT_TYPE,
  MAX_REGULAR_SEQUENCE
} from '../../core/overhead';
import {
  IProjectRepository,
  INumberingRepository,
  ISettingsRepository,
  ProjectFilter,
  NewProjectInput,
  CreateProjectResult,
  ProjectEditInput,
  ImportProjectInput,
  ImportResult,
  FolderLinkRepairResult
} from '../repositories';
import { getSp, getSpForSite, describeSpError, extractStatus } from './spContext';
import { resolveLibrary } from './spLibrary';
import { ensureFolder } from './spFolders';
import { roleDefinitionId } from './spPermissions';
import { buildFolderUrl, repairFolderUrl, serverRelativePath } from './documentQuery';
import { escapeODataString } from './spSettingsRepository';
import { SPFI } from '@pnp/sp';

const PROJECTS_LIST = 'PRM_Projects';
const AUDIT_LIST = 'PRM_AuditLog';

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

/**
 * Sloupce s polohou přibyly ve schématu 4. Do doplnění schématu (Správa → Instalace
 * a diagnostika) na webu ještě nejsou a dotaz na ně by shodil celý seznam projektů,
 * proto se čtou zvlášť a když je web nezná, načte se seznam bez nich.
 */
const GEO_FIELDS = ['Latitude', 'Longitude'];

async function withOptionalGeoFields<T>(run: (fields: string[]) => Promise<T>): Promise<T> {
  try {
    return await run([...SELECT_FIELDS, ...GEO_FIELDS]);
  } catch (error) {
    if (extractStatus(error) === 400) {
      return run(SELECT_FIELDS);
    }
    throw error;
  }
}

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
  Latitude?: number;
  Longitude?: number;
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
      const odata = buildProjectFilter(filter, this.currentUserId);
      const items: ProjectItem[] = await withOptionalGeoFields((fields) => {
        let query = sp.web.lists
          .getByTitle(PROJECTS_LIST)
          .items.select(...fields)
          .expand(...EXPAND_FIELDS)
          .orderBy('ProjectNumber', false)
          .top(2000);
        if (odata) {
          query = query.filter(odata);
        }
        return query();
      });
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
      const items: ProjectItem[] = await withOptionalGeoFields((fields) =>
        sp.web.lists
          .getByTitle(PROJECTS_LIST)
          .items.select(...fields)
          .expand(...EXPAND_FIELDS)
          .filter(`ProjectNumber eq '${escapeODataString(projectNumber)}'`)
          .top(1)()
      );
      return items.length > 0 ? mapProject(items[0]) : undefined;
    } catch (error) {
      throw new Error(describeSpError(error, `Nepodařilo se načíst projekt ${projectNumber}`));
    }
  }

  public async create(input: NewProjectInput): Promise<CreateProjectResult> {
    // Kontrola je před přidělením čísla: kdyby zápis selhal až potom, číslo by zůstalo spotřebované.
    if (input.latitude !== undefined && input.longitude !== undefined) {
      await this.assertGeoColumns();
    }
    // Číslo se řídí datem založení (dneškem), ne plánovaným zahájením — projekt
    // ve stavu Nabídka může vzniknout, ještě než je známé, kdy se začne realizovat.
    const projectNumber = await this.numbering.allocateNumber('PRJ');
    // Číslo {RR}-999 patří Režii. Nastane po 998 zakázkách za rok —
    // nepravděpodobné, ale tiché přepsání Režie by bylo horší než chyba.
    if (isOverheadNumber(projectNumber)) {
      throw new Error(
        `Číslo ${projectNumber} je vyhrazené projektu Režie. Řada projektů pro tenhle rok je vyčerpaná (${MAX_REGULAR_SEQUENCE} zakázek) — ozvěte se správci.`
      );
    }
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
        // Poloha se zapisuje jen když je zadaná — před doplněním schématu sloupce neexistují.
        ...(input.latitude !== undefined && input.longitude !== undefined
          ? { Latitude: input.latitude, Longitude: input.longitude }
          : {}),
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
      latitude: input.latitude,
      longitude: input.longitude,
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

  /**
   * Uloží změny projektu. `expectedVersion` je ETag načtený spolu s projektem
   * (viz `getVersion`) — SharePoint při neshodě vrátí HTTP 412 a nic nezapíše.
   * Konflikt se **nezkouší znovu**: na rozdíl od čítače tady nejde o technickou
   * kolizi, ale o dvě různé lidské úpravy. Tiché přepsání by znamenalo ztrátu dat.
   */
  public async update(
    projectNumber: string,
    input: ProjectEditInput,
    expectedVersion?: string
  ): Promise<Project> {
    const existing = await this.getByNumber(projectNumber);
    if (!existing) {
      throw new Error(`Projekt ${projectNumber} nebyl nalezen.`);
    }

    if (input.latitude !== undefined && input.longitude !== undefined) {
      await this.assertGeoColumns();
    }

    const sp = getSp(this.context);
    const projectManagerId = await this.resolveUserId(sp, input.projectManagerName);

    const fields = {
      Title: input.title,
      ShortName: input.shortName ?? null,
      CustomerId: input.customerId ?? null,
      ProjectManagerId: projectManagerId ?? null,
      ProjectStatus: input.status,
      ProjectType: input.projectType ?? null,
      Location: input.location ?? null,
      // Poloha se zapisuje (nebo maže), jen když je co — před doplněním schématu sloupce neexistují.
      ...(input.latitude !== undefined || existing.latitude !== undefined
        ? { Latitude: input.latitude ?? null, Longitude: input.longitude ?? null }
        : {}),
      ContractPriceNet: input.contractPriceNet ?? null,
      Currency: input.currency,
      StartDate: input.startDate ? input.startDate.toISOString() : null,
      EndDatePlanned: input.endDatePlanned ? input.endDatePlanned.toISOString() : null,
      EndDateActual: input.endDateActual ? input.endDateActual.toISOString() : null
    };

    try {
      const item = sp.web.lists.getByTitle(PROJECTS_LIST).items.getById(existing.id);
      // Bez známé verze zapisujeme natvrdo ("*"), s verzí necháme SharePoint
      // ohlídat, že se položka mezitím nezměnila.
      await item.update(fields, expectedVersion ?? '*');
    } catch (error) {
      if (isConflict(error)) {
        throw new Error(
          `Projekt ${projectNumber} mezitím někdo jiný změnil. Zavřete panel, načtěte projekt znovu a proveďte úpravu ještě jednou — jinak byste přepsali cizí změny.`
        );
      }
      throw new Error(describeSpError(error, `Nepodařilo se uložit změny projektu ${projectNumber}`));
    }

    return (await this.getByNumber(projectNumber)) ?? existing;
  }

  /**
   * Seznamy, jejichž položky patří k projektu (sloupec Projekt). Pořadí je pořadí mazání: nejdřív to, co visí na jiném
   * (zápisy na deníku), nakonec evidenční položka projektu. Číslované doklady (PRM_Documents) zůstávají — jsou to přidělená čísla.
   */
  private static readonly REMOVAL_LISTS: { list: string; label: string }[] = [
    { list: 'PRM_DiaryEntries', label: 'zápisy ze stavby' },
    { list: 'PRM_SiteDiaries', label: 'stavební deníky' },
    { list: 'PRM_PurchaseOrders', label: 'objednávky' },
    { list: 'PRM_InvoiceBases', label: 'podklady pro fakturaci' },
    { list: 'PRM_Tasks', label: 'termíny a úkoly' },
    { list: 'PRM_BudgetItems', label: 'položky rozpočtu' },
    { list: 'PRM_BudgetVersions', label: 'verze rozpočtu' },
    { list: 'PRM_IncomePlan', label: 'fakturační milníky' },
    { list: 'PRM_ActualCashflows', label: 'skutečné platby' }
  ];

  /** Položky, které smazání projektu smaže — jen jejich čísla; nic se nemění. Seznam, který ještě neexistuje, se přeskočí. */
  private async collectRemoval(
    sp: SPFI,
    project: Project
  ): Promise<{ groups: { list: string; label: string; ids: number[] }[]; approvals: number[] }> {
    const groups: { list: string; label: string; ids: number[] }[] = [];
    for (const entry of SpProjectRepository.REMOVAL_LISTS) {
      let ids: number[] = [];
      try {
        const rows: { Id: number }[] = await sp.web.lists
          .getByTitle(entry.list)
          .items.select('Id')
          .filter(`ProjectId eq ${project.id}`)
          .top(5000)();
        ids = rows.map((r) => r.Id);
      } catch (error) {
        if (extractStatus(error) !== 404) {
          throw new Error(describeSpError(error, `Nepodařilo se zjistit, co k projektu ${project.projectNumber} patří (${entry.label})`));
        }
      }
      groups.push({ list: entry.list, label: entry.label, ids });
    }

    const approvals: number[] = [];
    const wanted: [string, string][] = [
      ['Objednávka', 'PRM_PurchaseOrders'],
      ['Podklad pro fakturaci', 'PRM_InvoiceBases']
    ];
    for (const [entityType, listName] of wanted) {
      const owned = groups.filter((g) => g.list === listName)[0].ids;
      if (owned.length === 0) {
        continue;
      }
      try {
        const rows: { Id: number; EntityId: number }[] = await sp.web.lists
          .getByTitle('PRM_Approvals')
          .items.select('Id', 'EntityId')
          .filter(`EntityType eq '${entityType}'`)
          .top(5000)();
        rows.filter((r) => owned.indexOf(Number(r.EntityId)) !== -1).forEach((r) => approvals.push(r.Id));
      } catch (error) {
        if (extractStatus(error) !== 404) {
          throw new Error(describeSpError(error, 'Nepodařilo se zjistit záznamy o schvalování projektu'));
        }
      }
    }
    return { groups, approvals };
  }

  /** Složka projektu a to, jestli ji aplikace smí smazat (leží přímo v kořenové složce projektů). */
  private async folderRemovalTarget(project: Project): Promise<{ sp?: SPFI; path?: string; warning?: string }> {
    if (!project.folderUrl) {
      return { warning: 'Projekt nemá odkaz na složku, žádná složka se nesmaže.' };
    }
    const folders = (await this.settings.get()).folders;
    try {
      const foldersSp = await this.foldersSp();
      const libraryRoot = (await resolveLibrary(foldersSp, folders.libraryTitle)).serverRelativeUrl;
      const target = projectFolderRemovalTarget(serverRelativePath(project.folderUrl), libraryRoot, folders.rootFolder);
      return { sp: foldersSp, path: target.path, warning: target.warning };
    } catch (error) {
      return { warning: describeSpError(error, 'Složku projektu se nepodařilo určit, proto se nesmaže. Smažte ji ručně') };
    }
  }

  public async describeRemoval(projectNumber: string): Promise<ProjectRemovalPreview> {
    const project = await this.getByNumber(projectNumber);
    if (!project) {
      throw new Error(`Projekt ${projectNumber} nebyl nalezen.`);
    }
    const sp = getSp(this.context);
    const plan = await this.collectRemoval(sp, project);
    const counts: RemovalCount[] = plan.groups.map((g) => ({ label: g.label, count: g.ids.length }));
    counts.push({ label: 'záznamy o schvalování', count: plan.approvals.length });
    const folder = await this.folderRemovalTarget(project);
    return {
      counts: counts.filter((x) => x.count > 0),
      folderUrl: folder.path ? project.folderUrl : undefined,
      folderWarning: folder.warning
    };
  }

  /**
   * Smaže projekt i s tím, co k němu patří — **vše do koše SharePointu** (`recycle`), ne natrvalo; správce webu to odtud
   * 93 dní obnoví. Složka projektu se maže jen tehdy, když leží přímo v kořenové složce projektů.
   *
   * Pořadí je schválně takové: nejdřív zápis do auditního logu (bez něj se nemaže), pak evidence (nejdřív podřízené
   * položky, nakonec projekt) a až úplně nakonec složka. Kdyby složku nešlo smazat, evidence už je pryč a složku jde smazat ručně;
   * opačné pořadí by při chybě nechalo projekt bez složky a dokumentů.
   */
  public async remove(projectNumber: string, actor: CurrentUser, reason?: string): Promise<ProjectRemovalResult> {
    // Oprávnění se ověřuje znovu těsně před zápisem (CLAUDE.md, kap. 4) —
    // skryté tlačítko v UI není ochrana, ochrana jsou oprávnění SharePointu.
    if (!canDeleteProject(actor.roles)) {
      throw new Error('Mazat projekty smí jen administrátor PRM.');
    }

    const project = await this.getByNumber(projectNumber);
    if (!project) {
      throw new Error(`Projekt ${projectNumber} nebyl nalezen.`);
    }
    if (project.isOverhead) {
      throw new Error('Projekt Režie se nemaže. Přístup k ní se omezuje v detailu projektu.');
    }

    const sp = getSp(this.context);
    const plan = await this.collectRemoval(sp, project);
    const summary = plan.groups.filter((g) => g.ids.length > 0).map((g) => `${g.label}: ${g.ids.length}`);
    const note = [reason ? `Důvod: ${reason}` : '', summary.length > 0 ? `Smazáno i: ${summary.join(', ')}` : ''].filter((x) => x !== '').join(' | ');
    await this.writeAuditEntry(sp, project, actor, note);

    const deleted: RemovalCount[] = [];
    try {
      for (const id of plan.approvals) {
        await sp.web.lists.getByTitle('PRM_Approvals').items.getById(id).recycle();
      }
      if (plan.approvals.length > 0) {
        deleted.push({ label: 'záznamy o schvalování', count: plan.approvals.length });
      }
      for (const g of plan.groups) {
        for (const id of g.ids) {
          await sp.web.lists.getByTitle(g.list).items.getById(id).recycle();
        }
        if (g.ids.length > 0) {
          deleted.push({ label: g.label, count: g.ids.length });
        }
      }
      await sp.web.lists.getByTitle(PROJECTS_LIST).items.getById(project.id).recycle();
    } catch (error) {
      const done = deleted.map((d) => `${d.label} ${d.count}`).join(', ') || 'nic';
      throw new Error(
        describeSpError(error, `Projekt ${projectNumber} se smazal jen částečně (smazáno: ${done}). Zbytek jde smazat znovu, smazané věci jsou v koši SharePointu`)
      );
    }

    const folder = await this.folderRemovalTarget(project);
    let folderRecycled = false;
    let folderWarning = folder.warning;
    if (folder.sp && folder.path) {
      try {
        await folder.sp.web.getFolderByServerRelativePath(folder.path).recycle();
        folderRecycled = true;
      } catch (error) {
        folderWarning =
          extractStatus(error) === 404
            ? 'Složka projektu už neexistovala.'
            : describeSpError(error, 'Evidence projektu je smazaná, ale složku projektu se nepodařilo smazat. Smažte ji ručně');
      }
    }
    return { deleted, folderRecycled, folderWarning };
  }

  /**
   * Zápis do PRM_AuditLog. Selhání zápisu **zastaví mazání** — projekt bez
   * záznamu, kdo ho smazal, je horší než neprovedené smazání.
   */
  private async writeAuditEntry(
    sp: SPFI,
    project: Project,
    actor: CurrentUser,
    reason?: string
  ): Promise<void> {
    try {
      await sp.web.lists.getByTitle(AUDIT_LIST).items.add({
        Title: `Smazán projekt ${project.projectNumber}`,
        EntityType: 'Project',
        EntityId: project.projectNumber,
        Action: 'Delete',
        PerformedById: actor.id,
        PerformedAt: new Date().toISOString(),
        OldValue: JSON.stringify({
          projectNumber: project.projectNumber,
          title: project.title,
          customerName: project.customerName,
          projectManagerName: project.projectManagerName,
          status: project.status,
          contractPriceNet: project.contractPriceNet,
          currency: project.currency,
          folderUrl: project.folderUrl
        }),
        NewValue: reason ?? ''
      });
    } catch (error) {
      throw new Error(
        describeSpError(
          error,
          `Projekt ${project.projectNumber} se nesmazal — nepodařilo se zapsat záznam do auditního logu. Bez něj se maže naslepo`
        )
      );
    }
  }

  /** ETag položky — otisk stavu, se kterým uživatel začal editovat. */
  public async getVersion(projectNumber: string): Promise<string | undefined> {
    try {
      const sp = getSp(this.context);
      const items: unknown[] = await sp.web.lists
        .getByTitle(PROJECTS_LIST)
        .items.select('Id')
        .filter(`ProjectNumber eq '${escapeODataString(projectNumber)}'`)
        .top(1)();
      return extractEtag(items[0]);
    } catch {
      // Bez verze se uloží natvrdo — horší než ideál, ale lepší než nejít uložit vůbec.
      return undefined;
    }
  }

  /**
   * Režie je **jedna na rok** — `26-999`, `27-999`… Hledá se podle čísla
   * letošního roku, ne podle příznaku `IsOverhead`: ten mají i Režie
   * z minulých let a ty chceme nechat být.
   */
  public async ensureOverheadProject(projectManagerName: string): Promise<Project> {
    const rok = new Date().getFullYear();
    const projectNumber = overheadProjectNumber(rok);

    const existing = await this.getByNumber(projectNumber);
    if (existing) {
      return existing;
    }

    const sp = getSp(this.context);
    const title = overheadProjectTitle(rok);
    const projectManagerId = await this.resolveUserId(sp, projectManagerName);

    let newId: number | undefined;
    try {
      const added = await sp.web.lists.getByTitle(PROJECTS_LIST).items.add({
        Title: title,
        ProjectNumber: projectNumber,
        ShortName: `Režie ${rok}`,
        ProjectManagerId: projectManagerId,
        ProjectStatus: ProjectStatus.Realizace,
        ProjectType: OVERHEAD_PROJECT_TYPE,
        ProjectYear: rok,
        Currency: 'CZK',
        StartDate: new Date(rok, 0, 1).toISOString(),
        IsOverhead: true,
        BudgetStatus: BudgetStatus.Bez
      });
      newId = extractAddedId(added);
    } catch (error) {
      throw new Error(describeSpError(error, 'Nepodařilo se založit projekt Režie'));
    }

    const project = (await this.getByNumber(projectNumber)) ?? {
      id: newId ?? 0,
      projectNumber,
      title,
      shortName: `Režie ${rok}`,
      projectManagerName,
      status: ProjectStatus.Realizace,
      projectType: OVERHEAD_PROJECT_TYPE,
      currency: 'CZK',
      startDate: new Date(rok, 0, 1),
      isOverhead: true,
      budgetStatus: BudgetStatus.Bez
    };

    // Složky Režie se zakládají stejně jako u projektu — režijní objednávky
    // a jejich PDF musí mít kam padat. Selhání složek projekt neshodí.
    try {
      const folderUrl = await this.createProjectFolders(project);
      if (folderUrl) {
        await sp.web.lists
          .getByTitle(PROJECTS_LIST)
          .items.getById(project.id)
          .update({ FolderUrl: { Url: folderUrl, Description: project.title } });
        project.folderUrl = folderUrl;
      }
    } catch {
      // Složky jdou doplnit tlačítkem v detailu projektu.
    }

    // Režie nese náklady celé firmy — vidí ji jen vybrané role. Zamyká se hned
    // při založení, ne až později, aby nebyla ani chvíli otevřená všem.
    try {
      const roles = (await this.settings.get()).roles;
      await this.applyRestriction(project, accessGroupsForRoles(OVERHEAD_ACCESS_ROLES, roles));
    } catch (error) {
      throw new Error(
        'Režie je založená, ale přístup k ní se nepodařilo omezit — do té doby ji vidí všichni členové webu. ' +
          `Zkuste to znovu tlačítkem „Omezit přístup". ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return project;
  }

  /**
   * Naimportuje projekty, které už existují jako složky v knihovně.
   *
   * **Nezakládá složky ani nepřiděluje čísla** — obojí už ty projekty mají.
   * Když import některého selže, ostatní se doimportují a selhání se vrátí
   * se jménem a důvodem; přerušit celý import kvůli jednomu by znamenalo
   * pouštět ho znovu a znovu.
   */
  public async importProjects(
    inputs: ImportProjectInput[],
    counterByYear: { year: number; lastValue: number }[],
    projectManagerName: string
  ): Promise<ImportResult> {
    const sp = getSp(this.context);
    const imported: string[] = [];
    const failed: { projectNumber: string; message: string }[] = [];

    const projectManagerId = await this.resolveUserId(sp, projectManagerName);
    const folderLinks = await this.folderLinkBuilder();

    for (const input of inputs) {
      try {
        const existing = await this.getByNumber(input.projectNumber);
        if (existing) {
          failed.push({
            projectNumber: input.projectNumber,
            message: 'Projekt s tímhle číslem už v aplikaci je — nepřepisuje se.'
          });
          continue;
        }

        await sp.web.lists.getByTitle(PROJECTS_LIST).items.add({
          Title: `${input.projectNumber} ${input.title}`,
          ProjectNumber: input.projectNumber,
          ShortName: input.title,
          ProjectManagerId: projectManagerId,
          // Importované projekty berem jako běžící; co je hotové, se upraví ručně.
          ProjectStatus: ProjectStatus.Realizace,
          ProjectType: input.isOverhead ? OVERHEAD_PROJECT_TYPE : null,
          ProjectYear: yearFromProjectNumber(input.projectNumber),
          Currency: 'CZK',
          FolderUrl:
            input.folderName && folderLinks
              ? { Url: folderLinks(input.folderName), Description: `${input.projectNumber} ${input.title}` }
              : null,
          IsOverhead: input.isOverhead,
          BudgetStatus: BudgetStatus.Bez
        });
        imported.push(input.projectNumber);
      } catch (error) {
        failed.push({
          projectNumber: input.projectNumber,
          message: describeSpError(error, 'Nepodařilo se uložit')
        });
      }
    }

    // Čítač až nakonec — kdyby import spadl, radši ať zůstane nižší
    // a doimportuje se, než aby přeskočil čísla, která nikdo nepoužil.
    for (const c of counterByYear) {
      try {
        await this.numbering.setCounterAtLeast('PRJ', c.year, c.lastValue);
      } catch (error) {
        failed.push({
          projectNumber: `čítač ${c.year}`,
          message: describeSpError(error, 'Nepodařilo se nastavit čítač — další projekt může dostat obsazené číslo')
        });
      }
    }

    return { imported, failed };
  }

  public async getAccessState(project: Project): Promise<ProjectAccessState> {
    try {
      const sp = getSp(this.context);
      const item = sp.web.lists.getByTitle(PROJECTS_LIST).items.getById(project.id);
      const record: { HasUniqueRoleAssignments?: boolean } = await item.select('HasUniqueRoleAssignments')();
      const recordRestricted = record.HasUniqueRoleAssignments === true;

      // Kdo má přístup, se čte jen u omezeného záznamu — jinak by to byl celý web.
      let allowed: string[] = [];
      if (recordRestricted) {
        const assignments: { Member?: { Title?: string } }[] = await item.roleAssignments.expand('Member')();
        allowed = assignments
          .map((a) => a.Member?.Title)
          .filter((title): title is string => !!title);
      }

      let folderRestricted: boolean | undefined;
      if (project.folderUrl) {
        const folderSp = await this.foldersSp();
        const folder = await folderSp.web
          .getFolderByServerRelativePath(serverRelativePath(project.folderUrl))
          .getItem<{ HasUniqueRoleAssignments?: boolean }>('HasUniqueRoleAssignments');
        folderRestricted = folder.HasUniqueRoleAssignments === true;
      }

      return { recordRestricted, folderRestricted, allowed };
    } catch (error) {
      throw new Error(
        describeSpError(error, `Nepodařilo se zjistit, kdo má přístup k projektu ${project.projectNumber}`)
      );
    }
  }

  public async restrictAccess(project: Project, actor: CurrentUser, groups: AccessGroup[]): Promise<void> {
    // Oprávnění se ověřuje znovu těsně před zápisem (CLAUDE.md, kap. 4) —
    // skryté tlačítko v UI není ochrana, ochrana jsou oprávnění SharePointu.
    if (!canManageProjectAccess(actor.roles)) {
      throw new Error('Přístup k projektům smí omezovat jen administrátor PRM.');
    }
    await this.applyRestriction(project, groups);
  }

  /**
   * Odpojí záznam i složku projektu od oprávnění webu a přidá jen uvedené skupiny.
   *
   * Pořadí je schválně takové: **nejdřív se ověří všechno** (skupiny existují,
   * úrovně existují), teprve potom se sahá na oprávnění. Kdyby se to obrátilo
   * a skupina chyběla, zůstal by projekt odpojený a nikdo by k němu neměl přístup.
   *
   * Nic se nemaže: `clearSubscopes = false` nechá vlastní oprávnění souborů
   * uvnitř složky, které tam mohl někdo nastavit ručně.
   */
  private async applyRestriction(project: Project, groups: AccessGroup[]): Promise<void> {
    if (groups.length === 0) {
      throw new Error('Není komu přístup ponechat — projekt by nikdo neviděl.');
    }
    const appSp = getSp(this.context);
    const folderSp = project.folderUrl ? await this.foldersSp() : undefined;

    try {
      const recordGrants = await this.resolveGrants(appSp, groups);
      const folderGrants = folderSp ? await this.resolveGrants(folderSp, groups) : [];

      const item = appSp.web.lists.getByTitle(PROJECTS_LIST).items.getById(project.id);
      const record: { HasUniqueRoleAssignments?: boolean } = await item.select('HasUniqueRoleAssignments')();
      if (record.HasUniqueRoleAssignments !== true) {
        await item.breakRoleInheritance(false, false);
      }
      for (const g of recordGrants) {
        await item.roleAssignments.add(g.principalId, g.roleDefinitionId);
      }

      if (folderSp && project.folderUrl) {
        const folder = await folderSp.web
          .getFolderByServerRelativePath(serverRelativePath(project.folderUrl))
          .getItem<{ HasUniqueRoleAssignments?: boolean }>('HasUniqueRoleAssignments');
        if (folder.HasUniqueRoleAssignments !== true) {
          await folder.breakRoleInheritance(false, false);
        }
        for (const g of folderGrants) {
          await folder.roleAssignments.add(g.principalId, g.roleDefinitionId);
        }
      }
    } catch (error) {
      throw new Error(
        describeSpError(
          error,
          `Nepodařilo se omezit přístup k projektu ${project.projectNumber}. Omezovat přístup smí jen vlastník webu`
        )
      );
    }
  }

  /** Ke každé skupině najde její ID a ID úrovně oprávnění; chybějící skupiny nahlásí všechny najednou. */
  private async resolveGrants(
    sp: SPFI,
    groups: AccessGroup[]
  ): Promise<{ principalId: number; roleDefinitionId: number }[]> {
    const missing: string[] = [];
    const grants: { principalId: number; roleDefinitionId: number }[] = [];

    for (const group of groups) {
      try {
        const found: { Id: number } = await sp.web.siteGroups.getByName(group.groupName).select('Id')();
        grants.push({ principalId: found.Id, roleDefinitionId: await roleDefinitionId(sp, group.level) });
      } catch (error) {
        if (extractStatus(error) === 404) {
          missing.push(group.groupName);
        } else {
          throw error;
        }
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Skupina „${missing.join('", „')}" na webu neexistuje. Založte ji v Uživatelé a role (tlačítko Založit chybějící skupiny). Zatím se nezměnilo nic.`
      );
    }
    return grants;
  }

  /** Připojení k webu s knihovnou dokumentů — může být jiný než web aplikace. */
  private async foldersSp(): Promise<SPFI> {
    const folders = (await this.settings.get()).folders;
    return folders.siteUrl ? getSpForSite(this.context, folders.siteUrl) : getSp(this.context);
  }

  /**
   * Ověří, že seznam projektů má sloupce s polohou (schéma 4). Bez nich by SharePoint
   * zápis odmítl chybou o neznámé vlastnosti, ze které by nikdo nepoznal, co dělat.
   */
  private async assertGeoColumns(): Promise<void> {
    try {
      const sp = getSp(this.context);
      const list = sp.web.lists.getByTitle(PROJECTS_LIST);
      for (const name of GEO_FIELDS) {
        await list.fields.getByInternalNameOrTitle(name).select('Id')();
      }
    } catch (error) {
      if (extractStatus(error) === 404) {
        throw new Error(
          'Polohu projektu zatím nejde uložit: seznam projektů na webu nemá sloupce pro polohu na mapě. ' +
            'Otevřete Instalace a diagnostika a doplňte chybějící části (přidá jen sloupce, nic nesmaže). ' +
            'Nic se neuložilo — po doplnění změnu zopakujte.'
        );
      }
      throw new Error(describeSpError(error, 'Nepodařilo se ověřit sloupce pro polohu'));
    }
  }

  public async updateStatus(projectNumber: string, change: StatusChange, actor: CurrentUser): Promise<Project> {
    const existing = await this.getByNumber(projectNumber);
    if (!existing) {
      throw new Error(`Projekt ${projectNumber} nebyl nalezen.`);
    }
    // Oprávnění se ověřuje znovu těsně před zápisem (CLAUDE.md, kap. 4) —
    // skrytý přepínač v UI není ochrana, ochrana jsou oprávnění SharePointu.
    if (
      !canEditProject(actor.roles, actor.loginName, {
        projectManagerLogin: existing.projectManagerLogin,
        assistantLogins: existing.assistantLogins
      })
    ) {
      throw new Error(`Stav projektu ${projectNumber} smí měnit jen jeho projektový manažer, asistent, vedení nebo administrátor.`);
    }

    try {
      const sp = getSp(this.context);
      const fields: Record<string, unknown> = { ProjectStatus: change.status };
      if (change.endDateActual) {
        fields.EndDateActual = change.endDateActual.toISOString();
      }
      await sp.web.lists.getByTitle(PROJECTS_LIST).items.getById(existing.id).update(fields, '*');
    } catch (error) {
      throw new Error(describeSpError(error, `Nepodařilo se změnit stav projektu ${projectNumber}`));
    }
    return (await this.getByNumber(projectNumber)) ?? { ...existing, status: change.status };
  }

  /** Skládač odkazů na složky podle skutečné adresy knihovny; `undefined`, když knihovna v Nastavení není. */
  private async folderLinkBuilder(): Promise<((folderName: string) => string) | undefined> {
    const folders = (await this.settings.get()).folders;
    if (!folders.libraryTitle.trim()) {
      return undefined;
    }
    const foldersSp = await this.foldersSp();
    const library = await resolveLibrary(foldersSp, folders.libraryTitle);
    const origin = new URL(folders.siteUrl || this.context.pageContext.web.absoluteUrl).origin;
    return (folderName: string) => buildFolderUrl(origin, library.serverRelativeUrl, folders.rootFolder, folderName);
  }

  public async repairFolderLinks(): Promise<FolderLinkRepairResult> {
    const folders = (await this.settings.get()).folders;
    const result: FolderLinkRepairResult = { fixed: [], unchanged: 0, failed: [] };
    if (!folders.libraryTitle.trim()) {
      return result;
    }

    let libraryRoot: string;
    try {
      libraryRoot = (await resolveLibrary(await this.foldersSp(), folders.libraryTitle)).serverRelativeUrl;
    } catch (error) {
      throw new Error(describeSpError(error, 'Knihovnu dokumentů se nepodařilo najít'));
    }

    const sp = getSp(this.context);
    const projects = await this.list({ includeOverhead: true });
    for (const p of projects) {
      const repaired = p.folderUrl ? repairFolderUrl(p.folderUrl, libraryRoot, folders.libraryTitle) : undefined;
      if (!repaired) {
        result.unchanged++;
        continue;
      }
      try {
        await sp.web.lists
          .getByTitle(PROJECTS_LIST)
          .items.getById(p.id)
          .update({ FolderUrl: { Url: repaired, Description: p.title } });
        result.fixed.push(p.projectNumber);
      } catch (error) {
        result.failed.push({
          projectNumber: p.projectNumber,
          message: describeSpError(error, 'Odkaz se nepodařilo opravit')
        });
      }
    }
    return result;
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
    // Režie má výjimku: `99900-Režie/<rok>`, rok se bere z jejího čísla (`26999` → 2026).
    const overheadYear = project.isOverhead ? yearFromProjectNumber(project.projectNumber) : undefined;
    const folderName = projectFolderName(project.projectNumber, project.title);
    const plan = buildProjectFolderPlan(folders, folderName, new Date(), overheadYear);

    for (const relativePath of plan) {
      const fullPath = `${libraryRoot}/${relativePath}`;
      await ensureFolder(foldersSp, fullPath);
    }

    const projectFolderPath = `${libraryRoot}/${projectFolderRoot(folders, folderName, new Date(), overheadYear)}`;
    const siteAbsoluteUrl = folders.siteUrl || this.context.pageContext.web.absoluteUrl;
    const origin = new URL(siteAbsoluteUrl).origin;
    return `${origin}${projectFolderPath}`;
  }

  /** Server-relativní cesta ke kořeni knihovny — spolehlivější než skládání textu z názvu. */
  private async getLibraryServerRelativeUrl(sp: SPFI, libraryTitle: string): Promise<string> {
    return (await resolveLibrary(sp, libraryTitle)).serverRelativeUrl;
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
    projectManagerLogin: item.ProjectManager?.Name,
    status: mapStatus(item.ProjectStatus),
    projectType: item.ProjectType,
    location: item.Location,
    latitude: item.Latitude ?? undefined,
    longitude: item.Longitude ?? undefined,
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

/** Stav z uložené hodnoty. Zrušené „Uzavřeno" se čte jako „Dokončeno"; prázdná hodnota jako Nabídka. */
export function mapStatus(value: string | undefined): ProjectStatus {
  if (value === LEGACY_STATUS_UZAVRENO) {
    return ProjectStatus.Dokonceno;
  }
  return (value as ProjectStatus) ?? ProjectStatus.Nabidka;
}

/** Rok ze zaimportovaného čísla `26001` → 2026. Když se nedá přečíst, dnešek. */
function yearFromProjectNumber(projectNumber: string): number {
  const match = /^(\d{2})\d{3,}$/.exec(projectNumber.trim());
  return match ? 2000 + parseInt(match[1], 10) : new Date().getFullYear();
}

function extractAddedId(added: unknown): number | undefined {
  const a = added as { data?: { Id?: number }; Id?: number };
  return a?.data?.Id ?? a?.Id;
}

/** HTTP 412 Precondition Failed = položku mezitím někdo změnil. */
export function isConflict(error: unknown): boolean {
  return extractStatus(error) === 412;
}

/** ETag položky vrácený SharePointem. Tvar `"3"` včetně uvozovek — posílá se zpět beze změny. */
export function extractEtag(item: unknown): string | undefined {
  const i = item as { 'odata.etag'?: string; odata?: { etag?: string } } | undefined;
  return i?.['odata.etag'] ?? i?.odata?.etag;
}
