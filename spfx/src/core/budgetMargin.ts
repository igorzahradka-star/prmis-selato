/**
 * Marže, semafor a uzamčení plánu realizačního rozpočtu — čistá logika bez SharePointu a Reactu (navazuje na `budget.ts`).
 *
 *  - **Semafor** se řídí aktuální marží z prognózy (tržby − nákup) / tržby proti pevným hranicím z Nastavení.
 *  - **Marže při schválení** se bere ze záznamu schválení; u starých záznamů (před zavedením výnosů) se dopočte z jejich nákupu
 *    a z aktuálního plánu výnosů (smluvní ceny).
 *  - **Převod starého rozpočtu** (`ensureRevenues`): vznikne výnosový řádek „Smluvní cena“ a procentní rezervy se zafixují na
 *    dosavadní částky, aby se žádné číslo nákupu nezměnilo.
 *  - **Uzamčení plánu** (`planViolations`): po schválení se plán nákupu ani výnosů nesmí měnit; hlídá to i datová vrstva.
 */

import { CurrencyCode, RateTable, asCurrencyCode, convertAmount } from './currency';
import { BudgetApproval, BudgetDoc, BudgetGroup, BudgetItem, MarginValue, RevenueLine, findRate, itemCost, itemSale, marginOf, newBudgetId, round2 } from './budget';
import { BudgetStatus as Semafor } from './types';

// --- semafor ----------------------------------------------------------------------------

/** Hranice marže v % (od nich nahoru): zelená, světle zelená, žlutá; pod žlutou je červená, pod 0 % tmavě červená. */
export interface MarginThresholds {
  green: number;
  lightGreen: number;
  yellow: number;
}

export const DEFAULT_MARGIN_THRESHOLDS: MarginThresholds = { green: 15, lightGreen: 10, yellow: 5 };

/** Semafor podle marže v %; bez marže (nejsou tržby) je „Bez rozpočtu“. Dolní mez každého stupně platí včetně. */
export function marginStatus(percent: number | undefined, t: MarginThresholds = DEFAULT_MARGIN_THRESHOLDS): Semafor {
  if (percent === undefined || !isFinite(percent)) {
    return Semafor.Bez;
  }
  if (percent < 0) {
    return Semafor.TmaveCervena;
  }
  if (percent >= t.green) {
    return Semafor.Zelena;
  }
  if (percent >= t.lightGreen) {
    return Semafor.SvetleZelena;
  }
  if (percent >= t.yellow) {
    return Semafor.Zluta;
  }
  return Semafor.Cervena;
}

/** Hodnota pro sloupec semaforu v seznamu projektů (zachovává původní čtyři hodnoty výběru): světle zelená → zelená, tmavě červená → červená. */
export function legacyStatusOf(s: Semafor): Semafor {
  return s === Semafor.SvetleZelena ? Semafor.Zelena : s === Semafor.TmaveCervena ? Semafor.Cervena : s;
}

export interface MarginThresholdIssue {
  message: string;
}

/** Hranice musí jít shora dolů (zelená > světle zelená > žlutá ≥ 0). */
export function validateMarginThresholds(t: MarginThresholds): MarginThresholdIssue[] {
  const out: MarginThresholdIssue[] = [];
  if (!(t.green > t.lightGreen) || !(t.lightGreen > t.yellow) || t.yellow < 0) {
    out.push({ message: 'Hranice semaforu marže musí jít shora dolů: zelená > světle zelená > žlutá a žlutá nesmí být záporná.' });
  }
  return out;
}

// --- marže při schválení -------------------------------------------------------------------

/**
 * Marže při schválení (v Kč a v %). Nové záznamy ji mají uloženou. Starší záznamy (před zavedením výnosů) měly „prodej“ z položek;
 * jejich marže se dopočte z nákupu v záznamu a z aktuálního plánu výnosů (smluvní ceny) v Kč — bez nového schvalování.
 */
export function approvedMargin(approval: BudgetApproval | undefined, revenuePlanCzk: number): (MarginValue & { cost: number; revenue: number }) | undefined {
  if (!approval) {
    return undefined;
  }
  if (approval.basis === 'vynosy') {
    const m = marginOf(approval.sale, approval.cost);
    return { percent: approval.marginPercent, amount: approval.marginAmount !== undefined ? approval.marginAmount : m.amount, cost: approval.cost, revenue: approval.sale };
  }
  const m = marginOf(revenuePlanCzk, approval.cost);
  return { ...m, cost: approval.cost, revenue: revenuePlanCzk };
}

