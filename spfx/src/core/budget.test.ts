import {
  BudgetDoc,
  BudgetItem,
  BudgetVersion,
  BudgetVersionStatus,
  addGroup,
  addItem,
  availableBudgetActions,
  baselineOf,
  budgetFromJson,
  budgetToJson,
  budgetTotals,
  emptyBudget,
  itemCost,
  itemMarkup,
  itemSale,
  marginPercent,
  markupPercentOf,
  newItem,
  nextVersionNo,
  parseBudgetTable,
  parseClipboardTable,
  removeGroup,
  updateGroup,
  validateBudget,
  withMarkup,
  withSale
} from './budget';
import { Actor, WorkflowProject } from './orderWorkflow';
import { Role } from './types';

const g1 = { id: 'g1', name: 'Materiál', defaultMarkupPercent: 20 };
const g2 = { id: 'g2', name: 'Doprava', defaultMarkupPercent: 0 };
const item = (extra: Partial<BudgetItem> = {}): BudgetItem => ({ id: 'i1', groupId: 'g1', description: 'Rozvaděč ABCD', currency: 'CZK', quantity: 1, unitCost: 100, ...extra });
const doc = (items: BudgetItem[]): BudgetDoc => ({ groups: [g1, g2], items });
const same = (amount: number, from: string): number => (from === 'EUR' ? amount * 25 : amount);

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

  it('withMarkup: shodná se skupinou se dědí; withSale: shodná s výpočtem zůstane výpočtem', () => {
    expect(withMarkup(item({ markupPercent: 5 }), g1, 20).markupPercent).toBeUndefined();
    expect(withMarkup(item(), g1, 35).markupPercent).toBe(35);
    expect(withMarkup(item({ salePriceOverride: 999 }), g1, 35).salePriceOverride).toBeUndefined();
    expect(withSale(item(), g1, 120).salePriceOverride).toBeUndefined();
    expect(withSale(item(), g1, 130).salePriceOverride).toBe(130);
    expect(withSale(item({ markupPercent: 5 }), g1, 130).markupPercent).toBeUndefined();
  });

  it('nulový nákup a prodej nepadnou', () => {
    expect(marginPercent(0, 0)).toBe(0);
    expect(markupPercentOf(0, 10)).toBe(0);
    expect(itemMarkup(item({ unitCost: 0, salePriceOverride: 50 }), g1)).toBe(20);
  });
});

describe('součty', () => {
  it('po skupinách a kategoriích; cizí měna se přepočítá', () => {
    const d = doc([
      item({ id: 'a', category: 'Materiál' }),
      item({ id: 'b', currency: 'EUR', unitCost: 10, category: 'Materiál' }), // 10 EUR = 250 Kč, přirážka 20 % → 300
      item({ id: 'c', groupId: 'g2', unitCost: 40, category: 'Doprava' })
    ]);
    const t = budgetTotals(d, same);
    expect(t.cost).toBe(390);
    expect(t.sale).toBe(460);
    expect(t.byGroup.map((g) => [g.name, g.cost, g.sale, g.count])).toEqual([
      ['Materiál', 350, 420, 2],
      ['Doprava', 40, 40, 1]
    ]);
    expect(t.byCategory.map((c) => c.category)).toEqual(['Materiál', 'Doprava']);
    expect(t.marginPercent).toBe(15.22);
    expect(t.markupPercent).toBe(17.95);
  });

  it('prázdný rozpočet má nuly', () => {
    const t = budgetTotals({ groups: [g1], items: [] }, same);
    expect([t.cost, t.sale, t.marginPercent]).toEqual([0, 0, 0]);
  });
});

describe('úpravy rozpočtu', () => {
  it('nový rozpočet má skupiny podle kategorií; položky se řadí na konec své skupiny', () => {
    const d = emptyBudget(['Materiál', 'Doprava', ' ']);
    expect(d.groups.map((g) => g.name)).toEqual(['Materiál', 'Doprava']);
    const a = addItem(d, newItem(d.groups[0].id));
    const b = addItem(a, newItem(d.groups[1].id));
    const c = addItem(b, newItem(d.groups[0].id));
    expect(c.items.map((i) => i.groupId)).toEqual([d.groups[0].id, d.groups[0].id, d.groups[1].id]);
  });

  it('odebrání skupiny odebere i její položky; úprava výchozí přirážky', () => {
    const d = doc([item({ id: 'a' }), item({ id: 'b', groupId: 'g2' })]);
    expect(removeGroup(d, 'g1').items.map((i) => i.id)).toEqual(['b']);
    expect(updateGroup(addGroup(d, 'Nová', 12), 'g1', { defaultMarkupPercent: 30 }).groups.map((g) => g.defaultMarkupPercent)).toEqual([30, 0, 12]);
  });

  it('kontrola: prázdné názvy, duplicity, záporné hodnoty; přísná kontrola chce popis i položky', () => {
    expect(validateBudget({ groups: [g1, { ...g2, name: 'materiál' }], items: [] }, false).map((i) => i.message)).toEqual(['Skupina „materiál“ je v rozpočtu dvakrát.']);
    expect(validateBudget(doc([item({ unitCost: -1 })]), false).length).toBe(1);
    expect(validateBudget(doc([]), true).map((i) => i.message)).toEqual(['Rozpočet nemá žádnou položku.']);
    expect(validateBudget(doc([item({ description: ' ' })]), true).map((i) => i.message)).toEqual(['Řádek 1 nemá popis.']);
    expect(validateBudget(doc([item()]), true)).toEqual([]);
    expect(validateBudget(doc([item({ groupId: 'x' })]), false).length).toBe(1);
  });
});

