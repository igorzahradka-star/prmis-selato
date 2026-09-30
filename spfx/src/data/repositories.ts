/**
 * Rozhraní repozitářů — jediná brána k datům.
 *
 * Pravidlo: UI ani `core` nikdy nevolají SharePoint přímo, vždy přes tato rozhraní.
 * Díky tomu se dá později přejít na Azure SQL / Dataverse bez přepisu aplikace
 * a UI se dá vyvíjet proti mock implementaci (viz `data/mock/`).
 */

import { CurrentUser, Currency, Partner, Project, ProjectStatus, ProjectTask, TaskType } from '../core/types';
import { AppSettings } from '../core/settings';
import { RoleGroupMapping } from '../core/roles';
import { Person, RoleMembership } from '../core/userAdmin';
import { AccessGroup, ProjectAccessState } from '../core/projectAccess';
import { StatusChange } from '../core/projectStatus';
import { OrderLine, PurchaseOrder } from '../core/orders';
import { StoredRate, StoredRates } from '../core/currency';
import { ListDef } from './schema';

/** Kdo je přihlášen a co smí. */
export interface IUserRepository {
  /** Zjistí přihlášeného uživatele, jeho skupiny a přístup na web PRM-Finance. */
  getCurrentUser(settings: AppSettings): Promise<CurrentUser>;
}

/**
 * Správa uživatelů a rolí (jen administrátor).
 *
 * **Role = členství ve skupině SharePointu.** Aplikace si vlastní seznam
 * uživatelů nevede — kdyby si ho vedla, rozešel by se s tím, co SharePoint
 * skutečně povolí. Tenhle repozitář tedy jen čte a mění členství ve skupinách,
 * jejichž názvy jsou v Nastavení.
 *
 * Každá operace může selhat na oprávnění: skupiny smí měnit jen vlastník webu.
 * To není chyba aplikace a chybová hláška to má říct.
 */
export interface IUserAdminRepository {
  /** Pro každou roli vrátí její skupinu a členy. Chybějící skupinu označí. */
  listRoleMembers(mapping: RoleGroupMapping): Promise<RoleMembership[]>;
  /**
   * Najde lidi v adresáři firmy podle jména nebo e-mailu — pro výběr,
   * koho přidat. Hledá i mezi lidmi, kteří na webu ještě nikdy nebyli.
   */
  searchPeople(query: string): Promise<Person[]>;
  /** Přidá člověka do skupiny role. Opakované přidání nevadí. */
  addToRole(groupName: string, loginName: string): Promise<void>;
  /** Odebere člověka ze skupiny role. */
  removeFromRole(groupName: string, userId: number): Promise<void>;
  /**
   * Založí skupiny, které podle Nastavení mají existovat a chybí, a skupinám
   * **bez jakéhokoli oprávnění na webu** přidělí výchozí úroveň (viz
   * `ROLE_PERMISSION_LEVEL`). Bez oprávnění se skupina na webu vůbec
   * neobjeví a člen role by aplikaci neotevřel.
   *
   * Je idempotentní a **nikdy nic neodebírá ani nepřepisuje**: skupině, která
   * už nějaké oprávnění má, ho nechá být — mohl ho nastavit správce ručně.
   */
  ensureRoleGroups(mapping: RoleGroupMapping): Promise<EnsureGroupsResult>;
}

