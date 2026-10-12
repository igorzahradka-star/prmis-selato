/**
 * Realizační rozpočet (RR) projektu — čistá logika bez SharePointu a Reactu.
 *
 * Rozpočet je **jeden na projekt**. Prodejní cenu si počítá nabídkový nástroj (REVCRM); do projektu přichází smluvní cena
 * a nákup, proto rozpočet nepracuje s prodejem ani přirážkou u položek. Tvoří ho dvě strany:
 *
 *  - **Nákup** — **skupiny** a v nich libovolný počet **položek**. Položka má **plán** (množství × cena za jednotku; u vlastní
 *    práce hodiny × nákladová sazba profese; u rezervy částka, nebo % z nákupu ostatních), **prognózu** (ruční, jinak plán;
 *    nikdy méně než objednáno a koupeno) a **skutečnost** (koupeno / odpracováno).
 *  - **Výnosy** — řádky smluvních tržeb (smluvní cena, dodatky, vícepráce): **plán**, **prognóza** (jinak plán) a **vyfakturováno**.
 *    Součet plánu výnosů **je smluvní cena** projektu (vždy bez DPH).
 *
 *   marže = (tržby − nákup) / tržby × 100            (podíl zisku na tržbách: tržby 120, nákup 100 → 16,7 %)
 *   marže v měně = tržby − nákup
 *
 * Při prvním schválení se zafixuje plán (marže v % i v měně do historie) a prognóza se rovná plánu. Plán je po schválení
 * uzamčený; jeho změna vyžaduje odemčení a nové schválení. Prognózu a skutečnost smí projektový manažer měnit vždy.
 * Semafor se řídí aktuální marží z prognózy (viz `budgetMargin.ts`).
 */

import { CurrencyCode, RateTable, asCurrencyCode, convertAmount } from './currency';
import { hasAnyRole, normalizeLogin } from './roles';
import { Role } from './types';
import { Actor, Assignee, WorkflowProject, canIssueOrder } from './orderWorkflow';
import { parseAmount } from './format';
import { Profession } from './settings';
import { OrderStatus, SPENT_ORDER_STATUSES } from './orders';

export type { Profession };

export type GroupKind = 'standard' | 'prace' | 'rezerva';

export const GROUP_KIND_LABELS: Record<GroupKind, string> = {
  standard: 'běžná skupina',
  prace: 'vlastní práce (hodiny)',
  rezerva: 'rezerva'
};

export interface BudgetGroup {
  /** Stabilní identifikátor (vazby položek, objednávek). */
  id: string;
  name: string;
  kind: GroupKind;
  /** Výchozí obchodní přirážka položek běžné skupiny v %. */
  defaultMarkupPercent: number;
}

/** Sazba profese v projektu (Kč za hodinu). Kopie z číselníku v Nastavení, v projektu se dá upravit. */
export interface LabourRate {
  id: string;
  name: string;
  costRate: number;
  saleRate: number;
}

export interface BudgetItem {
  id: string;
  groupId: string;
  description: string;
  supplier?: string;
  /** Kategorie nákladů z Nastavení (nepovinná). */
  category?: string;
  currency: CurrencyCode;
  /** Plánované množství (u vlastní práce počet hodin). */
  quantity: number;
  unit?: string;
  /** Nákup za jednotku v měně položky. */
  unitCost: number;
  /** Vlastní přirážka v % — bez ní platí výchozí ze skupiny. */
  markupPercent?: number;
  /** Ručně zadaná prodejní cena celkem; má přednost před výpočtem z přirážky. */
  salePriceOverride?: number;
  /** Vlastní práce: profese ze sazeb projektu. */
  rateId?: string;
  /** Rezerva: velikost v % z prodeje (jinak částkou v nákupu). */
  reservePercent?: number;
  /** Skutečnost: koupené množství (u práce odpracované hodiny). */
  actualQty?: number;
  /** Skutečnost: za kolik se koupilo (v měně položky); u práce se počítá z hodin a nákladové sazby. */
  actualCost?: number;
  /** Prognóza nákladů položky (v měně položky), zadává PM; bez ní platí plán. Nikdy není nižší než objednáno a koupeno. */
  forecastCost?: number;
  /** Úkol harmonogramu, který položku potřebuje (dodávka před zahájením úkolu) — hlídá se termín dodání objednávek. */
  taskId?: number;
  note?: string;
}

/** Režim DPH platby: sazba a popisek (podle vzoru Excelu „Průběh plateb“). */
export type VatRegime = 'dph21' | 'dph12' | 'reverse' | 'neplatce';

export const VAT_REGIMES: Record<VatRegime, { label: string; rate: number }> = {
  dph21: { label: 'DPH 21 %', rate: 21 },
  dph12: { label: 'DPH 12 %', rate: 12 },
  reverse: { label: 'Reverse charge (bez DPH)', rate: 0 },
  neplatce: { label: 'Neplátce DPH (bez DPH)', rate: 0 }
};

export const VAT_REGIME_KEYS: VatRegime[] = ['dph21', 'dph12', 'reverse', 'neplatce'];

