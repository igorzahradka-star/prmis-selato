/**
 * Popis datové struktury PRM Revoltum.
 *
 * Tento soubor je JEDINÝ zdroj pravdy o tom, jak vypadají SharePoint seznamy.
 * Instalační průvodce (Správa → Instalace a diagnostika) podle něj:
 *   1. zjistí, co chybí,
 *   2. chybějící části **přidá**.
 * Nikdy nic nemaže ani nepřepisuje. Viz CLAUDE.md, kap. 6.
 *
 * PŘI KAŽDÉ ZMĚNĚ SCHÉMATU:
 *   - zvyš SCHEMA_VERSION,
 *   - doplň řádek do CHANGELOG.md,
 *   - nové sloupce přidávej, staré nikdy nemaž ani nepřejmenovávej
 *     (v SharePointu už můžou být data a přejmenování rozbije pohledy).
 */

/**
 * Verze schématu. Ukládá se do PRM_Settings pod klíčem `schemaVersion`.
 * Průvodce porovná uloženou verzi s touto a nabídne doplnění rozdílu.
 */
export const SCHEMA_VERSION = 21;

/** Typ sloupce v SharePointu. */
export type FieldType =
  | 'Text'
  | 'Note' // víceřádkový text
  | 'Number'
  | 'Currency'
  | 'DateTime'
  | 'Boolean'
  | 'Choice'
  | 'MultiChoice'
  | 'User'
  | 'UserMulti'
  | 'Lookup'
  | 'Url';

/** Definice jednoho sloupce. */
export interface FieldDef {
  /** Interní název — anglicky, bez diakritiky, bez mezer. Nikdy neměnit. */
  name: string;
  /** Zobrazovaný název — česky. Měnit se smí. */
  title: string;
  type: FieldType;
  /** Povinný sloupec. */
  required?: boolean;
  /** Hodnoty pro Choice / MultiChoice. */
  choices?: string[];
  /** Výchozí hodnota. */
  defaultValue?: string;
  /** Počet desetinných míst u Number / Currency. */
  decimals?: number;
  /** Cílový seznam u Lookup (název seznamu z LISTS). */
  lookupList?: string;
  /** Sloupec cílového seznamu, který se u Lookup zobrazuje. */
  lookupField?: string;
  /**
   * Založit index. Povinné u sloupců, podle kterých se filtruje —
   * bez indexu SharePoint odmítne dotaz nad 5 000 položkami.
   */
  indexed?: boolean;
  /** Popis pro uživatele — zobrazí se v SharePointu u sloupce. */
  description?: string;
}

/** Definice seznamu nebo knihovny dokumentů. */
export interface ListDef {
  /** Interní název (URL seznamu). Anglicky. Nikdy neměnit. */
  name: string;
  /** Zobrazovaný název — česky. */
  title: string;
  description: string;
  /** `list` = seznam položek, `library` = knihovna dokumentů. */
  kind: 'list' | 'library';
  /** Na kterém webu seznam leží. */
  site: 'PRM' | 'PRM-Finance';
  /** Zapnout historii verzí — kvůli auditu (kdo, kdy, co změnil). */
  versioning: boolean;
  fields: FieldDef[];
}

// --- Číselníky používané ve více seznamech -------------------------------

export const PROJECT_STATUS_CHOICES = [
  'Nabídka',
  'Příprava',
  'Realizace',
  'Pozastaveno',
  'Dokončeno',
  'Reklamace',
  'Storno'
];

export const BUDGET_STATUS_CHOICES = ['Zelená', 'Žlutá', 'Červená', 'Bez rozpočtu'];

export const PO_STATUS_CHOICES = [
  'Koncept',
  'Ke schválení',
  'Schváleno',
  'Vráceno k úpravě',
  'Zamítnuto',
  'Odesláno dodavateli',
  'Dodáno',
  'Uzavřeno',
  'Storno'
];

export const INVOICE_BASIS_STATUS_CHOICES = [
  'Koncept',
  'Ke kontrole',
  'Předáno účtárně',
  'Vyfakturováno',
  'Uhrazeno',
  'Storno'
];

export const TASK_TYPE_CHOICES = ['Činnost', 'Dodávka materiálu', 'Služba', 'Milník'];

export const DIRECTION_CHOICES = ['Příjem', 'Výdaj'];

// --- Seznamy na webu PRM -------------------------------------------------

const PRM_SETTINGS: ListDef = {
  name: 'PRM_Settings',
  title: 'PRM – Nastavení',
  description: 'Nastavení aplikace ve tvaru klíč / hodnota (JSON). Needitovat ručně.',
  kind: 'list',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'SettingKey', title: 'Klíč', type: 'Text', required: true, indexed: true },
    { name: 'SettingValue', title: 'Hodnota (JSON)', type: 'Note' }
  ]
};

const PRM_DOCTYPES: ListDef = {
  name: 'PRM_DocTypes',
  title: 'PRM – Typy dokumentů',
  description: 'Číselné řady dokumentů: vzor čísla, reset, rozsah.',
  kind: 'list',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'Code', title: 'Kód', type: 'Text', required: true, indexed: true, description: 'PRJ, OBJ, FP, PP…' },
    { name: 'Pattern', title: 'Vzor čísla', type: 'Text', required: true, description: 'Tokeny {PREFIX} {YYYY} {YY} {N} {PRJ}' },
    { name: 'Padding', title: 'Počet míst', type: 'Number', decimals: 0, defaultValue: '3' },
    { name: 'ResetPeriod', title: 'Reset', type: 'Choice', choices: ['Ročně', 'Nikdy'], defaultValue: 'Ročně' },
    { name: 'Scope', title: 'Rozsah', type: 'Choice', choices: ['Globální', 'Projekt'], defaultValue: 'Globální' },
    { name: 'StartValue', title: 'Počáteční hodnota', type: 'Number', decimals: 0, defaultValue: '1' },
    { name: 'Active', title: 'Aktivní', type: 'Boolean', defaultValue: '1' }
  ]
};

