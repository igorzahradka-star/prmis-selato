import { BudgetItem, PlannedPayment, budgetFromJson, budgetToJson, newPayment } from './budget';
import { buildCashflow } from './cashflow';
import { OrderStatus } from './orders';
import { DeliveryOrder, TaskDates, applySchedule, deliveryConflicts, indexTasks, linksToTask, resolvePayment } from './scheduleLinks';

const d = (m: number, day: number): Date => new Date(2026, m - 1, day);

const tasks = indexTasks([
  { id: 1, title: 'Montáž', wbs: '2', start: d(10, 5), finish: d(10, 14), critical: true },
  { id: 2, title: 'Revize', start: d(10, 15), finish: d(10, 19) },
  { id: 3, title: 'Bez termínu' } as TaskDates
]);

const pay = (over: Partial<PlannedPayment>): PlannedPayment => ({ ...newPayment(undefined, 'Platba'), amount: 1000, vat: 'neplatce', ...over });

describe('platby navázané na harmonogram', () => {
  it('datum faktury = dokončení úkolu + posun, splatnost = faktura + dny', () => {
    const r = resolvePayment(pay({ taskId: 1, taskAnchor: 'finish', taskOffsetDays: 3, taskDueDays: 14 }), tasks);
    expect(r).toEqual({ invoiceDate: '2026-10-17', dueDate: '2026-10-31', fromSchedule: true, brokenLink: false });
  });

  it('kotva zahájení a výchozí splatnost 30 dní', () => {
    const r = resolvePayment(pay({ taskId: 1, taskAnchor: 'start' }), tasks);
    expect(r.invoiceDate).toBe('2026-10-05');
    expect(r.dueDate).toBe('2026-11-04');
  });

  it('nenavázaná platba zůstává beze změny; úkol bez termínu nebo smazaný úkol = přerušená vazba a ruční data', () => {
    const manual = pay({ invoiceDate: '2026-09-01', dueDate: '2026-09-30' });
    expect(resolvePayment(manual, tasks)).toEqual({ invoiceDate: '2026-09-01', dueDate: '2026-09-30', fromSchedule: false, brokenLink: false });
    expect(resolvePayment({ ...manual, taskId: 3 }, tasks).brokenLink).toBe(true);
    expect(resolvePayment({ ...manual, taskId: 99 }, tasks).dueDate).toBe('2026-09-30');
  });

  it('posun úkolu posune platbu v cashflow', () => {
    const doc = { groups: [], items: [], rates: [], payments: [pay({ taskId: 1, taskAnchor: 'finish', taskOffsetDays: 0, taskDueDays: 0 })], income: [] };
    const rates = { EUR: 25, USD: 23, source: {} } as never;
    const before = buildCashflow({ doc, invoices: [], rates, currency: 'CZK', granularity: 'mesic', withVat: false, tasks });
    expect(before.buckets.map((b) => b.label)).toEqual(['10/2026']);
    const moved = indexTasks([{ id: 1, title: 'Montáž', start: d(11, 2), finish: d(11, 20) }]);
    const after = buildCashflow({ doc, invoices: [], rates, currency: 'CZK', granularity: 'mesic', withVat: false, tasks: moved });
    expect(after.buckets.map((b) => b.label)).toEqual(['11/2026']);
    expect(after.buckets[0].expensePlan).toBe(1000);
  });

  it('applySchedule přepíše jen navázané platby', () => {
    const list = applySchedule([pay({ id: 'a', invoiceDate: '2026-01-01' }), pay({ id: 'b', taskId: 2, taskAnchor: 'start', taskDueDays: 0 })], tasks);
    expect(list[0].invoiceDate).toBe('2026-01-01');
    expect(list[1].invoiceDate).toBe('2026-10-15');
  });

  it('vazby přežijí uložení a načtení rozpočtu', () => {
    const doc = { groups: [], items: [{ id: 'i1', groupId: 'g', description: 'Kabely', currency: 'CZK' as const, quantity: 1, unitCost: 1, taskId: 1 }], rates: [], payments: [pay({ taskId: 2, taskAnchor: 'start', taskOffsetDays: 2, taskDueDays: 10 })], income: [] };
    const back = budgetFromJson(budgetToJson(doc));
    expect(back.items[0].taskId).toBe(1);
    expect(back.payments?.[0]).toMatchObject({ taskId: 2, taskAnchor: 'start', taskOffsetDays: 2, taskDueDays: 10 });
  });
});

describe('konflikty dodávek s harmonogramem', () => {
  const item = (over: Partial<BudgetItem> = {}): BudgetItem => ({ id: 'i1', groupId: 'g', description: 'Rozvaděč', currency: 'CZK', quantity: 1, unitCost: 1, taskId: 1, ...over });
  const order = (over: Partial<DeliveryOrder> = {}): DeliveryOrder => ({ id: 1, orderNumber: 'OBJ26-001', status: OrderStatus.Odeslano, budgetItemId: 'i1', deliveryDate: d(10, 12), ...over });

  it('dodání po zahájení úkolu je konflikt se zpožděním v pracovních dnech a upozorněním na kritickou cestu', () => {
    const c = deliveryConflicts([item()], [order()], tasks);
    expect(c).toHaveLength(1);
    expect(c[0].lateWorkdays).toBe(5);
    expect(c[0].critical).toBe(true);
    expect(c[0].message).toContain('kritické cestě');
  });

  it('dodání před zahájením nebo v den zahájení konflikt není', () => {
    expect(deliveryConflicts([item()], [order({ deliveryDate: d(10, 5) })], tasks)).toEqual([]);
    expect(deliveryConflicts([item()], [order({ deliveryDate: d(10, 1) })], tasks)).toEqual([]);
  });

  it('dodané, uzavřené a stornované objednávky, položky bez vazby a objednávky bez termínu se nehlásí', () => {
    expect(deliveryConflicts([item()], [order({ status: OrderStatus.Dodano }), order({ status: OrderStatus.Storno }), order({ deliveryDate: undefined })], tasks)).toEqual([]);
    expect(deliveryConflicts([item({ taskId: undefined })], [order()], tasks)).toEqual([]);
    expect(deliveryConflicts([item({ taskId: 2 })], [order({ budgetItemId: 'jina' })], tasks)).toEqual([]);
  });

  it('úkol mimo kritickou cestu se hlásí bez dodatku o ohrožení termínu', () => {
    const c = deliveryConflicts([item({ taskId: 2 })], [order({ deliveryDate: d(10, 20) })], tasks);
    expect(c[0].critical).toBe(false);
    expect(c[0].message).not.toContain('kritické');
  });

  it('počet vazeb na úkol', () => {
    expect(linksToTask(1, [pay({ taskId: 1 }), pay({})], [item()])).toEqual({ payments: 1, items: 1 });
  });
});