// --- převod starého rozpočtu --------------------------------------------------------------

interface LegacyCalc {
  item: BudgetItem;
  group?: BudgetGroup;
  currency: CurrencyCode;
  cost: number;
  sale: number;
}

/** Výpočet z doby, kdy se rozpočet řídil prodejem a přirážkou — slouží jen k převodu starých dat. */
export function legacyCalc(doc: BudgetDoc, rates: RateTable): LegacyCalc[] {
  const groups = new Map(doc.groups.map((g) => [g.id, g] as [string, BudgetGroup]));
  const calcs: LegacyCalc[] = doc.items.map((item) => {
    const group = groups.get(item.groupId);
    if (group && group.kind === 'prace') {
      const rate = findRate(doc, item.rateId);
      return { item, group, currency: 'CZK' as CurrencyCode, cost: round2(item.quantity * (rate ? rate.costRate : 0)), sale: round2(item.quantity * (rate ? rate.saleRate : 0)) };
    }
    if (group && group.kind === 'rezerva') {
      const amount = itemCost(item);
      return { item, group, currency: item.currency, cost: amount, sale: amount };
    }
    return { item, group, currency: item.currency, cost: itemCost(item), sale: itemSale(item, group) };
  });
  const percentReserves = calcs.filter((c) => c.group && c.group.kind === 'rezerva' && c.item.reservePercent !== undefined);
  if (percentReserves.length > 0) {
    const otherSaleCzk = calcs.filter((c) => percentReserves.indexOf(c) === -1).reduce((s, c) => s + convertAmount(c.sale, c.currency, 'CZK', rates), 0);
    const totalP = percentReserves.reduce((s, c) => s + (c.item.reservePercent as number), 0);
    percentReserves.forEach((c) => {
      const p = c.item.reservePercent as number;
      const amount = totalP >= 100 ? 0 : round2((p / (100 - totalP)) * otherSaleCzk);
      c.currency = 'CZK';
      c.cost = amount;
      c.sale = amount;
    });
  }
  return calcs;
}

/**
 * Starý rozpočet (bez výnosů) převede na nový model, aniž by se změnil nákup:
 *  - procentní rezervy (dřív z prodeje) se zafixují na dosavadní částky v Kč,
 *  - vznikne řádek výnosů „Smluvní cena“ s cenou projektu; nemá-li projekt cenu, použije se dosavadní součet prodeje položek.
 * Rozpočet, který výnosy už má, se nemění.
 */
export function ensureRevenues(doc: BudgetDoc, project: { currency: string; contractPriceNet?: number }, rates: RateTable): BudgetDoc {
  if (doc.revenues !== undefined) {
    return doc;
  }
  const legacy = legacyCalc(doc, rates);
  const items = doc.items.map((item) => {
    if (item.reservePercent === undefined) {
      return item;
    }
    const c = legacy.filter((x) => x.item.id === item.id)[0];
    return { ...item, quantity: 1, unitCost: c ? c.cost : 0, currency: 'CZK' as CurrencyCode, reservePercent: undefined };
  });
  const currency = asCurrencyCode(project.currency);
  let plan = project.contractPriceNet !== undefined && project.contractPriceNet > 0 ? round2(project.contractPriceNet) : 0;
  if (plan === 0) {
    plan = round2(legacy.reduce((s, c) => s + convertAmount(c.sale, c.currency, currency, rates), 0));
  }
  const revenues: RevenueLine[] = plan > 0 ? [{ id: newBudgetId('v'), description: 'Smluvní cena', currency, plan }] : [];
  return { ...doc, items, revenues };
}

// --- uzamčení plánu ---------------------------------------------------------------------------

const planSignature = (i: BudgetItem): string => [i.quantity, i.unitCost, i.currency, i.rateId ?? '', i.reservePercent ?? ''].join('|');

export function itemHasPlan(doc: BudgetDoc, item: BudgetItem): boolean {
  const g = doc.groups.filter((x) => x.id === item.groupId)[0];
  if (g && g.kind === 'prace') {
    return item.quantity > 0;
  }
  if (g && g.kind === 'rezerva' && item.reservePercent !== undefined) {
    return item.reservePercent > 0;
  }
  return itemCost(item) > 0;
}