/** Naplánovaná platba nákladu (plán výdajů v cashflow). Data jsou texty `RRRR-MM-DD`. */
export interface PlannedPayment {
  id: string;
  /** Položka rozpočtu, ke které platba patří (nepovinné). */
  itemId?: string;
  description: string;
  /** Částka bez DPH v měně platby. */
  amount: number;
  currency: CurrencyCode;
  vat: VatRegime;
  /** Datum faktury dodavatele (náklad v čase). */
  invoiceDate?: string;
  /** Splatnost = kdy se platí (výdaj v cashflow). */
  dueDate?: string;
  /** Skutečné datum úhrady a případně skutečná částka bez DPH (bez ní platí plánovaná). */
  paidDate?: string;
  paidAmount?: number;
  /** Vazba na úkol harmonogramu: datum faktury = zahájení / dokončení úkolu + posun ve dnech, splatnost = faktura + dny. */
  taskId?: number;
  taskAnchor?: 'start' | 'finish';
  taskOffsetDays?: number;
  taskDueDays?: number;
  note?: string;
}

/** Fakturační milník (plán příjmů v cashflow). */
export interface IncomeMilestone {
  id: string;
  description: string;
  /** Plánované datum vystavení faktury. */
  plannedDate?: string;
  /** Částka bez DPH v měně milníku. */
  amount: number;
  currency: CurrencyCode;
  vatRate: number;
  dueDays: number;
  /** Číslo podkladu pro fakturaci (FP…), který milník naplňuje — splatnost a úhrada se pak berou z něj. */
  invoiceNumber?: string;
  /** Výnos z rozpočtu (`RevenueLine.id`), kterému milník patří — součet milníků výnosu se porovnává s jeho prognózou. */
  revenueId?: string;
  /** Datum úhrady zadané ručně. */
  paidDate?: string;
  note?: string;
}

/** Řádek výnosů (smluvní tržby): smluvní cena, dodatek, vícepráce… Částky bez DPH v měně řádku. */
export interface RevenueLine {
  id: string;
  description: string;
  currency: CurrencyCode;
  /** Plán = smluvní částka; součet plánů je smluvní cena projektu. */
  plan: number;
  /** Prognóza tržeb; bez ní platí plán. */
  forecast?: number;
  /** Vyfakturováno (zatím ručně, později z účetnictví). */
  invoiced?: number;
  note?: string;
}

export const revenueForecast = (r: RevenueLine): number => (r.forecast !== undefined ? r.forecast : r.plan);

export interface BudgetDoc {
  groups: BudgetGroup[];
  items: BudgetItem[];
  rates: LabourRate[];
  /** Plán plateb nákladů a fakturační milníky (cashflow projektu). Chybí-li, jsou prázdné. */
  payments?: PlannedPayment[];
  income?: IncomeMilestone[];
  /** Výnosy (smluvní tržby). Chybí-li, rozpočet je z doby před zavedením výnosů a při otevření se převede (viz `ensureRevenues`). */
  revenues?: RevenueLine[];
}

export const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

// --- výpočty položky -----------------------------------------------------------------

/** Nákup celkem běžné položky (množství × cena za jednotku) v měně položky. */
export const itemCost = (item: BudgetItem): number => round2(item.quantity * item.unitCost);

/** Přirážka, která platí pro běžnou položku: ruční, jinak výchozí ze skupiny. Při ručně zadané prodejní ceně se dopočte. */
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

/** Prodej celkem běžné položky v měně položky. */
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

// --- výpočet celého rozpočtu -----------------------------------------------------------

/** Vypočtené hodnoty jedné položky; částky jsou v měně `currency` (vlastní práce a rezerva v procentech v Kč). */
export interface ItemCalc {
  item: BudgetItem;
  group: BudgetGroup | undefined;
  currency: CurrencyCode;
  cost: number;
  /** Skutečnost: koupené množství a částka. */
  actualQty: number;
  actualCost: number;
  /** Zbývá koupit: množství a částka (plán − skutečnost; záporné = překročeno). */
  remainingQty: number;
  remainingCost: number;
  /** Objednáno: součet objednávek navázaných na položku (v měně položky). */
  ordered: number;
  /** Prognóza nákladů: ruční (jinak plán), nejméně však objednáno a koupeno. */
  forecast: number;
}

export const findRate = (doc: BudgetDoc, id: string | undefined): LabourRate | undefined => doc.rates.filter((r) => r.id === id)[0];

/**
 * Vypočte všechny položky. Rezerva v procentech je p % z nákupu ostatních položek (v Kč): R = p / 100 × nákup ostatních.
 */