describe('uložení jako JSON', () => {
  it('rozpočet se uloží a přečte zpět', () => {
    const d = doc([item({ supplier: 'BELTEC', markupPercent: 7, note: 'pozn.' }), item({ id: 'i2', currency: 'EUR', salePriceOverride: 500 })]);
    expect(budgetFromJson(budgetToJson(d))).toEqual(d);
  });
  it('poškozený nebo prázdný JSON dá prázdný rozpočet; chybějící části se doplní', () => {
    expect(budgetFromJson('{rozbité')).toEqual({ groups: [], items: [] });
    expect(budgetFromJson(undefined)).toEqual({ groups: [], items: [] });
    const b = budgetFromJson(JSON.stringify({ groups: [{ name: 'A' }], items: [{ groupId: 'x', description: 'D', currency: 'GBP' }] }));
    expect(b.groups[0].id).not.toBe('');
    expect(b.items[0]).toMatchObject({ quantity: 1, unitCost: 0, currency: 'CZK', description: 'D' });
  });
});

describe('verze a schvalování', () => {
  const PM = 'i:0#.f|membership|pm@revoltum.cz';
  const project: WorkflowProject = { projectNumber: '26001', projectManagerLogin: PM, assistantLogins: [], isOverhead: false };
  const pm: Actor = { login: PM, displayName: 'PM', roles: [Role.ProjektovyManazer] };
  const vedeni: Actor = { login: 'i:0#.f|membership|v@revoltum.cz', displayName: 'V', roles: [Role.Vedeni] };
  const cizi: Actor = { login: 'i:0#.f|membership|c@revoltum.cz', displayName: 'C', roles: [Role.ProjektovyManazer] };
  const ver = (no: number, status: BudgetVersionStatus): BudgetVersion => ({ id: no, projectNumber: '26001', versionNo: no, status });

  it('koncept: PM upravuje a odesílá, cizí PM nic', () => {
    expect(availableBudgetActions(ver(1, BudgetVersionStatus.Koncept), true, project, pm)).toEqual(['edit', 'submit']);
    expect(availableBudgetActions(ver(1, BudgetVersionStatus.Koncept), true, project, cizi)).toEqual([]);
  });
  it('ke schválení: vedení schvaluje nebo vrací; PM může stáhnout zpět', () => {
    const v = ver(1, BudgetVersionStatus.KeSchvaleni);
    expect(availableBudgetActions(v, true, project, vedeni)).toEqual(['approve', 'return']);
    expect(availableBudgetActions(v, true, project, pm)).toEqual(['return']);
  });
  it('schválená: jen poslední verze nabídne novou verzi; bez verze jde založit první', () => {
    expect(availableBudgetActions(ver(2, BudgetVersionStatus.Schvaleno), true, project, pm)).toEqual(['newVersion']);
    expect(availableBudgetActions(ver(1, BudgetVersionStatus.Schvaleno), false, project, pm)).toEqual([]);
    expect(availableBudgetActions(undefined, true, project, pm)).toEqual(['newVersion']);
    expect(availableBudgetActions(undefined, true, project, cizi)).toEqual([]);
  });
  it('Režie rozpočet nevede', () => {
    expect(availableBudgetActions(undefined, true, { ...project, isOverhead: true }, vedeni)).toEqual([]);
  });
  it('baseline = poslední schválená verze; další číslo verze', () => {
    const list = [ver(1, BudgetVersionStatus.Schvaleno), ver(2, BudgetVersionStatus.Schvaleno), ver(3, BudgetVersionStatus.Koncept)];
    expect(baselineOf(list)?.versionNo).toBe(2);
    expect(baselineOf([ver(1, BudgetVersionStatus.Koncept)])).toBeUndefined();
    expect(nextVersionNo(list)).toBe(4);
    expect(nextVersionNo([])).toBe(1);
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
