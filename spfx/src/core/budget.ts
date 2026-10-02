/**
 * Realizační rozpočet (RR) projektu — čistá logika bez SharePointu a Reactu.
 *
 * Rozpočet tvoří **skupiny** (např. Materiál, Subdodávky) a v nich libovolný počet **položek**. Každá skupina má výchozí
 * obchodní přirážku; položka ji může mít vlastní. Výchozí je vždy **nákup** (cena, za kterou nakupujeme):
 *
 *   prodej = nákup × (1 + přirážka / 100)                (obchodní přirážka: 100 → 120 při 20 %)
 *   marže  = (prodej − nákup) / prodej × 100             (podíl zisku na prodejní ceně: 100 → 120 je marže 16,7 %)
 *
 * Zadává se přirážka (nebo rovnou prodejní cena, pak se přirážka dopočte). Marže se jen ukazuje a hlídá se podle ní
 * minimální marže v semaforu. Částky položek jsou v měně položky; součty se přepočítávají kurzem ČNB.
 *
 * Verze rozpočtu: Koncept (PM upravuje) → Ke schválení (zamčeno) → Schváleno (vedení; poslední schválená verze je baseline).
 * Schválená verze se nemění; úprava = nová verze, která začíná kopií schválené.
 */

import { CurrencyCode, asCurrencyCode } from './currency';
import { hasAnyRole, normalizeLogin } from './roles';
import { Role } from './types';
import { Actor, WorkflowError, WorkflowProject, canIssueOrder } from './orderWorkflow';
import { parseAmount } from './format';

export interface BudgetGroup {
  /** Stabilní identifikátor (vazby položek, objednávek). */
  id: string;
  name: string;
  /** Výchozí obchodní přirážka položek skupiny v %. */
  defaultMarkupPercent: number;
}

export interface BudgetItem {
  id: string;
  groupId: string;
  description: string;
  supplier?: string;
  /** Kategorie nákladů z Nastavení (nepovinná). */
  category?: string;
  currency: CurrencyCode;
  quantity: number;
  unit?: string;
  /** Nákup za jednotku v měně položky. */
  unitCost: number;
  /** Vlastní přirážka v % — bez ní platí výchozí ze skupiny. */
  markupPercent?: number;
  /** Ručně zadaná prodejní cena celkem; má přednost před výpočtem z přirážky. */
  salePriceOverride?: number;
  note?: string;
}

export interface BudgetDoc {
  groups: BudgetGroup[];
  items: BudgetItem[];
}

export const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

// --- výpočty položky -----------------------------------------------------------------

/** Nákup celkem (množství × cena za jednotku) v měně položky. */
export const itemCost = (item: BudgetItem): number => round2(item.quantity * item.unitCost);

/** Přirážka, která platí pro položku: ruční, jinak výchozí ze skupiny. Při ručně zadané prodejní ceně se dopočte. */
export function itemMarkup(item: BudgetItem, group: BudgetGroup | undefined): number {
  const cost = itemCost(item);
  if (item.salePriceOverride !== undefined && cost > 0) {
    return round2(((item.salePriceOverride - cost) / cost) * 100);
  }
  if (item.markupPercent !== undefined) {
    return item.markupPercent;
  }
  return group ? group.defaultMarkupPercent : 0;
}

/** Prodej celkem v měně položky. */
export function itemSale(item: BudgetItem, group: BudgetGroup | undefined): number {
  if (item.salePriceOverride !== undefined) {
    return round2(item.salePriceOverride);
  }
  return round2(itemCost(item) * (1 + itemMarkup(item, group) / 100));
}

/** Marže v % z prodeje; při nulovém prodeji 0. */
export function marginPercent(cost: number, sale: number): number {
  return sale > 0 ? round2(((sale - cost) / sale) * 100) : 0;
}

/** Přirážka v % z nákupu; při nulovém nákupu 0. */
export function markupPercentOf(cost: number, sale: number): number {
  return cost > 0 ? round2(((sale - cost) / cost) * 100) : 0;
}

/** Nastaví přirážku položky (zruší ručně zadanou prodejní cenu). Stejná jako výchozí ze skupiny = položka ji dědí. */
export function withMarkup(item: BudgetItem, group: BudgetGroup | undefined, markup: number): BudgetItem {
  const next: BudgetItem = { ...item, salePriceOverride: undefined };
  next.markupPercent = group && round2(markup) === round2(group.defaultMarkupPercent) ? undefined : round2(markup);
  return next;
}

