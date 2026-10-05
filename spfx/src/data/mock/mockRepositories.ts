/**
 * Mock implementace repozitářů — data z paměti, žádný SharePoint.
 *
 * Používá se, když je vlastnost web partu „Zdroj dat" nastavená na `mock`.
 * Slouží k vývoji a předvedení UI bez hotových seznamů.
 *
 * Implementuje **stejná rozhraní** jako ostrá verze — kdyby se sem zavlekla
 * jiná logika než do ostré implementace, UI by se chovalo jinak na ostro.
 */

import { MockCatalogRepository } from './mockCatalogRepository';
import { MockBudgetRepository } from './mockBudgetRepository';
import { MockProfileRepository } from './mockProfileRepository';
import type { FolderMap } from '../../core/projectFolders';
import { BudgetStatus, CurrentUser, Partner, Project, ProjectStatus, ProjectTask, ACTIVE_PROJECT_STATUSES } from '../../core/types';
import { AppSettings, DEFAULT_SETTINGS, withDefaults } from '../../core/settings';
import { canDeleteProject, canEditProject, normalizeLogin, RoleGroupMapping } from '../../core/roles';
import { StatusChange } from '../../core/projectStatus';
import {
  AccessGroup,
  OVERHEAD_ACCESS_ROLES,
  ProjectAccessState,
  accessGroupsForRoles,
  canManageProjectAccess
} from '../../core/projectAccess';
import {
  Person,
  RoleMembership,
  ROLE_ORDER,
  ROLE_PERMISSION_LEVEL,
  PERMISSION_LEVEL_LABEL,
  normalizeLoginKey
} from '../../core/userAdmin';
import { renderDocumentNumber, nextSequence, counterScopeKey, CounterState } from '../../core/numbering';
import { projectFolderName, projectFolderRoot } from '../../core/folders';
import { ProjectRemovalPreview, ProjectRemovalResult } from '../../core/projectDeletion';
import {
  overheadProjectNumber,
  overheadProjectTitle,
  isOverheadNumber,
  OVERHEAD_PROJECT_TYPE,
  MAX_REGULAR_SEQUENCE
} from '../../core/overhead';
import { nextContractualDeadline, sortDeadlines } from '../../core/deadlines';
import {
  IInstallRepository,
  IDocumentRepository,
  ProjectFile,
  ProjectFolder,
  IPartnerRepository,
  IProjectRepository,
  ITaskRepository,
  TaskInput,
  INumberingRepository,
  ISettingsRepository,
  IUserRepository,
  IUserAdminRepository,
  EnsureGroupsResult,
  PartnerFilter,
  ProjectFilter,
  NewProjectInput,
  CreateProjectResult,
  ProjectEditInput,
  ImportProjectInput,
  ImportResult,
  FolderLinkRepairResult,
  FolderLinkCheck,
  DocTypeConfig,
  DiagnosticReport,
  InstallProgress,
  RepositorySet, BudgetCacheInput } from '../repositories';
import { LISTS, ListDef, SCHEMA_VERSION, creationOrder } from '../schema';
import { MockOrderRepository } from './mockOrderRepository';
import { MockInvoiceRepository } from './mockInvoiceRepository';
import { MockDiaryRepository } from './mockDiaryRepository';
import { MockRatesRepository } from './mockRatesRepository';
import { MockMailRepository } from './mockMailRepository';
import {
  DEFAULT_DOC_TYPES,
  MOCK_DIRECTORY,
  MOCK_FILES,
  MOCK_PARTNERS,
  MOCK_PROJECTS,
  MOCK_PROJECT_FOLDERS,
  MOCK_ROLE_MEMBERS,
  MOCK_TASKS,
  MOCK_USER
} from './mockData';

/** Umělé zdržení, aby bylo v UI vidět načítání stejně jako na ostro. */
function delay<T>(value: T, ms: number = 180): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

class MockUserRepository implements IUserRepository {
  public getCurrentUser(): Promise<CurrentUser> {
    return delay({ ...MOCK_USER });
  }
}

/**
 * Správa rolí nad polem v paměti.
 *
 * Napodobuje chování SharePointu včetně toho nepříjemného: přidání už
 * existujícího člena tiše projde a hledání lidí vrací i ty, kteří na webu
 * ještě nikdy nebyli (v mocku smyšlený adresář firmy).
 */
export class MockUserAdminRepository implements IUserAdminRepository {
  private groups = new Map<string, Person[]>();
  /** Skupiny, které už mají na webu nějaké oprávnění. */
  private permissioned = new Set<string>();
  private nextId = 100;

  public constructor(mapping: RoleGroupMapping = DEFAULT_SETTINGS.roles) {
    MOCK_ROLE_MEMBERS.forEach((seed) => {
      this.groups.set(mapping[seed.role], seed.members.map((m) => ({ ...m })));
    });
  }

  public listRoleMembers(mapping: RoleGroupMapping): Promise<RoleMembership[]> {
    return delay(
      ROLE_ORDER.map((role) => {
        const groupName = mapping[role] ?? '';
        const members = this.groups.get(groupName);
        return {
          role,
          groupName,
          groupExists: members !== undefined,
          members: (members ?? []).map((m) => ({ ...m }))
        };
      })
    );
  }

