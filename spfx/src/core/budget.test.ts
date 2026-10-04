import {
  BudgetApproval,
  BudgetDoc,
  BudgetGroup,
  BudgetItem,
  BudgetRecord,
  BudgetStatus,
  addGroup,
  addItem,
  addRate,
  approvalsFromJson,
  approvalsToJson,
  availableBudgetActions,
  budgetFromJson,
  budgetSemaphore,
  budgetToJson,
  forecastOf,
  orderedForItem,
  budgetTotals,
  calcItems,
  changedSinceApproval,
  duplicateItem,
  emptyBudget,
  itemCost,
  itemMarkup,
  itemSale,
  kindForName,
  lastApproval,
  marginPercent,
  markupPercentOf,
  moveItem,
  newItem,
  parseBudgetTable,
  parseClipboardTable,
  removeGroup,
  removeRate,
  statusAfterReject,
  updateGroup,
  validateBudget,
  withMarkup,
  withSale
} from './budget';
import { RateTable } from './currency';
import { BudgetStatus as Semafor } from './types';
import { OrderStatus } from './orders';
import { Actor, WorkflowProject } from './orderWorkflow';
import { Role } from './types';

const RATES = { EUR: 25, USD: 20, source: 'test' } as unknown as RateTable;
const g1: BudgetGroup = { id: 'g1', name: 'Materiál', kind: 'standard', defaultMarkupPercent: 20 };
const g2: BudgetGroup = { id: 'g2', name: 'Doprava', kind: 'standard', defaultMarkupPercent: 0 };
const gp: BudgetGroup = { id: 'gp', name: 'Vlastní práce', kind: 'prace', defaultMarkupPercent: 0 };
const gr: BudgetGroup = { id: 'gr', name: 'Rezerva', kind: 'rezerva', defaultMarkupPercent: 0 };
const item = (extra: Partial<BudgetItem> = {}): BudgetItem => ({ id: 'i1', groupId: 'g1', description: 'Rozvaděč ABCD', currency: 'CZK', quantity: 1, unitCost: 100, ...extra });
const doc = (items: BudgetItem[], groups: BudgetGroup[] = [g1, g2]): BudgetDoc => ({ groups, items, rates: [{ id: 's1', name: 'Montér', costRate: 400, saleRate: 600 }] });

describe('přirážka, prodej a marže', () => {
  it('příklad: nákup 100, přirážka 20 % → prodej 120, marže z prodeje 16,67 %', () => {
    const i = item();
    expect(itemCost(i)).toBe(100);
    expect(itemMarkup(i, g1)).toBe(20);
    expect(itemSale(i, g1)).toBe(120);
    expect(marginPercent(100, 120)).toBe(16.67);
    expect(markupPercentOf(100, 120)).toBe(20);
  });

  it('nákup = množství × cena za jednotku; vlastní přirážka přebije skupinu', () => {
    const i = item({ quantity: 3, unitCost: 50, markupPercent: 10 });
    expect(itemCost(i)).toBe(150);
    expect(itemSale(i, g1)).toBe(165);
    expect(itemMarkup(i, g1)).toBe(10);
  });

  it('ručně zadaná prodejní cena přebije výpočet a přirážka se dopočte', () => {
    const i = item({ salePriceOverride: 150 });
    expect(itemSale(i, g1)).toBe(150);
    expect(itemMarkup(i, g1)).toBe(50);
  });

  it('withMarkup / withSale: shodné se skupinou nebo s výpočtem se dědí', () => {
    expect(withMarkup(item({ markupPercent: 5 }), g1, 20).markupPercent).toBeUndefined();
    expect(withMarkup(item(), g1, 35).markupPercent).toBe(35);
    expect(withMarkup(item({ salePriceOverride: 999 }), g1, 35).salePriceOverride).toBeUndefined();
    expect(withSale(item(), g1, 120).salePriceOverride).toBeUndefined();
    expect(withSale(item(), g1, 130).salePriceOverride).toBe(130);
  });

  it('nulový nákup a prodej nepadnou', () => {
    expect(marginPercent(0, 0)).toBe(0);
    expect(markupPercentOf(0, 10)).toBe(0);
  });
});

