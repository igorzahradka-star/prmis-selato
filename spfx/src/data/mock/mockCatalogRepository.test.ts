import { createMockRepositories } from './mockRepositories';
import { CurrentUser, Role } from '../../core/types';
import { CatalogInput } from '../../core/catalog';
import { MOCK_USER } from './mockData';

// Při plné zátěži počítače (celý běh testů) trvá ukázkový repozitář déle než výchozích 5 s.
jest.setTimeout(30000);

const uzivatel = (login: string, roles: Role[]): CurrentUser => ({ ...MOCK_USER, id: 500, loginName: `i:0#.f|membership|${login}@revoltum.cz`, displayName: login, roles });
const pm = uzivatel('pm', [Role.ProjektovyManazer]);
const cizi = uzivatel('ctenar', [Role.Finance]);
const igor = { ...MOCK_USER } as CurrentUser; // administrátor, vedení

const nova: CatalogInput = { description: 'Jistič 3P 63A', supplier: 'ELKA', category: 'Materiál', currency: 'CZK', unit: 'ks', unitCost: 1200, sourceProject: '25003' };

describe('MockCatalogRepository (kusovník)', () => {
  it('ukázkový kusovník má položky; PM přidá novou', async () => {
    const r = createMockRepositories();
    const before = (await r.catalog.list()).length;
    expect(before).toBeGreaterThan(0);
    const out = await r.catalog.save(nova, pm);
    expect(out.updated).toBe(false);
    expect(out.item.createdByName).toBe('pm');
    expect((await r.catalog.list()).length).toBe(before + 1);
  });

  it('stejná položka (popis + dodavatel) se přepíše místo duplikátu', async () => {
    const r = createMockRepositories();
    await r.catalog.save(nova, pm);
    const n = (await r.catalog.list()).length;
    const again = await r.catalog.save({ ...nova, description: 'jistič 3p 63a', unitCost: 1350 }, pm);
    expect(again.updated).toBe(true);
    expect(again.item.unitCost).toBe(1350);
    expect((await r.catalog.list()).length).toBe(n);
  });

  it('nezapisuje ten, kdo nesmí; neúplná položka se odmítne; maže jen vedení nebo administrátor', async () => {
    const r = createMockRepositories();
    await expect(r.catalog.save(nova, cizi)).rejects.toThrow(/smí ukládat/);
    await expect(r.catalog.save({ ...nova, description: ' ' }, pm)).rejects.toThrow(/popis/);
    const { item } = await r.catalog.save(nova, pm);
    await expect(r.catalog.remove(item.id, pm)).rejects.toThrow(/jen vedení/);
    await r.catalog.remove(item.id, igor);
    expect((await r.catalog.list()).some((c) => c.id === item.id)).toBe(false);
  });

  it('úprava existující položky', async () => {
    const r = createMockRepositories();
    const { item } = await r.catalog.save(nova, pm);
    const upr = await r.catalog.update(item.id, { ...nova, unitCost: 999 }, pm);
    expect(upr.unitCost).toBe(999);
    await expect(r.catalog.update(99999, nova, pm)).rejects.toThrow(/nebyla nalezena/);
  });
});
