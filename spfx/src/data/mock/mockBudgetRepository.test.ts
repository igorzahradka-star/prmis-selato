import { createMockRepositories } from './mockRepositories';
import { CurrentUser, Role } from '../../core/types';
import { BudgetDoc, BudgetStatus, emptyBudget, newItem } from '../../core/budget';
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
  return { ...d, items: [{ ...newItem(d.groups[0]), description: 'Rozvaděč', unitCost: 100 }] };
};

describe('MockBudgetRepository (jeden rozpočet na projekt)', () => {
  it('ukázkový projekt 25001 má schválený rozpočet s historií a obsahem (práce, rezerva)', async () => {
    const r = createMockRepositories();
    const c = await r.budgets.get('25001');
    expect(c).toBeDefined();
    expect(c?.record.status).toBe(BudgetStatus.Schvaleno);
    expect(c?.record.approvals.length).toBe(1);
    expect(c?.doc.groups.map((g) => g.kind)).toEqual(expect.arrayContaining(['standard', 'prace', 'rezerva']));
    expect(c?.doc.rates.length).toBeGreaterThan(0);
  });

  it('PM rozpočet založí, upravuje, požádá o schválení; schválí vedení; úpravy po schválení jsou dál možné', async () => {
    const r = createMockRepositories();
    expect(await r.budgets.get('25003')).toBeUndefined();
    const rec = await r.budgets.create('25003', naplneny(), TOTALS, jan);
    expect(rec.status).toBe(BudgetStatus.Koncept);
    await expect(r.budgets.create('25003', naplneny(), TOTALS, jan)).rejects.toThrow(/už rozpočet má/);
    await r.budgets.save(rec.id, naplneny(), TOTALS, jan);
    await r.budgets.requestApproval(rec.id, jan);
    await expect(r.budgets.approve(rec.id, { totalCost: 100, totalSale: 120 }, undefined, jan)).rejects.toThrow(/vedení/);
    // rozpočet je dál upravitelný i během čekání na schválení
    await r.budgets.save(rec.id, naplneny(), TOTALS, jan);
    const ok = await r.budgets.approve(rec.id, { totalCost: 100, totalSale: 120 }, 'v pořádku', igor);
    expect(ok.status).toBe(BudgetStatus.Schvaleno);
    expect(ok.approvals).toHaveLength(1);
    expect(ok.approvals[0]).toMatchObject({ no: 1, byName: igor.displayName, cost: 100, sale: 120, comment: 'v pořádku' });
    expect(ok.approvals[0].marginPercent).toBe(16.67);
    // po schválení se dá dál upravovat a požádat o další schválení — vznikne další záznam
    await r.budgets.save(rec.id, naplneny(), { totalCost: 200, totalSale: 260 }, jan);
    await r.budgets.requestApproval(rec.id, jan);
    const dalsi = await r.budgets.approve(rec.id, { totalCost: 200, totalSale: 260 }, undefined, igor);
    expect(dalsi.approvals.map((a) => a.no)).toEqual([1, 2]);
    const h = (await r.budgets.history(rec.id)).map((x) => x.action);
    expect(h[0]).toBe('Založen rozpočet');
    expect(h.filter((a) => a.startsWith('Schváleno')).length).toBe(2);
  });

  it('cizí PM nezaloží ani neuloží; Režie rozpočet nevede', async () => {
    const r = createMockRepositories();
    await expect(r.budgets.create('25003', naplneny(), TOTALS, cizi)).rejects.toThrow(/oprávnění/);
    const rec = await r.budgets.create('25003', naplneny(), TOTALS, jan);
    await expect(r.budgets.save(rec.id, naplneny(), TOTALS, cizi)).rejects.toThrow(/Rozpočet smí upravovat/);
    await expect(r.budgets.create('26999', naplneny(), TOTALS, igor)).rejects.toThrow(/oprávnění/);
  });

  it('prázdný rozpočet nejde poslat ke schválení; schválit jde jen to, co čeká', async () => {
    const r = createMockRepositories();
    const rec = await r.budgets.create('25003', emptyBudget(['Materiál']), TOTALS, jan);
    await expect(r.budgets.requestApproval(rec.id, jan)).rejects.toThrow(/žádnou položku/);
    await expect(r.budgets.approve(rec.id, TOTALS, undefined, igor)).rejects.toThrow(/o jehož schválení někdo požádal/);
  });

  it('vedení vrací jen s důvodem a rozpočet se vrátí do konceptu; žadatel žádost stáhne; po schválení se vrací do „Schváleno“', async () => {
    const r = createMockRepositories();
    const rec = await r.budgets.create('25003', naplneny(), TOTALS, jan);
    await r.budgets.requestApproval(rec.id, jan);
    await expect(r.budgets.reject(rec.id, ' ', igor)).rejects.toThrow(/důvod/);
    const vracena = await r.budgets.reject(rec.id, 'Doplňte dopravu', igor);
    expect([vracena.status, vracena.comment]).toEqual([BudgetStatus.Koncept, 'Doplňte dopravu']);
    await r.budgets.requestApproval(rec.id, jan);
    const zpet = await r.budgets.reject(rec.id, '', jan);
    expect([zpet.status, zpet.comment]).toEqual([BudgetStatus.Koncept, undefined]);
    // po schválení: nová žádost a stažení vrátí stav „Schváleno“
    await r.budgets.requestApproval(rec.id, jan);
    await r.budgets.approve(rec.id, TOTALS, undefined, igor);
    await r.budgets.requestApproval(rec.id, jan);
    expect((await r.budgets.reject(rec.id, '', jan)).status).toBe(BudgetStatus.Schvaleno);
  });

  it('souběžná úprava: starý otisk se odmítne', async () => {
    const r = createMockRepositories();
    const rec = await r.budgets.create('25003', naplneny(), TOTALS, jan);
    const c = await r.budgets.get('25003');
    await r.budgets.save(rec.id, naplneny(), TOTALS, jan, c?.etag);
    await expect(r.budgets.save(rec.id, naplneny(), TOTALS, jan, c?.etag)).rejects.toThrow(/mezitím/);
  });
});