  public searchPeople(query: string): Promise<Person[]> {
    const q = (query || '').trim().toLocaleLowerCase('cs-CZ');
    if (q.length < 3) {
      return delay([]);
    }
    return delay(
      MOCK_DIRECTORY.filter(
        (p) =>
          p.displayName.toLocaleLowerCase('cs-CZ').indexOf(q) !== -1 ||
          (p.email ?? '').toLocaleLowerCase('cs-CZ').indexOf(q) !== -1
      ).map((p) => ({ ...p, id: 0 }))
    );
  }

  public addToRole(groupName: string, loginName: string): Promise<void> {
    const members = this.groups.get(groupName);
    if (!members) {
      throw new Error(`Skupina „${groupName}" na webu neexistuje.`);
    }
    if (members.some((m) => normalizeLoginKey(m.loginName) === normalizeLoginKey(loginName))) {
      return delay(undefined); // stejně jako SharePoint: opakované přidání nevadí
    }
    const znamy = MOCK_DIRECTORY.filter((p) => normalizeLoginKey(p.loginName) === normalizeLoginKey(loginName))[0];
    members.push({
      id: this.nextId++,
      loginName,
      displayName: znamy?.displayName ?? loginName,
      email: znamy?.email
    });
    return delay(undefined);
  }

  public removeFromRole(groupName: string, userId: number): Promise<void> {
    const members = this.groups.get(groupName);
    if (!members) {
      throw new Error(`Skupina „${groupName}" na webu neexistuje.`);
    }
    this.groups.set(groupName, members.filter((m) => m.id !== userId));
    return delay(undefined);
  }

  public ensureRoleGroups(mapping: RoleGroupMapping): Promise<EnsureGroupsResult> {
    const created: string[] = [];
    const granted: { groupName: string; level: string }[] = [];
    ROLE_ORDER.forEach((role) => {
      const name = mapping[role];
      if (!name || !name.trim()) {
        return;
      }
      if (!this.groups.has(name)) {
        this.groups.set(name, []);
        created.push(name);
      }
      if (!this.permissioned.has(name)) {
        this.permissioned.add(name);
        granted.push({ groupName: name, level: PERMISSION_LEVEL_LABEL[ROLE_PERMISSION_LEVEL[role]] });
      }
    });
    return delay({ created, granted, failed: [] });
  }

  /** Jen pro testy: smaže skupinu, aby šlo vyzkoušet chování při chybějící skupině. */
  public dropGroup(groupName: string): void {
    this.groups.delete(groupName);
  }
}

class MockSettingsRepository implements ISettingsRepository {
  private settings: AppSettings = withDefaults(DEFAULT_SETTINGS);
  private schemaVersion: number = SCHEMA_VERSION;

  public get(): Promise<AppSettings> {
    return delay(withDefaults(this.settings));
  }

  public saveSection<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
    this.settings = { ...this.settings, [key]: value };
    return delay(undefined);
  }

  public getSchemaVersion(): Promise<number> {
    return delay(this.schemaVersion);
  }

  public setSchemaVersion(version: number): Promise<void> {
    this.schemaVersion = version;
    return delay(undefined);
  }
}

/**
 * Ukázkové projekty mají jen jméno PM. Přihlašovací jména se doplní z ukázkového adresáře, aby fungovala
 * pravidla, která na ně koukají (kdo smí upravovat, kdo schvaluje objednávku). Asistentem je u dvou projektů Martin Svoboda.
 */
function withDemoLogins(p: Project): Project {
  const person = MOCK_DIRECTORY.filter((d) => d.displayName === p.projectManagerName)[0];
  const martin = MOCK_DIRECTORY.filter((d) => d.displayName === 'Martin Svoboda')[0];
  return {
    ...p,
    projectManagerLogin: p.projectManagerLogin ?? person?.loginName,
    assistantLogins: p.assistantLogins ?? (p.projectNumber === '25002' || p.projectNumber === '25003' ? [martin.loginName] : undefined)
  };
}

export class MockProjectRepository implements IProjectRepository {
  private projects: Project[] = MOCK_PROJECTS.map((p) => withDemoLogins(p));
  private nextId = Math.max(...MOCK_PROJECTS.map((p) => p.id)) + 1;
  private readonly versions = new Map<string, string>();
  private readonly deleted: { projectNumber: string; by: string; reason?: string }[] = [];
  /** Projekty s omezeným přístupem → kdo je smí vidět. Zastupuje vlastní oprávnění položky ve SharePointu. */
  private readonly restricted = new Map<string, string[]>();

  public constructor(
    private readonly numbering: INumberingRepository,
    private readonly settings: ISettingsRepository
  ) {}

  public list(filter?: ProjectFilter): Promise<Project[]> {
    return delay(applyProjectFilter(this.projects, filter, MOCK_USER.displayName));
  }

  public getByNumber(projectNumber: string): Promise<Project | undefined> {
    return delay(this.projects.filter((p) => p.projectNumber === projectNumber)[0]);
  }

