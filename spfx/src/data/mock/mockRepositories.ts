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
import {
  IInstallRepository,
  IProjectRepository,
  ISettingsRepository,
  IUserRepository,
  ProjectFilter,
  DiagnosticReport,
  InstallProgress,
  RepositorySet
} from '../repositories';
import { LISTS, ListDef, SCHEMA_VERSION, creationOrder } from '../schema';
import { MOCK_PROJECTS, MOCK_USER } from './mockData';

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
    install: new MockInstallRepository()
  };
}

// Re-export, aby si UI nemuselo tahat `normalizeLogin` z core přes mock.
export { normalizeLogin };