export function calcItems(doc: BudgetDoc, rates: RateTable, orders: OrderLike[] = []): ItemCalc[] {
  const groups = new Map(doc.groups.map((g) => [g.id, g] as [string, BudgetGroup]));
  const base = (item: BudgetItem): ItemCalc => {
    const group = groups.get(item.groupId);
    let c: Pick<ItemCalc, 'currency' | 'cost' | 'actualQty' | 'actualCost'>;
    if (group && group.kind === 'prace') {
      const rate = findRate(doc, item.rateId);
      const hours = item.actualQty ?? 0;
      c = {
        currency: 'CZK',
        cost: round2(item.quantity * (rate ? rate.costRate : 0)),
        actualQty: hours,
        actualCost: round2(hours * (rate ? rate.costRate : 0))
      };
    } else if (group && group.kind === 'rezerva') {
      c = { currency: item.currency, cost: itemCost(item), actualQty: item.actualQty ?? 0, actualCost: item.actualCost ?? 0 };
    } else {
      c = { currency: item.currency, cost: itemCost(item), actualQty: item.actualQty ?? 0, actualCost: item.actualCost ?? 0 };
    }
    const ordered = orderedForItem(orders, item.id, c.currency, rates);
    return {
      item,
      group,
      ...c,
      remainingQty: round2(item.quantity - c.actualQty),
      remainingCost: round2(c.cost - c.actualCost),
      ordered,
      forecast: forecastOf(item.forecastCost, c.cost, ordered, c.actualCost)
    };
  };
  const calcs = doc.items.map(base);
  const percentReserves = calcs.filter((c) => c.group && c.group.kind === 'rezerva' && c.item.reservePercent !== undefined);
  if (percentReserves.length > 0) {
    const otherCostCzk = calcs.filter((c) => percentReserves.indexOf(c) === -1).reduce((s, c) => s + convertAmount(c.cost, c.currency, 'CZK', rates), 0);
    percentReserves.forEach((c) => {
      const p = c.item.reservePercent as number;
      const amount = round2((p / 100) * otherCostCzk);
      c.currency = 'CZK';
      c.cost = amount;
      c.remainingCost = round2(amount - c.actualCost);
      c.forecast = forecastOf(c.item.forecastCost, amount, c.ordered, c.actualCost);
    });
  }
  return calcs;
}

export interface BudgetSum {
  /** Plán nákupu. */
  cost: number;
  /** Skutečnost (koupeno) a zbývá, v nákladech. */
  actual: number;
  remaining: number;
  /** Objednáno (navázané objednávky) a prognóza nákladů. */
  ordered: number;
  forecast: number;
}

/** Marže: podíl zisku na tržbách v % (bez tržeb nedefinovaná) a zisk v měně. */
export interface MarginValue {
  percent?: number;
  amount: number;
}

export function marginOf(revenue: number, cost: number): MarginValue {
  return { percent: revenue > 0 ? round2(((revenue - cost) / revenue) * 100) : undefined, amount: round2(revenue - cost) };
}

export interface BudgetTotals extends BudgetSum {
  /** Plán výnosů = smluvní cena. */
  sale: number;
  /** Prognóza a vyfakturováno u výnosů. */
  revenueForecast: number;
  revenueInvoiced: number;
  /** Marže z plánu (tržby plán − nákup plán) a z prognózy (tržby prognóza − nákup prognóza). */
  plannedMargin: MarginValue;
  forecastMargin: MarginValue;
  spentPercent: number;
  byGroup: Array<BudgetSum & { groupId: string; name: string; kind: GroupKind; count: number }>;
  byCategory: Array<BudgetSum & { category: string }>;
}

/** Objednávka, jak ji potřebuje výpočet rozpočtu (objednáno u položky). */
export interface OrderLike {
  budgetItemId?: string;
  status: OrderStatus;
  amountNet: number;
  currency: string;
}

/** Objednáno u položky: součet navázaných objednávek ve stavech, které se počítají jako vystavené, v měně položky. */
export function orderedForItem(orders: OrderLike[], itemId: string, currency: CurrencyCode, rates: RateTable): number {
  return round2(
    orders
      .filter((o) => o.budgetItemId === itemId && SPENT_ORDER_STATUSES.indexOf(o.status) !== -1)
      .reduce((s, o) => s + convertAmount(o.amountNet, o.currency, currency, rates), 0)
  );
}

/** Prognóza nákladů položky: ruční (jinak plán), nikdy méně než už objednáno nebo koupeno. */
export function forecastOf(manual: number | undefined, plan: number, ordered: number, actual: number): number {
  return round2(Math.max(manual !== undefined ? manual : plan, ordered, actual));
}

const zeroSum = (): BudgetSum => ({ cost: 0, actual: 0, remaining: 0, ordered: 0, forecast: 0 });