  public async create(input: NewProjectInput): Promise<CreateProjectResult> {
    // Číslo se řídí datem založení (dneškem), ne plánovaným zahájením — projekt
    // ve stavu Nabídka může vzniknout, ještě než je známé, kdy se začne realizovat.
    const projectNumber = await this.numbering.allocateNumber('PRJ');
    assertNotOverheadNumber(projectNumber);

    const project: Project = {
      id: this.nextId++,
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
    this.projects = [...this.projects, project];

    const folderError = await this.tryCreateFolders(project);
    return { project, folderError };
  }

  public async update(
    projectNumber: string,
    input: ProjectEditInput,
    expectedVersion?: string
  ): Promise<Project> {
    const current = this.projects.filter((p) => p.projectNumber === projectNumber)[0];
    if (!current) {
      throw new Error(`Projekt ${projectNumber} nebyl nalezen.`);
    }
    // Ekvivalent kontroly ETagu na SharePointu — v mocku je „verze" počítadlo úprav.
    const version = this.versions.get(projectNumber) ?? '1';
    if (expectedVersion !== undefined && expectedVersion !== version) {
      throw new Error(
        `Projekt ${projectNumber} mezitím někdo jiný změnil. Zavřete panel, načtěte projekt znovu a proveďte úpravu ještě jednou — jinak byste přepsali cizí změny.`
      );
    }

    const updated: Project = {
      ...current,
      title: input.title,
      shortName: input.shortName,
      customerName: input.customerName,
      projectManagerName: input.projectManagerName,
      status: input.status,
      projectType: input.projectType,
      location: input.location,
      latitude: input.latitude,
      longitude: input.longitude,
      contractPriceNet: input.contractPriceNet,
      currency: input.currency,
      startDate: input.startDate,
      endDatePlanned: input.endDatePlanned,
      endDateActual: input.endDateActual
    };
    this.projects = this.projects.map((p) => (p.projectNumber === projectNumber ? updated : p));
    this.versions.set(projectNumber, String(Number(version) + 1));
    return delay(updated);
  }

  public async setBudgetCache(projectNumber: string, cache: BudgetCacheInput): Promise<void> {
    this.projects = this.projects.map((p) =>
      p.projectNumber === projectNumber
        ? {
            ...p,
            budgetStatus: cache.status as Project['budgetStatus'],
            budgetBaselineTotal: cache.baselineTotal,
            costForecastTotal: cache.forecastTotal,
            budgetCostTotal: cache.costTotal,
            budgetSaleTotal: cache.saleTotal,
            budgetActualTotal: cache.actualTotal,
            budgetApproved: cache.approved === true
          }
        : p
    );
    return delay(undefined);
  }

  public async setContractPrice(projectNumber: string, priceNet: number, currency: string): Promise<void> {
    const current = this.projects.filter((p) => p.projectNumber === projectNumber)[0];
    if (!current) {
      throw new Error(`Projekt ${projectNumber} nebyl nalezen.`);
    }
    this.projects = this.projects.map((p) => (p.projectNumber === projectNumber ? { ...p, contractPriceNet: priceNet, currency: currency as Project['currency'] } : p));
    return delay(undefined);
  }

  /** Verze položky pro simulaci optimistického zámku — viz `update`. */
  public getVersion(projectNumber: string): string {
    return this.versions.get(projectNumber) ?? '1';
  }

  /** Přepíše cache nejbližšího termínu — volá `MockTaskRepository` po změně termínů. */
  public setNextDeadline(projectNumber: string, next?: Date): void {
    this.projects = this.projects.map((p) =>
      p.projectNumber === projectNumber ? { ...p, nextDeadline: next } : p
    );
  }

  public async saveFolderMap(projectNumber: string, map: FolderMap, actor: CurrentUser): Promise<Project> {
    const project = this.projects.filter((p) => p.projectNumber === projectNumber)[0];
    if (!project) {
      throw new Error(`Projekt ${projectNumber} nebyl nalezen.`);
    }
    if (!canEditProject(actor.roles, actor.loginName, { projectManagerLogin: project.projectManagerLogin, assistantLogins: project.assistantLogins })) {
      throw new Error('Složky projektu smí měnit jen jeho projektový manažer, asistent a administrátor.');
    }
    const updated: Project = { ...project, folderMap: Object.keys(map).length > 0 ? map : undefined };
    this.projects = this.projects.map((p) => (p.projectNumber === projectNumber ? updated : p));
    return delay(updated);
  }

  public async checkFolderLink(projectNumber: string): Promise<FolderLinkCheck> {
    const project = this.projects.filter((p) => p.projectNumber === projectNumber)[0];
    if (!project) {
      throw new Error(`Projekt ${projectNumber} nebyl nalezen.`);
    }
    return delay(project.folderUrl ? { state: 'ok', currentUrl: project.folderUrl, message: 'V ukázkovém režimu není co opravovat.' } : { state: 'missing', message: 'Projekt nemá odkaz na složku.' });
  }

  public async repairFolderLink(projectNumber: string, actor: CurrentUser): Promise<Project> {
    const project = this.projects.filter((p) => p.projectNumber === projectNumber)[0];
    if (!project) {
      throw new Error(`Projekt ${projectNumber} nebyl nalezen.`);
    }
    if (!canEditProject(actor.roles, actor.loginName, { projectManagerLogin: project.projectManagerLogin, assistantLogins: project.assistantLogins })) {
      throw new Error('Odkaz na složku smí opravit jen projektový manažer, asistent a administrátor.');
    }
    throw new Error('V ukázkovém režimu není co opravovat.');
  }

  public async describeRemoval(projectNumber: string): Promise<ProjectRemovalPreview> {
    const project = this.projects.filter((p) => p.projectNumber === projectNumber)[0];
    if (!project) {
      throw new Error(`Projekt ${projectNumber} nebyl nalezen.`);
    }
    return delay({ counts: [], folderUrl: project.folderUrl });
  }

  public async remove(projectNumber: string, actor: CurrentUser, reason?: string): Promise<ProjectRemovalResult> {
    // Stejná kontrola jako v ostré implementaci — skrytí tlačítka v UI není ochrana.
    if (!canDeleteProject(actor.roles)) {
      throw new Error('Mazat projekty smí jen administrátor PRM.');
    }
    const project = this.projects.filter((p) => p.projectNumber === projectNumber)[0];
    if (!project) {
      throw new Error(`Projekt ${projectNumber} nebyl nalezen.`);
    }
    this.projects = this.projects.filter((p) => p.projectNumber !== projectNumber);
    this.versions.delete(projectNumber);
    this.deleted.push({ projectNumber, by: actor.displayName, reason });
    return delay({ deleted: [], folderRecycled: false, folderWarning: 'Ukázkový režim: nic se opravdu nemaže.' });
  }

  /** Co se v ukázkovém režimu „smazalo" — zastupuje koš SharePointu a auditní log. */
  public listDeleted(): { projectNumber: string; by: string; reason?: string }[] {
    return this.deleted.map((d) => ({ ...d }));
  }

  public async ensureOverheadProject(projectManagerName: string): Promise<Project> {
    // Režie je jedna na rok — hledá se ta letošní, ne jakákoli.
    const rok = new Date().getFullYear();
    const cislo = overheadProjectNumber(rok);
    const existing = this.projects.filter((p) => p.projectNumber === cislo)[0];
    if (existing) {
      return delay(existing);
    }

    const project: Project = {
      id: this.nextId++,
      projectNumber: cislo,
      title: overheadProjectTitle(rok),
      shortName: `Režie ${rok}`,
      projectManagerName,
      status: ProjectStatus.Realizace,
      projectType: OVERHEAD_PROJECT_TYPE,
      currency: 'CZK',
      startDate: new Date(rok, 0, 1),
      isOverhead: true,
      budgetStatus: BudgetStatus.Bez
    };
    this.projects = [...this.projects, project];
    await this.tryCreateFolders(project);
    // Režie se zamyká hned při založení — nikdy nesmí být chvíli otevřená všem.
    const roles = (await this.settings.get()).roles;
    this.restricted.set(
      cislo,
      accessGroupsForRoles(OVERHEAD_ACCESS_ROLES, roles).map((g) => g.groupName)
    );
    return this.projects.filter((p) => p.id === project.id)[0];
  }

  public async importProjects(
    inputs: ImportProjectInput[],
    counterByYear: { year: number; lastValue: number }[],
    projectManagerName: string
  ): Promise<ImportResult> {
    const imported: string[] = [];
    const failed: { projectNumber: string; message: string }[] = [];

    for (const input of inputs) {
      if (this.projects.some((p) => p.projectNumber === input.projectNumber)) {
        failed.push({
          projectNumber: input.projectNumber,
          message: 'Projekt s tímhle číslem už v aplikaci je — nepřepisuje se.'
        });
        continue;
      }
      this.projects = [
        ...this.projects,
        {
          id: this.nextId++,
          projectNumber: input.projectNumber,
          title: `${input.projectNumber} ${input.title}`,
          shortName: input.title,
          projectManagerName,
          // Importované projekty běží — kdo je hotový, upraví se ručně.
          status: ProjectStatus.Realizace,
          projectType: input.isOverhead ? OVERHEAD_PROJECT_TYPE : undefined,
          currency: 'CZK',
          folderUrl: input.folderName
            ? `#/ukazkovy-rezim/slozka/${encodeURIComponent(input.folderName)}`
            : undefined,
          isOverhead: input.isOverhead,
          budgetStatus: BudgetStatus.Bez
        }
      ];
      imported.push(input.projectNumber);
    }

    for (const c of counterByYear) {
      await this.numbering.setCounterAtLeast('PRJ', c.year, c.lastValue);
    }

    return delay({ imported, failed });
  }

  public getAccessState(project: Project): Promise<ProjectAccessState> {
    const allowed = this.restricted.get(project.projectNumber);
    return delay({
      recordRestricted: !!allowed,
      folderRestricted: project.folderUrl ? !!allowed : undefined,
      allowed: allowed ? [...allowed] : []
    });
  }

  public async restrictAccess(project: Project, actor: CurrentUser, groups: AccessGroup[]): Promise<void> {
    // Stejná kontrola jako v ostré implementaci — skrytí tlačítka v UI není ochrana.
    if (!canManageProjectAccess(actor.roles)) {
      throw new Error('Přístup k projektům smí omezovat jen administrátor PRM.');
    }
    if (!this.projects.some((p) => p.projectNumber === project.projectNumber)) {
      throw new Error(`Projekt ${project.projectNumber} nebyl nalezen.`);
    }
    this.restricted.set(project.projectNumber, groups.map((g) => g.groupName));
    return delay(undefined);
  }

  public async updateStatus(projectNumber: string, change: StatusChange, actor: CurrentUser): Promise<Project> {
    const current = this.projects.filter((p) => p.projectNumber === projectNumber)[0];
    if (!current) {
      throw new Error(`Projekt ${projectNumber} nebyl nalezen.`);
    }
    // Stejná kontrola jako v ostré implementaci — skrytí přepínače v UI není ochrana.
    if (
      !canEditProject(actor.roles, actor.loginName, {
        projectManagerLogin: current.projectManagerLogin,
        assistantLogins: current.assistantLogins
      })
    ) {
      throw new Error(`Stav projektu ${projectNumber} smí měnit jen jeho projektový manažer, asistent, vedení nebo administrátor.`);
    }
    const updated: Project = {
      ...current,
      status: change.status,
      endDateActual: change.endDateActual ?? current.endDateActual
    };
    this.projects = this.projects.map((p) => (p.projectNumber === projectNumber ? updated : p));
    return delay(updated);
  }

  public repairFolderLinks(): Promise<FolderLinkRepairResult> {
    // V ukázkovém režimu jsou odkazy vždy správné — není co opravovat.
    return delay({ fixed: [], unchanged: this.projects.length, failed: [] });
  }

  public async retryCreateFolders(projectNumber: string): Promise<void> {
    const project = this.projects.filter((p) => p.projectNumber === projectNumber)[0];
    if (!project) {
      throw new Error(`Projekt ${projectNumber} nebyl nalezen.`);
    }
    const error = await this.tryCreateFolders(project);
    if (error) {
      throw new Error(error);
    }
  }

  /** V ukázkovém režimu se nic nezakládá — jen se simuluje výsledek a nastaví se odkaz. */
  private async tryCreateFolders(project: Project): Promise<string | undefined> {
    const settings = await this.settings.get();
    // Rok podsložky = rok založení (dnešek), ne plánované zahájení projektu —
    // odpovídá tak roku v přiděleném čísle, i při pozdějším opakovaném pokusu.
    const root = projectFolderRoot(settings.folders, projectFolderName(project.projectNumber, project.title), new Date(), project.isOverhead ? new Date().getFullYear() : undefined);
    const folderUrl = `#/ukazkovy-rezim/slozka/${encodeURIComponent(root || project.title)}`;
    this.projects = this.projects.map((p) => (p.id === project.id ? { ...p, folderUrl } : p));
    return undefined;
  }
}

/**
 * Smluvní termíny nad polem v paměti.
 *
 * Po každé změně přepočítá `nextDeadline` projektu — stejně jako ostrá
 * implementace, aby se dashboard v ukázkovém režimu choval stejně.
 */
export class MockTaskRepository implements ITaskRepository {
  private tasks: ProjectTask[] = MOCK_TASKS.map((t) => ({ ...t }));
  private nextId = MOCK_TASKS.length > 0 ? Math.max(...MOCK_TASKS.map((t) => t.id)) + 1 : 1;

