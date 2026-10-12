import { BudgetApproval, BudgetDoc, BudgetGroup, BudgetItem, BudgetStatus, RevenueLine, budgetFromJson, budgetToJson, budgetTotals, calcItems, isPlanLocked, marginOf, statusAfterReject, validateBudget } from './budget';
import { DEFAULT_MARGIN_THRESHOLDS, approvedMargin, buildApproval, ensureRevenues, itemHasPlan, legacyStatusOf, marginStatus, planViolations, resetForecastsToPlan, validateMarginThresholds } from './budgetMargin';
import { RateTable } from './currency';
import { BudgetStatus as Semafor } from './types';

const RATES = { EUR: 25, USD: 20, source: 'test' } as unknown as RateTable;
const g1: BudgetGroup = { id: 'g1', name: 'Materiál', kind: 'standard', defaultMarkupPercent: 20 };
const gp: BudgetGroup = { id: 'gp', name: 'Vlastní práce', kind: 'prace', defaultMarkupPercent: 0 };
const gr: BudgetGroup = { id: 'gr', name: 'Rezerva', kind: 'rezerva', defaultMarkupPercent: 0 };
const item = (extra: Partial<BudgetItem> = {}): BudgetItem => ({ id: 'i1', groupId: 'g1', description: 'Rozvaděč', currency: 'CZK', quantity: 1, unitCost: 100, ...extra });
const rev = (extra: Partial<RevenueLine> = {}): RevenueLine => ({ id: 'v1', description: 'Smluvní cena', currency: 'CZK', plan: 120, ...extra });
const doc = (items: BudgetItem[], revenues?: RevenueLine[], groups: BudgetGroup[] = [g1, gp, gr]): BudgetDoc => ({ groups, items, rates: [{ id: 's1', name: 'Montér', costRate: 400, saleRate: 600 }], revenues });

describe('marže', () => {
  it('(tržby − nákup) / tržby: 120 a 100 → 16,67 %, zisk 20; bez tržeb nedefinovaná', () => {
    expect(marginOf(120, 100)).toEqual({ percent: 16.67, amount: 20 });
    expect(marginOf(100, 100)).toEqual({ percent: 0, amount: 0 });
    expect(marginOf(100, 130)).toEqual({ percent: -30, amount: -30 });
    expect(marginOf(0, 50)).toEqual({ percent: undefined, amount: -50 });
  });
});

describe('semafor podle marže', () => {
  it('hranice 15 / 10 / 5 %: dolní mez platí včetně; záporná marže je tmavě červená', () => {
    const s = (p: number | undefined): Semafor => marginStatus(p);
    expect([s(20), s(15)]).toEqual([Semafor.Zelena, Semafor.Zelena]);
    expect([s(14.99), s(10)]).toEqual([Semafor.SvetleZelena, Semafor.SvetleZelena]);
    expect([s(9.99), s(5)]).toEqual([Semafor.Zluta, Semafor.Zluta]);
    expect([s(4.99), s(0)]).toEqual([Semafor.Cervena, Semafor.Cervena]);
    expect([s(-0.01), s(-30)]).toEqual([Semafor.TmaveCervena, Semafor.TmaveCervena]);
    expect(s(undefined)).toBe(Semafor.Bez);
  });
  it('barva je jen podle hranic, ne podle odchylky od schváleného: nulová marže je červená', () => {
    expect(marginStatus(0, DEFAULT_MARGIN_THRESHOLDS)).toBe(Semafor.Cervena);
  });
  it('hranice se dají změnit a musí jít shora dolů', () => {
    expect(marginStatus(12, { green: 12, lightGreen: 8, yellow: 3 })).toBe(Semafor.Zelena);
    expect(validateMarginThresholds(DEFAULT_MARGIN_THRESHOLDS)).toEqual([]);
    expect(validateMarginThresholds({ green: 10, lightGreen: 10, yellow: 5 })).toHaveLength(1);
    expect(validateMarginThresholds({ green: 15, lightGreen: 10, yellow: -1 })).toHaveLength(1);
  });
  it('sloupec semaforu v seznamu projektů drží původní čtyři hodnoty', () => {
    expect([legacyStatusOf(Semafor.SvetleZelena), legacyStatusOf(Semafor.TmaveCervena), legacyStatusOf(Semafor.Zluta), legacyStatusOf(Semafor.Bez)]).toEqual([Semafor.Zelena, Semafor.Cervena, Semafor.Zluta, Semafor.Bez]);
  });
});