/** Nastaví prodejní cenu položky ručně (přirážka se dopočte). Cena shodná s vypočtenou ze skupiny zůstane výpočtem. */
export function withSale(item: BudgetItem, group: BudgetGroup | undefined, sale: number): BudgetItem {
  const base: BudgetItem = { ...item, salePriceOverride: undefined, markupPercent: undefined };
  const computed = itemSale(base, group);
  return round2(sale) === computed ? base : { ...item, markupPercent: undefined, salePriceOverride: round2(sale) };
}

// --- součty --------------------------------------------------------------------------

export type Convert = (amount: number, from: CurrencyCode) => number;

export interface BudgetSum {
  cost: number;
  sale: number;
}

export interface BudgetTotals extends BudgetSum {
  markupPercent: number;
  marginPercent: number;
  byGroup: Array<BudgetSum & { groupId: string; name: string; count: number }>;
  byCategory: Array<BudgetSum & { category: string }>;
}

/** Součty rozpočtu v jedné měně (`convert` přepočítá částku položky). Položky bez skupiny se počítají s přirážkou 0. */
export function budgetTotals(doc: BudgetDoc, convert: Convert): BudgetTotals {
  const groups = new Map(doc.groups.map((g) => [g.id, g] as [string, BudgetGroup]));
  const byGroup = doc.groups.map((g) => ({ groupId: g.id, name: g.name, cost: 0, sale: 0, count: 0 }));
  const cats = new Map<string, BudgetSum>();
  let cost = 0;
  let sale = 0;
  doc.items.forEach((item) => {
    const group = groups.get(item.groupId);
    const c = convert(itemCost(item), item.currency);
    const s = convert(itemSale(item, group), item.currency);
    cost += c;
    sale += s;
    const row = byGroup.filter((g) => g.groupId === item.groupId)[0];
    if (row) {
      row.cost += c;
      row.sale += s;
      row.count += 1;
    }
    const key = item.category || 'Bez kategorie';
    const cur = cats.get(key) ?? { cost: 0, sale: 0 };
    cats.set(key, { cost: cur.cost + c, sale: cur.sale + s });
  });
  cost = round2(cost);
  sale = round2(sale);
  return {
    cost,
    sale,
    markupPercent: markupPercentOf(cost, sale),
    marginPercent: marginPercent(cost, sale),
    byGroup: byGroup.map((g) => ({ ...g, cost: round2(g.cost), sale: round2(g.sale) })),
    byCategory: Array.from(cats.entries()).map(([category, v]) => ({ category, cost: round2(v.cost), sale: round2(v.sale) }))
  };
}

// --- tvorba a úpravy -------------------------------------------------------------------

let idCounter = 0;
/** Nový stabilní identifikátor položky nebo skupiny. */
export function newBudgetId(prefix: string = 'r'): string {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** Prázdný rozpočet: skupiny podle kategorií z Nastavení, bez přirážky (upraví PM). */
export function emptyBudget(categories: string[]): BudgetDoc {
  const names = categories.filter((c) => c.trim() !== '');
  return { groups: (names.length > 0 ? names : ['Rozpočet']).map((name) => ({ id: newBudgetId('g'), name, defaultMarkupPercent: 0 })), items: [] };
}

export function newItem(groupId: string, currency: CurrencyCode = 'CZK'): BudgetItem {
  return { id: newBudgetId('i'), groupId, description: '', currency, quantity: 1, unitCost: 0 };
}

/** Přidá skupinu na konec. */
export function addGroup(doc: BudgetDoc, name: string, defaultMarkupPercent: number = 0): BudgetDoc {
  return { ...doc, groups: [...doc.groups, { id: newBudgetId('g'), name: name.trim(), defaultMarkupPercent }] };
}

/** Odebere skupinu i s jejími položkami. */
export function removeGroup(doc: BudgetDoc, groupId: string): BudgetDoc {
  return { groups: doc.groups.filter((g) => g.id !== groupId), items: doc.items.filter((i) => i.groupId !== groupId) };
}

export function updateGroup(doc: BudgetDoc, groupId: string, patch: Partial<Pick<BudgetGroup, 'name' | 'defaultMarkupPercent'>>): BudgetDoc {
  return { ...doc, groups: doc.groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)) };
}