  public constructor(private readonly onDeadlineChange: (projectNumber: string, next?: Date) => void) {}

  public listByProject(projectNumber: string): Promise<ProjectTask[]> {
    return delay(sortDeadlines(this.tasks.filter((t) => t.projectNumber === projectNumber)));
  }

  public async create(projectNumber: string, input: TaskInput): Promise<ProjectTask> {
    const task: ProjectTask = { id: this.nextId++, projectNumber, ...input };
    this.tasks = [...this.tasks, task];
    this.recalculate(projectNumber);
    return delay(task);
  }

  public async update(id: number, input: TaskInput): Promise<ProjectTask> {
    const current = this.tasks.filter((t) => t.id === id)[0];
    if (!current) {
      throw new Error('Termín nebyl nalezen. Nejspíš ho mezitím někdo smazal.');
    }
    const updated: ProjectTask = { ...current, ...input };
    this.tasks = this.tasks.map((t) => (t.id === id ? updated : t));
    this.recalculate(current.projectNumber);
    return delay(updated);
  }

  public async remove(id: number): Promise<void> {
    const current = this.tasks.filter((t) => t.id === id)[0];
    if (!current) {
      throw new Error('Termín nebyl nalezen. Nejspíš ho mezitím někdo smazal.');
    }
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.recalculate(current.projectNumber);
    return delay(undefined);
  }

