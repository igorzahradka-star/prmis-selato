import { createMockRepositories } from './mockRepositories';
import { CurrentUser, Role } from '../../core/types';
import { BudgetDoc, BudgetVersionStatus, emptyBudget, newItem } from '../../core/budget';
import { MOCK_USER } from './mockData';

// Při plné zátěži počítače (celý běh testů) trvá ukázkový repozitář déle než výchozích 5 s.
jest.setTimeout(30000);

function uzivatel(login: string, name: string, roles: Role[]): CurrentUser {
  return { ...MOCK_USER, id: Math.floor(Math.random() * 1000) + 100, loginName: `i:0#.f|membership|${login}@revoltum.cz`, displayName: name, roles };
}

const igor = { ...MOCK_USER } as CurrentUser; // administrátor, vedení
const jan = uzivatel('jan.novak', 'Jan Novák', [Role.ProjektovyManazer]); // PM projektu 25003
const cizi = uzivatel('cizi', 'Cizí PM', [Role.ProjektovyManazer]);
const TOTALS = { totalCost: 100, totalSale: 120 };

const naplneny = (): BudgetDoc => {
  const d = emptyBudget(['Materiál']);
  return { ...d, items: [{ ...newItem(d.groups[0].id), description: 'Rozvaděč', unitCost: 100 }] };
};

describe('MockBudgetRepository', () => {
  it('ukázkový projekt 25001 má schválený rozpočet (baseline) s obsahem', async () => {
    const r = createMockRepositories();
    const v = await r.budgets.listVersions('25001');
    expect(v.map((x) => [x.versionNo, x.status])).toEqual([[1, BudgetVersionStatus.Schvaleno]]);
    const c = await r.budgets.getContent(v[0].id);
    expect(c.doc.groups.length).toBeGreaterThan(1);
    expect(c.doc.items.length).toBeGreaterThan(2);
  });

  it('PM založí první verzi, uloží, odešle; schválí vedení; pak jde založit novou verzi jako kopii', async () => {
    const r = createMockRepositories();
    const v1 = await r.budgets.createVersion('25003', naplneny(), TOTALS, jan);
    expect([v1.versionNo, v1.status]).toEqual([1, BudgetVersionStatus.Koncept]);
    const upraveny = { ...naplneny() };
    await r.budgets.saveContent(v1.id, upraveny, TOTALS, jan);
    expect((await r.budgets.getContent(v1.id)).doc.items[0].description).toBe('Rozvaděč');
    await r.budgets.submit(v1.id, jan);
    await expect(r.budgets.approve(v1.id, undefined, jan)).rejects.toThrow(/vedení/);
    await expect(r.budgets.saveContent(v1.id, upraveny, TOTALS, jan)).rejects.toThrow(/ve stavu/);
    const ok = await r.budgets.approve(v1.id, 'v pořádku', igor);
    expect(ok.status).toBe(BudgetVersionStatus.Schvaleno);
    expect(ok.approvedByName).toBe(igor.displayName);
    const v2 = await r.budgets.createVersion('25003', upraveny, TOTALS, jan);
    expect(v2.versionNo).toBe(2);
    expect((await r.budgets.listVersions('25003')).map((v) => v.versionNo)).toEqual([2, 1]);
    const h = (await r.budgets.history(v1.id)).map((x) => x.action);
    expect(h[0]).toBe('Založena verze rozpočtu');
    expect(h.some((a) => a.startsWith('Schváleno'))).toBe(true);
  });

  it('dokud je verze rozpracovaná, další nejde založit; cizí PM nezaloží ani neuloží', async () => {
    const r = createMockRepositories();
    await expect(r.budgets.createVersion('25003', naplneny(), TOTALS, cizi)).rejects.toThrow(/oprávnění/);
    const v1 = await r.budgets.createVersion('25003', naplneny(), TOTALS, jan);
    await expect(r.budgets.createVersion('25003', naplneny(), TOTALS, jan)).rejects.toThrow(/rozpracovanou verzi/);
    await expect(r.budgets.saveContent(v1.id, naplneny(), TOTALS, cizi)).rejects.toThrow(/Rozpočet smí upravovat/);
  });

  it('prázdný rozpočet nejde odeslat; vedení vrací jen s důvodem, předkladatel stáhne zpět bez něj', async () => {
    const r = createMockRepositories();
    const v1 = await r.budgets.createVersion('25003', emptyBudget(['Materiál']), TOTALS, jan);
    await expect(r.budgets.submit(v1.id, jan)).rejects.toThrow(/žádnou položku/);
    await r.budgets.saveContent(v1.id, naplneny(), TOTALS, jan);
    await r.budgets.submit(v1.id, jan);
    await expect(r.budgets.returnToDraft(v1.id, ' ', igor)).rejects.toThrow(/důvod/);
    const vracena = await r.budgets.returnToDraft(v1.id, 'Doplňte dopravu', igor);
    expect([vracena.status, vracena.comment]).toEqual([BudgetVersionStatus.Koncept, 'Doplňte dopravu']);
    await r.budgets.submit(v1.id, jan);
    const zpet = await r.budgets.returnToDraft(v1.id, '', jan);
    expect(zpet.status).toBe(BudgetVersionStatus.Koncept);
  });

  it('souběžná úprava: starý otisk verze se odmítne', async () => {
    const r = createMockRepositories();
    const v1 = await r.budgets.createVersion('25003', naplneny(), TOTALS, jan);
    const c = await r.budgets.getContent(v1.id);
    await r.budgets.saveContent(v1.id, naplneny(), TOTALS, jan, c.etag);
    await expect(r.budgets.saveContent(v1.id, naplneny(), TOTALS, jan, c.etag)).rejects.toThrow(/mezitím/);
  });

  it('na Režii se rozpočet nevede', async () => {
    const r = createMockRepositories();
    await expect(r.budgets.createVersion('26999', naplneny(), TOTALS, igor)).rejects.toThrow(/oprávnění/);
  });
});