const PRM_COUNTERS: ListDef = {
  name: 'PRM_Counters',
  title: 'PRM – Čítače',
  description:
    'Poslední přidělené číslo pro každou řadu. Needitovat ručně — hrozí duplicitní čísla dokladů.',
  kind: 'list',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'DocTypeCode', title: 'Kód typu', type: 'Text', required: true, indexed: true },
    { name: 'Year', title: 'Rok', type: 'Number', decimals: 0, indexed: true },
    { name: 'ScopeKey', title: 'Klíč rozsahu', type: 'Text', indexed: true, description: 'Prázdné u globální řady, jinak číslo projektu.' },
    { name: 'LastValue', title: 'Poslední hodnota', type: 'Number', decimals: 0, defaultValue: '0' }
  ]
};

const PRM_PARTNERS: ListDef = {
  name: 'PRM_Partners',
  title: 'PRM – Partneři',
  description: 'Zákazníci a dodavatelé.',
  kind: 'list',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'PartnerType', title: 'Typ', type: 'Choice', choices: ['Zákazník', 'Dodavatel', 'Obojí'], required: true, indexed: true },
    { name: 'Country', title: 'Země', type: 'Text', description: 'Dvoupísmenný kód země (ISO), např. CZ, SK, DE. Prázdné = Česko.' },
    { name: 'ICO', title: 'IČO', type: 'Text', indexed: true, description: 'U zahraničních partnerů registrační číslo firmy.' },
    { name: 'DIC', title: 'DIČ', type: 'Text', description: 'U zahraničních partnerů včetně předpony země, např. SK2020317068.' },
    { name: 'IsVatPayer', title: 'Plátce DPH', type: 'Boolean', defaultValue: '0', description: 'Dá se dotáhnout z ARES podle IČO.' },
    { name: 'Address', title: 'Adresa', type: 'Note' },
    { name: 'ContactName', title: 'Kontaktní osoba', type: 'Text' },
    { name: 'Email', title: 'E-mail', type: 'Text' },
    { name: 'Phone', title: 'Telefon', type: 'Text' },
    { name: 'PaymentTermDays', title: 'Splatnost (dnů)', type: 'Number', decimals: 0, defaultValue: '30' },
    { name: 'IsActive', title: 'Aktivní', type: 'Boolean', defaultValue: '1' }
  ]
};

