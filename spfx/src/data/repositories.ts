/**
 * Rozhraní repozitářů — jediná brána k datům.
 *
 * Pravidlo: UI ani `core` nikdy nevolají SharePoint přímo, vždy přes tato rozhraní.
 * Díky tomu se dá později přejít na Azure SQL / Dataverse bez přepisu aplikace
 * a UI se dá vyvíjet proti mock implementaci (viz `data/mock/`).
 */

import { CurrentUser, Currency, Partner, Project, ProjectStatus } from '../core/types';
import { AppSettings } from '../core/settings';
import { ListDef } from './schema';

/** Kdo je přihlášen a co smí. */
export interface IUserRepository {
  /** Zjistí přihlášeného uživatele, jeho skupiny a přístup na web PRM-Finance. */
  getCurrentUser(settings: AppSettings): Promise<CurrentUser>;
}

/** Nastavení aplikace. */
export interface ISettingsRepository {
  /** Načte nastavení. Chybějící klíče doplní výchozími hodnotami. */
  get(): Promise<AppSettings>;
  /** Uloží jednu sekci nastavení. Ostatní sekce zůstanou beze změny. */
  saveSection<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void>;
  /** Verze schématu uložená při poslední instalaci. 0 = neinstalováno. */
  getSchemaVersion(): Promise<number>;
  setSchemaVersion(version: number): Promise<void>;
}

/** Filtr pro seznam projektů na dashboardu. */
export interface ProjectFilter {
  /** Jen projekty, kde je přihlášený uživatel PM nebo asistent. */
  onlyMine?: boolean;
  statuses?: string[];
  projectTypes?: string[];
  /** Filtr podle jména PM (zobrazovaného, ne ID) — dofiltruje se v prohlížeči. */
  projectManagerNames?: string[];
  year?: number;
  /** Fulltext přes číslo, název, zákazníka a lokalitu. */
  search?: string;
  /** Zahrnout i projekt Režie. Výchozí: ne. */
  includeOverhead?: boolean;
}

/** Údaje z průvodce založením projektu (zadání kap. 8.2). */
export interface NewProjectInput {
  customerId?: number;
  customerName?: string;
  projectManagerName: string;
  assistantNames?: string[];
  projectType?: string;
  location?: string;
  contractPriceNet?: number;
  currency: Currency;
  startDate?: Date;
  endDatePlanned?: Date;
  /** Vygenerovaný název, který PM mohl před uložením upravit. */
  title: string;
}

export interface CreateProjectResult {
  project: Project;
  /**
   * Založení složek mohlo selhat — projekt zůstává uložený i tak (zadání 8.2).
   * Vyplněno jen když se složky nepodařilo založit.
   */
  folderError?: string;
}

/**
 * Změny existujícího projektu z formuláře úpravy.
 *
 * Číslo projektu se nemění nikdy — je to identifikátor, na který se odkazují
 * složky, objednávky i faktury. Nemění se ani `isOverhead` a hodnoty
 * dopočítané z rozpočtu (semafor, baseline, prognóza).
 *
 * `undefined` u nepovinného pole znamená „vymazat hodnotu", ne „nech být" —
 * formulář posílá vždy kompletní stav.
 */
export interface ProjectEditInput {
  title: string;
  shortName?: string;
  customerId?: number;
  customerName?: string;
  projectManagerName: string;
  status: ProjectStatus;
  projectType?: string;
  location?: string;
  contractPriceNet?: number;
  currency: Currency;
  startDate?: Date;
  endDatePlanned?: Date;
  endDateActual?: Date;
}

/** Projekty. Ve Fázi 0 jen čtení — zakládání a úpravy přišly ve Fázi 1. */
export interface IProjectRepository {
  list(filter?: ProjectFilter): Promise<Project[]>;
  getByNumber(projectNumber: string): Promise<Project | undefined>;
  /** Přidělí číslo, vygeneruje/uloží projekt a založí strukturu složek. */
  create(input: NewProjectInput): Promise<CreateProjectResult>;
  /**
   * Uloží změny existujícího projektu a vrátí jeho novou podobu.
   *
   * `expectedVersion` je otisk stavu, se kterým uživatel začal editovat
   * (u SharePointu ETag). Když se mezitím projekt změnil, implementace
   * **neuloží nic** a vyhodí chybu — přepsat cizí změny by bylo horší
   * než uživatele otravovat. Bez `expectedVersion` se uloží natvrdo.
   */
  update(projectNumber: string, input: ProjectEditInput, expectedVersion?: string): Promise<Project>;
  /** Znovu založí složky u už uloženého projektu — pro tlačítko „Zkusit znovu založit složky". */
  retryCreateFolders(projectNumber: string): Promise<void>;
}