const nameOf = (d: string, fallback: string): string => (d.trim() !== '' ? `„${d.trim()}“` : fallback);

/**
 * Co se v plánu změnilo proti uloženému rozpočtu — po schválení se plán měnit nesmí (odemkne se a schválí znovu).
 * Změna prognózy, skutečnosti, vyfakturováno, popisů, dodavatelů ani přesun mezi skupinami plán nemění. Nová položka nebo
 * nový výnosový řádek smí vzniknout jen s plánem 0. Rozpočet bez výnosů (starý) se jednorázově převádí a kontrola ho nechá projít.
 */
export function planViolations(previous: BudgetDoc, next: BudgetDoc): string[] {
  if (previous.revenues === undefined) {
    return [];
  }
  const out: string[] = [];
  const prevItems = new Map(previous.items.map((i) => [i.id, i] as [string, BudgetItem]));
  const nextIds = new Set(next.items.map((i) => i.id));
  next.items.forEach((i, idx) => {
    const o = prevItems.get(i.id);
    const label = nameOf(i.description, `řádek ${idx + 1}`);
    if (!o) {
      if (itemHasPlan(next, i)) {
        out.push(`Nová položka nákupu ${label} nemůže mít plán — plán je po schválení uzamčený (zadejte plán 0 a prognózu, nebo plán odemkněte a nechte schválit).`);
      }
    } else if (planSignature(o) !== planSignature(i)) {
      out.push(`Plán nákupu položky ${label} je po schválení uzamčený — odemkněte plán ke změně.`);
    }
  });
  previous.items.forEach((o) => {
    if (!nextIds.has(o.id) && itemHasPlan(previous, o)) {
      out.push(`Položka ${nameOf(o.description, 'nákupu')} má plán — po schválení ji nejde smazat; odemkněte plán ke změně.`);
    }
  });
  previous.rates.forEach((r) => {
    const n = next.rates.filter((x) => x.id === r.id)[0];
    if (!n ? previous.items.some((i) => i.rateId === r.id && i.quantity > 0) : n.costRate !== r.costRate) {
      out.push(`Nákladová sazba profese „${r.name}“ je po schválení uzamčená — odemkněte plán ke změně.`);
    }
  });
  // Výnosy (smluvní cena, dodatky, rozpis fakturace) se po schválení upravovat smějí — zamčená je jen výchozí marže ve schválení.
  return out.filter((m, i) => out.indexOf(m) === i);
}

/**
 * Záznam schválení: plán nákupu a plán výnosů (smluvní cena) v Kč, marže v % i v Kč a prognózy v okamžiku schválení.
 * Při **prvním** schválení se prognóza rovná plánu (`firstApproval`), proto se do záznamu zapíše plán.
 */
export function buildApproval(args: { no: number; at: Date; byName: string; comment?: string; totalCost: number; totalSale: number; forecastCost?: number; forecastSale?: number; firstApproval: boolean }): BudgetApproval {
  const m = marginOf(args.totalSale, args.totalCost);
  return {
    no: args.no,
    at: args.at,
    byName: args.byName,
    comment: args.comment,
    cost: args.totalCost,
    sale: args.totalSale,
    marginPercent: m.percent !== undefined ? m.percent : 0,
    marginAmount: m.amount,
    forecastCost: args.firstApproval ? args.totalCost : args.forecastCost,
    forecastSale: args.firstApproval ? args.totalSale : args.forecastSale,
    basis: 'vynosy'
  };
}

/** První schválení: prognóza se rovná plánu (ruční prognózy položek i výnosů se zruší). */
export function resetForecastsToPlan(doc: BudgetDoc): BudgetDoc {
  return {
    ...doc,
    items: doc.items.map((i) => (i.forecastCost === undefined ? i : { ...i, forecastCost: undefined })),
    revenues: doc.revenues === undefined ? doc.revenues : doc.revenues.map((r) => (r.forecast === undefined ? r : { ...r, forecast: undefined }))
  };
}

/** Hranice semaforu z Nastavení rozpočtu. */
export function marginThresholdsOf(budget: { marginGreenPercent: number; marginLightGreenPercent: number; marginYellowPercent: number }): MarginThresholds {
  return { green: budget.marginGreenPercent, lightGreen: budget.marginLightGreenPercent, yellow: budget.marginYellowPercent };
}