const PRM_PROJECTS: ListDef = {
  name: 'PRM_Projects',
  title: 'PRM – Projekty',
  description: 'Evidence projektů. Sloupec Název (Title) drží vygenerovaný název projektu.',
  kind: 'list',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'ProjectNumber', title: 'Číslo projektu', type: 'Text', required: true, indexed: true },
    { name: 'ShortName', title: 'Zkrácený název', type: 'Text' },
    { name: 'Customer', title: 'Zákazník', type: 'Lookup', lookupList: 'PRM_Partners', lookupField: 'Title', indexed: true },
    { name: 'ProjectManager', title: 'Projektový manažer', type: 'User', indexed: true },
    { name: 'Assistants', title: 'Asistenti', type: 'UserMulti' },
    { name: 'ProjectStatus', title: 'Stav', type: 'Choice', choices: PROJECT_STATUS_CHOICES, defaultValue: 'Nabídka', indexed: true },
    { name: 'ProjectType', title: 'Typ projektu', type: 'Choice', choices: ['FVE', 'BESS', 'MVE', 'Vítr', 'Kogenerace', 'Připojení DS', 'Servis', 'Režie', 'Jiné'], indexed: true },
    { name: 'ProjectYear', title: 'Rok', type: 'Number', decimals: 0, indexed: true, description: 'Rok projektu – pro filtrování dashboardu.' },
    { name: 'Location', title: 'Lokalita', type: 'Text' },
    { name: 'Latitude', title: 'Zeměpisná šířka', type: 'Number', decimals: 6, description: 'Poloha projektu na mapě. Nastavuje se v úpravě projektu výběrem místa na mapě.' },
    { name: 'Longitude', title: 'Zeměpisná délka', type: 'Number', decimals: 6, description: 'Poloha projektu na mapě. Nastavuje se v úpravě projektu výběrem místa na mapě.' },
    { name: 'InstalledPowerKWp', title: 'Výkon (kWp)', type: 'Number', decimals: 2 },
    { name: 'StorageCapacityKWh', title: 'Kapacita úložiště (kWh)', type: 'Number', decimals: 2 },
    { name: 'ContractNumber', title: 'Číslo smlouvy', type: 'Text' },
    { name: 'ContractPriceNet', title: 'Cena bez DPH', type: 'Currency', decimals: 2 },
    { name: 'Currency', title: 'Měna', type: 'Choice', choices: ['CZK', 'EUR', 'USD'], defaultValue: 'CZK' },
    { name: 'ExchangeRate', title: 'Kurz k CZK', type: 'Number', decimals: 4, description: 'Vyplňuje se jen u měny EUR.' },
    { name: 'StartDate', title: 'Zahájení', type: 'DateTime', indexed: true },
    { name: 'EndDatePlanned', title: 'Ukončení plánované', type: 'DateTime', indexed: true },
    { name: 'EndDateActual', title: 'Ukončení skutečné', type: 'DateTime' },
    { name: 'FolderUrl', title: 'Složka projektu', type: 'Url' },
    { name: 'IsOverhead', title: 'Režie', type: 'Boolean', defaultValue: '0', description: 'Projekt Režie sbírá režijní objednávky a náklady.' },
    { name: 'BudgetStatus', title: 'Semafor rozpočtu', type: 'Choice', choices: BUDGET_STATUS_CHOICES, defaultValue: 'Bez rozpočtu', indexed: true, description: 'Uložený výsledek výpočtu – kvůli rychlosti dashboardu.' },
    { name: 'BudgetBaselineTotal', title: 'Baseline rozpočtu', type: 'Currency', decimals: 2 },
    { name: 'CostForecastTotal', title: 'Prognóza nákladů', type: 'Currency', decimals: 2 },
    { name: 'BudgetCostTotal', title: 'Náklady rozpočtu (Kč)', type: 'Currency', decimals: 2, description: 'Uložený součet nákladů rozpočtu – kvůli rychlosti přehledu. Zapisuje aplikace.' },
    { name: 'BudgetSaleTotal', title: 'Prodej rozpočtu (Kč)', type: 'Currency', decimals: 2, description: 'Uložený součet prodeje rozpočtu. Zapisuje aplikace.' },
    { name: 'BudgetActualTotal', title: 'Skutečnost rozpočtu (Kč)', type: 'Currency', decimals: 2, description: 'Uložený součet koupeného/odpracovaného. Zapisuje aplikace.' },
    { name: 'BudgetApproved', title: 'Rozpočet schválen', type: 'Boolean', defaultValue: '0', description: 'Rozpočet byl aspoň jednou schválen vedením. Zapisuje aplikace.' },
    { name: 'BudgetRevenueForecast', title: 'Prognóza tržeb (Kč)', type: 'Currency', decimals: 2, description: 'Uložený součet prognózy tržeb z rozpočtu (s prognózou nákupu dává aktuální marži). Zapisuje aplikace.' },
    { name: 'BudgetMarginApproved', title: 'Marže při schválení (%)', type: 'Number', decimals: 2, description: 'Marže zafixovaná posledním schválením rozpočtu. Zapisuje aplikace.' },
    { name: 'BudgetMarginApprovedAmount', title: 'Marže při schválení (Kč)', type: 'Currency', decimals: 2, description: 'Zisk zafixovaný posledním schválením rozpočtu. Zapisuje aplikace.' },
    { name: 'NextDeadline', title: 'Nejbližší termín plnění', type: 'DateTime', indexed: true },
    { name: 'ProjectDescription', title: 'Popis', type: 'Note' },
    { name: 'FolderMap', title: 'Mapa složek', type: 'Note', description: 'Kde má projekt složky objednávek, fakturace, zápisů a fotek (JSON). Nastavuje aplikace při založení projektu a v detailu projektu (Složky projektu).' },
    { name: 'OverviewData', title: 'Project overview', type: 'Note', description: 'Údaje marketingového přehledu projektu (předmět realizace, výkon, kapacita, texty CZ/EN, fotky, souhlas zákazníka) jako JSON. Zapisuje aplikace (detail projektu → Project overview).' }
  ]
};

const PRM_TASKS: ListDef = {
  name: 'PRM_Tasks',
  title: 'PRM – Harmonogram',
  description: 'Položky harmonogramu a smluvní termíny plnění.',
  kind: 'list',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'Project', title: 'Projekt', type: 'Lookup', lookupList: 'PRM_Projects', lookupField: 'ProjectNumber', required: true, indexed: true },
    { name: 'WBS', title: 'WBS', type: 'Text' },
    { name: 'TaskType', title: 'Typ', type: 'Choice', choices: TASK_TYPE_CHOICES, defaultValue: 'Činnost', indexed: true },
    { name: 'StartDate', title: 'Zahájení', type: 'DateTime', indexed: true },
    { name: 'FinishDate', title: 'Ukončení', type: 'DateTime', indexed: true },
    { name: 'DurationDays', title: 'Trvání (dnů)', type: 'Number', decimals: 0 },
    { name: 'Predecessors', title: 'Předchůdci (JSON)', type: 'Note', description: '[{taskId, type: FS|SS|FF|SF, lagDays}]' },
    { name: 'PercentComplete', title: 'Dokončeno (%)', type: 'Number', decimals: 0, defaultValue: '0' },
    { name: 'IsContractualDeadline', title: 'Smluvní termín', type: 'Boolean', defaultValue: '0', indexed: true },
    { name: 'Responsible', title: 'Odpovídá', type: 'User' },
    { name: 'BaselineStart', title: 'Baseline zahájení', type: 'DateTime' },
    { name: 'BaselineFinish', title: 'Baseline ukončení', type: 'DateTime' },
    { name: 'IsCritical', title: 'Kritická cesta', type: 'Boolean', defaultValue: '0', description: 'Uložený výsledek výpočtu CPM.' },
    { name: 'WatchAsCritical', title: 'Sledovat jako kritické', type: 'Boolean', defaultValue: '0', description: 'Ruční příznak PM.' },
    { name: 'SortOrder', title: 'Pořadí', type: 'Number', decimals: 0 }
  ]
};

