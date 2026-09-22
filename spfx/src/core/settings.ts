/**
 * Nastavení aplikace — tvar, výchozí hodnoty a kontrola.
 *
 * Nastavení se ukládá do seznamu `PRM_Settings` jako dvojice klíč/hodnota,
 * kde hodnota je JSON. Tím se dá nastavení rozšiřovat bez zásahu do schématu.
 *
 * Vrstva `core` — žádná závislost na SharePointu.
 */

import { DEFAULT_ROLE_GROUPS, RoleGroupMapping } from './roles';

/** Klíče v seznamu PRM_Settings. Jeden klíč = jedna položka seznamu. */
export enum SettingKey {
  Folders = 'folders',
  Numbering = 'numbering',
  Projects = 'projects',
  Budget = 'budget',
  Approvals = 'approvals',
  Roles = 'roles',
  Company = 'company'
}

/** Uzel stromu šablony složek projektu. */
export interface FolderTemplateNode {
  name: string;
  children?: FolderTemplateNode[];
}

/** Nastavení umístění a struktury projektových složek. */
export interface FolderSettings {
  /** Absolutní URL webu, kde leží knihovna projektů. Prázdné = stejný web jako aplikace. */
  siteUrl: string;
  /** Název knihovny dokumentů, např. „Dokumenty" nebo „Shared Documents". */
  libraryTitle: string;
  /** Kořenová složka v knihovně, např. „Projekty". Prázdné = kořen knihovny. */
  rootFolder: string;
  /** Zakládat podsložku podle roku projektu (Projekty/2026/26-014 …). */
  subfolderByYear: boolean;
  /** Šablona složek. Více šablon podle typu projektu se doplní ve Fázi 1. */
  template: FolderTemplateNode[];
}

/** Nastavení generování názvu projektu. */
export interface ProjectSettings {
  /**
   * Vzor názvu projektu. Tokeny: {CISLO}, {ZAKAZNIK}, {LOKALITA}, {TYP}, {ROK}.
   * PM může vygenerovaný název před uložením upravit.
   */
  titlePattern: string;
  /** Typy projektů — nabídka v průvodci. */
  projectTypes: string[];
  /** Číslo projektu „Režie" (IsOverhead = true). Vyplní se po jejím založení. */
  overheadProjectNumber: string;
}

/** Nastavení rozpočtu a semaforu. */
export interface BudgetSettings {
  /** Kategorie položek realizačního rozpočtu. */
  categories: string[];
  /** Horní hranice žluté v procentech odchylky (výchozí 5 = do +5 % žlutá, nad červená). */
  yellowThresholdPercent: number;
  /** Minimální plánovaná marže v procentech. Pod ní je semafor červený bez ohledu na odchylku. */
  minimumMarginPercent: number;
}

/**
 * Nastavení schvalování objednávek (limity bez DPH v Kč).
 *
 * Tři hranice = čtyři pásma; kdo v kterém schvaluje, popisuje
 * `describeApprovalLadder` v `core/approval.ts`.
 */
export interface ApprovalSettings {
  /** Do této částky schvaluje PM projektu. */
  pmLimit: number;
  /** Nad pmLimit do vedeniLimit schvaluje navíc Vedení. */
  vedeniLimit: number;
  /** Nad vedeniLimit schvaluje navíc jednatel. Nad tuto částku jde objednávka na valnou hromadu. */
  jednatelLimit: number;
  /**
   * Objednávka, kterou vystavil sám PM a je do pmLimit, se považuje za schválenou.
   * Vypnuto = i vlastní objednávku PM musí schválit Vedení.
   */
  pmSelfApprovalEnabled: boolean;
  /** Projekt Režie: schvaluje vždy Vedení bez ohledu na částku. */
  overheadRequiresVedeni: boolean;
}

/** Fakturační a kontaktní údaje RES pro hlavičky a patičky PDF. */
export interface CompanySettings {
  name: string;
  street: string;
  city: string;
  zip: string;
  ico: string;
  dic: string;
  /** E-mail účtárny — kam chodí podklady pro fakturaci. */
  accountingEmail: string;
  /** Claim do patičky PDF. */
  claim: string;
}

/** Celé nastavení aplikace. */
export interface AppSettings {
  folders: FolderSettings;
  numbering: Record<string, unknown>;
  projects: ProjectSettings;
  budget: BudgetSettings;
  approvals: ApprovalSettings;
  roles: RoleGroupMapping;
  company: CompanySettings;
}

/**
 * Výchozí struktura složek projektu podle zadání (kap. 8.3).
 * Zadavatel ji ve Fázi 1 upřesní — proto je editovatelná v Nastavení.
 */
export const DEFAULT_FOLDER_TEMPLATE: FolderTemplateNode[] = [
  { name: '01_Smlouvy a objednávky zákazníka' },
  { name: '02_Projektová dokumentace' },
  {
    name: '03_Nákup',
    children: [{ name: 'Objednávky' }, { name: 'Nabídky dodavatelů' }]
  },
  { name: '04_Fakturace' },
  {
    name: '05_Realizace',
    children: [{ name: 'Fotodokumentace' }, { name: 'Stavební deník' }]
  },
  { name: '06_Předání a revize' },
  { name: '07_Korespondence' },
  { name: '08_Rozpočet a harmonogram' }
];