/** Součty rozpočtu v jedné měně (`target`); položky se přepočítají kurzem ČNB. */
export function budgetTotals(doc: BudgetDoc, target: CurrencyCode, rates: RateTable, orders: OrderLike[] = []): BudgetTotals {
  const calcs = calcItems(doc, rates, orders);
  const to = (amount: number, from: CurrencyCode): number => convertAmount(amount, from, target, rates);
  const total = zeroSum();
  const groupSums = new Map<string, BudgetSum & { count: number }>(doc.groups.map((g) => [g.id, { ...zeroSum(), count: 0 }]));
  const cats = new Map<string, BudgetSum>();
  calcs.forEach((c) => {
    const add = (s: BudgetSum): void => {
      s.cost += to(c.cost, c.currency);
      s.actual += to(c.actualCost, c.currency);
      s.remaining += to(c.remainingCost, c.currency);
      s.ordered += to(c.ordered, c.currency);
      s.forecast += to(c.forecast, c.currency);
    };
    add(total);
    const gs = groupSums.get(c.item.groupId);
    if (gs) {
      add(gs);
      gs.count += 1;
    }
    const key = c.item.category || (c.group && c.group.kind === 'prace' ? 'Vlastní práce' : 'Bez kategorie');
    const cur = cats.get(key) ?? zeroSum();
    add(cur);
    cats.set(key, cur);
  });
  const r = (s: BudgetSum): BudgetSum => ({ cost: round2(s.cost), actual: round2(s.actual), remaining: round2(s.remaining), ordered: round2(s.ordered), forecast: round2(s.forecast) });
  const t = r(total);
  const revenues = doc.revenues ?? [];
  const sale = round2(revenues.reduce((s, x) => s + to(x.plan, x.currency), 0));
  const revForecast = round2(revenues.reduce((s, x) => s + to(revenueForecast(x), x.currency), 0));
  const revInvoiced = round2(revenues.reduce((s, x) => s + to(x.invoiced ?? 0, x.currency), 0));
  return {
    ...t,
    sale,
    revenueForecast: revForecast,
    revenueInvoiced: revInvoiced,
    plannedMargin: marginOf(sale, t.cost),
    forecastMargin: marginOf(revForecast, t.forecast),
    spentPercent: t.cost > 0 ? round2((t.actual / t.cost) * 100) : 0,
    byGroup: doc.groups.map((g) => ({ ...r(groupSums.get(g.id) as BudgetSum), groupId: g.id, name: g.name, kind: g.kind, count: (groupSums.get(g.id) as { count: number }).count })),
    byCategory: Array.from(cats.entries()).map(([category, v]) => ({ ...r(v), category }))
  };
}

let idCounter = 0;
/** Nový stabilní identifikátor položky, skupiny nebo sazby. */
export function newBudgetId(prefix: string = 'r'): string {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** Druh skupiny podle názvu kategorie z Nastavení („Vlastní práce“ → práce, „Rezerva“ → rezerva). */
export function kindForName(name: string): GroupKind {
  const n = name.trim().toLocaleLowerCase('cs-CZ');
  if (n === 'vlastní práce' || n === 'vlastni prace') {
    return 'prace';
  }
  if (n === 'rezerva' || n === 'realizační rezerva' || n === 'realizacni rezerva') {
    return 'rezerva';
  }
  return 'standard';
}

/** Prázdný rozpočet: skupiny podle kategorií z Nastavení a sazby profesí zkopírované z číselníku (upraví PM). */
export function emptyBudget(categories: string[], professions: Profession[] = []): BudgetDoc {
  const names = categories.filter((c) => c.trim() !== '');
  return {
    groups: (names.length > 0 ? names : ['Rozpočet']).map((name) => ({ id: newBudgetId('g'), name, kind: kindForName(name), defaultMarkupPercent: 0 })),
    items: [],
    rates: professions.filter((p) => p.name.trim() !== '').map((p) => ({ id: newBudgetId('s'), name: p.name, costRate: p.costRate, saleRate: p.saleRate }))
  };
}

export function newItem(group: BudgetGroup, rates: LabourRate[] = [], currency: CurrencyCode = 'CZK', quantity: number = 1): BudgetItem {
  const base: BudgetItem = { id: newBudgetId('i'), groupId: group.id, description: '', currency, quantity, unitCost: 0 };
  if (group.kind === 'prace') {
    return { ...base, currency: 'CZK', unit: 'h', rateId: rates.length > 0 ? rates[0].id : undefined };
  }
  return base;
}

export function newRevenueLine(currency: CurrencyCode = 'CZK', description: string = ''): RevenueLine {
  return { id: newBudgetId('v'), description, currency, plan: 0 };
}

/** Přidá skupinu na konec. */
export function addGroup(doc: BudgetDoc, name: string, kind: GroupKind = 'standard', defaultMarkupPercent: number = 0): BudgetDoc {
  return { ...doc, groups: [...doc.groups, { id: newBudgetId('g'), name: name.trim(), kind, defaultMarkupPercent }] };
}

/** Odebere skupinu i s jejími položkami. */
export function removeGroup(doc: BudgetDoc, groupId: string): BudgetDoc {
  return { ...doc, groups: doc.groups.filter((g) => g.id !== groupId), items: doc.items.filter((i) => i.groupId !== groupId) };
}

export function updateGroup(doc: BudgetDoc, groupId: string, patch: Partial<Pick<BudgetGroup, 'name' | 'defaultMarkupPercent'>>): BudgetDoc {
  return { ...doc, groups: doc.groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)) };
}

export function updateItem(doc: BudgetDoc, itemId: string, patch: Partial<BudgetItem>): BudgetDoc {
  return { ...doc, items: doc.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) };
}

