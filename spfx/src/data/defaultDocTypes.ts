/**
 * Výchozí číselné řady (PRM_DocTypes) — návrh podle zadání kap. 7.
 * Administrátor je může upravit; tohle je startovní sada.
 *
 * Chybějící řada se ostrému webu **doplní sama** při prvním použití (viz `SpNumberingRepository`):
 * bez toho by nová funkce (třeba objednávky) při prvním pokusu skončila chybou „Neznámá číselná řada".
 * Existující řádky se nikdy nepřepisují ani neobnovují — kdo si řadu upravil nebo vypnul, má to tak.
 */

import { DocTypeConfig } from './repositories';

export const DEFAULT_DOC_TYPES: DocTypeConfig[] = [
  {
    // SELATO (9. 11. 2026): číslo zakázky `26ZA00005` = rok + typ ZA + pětimístné pořadí, počítané zvlášť pro každý rok
    // (shodně se složkami na disku O:\\20_Zakázky). Nabídky (NA) vede SELCRM, servis (ZS) zatím stojí.
    code: 'PRJ',
    name: 'Číslo projektu',
    pattern: '{YY}ZA{N}',
    padding: 5,
    resetPeriod: 'Ročně',
    scope: 'Globální',
    startValue: 1,
    active: true
  },
  {
    code: 'OBJ',
    name: 'Objednávka',
    pattern: 'OBJ-{YYYY}-{N}',
    padding: 4,
    resetPeriod: 'Ročně',
    scope: 'Globální',
    startValue: 1,
    active: true
  },
  {
    code: 'FP',
    name: 'Podklad pro fakturaci',
    pattern: 'FP{YY}{N}',
    padding: 3,
    resetPeriod: 'Ročně',
    scope: 'Globální',
    startValue: 1,
    active: true
  },
  {
    code: 'SPO',
    name: 'Servisní požadavek',
    pattern: 'SPO-{YYYY}-{N}',
    padding: 4,
    resetPeriod: 'Ročně',
    scope: 'Globální',
    startValue: 1,
    active: true
  },
  {
    code: 'SL',
    name: 'Servisní list',
    pattern: 'SL-{YYYY}-{N}',
    padding: 4,
    resetPeriod: 'Ročně',
    scope: 'Globální',
    startValue: 1,
    active: true
  },
  {
    code: 'PP',
    name: 'Předávací protokol',
    pattern: 'PP-{PRJ}-{N}',
    padding: 2,
    resetPeriod: 'Nikdy',
    scope: 'Projekt',
    startValue: 1,
    active: true
  }
];

/** Výchozí řada podle kódu; neznámý kód vrátí `undefined`. */
export function findDefaultDocType(code: string): DocTypeConfig | undefined {
  return DEFAULT_DOC_TYPES.filter((d) => d.code === code)[0];
}
