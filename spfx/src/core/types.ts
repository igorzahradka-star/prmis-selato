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
  /** Vidí všechny zakázky, schvaluje objednávky nad limit a realizační rozpočty. */
  Vedeni = 'Vedeni',
  /** Firemní CF, důvěrné položky, Excel report pro FO. Ověřuje se i přístupem na web PRM-Finance. */
  Finance = 'Finance',
  /** Zakládá a spravuje své zakázky, schvaluje objednávky ve svém limitu. */
  ProjektovyManazer = 'ProjektovyManazer',
  /** Pracuje na přiřazených zakázkách, ale neschvaluje. */
  AsistentPM = 'AsistentPM',
  /** Jen čtení zakázek. */
  Ctenar = 'Ctenar'
}

/** České popisky rolí pro UI. */
export const ROLE_LABELS: Record<Role, string> = {
  [Role.Administrator]: 'Administrátor PRM',
  [Role.Vedeni]: 'Vedení',
  [Role.Finance]: 'Finance – důvěrné',
  [Role.ProjektovyManazer]: 'Projektový manažer',
  [Role.AsistentPM]: 'Asistent PM',
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

/** Stav zakázky. */
export enum ProjectStatus {
  Nabidka = 'Nabídka',
  Priprava = 'Příprava',
  Realizace = 'Realizace',
  Pozastaveno = 'Pozastaveno',
  Dokonceno = 'Dokončeno',
  Uzavreno = 'Uzavřeno',
  Storno = 'Storno'
}

/** Stavy, které se počítají jako „aktivní zakázka" na dashboardu. */
export const ACTIVE_PROJECT_STATUSES: ProjectStatus[] = [
  ProjectStatus.Nabidka,
  ProjectStatus.Priprava,
  ProjectStatus.Realizace,
  ProjectStatus.Pozastaveno
];

/** Semafor rozpočtu. */
export enum BudgetStatus {
  /** Odchylka prognózy proti baseline ≤ 0 %. */
  Zelena = 'Zelená',
  /** Odchylka 0 až +5 %. */
  Zluta = 'Žlutá',
  /** Odchylka > +5 % nebo marže pod minimem. */
  Cervena = 'Červená',
  /** Zakázka nemá schválenou baseline — semafor se nepočítá. */
  Bez = 'Bez rozpočtu'
}

/** Zakázka — minimální tvar pro Fázi 0 (dashboard a mock data). Rozšiřuje se ve Fázi 1. */
export interface Project {
  id: number;
  projectNumber: string;
  title: string;
  shortName?: string;
  customerName?: string;
  projectManagerName?: string;
  status: ProjectStatus;
  projectType?: string;
  location?: string;
  contractPriceNet?: number;
  currency: string;
  startDate?: Date;
  endDatePlanned?: Date;
  endDateActual?: Date;
  /** Nejbližší smluvní termín plnění — cache, počítá se z PRM_Tasks. */
  nextDeadline?: Date;
  folderUrl?: string;
  /** Zakázka „Režie" sbírá režijní objednávky a náklady. */
  isOverhead: boolean;
  budgetStatus: BudgetStatus;
  budgetBaselineTotal?: number;
  costForecastTotal?: number;
}

/** Měna. Výchozí CZK; EUR se ukládá s kurzem k datu. */
export type Currency = 'CZK' | 'EUR';