describe('součty s výnosy', () => {
  it('smluvní cena = součet plánu výnosů; prognóza tržeb (jinak plán); vyfakturováno; marže z plánu i z prognózy', () => {
    const d = doc([item({ id: 'a', unitCost: 100, forecastCost: 110 })], [rev({ plan: 1000, invoiced: 400 }), rev({ id: 'v2', description: 'Dodatek č. 1', plan: 200, forecast: 250, currency: 'CZK' })]);
    const t = budgetTotals(d, 'CZK', RATES);
    expect([t.sale, t.revenueForecast, t.revenueInvoiced]).toEqual([1200, 1250, 400]);
    expect([t.cost, t.forecast]).toEqual([100, 110]);
    expect(t.plannedMargin).toEqual(marginOf(1200, 100));
    expect(t.forecastMargin).toEqual(marginOf(1250, 110));
  });
  it('výnosy v jiné měně se přepočtou kurzem; marže v % je ve všech zobrazených měnách stejná', () => {
    const d = doc([item({ unitCost: 2500 })], [rev({ currency: 'EUR', plan: 150 })]); // 150 EUR = 3 750 Kč, nákup 2 500 Kč
    const czk = budgetTotals(d, 'CZK', RATES);
    const eur = budgetTotals(d, 'EUR', RATES);
    expect(czk.sale).toBe(3750);
    expect(czk.plannedMargin.percent).toBe(33.33);
    expect(eur.plannedMargin.percent).toBe(czk.plannedMargin.percent);
  });
  it('výnosy se ukládají a čtou; starý rozpočet bez klíče výnosů zůstane „bez výnosů“ (undefined)', () => {
    const d = doc([item()], [rev({ forecast: 130, invoiced: 50, note: 'x' })]);
    expect(budgetFromJson(budgetToJson(d)).revenues).toEqual([{ id: 'v1', description: 'Smluvní cena', currency: 'CZK', plan: 120, forecast: 130, invoiced: 50, note: 'x' }]);
    expect(budgetFromJson(budgetToJson(doc([item()], undefined))).revenues).toBeUndefined();
    expect(budgetFromJson(budgetToJson(doc([item()], []))).revenues).toEqual([]);
  });
  it('kontrola: záporné částky výnosů; před schválením musí mít výnos popis', () => {
    expect(validateBudget(doc([item()], [rev({ plan: -1 })]), false).map((i) => i.message).join(' ')).toContain('částky nesmí být záporné');
    expect(validateBudget(doc([item()], [rev({ description: ' ' })]), true).map((i) => i.message).join(' ')).toContain('Výnos 1 nemá popis');
  });
});