/** Filtr pro seznam partnerů. */
export interface PartnerFilter {
  /** Fulltext přes název, IČO, kontaktní osobu. */
  search?: string;
  /** Zahrnout i neaktivní partnery. Výchozí: ne. */
  includeInactive?: boolean;
}

/** Zákazníci a dodavatelé (PRM_Partners). */
export interface IPartnerRepository {
  list(filter?: PartnerFilter): Promise<Partner[]>;
  getById(id: number): Promise<Partner | undefined>;
  create(partner: Omit<Partner, 'id'>): Promise<Partner>;
  update(id: number, partner: Omit<Partner, 'id'>): Promise<void>;
}

/** Jedna číselná řada z PRM_DocTypes (viz zadání kap. 7). */
export interface DocTypeConfig {
  /** Kód řady — PRJ, OBJ, FP, PP… */
  code: string;
  name: string;
  pattern: string;
  padding: number;
  resetPeriod: 'Ročně' | 'Nikdy';
  scope: 'Globální' | 'Projekt';
  startValue: number;
  active: boolean;
}

/**
 * Číslování dokladů. `allocateNumber` čte a zvyšuje čítač v PRM_Counters —
 * SharePoint nemá transakce, takže ostrá implementace musí souběh řešit
 * optimistickým zámkem (ETag) a při konfliktu (HTTP 412) to zopakovat.
 */
export interface INumberingRepository {
  listDocTypes(): Promise<DocTypeConfig[]>;
  /**
   * Ukáže, jaké by bylo další číslo v řadě, ANIŽ by čítač zvýšil — pro náhled
   * v průvodci založením před uložením. Mezi náhledem a skutečným uložením
   * ho může přidělit někdo jiný — po uložení je proto potřeba zobrazit
   * skutečně přidělené číslo, ne to, co ukázal náhled.
   */
  previewNextNumber(docTypeCode: string, opts?: { projectNumber?: string; date?: Date }): Promise<string>;
  /**
   * Přidělí a rovnou zapíše další číslo v řadě `docTypeCode`.
   * `projectNumber` je potřeba u řad se Scope = Projekt (např. protokoly PP-{PRJ}-{N}).
   */
  allocateNumber(docTypeCode: string, opts?: { projectNumber?: string; date?: Date }): Promise<string>;
}

/** Výsledek jedné kontroly instalačního průvodce. */
export interface DiagnosticItem {
  /** Co se kontrolovalo, česky. */
  label: string;
  /** `ok` = v pořádku, `missing` = chybí a jde doplnit, `manual` = musí admin M365, `error` = chyba. */
  state: 'ok' | 'missing' | 'manual' | 'error';
  /** Vysvětlení pro uživatele — co to znamená a co s tím. */
  detail: string;
  /** Technický identifikátor (název seznamu, sloupce…) — pro logování. */
  key: string;
}

/** Souhrn diagnostiky. */
export interface DiagnosticReport {
  /** Verze schématu podle kódu. */
  codeSchemaVersion: number;
  /** Verze schématu uložená v PRM_Settings. 0 = aplikace ještě nebyla nainstalována. */
  installedSchemaVersion: number;
  /** Má přihlášený uživatel právo zakládat seznamy na webu PRM? */
  canManageWeb: boolean;
  items: DiagnosticItem[];
}

/** Průběh instalace — pro zobrazení uživateli. */
export interface InstallProgress {
  /** Co se právě dělá, česky. */
  step: string;
  done: number;
  total: number;
}

/** Instalace a diagnostika datové struktury. */
export interface IInstallRepository {
  /** Zkontroluje, co existuje a co chybí. Nic nemění. */
  diagnose(): Promise<DiagnosticReport>;
  /**
   * Doplní chybějící seznamy, sloupce a indexy. Je idempotentní — opakované
   * spuštění nic nerozbije. **Nikdy nic nemaže ani nepřepisuje.**
   */
  install(onProgress?: (p: InstallProgress) => void): Promise<DiagnosticReport>;
  /** Seznamy, které průvodce zakládá — pro zobrazení přehledu před instalací. */
  getPlannedLists(): ListDef[];
}

/** Vše dohromady — předává se komponentám přes React context. */
export interface RepositorySet {
  users: IUserRepository;
  settings: ISettingsRepository;
  projects: IProjectRepository;
  partners: IPartnerRepository;
  numbering: INumberingRepository;
  install: IInstallRepository;
}
