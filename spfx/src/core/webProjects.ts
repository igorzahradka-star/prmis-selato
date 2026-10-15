/**
 * Seznam běžících projektů na webu (web part „Běžící projekty“) — čistá logika bez SharePointu a Reactu.
 *
 * Seznam se řídí **jen stavem projektu**: ukazují se projekty ve stavech zvolených v Nastavení (výchozí Příprava a Realizace),
 * ostatní se filtrují. Zobrazují se jen údaje, které mají být vidět všem: název, projektový manažer, lokalita, celková cena
 * (prodej) a stav. Náklady ani marže se do web partu nikdy nenačítají.
 */

import { Project, ProjectStatus } from './types';

/** Nastavení web partu „Běžící projekty“ (Nastavení → Projekty na webu). */
export interface WebListSettings {
  /** Stavy projektů, které se na webu ukazují. */
  statuses: string[];
  /** Kolik řádků se ukáže hned; zbytek po kliknutí na „Zobrazit vše“. */
  maxRows: number;
  /** Ukazovat sloupec Celková cena. */
  showPrice: boolean;
}

export const DEFAULT_WEB_LIST: WebListSettings = {
  statuses: [ProjectStatus.Priprava, ProjectStatus.Realizace],
  maxRows: 15,
  showPrice: true
};

/** Stavy, které lze v Nastavení zaškrtnout (v pořadí, v jakém dávají smysl). */
export const WEB_LIST_STATUS_CHOICES: ProjectStatus[] = [
  ProjectStatus.Realizace,
  ProjectStatus.Priprava,
  ProjectStatus.Nabidka,
  ProjectStatus.Pozastaveno,
  ProjectStatus.Reklamace,
  ProjectStatus.Dokonceno,
  ProjectStatus.Storno
];

export const MAX_WEB_LIST_ROWS = 200;

/** Doplní chybějící nebo poškozené hodnoty výchozími (nastavení se ukládá po částech a v čase se rozšiřuje). */
export function webListWithDefaults(stored: Partial<WebListSettings> | undefined): WebListSettings {
  const s = stored ?? {};
  const statuses = Array.isArray(s.statuses) ? s.statuses.filter((x) => typeof x === 'string') : DEFAULT_WEB_LIST.statuses;
  const rows = typeof s.maxRows === 'number' && isFinite(s.maxRows) ? Math.round(s.maxRows) : DEFAULT_WEB_LIST.maxRows;
  return {
    statuses: statuses.slice(),
    maxRows: rows,
    showPrice: typeof s.showPrice === 'boolean' ? s.showPrice : DEFAULT_WEB_LIST.showPrice
  };
}

/** Problémy v nastavení web partu česky; prázdné pole = v pořádku. */
export function validateWebList(s: WebListSettings): string[] {
  const problems: string[] = [];
  if (s.statuses.length === 0) {
    problems.push('Projekty na webu: zaškrtněte aspoň jeden stav projektu, jinak bude seznam na webu prázdný.');
  }
  if (s.maxRows < 1 || s.maxRows > MAX_WEB_LIST_ROWS) {
    problems.push(`Projekty na webu: počet řádků musí být 1 až ${MAX_WEB_LIST_ROWS}.`);
  }
  return problems;
}

/** Vybere projekty pro web podle stavu (bez Režie a bez servisních projektů), řazené podle čísla projektu vzestupně (stav na pořadí nemá vliv). */
export function selectWebProjects(projects: Project[], settings: WebListSettings): Project[] {
  return projects
    .filter((p) => !p.isOverhead && p.projectType !== 'Servis' && settings.statuses.indexOf(String(p.status)) !== -1)
    .sort((a, b) => a.projectNumber.localeCompare(b.projectNumber, 'cs-CZ', { numeric: true }));
}

export interface WebPrice {
  amount: number;
  currency: string;
  /** Rozpočet zatím nikdo neschválil — cena je provizorní. */
  provisional: boolean;
}

/** Celková cena projektu pro web: prodej z rozpočtu (v Kč), jinak smluvní cena v měně projektu. Marže se nikdy nepočítá. */
export function webPrice(p: Project): WebPrice | undefined {
  if (p.budgetSaleTotal !== undefined) {
    return { amount: p.budgetSaleTotal, currency: 'CZK', provisional: p.budgetApproved !== true };
  }
  if (p.contractPriceNet !== undefined) {
    return { amount: p.contractPriceNet, currency: p.currency || 'CZK', provisional: false };
  }
  return undefined;
}

/** Odkaz na detail projektu v aplikaci PRMIS (stránka s aplikací + hash trasy). */
export function projectDetailUrl(appPageUrl: string, projectNumber: string): string {
  const base = (appPageUrl || '').replace(/#.*$/, '');
  return `${base}#/projekt/${encodeURIComponent(projectNumber)}`;
}

/** Výchozí adresa stránky s aplikací PRMIS na zadaném webu. */
export function defaultAppPageUrl(webUrl: string): string {
  return `${webUrl.replace(/\/+$/, '')}/SitePages/PRM.aspx`;
}