describe('schválení: záznam hodnot', () => {
  it('záznam uloží plán nákupu, smluvní cenu, marži v % i v Kč a prognózy; při prvním schválení je prognóza rovna plánu', () => {
    const first = buildApproval({ no: 1, at: new Date(2026, 9, 1), byName: 'V', totalCost: 3_900_000, totalSale: 4_500_000, forecastCost: 4_000_000, forecastSale: 4_600_000, firstApproval: true });
    expect(first).toMatchObject({ cost: 3_900_000, sale: 4_500_000, marginPercent: 13.33, marginAmount: 600_000, forecastCost: 3_900_000, forecastSale: 4_500_000, basis: 'vynosy' });
    const again = buildApproval({ no: 2, at: new Date(2026, 9, 2), byName: 'V', totalCost: 3_900_000, totalSale: 4_800_000, forecastCost: 4_000_000, forecastSale: 4_900_000, firstApproval: false });
    expect(again).toMatchObject({ marginPercent: 18.75, marginAmount: 900_000, forecastCost: 4_000_000, forecastSale: 4_900_000 });
  });
  it('marže při schválení: nový záznam ji má uloženou; starý se dopočte z jeho nákupu a aktuální smluvní ceny', () => {
    const nova = buildApproval({ no: 1, at: new Date(), byName: 'V', totalCost: 100, totalSale: 120, firstApproval: true });
    expect(approvedMargin(nova, 999)).toMatchObject({ percent: 16.67, amount: 20, cost: 100, revenue: 120 });
    const stary: BudgetApproval = { no: 1, at: new Date(), byName: 'V', cost: 100, sale: 150, marginPercent: 33.3 };
    expect(approvedMargin(stary, 125)).toMatchObject({ percent: 20, amount: 25, cost: 100, revenue: 125 });
    expect(approvedMargin(undefined, 125)).toBeUndefined();
  });
  it('prognóza = plán: ruční prognózy položek i výnosů se zruší', () => {
    const d = resetForecastsToPlan(doc([item({ id: 'a', forecastCost: 150 }), item({ id: 'b' })], [rev({ forecast: 200 })]));
    expect(d.items.map((i) => i.forecastCost)).toEqual([undefined, undefined]);
    expect(d.revenues?.[0].forecast).toBeUndefined();
    expect(budgetTotals(d, 'CZK', RATES).forecast).toBe(200);
  });
  it('po zamítnutí nebo stažení žádosti se rozpočet vrací do konceptu; plán je uzamčený jen při čekání a po schválení', () => {
    expect(statusAfterReject({ approvals: [] })).toBe(BudgetStatus.Koncept);
    expect(statusAfterReject({ approvals: [{ no: 1, at: new Date(), byName: 'V', cost: 1, sale: 2, marginPercent: 50 }] })).toBe(BudgetStatus.Koncept);
    expect([BudgetStatus.Koncept, BudgetStatus.KeSchvaleni, BudgetStatus.Schvaleno].map((s) => isPlanLocked({ status: s }))).toEqual([false, true, true]);
    expect(isPlanLocked(undefined)).toBe(false);
  });
});

describe('převod starého rozpočtu', () => {
  it('vznikne řádek „Smluvní cena“ z ceny projektu; nákup se nezmění', () => {
    const d = doc([item({ unitCost: 100, markupPercent: 50 })], undefined);
    const e = ensureRevenues(d, { currency: 'CZK', contractPriceNet: 500 }, RATES);
    expect(e.revenues).toEqual([expect.objectContaining({ description: 'Smluvní cena', currency: 'CZK', plan: 500 })]);
    expect(budgetTotals(e, 'CZK', RATES).cost).toBe(budgetTotals(d, 'CZK', RATES).cost);
    expect(ensureRevenues(e, { currency: 'CZK', contractPriceNet: 999 }, RATES)).toBe(e); // už převedený se nemění
  });
  it('bez ceny projektu se použije dosavadní součet prodeje položek v měně projektu', () => {
    const d = doc([item({ unitCost: 100, markupPercent: 50 }), item({ id: 'i2', unitCost: 100 })], undefined); // prodej 150 + 120
    expect(ensureRevenues(d, { currency: 'CZK' }, RATES).revenues?.[0].plan).toBe(270);
    expect(ensureRevenues(doc([], undefined), { currency: 'CZK' }, RATES).revenues).toEqual([]);
  });
  it('procentní rezerva (dřív z prodeje) se zafixuje na dosavadní částku — žádné číslo nákupu se nezmění', () => {
    // ostatní prodej 970 000 → rezerva 3 % z celku = 30 000 (staré pravidlo R = p/(100−p) × prodej ostatních)
    const d = doc([item({ id: 'a', unitCost: 808333.33 }), item({ id: 'r', groupId: 'gr', reservePercent: 3, unitCost: 0 })], undefined);
    const e = ensureRevenues(d, { currency: 'CZK', contractPriceNet: 1_000_000 }, RATES);
    const r = e.items.filter((i) => i.id === 'r')[0];
    expect(r.reservePercent).toBeUndefined();
    expect(r.unitCost).toBeCloseTo(30000, 0);
    expect(calcItems(e, RATES).filter((c) => c.item.id === 'r')[0].cost).toBeCloseTo(30000, 0);
  });
});