/** Co `ensureRoleGroups` udělal. */
export interface EnsureGroupsResult {
  /** Názvy skupin, které nově vznikly. */
  created: string[];
  /** Skupiny, kterým se přidělilo oprávnění na webu (nové i dřív založené bez něj). */
  granted: { groupName: string; level: string }[];
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
  latitude?: number;
  longitude?: number;
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
  latitude?: number;
  longitude?: number;
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
  /**
   * Smaže projekt — **do koše SharePointu**, ne natrvalo. Odtud ho jde 93 dní
   * obnovit; o to se stará správce webu, aplikace na to tlačítko nemá.
   *
   * Co se **nemaže**: složka projektu v knihovně ani dokumenty v ní. Smaže se
   * jen evidenční položka. Složku ať smaže člověk vědomě, ne aplikace mimochodem.
   *
   * Smí jen administrátor (`canDeleteProject`). Oprávnění se ověřuje znovu
   * tady v datové vrstvě — skrytí tlačítka v UI není ochrana.
   *
   * `reason` se zapíše do auditního logu spolu s tím, kdo a kdy mazal.
   */
  remove(projectNumber: string, actor: CurrentUser, reason?: string): Promise<void>;
  /**
   * Vrátí projekt Režie, a když ještě neexistuje, založí ho.
   *
   * Režie je vnitřní projekt (`isOverhead`), na který se věší režijní
   * objednávky a náklady, co nepatří konkrétní zakázce — nájem, telefony,
   * software. Nemá zákazníka ani smluvní cenu.
   *
   * Číslo má tvar `{RR}-999` a je součástí běžné řady: `26-999`, `27-999`…
   * **Jedna Režie na rok**, aby se náklady nesčítaly přes roky. Číslo se
   * nebere z čítače, takže Režie nikomu neukradne pořadové číslo.
   *
   * Je idempotentní: opakované volání vrátí letošní Režii, nezaloží druhou.
   */
  ensureOverheadProject(projectManagerName: string): Promise<Project>;
  /**
   * Naimportuje projekty, které už existují jako složky v knihovně.
   *
   * Na rozdíl od `create()` **nepřiděluje čísla** — ta už projekty mají
   * z názvů složek. A **nezakládá složky** — ty jsou to jediné, co o těch
   * projektech zatím existuje, a přepsat je by znamenalo ztratit dokumenty.
   *
   * Po importu nastaví čítač tak, aby další nový projekt navázal za
   * nejvyšším importovaným číslem.
   *
   * Je bezpečné ho pustit opakovaně: projekt, který už v aplikaci je,
   * se přeskočí (volající ho vyfiltruje přes `buildImportPlan`).
   */
  importProjects(
    inputs: ImportProjectInput[],
    counterByYear: { year: number; lastValue: number }[],
    projectManagerName: string
  ): Promise<ImportResult>;
  /**
   * Opraví odkazy na složky, které vznikly z názvu knihovny („Dokumenty") místo z její
   * skutečné adresy („Shared Documents") a vedly na „404 NOT FOUND". Přepisuje **jen** odkazy
   * poznatelně tohoto tvaru; ostatní (správné i jinam mířící) nechává být. Dá se pustit opakovaně.
   */
  repairFolderLinks(): Promise<FolderLinkRepairResult>;
  /** Znovu založí složky u už uloženého projektu — pro tlačítko „Zkusit znovu založit složky". */
  retryCreateFolders(projectNumber: string): Promise<void>;
  /**
   * Změní **jen stav** projektu (a případně skutečné ukončení) — pro přepínač stavu
   * přímo v seznamu. Ostatní údaje projektu se nedotknou, proto je to samostatná operace
   * a ne `update` (ten zapisuje celý formulář a chybějící zákazník by se smazal).
   *
   * Smí ten, kdo smí projekt upravovat (`canEditProject`); ověřuje se znovu tady.
   */
  updateStatus(projectNumber: string, change: StatusChange, actor: CurrentUser): Promise<Project>;
  /**
   * Skutečný stav oprávnění projektu: je omezený záznam, je omezená složka
   * a kdo k němu má přístup. Čte se přímo ze SharePointu, ne z paměti aplikace.
   *
   * Vyžaduje právo číst oprávnění (administrátor). Ostatním selže — a ti ho
   * ani nepotřebují.
   */
  getAccessState(project: Project): Promise<ProjectAccessState>;
  /**
   * Omezí přístup k projektu — k záznamu **i ke složce** — jen na uvedené
   * skupiny. Ostatní projekt přestanou vidět v seznamu, ve vyhledávání
   * i v knihovně dokumentů.
   *
   * Smí jen administrátor (`canManageProjectAccess`); ověřuje se znovu tady,
   * skrytí tlačítka v UI není ochrana. Bezpečné pustit opakovaně.
   *
   * Nic nemaže: přidává skupiny a odpojuje projekt od oprávnění webu.
   * Když skupina neexistuje, **nezmění se nic** — nejdřív se ověří všechno,
   * teprve pak se sahá na oprávnění, aby projekt nezůstal zamčený napůl.
   */
  restrictAccess(project: Project, actor: CurrentUser, groups: AccessGroup[]): Promise<void>;
}

