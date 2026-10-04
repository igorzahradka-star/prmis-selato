/**
 * Kusovník — společná databáze položek pro všechny projekty (know-how, ze kterého se skládají další nabídky a rozpočty).
 * Do kusovníku se ukládá z rozpočtu (nabídka „⋯ → Uložit do kusovníku“), zpět se vkládá tlačítkem „Vložit z kusovníku“.
 * Čistá logika bez SharePointu a Reactu.
 */

import { CurrencyCode, asCurrencyCode } from './currency';
import { BudgetItem, newBudgetId } from './budget';
import { hasAnyRole } from './roles';
import { Role } from './types';
import { Actor } from './orderWorkflow';

export interface CatalogItem {
  id: number;
  description: string;
  supplier?: string;
  category?: string;
  currency: CurrencyCode;
  unit?: string;
  /** Nákup za jednotku v měně položky (poslední známá cena). */
  unitCost: number;
  note?: string;
  /** Z jakého projektu pochází (pro orientaci). */
  sourceProject?: string;
  createdByName?: string;
  modified?: Date;
}

export type CatalogInput = Omit<CatalogItem, 'id' | 'createdByName' | 'modified'>;

/** Z položky rozpočtu připraví záznam kusovníku (u práce a rezervy se neukládá — nemají obecnou cenu). */
export function catalogInputFromItem(item: BudgetItem, projectNumber: string | undefined): CatalogInput {
  return {
    description: item.description.trim(),
    supplier: item.supplier && item.supplier.trim() !== '' ? item.supplier.trim() : undefined,
    category: item.category,
    currency: asCurrencyCode(item.currency),
    unit: item.unit && item.unit.trim() !== '' ? item.unit.trim() : undefined,
    unitCost: item.unitCost,
    note: item.note,
    sourceProject: projectNumber
  };
}

/** Z kusovníku vytvoří novou položku rozpočtu do dané skupiny (množství 1, cena z kusovníku). */
export function budgetItemFromCatalog(c: CatalogItem, groupId: string): BudgetItem {
  return {
    id: newBudgetId('i'),
    groupId,
    description: c.description,
    supplier: c.supplier,
    category: c.category,
    currency: c.currency,
    quantity: 1,
    unit: c.unit,
    unitCost: c.unitCost,
    note: c.note
  };
}

const norm = (s: string | undefined): string =>
  (s || '')
    .toLocaleLowerCase('cs-CZ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Je to tatáž položka (stejný popis a dodavatel, bez ohledu na velikost písmen a diakritiku)? */
export function sameCatalogItem(a: Pick<CatalogInput, 'description' | 'supplier'>, b: Pick<CatalogInput, 'description' | 'supplier'>): boolean {
  return norm(a.description) !== '' && norm(a.description) === norm(b.description) && norm(a.supplier) === norm(b.supplier);
}

/** Najde v kusovníku stejnou položku (kvůli přepsání ceny místo duplikátu). */
export const findInCatalog = (list: CatalogItem[], input: Pick<CatalogInput, 'description' | 'supplier'>): CatalogItem | undefined => list.filter((c) => sameCatalogItem(c, input))[0];

/** Hledání podle písmen v popisu, dodavateli, kategorii a poznámce (bez ohledu na diakritiku). */
export function filterCatalog(list: CatalogItem[], search: string): CatalogItem[] {
  const q = norm(search);
  const out = q === '' ? list.slice() : list.filter((c) => [c.description, c.supplier, c.category, c.note, c.sourceProject].some((v) => norm(v).indexOf(q) !== -1));
  return out.sort((a, b) => a.description.localeCompare(b.description, 'cs-CZ'));
}

/** Kontrola před uložením do kusovníku. */
export function validateCatalogInput(input: CatalogInput): string[] {
  const out: string[] = [];
  if (input.description.trim() === '') {
    out.push('Vyplňte popis položky.');
  }
  if (!(input.unitCost >= 0) || !isFinite(input.unitCost)) {
    out.push('Cena za jednotku musí být nezáporné číslo.');
  }
  return out;
}

/** Do kusovníku přidává každý, kdo smí upravovat rozpočty: PM, asistent, vedení, administrátor. */
export function canWriteCatalog(actor: Actor): boolean {
  return hasAnyRole(actor.roles, Role.ProjektovyManazer, Role.AsistentPM, Role.Vedeni, Role.Administrator);
}

/** Smazat položku z kusovníku smí vedení a administrátor (do koše SharePointu). */
export function canDeleteCatalog(actor: Actor): boolean {
  return hasAnyRole(actor.roles, Role.Vedeni, Role.Administrator);
}
