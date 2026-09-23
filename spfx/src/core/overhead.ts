/**
 * Projekt Režie — vnitřní projekt, na který se věší režijní objednávky
 * a náklady, co nepatří konkrétní zakázce (nájem, telefony, software).
 *
 * Součást vrstvy `core` — čistá logika bez SharePointu a Reactu.
 *
 * Číslo má tvar `{RR}-999` a je **součástí běžné řady projektů**: `26-999`,
 * `27-999`… Každý rok má svou Režii, stejně jako svou řadu zakázek —
 * náklady se tak nesčítají přes roky. Devítky na konci ji v seznamu řadí
 * až za poslední zakázku roku.
 *
 * Číslo se **nepřiděluje z čítače**, je dané tvarem. Čítač pro daný rok se
 * tím nezvyšuje, takže Režie nikomu neukradne pořadové číslo.
 */

/** Přípona čísla, podle které se Režie pozná i bez příznaku v databázi. */
export const OVERHEAD_NUMBER_SUFFIX = '-999';

/** Název projektu Režie. Nesestavuje se ze vzoru — Režie nemá zákazníka ani lokalitu. */
export const OVERHEAD_TITLE = 'Režie RES';

/** Typ projektu, pod kterým Režie vystupuje v číselníku typů. */
export const OVERHEAD_PROJECT_TYPE = 'Režie';

/**
 * Nejvyšší pořadové číslo, které smí dostat běžná zakázka.
 *
 * Číslo `999` je vyhrazené Režii. Kdyby firma v jednom roce udělala 998
 * zakázek, další by na Režii narazila — proto se to hlídá při zakládání
 * (`create`), ne až při kolizi v databázi.
 */
export const MAX_REGULAR_SEQUENCE = 998;

/**
 * Číslo projektu Režie pro daný rok: `26-999`.
 * Každý rok má svou Režii — náklady se nesčítají přes roky.
 */
export function overheadProjectNumber(year: number): string {
  const twoDigits = year % 100;
  return `${twoDigits < 10 ? '0' : ''}${twoDigits}${OVERHEAD_NUMBER_SUFFIX}`;
}

/**
 * Poznává Režii podle čísla — pro případy, kdy je po ruce jen číslo
 * a ne celý projekt (odkazy, číslování dokladů, importy, seed čítače).
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
  return `${overheadProjectNumber(year)} ${OVERHEAD_TITLE} ${year}`;
}

/** (`String.endsWith` není v cílové knihovně SPFx.) */
function endsWith(text: string, suffix: string): boolean {
  return text.indexOf(suffix, text.length - suffix.length) !== -1;
}
