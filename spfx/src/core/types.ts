import type { Dependency } from './schedule';

import type { FolderMap } from './projectFolders';
/**
 * Doménové typy PRM Revoltum.
 *
 * Tento soubor je součástí vrstvy `core` — čistá doménová logika.
 * NESMÍ importovat SharePoint, PnPjs ani React.
 */

/** Role uživatele v aplikaci. Odpovídají SharePoint skupinám (názvy v Nastavení). */
export enum Role {
  /** Vše: Nastavení, Instalace, správa rolí, číselné řady, šablony složek. */
  Administrator = 'Administrator',
  /** Vidí všechny projekty, schvaluje objednávky nad limit a realizační rozpočty. */
  Vedeni = 'Vedeni',
  /** Schvaluje objednávky nad limit vedení. */
  Jednatel = 'Jednatel',
  /** Firemní CF, důvěrné položky, Excel report pro FO. Ověřuje se i přístupem na web PRM-Finance. */
  Finance = 'Finance',
  /** Zakládá a spravuje své projekty, schvaluje objednávky ve svém limitu. */
  ProjektovyManazer = 'ProjektovyManazer',
  /** Pracuje na přiřazených projektech, ale neschvaluje. */
  AsistentPM = 'AsistentPM',
  /** Modul Servis: lokality, zařízení, požadavky; kontroluje provedení a odemyká fakturaci. Servisní projekty vidí jen role Servisu. */
  SpravceServisu = 'SpravceServisu',
  /** Modul Servis: pod správcem servisu — zapisuje požadavky, zakládá servisní listy a objednává dodavatele. */
  Dispecer = 'Dispecer',
  /** Jen čtení projektů. */
  Ctenar = 'Ctenar'
}

/** České popisky rolí pro UI. */
export const ROLE_LABELS: Record<Role, string> = {
  [Role.Administrator]: 'Administrátor PRM',
  [Role.Vedeni]: 'Vedení',
  [Role.Jednatel]: 'Jednatel',
  [Role.Finance]: 'Finance – důvěrné',
  [Role.ProjektovyManazer]: 'Projektový manažer',
  [Role.AsistentPM]: 'Asistent PM',
  [Role.SpravceServisu]: 'Správce servisu',
  [Role.Dispecer]: 'Dispečer servisu',
  [Role.Ctenar]: 'Čtenář'
};

/** Přihlášený uživatel se zjištěnými rolemi. */
export interface CurrentUser {
  /** ID uživatele v SharePointu (číslo položky v seznamu uživatelů webu). */
  id: number;
  /** Přihlašovací jméno, např. i:0#.f|membership|jan.novak@revoltum.cz */
  loginName: string;
  /** Zobrazované jméno, např. Jan Novák. */
  displayName: string;
  email: string;
  /** Role zjištěné z členství ve skupinách SharePointu. Uživatel může mít více rolí. */
  roles: Role[];
  /** Je členem skupiny vlastníků webu / tenant admin? Pak má vždy práva administrátora. */
  isSiteAdmin: boolean;
  /**
   * Má uživatel přístup na web PRM-Finance?
   * Zjišťuje se skutečným dotazem na web, ne jen podle skupiny — SharePoint je autorita.
   */
  hasFinanceAccess: boolean;
}

/** Stav projektu. */
export enum ProjectStatus {
  Nabidka = 'Nabídka',
  Priprava = 'Příprava',
  Realizace = 'Realizace',
  Pozastaveno = 'Pozastaveno',
  Dokonceno = 'Dokončeno',
  /** Reklamace už dokončeného projektu. */
  Reklamace = 'Reklamace',
  Storno = 'Storno'
}

/**
 * Stav „Uzavřeno" se zrušil (byl nadbytečný vedle „Dokončeno"). Projekty, které ho
 * ještě mají uložené, se berou jako dokončené.
 */
export const LEGACY_STATUS_UZAVRENO = 'Uzavřeno';

/** Stavy, které se počítají jako „aktivní projekt" na dashboardu. */
export const ACTIVE_PROJECT_STATUSES: ProjectStatus[] = [
  ProjectStatus.Nabidka,
  ProjectStatus.Priprava,
  ProjectStatus.Realizace,
  ProjectStatus.Pozastaveno
];

/**
 * Semafor rozpočtu podle aktuální marže z prognózy (hranice jsou v Nastavení; výchozí 15 / 10 / 5 %):
 * zelená od 15 %, světle zelená od 10 %, žlutá od 5 %, červená pod 5 %, tmavě červená při záporné marži.
 */
export enum BudgetStatus {
  Zelena = 'Zelená',
  SvetleZelena = 'Světle zelená',
  Zluta = 'Žlutá',
  Cervena = 'Červená',
  TmaveCervena = 'Tmavě červená',
  /** Projekt nemá rozpočet nebo výnosy — marže se nedá spočítat. */
  Bez = 'Bez rozpočtu'
}

