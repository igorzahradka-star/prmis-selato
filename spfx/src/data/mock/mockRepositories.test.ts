import {
  MockNumberingRepository,
  MockUserAdminRepository,
  MockProjectRepository,
  applyPartnerFilter,
  assertNotOverheadNumber,
  createMockRepositories,
  seedProjectCounter
} from './mockRepositories';
import { DEFAULT_DOC_TYPES, MOCK_PARTNERS, MOCK_PROJECTS, MOCK_USER } from './mockData';
import { CurrentUser, PartnerType, ProjectStatus, Role } from '../../core/types';
import { ProjectEditInput } from '../repositories';
import { overheadProjectNumber } from '../../core/overhead';

describe('MockNumberingRepository', () => {
  it('přidělí číslo podle vzoru dané řady', async () => {
    const repo = new MockNumberingRepository();
    const cislo = await repo.allocateNumber('PRJ', { date: new Date(2026, 8, 21) });
    expect(cislo).toBe('26001');
  });

  it('další volání ve stejném roce pokračuje v řadě', async () => {
    const repo = new MockNumberingRepository();
    const datum = new Date(2026, 8, 21);
    await repo.allocateNumber('PRJ', { date: datum });
    const druhe = await repo.allocateNumber('PRJ', { date: datum });
    expect(druhe).toBe('26002');
  });

  it('řada v rámci projektu (PP) počítá zvlášť pro každý projekt', async () => {
    const repo = new MockNumberingRepository();
    const a1 = await repo.allocateNumber('PP', { projectNumber: '26001' });
    const b1 = await repo.allocateNumber('PP', { projectNumber: '26002' });
    const a2 = await repo.allocateNumber('PP', { projectNumber: '26001' });
    expect(a1).toBe('PP-26001-01');
    expect(b1).toBe('PP-26002-01');
    expect(a2).toBe('PP-26001-02');
  });

  it('neznámou nebo neaktivní řadu odmítne se srozumitelnou chybou', async () => {
    const repo = new MockNumberingRepository();
    await expect(repo.allocateNumber('NEEXISTUJE')).rejects.toThrow(/neaktivní číselná řada/);
  });

  it('při souběžném volání nevydá žádné číslo dvakrát (simulace souběhu)', async () => {
    const repo = new MockNumberingRepository();
    const datum = new Date(2026, 8, 21);

    const POCET = 25;
    const vysledky = await Promise.all(
      Array.from({ length: POCET }, () => repo.allocateNumber('PRJ', { date: datum }))
    );

    const unikatni = new Set(vysledky);
    expect(unikatni.size).toBe(POCET);
    const ocekavana = Array.from({ length: POCET }, (_, i) => {
      const cislo = String(i + 1);
      return `26${'0'.repeat(Math.max(0, 3 - cislo.length))}${cislo}`;
    });
    expect(vysledky.slice().sort()).toEqual(ocekavana.sort());
  });

  it('vrací kopie výchozích řad, ne odkaz na sdílené pole', async () => {
    const repo = new MockNumberingRepository();
    const prvni = await repo.listDocTypes();
    prvni[0].active = false;
    const druhe = await repo.listDocTypes();
    expect(druhe[0].active).toBe(DEFAULT_DOC_TYPES[0].active);
  });

  it('po nasazení počátečního stavu z ukázkových dat nevydá číslo, které už některý projekt má', async () => {
    const repo = new MockNumberingRepository();
    repo.seedCounter('PRJ', seedProjectCounter());

    const existujici = new Set(MOCK_PROJECTS.map((p) => p.projectNumber));
    const dalsi = await repo.allocateNumber('PRJ');

    expect(existujici.has(dalsi)).toBe(false);
  });
});