const PRM_BUDGET_ITEMS: ListDef = {
  name: 'PRM_BudgetItems',
  title: 'PRM – Položky rozpočtu',
  description: 'Položky realizačního rozpočtu projektu.',
  kind: 'list',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'Project', title: 'Projekt', type: 'Lookup', lookupList: 'PRM_Projects', lookupField: 'ProjectNumber', required: true, indexed: true },
    { name: 'ItemCode', title: 'Kód / WBS', type: 'Text' },
    { name: 'Category', title: 'Kategorie', type: 'Choice', choices: ['Materiál', 'Subdodávky a služby', 'Vlastní práce', 'Doprava', 'Ostatní', 'Rezerva'], indexed: true },
    { name: 'Supplier', title: 'Dodavatel', type: 'Lookup', lookupList: 'PRM_Partners', lookupField: 'Title' },
    { name: 'Quantity', title: 'Množství', type: 'Number', decimals: 3 },
    { name: 'Unit', title: 'MJ', type: 'Text' },
    { name: 'UnitCost', title: 'Cena za MJ', type: 'Currency', decimals: 2 },
    { name: 'PlannedCost', title: 'Plán', type: 'Currency', decimals: 2 },
    { name: 'BaselineCost', title: 'Baseline', type: 'Currency', decimals: 2 },
    { name: 'ForecastCost', title: 'Prognóza', type: 'Currency', decimals: 2 },
    { name: 'LinkedTask', title: 'Navázaná položka harmonogramu', type: 'Lookup', lookupList: 'PRM_Tasks', lookupField: 'Title' },
    { name: 'AdvancePercent', title: 'Záloha (%)', type: 'Number', decimals: 0, defaultValue: '0' },
    { name: 'PaymentTermDays', title: 'Splatnost (dnů)', type: 'Number', decimals: 0 },
    { name: 'PaymentDateOverride', title: 'Datum platby ručně', type: 'DateTime' },
    { name: 'Note', title: 'Poznámka', type: 'Note' }
  ]
};

const PRM_BUDGET_VERSIONS: ListDef = {
  name: 'PRM_BudgetVersions',
  title: 'PRM – Verze rozpočtu',
  description: 'Verze realizačního rozpočtu. Schválená verze je baseline.',
  kind: 'list',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'Project', title: 'Projekt', type: 'Lookup', lookupList: 'PRM_Projects', lookupField: 'ProjectNumber', required: true, indexed: true },
    { name: 'VersionNo', title: 'Verze', type: 'Number', decimals: 0, required: true },
    { name: 'VersionStatus', title: 'Stav', type: 'Choice', choices: ['Koncept', 'Ke schválení', 'Schváleno'], defaultValue: 'Koncept', indexed: true },
    { name: 'ApprovedBy', title: 'Schválil', type: 'User' },
    { name: 'ApprovedDate', title: 'Schváleno dne', type: 'DateTime' },
    { name: 'Comment', title: 'Komentář', type: 'Note' },
    { name: 'SnapshotFile', title: 'Snapshot (URL)', type: 'Url' },
    { name: 'TotalCost', title: 'Celkem', type: 'Currency', decimals: 2 },
    { name: 'TotalSale', title: 'Prodej celkem', type: 'Currency', decimals: 2 },
    { name: 'Content', title: 'Obsah rozpočtu (JSON)', type: 'Note', description: 'Skupiny, položky a sazby rozpočtu. Zapisuje aplikace.' },
    { name: 'Approvals', title: 'Schválení (JSON)', type: 'Note', description: 'Historie schválení rozpočtu (náklady, prodej, marže). Zapisuje aplikace.' },
    { name: 'RequestedByName', title: 'Žádost podal', type: 'Text' },
    { name: 'RequestedAt', title: 'Žádost podána dne', type: 'DateTime' },
    { name: 'ApproverLogin', title: 'Vybraný schvalovatel (login)', type: 'Text' },
    { name: 'ApproverName', title: 'Vybraný schvalovatel', type: 'Text' }
  ]
};

const PRM_INCOME_PLAN: ListDef = {
  name: 'PRM_IncomePlan',
  title: 'PRM – Fakturační milníky',
  description: 'Plán příjmů projektu.',
  kind: 'list',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'Project', title: 'Projekt', type: 'Lookup', lookupList: 'PRM_Projects', lookupField: 'ProjectNumber', required: true, indexed: true },
    { name: 'PlannedDate', title: 'Plánované datum', type: 'DateTime', indexed: true },
    { name: 'AmountNet', title: 'Částka bez DPH', type: 'Currency', decimals: 2 },
    { name: 'VATRate', title: 'Sazba DPH (%)', type: 'Number', decimals: 0, defaultValue: '21' },
    { name: 'DueDays', title: 'Splatnost (dnů)', type: 'Number', decimals: 0, defaultValue: '30' },
    { name: 'LinkedTask', title: 'Navázaná položka harmonogramu', type: 'Lookup', lookupList: 'PRM_Tasks', lookupField: 'Title' },
    { name: 'MilestoneStatus', title: 'Stav', type: 'Choice', choices: ['Plán', 'Podklad vystaven', 'Vyfakturováno', 'Uhrazeno'], defaultValue: 'Plán', indexed: true }
  ]
};