  private recalculate(projectNumber: string): void {
    const projektove = this.tasks.filter((t) => t.projectNumber === projectNumber);
    this.onDeadlineChange(projectNumber, nextContractualDeadline(projektove));
  }
}

/**
 * Soubory ve složce projektu — v ukázkovém režimu smyšlené.
 *
 * Odkazy nikam nevedou (na SharePoint se nepřipojujeme), ale seznam vypadá
 * a chová se stejně jako na ostro, aby šlo ladit vzhled záložky Dokumenty.
 */
class MockDocumentRepository implements IDocumentRepository {
  /** Soubory uložené v ukázkovém režimu — jen v paměti prohlížeče, do zavření stránky. */
  private readonly stored = new Map<string, { name: string; folder: string; blob: Blob; url: string; modified: Date; note?: string }>();

  private key(project: Project, folder: string, name: string): string {
    return `${project.projectNumber}/${folder}/${name}`;
  }

  public listFolderFiles(project: Project, relativeFolder: string): Promise<ProjectFile[]> {
    const out: ProjectFile[] = [];
    this.stored.forEach((f, k) => {
      if (k.indexOf(`${project.projectNumber}/${relativeFolder}/`) === 0 && k.slice(`${project.projectNumber}/${relativeFolder}/`.length).indexOf('/') === -1) {
        out.push({ name: f.name, relativeFolder, url: f.url, sizeBytes: f.blob.size, modified: f.modified });
      }
    });
    return delay(out.sort((a, b) => (a.modified as Date).getTime() - (b.modified as Date).getTime()));
  }

  public resolveFolderUrl(project: Project, relativeFolder: string): Promise<string | undefined> {
    return delay(project.folderUrl ? `#/ukazkovy-rezim/slozka/${encodeURIComponent(`${project.projectNumber}/${relativeFolder}`)}` : undefined);
  }