describe('MockProjectRepository.update', () => {
  function repo(): MockProjectRepository {
    return createMockRepositories().projects as MockProjectRepository;
  }

  function edit(over: Partial<ProjectEditInput> = {}): ProjectEditInput {
    return {
      title: 'Upravený název',
      projectManagerName: 'Igor Zahrádka',
      status: ProjectStatus.Realizace,
      currency: 'CZK',
      ...over
    };
  }

  const cislo = MOCK_PROJECTS[0].projectNumber;

  it('uloží změněné údaje a vrátí novou podobu projektu', async () => {
    const r = repo();
    const updated = await r.update(cislo, edit({ contractPriceNet: 2500000 }));

    expect(updated.title).toBe('Upravený název');
    expect(updated.contractPriceNet).toBe(2500000);
    expect(await r.getByNumber(cislo)).toEqual(updated);
  });

  it('číslo projektu ani jeho id se úpravou nemění', async () => {
    const r = repo();
    const puvodni = await r.getByNumber(cislo);
    const updated = await r.update(cislo, edit());

    expect(updated.projectNumber).toBe(cislo);
    expect(updated.id).toBe(puvodni?.id);
  });

  it('nevyplněné nepovinné pole hodnotu smaže', async () => {
    const r = repo();
    await r.update(cislo, edit({ location: 'Havlíčkův Brod' }));
    const updated = await r.update(cislo, edit({ location: undefined }));

    expect(updated.location).toBeUndefined();
  });

  it('zachová údaje, které formulář neposílá (semafor, složka, režie)', async () => {
    const r = repo();
    const puvodni = await r.getByNumber(cislo);
    const updated = await r.update(cislo, edit());

    expect(updated.budgetStatus).toBe(puvodni?.budgetStatus);
    expect(updated.budgetBaselineTotal).toBe(puvodni?.budgetBaselineTotal);
    expect(updated.isOverhead).toBe(puvodni?.isOverhead);
  });

  it('neznámé číslo projektu odmítne', async () => {
    const r = repo();
    await expect(r.update('99999', edit())).rejects.toThrow(/nebyl nalezen/);
  });

  it('se správnou verzí uloží', async () => {
    const r = repo();
    const verze = r.getVersion(cislo);
    const updated = await r.update(cislo, edit({ title: 'S verzí' }), verze);
    expect(updated.title).toBe('S verzí');
  });

  it('se zastaralou verzí neuloží nic — cizí změnu nepřepíše', async () => {
    const r = repo();
    const stara = r.getVersion(cislo);
    await r.update(cislo, edit({ title: 'Změna kolegy' }));

    await expect(r.update(cislo, edit({ title: 'Moje změna' }), stara)).rejects.toThrow(/změnil/);

    const aktualni = await r.getByNumber(cislo);
    expect(aktualni?.title).toBe('Změna kolegy');
  });

  it('bez zadané verze uloží natvrdo', async () => {
    const r = repo();
    await r.update(cislo, edit({ title: 'První' }));
    const updated = await r.update(cislo, edit({ title: 'Druhá' }));
    expect(updated.title).toBe('Druhá');
  });
});

describe('MockProjectRepository.remove', () => {
  function repo(): MockProjectRepository {
    return createMockRepositories().projects as MockProjectRepository;
  }

  const admin: CurrentUser = { ...MOCK_USER, roles: [Role.Administrator] };
  const pm: CurrentUser = { ...MOCK_USER, roles: [Role.ProjektovyManazer] };
  const cislo = MOCK_PROJECTS[0].projectNumber;

  it('administrátor projekt smaže a v seznamu už není', async () => {
    const r = repo();
    await r.remove(cislo, admin);

    expect(await r.getByNumber(cislo)).toBeUndefined();
    expect((await r.list({})).some((p) => p.projectNumber === cislo)).toBe(false);
  });

  it('projektový manažer smazat nesmí — ani když je to jeho projekt', async () => {
    const r = repo();
    await expect(r.remove(cislo, pm)).rejects.toThrow(/jen administrátor/);
    expect(await r.getByNumber(cislo)).toBeDefined();
  });

  it('kontrola oprávnění je i v datové vrstvě, nejen ve skrytí tlačítka', async () => {
    const r = repo();
    const ctenar: CurrentUser = { ...MOCK_USER, roles: [Role.Ctenar] };
    await expect(r.remove(cislo, ctenar)).rejects.toThrow(/jen administrátor/);
  });

  it('smazání zaznamená, kdo mazal a proč', async () => {
    const r = repo();
    await r.remove(cislo, admin, 'Duplicitní záznam');

    expect(r.listDeleted()).toEqual([
      { projectNumber: cislo, by: admin.displayName, reason: 'Duplicitní záznam' }
    ]);
  });

  it('neznámé číslo projektu odmítne', async () => {
    const r = repo();
    await expect(r.remove('99999', admin)).rejects.toThrow(/nebyl nalezen/);
  });

  it('smazání se nedotkne ostatních projektů', async () => {
    const r = repo();
    const predtim = (await r.list({ includeOverhead: true })).length;
    await r.remove(cislo, admin);
    expect((await r.list({ includeOverhead: true })).length).toBe(predtim - 1);
  });
});

