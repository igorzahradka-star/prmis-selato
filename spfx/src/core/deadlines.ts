/**
 * Smluvní termíny plnění — výběr toho nejbližšího a kontroly při zadávání.
 *
 * Součást vrstvy `core` — čistá logika bez SharePointu a Reactu.
 *
 * „Nejbližší termín plnění" je sloupec na dashboardu a zároveň se ukládá
 * do `Project.nextDeadline` jako cache. Tady je jediné místo, kde se počítá,
 * aby se dashboard a detail projektu nemohly rozejít.
 */

import { ProjectTask } from './types';

/**
 * Nejbližší **nesplněný** smluvní termín projektu.
 *
 * Pravidla:
 * - berou se jen položky s příznakem smluvního termínu a s vyplněným datem,
 * - hotové (100 %) se přeskakují — splněný termín už nikoho netlačí,
 * - **zmeškaný termín má přednost před budoucím.** Kdyby se bral jen nejbližší
 *   budoucí, projekt s propadlým termínem by na dashboardu vypadal klidněji
 *   než projekt, kterému termín teprve běží.
 *
 * Vrací `undefined`, když projekt žádný nesplněný smluvní termín nemá.
 */
export function nextContractualDeadline(
  tasks: ProjectTask[],
  today: Date = new Date()
): Date | undefined {
  const open = tasks
    .filter((t) => t.isContractualDeadline && !!t.finishDate && t.percentComplete < 100)
    .map((t) => t.finishDate as Date);

  if (open.length === 0) {
    return undefined;
  }

  const dnes = dayValue(today);
  const overdue = open.filter((d) => dayValue(d) < dnes);
  const pool = overdue.length > 0 ? overdue : open;

  return pool.reduce((nejblizsi, d) => (dayValue(d) < dayValue(nejblizsi) ? d : nejblizsi));
}

/** Smluvní termíny seřazené tak, jak se mají zobrazit: podle data, prázdné nakonec. */
export function sortDeadlines(tasks: ProjectTask[]): ProjectTask[] {
  return tasks.slice().sort((a, b) => {
    if (!a.finishDate && !b.finishDate) {
      return a.title.localeCompare(b.title, 'cs-CZ');
    }
    if (!a.finishDate) {
      return 1;
    }
    if (!b.finishDate) {
      return -1;
    }
    return dayValue(a.finishDate) - dayValue(b.finishDate);
  });
}

/** Výtka k zadávanému termínu. Prázdný seznam = dá se uložit. */
export interface DeadlineIssue {
  field: 'title' | 'finishDate' | 'percentComplete';
  message: string;
}

/** Hodnoty z formuláře termínu. */
export interface DeadlineValues {
  title: string;
  finishDate?: Date;
  percentComplete: number;
  isContractualDeadline: boolean;
}

/**
 * Kontrola zadávaného termínu.
 *
 * `projectEndDate` je plánované ukončení projektu — termín po něm není
 * zakázaný (smluvní termín může být i po dokončení stavby, např. revize),
 * ale upozorní se na něj přes `deadlineWarnings`.
 */
export function validateDeadline(values: DeadlineValues): DeadlineIssue[] {
  const issues: DeadlineIssue[] = [];

  if (!values.title || !values.title.trim()) {
    issues.push({ field: 'title', message: 'Termín musí mít název — podle čeho ho jinak poznáte.' });
  }
  if (values.isContractualDeadline && !values.finishDate) {
    issues.push({
      field: 'finishDate',
      message: 'Smluvní termín musí mít datum. Bez data se nedá hlídat.'
    });
  }
  if (!isFinite(values.percentComplete) || values.percentComplete < 0 || values.percentComplete > 100) {
    issues.push({ field: 'percentComplete', message: 'Dokončení zadejte v procentech od 0 do 100.' });
  }

  return issues;
}

/** Upozornění, která uložení nebrání. */
export function deadlineWarnings(values: DeadlineValues, projectEndDate?: Date): string[] {
  const warnings: string[] = [];

  if (values.finishDate && projectEndDate && dayValue(values.finishDate) > dayValue(projectEndDate)) {
    warnings.push(
      'Termín je až po plánovaném ukončení projektu. Zkontrolujte, jestli nemá projekt posunout termín ukončení.'
    );
  }
  if (values.percentComplete === 100 && values.isContractualDeadline) {
    warnings.push('Termín je označený jako hotový — přestane se počítat do nejbližšího termínu.');
  }

  return warnings;
}

/** Porovnání jen na dny, bez času. */
function dayValue(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