describe('vlastní práce: hodiny × sazby profese', () => {
  it('nákup z nákladové sazby, prodej z prodejní; skutečnost z odpracovaných hodin', () => {
    const d = doc([item({ id: 'p', groupId: 'gp', quantity: 10, unit: 'h', rateId: 's1', actualQty: 4 })], [g1, gp]);
    const [c] = calcItems(d, RATES);
    expect([c.cost, c.sale, c.margin]).toEqual([4000, 6000, 33.33]);
    expect([c.actualQty, c.actualCost, c.remainingQty, c.remainingCost]).toEqual([4, 1600, 6, 2400]);
    expect(c.currency).toBe('CZK');
  });
  it('změna sazby v projektu se promítne; bez profese je nula', () => {
    const d = doc([item({ id: 'p', groupId: 'gp', quantity: 10, rateId: 's1' }), item({ id: 'q', groupId: 'gp', quantity: 10 })], [gp]);
    expect(calcItems(d, RATES).map((c) => c.cost)).toEqual([4000, 0]);
    const up = { ...d, rates: [{ id: 's1', name: 'Montér', costRate: 500, saleRate: 700 }] };
    expect(calcItems(up, RATES)[0].sale).toBe(7000);
  });
  it('sazby: přidání, odebrání (položka zůstane bez profese)', () => {
    const d = doc([item({ id: 'p', groupId: 'gp', rateId: 's1' })], [gp]);
    expect(addRate(d, ' Revizák ').rates.map((r) => r.name)).toEqual(['Montér', 'Revizák']);
    expect(removeRate(d, 's1').items[0].rateId).toBeUndefined();
  });
});

describe('rezerva: nákup = prodej, částkou nebo v % z prodeje', () => {
  it('částkou: stejná v nákupu i prodeji', () => {
    const d = doc([item({ id: 'r', groupId: 'gr', unitCost: 100 })], [gr]);
    const [c] = calcItems(d, RATES);
    expect([c.cost, c.sale, c.margin]).toEqual([100, 100, 0]);
  });
  it('v %: rezerva je p % z celkového prodeje včetně sebe — R = p/(100−p) × ostatní', () => {
    // ostatní prodej 970 000 → rezerva 3 % z celku = 30 000 (celek 1 000 000)
    const d = doc([item({ id: 'a', unitCost: 808333.33 }), item({ id: 'r', groupId: 'gr', reservePercent: 3, unitCost: 0 })], [g1, gr]);
    const calcs = calcItems(d, RATES);
    expect(calcs[0].sale).toBeCloseTo(970000, 0);
    expect(calcs[1].cost).toBeCloseTo(30000, 0);
    expect(calcs[1].sale).toBe(calcs[1].cost);
    const t = budgetTotals(d, 'CZK', RATES);
    expect(t.sale).toBeCloseTo(1000000, 0);
    expect((calcs[1].sale / t.sale) * 100).toBeCloseTo(3, 1);
  });
  it('rezerva z cizí měny ostatních položek se počítá přes kurz v Kč', () => {
    const d = doc([item({ id: 'a', currency: 'EUR', unitCost: 100, markupPercent: 0 }), item({ id: 'r', groupId: 'gr', reservePercent: 50 })], [g1, gr]);
    // ostatní prodej 100 EUR = 2 500 Kč; 50 % → R = 50/50 × 2500
    expect(calcItems(d, RATES)[1].cost).toBe(2500);
  });
  it('procenta rezerv dohromady 100 % a víc se nepřijmou', () => {
    const d = doc([item({ id: 'r', groupId: 'gr', reservePercent: 100 })], [gr]);
    expect(validateBudget(d, false).map((i) => i.message)).toContain('Rezerva v procentech z prodeje musí být dohromady pod 100 %.');
  });
});

describe('skutečnost a zbývá', () => {
  it('příklad: 100 ks za korunu = 100 Kč; koupeno 60 ks za 60 Kč → zbývá 40 ks a 40 Kč', () => {
    const d = doc([item({ quantity: 100, unitCost: 1, actualQty: 60, actualCost: 60 })]);
    const [c] = calcItems(d, RATES);
    expect([c.cost, c.actualQty, c.actualCost, c.remainingQty, c.remainingCost]).toEqual([100, 60, 60, 40, 40]);
    const t = budgetTotals(d, 'CZK', RATES);
    expect([t.cost, t.actual, t.remaining, t.spentPercent]).toEqual([100, 60, 40, 60]);
  });
  it('překročení je záporné zbývá; duplikát položky začíná bez skutečnosti', () => {
    const d = doc([item({ quantity: 10, unitCost: 10, actualQty: 12, actualCost: 130 })]);
    const [c] = calcItems(d, RATES);
    expect([c.remainingQty, c.remainingCost]).toEqual([-2, -30]);
    const dup = duplicateItem(d, 'i1');
    expect(dup.items.length).toBe(2);
    expect(dup.items[1].actualCost).toBeUndefined();
    expect(dup.items[1].id).not.toBe('i1');
  });
});

