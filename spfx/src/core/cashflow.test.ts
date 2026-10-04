import { BudgetDoc, BudgetItem, IncomeMilestone, PlannedPayment, budgetFromJson, budgetToJson, newMilestone, newPayment, removeItem, validateBudget } from './budget';
import {
  InvoiceLike,
  addDays,
  buildCashflow,
  dayText,
  isoWeek,
  milestoneDueDate,
  milestoneGross,
  parseDay,
  parsePercents,
  paymentDueDate,
  paymentGross,
  splitPayments,
  weekStart
} from './cashflow';
import { RateTable } from './currency';
import { InvoiceStatus } from './invoiceBases';

const RATES = { EUR: 25, USD: 20, source: 'test' } as unknown as RateTable;
const g1 = { id: 'g1', name: 'Materiál', kind: 'standard' as const, defaultMarkupPercent: 0 };
const item = (extra: Partial<BudgetItem> = {}): BudgetItem => ({ id: 'i1', groupId: 'g1', description: 'Panely', currency: 'CZK', quantity: 1, unitCost: 1000, ...extra });
const pay = (extra: Partial<PlannedPayment> = {}): PlannedPayment => ({ ...newPayment('i1', 'Záloha', 'CZK'), amount: 100, ...extra });
const mil = (extra: Partial<IncomeMilestone> = {}): IncomeMilestone => ({ ...newMilestone('CZK'), description: 'Dílčí plnění', amount: 1000, ...extra });
const doc = (payments: PlannedPayment[], income: IncomeMilestone[] = [], items: BudgetItem[] = [item()]): BudgetDoc => ({ groups: [g1], items, rates: [], payments, income });
const base = { invoices: [] as InvoiceLike[], rates: RATES, currency: 'CZK' as const, granularity: 'mesic' as const, withVat: false };

describe('datumy a týdny', () => {
  it('pondělí týdne, číslo ISO týdne, připočtení dnů, převod textu', () => {
    expect(dayText(weekStart(new Date(2026, 5, 10)))).toBe('2026-06-08'); // středa → pondělí 8. 6.
    expect(dayText(weekStart(new Date(2026, 5, 14)))).toBe('2026-06-08'); // neděle
    expect(isoWeek(new Date(2026, 5, 8))).toBe(24);
    expect(dayText(addDays(new Date(2026, 0, 30), 5))).toBe('2026-02-04');
    expect(parseDay('2026-02-30')).toBeUndefined();
    expect(parseDay('x')).toBeUndefined();
    expect(parseDay('2026-10-04')?.getDate()).toBe(4);
  });
});

describe('DPH a data plateb', () => {
  it('s DPH podle režimu: 21 %, 12 %, reverse charge a neplátce bez DPH', () => {
    expect(paymentGross(pay({ vat: 'dph21' }))).toBe(121);
    expect(paymentGross(pay({ vat: 'dph12' }))).toBe(112);
    expect(paymentGross(pay({ vat: 'reverse' }))).toBe(100);
    expect(paymentGross(pay({ vat: 'neplatce' }))).toBe(100);
    expect(milestoneGross(mil({ vatRate: 21 }))).toBe(1210);
  });
  it('výdaj = splatnost, jinak datum faktury; milník = faktura + dny, nebo splatnost podkladu', () => {
    expect(dayText(paymentDueDate(pay({ invoiceDate: '2026-06-01', dueDate: '2026-06-20' }))!)).toBe('2026-06-20');
    expect(dayText(paymentDueDate(pay({ invoiceDate: '2026-06-01' }))!)).toBe('2026-06-01');
    expect(paymentDueDate(pay())).toBeUndefined();
    expect(dayText(milestoneDueDate(mil({ plannedDate: '2026-07-01', dueDays: 30 }))!)).toBe('2026-07-31');
    const inv: InvoiceLike = { number: 'FP1', status: InvoiceStatus.Vyfakturovano, amountNet: 1, vatRate: 21, currency: 'CZK', dueDate: new Date(2026, 7, 15) };
    expect(dayText(milestoneDueDate(mil({ plannedDate: '2026-07-01' }), inv)!)).toBe('2026-08-15');
  });
});

