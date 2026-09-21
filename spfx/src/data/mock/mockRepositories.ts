/**
 * Mock implementace repozitářů — data z paměti, žádný SharePoint.
 *
 * Používá se, když je vlastnost web partu „Zdroj dat" nastavená na `mock`.
 * Slouží k vývoji a předvedení UI bez hotových seznamů.
 *
 * Implementuje **stejná rozhraní** jako ostrá verze — kdyby se sem zavlekla
 * jiná logika než do ostré implementace, UI by se chovalo jinak na ostro.
 */

import { CurrentUser, Project, ACTIVE_PROJECT_STATUSES } from '../../core/types';
import { AppSettings, DEFAULT_SETTINGS, withDefaults } from '../../core/settings';
import { normalizeLogin } from '../../core/roles';
import { renderDocumentNumber, nextSequence, counterScopeKey, CounterState } from '../../core/numbering';
import {
  IInstallRepository,
  IProjectRepository,
  INumberingRepository,
  ISettingsRepository,
  IUserRepository,
  ProjectFilter,
  DocTypeConfig,
  DiagnosticReport,
  InstallProgress,
  RepositorySet
} from '../repositories';
import { LISTS, ListDef, SCHEMA_VERSION, creationOrder } from '../schema';
import { DEFAULT_DOC_TYPES, MOCK_PROJECTS, MOCK_USER } from './mockData';

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

class MockProjectRepository implements IProjectRepository {
  public list(filter?: ProjectFilter): Promise<Project[]> {
    return delay(applyProjectFilter(MOCK_PROJECTS, filter, MOCK_USER.displayName));
  }

  public getByNumber(projectNumber: string): Promise<Project | undefined> {
    return delay(MOCK_PROJECTS.filter((p) => p.projectNumber === projectNumber)[0]);
  }
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

  public listDocTypes(): Promise<DocTypeConfig[]> {
    return delay(this.docTypes.map((d) => ({ ...d })));
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

/** Projekty, které se na dashboardu počítají jako aktivní. */
export function activeProjects(projects: Project[]): Project[] {
  return projects.filter((p) => !p.isOverhead && ACTIVE_PROJECT_STATUSES.indexOf(p.status) !== -1);
}

/** Vytvoří kompletní sadu mock repozitářů. */
export function createMockRepositories(): RepositorySet {
  return {
    users: new MockUserRepository(),
    settings: new MockSettingsRepository(),
    projects: new MockProjectRepository(),
    numbering: new MockNumberingRepository(),
    install: new MockInstallRepository()
  };
}

// Re-export, aby si UI nemuselo tahat `normalizeLogin` z core přes mock.
export { normalizeLogin };