/** Údaje z formuláře smluvního termínu (PRM_Tasks). */
export interface TaskInput {
  title: string;
  taskType: TaskType;
  finishDate?: Date;
  startDate?: Date;
  isContractualDeadline: boolean;
  percentComplete: number;
  responsibleName?: string;
}

/**
 * Položky harmonogramu (PRM_Tasks). Ve Fázi 1 se přes ně vedou jen
 * **smluvní termíny** jako milníky; celý Gantt přijde ve Fázi 4.
 *
 * Po každé změně se přepočítá `NextDeadline` na projektu — je to cache,
 * ze které čte dashboard, aby nemusel načítat termíny všech projektů.
 */
export interface ITaskRepository {
  /** Položky jednoho projektu, seřazené podle termínu. */
  listByProject(projectNumber: string): Promise<ProjectTask[]>;
  create(projectNumber: string, input: TaskInput): Promise<ProjectTask>;
  update(id: number, input: TaskInput): Promise<ProjectTask>;
  remove(id: number): Promise<void>;
}

/** Soubor ve složce projektu. */
export interface ProjectFile {
  name: string;
  /** Cesta uvnitř složky projektu, např. `03_Nákup/Objednávky`. */
  relativeFolder: string;
  /** Odkaz, kterým se soubor otevře v prohlížeči. */
  url: string;
  sizeBytes?: number;
  modified?: Date;
  modifiedByName?: string;
}

/**
 * Dokumenty ve složce projektu (zadání kap. 8.4).
 *
 * Čte přímo knihovnu SharePointu — aplikace si obsah složek nikam nekopíruje.
 * Prohlížeč neumí otevřít Průzkumníka, proto je odkaz na složku i seznam
 * posledních změn jediný způsob, jak se k souborům dostat z aplikace.
 */
export interface IDocumentRepository {
  /**
   * Naposledy změněné soubory ve složce projektu, od nejnovějšího.
   * `limit` je strop — knihovna může mít tisíce souborů.
   */
  listRecentFiles(project: Project, limit?: number): Promise<ProjectFile[]>;
  /**
   * Názvy podsložek v kořenové složce projektů (podle Nastavení).
   * Podklad pro import stávajících projektů — čtou se jen názvy, nic se nemění.
   */
  listProjectFolderNames(): Promise<string[]>;
}

/** Jeden projekt k naimportování ze složky, která už v knihovně je. */
export interface ImportProjectInput {
  projectNumber: string;
  title: string;
  isOverhead: boolean;
  /**
   * Název existující složky projektu — projekt se na ni jen naváže, nezakládá se nová.
   * Odkaz na ni si složí repozitář ze skutečné adresy knihovny; UI ho skládat nesmí
   * (znalo by jen zobrazený název knihovny, ne její adresu).
   */
  folderName?: string;
}

/** Výsledek opravy odkazů na složky projektů. */
export interface FolderLinkRepairResult {
  /** Čísla projektů, kterým se odkaz opravil. */
  fixed: string[];
  /** Kolika projektů se oprava netýkala (odkaz byl v pořádku, nebo žádný nemají). */
  unchanged: number;
  failed: { projectNumber: string; message: string }[];
}