const PRM_PURCHASE_ORDERS: ListDef = {
  name: 'PRM_PurchaseOrders',
  title: 'PRM – Objednávky',
  description: 'Nákupní objednávky se schvalovacím workflow.',
  kind: 'list',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'PONumber', title: 'Číslo objednávky', type: 'Text', required: true, indexed: true },
    { name: 'Project', title: 'Projekt', type: 'Lookup', lookupList: 'PRM_Projects', lookupField: 'ProjectNumber', required: true, indexed: true },
    { name: 'Supplier', title: 'Dodavatel', type: 'Lookup', lookupList: 'PRM_Partners', lookupField: 'Title', indexed: true },
    { name: 'BudgetItem', title: 'Položka rozpočtu', type: 'Lookup', lookupList: 'PRM_BudgetItems', lookupField: 'Title' },
    { name: 'Subject', title: 'Předmět', type: 'Text' },
    { name: 'Lines', title: 'Položky (JSON)', type: 'Note' },
    { name: 'AmountNet', title: 'Částka bez DPH', type: 'Currency', decimals: 2 },
    { name: 'VATRate', title: 'Sazba DPH (%)', type: 'Number', decimals: 0, defaultValue: '21' },
    { name: 'Currency', title: 'Měna', type: 'Choice', choices: ['CZK', 'EUR', 'USD'], defaultValue: 'CZK' },
    { name: 'DeliveryDate', title: 'Termín dodání', type: 'DateTime', indexed: true },
    { name: 'PaymentTermDays', title: 'Splatnost (dnů)', type: 'Number', decimals: 0, defaultValue: '30' },
    { name: 'POStatus', title: 'Stav', type: 'Choice', choices: PO_STATUS_CHOICES, defaultValue: 'Koncept', indexed: true },
    { name: 'RequestedBy', title: 'Vystavil', type: 'User', indexed: true },
    { name: 'CurrentApprover', title: 'Čeká na schválení', type: 'User', indexed: true },
    { name: 'ApprovalLevel', title: 'Čeká na (úroveň)', type: 'Text', indexed: true, description: 'Kdo je právě na řadě: pm, vedeni, jednatel. Nastavuje aplikace.' },
    { name: 'ApprovalChain', title: 'Řetěz schválení (JSON)', type: 'Note', description: 'Kroky schvalování a kdo je kdy schválil. Nastavuje aplikace.' },
    { name: 'CancelReason', title: 'Důvod storna', type: 'Note' },
    { name: 'PdfUrl', title: 'PDF', type: 'Url' },
    { name: 'SentDate', title: 'Odesláno dodavateli', type: 'DateTime' },
    { name: 'Note', title: 'Poznámka', type: 'Note' },
    { name: 'BudgetItemId', title: 'Položka rozpočtu (id)', type: 'Text', indexed: true, description: 'Stabilní id položky realizačního rozpočtu, na kterou je objednávka navázaná. Zapisuje aplikace.' },
    { name: 'BudgetItemName', title: 'Položka rozpočtu', type: 'Text', description: 'Popis navázané položky rozpočtu. Zapisuje aplikace.' }
  ]
};

const PRM_INVOICE_BASES: ListDef = {
  name: 'PRM_InvoiceBases',
  title: 'PRM – Podklady pro fakturaci',
  description: 'Podklady pro fakturaci předávané účtárně.',
  kind: 'list',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'BasisNumber', title: 'Číslo podkladu', type: 'Text', required: true, indexed: true },
    { name: 'Project', title: 'Projekt', type: 'Lookup', lookupList: 'PRM_Projects', lookupField: 'ProjectNumber', required: true, indexed: true },
    { name: 'Customer', title: 'Zákazník', type: 'Lookup', lookupList: 'PRM_Partners', lookupField: 'Title' },
    { name: 'OrdererName', title: 'Objednatel', type: 'Text', description: 'Kdo plnění objednal, liší-li se od odběratele (Zákazník). Výchozí zákazník projektu. Zapisuje aplikace.' },
    { name: 'IncomeMilestone', title: 'Fakturační milník', type: 'Lookup', lookupList: 'PRM_IncomePlan', lookupField: 'Title' },
    { name: 'Lines', title: 'Položky (JSON)', type: 'Note' },
    { name: 'AmountNet', title: 'Částka bez DPH', type: 'Currency', decimals: 2 },
    { name: 'VATRate', title: 'Sazba DPH (%)', type: 'Number', decimals: 0, defaultValue: '21' },
    { name: 'IssueDate', title: 'Datum vystavení', type: 'DateTime', indexed: true },
    { name: 'TaxableDate', title: 'DUZP', type: 'DateTime' },
    { name: 'DueDate', title: 'Splatnost', type: 'DateTime', indexed: true },
    { name: 'BasisStatus', title: 'Stav', type: 'Choice', choices: INVOICE_BASIS_STATUS_CHOICES, defaultValue: 'Koncept', indexed: true },
    { name: 'AccountingInvoiceNo', title: 'Číslo faktury z účetnictví', type: 'Text' },
    { name: 'PaidDate', title: 'Uhrazeno dne', type: 'DateTime' },
    { name: 'PdfUrl', title: 'PDF', type: 'Url' },
    // Doplněno ve schématu 8 (jen přidání sloupců): měna, kdo podklad vystavil, poznámka, důvod storna, kdy byl předán účtárně.
    { name: 'Currency', title: 'Měna', type: 'Choice', choices: ['CZK', 'EUR', 'USD'], defaultValue: 'CZK' },
    { name: 'RequestedBy', title: 'Vystavil', type: 'User', indexed: true },
    { name: 'Note', title: 'Poznámka', type: 'Note' },
    { name: 'CancelReason', title: 'Důvod storna', type: 'Note' },
    { name: 'HandoverDate', title: 'Předáno účtárně dne', type: 'DateTime' },
    { name: 'InvoiceKind', title: 'Druh', type: 'Choice', choices: ['Faktura', 'Zálohová faktura'], defaultValue: 'Faktura' }
  ]
};

const PRM_SITE_DIARIES: ListDef = {
  name: 'PRM_SiteDiaries',
  title: 'PRM – Stavební deníky',
  description: 'Deníky staveb. K jednomu projektu jich může být víc. Název deníku je ve sloupci Název.',
  kind: 'list',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'Project', title: 'Projekt', type: 'Lookup', lookupList: 'PRM_Projects', lookupField: 'ProjectNumber', required: true, indexed: true },
    { name: 'IsActive', title: 'Aktivní', type: 'Boolean', defaultValue: '1' },
    { name: 'DiaryNote', title: 'Poznámka', type: 'Note' }
  ]
};