export function updateItem(doc: BudgetDoc, itemId: string, patch: Partial<BudgetItem>): BudgetDoc {
  return { ...doc, items: doc.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) };
}

export function removeItem(doc: BudgetDoc, itemId: string): BudgetDoc {
  return { ...doc, items: doc.items.filter((i) => i.id !== itemId) };
}

/** Přidá položku na konec dané skupiny (položky jsou v jednom seznamu seřazené podle skupin a pořadí). */
export function addItem(doc: BudgetDoc, item: BudgetItem): BudgetDoc {
  const lastIndex = doc.items.reduce((acc, i, idx) => (i.groupId === item.groupId ? idx : acc), -1);
  const items = doc.items.slice();
  items.splice(lastIndex === -1 ? items.length : lastIndex + 1, 0, item);
  return { ...doc, items };
}

/** Přesune položku do jiné skupiny. */
export function moveItem(doc: BudgetDoc, itemId: string, groupId: string): BudgetDoc {
  return updateItem(doc, itemId, { groupId });
}

// --- kontrola -------------------------------------------------------------------------

export interface BudgetIssue {
  message: string;
}

/** Kontrola rozpočtu před odesláním ke schválení. Koncept se ukládá i neúplný (`strict` = false hlídá jen nesmysly). */
export function validateBudget(doc: BudgetDoc, strict: boolean): BudgetIssue[] {
  const out: BudgetIssue[] = [];
  const names = doc.groups.map((g) => g.name.trim().toLocaleLowerCase('cs-CZ'));
  doc.groups.forEach((g, i) => {
    if (g.name.trim() === '') {
      out.push({ message: `Skupina ${i + 1} nemá název.` });
    } else if (names.indexOf(g.name.trim().toLocaleLowerCase('cs-CZ')) !== i) {
      out.push({ message: `Skupina „${g.name}“ je v rozpočtu dvakrát.` });
    }
    if (g.defaultMarkupPercent <= -100) {
      out.push({ message: `Skupina „${g.name}“: přirážka musí být větší než −100 %.` });
    }
  });
  const ids = new Set(doc.groups.map((g) => g.id));
  doc.items.forEach((item, i) => {
    const label = item.description.trim() !== '' ? `„${item.description.trim()}“` : `řádek ${i + 1}`;
    if (!ids.has(item.groupId)) {
      out.push({ message: `Položka ${label} nepatří do žádné skupiny.` });
    }
    if (item.quantity < 0 || item.unitCost < 0) {
      out.push({ message: `Položka ${label}: množství a cena nesmí být záporné.` });
    }
    if (item.markupPercent !== undefined && item.markupPercent <= -100) {
      out.push({ message: `Položka ${label}: přirážka musí být větší než −100 %.` });
    }
    if (strict && item.description.trim() === '') {
      out.push({ message: `Řádek ${i + 1} nemá popis.` });
    }
  });
  if (strict && doc.items.length === 0) {
    out.push({ message: 'Rozpočet nemá žádnou položku.' });
  }
  return out;
}

// --- uložení jako JSON -----------------------------------------------------------------

export function budgetToJson(doc: BudgetDoc): string {
  return JSON.stringify(doc);
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && isFinite(v) ? v : fallback);
const optNum = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) ? v : undefined);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);

/** Přečte uložený rozpočet; poškozené nebo chybějící části se nahradí prázdnými, aby šel rozpočet vždy otevřít. */
export function budgetFromJson(json: string | undefined): BudgetDoc {
  let raw: { groups?: unknown; items?: unknown } = {};
  try {
    raw = json ? (JSON.parse(json) as typeof raw) : {};
  } catch {
    raw = {};
  }
  const groups = (Array.isArray(raw.groups) ? raw.groups : []).map((g: Record<string, unknown>) => ({
    id: str(g.id) || newBudgetId('g'),
    name: str(g.name),
    defaultMarkupPercent: num(g.defaultMarkupPercent, 0)
  }));
  const items = (Array.isArray(raw.items) ? raw.items : []).map((i: Record<string, unknown>) => ({
    id: str(i.id) || newBudgetId('i'),
    groupId: str(i.groupId),
    description: str(i.description),
    supplier: optStr(i.supplier),
    category: optStr(i.category),
    currency: asCurrencyCode(str(i.currency)),
    quantity: num(i.quantity, 1),
    unit: optStr(i.unit),
    unitCost: num(i.unitCost, 0),
    markupPercent: optNum(i.markupPercent),
    salePriceOverride: optNum(i.salePriceOverride),
    note: optStr(i.note)
  }));
  return { groups, items };
}