  public listSubfolders(project: Project, relativeFolder: string): Promise<ProjectFolder[]> {
    const prefix = `${project.projectNumber}/${relativeFolder}/`;
    const found = new Map<string, { count: number; modified: Date }>();
    this.stored.forEach((f, k) => {
      if (k.indexOf(prefix) !== 0) {
        return;
      }
      const rest = k.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash === -1) {
        return;
      }
      const name = rest.slice(0, slash);
      const current = found.get(name) || { count: 0, modified: f.modified };
      found.set(name, { count: current.count + 1, modified: f.modified > current.modified ? f.modified : current.modified });
    });
    const out: ProjectFolder[] = [];
    found.forEach((v, name) => out.push({ name, url: `#/ukazkovy-rezim/slozka/${encodeURIComponent(`${relativeFolder}/${name}`)}`, itemCount: v.count, modified: v.modified }));
    return delay(out);
  }

  public async listPhotos(project: Project, relativeFolder: string): Promise<ProjectFile[]> {
    const files = await this.listFolderFiles(project, relativeFolder);
    return files
      .filter((f) => /\.(jpe?g|png|gif|webp|bmp)$/i.test(f.name))
      .map((f) => {
        const s = this.stored.get(this.key(project, relativeFolder, f.name));
        return { ...f, note: s && s.note ? s.note : undefined, thumbnailUrl: f.url };
      });
  }

  public setFileNote(project: Project, relativeFolder: string, fileName: string, note: string): Promise<void> {
    const f = this.stored.get(this.key(project, relativeFolder, fileName));
    if (!f) {
      return Promise.reject(new Error(`Soubor „${fileName}“ nebyl nalezen.`));
    }
    f.note = note.trim() === '' ? undefined : note.trim();
    return delay(undefined);
  }

  public readProjectFile(project: Project, relativeFolder: string, fileName: string): Promise<Blob> {
    const f = this.stored.get(this.key(project, relativeFolder, fileName));
    return f ? delay(f.blob) : Promise.reject(new Error(`Soubor „${fileName}“ nebyl nalezen.`));
  }

  public deleteProjectFile(project: Project, relativeFolder: string, fileName: string): Promise<void> {
    this.stored.delete(this.key(project, relativeFolder, fileName));
    return delay(undefined);
  }

  public listRecentFiles(project: Project, limit: number = 10): Promise<ProjectFile[]> {
    if (!project.folderUrl) {
      return delay([]);
    }
    const files = MOCK_FILES.map((f, i) => ({
      ...f,
      url: `#/ukazkovy-rezim/soubor/${encodeURIComponent(f.name)}`,
      modified: posun(-i * 3 - 1)
    }));
    return delay(files.slice(0, limit));
  }

  public saveProjectFile(project: Project, relativeFolder: string, fileName: string, content: Blob): Promise<string> {
    if (!project.folderUrl) {
      return Promise.reject(new Error(`Projekt ${project.projectNumber} nemá složku, kam by se soubor uložil.`));
    }
    // V ukázkovém režimu se soubor drží jen v paměti prohlížeče; odkaz míří na něj (nebo na tvar, jaký by vznikl na ostro).
    const url =
      content && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(content)
        : `#/ukazkovy-rezim/soubor/${encodeURIComponent(`${relativeFolder}/${fileName}`)}`;
    if (content) {
      this.stored.set(this.key(project, relativeFolder, fileName), { name: fileName, folder: relativeFolder, blob: content, url, modified: new Date() });
    }
    return delay(url);
  }

  public listProjectFolderNames(): Promise<string[]> {
    return delay(MOCK_PROJECT_FOLDERS.slice());
  }
}

/** Datum posunuté o dny vůči dnešku — ať ukázka nezestárne. */
function posun(dny: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + dny);
  return d;
}

/** Jeden řádek PRM_Counters, jak si ho drží mock v paměti. */
interface MockCounterRow extends CounterState {
  /** Pro simulaci optimistického zámku (ekvivalent ETag) — roste při každém zápisu. */
  version: number;
}

/**
 * Přidělování čísel dokladů — mock nad polem v paměti.
 *
 * Souběh se simuluje schválně: mezi přečtením a zápisem čítače je čekání,
 * takže při souběžných voláních se stihnou „potkat" — přesně jako při
 * konfliktu na SharePointu (HTTP 412). Kdo přijde pozdě, zjistí, že se
 * verze mezitím změnila, a zkusí to znovu s čerstvým čtením.
 */
export class MockNumberingRepository implements INumberingRepository {
  private readonly docTypes: DocTypeConfig[];
  private readonly counters = new Map<string, MockCounterRow>();

  public constructor(docTypes: DocTypeConfig[] = DEFAULT_DOC_TYPES) {
    this.docTypes = docTypes;
  }

  /**
   * Nastaví počáteční stav čítače — použije se při startu mocku, aby nově
   * založené doklady nekolidovaly s čísly, která už mají ukázková data
   * (viz `seedProjectCounter` v `createMockRepositories`).
   */
  public seedCounter(docTypeCode: string, state: CounterState, scopeKey: string = ''): void {
    this.counters.set(`${docTypeCode}:${scopeKey}`, { ...state, version: 0 });
  }

  public setCounterAtLeast(docTypeCode: string, year: number, lastValue: number): Promise<void> {
    const key = `${docTypeCode}:`;
    const current = this.counters.get(key);
    // Jen nahoru. Snížení by znamenalo podruhé přidělit číslo, které už někde je.
    if (current && current.year === year && current.lastValue >= lastValue) {
      return delay(undefined);
    }
    this.counters.set(key, { year, lastValue, version: (current?.version ?? 0) + 1 });
    return delay(undefined);
  }