const PRM_DIARY_ENTRIES: ListDef = {
  name: 'PRM_DiaryEntries',
  title: 'PRM – Zápisy ze stavby',
  description: 'Zápisy stavebních deníků a jednání na stavbě. Soubory (fotky, náčrty, PDF, Word) leží ve složce projektu.',
  kind: 'list',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'Diary', title: 'Deník', type: 'Lookup', lookupList: 'PRM_SiteDiaries', lookupField: 'Title', required: true, indexed: true },
    { name: 'Project', title: 'Projekt', type: 'Lookup', lookupList: 'PRM_Projects', lookupField: 'ProjectNumber', required: true, indexed: true },
    { name: 'EntryNo', title: 'Pořadové číslo', type: 'Number', decimals: 0, indexed: true },
    { name: 'EntryDate', title: 'Datum zápisu', type: 'DateTime', indexed: true },
    { name: 'EntryStatus', title: 'Stav', type: 'Choice', choices: ['Koncept', 'Uzavřeno', 'Podepsáno', 'Storno'], defaultValue: 'Koncept', indexed: true },
    { name: 'Content', title: 'Obsah (JSON)', type: 'Note', description: 'Hlavička, účastníci, body jednání a úkoly. Zapisuje aplikace.' },
    { name: 'FolderPath', title: 'Složka zápisu', type: 'Text', description: 'Cesta uvnitř složky projektu. Zapisuje aplikace.' },
    { name: 'EntryAuthor', title: 'Autor zápisu', type: 'User', indexed: true },
    { name: 'ClosedByName', title: 'Uzavřel', type: 'Text' },
    { name: 'ClosedAt', title: 'Uzavřeno dne', type: 'DateTime' },
    { name: 'ContentHash', title: 'Otisk obsahu (SHA-256)', type: 'Text' },
    { name: 'SignatureKind', title: 'Způsob podpisu', type: 'Choice', choices: ['aplikace', 'sken'] },
    { name: 'SignedByName', title: 'Podepsal', type: 'Text' },
    { name: 'SignedAt', title: 'Podepsáno dne', type: 'DateTime' },
    { name: 'PdfUrl', title: 'PDF', type: 'Url' },
    { name: 'DocxUrl', title: 'Word', type: 'Url' },
    { name: 'SignedUrl', title: 'Podepsaný sken', type: 'Url' },
    { name: 'CancelReason', title: 'Důvod storna', type: 'Note' }
  ]
};

const PRM_DOCUMENTS: ListDef = {
  name: 'PRM_Documents',
  title: 'PRM – Číslované dokumenty',
  description: 'Předávací protokoly a další číslované dokumenty.',
  kind: 'list',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'DocNumber', title: 'Číslo dokumentu', type: 'Text', required: true, indexed: true },
    { name: 'DocTypeCode', title: 'Typ dokumentu', type: 'Text', required: true, indexed: true },
    { name: 'Project', title: 'Projekt', type: 'Lookup', lookupList: 'PRM_Projects', lookupField: 'ProjectNumber', indexed: true },
    { name: 'DocDate', title: 'Datum', type: 'DateTime', indexed: true },
    { name: 'Parties', title: 'Strany', type: 'Note' },
    { name: 'DocStatus', title: 'Stav', type: 'Choice', choices: ['Koncept', 'Vystaveno', 'Podepsáno', 'Storno'], defaultValue: 'Koncept', indexed: true },
    { name: 'FileUrl', title: 'Soubor', type: 'Url' }
  ]
};

const PRM_ACTUAL_CASHFLOWS: ListDef = {
  name: 'PRM_ActualCashflows',
  title: 'PRM – Skutečné platby',
  description: 'Skutečné příjmy a výdaje projektů — import z účetnictví nebo ruční zadání.',
  kind: 'list',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'Project', title: 'Projekt', type: 'Lookup', lookupList: 'PRM_Projects', lookupField: 'ProjectNumber', required: true, indexed: true },
    { name: 'PaymentDate', title: 'Datum platby', type: 'DateTime', required: true, indexed: true },
    { name: 'Direction', title: 'Směr', type: 'Choice', choices: DIRECTION_CHOICES, required: true, indexed: true },
    { name: 'AmountNet', title: 'Částka bez DPH', type: 'Currency', decimals: 2 },
    { name: 'Source', title: 'Zdroj', type: 'Choice', choices: ['Objednávka', 'Podklad pro fakturaci', 'Import', 'Ruční zadání'], defaultValue: 'Import' },
    { name: 'Reference', title: 'Odkaz / doklad', type: 'Text' },
    { name: 'ImportBatch', title: 'Dávka importu', type: 'Text', indexed: true, description: 'Aby šel import v případě chyby dohledat a opravit.' }
  ]
};

const PRM_APPROVALS: ListDef = {
  name: 'PRM_Approvals',
  title: 'PRM – Schvalování',
  description: 'Historie schvalování objednávek a rozpočtů.',
  kind: 'list',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'EntityType', title: 'Typ entity', type: 'Choice', choices: ['Objednávka', 'Rozpočet', 'Podklad pro fakturaci'], required: true, indexed: true },
    { name: 'EntityId', title: 'ID entity', type: 'Number', decimals: 0, required: true, indexed: true },
    { name: 'StepNo', title: 'Krok', type: 'Number', decimals: 0 },
    { name: 'Approver', title: 'Schvalovatel', type: 'User', indexed: true },
    { name: 'Decision', title: 'Rozhodnutí', type: 'Choice', choices: ['Schváleno', 'Vráceno k úpravě', 'Zamítnuto'], indexed: true },
    { name: 'Comment', title: 'Komentář', type: 'Note' },
    { name: 'DecidedAt', title: 'Rozhodnuto dne', type: 'DateTime', indexed: true }
  ]
};