describe('cashflow po měsících', () => {
  it('plán výdajů a příjmů, saldo a kumulace; měsíc jen s příjmem se zobrazí', () => {
    const d = doc([pay({ amount: 400, vat: 'reverse', invoiceDate: '2026-06-05', dueDate: '2026-06-25' }), pay({ amount: 600, vat: 'reverse', dueDate: '2026-08-10' })], [mil({ amount: 1500, vatRate: 0, plannedDate: '2026-07-01', dueDays: 30 })]);
    const r = buildCashflow({ ...base, doc: d });
    expect(r.buckets.map((b) => b.key)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(r.buckets.map((b) => [b.expensePlan, b.incomePlan])).toEqual([[400, 0], [0, 1500], [600, 0]]);
    expect(r.buckets.map((b) => b.netPlan)).toEqual([-400, 1500, -600]);
    expect(r.buckets.map((b) => b.cumPlan)).toEqual([-400, 1100, 500]);
    expect(r.totals).toEqual({ incomePlan: 1500, expensePlan: 1000, incomeActual: 0, expenseActual: 0 });
    // náklad v čase podle data faktury
    expect(r.buckets[0].accrual).toBe(400);
  });

  it('skutečnost z data úhrady (i odlišné částky); plán zůstává v plánovaném období', () => {
    const d = doc([pay({ amount: 400, vat: 'reverse', dueDate: '2026-06-25', paidDate: '2026-07-02', paidAmount: 380 })]);
    const r = buildCashflow({ ...base, doc: d });
    expect(r.buckets.map((b) => [b.expensePlan, b.expenseActual])).toEqual([[400, 0], [0, 380]]);
    expect(r.buckets[1].cumActual).toBe(-380);
  });

  it('s DPH i bez DPH, cizí měna se přepočte kurzem do zvolené', () => {
    const d = doc([pay({ amount: 100, vat: 'dph21', currency: 'EUR', dueDate: '2026-06-10' })]);
    expect(buildCashflow({ ...base, doc: d, withVat: false }).totals.expensePlan).toBe(2500);
    expect(buildCashflow({ ...base, doc: d, withVat: true }).totals.expensePlan).toBe(3025);
    expect(buildCashflow({ ...base, doc: d, withVat: false, currency: 'EUR' }).totals.expensePlan).toBe(100);
  });

  it('týdně: týdny se doplní bez mezer, popisek T24', () => {
    const d = doc([pay({ amount: 10, vat: 'reverse', dueDate: '2026-06-09' }), pay({ amount: 20, vat: 'reverse', dueDate: '2026-06-24' })]);
    const r = buildCashflow({ ...base, doc: d, granularity: 'tyden' });
    expect(r.buckets.map((b) => b.label)).toEqual(['T24 08.06.', 'T25 15.06.', 'T26 22.06.']);
    expect(r.buckets.map((b) => b.expensePlan)).toEqual([10, 0, 20]);
  });

  it('příjem: úhrada podkladu se bere jako skutečnost, ruční datum má přednost', () => {
    const inv: InvoiceLike = { number: 'FP26001', status: InvoiceStatus.Uhrazeno, amountNet: 1000, vatRate: 21, currency: 'CZK', dueDate: new Date(2026, 6, 31), paidDate: new Date(2026, 7, 3) };
    const d = doc([], [mil({ plannedDate: '2026-07-01', vatRate: 21, invoiceNumber: 'FP26001' })]);
    const r = buildCashflow({ ...base, doc: d, invoices: [inv], withVat: true });
    expect(r.buckets.map((b) => [b.key, b.incomePlan, b.incomeActual])).toEqual([['2026-07', 1210, 0], ['2026-08', 0, 1210]]);
    const manual = buildCashflow({ ...base, doc: doc([], [mil({ plannedDate: '2026-07-01', vatRate: 21, invoiceNumber: 'FP26001', paidDate: '2026-09-01' })]), invoices: [inv], withVat: true });
    expect(manual.buckets[manual.buckets.length - 1].key).toBe('2026-09');
  });

  it('platby a milníky bez data se v cashflow neukážou, ale upozorní; prázdný plán dá prázdný výsledek', () => {
    const r = buildCashflow({ ...base, doc: doc([pay({ description: 'Bez data' })], [mil({ description: 'Milník bez data' })]) });
    expect(r.buckets).toEqual([]);
    expect(r.warnings).toEqual(['Platba „Bez data“ nemá datum faktury ani splatnosti — v cashflow chybí.', 'Fakturační milník „Milník bez data“ nemá plánované datum faktury — v cashflow chybí.']);
  });

  it('rozplánování: náklady položky proti naplánovaným platbám (zbývá naplánovat)', () => {
    const d = doc([pay({ amount: 300, dueDate: '2026-06-10' }), pay({ amount: 200, dueDate: '2026-07-10' })], [], [item({ unitCost: 1000 }), item({ id: 'i2', description: 'Kabel', unitCost: 50 })]);
    const r = buildCashflow({ ...base, doc: d });
    expect(r.coverage.map((c) => [c.description, c.forecast, c.planned, c.unplanned])).toEqual([
      ['Panely', 1000, 500, 500],
      ['Kabel', 50, 0, 50]
    ]);
    expect(r.unplannedTotal).toBe(550);
    const full = buildCashflow({ ...base, doc: doc([pay({ amount: 1000, dueDate: '2026-06-10' })]) });
    expect(full.coverage).toEqual([]);
  });
});

describe('rozložení částky do plateb', () => {
  const newId = ((): (() => string) => {
    let n = 0;
    return () => `p${++n}`;
  })();
  it('20/30/30/10/10 — součet je přesně celek, faktury po intervalu, splatnost + dny', () => {
    const list = splitPayments({ total: 1000, percents: [20, 30, 30, 10, 10], firstInvoice: new Date(2026, 5, 1), intervalDays: 14, dueDays: 14, description: 'Panely', itemId: 'i1', currency: 'EUR', vat: 'reverse', newId });
    expect(list.map((p) => p.amount)).toEqual([200, 300, 300, 100, 100]);
    expect(list.map((p) => p.invoiceDate)).toEqual(['2026-06-01', '2026-06-15', '2026-06-29', '2026-07-13', '2026-07-27']);
    expect(list.map((p) => p.dueDate)).toEqual(['2026-06-15', '2026-06-29', '2026-07-13', '2026-07-27', '2026-08-10']);
    expect(list[0].description).toBe('Panely (1/5)');
    expect(list[0]).toMatchObject({ itemId: 'i1', currency: 'EUR', vat: 'reverse' });
  });
  it('zaokrouhlení dorovná poslední platba; špatné podíly nic nevytvoří', () => {
    const list = splitPayments({ total: 100, percents: [1, 1, 1], firstInvoice: new Date(2026, 5, 1), intervalDays: 7, dueDays: 0, description: 'X', currency: 'CZK', vat: 'dph21', newId });
    expect(list.map((p) => p.amount)).toEqual([33.33, 33.33, 33.34]);
    expect(splitPayments({ total: 100, percents: [], firstInvoice: new Date(), intervalDays: 1, dueDays: 0, description: 'X', currency: 'CZK', vat: 'dph21', newId })).toEqual([]);
  });
  it('podíly z textu', () => {
    expect(parsePercents('20/30/30/10/10')).toEqual([20, 30, 30, 10, 10]);
    expect(parsePercents('50 50')).toEqual([50, 50]);
    expect(parsePercents('33,3;66,7')).toEqual([33.3, 66.7]);
    expect(parsePercents('')).toEqual([]);
    expect(parsePercents('a/b')).toEqual([]);
    expect(parsePercents('0/0')).toEqual([]);
  });
});

describe('uložení plateb a milníků v rozpočtu', () => {
  it('platby a milníky se uloží a přečtou zpět; neplatná data a režim se opraví', () => {
    const d = doc([pay({ invoiceDate: '2026-06-01', dueDate: '2026-06-20', paidDate: '2026-06-21', paidAmount: 90, note: 'záloha' })], [mil({ plannedDate: '2026-07-01', invoiceNumber: 'FP26001', paidDate: '2026-08-01', note: 'x' })]);
    expect(budgetFromJson(budgetToJson(d))).toEqual(d);
    const b = budgetFromJson(JSON.stringify({ groups: [], items: [], payments: [{ description: 'A', amount: 5, vat: 'nesmysl', dueDate: '31.12.2026' }], income: [{ description: 'B', amount: 1 }] }));
    expect(b.payments?.[0]).toMatchObject({ vat: 'dph21', dueDate: undefined, currency: 'CZK' });
    expect(b.income?.[0]).toMatchObject({ vatRate: 21, dueDays: 30 });
  });
  it('smazání položky rozpočtu nesmaže platby, jen jim zruší vazbu; kontrola záporných částek', () => {
    const d = doc([pay({ itemId: 'i1' }), pay({ itemId: 'jina' })]);
    expect(removeItem(d, 'i1').payments?.map((p) => p.itemId)).toEqual([undefined, 'jina']);
    expect(validateBudget(doc([pay({ amount: -1 })], [mil({ dueDays: -3 })]), false).map((i) => i.message)).toEqual(['Platba 1: částka nesmí být záporná.', 'Fakturační milník 1: částka a splatnost nesmí být záporné.']);
  });
});