describe('applyPartnerFilter', () => {
  const neaktivni = {
    id: 999,
    name: 'Zaniklá firma s.r.o.',
    partnerType: PartnerType.Dodavatel,
    isActive: false
  };
  const partneri = [...MOCK_PARTNERS, neaktivni];

  it('bez filtru vynechá neaktivní partnery', () => {
    const result = applyPartnerFilter(partneri, undefined);
    expect(result.some((p) => p.id === neaktivni.id)).toBe(false);
  });

  it('s includeInactive vrátí i neaktivní partnery', () => {
    const result = applyPartnerFilter(partneri, { includeInactive: true });
    expect(result.some((p) => p.id === neaktivni.id)).toBe(true);
  });

  it('hledá bez ohledu na velikost písmen v názvu', () => {
    const result = applyPartnerFilter(partneri, { search: 'lipnice' });
    expect(result.map((p) => p.name)).toEqual(['AgroFarma Lipnice s.r.o.']);
  });

  it('hledá i podle IČO', () => {
    const result = applyPartnerFilter(partneri, { search: '24729035' });
    expect(result.map((p) => p.name)).toEqual(['ČEZ Distribuce, a.s.']);
  });
});

describe('MockProjectRepository.ensureOverheadProject', () => {
  function repo(): MockProjectRepository {
    return createMockRepositories().projects as MockProjectRepository;
  }

  it('vrátí Režii, která už v datech je — nezaloží druhou', async () => {
    const r = repo();
    const prvni = await r.ensureOverheadProject('Igor Zahrádka');
    const druha = await r.ensureOverheadProject('Igor Zahrádka');

    expect(prvni.isOverhead).toBe(true);
    expect(druha.projectNumber).toBe(prvni.projectNumber);

    const vsechny = await r.list({ includeOverhead: true });
    expect(vsechny.filter((p) => p.isOverhead).length).toBe(1);
  });

  it('Režie se v běžném seznamu projektů neukazuje', async () => {
    const r = repo();
    const rezie = await r.ensureOverheadProject('Igor Zahrádka');
    const bezne = await r.list({});
    expect(bezne.some((p) => p.projectNumber === rezie.projectNumber)).toBe(false);
  });

  it('Režie nezvyšuje čítač projektů — další projekt dostane číslo, jako by nebyla', async () => {
    const repos = createMockRepositories();
    const pred = await repos.numbering.previewNextNumber('PRJ');
    await repos.projects.ensureOverheadProject('Igor Zahrádka');
    const po = await repos.numbering.previewNextNumber('PRJ');
    expect(po).toBe(pred);
  });
});

const overheadNumber = (): string => overheadProjectNumber(new Date().getFullYear());

describe('MockProjectRepository — omezení přístupu', () => {
  const admin: CurrentUser = { ...MOCK_USER, roles: [Role.Administrator] };
  const pm: CurrentUser = { ...MOCK_USER, roles: [Role.ProjektovyManazer] };

  it('Režie se zamyká hned při založení — nikdy není otevřená všem', async () => {
    const repos = createMockRepositories();
    // Ukázková data už Režii mají (a ta zůstává otevřená, jako na živém webu před omezením) —
    // smažeme ji, ať se zakládá znovu.
    await repos.projects.remove(overheadNumber(), admin);
    const rezie = await repos.projects.ensureOverheadProject('Igor Zahrádka');
    const stav = await repos.projects.getAccessState(rezie);

    expect(stav.recordRestricted).toBe(true);
    expect(stav.folderRestricted).toBe(true);
    expect(stav.allowed).toContain('PRM Administrátoři');
    expect(stav.allowed).not.toContain('PRM Projektoví manažeři');
  });

  it('běžný projekt je otevřený, dokud ho někdo neomezí', async () => {
    const repos = createMockRepositories();
    const projekty = await repos.projects.list({});
    const stav = await repos.projects.getAccessState(projekty[0]);
    expect(stav.recordRestricted).toBe(false);
    expect(stav.allowed).toEqual([]);
  });

  it('administrátor projekt omezí a stav to ukáže', async () => {
    const repos = createMockRepositories();
    const projekt = (await repos.projects.list({}))[0];
    await repos.projects.restrictAccess(projekt, admin, [
      { role: Role.Administrator, groupName: 'PRM Administrátoři', level: 'Administrator' }
    ]);
    const stav = await repos.projects.getAccessState(projekt);
    expect(stav.recordRestricted).toBe(true);
    expect(stav.allowed).toEqual(['PRM Administrátoři']);
  });

  it('projektový manažer přístup omezit nesmí, i kdyby tlačítko obešel', async () => {
    const repos = createMockRepositories();
    const projekt = (await repos.projects.list({}))[0];
    await expect(
      repos.projects.restrictAccess(projekt, pm, [
        { role: Role.Administrator, groupName: 'PRM Administrátoři', level: 'Administrator' }
      ])
    ).rejects.toThrow(/administrátor/);
    expect((await repos.projects.getAccessState(projekt)).recordRestricted).toBe(false);
  });
});

