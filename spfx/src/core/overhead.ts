/**
 * Projekt Režie — vnitřní projekt, na který se věší režijní objednávky
 * a náklady, co nepatří konkrétní zakázce (nájem, telefony, software).
 *
 * Součást vrstvy `core` — čistá logika bez SharePointu a Reactu.
 *
 * Číslo má tvar `{RR}-000`, tedy **mimo** běžnou řadu projektů: čítač se
 * nezvyšuje, Režie nikomu neukradne číslo a nula na konci ji v seznamech
 * řadí před ostatní projekty.
 */

/** Přípona čísla, podle které se Režie pozná i bez příznaku v databázi. */
export const OVERHEAD_NUMBER_SUFFIX = '-000';

/** Název projektu Režie. Nesestavuje se ze vzoru — Režie nemá zákazníka ani lokalitu. */
export const OVERHEAD_TITLE = 'Režie RES';

/** Typ projektu, pod kterým Režie vystupuje v číselníku typů. */
export const OVERHEAD_PROJECT_TYPE = 'Režie';

/**
 * Číslo projektu Režie pro daný rok: `26-000`.
 * Režie se zakládá jednou; rok v čísle říká, kdy vznikla.
 */
export function overheadProjectNumber(year: number): string {
  const twoDigits = year % 100;
  return `${twoDigits < 10 ? '0' : ''}${twoDigits}${OVERHEAD_NUMBER_SUFFIX}`;
}

/**
 * Poznává Režii podle čísla — pro případy, kdy je po ruce jen číslo
 * a ne celý projekt (odkazy, číslování dokladů, importy).
 */
export function isOverheadNumber(projectNumber: string | undefined): boolean {
  if (!projectNumber) {
    return false;
  }
  const n = projectNumber.trim();
  return n.length > OVERHEAD_NUMBER_SUFFIX.length && endsWith(n, OVERHEAD_NUMBER_SUFFIX);
}

/** Celý název i s číslem, jak se ukládá do sloupce Title. */
export function overheadProjectTitle(year: number): string {
  return `${overheadProjectNumber(year)} ${OVERHEAD_TITLE}`;
}

/** (`String.endsWith` není v cílové knihovně SPFx.) */
function endsWith(text: string, suffix: string): boolean {
  return text.indexOf(suffix, text.length - suffix.length) !== -1;
}
