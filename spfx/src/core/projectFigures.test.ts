import { projectFigures } from './projectFigures';
import { BudgetStatus, Project, ProjectStatus } from './types';

const base: Project = { id: 1, projectNumber: '26001', title: 'X', status: ProjectStatus.Realizace, currency: 'EUR', isOverhead: false, budgetStatus: BudgetStatus.Bez, contractPriceNet: 1000 };
const czk = (a: number): number => a / 25; // Kč → EUR
const proj = (a: number, c: string): number => (c === 'EUR' ? a : a / 25);

describe('čísla projektu v přehledech', () => {
  it('bez rozpočtu: cena z údajů projektu, čerpání z objednávek, nic provizorního', () => {
    expect(projectFigures(base, czk, proj, 300)).toEqual({ price: 1000, cost: undefined, actual: 300, fromBudget: false, provisional: false });
    expect(projectFigures({ ...base, contractPriceNet: undefined }, czk, proj).price).toBeUndefined();
  });

  it('neschválený rozpočet: čísla z rozpočtu (v Kč přepočtená do měny přehledu), provizorní', () => {
    const f = projectFigures({ ...base, budgetSaleTotal: 50000, budgetCostTotal: 40000, budgetActualTotal: 10000, budgetApproved: false }, czk, proj, 999);
    expect(f).toEqual({ price: 2000, cost: 1600, actual: 400, fromBudget: true, provisional: true });
  });

  it('schválený rozpočet: stejná čísla, ale už ne provizorní; skutečnost z rozpočtu, ne z objednávek', () => {
    const f = projectFigures({ ...base, budgetSaleTotal: 50000, budgetCostTotal: 40000, budgetActualTotal: 0, budgetApproved: true }, czk, proj, 999);
    expect([f.provisional, f.actual]).toEqual([false, 0]);
  });

  it('rozpočet bez uložených nákladů nebo skutečnosti nepadne', () => {
    const f = projectFigures({ ...base, budgetSaleTotal: 25000 }, czk, proj);
    expect([f.price, f.cost, f.actual, f.provisional]).toEqual([1000, undefined, undefined, true]);
  });
});