describe('součty', () => {
  it('po skupinách a kategoriích; cizí měna se přepočítá', () => {
    const d = doc([
      item({ id: 'a', category: 'Materiál', actualCost: 40 }),
      item({ id: 'b', currency: 'EUR', unitCost: 10, category: 'Materiál' }), // 10 EUR = 250 Kč, přirážka 20 % → 300
      item({ id: 'c', groupId: 'g2', unitCost: 40, category: 'Doprava' })
    ]);
    const t = budgetTotals(d, 'CZK', RATES);
    expect(t.cost).toBe(390);
    expect(t.sale).toBe(460);
    expect(t.actual).toBe(40);
    expect(t.byGroup.map((g) => [g.name, g.cost, g.sale, g.count])).toEqual([
      ['Materiál', 350, 420, 2],
      ['Doprava', 40, 40, 1]
    ]);
    expect(t.byCategory.map((c) => c.category)).toEqual(['Materiál', 'Doprava']);
    expect(t.marginPercent).toBe(15.22);
    expect(t.markupPercent).toBe(17.95);
  });
  it('v jiné měně: EUR', () => {
    const t = budgetTotals(doc([item({ unitCost: 250 })]), 'EUR', RATES);
    expect(t.cost).toBe(10);
  });
  it('prázdný rozpočet má nuly', () => {
    const t = budgetTotals({ groups: [g1], items: [], rates: [] }, 'CZK', RATES);
    expect([t.cost, t.sale, t.marginPercent, t.spentPercent]).toEqual([0, 0, 0, 0]);
  });
});

describe('úpravy rozpočtu', () => {
  it('nový rozpočet: skupiny podle kategorií s druhem a sazby z číselníku', () => {
    const d = emptyBudget(['Materiál', 'Vlastní práce', 'Rezerva', ' '], [{ id: 'p1', name: 'Projektant', costRate: 500, saleRate: 900 }, { id: 'p2', name: ' ', costRate: 0, saleRate: 0 }]);
    expect(d.groups.map((g) => [g.name, g.kind])).toEqual([['Materiál', 'standard'], ['Vlastní práce', 'prace'], ['Rezerva', 'rezerva']]);
    expect(d.rates.map((r) => [r.name, r.costRate, r.saleRate])).toEqual([['Projektant', 500, 900]]);
    expect(kindForName('realizační rezerva')).toBe('rezerva');
    expect(kindForName('Doprava')).toBe('standard');
  });

  it('položky se řadí na konec své skupiny; nová práce dostane první profesi a hodiny', () => {
    const d = emptyBudget(['Materiál', 'Vlastní práce'], [{ id: 'p1', name: 'Projektant', costRate: 1, saleRate: 2 }]);
    const [mat, prace] = d.groups;
    const a = addItem(d, newItem(mat));
    const b = addItem(a, newItem(prace, d.rates));
    const c = addItem(b, newItem(mat));
    expect(c.items.map((i) => i.groupId)).toEqual([mat.id, mat.id, prace.id]);
    expect(b.items[1]).toMatchObject({ unit: 'h', currency: 'CZK', rateId: d.rates[0].id });
  });

  it('odebrání skupiny odebere i její položky; úprava výchozí přirážky; přidání skupiny s druhem', () => {
    const d = doc([item({ id: 'a' }), item({ id: 'b', groupId: 'g2' })]);
    expect(removeGroup(d, 'g1').items.map((i) => i.id)).toEqual(['b']);
    const e = updateGroup(addGroup(d, 'Nová', 'rezerva'), 'g1', { defaultMarkupPercent: 30 });
    expect(e.groups.map((g) => g.defaultMarkupPercent)).toEqual([30, 0, 0]);
    expect(e.groups[2].kind).toBe('rezerva');
  });

  it('přesun položky do práce nastaví profesi a hodiny, z běžné do rezervy zruší přirážku', () => {
    const d = doc([item({ id: 'a', markupPercent: 10 })], [g1, gp, gr]);
    const p = moveItem(d, 'a', 'gp').items[0];
    expect([p.groupId, p.rateId, p.unit, p.markupPercent]).toEqual(['gp', 's1', 'h', undefined]);
    const r = moveItem(d, 'a', 'gr').items[0];
    expect([r.groupId, r.markupPercent]).toEqual(['gr', undefined]);
  });

  it('kontrola: prázdné názvy, duplicity, záporné hodnoty, práce bez profese; přísná chce popis i položky', () => {
    expect(validateBudget({ groups: [g1, { ...g2, name: 'materiál' }], items: [], rates: [] }, false).map((i) => i.message)).toEqual(['Skupina „materiál“ je v rozpočtu dvakrát.']);
    expect(validateBudget(doc([item({ unitCost: -1 })]), false).length).toBe(1);
    expect(validateBudget(doc([]), true).map((i) => i.message)).toEqual(['Rozpočet nemá žádnou položku.']);
    expect(validateBudget(doc([item({ description: ' ' })]), true).map((i) => i.message)).toEqual(['Řádek 1 nemá popis.']);
    expect(validateBudget(doc([item()]), true)).toEqual([]);
    expect(validateBudget(doc([item({ groupId: 'x' })]), false).length).toBe(1);
    expect(validateBudget(doc([item({ groupId: 'gp', description: '' })], [gp]), true).map((i) => i.message)).toEqual(['Práce řádek 1: vyberte profesi.']);
  });
});