/**
 * Plán nákupu položky celkovou částkou (v tabulce se zadává jen celek; ks a cena za MJ se řeší v nabídkovém nástroji).
 * Počet kusů a MJ ze starých dat zůstanou: cena za jednotku se dopočte tak, aby kusy × cena = zadaný celek. Bez kusů vznikne 1 ks.
 */
export function withPlanTotal(item: BudgetItem, total: number): BudgetItem {
  const t = round2(Math.max(0, total));
  return item.quantity > 0 ? { ...item, unitCost: t / item.quantity } : { ...item, quantity: 1, unitCost: t };
}

/** Vlastní práce: plán celkovou částkou → hodiny = částka / nákladová sazba profese; bez sazby nejde (vrací undefined). */
export function withLabourTotal(item: BudgetItem, total: number, costRate: number): BudgetItem | undefined {
  return costRate > 0 ? { ...item, quantity: Math.max(0, total) / costRate } : undefined;
}

/** Vlastní práce: skutečnost celkovou částkou → odpracované hodiny = částka / nákladová sazba; prázdná hodnota skutečnost zruší. */
export function withLabourActual(item: BudgetItem, amount: number | undefined, costRate: number): BudgetItem | undefined {
  if (amount === undefined) {
    return { ...item, actualQty: undefined };
  }
  return costRate > 0 ? { ...item, actualQty: Math.max(0, amount) / costRate } : undefined;
}

export function removeItem(doc: BudgetDoc, itemId: string): BudgetDoc {
  // Platby smazané položky zůstanou (jsou to plánované peníze), ztratí jen vazbu na položku.
  return { ...doc, items: doc.items.filter((i) => i.id !== itemId), payments: (doc.payments ?? []).map((p) => (p.itemId === itemId ? { ...p, itemId: undefined } : p)) };
}

/** Přidá položku na konec její skupiny (položky jsou v jednom seznamu seřazené podle skupin a pořadí). */
export function addItem(doc: BudgetDoc, item: BudgetItem): BudgetDoc {
  const lastIndex = doc.items.reduce((acc, i, idx) => (i.groupId === item.groupId ? idx : acc), -1);
  const items = doc.items.slice();
  items.splice(lastIndex === -1 ? items.length : lastIndex + 1, 0, item);
  return { ...doc, items };
}

/** Kopie položky hned pod původní (nové id, bez skutečnosti). */
export function duplicateItem(doc: BudgetDoc, itemId: string): BudgetDoc {
  const idx = doc.items.findIndex((i) => i.id === itemId);
  if (idx === -1) {
    return doc;
  }
  const copy: BudgetItem = { ...doc.items[idx], id: newBudgetId('i'), actualQty: undefined, actualCost: undefined, forecastCost: undefined };
  const items = doc.items.slice();
  items.splice(idx + 1, 0, copy);
  return { ...doc, items };
}

/** Přesune položku do jiné skupiny. Při přesunu mezi druhy skupin se upraví pole podle nového druhu. */
export function moveItem(doc: BudgetDoc, itemId: string, groupId: string): BudgetDoc {
  const target = doc.groups.filter((g) => g.id === groupId)[0];
  const item = doc.items.filter((i) => i.id === itemId)[0];
  if (!target || !item) {
    return doc;
  }
  const rest = doc.items.filter((i) => i.id !== itemId);
  let moved: BudgetItem = { ...item, groupId };
  if (target.kind === 'prace' && !moved.rateId) {
    moved = { ...moved, currency: 'CZK', unit: moved.unit || 'h', rateId: doc.rates.length > 0 ? doc.rates[0].id : undefined };
  }
  if (target.kind !== 'standard') {
    moved = { ...moved, markupPercent: undefined, salePriceOverride: undefined };
  }
  if (target.kind !== 'rezerva') {
    moved = { ...moved, reservePercent: undefined };
  }
  return addItem({ ...doc, items: rest }, moved);
}

// --- sazby profesí projektu --------------------------------------------------------------

export function updateRate(doc: BudgetDoc, rateId: string, patch: Partial<Pick<LabourRate, 'name' | 'costRate' | 'saleRate'>>): BudgetDoc {
  return { ...doc, rates: doc.rates.map((r) => (r.id === rateId ? { ...r, ...patch } : r)) };
}

export function addRate(doc: BudgetDoc, name: string): BudgetDoc {
  return { ...doc, rates: [...doc.rates, { id: newBudgetId('s'), name: name.trim(), costRate: 0, saleRate: 0 }] };
}

/** Odebere sazbu; položky práce, které ji používaly, zůstanou bez profese (upozorní kontrola). */
export function removeRate(doc: BudgetDoc, rateId: string): BudgetDoc {
  return { ...doc, rates: doc.rates.filter((r) => r.id !== rateId), items: doc.items.map((i) => (i.rateId === rateId ? { ...i, rateId: undefined } : i)) };
}

// --- kontrola -------------------------------------------------------------------------

export interface BudgetIssue {
  message: string;
}