// --- verze a schvalování ----------------------------------------------------------------

export enum BudgetVersionStatus {
  Koncept = 'Koncept',
  KeSchvaleni = 'Ke schválení',
  Schvaleno = 'Schváleno'
}

export interface BudgetVersion {
  id: number;
  projectNumber: string;
  versionNo: number;
  status: BudgetVersionStatus;
  createdByName?: string;
  approvedByName?: string;
  approvedAt?: Date;
  /** Komentář vedení při vrácení; u schválené verze poznámka ke schválení. */
  comment?: string;
  /** Součty z okamžiku uložení v Kč (kvůli přehledům bez načítání obsahu). */
  totalCost?: number;
  created?: Date;
  modified?: Date;
}

function sameLogin(a: string | undefined, b: string | undefined): boolean {
  const x = normalizeLogin(a);
  return x !== '' && x === normalizeLogin(b);
}

/** Smí uživatel upravovat rozpočet projektu? PM, asistent a další s právem na projekt; na Režii se rozpočet nevede. */
export function canEditBudget(project: WorkflowProject, actor: Actor): boolean {
  return !project.isOverhead && (canIssueOrder(project, actor) || sameLogin(project.projectManagerLogin, actor.login));
}

/** Schvaluje vedení (a administrátor). */
export function canApproveBudget(actor: Actor): boolean {
  return hasAnyRole(actor.roles, Role.Vedeni, Role.Administrator);
}

export type BudgetAction = 'edit' | 'submit' | 'approve' | 'return' | 'newVersion';

/** Akce, které se u verze nabízejí (rozhodnutí se znovu ověřuje při zápisu). `isLatest` = je to poslední verze projektu. */
export function availableBudgetActions(version: BudgetVersion | undefined, isLatest: boolean, project: WorkflowProject, actor: Actor): BudgetAction[] {
  const mayEdit = canEditBudget(project, actor);
  if (!version) {
    return mayEdit ? ['newVersion'] : [];
  }
  const out: BudgetAction[] = [];
  if (version.status === BudgetVersionStatus.Koncept && mayEdit) {
    out.push('edit', 'submit');
  }
  if (version.status === BudgetVersionStatus.KeSchvaleni && canApproveBudget(actor)) {
    out.push('approve', 'return');
  }
  if (version.status === BudgetVersionStatus.KeSchvaleni && mayEdit) {
    // Předkladatel může odeslání stáhnout, dokud vedení nerozhodlo.
    out.push('return');
  }
  if (version.status === BudgetVersionStatus.Schvaleno && isLatest && mayEdit) {
    out.push('newVersion');
  }
  return out.filter((a, i) => out.indexOf(a) === i);
}

export function requireBudgetStatus(version: BudgetVersion, allowed: BudgetVersionStatus[], what: string): void {
  if (allowed.indexOf(version.status) === -1) {
    throw new WorkflowError(`${what}: verze ${version.versionNo} je ve stavu „${version.status}“, to nejde.`);
  }
}

/** Poslední schválená verze = baseline projektu. */
export function baselineOf(versions: BudgetVersion[]): BudgetVersion | undefined {
  return versions
    .filter((v) => v.status === BudgetVersionStatus.Schvaleno)
    .sort((a, b) => b.versionNo - a.versionNo)[0];
}

export const latestVersion = (versions: BudgetVersion[]): BudgetVersion | undefined => versions.slice().sort((a, b) => b.versionNo - a.versionNo)[0];

/** Další číslo verze (nejvyšší + 1). */
export const nextVersionNo = (versions: BudgetVersion[]): number => versions.reduce((m, v) => Math.max(m, v.versionNo), 0) + 1;

// --- import z tabulky (schránka z Excelu, soubor) -------------------------------------------

