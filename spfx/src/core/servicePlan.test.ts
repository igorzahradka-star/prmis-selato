import {
  DEFAULT_PLAN_TEMPLATES,
  PlanItem,
  copyPlanItems,
  dateIn,
  filterPlan,
  instantiateTemplate,
  itemRange,
  periodLabel,
  planByMonth,
  planItemState,
  planItemProblem,
  planTemplatesWithDefaults,
  requestKindOf,
  requiredDateOf,
  templateFromItems,
  validatePlanTemplates
} from './servicePlan';

const item = (over: Partial<PlanItem> = {}): PlanItem => ({ id: 1, year: 2026, siteNumber: '10500', deviceNumber: '10501', title: 'Revize', month: 9, jobKind: 'Plánovaná', ...over });

describe('období položky plánu', () => {
  it('měsíc = celý měsíc, konkrétní datum = jeden den; text období', () => {
    expect(itemRange(item({ month: 2, year: 2028 }))).toEqual({ from: new Date(2028, 1, 1), to: new Date(2028, 1, 29) });
    expect(itemRange(item({ dueDate: new Date(2026, 8, 15) }))).toEqual({ from: new Date(2026, 8, 15), to: new Date(2026, 8, 15) });
    expect(periodLabel(item())).toBe('září 2026');
    expect(periodLabel(item({ dueDate: new Date(2026, 8, 15) }))).toBe('15. 9. 2026');
    expect(requiredDateOf(item({ month: 2, year: 2027 }))).toEqual(new Date(2027, 1, 28));
  });

  it('den se ořízne na konec měsíce (29. 2. v nepřestupném roce)', () => {
    expect(dateIn(2027, 2, 29)).toEqual(new Date(2027, 1, 28));
    expect(dateIn(2028, 2, 29)).toEqual(new Date(2028, 1, 29));
  });
});

describe('stav položky', () => {
  const today = new Date(2026, 9, 15);
  it('hotovo, po termínu, aktuální, budoucí', () => {
    expect(planItemState(item({ requestId: 3 }), today)).toBe('hotovo');
    expect(planItemState(item({ month: 9 }), today)).toBe('po-terminu');
    expect(planItemState(item({ month: 10 }), today)).toBe('tento-mesic');
    expect(planItemState(item({ month: 11 }), today)).toBe('budouci');
    expect(planItemState(item({ month: 10, dueDate: new Date(2026, 9, 20) }), today)).toBe('budouci');
    expect(planItemState(item({ month: 10, dueDate: new Date(2026, 9, 10) }), today)).toBe('po-terminu');
  });
});

describe('filtr a kalendář', () => {
  const list = [
    item({ id: 1, month: 5 }),
    item({ id: 2, month: 3, deviceNumber: '10502', title: 'BESS' }),
    item({ id: 3, month: 3, deviceNumber: undefined, title: 'Společné' }),
    item({ id: 4, month: 3, siteNumber: '10510', deviceNumber: '10511' }),
    item({ id: 5, year: 2027 })
  ];
  it('rok, lokalita a soubory; řazeno podle období', () => {
    expect(filterPlan(list, { year: 2026, site: '', devices: [] }).map((i) => i.id)).toEqual([3, 2, 4, 1]);
    expect(filterPlan(list, { year: 2026, site: '10500', devices: [] }).map((i) => i.id)).toEqual([3, 2, 1]);
    expect(filterPlan(list, { year: 2026, site: '10500', devices: ['10501', '10502'] }).map((i) => i.id)).toEqual([2, 1]);
    expect(filterPlan(list, { year: 2026, site: '10500', devices: ['10500'] }).map((i) => i.id)).toEqual([3]);
  });
  it('po měsících', () => {
    const by = planByMonth(filterPlan(list, { year: 2026, site: '', devices: [] }));
    expect(by.length).toBe(12);
    expect(by[2].map((i) => i.id)).toEqual([3, 2, 4]);
    expect(by[4].map((i) => i.id)).toEqual([1]);
  });
});

describe('šablony, kopie a převod na požadavek', () => {
  it('šablona se promítne na soubor a rok; den se přenese', () => {
    const t = { name: 'X', kind: 'FVE', items: [{ title: 'A', month: 2, day: 29, jobKind: 'Plánovaná' }, { title: 'B', month: 6, jobKind: 'Nahodilá' }] };
    const out = instantiateTemplate(t, { siteNumber: '10500', deviceNumber: '10501' }, 2027);
    expect(out.map((i) => [i.title, i.year, i.month, i.deviceNumber, i.jobKind])).toEqual([['A', 2027, 2, '10501', 'Plánovaná'], ['B', 2027, 6, '10501', 'Nahodilá']]);
    expect(out[0].dueDate).toEqual(new Date(2027, 1, 28));
    expect(out[1].dueDate).toBeUndefined();
  });

  it('kopie do dalšího roku přenese datum a vynechá požadavek', () => {
    const out = copyPlanItems([item({ dueDate: new Date(2026, 8, 15), requestId: 9, requestNumber: 'SPO-1' })], 2027);
    expect(out[0].year).toBe(2027);
    expect(out[0].dueDate).toEqual(new Date(2027, 8, 15));
    expect((out[0] as unknown as { requestId?: number }).requestId).toBeUndefined();
  });

  it('šablona z položek plánu; výchozí šablony jsou k dispozici a jdou zkontrolovat', () => {
    const t = templateFromItems(' Vlastní ', 'FVE', [item({ dueDate: new Date(2026, 8, 15) })]);
    expect(t).toMatchObject({ name: 'Vlastní', kind: 'FVE' });
    expect(t.items[0]).toMatchObject({ month: 9, day: 15 });
    expect(planTemplatesWithDefaults(undefined).map((x) => x.kind)).toEqual(expect.arrayContaining(['FVE', 'BESS', 'Lokalita']));
    expect(planTemplatesWithDefaults([])).toEqual([]);
    expect(validatePlanTemplates(DEFAULT_PLAN_TEMPLATES)).toEqual([]);
    expect(validatePlanTemplates([{ name: '', kind: 'FVE', items: [{ title: '', month: 13, jobKind: 'Plánovaná' }] }]).length).toBe(3);
  });

  it('požadavek z položky: plánovaná = preventivní prohlídka, nahodilá = ostatní', () => {
    expect(requestKindOf({ jobKind: 'Plánovaná' })).toBe('Preventivní prohlídka');
    expect(requestKindOf({ jobKind: 'Nahodilá' })).toBe('Ostatní');
  });
});

describe('kontrola položky plánu', () => {
  const ok = { title: 'Revize', year: 2026, month: 9, jobKind: 'Plánovaná' };
  it('platná položka projde; chyby mají srozumitelnou větu', () => {
    expect(planItemProblem(ok)).toBe('');
    expect(planItemProblem({ ...ok, dueDate: new Date(2026, 8, 15) })).toBe('');
    expect(planItemProblem({ ...ok, title: ' ' })).toMatch(/činnost/);
    expect(planItemProblem({ ...ok, month: 13 })).toMatch(/Měsíc/);
    expect(planItemProblem({ ...ok, year: 1999 })).toMatch(/Rok/);
    expect(planItemProblem({ ...ok, dueDate: new Date(2026, 9, 15) })).toMatch(/ve vybraném měsíci/);
    expect(planItemProblem({ ...ok, jobKind: 'Jiná' })).toMatch(/Druh/);
  });
});