/** Kontrola rozpočtu před žádostí o schválení. Uložit jde i neúplný (`strict` = false hlídá jen nesmysly). */
export function validateBudget(doc: BudgetDoc, strict: boolean): BudgetIssue[] {
  const out: BudgetIssue[] = [];
  const names = doc.groups.map((g) => g.name.trim().toLocaleLowerCase('cs-CZ'));
  doc.groups.forEach((g, i) => {
    if (g.name.trim() === '') {
      out.push({ message: `Skupina ${i + 1} nemá název.` });
    } else if (names.indexOf(g.name.trim().toLocaleLowerCase('cs-CZ')) !== i) {
      out.push({ message: `Skupina „${g.name}“ je v rozpočtu dvakrát.` });
    }
  });
  const ids = new Set(doc.groups.map((g) => g.id));
  const kindOf = new Map(doc.groups.map((g) => [g.id, g.kind] as [string, GroupKind]));
  doc.items.filter((i) => kindOf.get(i.groupId) === 'rezerva' && i.reservePercent !== undefined && ((i.reservePercent as number) < 0 || (i.reservePercent as number) > 100)).forEach(() => {
    out.push({ message: 'Rezerva v procentech musí být mezi 0 a 100 % z nákupu ostatních položek.' });
  });
  doc.rates.forEach((r, i) => {
    if (r.name.trim() === '') {
      out.push({ message: `Sazba ${i + 1} nemá název profese.` });
    }
    if (r.costRate < 0 || r.saleRate < 0) {
      out.push({ message: `Sazba „${r.name}“: sazby nesmí být záporné.` });
    }
  });
  doc.items.forEach((item, i) => {
    const label = item.description.trim() !== '' ? `„${item.description.trim()}“` : `řádek ${i + 1}`;
    if (!ids.has(item.groupId)) {
      out.push({ message: `Položka ${label} nepatří do žádné skupiny.` });
    }
    if (item.quantity < 0 || item.unitCost < 0 || (item.actualQty ?? 0) < 0 || (item.actualCost ?? 0) < 0) {
      out.push({ message: `Položka ${label}: množství a ceny nesmí být záporné.` });
    }
    if (kindOf.get(item.groupId) === 'prace' && !findRate(doc, item.rateId)) {
      out.push({ message: `Práce ${label}: vyberte profesi.` });
    }
    if (strict && item.description.trim() === '' && kindOf.get(item.groupId) !== 'prace') {
      out.push({ message: `Řádek ${i + 1} nemá popis.` });
    }
  });
  (doc.payments ?? []).forEach((p, i) => {
    if (p.amount < 0 || (p.paidAmount ?? 0) < 0) {
      out.push({ message: `Platba ${i + 1}: částka nesmí být záporná.` });
    }
  });
  (doc.revenues ?? []).forEach((r, i) => {
    const label = r.description.trim() !== '' ? `„${r.description.trim()}“` : `řádek ${i + 1}`;
    if (r.plan < 0 || (r.forecast ?? 0) < 0 || (r.invoiced ?? 0) < 0) {
      out.push({ message: `Výnos ${label}: částky nesmí být záporné.` });
    }
    if (strict && r.description.trim() === '') {
      out.push({ message: `Výnos ${i + 1} nemá popis.` });
    }
  });
  (doc.income ?? []).forEach((m, i) => {
    if (m.amount < 0 || m.dueDays < 0) {
      out.push({ message: `Fakturační milník ${i + 1}: částka a splatnost nesmí být záporné.` });
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
const asKind = (v: unknown, name: string): GroupKind => (v === 'prace' || v === 'rezerva' || v === 'standard' ? v : kindForName(name));

/** Přečte uložený rozpočet; poškozené nebo chybějící části se nahradí prázdnými, aby šel rozpočet vždy otevřít. */
export function budgetFromJson(json: string | undefined): BudgetDoc {
  let raw: { groups?: unknown; items?: unknown; rates?: unknown; payments?: unknown; income?: unknown; revenues?: unknown } = {};
  try {
    raw = json ? (JSON.parse(json) as typeof raw) : {};
  } catch {
    raw = {};
  }
  const groups = (Array.isArray(raw.groups) ? raw.groups : []).map((g: Record<string, unknown>) => ({
    id: str(g.id) || newBudgetId('g'),
    name: str(g.name),
    kind: asKind(g.kind, str(g.name)),
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
    rateId: optStr(i.rateId),
    reservePercent: optNum(i.reservePercent),
    actualQty: optNum(i.actualQty),
    actualCost: optNum(i.actualCost),
    forecastCost: optNum(i.forecastCost),
    taskId: optNum(i.taskId),
    note: optStr(i.note)
  }));
  const rates = (Array.isArray(raw.rates) ? raw.rates : []).map((r: Record<string, unknown>) => ({
    id: str(r.id) || newBudgetId('s'),
    name: str(r.name),
    costRate: num(r.costRate, 0),
    saleRate: num(r.saleRate, 0)
  }));
  const asVat = (v: unknown): VatRegime => (v === 'dph12' || v === 'reverse' || v === 'neplatce' ? v : 'dph21');
  const day = (v: unknown): string | undefined => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const payments: PlannedPayment[] = (Array.isArray(raw.payments) ? raw.payments : []).map((p: Record<string, unknown>) => ({
    id: str(p.id) || newBudgetId('p'),
    itemId: optStr(p.itemId),
    description: str(p.description),
    amount: num(p.amount, 0),
    currency: asCurrencyCode(str(p.currency)),
    vat: asVat(p.vat),
    invoiceDate: day(p.invoiceDate),
    dueDate: day(p.dueDate),
    paidDate: day(p.paidDate),
    paidAmount: optNum(p.paidAmount),
    taskId: optNum(p.taskId),
    taskAnchor: p.taskAnchor === 'start' ? 'start' : p.taskAnchor === 'finish' ? 'finish' : undefined,
    taskOffsetDays: optNum(p.taskOffsetDays),
    taskDueDays: optNum(p.taskDueDays),
    note: optStr(p.note)
  }));
  const income: IncomeMilestone[] = (Array.isArray(raw.income) ? raw.income : []).map((m: Record<string, unknown>) => ({
    id: str(m.id) || newBudgetId('m'),
    description: str(m.description),
    plannedDate: day(m.plannedDate),
    amount: num(m.amount, 0),
    currency: asCurrencyCode(str(m.currency)),
    vatRate: num(m.vatRate, 21),
    dueDays: num(m.dueDays, 30),
    invoiceNumber: optStr(m.invoiceNumber),
    revenueId: optStr(m.revenueId),
    paidDate: day(m.paidDate),
    note: optStr(m.note)
  }));
  // Bez klíče `revenues` jde o rozpočet z doby před zavedením výnosů (převede ho `ensureRevenues`); prázdné pole je záměrně prázdné.
  const revenues: RevenueLine[] | undefined = Array.isArray(raw.revenues)
    ? (raw.revenues as Record<string, unknown>[]).map((r) => ({
        id: str(r.id) || newBudgetId('v'),
        description: str(r.description),
        currency: asCurrencyCode(str(r.currency)),
        plan: num(r.plan, 0),
        forecast: optNum(r.forecast),
        invoiced: optNum(r.invoiced),
        note: optStr(r.note)
      }))
    : undefined;
  return revenues ? { groups, items, rates, payments, income, revenues } : { groups, items, rates, payments, income };
}

export function newPayment(itemId?: string, description: string = '', currency: CurrencyCode = 'CZK'): PlannedPayment {
  return { id: newBudgetId('p'), itemId, description, amount: 0, currency, vat: currency === 'CZK' ? 'dph21' : 'reverse' };
}

export function newMilestone(currency: CurrencyCode = 'CZK'): IncomeMilestone {
  return { id: newBudgetId('m'), description: '', amount: 0, currency, vatRate: 21, dueDays: 30 };
}

// --- schvalování ------------------------------------------------------------------------

export enum BudgetStatus {
  Koncept = 'Koncept',
  KeSchvaleni = 'Ke schválení',
  Schvaleno = 'Schváleno'
}

/** Jeden záznam schválení v historii (částky v Kč z okamžiku schválení). */
export interface BudgetApproval {
  no: number;
  at: Date;
  byName: string;
  comment?: string;
  /** Plán nákupu a plán výnosů (smluvní cena) v Kč v okamžiku schválení. */
  cost: number;
  sale: number;
  /** Marže při schválení: (výnosy − nákup) / výnosy v %. */
  marginPercent: number;
  /** Zisk při schválení v Kč. */
  marginAmount?: number;
  /** Prognóza nákupu a tržeb v okamžiku schválení (v Kč). */
  forecastCost?: number;
  forecastSale?: number;
  /** `vynosy` = záznam vznikl po zavedení výnosů (výnosy z plánu výnosů); starší záznamy mají `sale` z prodeje rozpočtu. */
  basis?: 'vynosy';
}

/** Rozpočet projektu: jeden záznam na projekt, s historií schválení. */
export interface BudgetRecord {
  id: number;
  projectNumber: string;
  /** Koncept = ještě nikdy neschváleno; Ke schválení = čeká na vedení; Schváleno = platí poslední schválení v historii. */
  status: BudgetStatus;
  requestedByName?: string;
  requestedAt?: Date;
  /** Vybraný schvalovatel (jen dokud žádost čeká); bez něj smí schválit kdokoli z vedení. */
  approverLogin?: string;
  approverName?: string;
  /** Komentář vedení při posledním vrácení. */
  comment?: string;
  approvals: BudgetApproval[];
  created?: Date;
  modified?: Date;
}

export function approvalsToJson(list: BudgetApproval[]): string {
  return JSON.stringify(list.map((a) => ({ ...a, at: a.at.toISOString() })));
}

export function approvalsFromJson(json: string | undefined): BudgetApproval[] {
  let raw: unknown = [];
  try {
    raw = json ? JSON.parse(json) : [];
  } catch {
    raw = [];
  }
  return (Array.isArray(raw) ? raw : [])
    .map((a: Record<string, unknown>) => ({
      no: num(a.no, 0),
      at: new Date(typeof a.at === 'string' ? a.at : 0),
      byName: str(a.byName),
      comment: optStr(a.comment),
      cost: num(a.cost, 0),
      sale: num(a.sale, 0),
      marginPercent: num(a.marginPercent, 0),
      marginAmount: optNum(a.marginAmount),
      forecastCost: optNum(a.forecastCost),
      forecastSale: optNum(a.forecastSale),
      basis: a.basis === 'vynosy' ? ('vynosy' as const) : undefined
    }))
    .sort((a, b) => a.no - b.no);
}

/** Poslední schválení (to platí jako baseline). */
export const lastApproval = (record: { approvals: BudgetApproval[] } | undefined): BudgetApproval | undefined =>
  record && record.approvals.length > 0 ? record.approvals[record.approvals.length - 1] : undefined;

function sameLogin(a: string | undefined, b: string | undefined): boolean {
  const x = normalizeLogin(a);
  return x !== '' && x === normalizeLogin(b);
}

/** Smí uživatel upravovat rozpočet projektu? PM, asistent a další s právem na projekt; na Režii se rozpočet nevede. */
export function canEditBudget(project: WorkflowProject, actor: Actor): boolean {
  return !project.isOverhead && (canIssueOrder(project, actor) || sameLogin(project.projectManagerLogin, actor.login));
}

/**
 * Schvaluje vedení (a administrátor). Je-li u žádosti vybraný schvalovatel, smí schválit jen on; administrátor smí vždy
 * (kdyby byl vybraný člověk nedostupný).
 */
export function canApproveBudget(actor: Actor, record?: { approverLogin?: string }): boolean {
  if (!hasAnyRole(actor.roles, Role.Vedeni, Role.Administrator)) {
    return false;
  }
  if (record && record.approverLogin && !hasAnyRole(actor.roles, Role.Administrator)) {
    return sameLogin(record.approverLogin, actor.login);
  }
  return true;
}

/** Koho nabídnout jako schvalovatele rozpočtu: členové vedení a administrátoři, bez žadatele; jména se neopakují, řadí se česky. */
export function budgetApproverCandidates(memberships: { role: Role; members: { loginName: string; displayName: string }[] }[], requesterLogin: string): Assignee[] {
  const out: Assignee[] = [];
  memberships
    .filter((m) => m.role === Role.Vedeni || m.role === Role.Administrator)
    .forEach((m) =>
      m.members.forEach((p) => {
        if (p.loginName && !sameLogin(p.loginName, requesterLogin) && !out.some((o) => sameLogin(o.login, p.loginName))) {
          out.push({ login: p.loginName, name: p.displayName || p.loginName });
        }
      })
    );
  return out.sort((a, b) => a.name.localeCompare(b.name, 'cs-CZ'));
}

export type BudgetAction = 'create' | 'edit' | 'requestApproval' | 'approve' | 'reject' | 'withdraw' | 'unlock';

/**
 * Akce, které se nabízejí. Rozpočet se upravuje vždy (nezamyká se). Žádost o schválení jde podat, když nečeká jiná;
 * schvaluje vedení; vedení vrací s důvodem, žadatel může žádost stáhnout.
 */
export function availableBudgetActions(record: BudgetRecord | undefined, project: WorkflowProject, actor: Actor): BudgetAction[] {
  const mayEdit = canEditBudget(project, actor);
  if (!record) {
    return mayEdit ? ['create'] : [];
  }
  const out: BudgetAction[] = [];
  if (mayEdit) {
    out.push('edit');
  }
  // Žádost o schválení se podává z konceptu (první schválení, nebo změna po odemčení plánu); schválený plán se nejdřív odemkne.
  if (record.status === BudgetStatus.Koncept && mayEdit) {
    out.push('requestApproval');
  }
  if (record.status === BudgetStatus.Schvaleno && mayEdit) {
    out.push('unlock');
  }
  if (record.status === BudgetStatus.KeSchvaleni) {
    if (canApproveBudget(actor, record)) {
      out.push('approve', 'reject');
    }
    if (mayEdit) {
      out.push('withdraw');
    }
  }
  return out;
}

/** Stav po vrácení nebo stažení žádosti: koncept (plán zůstává odemčený, aby šel opravit a znovu předložit). */
export const statusAfterReject = (_record: { approvals: BudgetApproval[] }): BudgetStatus => BudgetStatus.Koncept;

/** Plán (nákup i výnosy) je uzamčený, dokud rozpočet nejde upravit: čeká na schválení nebo je schválený. */
export const isPlanLocked = (record: { status: BudgetStatus } | undefined): boolean => !!record && (record.status === BudgetStatus.KeSchvaleni || record.status === BudgetStatus.Schvaleno);

/** Změnil se rozpočet od posledního schválení (podle součtů)? */
export function changedSinceApproval(record: { approvals: BudgetApproval[] }, totalCostCzk: number, totalSaleCzk: number): boolean {
  // Plán se mění jen odemčením; porovnání se používá u starších záznamů a jako pojistka.
  const last = lastApproval(record);
  return !!last && (Math.abs(last.cost - totalCostCzk) > 0.5 || Math.abs(last.sale - totalSaleCzk) > 0.5);
}

// --- import z tabulky (schránka z Excelu) -------------------------------------------------

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