describe('uložení jako JSON', () => {
  it('rozpočet se uloží a přečte zpět', () => {
    const d = doc(
      [item({ supplier: 'BELTEC', markupPercent: 7, note: 'pozn.', actualQty: 1, actualCost: 5 }), item({ id: 'i2', currency: 'EUR', salePriceOverride: 500 }), item({ id: 'i3', groupId: 'gr', reservePercent: 3, rateId: undefined })],
      [g1, gr]
    );
    expect(budgetFromJson(budgetToJson(d))).toEqual(d);
  });
  it('poškozený nebo prázdný JSON dá prázdný rozpočet; chybějící části a druh skupiny se doplní', () => {
    expect(budgetFromJson('{rozbité')).toEqual({ groups: [], items: [], rates: [] });
    expect(budgetFromJson(undefined)).toEqual({ groups: [], items: [], rates: [] });
    const b = budgetFromJson(JSON.stringify({ groups: [{ name: 'Vlastní práce' }], items: [{ groupId: 'x', description: 'D', currency: 'GBP' }] }));
    expect(b.groups[0].id).not.toBe('');
    expect(b.groups[0].kind).toBe('prace');
    expect(b.items[0]).toMatchObject({ quantity: 1, unitCost: 0, currency: 'CZK', description: 'D' });
    expect(b.rates).toEqual([]);
  });
  it('historie schválení se uloží a přečte, řazená podle čísla', () => {
    const a: BudgetApproval[] = [
      { no: 2, at: new Date(2026, 9, 2), byName: 'B', cost: 2, sale: 3, marginPercent: 33.3, comment: 'ok' },
      { no: 1, at: new Date(2026, 9, 1), byName: 'A', cost: 1, sale: 2, marginPercent: 50 }
    ];
    const back = approvalsFromJson(approvalsToJson(a));
    expect(back.map((x) => x.no)).toEqual([1, 2]);
    expect(back[1].at.getTime()).toBe(new Date(2026, 9, 2).getTime());
    expect(approvalsFromJson('{x')).toEqual([]);
    expect(lastApproval({ approvals: back })?.no).toBe(2);
    expect(lastApproval(undefined)).toBeUndefined();
  });
});