  public listDocTypes(): Promise<DocTypeConfig[]> {
    return delay(this.docTypes.map((d) => ({ ...d })));
  }

  public async previewNextNumber(
    docTypeCode: string,
    opts?: { projectNumber?: string; date?: Date }
  ): Promise<string> {
    const docType = this.docTypes.filter((d) => d.code === docTypeCode && d.active)[0];
    if (!docType) {
      throw new Error(`Neznámá nebo neaktivní číselná řada „${docTypeCode}".`);
    }
    const year = (opts?.date ?? new Date()).getFullYear();
    const key = `${docTypeCode}:${counterScopeKey(docType.scope, opts?.projectNumber)}`;
    const sequence = nextSequence(this.counters.get(key), docType, year);
    return delay(
      renderDocumentNumber(docType, { prefix: docType.code, year, sequence, projectNumber: opts?.projectNumber })
    );
  }

  public async allocateNumber(
    docTypeCode: string,
    opts?: { projectNumber?: string; date?: Date }
  ): Promise<string> {
    const docType = this.docTypes.filter((d) => d.code === docTypeCode && d.active)[0];
    if (!docType) {
      throw new Error(`Neznámá nebo neaktivní číselná řada „${docTypeCode}".`);
    }

    const year = (opts?.date ?? new Date()).getFullYear();
    const key = `${docTypeCode}:${counterScopeKey(docType.scope, opts?.projectNumber)}`;

    for (let attempt = 0; attempt < 30; attempt++) {
      const before = this.counters.get(key);
      const readVersion = before?.version ?? 0;

      // Umělé zdržení mezi čtením a zápisem — dá prostor souběžnému volání
      // se „vetřít" mezi ně, stejně jako na síti.
      await delay(undefined, 5);

      const sequence = nextSequence(before, docType, year);

      const current = this.counters.get(key);
      if ((current?.version ?? 0) !== readVersion) {
        continue; // někdo jiný mezitím zapsal — čti znovu (ekvivalent HTTP 412)
      }

      this.counters.set(key, { year, lastValue: sequence, version: readVersion + 1 });
      return renderDocumentNumber(docType, {
        prefix: docType.code,
        year,
        sequence,
        projectNumber: opts?.projectNumber
      });
    }
    throw new Error('Nepodařilo se přidělit číslo — příliš mnoho současných pokusů, zkuste to prosím znovu.');
  }
}

class MockPartnerRepository implements IPartnerRepository {
  private partners: Partner[] = MOCK_PARTNERS.map((p) => ({ ...p }));
  private nextId = Math.max(...MOCK_PARTNERS.map((p) => p.id)) + 1;

  public list(filter?: PartnerFilter): Promise<Partner[]> {
    return delay(applyPartnerFilter(this.partners, filter));
  }

  public getById(id: number): Promise<Partner | undefined> {
    return delay(this.partners.filter((p) => p.id === id)[0]);
  }

  public create(partner: Omit<Partner, 'id'>): Promise<Partner> {
    const created: Partner = { ...partner, id: this.nextId++ };
    this.partners = [...this.partners, created];
    return delay(created);
  }

  public update(id: number, partner: Omit<Partner, 'id'>): Promise<void> {
    this.partners = this.partners.map((p) => (p.id === id ? { ...partner, id } : p));
    return delay(undefined);
  }
}

class MockInstallRepository implements IInstallRepository {
  public diagnose(): Promise<DiagnosticReport> {
    return delay(this.report());
  }

  public async install(onProgress?: (p: InstallProgress) => void): Promise<DiagnosticReport> {
    const lists = creationOrder(LISTS);
    for (let i = 0; i < lists.length; i++) {
      if (onProgress) {
        onProgress({ step: `Zakládám seznam „${lists[i].title}"`, done: i, total: lists.length });
      }
      await delay(undefined, 60);
    }
    return this.report();
  }

  public getPlannedLists(): ListDef[] {
    return creationOrder(LISTS);
  }

  private report(): DiagnosticReport {
    return {
      codeSchemaVersion: SCHEMA_VERSION,
      installedSchemaVersion: SCHEMA_VERSION,
      canManageWeb: true,
      items: LISTS.map((l) => ({
        key: l.name,
        label: `${l.kind === 'library' ? 'Knihovna' : 'Seznam'} ${l.title}`,
        state: 'ok' as const,
        detail: 'Ukázkový režim — seznam se nekontroluje proti SharePointu.'
      }))
    };
  }
}

/**
 * Filtrování projektů. Vytaženo ven, protože stejná pravidla musí platit
 * i pro ostrou implementaci — ta je ale překládá do dotazu na SharePoint.
 */
