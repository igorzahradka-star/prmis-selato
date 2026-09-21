import { MockNumberingRepository, applyPartnerFilter } from './mockRepositories';
import { DEFAULT_DOC_TYPES, MOCK_PARTNERS } from './mockData';
import { PartnerType } from '../../core/types';

describe('MockNumberingRepository', () => {
  it('přidělí číslo podle vzoru dané řady', async () => {
    const repo = new MockNumberingRepository();
    const cislo = await repo.allocateNumber('PRJ', { date: new Date(2026, 8, 21) });
    expect(cislo).toBe('26-001');
  });

  it('další volání ve stejném roce pokračuje v řadě', async () => {
    const repo = new MockNumberingRepository();
    const datum = new Date(2026, 8, 21);
    await repo.allocateNumber('PRJ', { date: datum });
    const druhe = await repo.allocateNumber('PRJ', { date: datum });
    expect(druhe).toBe('26-002');
  });

  it('řada v rámci projektu (PP) počítá zvlášť pro každý projekt', async () => {
    const repo = new MockNumberingRepository();
    const a1 = await repo.allocateNumber('PP', { projectNumber: '26-001' });
    const b1 = await repo.allocateNumber('PP', { projectNumber: '26-002' });
    const a2 = await repo.allocateNumber('PP', { projectNumber: '26-001' });
    expect(a1).toBe('PP-26-001-01');
    expect(b1).toBe('PP-26-002-01');
    expect(a2).toBe('PP-26-001-02');
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
      return `26-${'0'.repeat(Math.max(0, 3 - cislo.length))}${cislo}`;
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