describe('žádost o schválení a schválení (rozpočet se nezamyká)', () => {
  const PM = 'i:0#.f|membership|pm@revoltum.cz';
  const project: WorkflowProject = { projectNumber: '26001', projectManagerLogin: PM, assistantLogins: [], isOverhead: false };
  const pm: Actor = { login: PM, displayName: 'PM', roles: [Role.ProjektovyManazer] };
  const vedeni: Actor = { login: 'i:0#.f|membership|v@revoltum.cz', displayName: 'V', roles: [Role.Vedeni] };
  const cizi: Actor = { login: 'i:0#.f|membership|c@revoltum.cz', displayName: 'C', roles: [Role.ProjektovyManazer] };
  const rec = (status: BudgetStatus, approvals: BudgetApproval[] = []): BudgetRecord => ({ id: 1, projectNumber: '26001', status, approvals });
  const ap: BudgetApproval = { no: 1, at: new Date(), byName: 'V', cost: 100, sale: 120, marginPercent: 16.67 };

  it('PM upravuje vždy a může požádat o schválení; cizí PM nic', () => {
    expect(availableBudgetActions(rec(BudgetStatus.Koncept), project, pm)).toEqual(['edit', 'requestApproval']);
    expect(availableBudgetActions(rec(BudgetStatus.Schvaleno, [ap]), project, pm)).toEqual(['edit', 'requestApproval']);
    expect(availableBudgetActions(rec(BudgetStatus.Koncept), project, cizi)).toEqual([]);
  });
  it('ke schválení: vedení schvaluje nebo vrací; PM dál upravuje a smí stáhnout žádost', () => {
    const r = rec(BudgetStatus.KeSchvaleni);
    // vedení smí upravovat každý projekt, proto i „edit“ a „withdraw“
    expect(availableBudgetActions(r, project, vedeni)).toEqual(['edit', 'approve', 'reject', 'withdraw']);
    expect(availableBudgetActions(r, project, pm)).toEqual(['edit', 'withdraw']);
  });
  it('bez rozpočtu jde založit; Režie rozpočet nevede', () => {
    expect(availableBudgetActions(undefined, project, pm)).toEqual(['create']);
    expect(availableBudgetActions(undefined, project, cizi)).toEqual([]);
    expect(availableBudgetActions(undefined, { ...project, isOverhead: true }, vedeni)).toEqual([]);
  });
  it('po vrácení se stav vrátí na poslední schválený, nebo koncept', () => {
    expect(statusAfterReject({ approvals: [] })).toBe(BudgetStatus.Koncept);
    expect(statusAfterReject({ approvals: [ap] })).toBe(BudgetStatus.Schvaleno);
  });
  it('změna od posledního schválení se pozná podle součtů', () => {
    expect(changedSinceApproval({ approvals: [ap] }, 100, 120)).toBe(false);
    expect(changedSinceApproval({ approvals: [ap] }, 150, 120)).toBe(true);
    expect(changedSinceApproval({ approvals: [] }, 150, 120)).toBe(false);
  });
});

describe('import z tabulky', () => {
  it('vzorový Excel: Položka / Plán / vyčerpáno → položky s nákupem; CELKEM a prázdné se přeskočí', () => {
    const table = [
      ['', 'Kč (bez DPH)'],
      ['Položka', 'Plán', 'vyčerpáno', '%čerpání'],
      ['Panely  (NODA)', '11 083 065', '10 991 381,48', '0,99'],
      ['Beltec', '13109313', '11454656,5', '0,87'],
      ['Datová komunikace a rozvodnice', '320000', '', ''],
      ['Poznámka bez částky', '', '', ''],
      ['CELKEM (bez DPH)', '27282869', '', '']
    ];
    const r = parseBudgetTable(table);
    expect(r.rows.map((x) => [x.description, x.unitCost, x.quantity])).toEqual([
      ['Panely  (NODA)', 11083065, 1],
      ['Beltec', 13109313, 1],
      ['Datová komunikace a rozvodnice', 320000, 1]
    ]);
    expect(r.notes).toEqual([]);
  });
  it('množství a cena za MJ, dodavatel a měna z tabulky', () => {
    const r = parseBudgetTable([
      ['Popis', 'Dodavatel', 'Množství', 'MJ', 'Cena za MJ', 'Měna'],
      ['Kabel CYKY', 'ELKA', '200', 'm', '35,5', 'CZK'],
      ['Panel', 'NODA', '10', 'ks', '100', 'EUR']
    ]);
    expect(r.rows).toEqual([
      { description: 'Kabel CYKY', supplier: 'ELKA', quantity: 200, unit: 'm', unitCost: 35.5, currency: 'CZK' },
      { description: 'Panel', supplier: 'NODA', quantity: 10, unit: 'ks', unitCost: 100, currency: 'EUR' }
    ]);
  });
  it('bez nadpisů: první sloupec popis, první číslo nákup (s upozorněním); nic čitelného = upozornění', () => {
    const r = parseBudgetTable([['Rozvaděč', '1 200,50'], ['Kabel', 'x', '300']]);
    expect(r.rows.map((x) => [x.description, x.unitCost])).toEqual([['Rozvaděč', 1200.5], ['Kabel', 300]]);
    expect(r.notes.length).toBe(1);
    expect(parseBudgetTable([['jen text']]).notes.some((n) => n.includes('žádnou položku'))).toBe(true);
  });
  it('schránka z Excelu: řádky a tabulátory', () => {
    expect(parseClipboardTable('A\t1\r\nB\t2\r\n\r\n')).toEqual([['A', '1'], ['B', '2']]);
  });
});