export interface ImportedRow {
  description: string;
  supplier?: string;
  quantity: number;
  unit?: string;
  unitCost: number;
  currency: CurrencyCode;
}

const norm = (s: string): string =>
  s
    .toLocaleLowerCase('cs-CZ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

const HEAD = {
  description: ['polozka', 'popis', 'nazev', 'text'],
  supplier: ['dodavatel', 'firma'],
  quantity: ['mnozstvi', 'mnoz', 'ks', 'pocet'],
  unit: ['mj', 'jednotka'],
  unitCost: ['nakup za mj', 'cena za mj', 'jednotkova cena', 'cena/mj', 'nakup/mj', 'cena jedn'],
  total: ['plan', 'nakup', 'nakup celkem', 'castka', 'cena', 'celkem'],
  currency: ['mena']
};

export interface ImportResult {
  rows: ImportedRow[];
  /** Co se přečetlo a co ne — pro okno náhledu. */
  notes: string[];
}

/**
 * Z tabulky (řádky buněk) vytáhne položky rozpočtu. První řádek s nadpisy „Položka/Popis“ a „Plán/Nákup/Cena…“ určí sloupce;
 * bez nadpisů se bere 1. sloupec jako popis a první číselný jako nákup. Řádky souhrnů (CELKEM) a řádky bez částky se přeskočí.
 * Množství a cena za jednotku se použijí, jsou-li v tabulce; jinak je množství 1 a nákup celková částka.
 */
export function parseBudgetTable(table: string[][], defaultCurrency: CurrencyCode = 'CZK'): ImportResult {
  const notes: string[] = [];
  const cleaned = table.map((r) => r.map((c) => (c ?? '').toString().trim())).filter((r) => r.some((c) => c !== ''));
  let headerIdx = -1;
  let col: { [k in keyof typeof HEAD]?: number } = {};
  cleaned.slice(0, 8).forEach((r, idx) => {
    if (headerIdx !== -1) {
      return;
    }
    const found: typeof col = {};
    r.forEach((cell, ci) => {
      const n = norm(cell);
      (Object.keys(HEAD) as Array<keyof typeof HEAD>).forEach((k) => {
        if (found[k] === undefined && HEAD[k].indexOf(n) !== -1) {
          found[k] = ci;
        }
      });
    });
    if (found.description !== undefined && (found.total !== undefined || found.unitCost !== undefined)) {
      headerIdx = idx;
      col = found;
    }
  });
  const body = headerIdx === -1 ? cleaned : cleaned.slice(headerIdx + 1);
  if (headerIdx === -1) {
    notes.push('Nenašel jsem řádek s nadpisy (Položka, Plán/Nákup…) — první sloupec beru jako popis a první číslo jako nákup.');
  }
  const rows: ImportedRow[] = [];
  body.forEach((r) => {
    const get = (k: keyof typeof HEAD): string | undefined => (col[k] === undefined ? undefined : r[col[k] as number]);
    const description = headerIdx === -1 ? r[0] : get('description');
    if (!description || /^(celkem|součet|soucet|total)\b/i.test(norm(description))) {
      return;
    }
    let unitCost = parseAmount(get('unitCost'));
    let quantity = parseAmount(get('quantity'));
    const total = headerIdx === -1 ? r.slice(1).map((c) => parseAmount(c)).filter((v) => v !== undefined)[0] : parseAmount(get('total'));
    if (unitCost === undefined && total === undefined) {
      return;
    }
    if (unitCost === undefined) {
      unitCost = total as number;
      quantity = 1;
    } else if (quantity === undefined) {
      quantity = 1;
    }
    const cur = norm(get('currency') || '').toUpperCase();
    rows.push({
      description,
      supplier: get('supplier') || undefined,
      quantity: quantity as number,
      unit: get('unit') || undefined,
      unitCost,
      currency: cur === 'EUR' || cur === 'USD' || cur === 'CZK' ? (cur as CurrencyCode) : defaultCurrency
    });
  });
  if (rows.length === 0) {
    notes.push('Nepodařilo se přečíst žádnou položku s částkou.');
  }
  return { rows, notes };
}

/** Text vložený ze schránky (tabulátory z Excelu) na řádky buněk. Uvozovky s odřádkováním uvnitř buňky se nepodporují. */
export function parseClipboardTable(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => l.split('\t'));
}