describe('Režie a číselná řada projektů', () => {
  it('Režie v ukázkových datech nevytlačí čítač na 999', () => {
    // Bez vyloučení Režie by seed skočil na 999 a další projekt by dostal 1000.
    const stav = seedProjectCounter();
    expect(stav.lastValue).toBeLessThan(900);
  });

  it('po Režii pokračuje řada normálně', async () => {
    const repos = createMockRepositories();
    const dalsi = await repos.numbering.previewNextNumber('PRJ');
    expect(/^\d{2}0\d{2}$/.test(dalsi)).toBe(true);
    expect(dalsi.slice(-3)).not.toBe('999');
  });

  it('založení Režie nezvýší čítač projektů', async () => {
    const repos = createMockRepositories();
    const pred = await repos.numbering.previewNextNumber('PRJ');
    await repos.projects.ensureOverheadProject('Igor Zahrádka');
    expect(await repos.numbering.previewNextNumber('PRJ')).toBe(pred);
  });

  it('číslo vyhrazené Režii se nesmí přidělit zakázce', () => {
    expect(() => assertNotOverheadNumber('26999')).toThrow(/vyhrazené projektu Režie/);
    expect(() => assertNotOverheadNumber('26007')).not.toThrow();
  });
});

describe('MockUserAdminRepository.ensureRoleGroups', () => {
  const mapping = {
    Administrator: 'PRM Administrátoři',
    Vedeni: 'PRM Vedení',
    Finance: 'PRM Finance – důvěrné',
    ProjektovyManazer: 'PRM Projektoví manažeři',
    AsistentPM: 'PRM Asistenti',
    Ctenar: 'PRM Čtenáři'
  };

  it('poprvé přidělí oprávnění všem šesti skupinám', async () => {
    const r = new MockUserAdminRepository();
    const vysledek = await r.ensureRoleGroups(mapping as never);
    expect(vysledek.granted.length).toBe(6);
  });

  it('podruhé už nic nepřiděluje — je idempotentní', async () => {
    const r = new MockUserAdminRepository();
    await r.ensureRoleGroups(mapping as never);
    const druhy = await r.ensureRoleGroups(mapping as never);
    expect(druhy.created).toEqual([]);
    expect(druhy.granted).toEqual([]);
  });

  it('administrátorům přidělí Úplné řízení a čtenářům Čtení', async () => {
    const r = new MockUserAdminRepository();
    const v = await r.ensureRoleGroups(mapping as never);
    const uroven = (nazev: string): string | undefined =>
      v.granted.filter((g) => g.groupName === nazev)[0]?.level;
    expect(uroven('PRM Administrátoři')).toBe('Úplné řízení');
    expect(uroven('PRM Projektoví manažeři')).toBe('Úpravy');
    expect(uroven('PRM Čtenáři')).toBe('Čtení');
  });
});

describe('MockProjectRepository.saveFolderMap', () => {
  const repo = (): MockProjectRepository => createMockRepositories().projects as MockProjectRepository;
  const admin: CurrentUser = { ...MOCK_USER, roles: [Role.Administrator] };
  const ctenar: CurrentUser = { ...MOCK_USER, loginName: 'cizi@revoltum.cz', roles: [Role.Ctenar] };
  const cislo = MOCK_PROJECTS[0].projectNumber;

  it('uloží mapu složek projektu a projekt si ji nese', async () => {
    const r = repo();
    const p = await r.saveFolderMap(cislo, { orders: '04-Nákup/Objednávky', diary: '05-Zápisy' }, admin);
    expect(p.folderMap).toEqual({ orders: '04-Nákup/Objednávky', diary: '05-Zápisy' });
    expect((await r.getByNumber(cislo))?.folderMap?.diary).toBe('05-Zápisy');
  });

  it('prázdná mapa znamená „projekt ji nemá“ (platí výchozí z Nastavení)', async () => {
    const r = repo();
    await r.saveFolderMap(cislo, { orders: 'x' }, admin);
    const p = await r.saveFolderMap(cislo, {}, admin);
    expect(p.folderMap).toBeUndefined();
  });

  it('cizí čtenář složky projektu měnit nesmí; neexistující projekt chyba', async () => {
    const r = repo();
    await expect(r.saveFolderMap(cislo, { orders: 'x' }, ctenar)).rejects.toThrow(/smí měnit/);
    await expect(r.saveFolderMap('99999', {}, admin)).rejects.toThrow(/nebyl nalezen/);
  });
});
