/**
 * Kontroly při úpravě projektu.
 *
 * Součást vrstvy `core` — čistá logika bez SharePointu a Reactu.
 * UI podle toho rozhoduje, jestli povolit uložení, a co uživateli napsat.
 */

import { ProjectStatus } from './types';

/** Hodnoty z formuláře úpravy projektu — jen to, co jde měnit ručně. */
export interface ProjectEditValues {
  title: string;
  customerName?: string;
  projectManagerName: string;
  status: ProjectStatus;
  projectType?: string;
  location?: string;
  shortName?: string;
  contractPriceNet?: number;
  startDate?: Date;
  endDatePlanned?: Date;
  endDateActual?: Date;
}

/** Jedna výtka k formuláři. `field` slouží UI k označení konkrétního pole. */
export interface ValidationIssue {
  field: keyof ProjectEditValues;
  message: string;
}

/** Stavy, ve kterých projekt patří mezi ukončené — tam se čeká skutečné ukončení. */
const FINISHED_STATUSES: ProjectStatus[] = [ProjectStatus.Dokonceno];

/**
 * Zkontroluje úpravu projektu. Vrací seznam výtek — prázdný seznam znamená,
 * že se dá uložit.
 *
 * Záměrně nebráníme „divným", ale možným stavům (projekt bez ceny, projekt
 * bez termínů). Blokujeme jen to, co je prokazatelně chyba zadání.
 */
export function validateProjectEdit(values: ProjectEditValues): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!values.title || !values.title.trim()) {
    issues.push({ field: 'title', message: 'Název projektu musí být vyplněný.' });
  }
  if (!values.projectManagerName || !values.projectManagerName.trim()) {
    issues.push({ field: 'projectManagerName', message: 'Projekt musí mít projektového manažera.' });
  }

  if (values.contractPriceNet !== undefined) {
    if (!isFinite(values.contractPriceNet)) {
      issues.push({ field: 'contractPriceNet', message: 'Cena musí být číslo.' });
    } else if (values.contractPriceNet < 0) {
      issues.push({ field: 'contractPriceNet', message: 'Cena nemůže být záporná.' });
    }
  }

  if (isAfter(values.startDate, values.endDatePlanned)) {
    issues.push({
      field: 'endDatePlanned',
      message: 'Plánované ukončení nemůže být dřív než zahájení.'
    });
  }
  if (isAfter(values.startDate, values.endDateActual)) {
    issues.push({
      field: 'endDateActual',
      message: 'Skutečné ukončení nemůže být dřív než zahájení.'
    });
  }

  if (FINISHED_STATUSES.indexOf(values.status) !== -1 && !values.endDateActual) {
    issues.push({
      field: 'endDateActual',
      message: `U stavu „${values.status}" vyplňte skutečné ukončení.`
    });
  }

  return issues;
}

/**
 * Upozornění, která uložení nebrání, ale uživatel by o nich měl vědět.
 * Např. projekt označený jako dokončený, ale s cenou 0.
 */
export function projectEditWarnings(values: ProjectEditValues): string[] {
  const warnings: string[] = [];

  if (values.endDateActual && FINISHED_STATUSES.indexOf(values.status) === -1) {
    warnings.push(
      `Projekt má vyplněné skutečné ukončení, ale stav je „${values.status}". Nemá se změnit na „${ProjectStatus.Dokonceno}"?`
    );
  }
  if (!values.contractPriceNet && values.status === ProjectStatus.Realizace) {
    warnings.push('Projekt je v realizaci, ale nemá vyplněnou cenu bez DPH.');
  }

  return warnings;
}

/** Porovná jen datum (bez času) — formuláře pracují s celými dny. */
function isAfter(earlier: Date | undefined, later: Date | undefined): boolean {
  if (!earlier || !later) {
    return false;
  }
  return dayValue(earlier) > dayValue(later);
}

function dayValue(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