/** Výsledek importu: co se povedlo a co ne. */
export interface ImportResult {
  imported: string[];
  /** Čísla, u kterých import selhal, se srozumitelným důvodem. */
  failed: { projectNumber: string; message: string }[];
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
  /**
   * Nastaví čítač na danou hodnotu — po importu stávajících projektů, aby
   * další nový navázal za nimi.
   *
   * Čítač jde jen **zvýšit**, nikdy snížit. Snížení by znamenalo, že aplikace
   * podruhé přidělí číslo, které už někde je na složce, objednávce nebo faktuře.
   */
  setCounterAtLeast(docTypeCode: string, year: number, lastValue: number): Promise<void>;
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

/** Filtr pro seznam objednávek. */
export interface OrderFilter {
  projectNumber?: string;
  statuses?: string[];
  /** Fulltext přes číslo, předmět, dodavatele a projekt. */
  search?: string;
}

/** Údaje z formuláře objednávky. */
export interface OrderInput {
  projectNumber: string;
  supplierId?: number;
  supplierName?: string;
  subject: string;
  lines: OrderLine[];
  vatRate: number;
  currency: Currency;
  deliveryDate?: Date;
  paymentTermDays?: number;
  note?: string;
}

/** Jedno rozhodnutí schvalovatele z historie. */
export interface ApprovalRecord {
  stepNo: number;
  approverName: string;
  decision: string;
  comment?: string;
  decidedAt?: Date;
}

/**
 * Nákupní objednávky a jejich schvalování (zadání kap. 8.5).
 *
 * Všechna pravidla (kdo smí co, schvalovací řetěz) jsou v `core/orderWorkflow` — repozitář jen
 * načte objednávku, nechá workflow rozhodnout a výsledek zapíše. Kontrola oprávnění tak probíhá
 * znovu těsně před zápisem (CLAUDE.md, kap. 4); skrytí tlačítka v obrazovce ochrana není.
 *
 * Objednávky se **nemažou**, jen stornují — řada čísel zůstane bez děr (důležité pro audit).
 * Každá změna stavu zapíše záznam do PRM_AuditLog a každé rozhodnutí schvalovatele do PRM_Approvals.
 */
export interface IOrderRepository {
  list(filter?: OrderFilter): Promise<PurchaseOrder[]>;
  getById(id: number): Promise<PurchaseOrder | undefined>;
  /** Založí koncept a přidělí mu číslo z řady OBJ. */
  create(input: OrderInput, actor: CurrentUser): Promise<PurchaseOrder>;
  /** Upraví koncept nebo vrácenou objednávku. */
  update(id: number, input: OrderInput, actor: CurrentUser): Promise<PurchaseOrder>;
  /** Odešle ke schválení; podle částky a vystavitele může být rovnou schválená. */
  submit(id: number, actor: CurrentUser): Promise<PurchaseOrder>;
  decide(id: number, decision: 'approve' | 'return' | 'reject', comment: string, actor: CurrentUser): Promise<PurchaseOrder>;
  send(id: number, actor: CurrentUser): Promise<PurchaseOrder>;
  deliver(id: number, actor: CurrentUser): Promise<PurchaseOrder>;
  close(id: number, actor: CurrentUser): Promise<PurchaseOrder>;
  cancel(id: number, reason: string, actor: CurrentUser): Promise<PurchaseOrder>;
  /** Kdo a jak o objednávce rozhodl, od prvního kroku. */
  listApprovals(id: number): Promise<ApprovalRecord[]>;
}

/**
 * Kurzy ČNB (střed) pro přepočet EUR a USD na koruny.
 *
 * Aplikace je sama z internetu stáhnout nemůže — veřejné rozhraní ČNB neposílá prohlížeči povolení
 * (CORS). Kurzy se proto ukládají do seznamu PRM_ExchangeRates (ručně v Nastavení, nebo denně
 * automaticky přes Power Automate) a všechno se počítá z nich.
 */
export interface IRatesRepository {
  /** Nejnovější zapsaný kurz každé měny. Bez kurzů (nebo před instalací seznamu) vrátí prázdný objekt — nikdy nespadne. */
  getLatest(): Promise<StoredRates>;
  /** Poslední zápisy od nejnovějšího — pro přehled v Nastavení. */
  listRecent(limit?: number): Promise<StoredRate[]>;
  /** Zapíše kurz. Smí jen administrátor; ověřuje se i zde. */
  add(rate: StoredRate, actor: CurrentUser): Promise<void>;
}

/** Vše dohromady — předává se komponentám přes React context. */
export interface RepositorySet {
  users: IUserRepository;
  userAdmin: IUserAdminRepository;
  settings: ISettingsRepository;
  projects: IProjectRepository;
  partners: IPartnerRepository;
  tasks: ITaskRepository;
  documents: IDocumentRepository;
  orders: IOrderRepository;
  rates: IRatesRepository;
  numbering: INumberingRepository;
  install: IInstallRepository;
}
