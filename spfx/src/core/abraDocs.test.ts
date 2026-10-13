import { BudgetDoc, BudgetGroup, BudgetItem, DocAllocation, RevenueLine, budgetFromJson, budgetToJson, budgetTotals, calcItems } from './budget';
import { RateTable } from './currency';
import { AbraDoc, advanceSummary, allocatedOfDoc, assignDoc, docsForTarget, moveAllocation, orphanAllocations, unallocatedDocs, unallocatedOfDoc, unallocatedTotals, unassignDoc } from './abraDocs';

const RATES = { EUR: 25, USD: 20, source: 'test' } as unknown as RateTable;
const g1: BudgetGroup = { id: 'g1', name: 'Střídače', kind: 'standard', defaultMarkupPercent: 0 };
const gp: BudgetGroup = { id: 'gp', name: 'Vlastní práce', kind: 'prace', defaultMarkupPercent: 0 };
const item = (extra: Partial<BudgetItem> = {}): BudgetItem => ({ id: 'i1', groupId: 'g1', description: 'Střídač 100 kW', currency: 'CZK', quantity: 1, unitCost: 1000, ...extra });
const rev = (extra: Partial<RevenueLine> = {}): RevenueLine => ({ id: 'v1', description: 'Smluvní cena', currency: 'CZK', plan: 5000, ...extra });
const budget = (allocations?: DocAllocation[], items: BudgetItem[] = [item()], revenues: RevenueLine[] = [rev()]): BudgetDoc => ({
  groups: [g1, gp],
  items,
  rates: [{ id: 's1', name: 'Montér', costRate: 400, saleRate: 600 }],
  revenues,
  allocations
});
const faktura = (extra: Partial<AbraDoc> = {}): AbraDoc => ({ id: 1, abraId: 'FP-1', type: 'prijata', number: 'FP2600001', projectNumber: '26005', currency: 'CZK', amountNet: 600, ...extra });

describe('Nakoupeno a Vyfakturováno z přiřazených dokladů', () => {
  it('více faktur u jedné položky se sčítá a přepíše ruční hodnotu', () => {
    const d = budget(
      [
        { docId: 'A', kind: 'item', targetId: 'i1', amount: 300, currency: 'CZK' },
        { docId: 'B', kind: 'item', targetId: 'i1', amount: 200, currency: 'CZK' },
        { docId: 'C', kind: 'item', targetId: 'i1', amount: 10, currency: 'EUR' }
      ],
      [item({ actualCost: 9999 })]
    );
    const [c] = calcItems(d, RATES);
    expect([c.actualCost, c.docBacked, c.docCount, c.remainingCost]).toEqual([750, true, 3, 250]); // 300 + 200 + 10 EUR × 25
  });

  it('bez dokladů platí ruční hodnota', () => {
    const [c] = calcItems(budget(undefined, [item({ actualCost: 400 })]), RATES);
    expect([c.actualCost, c.docBacked, c.docCount]).toEqual([400, false, 0]);
  });

  it('vlastní práce se podle dokladů nemění', () => {
    const prace = item({ id: 'ip', groupId: 'gp', rateId: 's1', quantity: 10, actualQty: 5 });
    const d = budget([{ docId: 'A', kind: 'item', targetId: 'ip', amount: 99999, currency: 'CZK' }], [prace]);
    const [c] = calcItems(d, RATES);
    expect([c.actualCost, c.docBacked]).toEqual([2000, false]);
  });

  it('dobropis (záporná částka) součet snižuje', () => {
    const d = budget([
      { docId: 'A', kind: 'item', targetId: 'i1', amount: 1000, currency: 'CZK' },
      { docId: 'B', kind: 'item', targetId: 'i1', amount: -150, currency: 'CZK' }
    ]);
    expect(calcItems(d, RATES)[0].actualCost).toBe(850);
  });

  it('vyfakturováno výnosu z vydaných faktur; součty projektu to respektují', () => {
    const d = budget([{ docId: 'V', kind: 'revenue', targetId: 'v1', amount: 3000, currency: 'CZK' }], [item()], [rev({ invoiced: 100 })]);
    expect(budgetTotals(d, 'CZK', RATES).revenueInvoiced).toBe(3000);
    expect(budgetTotals(budget(undefined, [item()], [rev({ invoiced: 100 })]), 'CZK', RATES).revenueInvoiced).toBe(100);
  });

  it('přiřazení se uloží a načte; poškozená se zahodí', () => {
    const a: DocAllocation[] = [{ docId: 'A', kind: 'item', targetId: 'i1', amount: 5, currency: 'EUR' }];
    expect(budgetFromJson(budgetToJson(budget(a))).allocations).toEqual(a);
    expect(budgetFromJson('{"allocations":[{"docId":"","amount":1},{"docId":"A","targetId":"i1","amount":"x"}]}').allocations).toBeUndefined();
    expect(budgetFromJson(budgetToJson(budget())).allocations).toBeUndefined();
  });
});

