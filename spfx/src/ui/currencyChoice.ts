/**
 * Měna, ve které si uživatel prohlíží přehledy (CZK / EUR / USD). Volba je **společná pro všechny přehledy** (projekty, objednávky,
 * podklady, mapa…) a pamatuje se v prohlížeči. Dokud si uživatel nevybere, platí výchozí měna z Nastavení.
 * Je to jen způsob zobrazení — doklady samotné zůstávají v měně dokladu.
 */

import { CURRENCY_CODES, CurrencyCode, asCurrencyCode } from '../core/currency';

const STORAGE_KEY = 'prm.reportCurrency';

let choice: CurrencyCode | undefined;
let loaded = false;
const listeners: Array<() => void> = [];

function load(): void {
  if (loaded) {
    return;
  }
  loaded = true;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && CURRENCY_CODES.indexOf(saved as CurrencyCode) !== -1) {
      choice = asCurrencyCode(saved);
    }
  } catch {
    // Úložiště prohlížeče nemusí být dostupné — volba platí jen do zavření stránky.
  }
}

/** Měna zvolená uživatelem; `undefined` = platí výchozí z Nastavení. */
export function getCurrencyChoice(): CurrencyCode | undefined {
  load();
  return choice;
}

/** Nastaví volbu (`undefined` ji zruší) a dá vědět všem otevřeným přehledům. */
export function setCurrencyChoice(next: CurrencyCode | undefined): void {
  load();
  choice = next;
  try {
    if (next) {
      window.localStorage.setItem(STORAGE_KEY, next);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Viz výše.
  }
  listeners.slice().forEach((l) => l());
}

export function subscribeCurrencyChoice(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    const i = listeners.indexOf(listener);
    if (i !== -1) {
      listeners.splice(i, 1);
    }
  };
}