describe('objednáno, prognóza a semafor (krok 3b)', () => {
  const o = (budgetItemId: string | undefined, status: OrderStatus, amountNet: number, currency = 'CZK'): { budgetItemId: string | undefined; status: OrderStatus; amountNet: number; currency: string } => ({ budgetItemId, status, amountNet, currency });

  it('objednáno u položky: jen navázané objednávky ve stavech „vystaveno“; cizí měna se přepočte do měny položky', () => {
    const orders = [
      o('i1', OrderStatus.Schvaleno, 40),
      o('i1', OrderStatus.KeSchvaleni, 10),
      o('i1', OrderStatus.Koncept, 999),
      o('i1', OrderStatus.Storno, 999),
      o('jina', OrderStatus.Schvaleno, 500),
      o(undefined, OrderStatus.Schvaleno, 500),
      o('i1', OrderStatus.Dodano, 1, 'EUR') // 1 EUR = 25 Kč
    ];
    expect(orderedForItem(orders, 'i1', 'CZK', RATES)).toBe(75);
    expect(orderedForItem(orders, 'i1', 'EUR', RATES)).toBe(3);
    expect(orderedForItem([], 'i1', 'CZK', RATES)).toBe(0);
  });

  it('prognóza položky: ruční, jinak plán; nikdy méně než objednáno a koupeno', () => {
    expect(forecastOf(undefined, 100, 0, 0)).toBe(100);
    expect(forecastOf(80, 100, 0, 0)).toBe(80);
    expect(forecastOf(80, 100, 120, 0)).toBe(120);
    expect(forecastOf(undefined, 100, 0, 130)).toBe(130);
  });

  it('calcItems a součty: objednáno a prognóza z navázaných objednávek', () => {
    const d = doc([item({ id: 'a', unitCost: 100, forecastCost: 110 }), item({ id: 'b', unitCost: 50 })]);
    const orders = [o('a', OrderStatus.Schvaleno, 130), o('b', OrderStatus.Odeslano, 20)];
    const calcs = calcItems(d, RATES, orders);
    expect(calcs.map((c) => [c.ordered, c.forecast])).toEqual([[130, 130], [20, 50]]);
    const t = budgetTotals(d, 'CZK', RATES, orders);
    expect([t.ordered, t.forecast, t.cost]).toEqual([150, 180, 150]);
    expect(budgetTotals(d, 'CZK', RATES).ordered).toBe(0);
  });

  it('práce: prognóza z odpracovaných hodin, když překročí plán', () => {
    const d = doc([item({ id: 'p', groupId: 'gp', quantity: 10, rateId: 's1', actualQty: 12 })], [gp]);
    const [c] = calcItems(d, RATES);
    expect([c.cost, c.actualCost, c.forecast]).toEqual([4000, 4800, 4800]);
  });

  it('semafor: bez baseline šedá; zelená do 0 %; žlutá do prahu; červená nad prahem nebo při nízké marži', () => {
    const base = { baselineCost: 1000, yellowThresholdPercent: 5, minimumMarginPercent: 10 };
    expect(budgetSemaphore({ ...base, baselineCost: undefined, forecastCost: 900 }).status).toBe(Semafor.Bez);
    expect(budgetSemaphore({ ...base, baselineCost: 0, forecastCost: 900 }).status).toBe(Semafor.Bez);
    expect(budgetSemaphore({ ...base, forecastCost: 900, contractPrice: 1200 }).status).toBe(Semafor.Zelena);
    expect(budgetSemaphore({ ...base, forecastCost: 1000, contractPrice: 1200 }).status).toBe(Semafor.Zelena);
    expect(budgetSemaphore({ ...base, forecastCost: 1030, contractPrice: 1300 }).status).toBe(Semafor.Zluta);
    expect(budgetSemaphore({ ...base, forecastCost: 1060, contractPrice: 1300 }).status).toBe(Semafor.Cervena);
    const nizkaMarze = budgetSemaphore({ ...base, forecastCost: 1000, contractPrice: 1050 });
    expect([nizkaMarze.status, nizkaMarze.marginPercent]).toEqual([Semafor.Cervena, 4.76]);
    expect(budgetSemaphore({ ...base, forecastCost: 1030, contractPrice: 1300 }).deviationPercent).toBe(3);
    // bez smluvní ceny se marže nehlídá
    expect(budgetSemaphore({ ...base, forecastCost: 1000 }).status).toBe(Semafor.Zelena);
  });
});