/**
 * Výchozí nastavení. Použije se, dokud administrátor nastavení neuloží.
 * Hodnoty označené „upřesní zadavatel" jsou návrh, ne závazek.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  folders: {
    siteUrl: '',
    libraryTitle: 'Dokumenty',
    rootFolder: 'Projekty',
    subfolderByYear: true,
    template: DEFAULT_FOLDER_TEMPLATE
  },
  numbering: {},
  projects: {
    titlePattern: '{CISLO} {ZAKAZNIK} – {LOKALITA} – {TYP}',
    projectTypes: [
      'FVE',
      'BESS',
      'MVE',
      'Vítr',
      'Kogenerace',
      'Připojení DS',
      'Servis',
      'Režie',
      'Jiné'
    ],
    overheadProjectNumber: ''
  },
  budget: {
    categories: [
      'Materiál',
      'Subdodávky a služby',
      'Vlastní práce',
      'Doprava',
      'Ostatní',
      'Rezerva'
    ],
    yellowThresholdPercent: 5,
    minimumMarginPercent: 10
  },
  approvals: {
    // Zadáno zadavatelem 22. 9. 2026. Dají se kdykoli změnit v Nastavení.
    pmLimit: 100000,
    vedeniLimit: 500000,
    jednatelLimit: 1000000,
    pmSelfApprovalEnabled: true,
    overheadRequiresVedeni: true
  },
  roles: DEFAULT_ROLE_GROUPS,
  company: {
    name: 'Revoltum Engineering & Services',
    street: 'Havířská 1021',
    city: 'Havlíčkův Brod',
    zip: '580 01',
    ico: '',
    dic: '',
    accountingEmail: '',
    claim: 'Revoltujte s námi za moderní decentralizovanou energetiku'
  }
};

/**
 * Doplní chybějící klíče výchozími hodnotami.
 *
 * Proč: nastavení se ukládá po částech a aplikace se v čase rozšiřuje.
 * Když přibude nová volba, starší uložené nastavení ji nemá — a aplikace
 * by spadla na `undefined`. Tohle to ošetří na jednom místě.
 */
export function withDefaults(stored: Partial<AppSettings> | undefined): AppSettings {
  const s = stored ?? {};
  return {
    folders: { ...DEFAULT_SETTINGS.folders, ...(s.folders ?? {}) },
    numbering: { ...DEFAULT_SETTINGS.numbering, ...(s.numbering ?? {}) },
    projects: { ...DEFAULT_SETTINGS.projects, ...(s.projects ?? {}) },
    budget: { ...DEFAULT_SETTINGS.budget, ...(s.budget ?? {}) },
    approvals: { ...DEFAULT_SETTINGS.approvals, ...(s.approvals ?? {}) },
    roles: { ...DEFAULT_SETTINGS.roles, ...(s.roles ?? {}) },
    company: { ...DEFAULT_SETTINGS.company, ...(s.company ?? {}) }
  };
}

/**
 * Zkontroluje nastavení a vrátí seznam srozumitelných českých problémů.
 * Prázdné pole = nastavení je v pořádku.
 */
export function validateSettings(settings: AppSettings): string[] {
  const problems: string[] = [];

  if (!settings.folders.libraryTitle.trim()) {
    problems.push('Není vyplněn název knihovny, kam se zakládají složky projektů.');
  }
  if (settings.folders.template.length === 0) {
    problems.push('Šablona složek je prázdná — u nového projektu by nevznikly žádné podsložky.');
  }
  if (!settings.projects.titlePattern.includes('{CISLO}')) {
    problems.push('Vzor názvu projektu musí obsahovat token {CISLO}, jinak by názvy nebyly jednoznačné.');
  }
  if (settings.projects.projectTypes.length === 0) {
    problems.push('Není zadán žádný typ projektu.');
  }
  if (settings.budget.categories.length === 0) {
    problems.push('Není zadána žádná kategorie rozpočtu.');
  }
  if (settings.budget.yellowThresholdPercent < 0) {
    problems.push('Práh žlutého semaforu nesmí být záporný.');
  }
  const a = settings.approvals;
  if (a.pmLimit < 0 || a.vedeniLimit < 0 || a.jednatelLimit < 0) {
    problems.push('Limity schvalování nesmí být záporné.');
  }
  if (a.vedeniLimit < a.pmLimit) {
    problems.push(
      'Limit vedení je nižší než limit projektového manažera. ' +
        'Schvalovací pravidla by se překrývala — limit vedení musí být vyšší.'
    );
  }
  if (a.jednatelLimit < a.vedeniLimit) {
    problems.push(
      'Limit jednatele je nižší než limit vedení. ' +
        'Schvalovací pravidla by se překrývala — limit jednatele musí být vyšší.'
    );
  }

  return problems;
}