/** Projekt — minimální tvar pro Fázi 0 (dashboard a mock data). Rozšiřuje se ve Fázi 1. */
export interface Project {
  id: number;
  projectNumber: string;
  title: string;
  shortName?: string;
  customerName?: string;
  projectManagerName?: string;
  /** Přihlašovací jméno PM — podle něj se rozhoduje, kdo smí projekt upravovat. */
  projectManagerLogin?: string;
  /** Přihlašovací jména asistentů PM — ti smí projekt upravovat také. */
  assistantLogins?: string[];
  status: ProjectStatus;
  projectType?: string;
  location?: string;
  /** Poloha na mapě (WGS 84). Chybí u projektů, kterým ji zatím nikdo nezadal. */
  latitude?: number;
  longitude?: number;
  contractPriceNet?: number;
  currency: string;
  startDate?: Date;
  endDatePlanned?: Date;
  endDateActual?: Date;
  /** Nejbližší smluvní termín plnění — cache, počítá se z PRM_Tasks. */
  nextDeadline?: Date;
  folderUrl?: string;
  /** Kde má projekt složky objednávek, fakturace, zápisů a fotek (viz `core/projectFolders.ts`); bez ní platí výchozí cesty z Nastavení. */
  folderMap?: FolderMap;
  /** Projekt „Režie" sbírá režijní objednávky a náklady. */
  isOverhead: boolean;
  budgetStatus: BudgetStatus;
  budgetBaselineTotal?: number;
  costForecastTotal?: number;
  /** Součty rozpočtu v Kč (cache): plán nákupu, plán výnosů (smluvní cena) a nakoupeno; `budgetApproved` = rozpočet už někdo schválil. */
  budgetCostTotal?: number;
  budgetSaleTotal?: number;
  budgetActualTotal?: number;
  budgetApproved?: boolean;
  /** Cache marží (Kč): prognóza tržeb (spolu s prognózou nákladů dává aktuální marži) a marže při schválení v % a v Kč. */
  budgetRevenueForecast?: number;
  budgetMarginApproved?: number;
  budgetMarginApprovedAmount?: number;
}

/** Typ položky harmonogramu (PRM_Tasks). */
export enum TaskType {
  Cinnost = 'Činnost',
  DodavkaMaterialu = 'Dodávka materiálu',
  Sluzba = 'Služba',
  Milnik = 'Milník'
}

/**
 * Položka harmonogramu. Ve Fázi 1 se používají jen **smluvní termíny**
 * (`isContractualDeadline`) jako milníky; zbytek polí naplní Fáze 4 (Gantt).
 */
export interface ProjectTask {
  id: number;
  /** Číslo projektu, ke kterému termín patří. */
  projectNumber: string;
  title: string;
  taskType: TaskType;
  /** Termín plnění. U milníku je to jediné datum, které dává smysl. */
  finishDate?: Date;
  startDate?: Date;
  /** Smluvní termín plnění — počítá se do „nejbližšího termínu" na dashboardu. */
  isContractualDeadline: boolean;
  percentComplete: number;
  responsibleName?: string;
  /** Pořadí v seznamu. Chybí-li, řadí se podle termínu. */
  sortOrder?: number;
  /** Harmonogram (Fáze 4): číslo v členění úkolů (WBS), trvání v pracovních dnech, předchůdci a baseline. */
  wbs?: string;
  durationDays?: number;
  predecessors?: Dependency[];
  baselineStart?: Date;
  baselineFinish?: Date;
  /** Uložený výsledek výpočtu kritické cesty a ruční příznak „sledovat jako kritické“. */
  isCritical?: boolean;
  watchAsCritical?: boolean;
}

/** Měna. Výchozí CZK; EUR se ukládá s kurzem k datu. */
export type Currency = 'CZK' | 'EUR' | 'USD';

/** Typ partnera. */
export enum PartnerType {
  Zakaznik = 'Zákazník',
  Dodavatel = 'Dodavatel',
  Oboji = 'Obojí'
}

/** Zákazník nebo dodavatel (PRM_Partners). */
export interface Partner {
  id: number;
  /** Název — uložený ve sloupci Title. */
  name: string;
  partnerType: PartnerType;
  /** Dvoupísmenný kód země (ISO). Prázdný = Česko — tak vznikli partneři před zavedením sloupce. */
  country?: string;
  ico?: string;
  dic?: string;
  /** Plátce DPH — dá se dotáhnout z ARES podle IČO, nebo nastavit ručně. */
  isVatPayer?: boolean;
  address?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  paymentTermDays?: number;
  isActive: boolean;
}
