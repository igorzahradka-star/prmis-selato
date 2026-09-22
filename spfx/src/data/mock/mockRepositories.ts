/**
 * Mock implementace repozitářů — data z paměti, žádný SharePoint.
 *
 * Používá se, když je vlastnost web partu „Zdroj dat" nastavená na `mock`.
 * Slouží k vývoji a předvedení UI bez hotových seznamů.
 *
 * Implementuje **stejná rozhraní** jako ostrá verze — kdyby se sem zavlekla
 * jiná logika než do ostré implementace, UI by se chovalo jinak na ostro.
 */

import { BudgetStatus, CurrentUser, Partner, Project, ProjectStatus, ProjectTask, ACTIVE_PROJECT_STATUSES } from '../../core/types';
import { AppSettings, DEFAULT_SETTINGS, withDefaults } from '../../core/settings';
import { canDeleteProject, normalizeLogin } from '../../core/roles';
import { renderDocumentNumber, nextSequence, counterScopeKey, CounterState } from '../../core/numbering';
import { buildProjectFolderPlan } from '../../core/folders';
import { overheadProjectNumber, overheadProjectTitle, OVERHEAD_PROJECT_TYPE } from '../../core/overhead';
import { nextContractualDeadline, sortDeadlines } from '../../core/deadlines';
import {
  IInstallRepository,
  IDocumentRepository,
  ProjectFile,
  IPartnerRepository,
  IProjectRepository,
  ITaskRepository,
  TaskInput,
  INumberingRepository,
  ISettingsRepository,
  IUserRepository,
  PartnerFilter,
  ProjectFilter,
  NewProjectInput,
  CreateProjectResult,
  ProjectEditInput,
  DocTypeConfig,
  DiagnosticReport,
  InstallProgress,
  RepositorySet
} from '../repositories';
import { LISTS, ListDef, SCHEMA_VERSION, creationOrder } from '../schema';
import { DEFAULT_DOC_TYPES, MOCK_FILES, MOCK_PARTNERS, MOCK_PROJECTS, MOCK_TASKS, MOCK_USER } from './mockData';

/** Umělé zdržení, aby bylo v UI vidět načítání stejně jako na ostro. */
function delay<T>(value: T, ms: number = 180): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

class MockUserRepository implements IUserRepository {
  public getCurrentUser(): Promise<CurrentUser> {
    return delay({ ...MOCK_USER });
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

export class MockProjectRepository implements IProjectRepository {
  private projects: Project[] = MOCK_PROJECTS.map((p) => ({ ...p }));
  private nextId = Math.max(...MOCK_PROJECTS.map((p) => p.id)) + 1;
  private readonly versions = new Map<string, string>();
  private readonly deleted: { projectNumber: string; by: string; reason?: string }[] = [];

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

    const project: Project = {
      id: this.nextId++,
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

  public async remove(projectNumber: string, actor: CurrentUser, reason?: string): Promise<void> {
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
    return delay(undefined);
  }

  /** Co se v ukázkovém režimu „smazalo" — zastupuje koš SharePointu a auditní log. */
  public listDeleted(): { projectNumber: string; by: string; reason?: string }[] {
    return this.deleted.map((d) => ({ ...d }));
  }

  public async ensureOverheadProject(projectManagerName: string): Promise<Project> {
    const existing = this.projects.filter((p) => p.isOverhead)[0];
    if (existing) {
      return delay(existing);
    }

    const rok = new Date().getFullYear();
    const project: Project = {
      id: this.nextId++,
      projectNumber: overheadProjectNumber(rok),
      title: overheadProjectTitle(rok),
      shortName: 'Režie',
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
    return this.projects.filter((p) => p.id === project.id)[0];
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
    const plan = buildProjectFolderPlan(settings.folders, project.title, new Date());
    const folderUrl = `#/ukazkovy-rezim/slozka/${encodeURIComponent(plan[plan.length - 1] ?? project.title)}`;
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

/** Projekty, které se na dashboardu počítají jako aktivní. */
export function activeProjects(projects: Project[]): Project[] {
  return projects.filter((p) => !p.isOverhead && ACTIVE_PROJECT_STATUSES.indexOf(p.status) !== -1);
}

/**
 * Odvodí, u jakého pořadového čísla už ukázková data v aktuálním roce skončila —
 * aby nově založený projekt nedostal číslo, které už jedna z ukázkových
 * zakázek má (formát {YY}-{N} podle výchozí řady PRJ).
 */
export function seedProjectCounter(): CounterState {
  const year = new Date().getFullYear();
  const yy = String(year).slice(-2);
  const maxSequence = MOCK_PROJECTS.reduce((max, p) => {
    const match = /^(\d{2})-(\d+)$/.exec(p.projectNumber);
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
  const projects = new MockProjectRepository(numbering, settings);
  return {
    users: new MockUserRepository(),
    settings,
    projects,
    partners: new MockPartnerRepository(),
    tasks: new MockTaskRepository((projectNumber, next) => projects.setNextDeadline(projectNumber, next)),
    documents: new MockDocumentRepository(),
    numbering,
    install: new MockInstallRepository()
  };
}

// Re-export, aby si UI nemuselo tahat `normalizeLogin` z core přes mock.
export { normalizeLogin };