const PRM_AUDIT_LOG: ListDef = {
  name: 'PRM_AuditLog',
  title: 'PRM – Auditní log',
  description: 'Kdo, kdy, co změnil. Needitovat ani nemazat.',
  kind: 'list',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'EntityType', title: 'Typ entity', type: 'Text', required: true, indexed: true },
    { name: 'EntityId', title: 'ID entity', type: 'Text', indexed: true },
    { name: 'Action', title: 'Akce', type: 'Text', required: true, indexed: true },
    { name: 'PerformedBy', title: 'Provedl', type: 'User', indexed: true },
    { name: 'PerformedAt', title: 'Kdy', type: 'DateTime', required: true, indexed: true },
    { name: 'OldValue', title: 'Původní hodnota', type: 'Note' },
    { name: 'NewValue', title: 'Nová hodnota', type: 'Note' }
  ]
};

const PRM_SNAPSHOTS: ListDef = {
  name: 'PRM_Snapshots',
  title: 'PRM – Snapshoty',
  description: 'Uložené verze rozpočtů a cashflow ve tvaru JSON.',
  kind: 'library',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'SnapshotType', title: 'Typ', type: 'Choice', choices: ['Rozpočet', 'Cashflow'], indexed: true },
    { name: 'ProjectNumber', title: 'Číslo projektu', type: 'Text', indexed: true }
  ]
};

const PRM_OUTPUTS: ListDef = {
  name: 'PRM_Outputs',
  title: 'PRM – Výstupy',
  description: 'Vygenerovaná PDF a Excel soubory, které nepatří do složky projektu.',
  kind: 'library',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'ProjectNumber', title: 'Číslo projektu', type: 'Text', indexed: true },
    { name: 'OutputType', title: 'Typ výstupu', type: 'Text', indexed: true }
  ]
};

// --- Seznamy na webu PRM-Finance (důvěrné) -------------------------------

const FIN_COMPANY_CASH_ITEMS: ListDef = {
  name: 'FIN_CompanyCashItems',
  title: 'FIN – Firemní položky CF',
  description: 'DŮVĚRNÉ. Firemní příjmy a výdaje mimo projekty.',
  kind: 'list',
  site: 'PRM-Finance',
  versioning: true,
  fields: [
    { name: 'Category', title: 'Kategorie', type: 'Choice', choices: ['Mzdy', 'Odvody', 'Daně', 'Úvěry a splátky', 'Nájem', 'IT a licence', 'Pojištění', 'Ostatní režie', 'Příjmy mimo projekty', 'Dotace'], required: true, indexed: true },
    { name: 'CashMonth', title: 'Měsíc', type: 'DateTime', required: true, indexed: true, description: 'První den měsíce, ke kterému položka patří.' },
    { name: 'Direction', title: 'Směr', type: 'Choice', choices: DIRECTION_CHOICES, required: true, indexed: true },
    { name: 'AmountNet', title: 'Částka bez DPH', type: 'Currency', decimals: 2 },
    { name: 'VATAmount', title: 'DPH', type: 'Currency', decimals: 2 },
    { name: 'PlanOrActual', title: 'Plán / skutečnost', type: 'Choice', choices: ['Plán', 'Skutečnost'], defaultValue: 'Plán', indexed: true },
    { name: 'RecurringPeriod', title: 'Opakování', type: 'Choice', choices: ['Neopakuje se', 'Měsíčně', 'Čtvrtletně', 'Ročně'], defaultValue: 'Neopakuje se' },
    { name: 'RecurringFrom', title: 'Opakovat od', type: 'DateTime' },
    { name: 'RecurringTo', title: 'Opakovat do', type: 'DateTime' },
    { name: 'Note', title: 'Poznámka', type: 'Note' }
  ]
};

const FIN_BANK_BALANCES: ListDef = {
  name: 'FIN_BankBalances',
  title: 'FIN – Zůstatky účtů',
  description: 'DŮVĚRNÉ. Počáteční a skutečné zůstatky k měsíci.',
  kind: 'list',
  site: 'PRM-Finance',
  versioning: true,
  fields: [
    { name: 'BalanceMonth', title: 'Měsíc', type: 'DateTime', required: true, indexed: true },
    { name: 'AccountName', title: 'Účet', type: 'Text', indexed: true },
    { name: 'Balance', title: 'Zůstatek', type: 'Currency', decimals: 2 },
    { name: 'PlanOrActual', title: 'Plán / skutečnost', type: 'Choice', choices: ['Plán', 'Skutečnost'], defaultValue: 'Skutečnost', indexed: true }
  ]
};

const FIN_SETTINGS: ListDef = {
  name: 'FIN_Settings',
  title: 'FIN – Nastavení',
  description: 'DŮVĚRNÉ. Nastavení finančního modulu ve tvaru klíč / hodnota (JSON).',
  kind: 'list',
  site: 'PRM-Finance',
  versioning: true,
  fields: [
    { name: 'SettingKey', title: 'Klíč', type: 'Text', required: true, indexed: true },
    { name: 'SettingValue', title: 'Hodnota (JSON)', type: 'Note' }
  ]
};