describe('přiřazování dokladů', () => {
  it('celý zbytek dokladu, nebo jeho část; nejde přes částku dokladu', () => {
    const doc = faktura();
    const r1 = assignDoc(undefined, doc, 'item', 'i1', 200);
    expect('allocations' in r1 && r1.allocations).toEqual([{ docId: 'FP-1', kind: 'item', targetId: 'i1', amount: 200, currency: 'CZK' }]);
    const l1 = (r1 as { allocations: DocAllocation[] }).allocations;
    expect(unallocatedOfDoc(doc, l1)).toBe(400);
    const r2 = assignDoc(l1, doc, 'item', 'i2');
    expect(allocatedOfDoc((r2 as { allocations: DocAllocation[] }).allocations, 'FP-1')).toBe(600);
    expect(assignDoc((r2 as { allocations: DocAllocation[] }).allocations, doc, 'item', 'i3')).toEqual({ error: 'Není co přiřadit — doklad je už celý přiřazený.' });
    expect('error' in assignDoc(l1, doc, 'item', 'i2', 500)).toBe(true);
  });

  it('opakované přiřazení téže položce částku přičte, ne zdvojí řádek', () => {
    const doc = faktura();
    const l = (assignDoc(undefined, doc, 'item', 'i1', 100) as { allocations: DocAllocation[] }).allocations;
    const l2 = (assignDoc(l, doc, 'item', 'i1', 50) as { allocations: DocAllocation[] }).allocations;
    expect(l2).toHaveLength(1);
    expect(l2[0].amount).toBe(150);
  });

  it('směr: přijatá k nákupu, vydaná k výnosům; záloha nikam', () => {
    expect('error' in assignDoc(undefined, faktura(), 'revenue', 'v1')).toBe(true);
    expect('error' in assignDoc(undefined, faktura({ type: 'vydana' }), 'item', 'i1')).toBe(true);
    expect('allocations' in assignDoc(undefined, faktura({ type: 'vydana' }), 'revenue', 'v1')).toBe(true);
    expect('error' in assignDoc(undefined, faktura({ type: 'zaloha-prijata' }), 'item', 'i1')).toBe(true);
  });

  it('dobropis se přiřazuje se záporným znaménkem', () => {
    const dobropis = faktura({ abraId: 'D-1', amountNet: -100 });
    const r = assignDoc(undefined, dobropis, 'item', 'i1');
    expect((r as { allocations: DocAllocation[] }).allocations[0].amount).toBe(-100);
    expect('error' in assignDoc(undefined, dobropis, 'item', 'i1', 50)).toBe(true);
  });

  it('zrušení a přesun přiřazení', () => {
    const doc = faktura();
    const l = (assignDoc(undefined, doc, 'item', 'i1', 400) as { allocations: DocAllocation[] }).allocations;
    const moved = moveAllocation(l, doc, 'item', 'i1', 'i2') as { allocations: DocAllocation[] };
    expect(moved.allocations.map((a) => [a.targetId, a.amount])).toEqual([['i2', 400]]);
    expect(unassignDoc(moved.allocations, 'FP-1', 'item', 'i2')).toEqual([]);
    expect(unassignDoc(l, 'FP-1')).toEqual([]);
    expect('error' in moveAllocation(l, doc, 'item', 'nic', 'i2')).toBe(true);
  });
});

describe('přehledy dokladů', () => {
  const docs = [faktura(), faktura({ id: 2, abraId: 'FP-2', amountNet: 400 }), faktura({ id: 3, abraId: 'FV-1', type: 'vydana', amountNet: 2000 }), faktura({ id: 4, abraId: 'ZP-1', type: 'zaloha-prijata', amountNet: 5000 }), faktura({ id: 5, abraId: 'ZV-1', type: 'zaloha-vydana', amountNet: 7000, currency: 'EUR' })];
  const alloc: DocAllocation[] = [{ docId: 'FP-1', kind: 'item', targetId: 'i1', amount: 600, currency: 'CZK' }];

  it('Nezařazeno: zbytky přijatých a vydaných faktur bez záloh', () => {
    expect(unallocatedDocs(docs, alloc).map((d) => d.abraId)).toEqual(['FP-2', 'FV-1']);
    expect(unallocatedTotals(docs, alloc, 'CZK', RATES)).toEqual({ cost: 400, revenue: 2000, count: 2 });
  });

  it('zálohy bokem: přijaté a vydané zvlášť v zadané měně', () => {
    const s = advanceSummary(docs, 'CZK', RATES);
    expect([s.received, s.issued, s.docs.length]).toEqual([5000, 175000, 2]);
  });

  it('doklady cíle, rozdělení a osiřelá přiřazení', () => {
    const split: DocAllocation[] = [
      { docId: 'FP-2', kind: 'item', targetId: 'i1', amount: 100, currency: 'CZK' },
      { docId: 'FP-2', kind: 'item', targetId: 'i2', amount: 300, currency: 'CZK' },
      { docId: 'SMAZANA', kind: 'item', targetId: 'i1', amount: 1, currency: 'CZK' }
    ];
    const list = docsForTarget(docs, split, 'item', 'i1');
    expect(list.map((x) => [x.doc.abraId, x.amount, x.split])).toEqual([['FP-2', 100, true]]);
    expect(orphanAllocations(docs, split).map((a) => a.docId)).toEqual(['SMAZANA']);
  });
});
