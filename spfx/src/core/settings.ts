/**
 * Nastavení aplikace — tvar, výchozí hodnoty a kontrola.
 *
 * Nastavení se ukládá do seznamu `PRM_Settings` jako dvojice klíč/hodnota,
 * kde hodnota je JSON. Tím se dá nastavení rozšiřovat bez zásahu do schématu.
 *
 * Vrstva `core` — žádná závislost na SharePointu.
 */

import { CURRENCY_CODES, CurrencyCode } from './currency';
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
  /** Kam se ukládají zápisy a stavební deníky (cesta uvnitř složky projektu; chybějící složky vzniknou při prvním uložení). */
  diaryFolder: string;
  /** Kam se ukládá fotodokumentace (cesta uvnitř složky projektu; uvnitř vznikají složky podle roku a dne). */
  photoFolder: string;
  /** Kam se ukládají PDF objednávek (cesta uvnitř složky projektu). */
  orderFolder: string;
  /** Kam se ukládají PDF podkladů pro fakturaci (cesta uvnitř složky projektu). */
  invoiceFolder: string;
  /**
   * Šablona složek **projektu Režie** — Režie má jinou strukturu než běžný projekt (nevede se u ní deník, fakturace ani fotky).
   * Složka Režie je `99900-Režie/<rok>`; tato šablona se zakládá uvnitř roku.
   */
  overheadTemplate: FolderTemplateNode[];
  /** Kam se u Režie ukládají PDF objednávek (cesta uvnitř složky Režie; má patřit do šablony Režie). */
  overheadOrderFolder: string;
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
  /**
   * Výchozí měna **přehledů** (seznam projektů, objednávek, podkladů, KPI, grafy). Částky v jiné měně se přepočítají kurzem ČNB.
   * Doklady samotné zůstávají v měně dokladu (CZK, EUR, USD).
   */
  defaultCurrency: CurrencyCode;
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
  /**
   * Kurz eura v korunách, kterým se objednávky v EUR přepočítají **jen pro určení pásma schvalování**
   * (limity jsou v Kč). Na objednávce zůstává částka v eurech.
   */
  eurRateForLimits: number;
  /** Totéž pro americké dolary. Platí, dokud v seznamu kurzů není zapsaný kurz ČNB. */
  usdRateForLimits: number;
  /**
   * Číselník výchozích schvalovatelů: kdo se předvyplní u kroku vedení a jednatele. U kroku projektového
   * manažera je výchozí vždy PM projektu. Žadatel může předvyplněného schvalovatele při odeslání změnit.
   * Bez výchozí osoby smí krok schválit kdokoli z příslušné role.
   */
  defaultApprovers?: {
    vedeni?: { login: string; name: string };
    jednatel?: { login: string; name: string };
  };
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
 * Výchozí struktura složek nového projektu — **stejná jako ve skutečných projektech RES** (ověřeno 1. 10. 2026 na projektu 26001).
 * Konvence: dvojčíslí, pomlčka, název (`04-Zápisy`). Je editovatelná v Nastavení.
 */
export const DEFAULT_FOLDER_TEMPLATE: FolderTemplateNode[] = [
  { name: '01-Nabídky' },
  { name: '02-Harmonogram' },
  { name: '03-Nákup', children: [{ name: 'Objednávky' }] },
  { name: '03-Rozpočet projektu', children: [{ name: 'Fakturace' }] },
  { name: '04-Zápisy' },
  { name: '05-Smlouvy' },
  { name: '06-Dodavatelé' },
  { name: '07-Dokumentace a podklady' },
  { name: '09-Projektová dokumentace' },
  { name: '10-Servis' }
];

/** Výchozí struktura složek Režie (návrh — upraví zadavatel v Nastavení). Jiná než u běžného projektu. */
export const DEFAULT_OVERHEAD_TEMPLATE: FolderTemplateNode[] = [
  { name: '01-Objednávky' },
  { name: '02-Smlouvy a pojištění' },
  { name: '03-Faktury přijaté' },
  { name: '04-Ostatní' }
];

/**
 * Výchozí nastavení. Použije se, dokud administrátor nastavení neuloží.
 * Hodnoty označené „upřesní zadavatel" jsou návrh, ne závazek.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  folders: {
    // Rozhodnuto 23. 9. 2026: aplikace poběží na vlastním webu /sites/PRM,
    // ale složky projektů zůstanou tam, kde jsou dnes — na firemním webu,
    // aby lidem dál fungovala synchronizace přes OneDrive a nemuseli nic hledat jinde.
    siteUrl: 'https://revoltum.sharepoint.com/sites/RevoltumEngineeringServices',
    libraryTitle: 'Dokumenty',
    rootFolder: 'General/01_PROJEKTY',
    // Projekty leží v 01_PROJEKTY přímo, bez mezipatra podle roku.
    // Ověřeno na skutečné složce 23. 9. 2026.
    subfolderByYear: false,
    template: DEFAULT_FOLDER_TEMPLATE,
    // Rozhodnuto 1. 10. 2026 podle zadavatele a skutečné struktury projektů (jedna konvence: dvojčíslí-pomlčka-název).
    diaryFolder: '04-Zápisy',
    photoFolder: '07-Dokumentace a podklady/FOTO',
    orderFolder: '03-Nákup/Objednávky',
    invoiceFolder: '03-Rozpočet projektu/Fakturace',
    overheadTemplate: DEFAULT_OVERHEAD_TEMPLATE,
    overheadOrderFolder: '01-Objednávky'
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
    minimumMarginPercent: 10,
    defaultCurrency: 'CZK'
  },
  approvals: {
    // Zadáno zadavatelem 22. 9. 2026. Dají se kdykoli změnit v Nastavení.
    pmLimit: 100000,
    vedeniLimit: 500000,
    jednatelLimit: 1000000,
    // Rozhodnutí zadavatele (30. 9. 2026): i malou objednávku vystavenou PM schvaluje vedení.
    pmSelfApprovalEnabled: false,
    overheadRequiresVedeni: true,
    eurRateForLimits: 25,
    usdRateForLimits: 23
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
  if (!settings.folders.diaryFolder.trim()) {
    problems.push('Není vyplněna složka zápisů a stavebních deníků.');
  }
  if (!settings.folders.photoFolder.trim()) {
    problems.push('Není vyplněna složka fotodokumentace.');
  }
  if (!settings.folders.orderFolder.trim()) {
    problems.push('Není vyplněna složka objednávek.');
  }
  if (!settings.folders.invoiceFolder.trim()) {
    problems.push('Není vyplněna složka podkladů pro fakturaci.');
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
  if (CURRENCY_CODES.indexOf(settings.budget.defaultCurrency) === -1) {
    problems.push('Výchozí měna přehledů musí být CZK, EUR nebo USD.');
  }
  if (settings.budget.yellowThresholdPercent < 0) {
    problems.push('Práh žlutého semaforu nesmí být záporný.');
  }
  const a = settings.approvals;
  if (!(a.eurRateForLimits > 0) || !(a.usdRateForLimits > 0)) {
    problems.push('Nouzové kurzy EUR a USD musí být kladná čísla.');
  }
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

/** Nouzové kurzy z Nastavení — použijí se, dokud v seznamu kurzů není zapsaný kurz ČNB. */
export function fallbackRatesOf(a: ApprovalSettings): { EUR: number; USD: number } {
  return { EUR: a.eurRateForLimits, USD: a.usdRateForLimits };
}
