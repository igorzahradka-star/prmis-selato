/**
 * Seznam jako text — čistá logika pro editory „jedna položka na řádek".
 *
 * Editor nesmí při každém stisku klávesy přepisovat pole hodnotou přepočítanou
 * ze seznamu: prázdný řádek (právě stisknutý Enter) ani mezera na konci by se
 * do seznamu nedostaly a pole by je hned smazalo. Text si proto drží editor
 * sám a nahoru posílá jen přečtený seznam.
 */

/** Text → položky: bez okrajových mezer, prázdné řádky pryč. */
export function parseListText(text: string): string[] {
  return (text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Jsou dva seznamy stejné (pořadí i obsah)? */
export function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
