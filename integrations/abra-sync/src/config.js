/**
 * Názvy evidencí a polí ve Flexi na JEDNOM místě.
 *
 * !!! NEPOTVRZENO !!! Názvy vycházejí z veřejné dokumentace Flexi a ještě se neověřily na instanci Revoltum.
 * Ověřit podle výpisů od CFO (…/faktura-prijata.json?limit=3&detail=full, …/faktura-vydana/properties.json,
 * …/zakazka.json?limit=3), teprve pak spoléhat. Po ověření stačí změnit tento soubor, logika zůstává.
 */

/** Evidence, které se stahují. Zálohové: názvy evidencí zatím NEJSOU potvrzené — doplnit po výpisech. */
export const EVIDENCES = [
  { evidence: 'faktura-prijata', docType: 'prijata' },
  { evidence: 'faktura-vydana', docType: 'vydana' }
  // { evidence: '???', docType: 'zaloha-prijata' },  // nepotvrzeno
  // { evidence: '???', docType: 'zaloha-vydana' },   // nepotvrzeno
];

/** Pole dokladu ve Flexi (nepotvrzeno). */
export const FIELDS = {
  id: 'id',
  code: 'kod',
  partner: 'firma',
  description: 'popis',
  issueDate: 'datVyst',
  dueDate: 'datSplat',
  currency: 'mena',
  netCzk: 'sumZklCelkem', // základ celkem v Kč
  netForeign: 'sumZklCelkemMen', // základ celkem v cizí měně
  project: 'zakazka',
  docKind: 'typDokl'
};

/** Číslo projektu v PRMIS: pět číslic (26001), Režie 26999. Zakázka v Abře, která tak nevypadá, se přeskočí. */
export const PROJECT_NUMBER_PATTERN = /^\d{5}$/;

/** Měny, které PRMIS umí ukládat. Jiná měna se přepočte do CZK (částka z Abry v Kč). */
export const NATIVE_CURRENCIES = ['CZK', 'EUR', 'USD'];

/** Dobropis se pozná podle typu dokladu (kód nebo název obsahuje „dobropis“). Nepotvrzeno. */
export const CREDIT_NOTE_PATTERN = /dobropis/i;

/** Od kdy se doklady stahují (rozhodnutí Igora: od 1. 1. 2026). */
export const DEFAULT_SINCE = '2026-01-01';

/** Značka v Popisu u dokladu, který z Abry zmizel. */
export const VANISHED_MARK = '[zmizel z Abry] ';
