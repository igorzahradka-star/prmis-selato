import {
  CatalogItem,
  budgetItemFromCatalog,
  canDeleteCatalog,
  canWriteCatalog,
  catalogInputFromItem,
  filterCatalog,
  findInCatalog,
  sameCatalogItem,
  validateCatalogInput
} from './catalog';
import { BudgetItem } from './budget';
import { Actor } from './orderWorkflow';
import { Role } from './types';

const polozka: BudgetItem = { id: 'i1', groupId: 'g1', description: ' Rozvaděč ABCD ', supplier: ' ELKA ', category: 'Materiál', currency: 'EUR', quantity: 5, unit: 'ks', unitCost: 100, markupPercent: 10, note: 'pozn.' };
const c = (id: number, description: string, supplier?: string, extra: Partial<CatalogItem> = {}): CatalogItem => ({ id, description, supplier, currency: 'CZK', unitCost: 1, ...extra });

describe('kusovník', () => {
  it('z položky rozpočtu: čistý popis a dodavatel, jednotková cena (ne celkem), bez množství a přirážky', () => {
    expect(catalogInputFromItem(polozka, '26001')).toEqual({
      description: 'Rozvaděč ABCD',
      supplier: 'ELKA',
      category: 'Materiál',
      currency: 'EUR',
      unit: 'ks',
      unitCost: 100,
      note: 'pozn.',
      sourceProject: '26001'
    });
  });

  it('do rozpočtu: množství 1, cena a údaje z kusovníku, nové id', () => {
    const b = budgetItemFromCatalog(c(7, 'Kabel CYKY', 'ELKA', { unit: 'm', unitCost: 35.5, category: 'Materiál' }), 'g9');
    expect(b).toMatchObject({ groupId: 'g9', description: 'Kabel CYKY', supplier: 'ELKA', quantity: 1, unit: 'm', unitCost: 35.5, currency: 'CZK' });
    expect(b.id).toMatch(/^i/);
  });

  it('stejná položka = stejný popis a dodavatel bez ohledu na písmena, mezery a diakritiku', () => {
    expect(sameCatalogItem({ description: 'Rozvaděč  ABCD', supplier: 'ELKA' }, { description: 'rozvadec abcd', supplier: 'elka' })).toBe(true);
    expect(sameCatalogItem({ description: 'Rozvaděč', supplier: 'ELKA' }, { description: 'Rozvaděč', supplier: 'JINÁ' })).toBe(false);
    expect(sameCatalogItem({ description: '', supplier: undefined }, { description: '', supplier: undefined })).toBe(false);
    expect(findInCatalog([c(1, 'A'), c(2, 'Rozvaděč', 'ELKA')], { description: 'ROZVADEC', supplier: 'elka' })?.id).toBe(2);
  });

  it('hledání podle písmen v popisu, dodavateli, kategorii; řazení česky', () => {
    const list = [c(1, 'Žlutý kabel', 'ELKA'), c(2, 'Rozvaděč', 'Beltec', { category: 'Materiál' }), c(3, 'Autobus', 'Cizí')];
    expect(filterCatalog(list, '').map((x) => x.id)).toEqual([3, 2, 1]);
    expect(filterCatalog(list, 'ROZV').map((x) => x.id)).toEqual([2]);
    expect(filterCatalog(list, 'elka').map((x) => x.id)).toEqual([1]);
    expect(filterCatalog(list, 'material').map((x) => x.id)).toEqual([2]);
  });

  it('kontrola: popis a cena', () => {
    const ok = catalogInputFromItem(polozka, undefined);
    expect(validateCatalogInput(ok)).toEqual([]);
    expect(validateCatalogInput({ ...ok, description: ' ' })).toEqual(['Vyplňte popis položky.']);
    expect(validateCatalogInput({ ...ok, unitCost: -1 })).toEqual(['Cena za jednotku musí být nezáporné číslo.']);
  });

  it('práva: zapisuje PM, asistent, vedení, administrátor; maže vedení a administrátor', () => {
    const a = (roles: Role[]): Actor => ({ login: 'x', displayName: 'X', roles });
    expect(canWriteCatalog(a([Role.ProjektovyManazer]))).toBe(true);
    expect(canWriteCatalog(a([Role.AsistentPM]))).toBe(true);
    expect(canWriteCatalog(a([Role.Finance]))).toBe(false);
    expect(canDeleteCatalog(a([Role.ProjektovyManazer]))).toBe(false);
    expect(canDeleteCatalog(a([Role.Vedeni]))).toBe(true);
  });
});