describe('Smluvní cena projektu = prodej schváleného rozpočtu', () => {
  it('schválení s cenou přepíše smluvní cenu a měnu projektu; bez ní se projekt nemění', async () => {
    const r = createMockRepositories();
    const before = await r.projects.getByNumber('25003');
    const rec = await r.budgets.create('25003', naplneny(), TOTALS, jan);
    await r.budgets.requestApproval(rec.id, jan);
    await r.budgets.approve(rec.id, TOTALS, undefined, igor);
    expect((await r.projects.getByNumber('25003'))?.contractPriceNet).toBe(before?.contractPriceNet);
    await r.budgets.requestApproval(rec.id, jan);
    await r.budgets.approve(rec.id, TOTALS, undefined, igor, { priceNet: 123456, currency: 'EUR' });
    const after = await r.projects.getByNumber('25003');
    expect([after?.contractPriceNet, after?.currency]).toEqual([123456, 'EUR']);
    expect((await r.budgets.history(rec.id)).some((h) => h.action.startsWith('Smluvní cena projektu přepsána'))).toBe(true);
  });
});

describe('Automatické ukládání rozpočtu', () => {
  it('automatické uložení uloží obsah a hlídá souběh, ale nezaplňuje podrobnou historii', async () => {
    const r = createMockRepositories();
    const rec = await r.budgets.create('25003', naplneny(), TOTALS, jan);
    const pred = (await r.budgets.history(rec.id)).length;
    const d = naplneny();
    d.items[0].description = 'Změněno automaticky';
    await r.budgets.save(rec.id, d, TOTALS, jan, undefined, { auto: true });
    expect((await r.budgets.get('25003'))?.doc.items[0].description).toBe('Změněno automaticky');
    expect((await r.budgets.history(rec.id)).length).toBe(pred);
    // ruční uložení se do historie zapíše
    await r.budgets.save(rec.id, d, TOTALS, jan);
    expect((await r.budgets.history(rec.id)).length).toBe(pred + 1);
    // souběh se hlídá i při automatickém uložení
    const c = await r.budgets.get('25003');
    await r.budgets.save(rec.id, d, TOTALS, jan, c?.etag, { auto: true });
    await expect(r.budgets.save(rec.id, d, TOTALS, jan, c?.etag, { auto: true })).rejects.toThrow(/mezitím/);
  });
});