export function applyProjectFilter(
  projects: Project[],
  filter: ProjectFilter | undefined,
  currentUserDisplayName: string
): Project[] {
  const f = filter ?? {};
  let result = projects;

  if (!f.includeOverhead) {
    result = result.filter((p) => !p.isOverhead);
  }
  if (f.onlyMine) {
    result = result.filter((p) => p.projectManagerName === currentUserDisplayName);
  }
  if (f.statuses && f.statuses.length > 0) {
    result = result.filter((p) => (f.statuses as string[]).indexOf(p.status) !== -1);
  }
  if (f.projectTypes && f.projectTypes.length > 0) {
    result = result.filter((p) => !!p.projectType && (f.projectTypes as string[]).indexOf(p.projectType) !== -1);
  }
  if (f.projectManagerNames && f.projectManagerNames.length > 0) {
    result = result.filter(
      (p) => !!p.projectManagerName && (f.projectManagerNames as string[]).indexOf(p.projectManagerName) !== -1
    );
  }
  if (f.year) {
    result = result.filter((p) => !!p.startDate && p.startDate.getFullYear() === f.year);
  }
  if (f.search && f.search.trim()) {
    const q = f.search.trim().toLocaleLowerCase('cs-CZ');
    result = result.filter((p) =>
      [p.projectNumber, p.title, p.customerName, p.location, p.shortName]
        .filter((v) => !!v)
        .some((v) => (v as string).toLocaleLowerCase('cs-CZ').indexOf(q) !== -1)
    );
  }
  return result;
}

/**
 * Filtrování partnerů. Vytaženo ven ze stejného důvodu jako u projektů —
 * stejná pravidla platí i pro ostrou implementaci.
 */
export function applyPartnerFilter(partners: Partner[], filter: PartnerFilter | undefined): Partner[] {
  const f = filter ?? {};
  let result = partners;

  if (!f.includeInactive) {
    result = result.filter((p) => p.isActive);
  }
  if (f.search && f.search.trim()) {
    const q = f.search.trim().toLocaleLowerCase('cs-CZ');
    result = result.filter((p) =>
      [p.name, p.ico, p.contactName]
        .filter((v) => !!v)
        .some((v) => (v as string).toLocaleLowerCase('cs-CZ').indexOf(q) !== -1)
    );
  }
  return result;
}

/**
 * Zastaví zakládání, kdyby řada v daném roce došla až na číslo vyhrazené
 * Režii. Nastane po 998 zakázkách za rok — nepravděpodobné, ale tiché
 * přepsání Režie by bylo horší než srozumitelná chyba.
 */
export function assertNotOverheadNumber(projectNumber: string): void {
  if (isOverheadNumber(projectNumber)) {
    throw new Error(
      `Číslo ${projectNumber} je vyhrazené projektu Režie. Řada projektů pro tenhle rok je vyčerpaná (${MAX_REGULAR_SEQUENCE} zakázek) — ozvěte se správci.`
    );
  }
}

/** Projekty, které se na dashboardu počítají jako aktivní. */
export function activeProjects(projects: Project[]): Project[] {
  return projects.filter((p) => !p.isOverhead && ACTIVE_PROJECT_STATUSES.indexOf(p.status) !== -1);
}

/**
 * Odvodí, u jakého pořadového čísla už ukázková data v aktuálním roce skončila —
 * aby nově založený projekt nedostal číslo, které už jedna z ukázkových
 * zakázek má (formát {YY}-{N} podle výchozí řady PRJ).
 *
 * **Režie (`{RR}-999`) se do maxima nepočítá.** Jinak by čítač po prvním
 * roce s Režií skočil na 999 a další projekt by dostal číslo 1000 —
 * mimo formát a mimo řadu.
 */
export function seedProjectCounter(): CounterState {
  const year = new Date().getFullYear();
  const yy = String(year).slice(-2);
  const maxSequence = MOCK_PROJECTS.reduce((max, p) => {
    if (isOverheadNumber(p.projectNumber)) {
      return max;
    }
    // Formát {RR}{NNN} — `26001`. Dvě číslice roku, zbytek pořadové číslo.
    const match = /^(\d{2})(\d{3,})$/.exec(p.projectNumber);
    if (!match || match[1] !== yy) {
      return max;
    }
    return Math.max(max, parseInt(match[2], 10));
  }, 0);
  return { year, lastValue: maxSequence };
}

/** Vytvoří kompletní sadu mock repozitářů. */
export function createMockRepositories(): RepositorySet {
  const settings = new MockSettingsRepository();
  const numbering = new MockNumberingRepository();
  numbering.seedCounter('PRJ', seedProjectCounter());
  // Ukázkové objednávky mají čísla OBJ-2026-0001 až 0004 — další nová naváže za nimi.
  numbering.seedCounter('OBJ', { year: 2026, lastValue: 4 });
  // Ukázkové podklady pro fakturaci mají čísla FP26001 až FP26003.
  numbering.seedCounter('FP', { year: 2026, lastValue: 3 });
  const projects = new MockProjectRepository(numbering, settings);
  const partners = new MockPartnerRepository();
  const rates = new MockRatesRepository();
  const profiles = new MockProfileRepository();
  return {
    users: new MockUserRepository(),
    userAdmin: new MockUserAdminRepository(),
    settings,
    projects,
    partners,
    orders: new MockOrderRepository(numbering, projects, settings, partners, rates),
    invoices: new MockInvoiceRepository(numbering, projects),
    diary: new MockDiaryRepository(projects, settings),
    rates,
    profiles,
    budgets: new MockBudgetRepository(projects),
    catalog: new MockCatalogRepository(),
    mail: new MockMailRepository(),
    tasks: new MockTaskRepository((projectNumber, next) => projects.setNextDeadline(projectNumber, next)),
    documents: new MockDocumentRepository(),
    numbering,
    install: new MockInstallRepository()
  };
}

// Re-export, aby si UI nemuselo tahat `normalizeLogin` z core přes mock.
export { normalizeLogin };