const FIN_CF_SUBMISSIONS: ListDef = {
  name: 'FIN_CFSubmissions',
  title: 'FIN – Odevzdané CF',
  description: 'DŮVĚRNÉ. Odevzdané verze celofiremního cashflow (Excel + JSON).',
  kind: 'library',
  site: 'PRM-Finance',
  versioning: true,
  fields: [
    { name: 'SubmittedAt', title: 'Odevzdáno dne', type: 'DateTime', required: true, indexed: true },
    { name: 'SubmittedBy', title: 'Odevzdal', type: 'User' },
    { name: 'PeriodFrom', title: 'Období od', type: 'DateTime' },
    { name: 'PeriodTo', title: 'Období do', type: 'DateTime' },
    { name: 'Note', title: 'Poznámka', type: 'Note' }
  ]
};

/** Všechny seznamy a knihovny aplikace. */
const PRM_EXCHANGE_RATES: ListDef = {
  name: 'PRM_ExchangeRates',
  title: 'PRM – Kurzy',
  description: 'Kurzy ČNB (střed) pro přepočet cizích měn na koruny. Zapisuje se ručně v Nastavení, nebo automaticky (Power Automate).',
  kind: 'list',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'RateDate', title: 'Platí pro den', type: 'DateTime', required: true, indexed: true },
    { name: 'Rate', title: 'Kurz (Kč za 1 jednotku)', type: 'Number', decimals: 4, required: true },
    { name: 'Source', title: 'Zdroj', type: 'Text', description: 'ČNB, ruční zápis…' }
  ]
};

const PRM_CATALOG: ListDef = {
  name: 'PRM_Catalog',
  title: 'PRM – Kusovník',
  description: 'Společná databáze položek pro všechny projekty (know-how pro nabídky a rozpočty). Popis položky je ve sloupci Název.',
  kind: 'list',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'SupplierName', title: 'Dodavatel', type: 'Text', indexed: true },
    { name: 'Category', title: 'Kategorie', type: 'Text' },
    { name: 'ItemCurrency', title: 'Měna', type: 'Choice', choices: ['CZK', 'EUR', 'USD'], defaultValue: 'CZK' },
    { name: 'Unit', title: 'MJ', type: 'Text' },
    { name: 'UnitCost', title: 'Nákup za MJ', type: 'Currency', decimals: 2 },
    { name: 'Note', title: 'Poznámka', type: 'Note' },
    { name: 'SourceProject', title: 'Z projektu', type: 'Text' }
  ]
};

const PRM_USER_PROFILES: ListDef = {
  name: 'PRM_UserProfiles',
  title: 'PRM – Profily uživatelů',
  description: 'Osobní nastavení uživatelů — zatím podpis jako obrázek pro vkládání do ostrých dokladů (objednávky, podklady, zápisy).',
  kind: 'list',
  site: 'PRM',
  versioning: true,
  fields: [
    { name: 'UserLogin', title: 'Přihlašovací jméno', type: 'Text', required: true, indexed: true },
    { name: 'UserName', title: 'Jméno', type: 'Text' },
    { name: 'Signature', title: 'Podpis (obrázek)', type: 'Note', description: 'Obrázek podpisu jako PNG/JPEG data URL. Nastavuje si každý sám v aplikaci (Můj profil).' },
    { name: 'SignatureUpdated', title: 'Podpis změněn', type: 'DateTime' }
  ]
};

export const LISTS: ListDef[] = [
  PRM_SETTINGS,
  PRM_DOCTYPES,
  PRM_COUNTERS,
  PRM_EXCHANGE_RATES,
  PRM_USER_PROFILES,
  PRM_CATALOG,
  PRM_PARTNERS,
  PRM_PROJECTS,
  PRM_TASKS,
  PRM_BUDGET_ITEMS,
  PRM_BUDGET_VERSIONS,
  PRM_INCOME_PLAN,
  PRM_PURCHASE_ORDERS,
  PRM_INVOICE_BASES,
  PRM_SITE_DIARIES,
  PRM_DIARY_ENTRIES,
  PRM_DOCUMENTS,
  PRM_ACTUAL_CASHFLOWS,
  PRM_APPROVALS,
  PRM_AUDIT_LOG,
  PRM_SNAPSHOTS,
  PRM_OUTPUTS,
  FIN_COMPANY_CASH_ITEMS,
  FIN_BANK_BALANCES,
  FIN_SETTINGS,
  FIN_CF_SUBMISSIONS
];

/** Seznamy pro jeden web. */
export function listsForSite(site: 'PRM' | 'PRM-Finance'): ListDef[] {
  return LISTS.filter((l) => l.site === site);
}

/**
 * Pořadí zakládání seznamů.
 *
 * Lookup sloupec nejde založit, dokud neexistuje cílový seznam. Tahle funkce
 * seznamy seřadí topologicky, aby průvodce nezaložil seznam s odkazem do prázdna.
 * Cyklus v odkazech (kdyby vznikl) neshodí instalaci — zbývající seznamy se
 * připojí na konec a průvodce nahlásí, které lookupy se nepovedly.
 */
export function creationOrder(lists: ListDef[]): ListDef[] {
  const byName = new Map(lists.map((l) => [l.name, l]));
  const done = new Set<string>();
  const result: ListDef[] = [];

  const visit = (list: ListDef, stack: Set<string>): void => {
    if (done.has(list.name) || stack.has(list.name)) {
      return;
    }
    stack.add(list.name);
    list.fields
      .filter((f) => f.type === 'Lookup' && f.lookupList && f.lookupList !== list.name)
      .forEach((f) => {
        const target = byName.get(f.lookupList as string);
        if (target) {
          visit(target, stack);
        }
      });
    stack.delete(list.name);
    done.add(list.name);
    result.push(list);
  };

  lists.forEach((l) => visit(l, new Set<string>()));
  return result;
}

/** Sloupce, které mají mít index. */
export function indexedFields(list: ListDef): FieldDef[] {
  return list.fields.filter((f) => f.indexed === true);
}