describe('uzamčení plánu po schválení', () => {
  const base = (): BudgetDoc => doc([item({ id: 'a', quantity: 2, unitCost: 100 }), item({ id: 'p', groupId: 'gp', quantity: 10, rateId: 's1' })], [rev({ plan: 1000 })]);

  it('prognóza, skutečnost, popisy, dodavatel, přesun mezi skupinami a vyfakturováno plán nemění', () => {
    const b = base();
    const n: BudgetDoc = {
      ...b,
      items: b.items.map((i) => (i.id === 'a' ? { ...i, forecastCost: 500, actualQty: 1, actualCost: 100, description: 'jiný popis', supplier: 'X', groupId: 'g1' } : i)),
      revenues: (b.revenues ?? []).map((r) => ({ ...r, forecast: 1100, invoiced: 300, description: 'Smlouva' }))
    };
    expect(planViolations(b, n)).toEqual([]);
  });
  it('změna množství, ceny, měny, sazby nebo plánu výnosu je porušení', () => {
    const b = base();
    expect(planViolations(b, { ...b, items: b.items.map((i) => (i.id === 'a' ? { ...i, quantity: 3 } : i)) })).toHaveLength(1);
    expect(planViolations(b, { ...b, items: b.items.map((i) => (i.id === 'a' ? { ...i, unitCost: 1 } : i)) })).toHaveLength(1);
    expect(planViolations(b, { ...b, items: b.items.map((i) => (i.id === 'a' ? { ...i, currency: 'EUR' as const } : i)) })).toHaveLength(1);
    expect(planViolations(b, { ...b, rates: [{ id: 's1', name: 'Montér', costRate: 500, saleRate: 600 }] })).toHaveLength(1);
    expect(planViolations(b, { ...b, revenues: [rev({ plan: 1100 })] })).toHaveLength(1);
  });
  it('nová položka nebo nový výnos jen s plánem 0; smazat jde jen to, co plán nemá', () => {
    const b = base();
    expect(planViolations(b, { ...b, items: [...b.items, item({ id: 'n', quantity: 0, unitCost: 0 })] })).toEqual([]);
    expect(planViolations(b, { ...b, items: [...b.items, item({ id: 'n', quantity: 1, unitCost: 50 })] })).toHaveLength(1);
    expect(planViolations(b, { ...b, items: [...b.items, item({ id: 'np', groupId: 'gp', quantity: 5, rateId: 's1' })] })).toHaveLength(1);
    expect(planViolations(b, { ...b, revenues: [...(b.revenues ?? []), rev({ id: 'v9', description: 'Dodatek', plan: 300 })] })).toHaveLength(1);
    expect(planViolations(b, { ...b, revenues: [...(b.revenues ?? []), rev({ id: 'v9', description: 'Dodatek', plan: 0 })] })).toEqual([]);
    expect(planViolations(b, { ...b, items: b.items.filter((i) => i.id !== 'a') })).toHaveLength(1);
    expect(planViolations(b, { ...b, revenues: [] })).toHaveLength(1);
  });
  it('jednorázový převod starého rozpočtu (bez výnosů) kontrolou projde', () => {
    const stary = doc([item({ id: 'a' })], undefined);
    const novy = ensureRevenues(stary, { currency: 'CZK', contractPriceNet: 500 }, RATES);
    expect(planViolations(stary, novy)).toEqual([]);
  });
  it('položka má plán: práce podle hodin, procentní rezerva podle procent, ostatní podle nákupu', () => {
    const d = doc([], [rev()]);
    expect(itemHasPlan(d, item({ unitCost: 0 }))).toBe(false);
    expect(itemHasPlan(d, item({ unitCost: 1 }))).toBe(true);
    expect(itemHasPlan(d, item({ groupId: 'gp', quantity: 0, unitCost: 0 }))).toBe(false);
    expect(itemHasPlan(d, item({ groupId: 'gp', quantity: 1, unitCost: 0 }))).toBe(true);
    expect(itemHasPlan(d, item({ groupId: 'gr', reservePercent: 3, unitCost: 0 }))).toBe(true);
  });
});
