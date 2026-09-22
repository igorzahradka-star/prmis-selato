/**
 * Podklad pro export tabulky projektů do Excelu.
 *
 * Součást vrstvy `core` — čistá logika bez SharePointu, Reactu i ExcelJS.
 * Sestaví řádky a hlavičky; samotný zápis souboru je v `features/projects/exportToExcel.ts`.
 *
 * Proč zvlášť: co se do exportu dostane a v jakém tvaru, je obchodní
 * rozhodnutí a musí se dát otestovat. Skládání XLSX už je jen technika.
 */

import { Project } from './types';
import { formatDate } from './format';

/** Jeden sloupec exportu. `width` je v šířce znaků, jak to počítá Excel. */
export interface ExportColumn {
  header: string;
  width: number;
  /** `money` a `date` dostanou v Excelu formát, `text` zůstane textem. */
  kind: 'text' | 'money' | 'date' | 'number';
}

export const EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Číslo', width: 12, kind: 'text' },
  { header: 'Název', width: 46, kind: 'text' },
  { header: 'Zákazník', width: 26, kind: 'text' },
  { header: 'Typ', width: 16, kind: 'text' },
  { header: 'Lokalita', width: 20, kind: 'text' },
  { header: 'Projektový manažer', width: 20, kind: 'text' },
  { header: 'Stav', width: 14, kind: 'text' },
  { header: 'Rozpočet', width: 14, kind: 'text' },
  { header: 'Cena bez DPH', width: 16, kind: 'money' },
  { header: 'Měna', width: 8, kind: 'text' },
  { header: 'Schválený rozpočet', width: 18, kind: 'money' },
  { header: 'Prognóza nákladů', width: 18, kind: 'money' },
  { header: 'Odchylka', width: 12, kind: 'number' },
  { header: 'Nejbližší termín', width: 16, kind: 'date' },
  { header: 'Zahájení', width: 14, kind: 'date' },
  { header: 'Ukončení plánované', width: 18, kind: 'date' },
  { header: 'Ukončení skutečné', width: 18, kind: 'date' }
];

/**
 * Hodnoty jednoho řádku ve stejném pořadí jako `EXPORT_COLUMNS`.
 *
 * Čísla a data se **nepřevádějí na text** — do Excelu patří jako čísla
 * a data, jinak se s nimi nedá počítat ani filtrovat. Prázdná hodnota je
 * `undefined`, ne pomlčka; pomlčka je věc obrazovky, ne tabulky.
 */
export function exportRow(project: Project): (string | number | Date | undefined)[] {
  return [
    project.projectNumber,
    titleWithoutNumber(project),
    project.customerName,
    project.projectType,
    project.location,
    project.projectManagerName,
    project.status,
    project.budgetStatus,
    project.contractPriceNet,
    project.currency,
    project.budgetBaselineTotal,
    project.costForecastTotal,
    budgetVariance(project),
    project.nextDeadline,
    project.startDate,
    project.endDatePlanned,
    project.endDateActual
  ];
}

/**
 * Odchylka prognózy proti schválenému rozpočtu jako podíl (0,05 = +5 %).
 * `undefined`, když projekt nemá schválenou baseline — dělit nulou nelze
 * a nula by se v tabulce četla jako „v pořádku".
 */
export function budgetVariance(project: Project): number | undefined {
  const baseline = project.budgetBaselineTotal;
  const forecast = project.costForecastTotal;
  if (!baseline || forecast === undefined) {
    return undefined;
  }
  return (forecast - baseline) / baseline;
}

/** Název bez čísla na začátku — číslo má vlastní sloupec. */
export function titleWithoutNumber(project: Project): string {
  const prefix = `${project.projectNumber} `;
  return project.title.indexOf(prefix) === 0 ? project.title.slice(prefix.length) : project.title;
}

/**
 * Název souboru. Obsahuje datum, aby se dva exporty ve složce Stažené
 * nepřepsaly, a je bez diakritiky a mezer kvůli sdílení e-mailem.
 */
export function exportFileName(today: Date = new Date()): string {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  return `PRM-projekty-${y}-${pad2(m)}-${pad2(d)}.xlsx`;
}

/** Popiska pod tabulkou — co export obsahuje a kdy vznikl. */
export function exportSubtitle(pocet: number, filtrovano: boolean, today: Date = new Date()): string {
  const zaklad = filtrovano
    ? `Vyexportováno ${pocet} projektů podle nastavených filtrů`
    : `Vyexportováno ${pocet} projektů`;
  return `${zaklad}, ${formatDate(today)}`;
}

/** (`padStart` není v cílové knihovně SPFx.) */
function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}
