import { BudgetDoc, BudgetGroup, BudgetItem, DocAllocation, RevenueLine, budgetFromJson, budgetToJson, budgetTotals, calcItems } from './budget';
import { RateTable } from './currency';
import { AbraDoc, abraRowMatches, isApproximate, advanceSummary, allocatedOfDoc, assignDoc, assignStateOf, replaceDocAllocations, setDocTarget, docsForTarget, moveAllocation, orphanAllocations, unallocatedDocs, unallocatedOfDoc, unallocatedTotals, unassignDoc } from './abraDocs';

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

describe('cizí měny: přesně podle účetnictví, jinak kurz ČNB', () => {
  const eur = faktura({ abraId: 'E-1', currency: 'EUR', amountNet: 1000, amountNetCzk: 24800 }); // zaúčtováno kurzem 24,80
  it('položka v Kč bere zaúčtovanou částku v Kč, ne dnešní kurz', () => {
    const l = (assignDoc(undefined, eur, 'item', 'i1') as { allocations: DocAllocation[] }).allocations;
    expect(l[0].amountCzk).toBe(24800);
    const d = budget(l, [item({ actualCost: 1 })]);
    expect(calcItems(d, RATES)[0].actualCost).toBe(24800); // kurz ČNB v testu je 25, tedy 25000 by byla chyba
  });
  it('položka ve stejné měně bere částku dokladu beze změny; rozdělení si drží podíl v Kč', () => {
    const l = (replaceDocAllocations(undefined, eur, 'item', [{ targetId: 'i1', amount: 400 }, { targetId: 'i2', amount: 600 }]) as { allocations: DocAllocation[] }).allocations;
    expect(l.map((a) => a.amountCzk)).toEqual([9920, 14880]);
    const d = budget(l, [item({ id: 'i1', currency: 'EUR' }), item({ id: 'i2', currency: 'CZK' })]);
    expect(calcItems(d, RATES).map((c) => c.actualCost)).toEqual([400, 14880]);
  });
  it('orientační přepočet jen když účetnictví částku v měně položky nemá', () => {
    expect([isApproximate(eur, 'CZK'), isApproximate(eur, 'EUR'), isApproximate(eur, 'USD'), isApproximate(faktura(), 'EUR'), isApproximate(faktura(), 'CZK')]).toEqual([false, false, true, true, false]);
    expect(isApproximate(faktura({ currency: 'EUR', amountNet: 10 }), 'CZK')).toBe(true); // bez zaúčtované částky v Kč
  });
  it('Nezařazeno a zálohy se v Kč počítají ze zaúčtované částky', () => {
    expect(unallocatedTotals([eur], undefined, 'CZK', RATES).cost).toBe(24800);
    expect(advanceSummary([faktura({ abraId: 'Z', type: 'zaloha-vydana', currency: 'EUR', amountNet: 100, amountNetCzk: 2450 })], 'CZK', RATES).issued).toBe(2450);
  });
  it('částka v Kč se uloží s přiřazením a načte', () => {
    const a: DocAllocation[] = [{ docId: 'E-1', kind: 'item', targetId: 'i1', amount: 1000, currency: 'EUR', amountCzk: 24800 }];
    expect(budgetFromJson(budgetToJson(budget(a))).allocations).toEqual(a);
  });
});

describe('hledání v řádcích', () => {
  const row = faktura({ partnerName: 'Memodo s.r.o.', description: 'Střídač 100 kW', accounts: ['501'] });
  it('najde podle čísla, partnera, popisu i účtu a ignoruje diakritiku a velikost písmen', () => {
    expect(['', 'fp26', 'MEMODO', 'stridac', 'kw', '501'].map((q) => abraRowMatches(row, q))).toEqual([true, true, true, true, true, true]);
    expect(abraRowMatches(row, 'jiny dodavatel')).toBe(false);
  });
});

describe('přepínání cíle a rozdělení řádku', () => {
  const doc = faktura();
  it('stav přiřazení: nic, část, celý, záloha', () => {
    const l = (amount: number): DocAllocation[] => [{ docId: 'FP-1', kind: 'item', targetId: 'i1', amount, currency: 'CZK' }];
    expect(assignStateOf(doc, undefined)).toBe('none');
    expect(assignStateOf(doc, l(200))).toBe('partial');
    expect(assignStateOf(doc, l(600))).toBe('full');
    expect(assignStateOf(faktura({ type: 'zaloha-vydana' }), undefined)).toBe('advance');
  });
  it('změna cíle přesune celou částku; bez cíle řádek zůstane nepřiřazený', () => {
    const a = (setDocTarget(undefined, doc, 'item', 'i1') as { allocations: DocAllocation[] }).allocations;
    expect(a).toHaveLength(1);
    const b = (setDocTarget(a, doc, 'item', 'i2') as { allocations: DocAllocation[] }).allocations;
    expect(b.map((x) => [x.targetId, x.amount])).toEqual([['i2', 600]]);
    expect((setDocTarget(b, doc, 'item', undefined) as { allocations: DocAllocation[] }).allocations).toEqual([]);
    expect('error' in setDocTarget(undefined, faktura({ type: 'zaloha-prijata' }), 'item', 'i1')).toBe(true);
  });
  it('rozdělení: části se sloučí podle cíle, součet nesmí přesáhnout řádek, ostatní doklady zůstanou', () => {
    const other: DocAllocation = { docId: 'JINY', kind: 'item', targetId: 'i1', amount: 5, currency: 'CZK' };
    const ok = replaceDocAllocations([other], doc, 'item', [{ targetId: 'i1', amount: 100 }, { targetId: 'i2', amount: 300 }, { targetId: 'i1', amount: 50 }]) as { allocations: DocAllocation[] };
    expect(ok.allocations.map((x) => [x.docId, x.targetId, x.amount])).toEqual([['JINY', 'i1', 5], ['FP-1', 'i1', 150], ['FP-1', 'i2', 300]]);
    expect('error' in replaceDocAllocations(undefined, doc, 'item', [{ targetId: 'i1', amount: 700 }])).toBe(true);
    expect('error' in replaceDocAllocations(undefined, doc, 'item', [{ targetId: '', amount: 10 }])).toBe(true);
    expect('error' in replaceDocAllocations(undefined, doc, 'item', [{ targetId: 'i1', amount: -10 }])).toBe(true);
    expect((replaceDocAllocations([other], doc, 'item', []) as { allocations: DocAllocation[] }).allocations).toEqual([other]);
  });
});
