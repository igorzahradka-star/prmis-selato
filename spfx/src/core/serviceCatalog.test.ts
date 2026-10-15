import {
  activeItems,
  activeModules,
  cleanChecklist,
  evaluateChecklist,
  flagGroups,
  isEmptyChecklist,
  parseChecklist,
  serializeChecklist,
  setActivityActive,
  setActivityPeriod,
  SiteChecklist,
  siteAssetTypes,
  summarizeChecklist,
  toggleFlag,
  toggleModule
} from './serviceCatalog';
import { SERVICE_CATALOG as CAT } from './serviceCatalog.data';

/** Příznaky a moduly lokality Mastířovice z ukázkového vstupu smlouvy (priklad_vstup_smlouvy.json). */
const MASTIROVICE: SiteChecklist = {
  flags: ['vn_pripojeni', 'trafo_olejove', 'rizeni_pds', 'ups', 'oploceni', 'ezs', 'cctv', 'hasici_pristroje', 'osvetleni', 'travni_porost', 'meteostanice', 'bankovni_financovani', 'fve_pozemni', 'stridace_stringove', 'bess_kapalinove_chlazeni', 'bess_hasici_system', 'bess_detekce_plynu', 'bess_agregator', 'f_plyny'],
  modules: ['KOREKTIVA', 'ND', 'TECHMGMT', 'AREAL', 'BEZPECNOST', 'IT_OT'],
  disabled: [],
  enabled: [],
  periods: {}
};

/** Nezávislý zápis pravidel z `vyber_cinnosti` (render_smlouvy.py) — srovnává se s `activeItems`. */
function referenceSelection(c: SiteChecklist, types: string[]): string[] {
  const modules = ['ZAKLAD'].concat(c.modules);
  return CAT.cinnosti
    .filter((a) => types.indexOf(a.asset) >= 0 && modules.indexOf(a.modul) >= 0)
    .filter((a) => a.aktivace.every((x) => x.split('|').some((f) => c.flags.indexOf(f) >= 0)))
    .filter((a) => c.disabled.indexOf(a.id) < 0 && (a.vychozi_zapnuto || c.enabled.indexOf(a.id) >= 0))
    .map((a) => a.id);
}

describe('katalog činností', () => {
  it('obsahuje 101 činností s jedinečným číslem a známými odkazy', () => {
    expect(CAT.cinnosti).toHaveLength(101);
    expect(new Set(CAT.cinnosti.map((c) => c.id)).size).toBe(101);
    CAT.cinnosti.forEach((c) => {
      expect(CAT.typy_assetu[c.asset]).toBeDefined();
      expect(CAT.moduly[c.modul]).toBeDefined();
      expect(CAT.periodicity[c.perioda]).toBeDefined();
      c.aktivace.forEach((a) => a.split('|').forEach((f) => expect(CAT.priznaky[f]).toBeDefined()));
    });
  });
});

describe('výběr činností', () => {
  it('shoduje se s referenčním generátorem pro Mastířovice (FVE + BESS)', () => {
    const items = activeItems(CAT, MASTIROVICE, ['FVE', 'BESS']);
    expect(items.map((i) => i.activity.id).sort()).toEqual(referenceSelection(MASTIROVICE, ['LOK', 'BOP', 'FVE', 'BESS']).sort());
    expect(items.length).toBeGreaterThan(40);
  });

  it('bez souboru BESS nenabízí činnosti BESS a bez příznaků a modulů nic navíc', () => {
    const items = evaluateChecklist(CAT, { flags: [], modules: [], disabled: [], enabled: [], periods: {} }, ['FVE']);
    expect(items.every((i) => ['LOK', 'BOP', 'FVE'].indexOf(i.activity.asset) >= 0)).toBe(true);
    const bez = activeItems(CAT, { flags: [], modules: [], disabled: [], enabled: [], periods: {} }, ['FVE']);
    expect(bez.every((i) => i.activity.modul === 'ZAKLAD' && i.activity.aktivace.length === 0)).toBe(true);
  });

  it('typy zařízení: Kogenerace je energocentrum, Jiné nemá katalog', () => {
    expect(siteAssetTypes(['FVE', 'Kogenerace', 'Jiné', 'FVE'])).toEqual(['LOK', 'BOP', 'FVE', 'ENC']);
  });

  it('činnost bez příznaku nebo modulu je nedostupná s důvodem', () => {
    const items = evaluateChecklist(CAT, { flags: [], modules: [], disabled: [], enabled: [], periods: {} }, ['BESS']);
    const bezModulu = items.filter((i) => !i.available);
    expect(bezModulu.length).toBeGreaterThan(0);
    bezModulu.forEach((i) => expect(i.unavailableReason).toMatch(/^Vyžaduje (modul|příznak)/));
    expect(bezModulu.every((i) => !i.active)).toBe(true);
  });

  it('základní modul je vždy aktivní', () => {
    expect(activeModules({ ...MASTIROVICE, modules: ['ND'] })).toEqual(['ZAKLAD', 'ND']);
  });
});

describe('ruční úpravy checklistu', () => {
  const act = CAT.cinnosti.filter((c) => c.vychozi_zapnuto && c.modul === 'ZAKLAD' && c.aktivace.length === 0 && c.asset === 'LOK' && c.perioda_nastavitelna)[0];
  const off = CAT.cinnosti.filter((c) => !c.vychozi_zapnuto)[0];

  it('vypnutí a zapnutí činnosti, která je výchozně zapnutá', () => {
    const vyp = setActivityActive(MASTIROVICE, act, false);
    expect(vyp.disabled).toEqual([act.id]);
    expect(activeItems(CAT, vyp, ['FVE', 'BESS']).some((i) => i.activity.id === act.id)).toBe(false);
    const zap = setActivityActive(vyp, act, true);
    expect(zap.disabled).toEqual([]);
    expect(activeItems(CAT, zap, ['FVE', 'BESS']).some((i) => i.activity.id === act.id)).toBe(true);
  });

  it('činnost vypnutá ve výchozím stavu se zapíná do `enabled`', () => {
    const base = { ...MASTIROVICE, flags: MASTIROVICE.flags.concat(off.aktivace.join('|').split('|')) };
    const types = [off.asset === 'LOK' || off.asset === 'BOP' ? 'FVE' : off.asset === 'ENC' ? 'Kogenerace' : off.asset];
    const zap = setActivityActive(base, off, true);
    expect(zap.enabled).toEqual([off.id]);
    expect(setActivityActive(zap, off, false).enabled).toEqual([]);
    expect(evaluateChecklist(CAT, zap, types).filter((i) => i.activity.id === off.id).every((i) => !i.available || i.active)).toBe(true);
  });

  it('perioda se mění jen u nastavitelných činností a návrat na výchozí ji odstraní', () => {
    const jina = act.perioda === '6M' ? '12M' : '6M';
    const c1 = setActivityPeriod(MASTIROVICE, act, jina);
    expect(c1.periods[act.id]).toBe(jina);
    const item = evaluateChecklist(CAT, c1, ['FVE']).filter((i) => i.activity.id === act.id)[0];
    expect(item.period).toBe(jina);
    expect(item.periodChanged).toBe(true);
    expect(setActivityPeriod(c1, act, act.perioda).periods).toEqual({});
    const pevna = CAT.cinnosti.filter((c) => !c.perioda_nastavitelna)[0];
    expect(setActivityPeriod(MASTIROVICE, pevna, '60M')).toBe(MASTIROVICE);
  });

  it('příznak a modul se přepínají bez duplicit', () => {
    const c = toggleFlag(toggleFlag(MASTIROVICE, 'eps', true), 'eps', true);
    expect(c.flags.filter((f) => f === 'eps')).toHaveLength(1);
    expect(toggleFlag(c, 'eps', false).flags).not.toContain('eps');
    expect(toggleModule(MASTIROVICE, 'MYTI', true).modules).toContain('MYTI');
    expect(toggleModule(MASTIROVICE, 'ND', false).modules).not.toContain('ND');
  });

  it('shrnutí počítá činnosti podle zahrnutí', () => {
    const s = summarizeChecklist(evaluateChecklist(CAT, MASTIROVICE, ['FVE', 'BESS']));
    expect(s.total).toBe(s.pausal + s.modul + s.extra);
    expect(s.bankCritical).toBeGreaterThan(0);
  });
});

describe('skupiny příznaků', () => {
  it('nabízí skupinu jen pro typy zařízení lokality', () => {
    const titles = flagGroups(CAT, ['FVE']).map((g) => g.title);
    expect(titles).toContain('Fotovoltaická elektrárna');
    expect(titles).not.toContain('Bateriové úložiště');
    expect(flagGroups(CAT, ['FVE', 'BESS']).map((g) => g.title)).toContain('Bateriové úložiště');
  });

  it('každý příznak katalogu je v právě jedné skupině při všech typech', () => {
    const all = flagGroups(CAT, ['FVE', 'BESS', 'MVE', 'Kogenerace']).reduce<string[]>((a, g) => a.concat(g.flags), []);
    expect(new Set(all).size).toBe(all.length);
    expect(all.filter((f) => !/^vte_/.test(f)).length).toBe(Object.keys(CAT.priznaky).filter((f) => !/^vte_/.test(f)).length);
  });
});

describe('uložení checklistu', () => {
  it('projde tam a zpět a nečitelný text dá prázdný checklist', () => {
    const c = setActivityPeriod(MASTIROVICE, CAT.cinnosti.filter((x) => x.perioda_nastavitelna)[0], '60M');
    expect(parseChecklist(serializeChecklist(c))).toEqual({ ...c, slaProfile: undefined });
    expect(isEmptyChecklist(parseChecklist('nesmysl{'))).toBe(true);
    expect(isEmptyChecklist(parseChecklist(undefined))).toBe(true);
  });

  it('cleanChecklist zahodí neznámé položky', () => {
    const c = cleanChecklist(CAT, { flags: ['ezs', 'neexistuje'], modules: ['ND', 'XYZ', 'ZAKLAD'], disabled: ['LOK-001', 'NEEXISTUJE'], enabled: [], periods: { 'LOK-001': 'ZZ' }, slaProfile: 'NIC' });
    expect(c.flags).toEqual(['ezs']);
    expect(c.modules).toEqual(['ND']);
    expect(c.disabled).toEqual(['LOK-001']);
    expect(c.periods).toEqual({});
    expect(c.slaProfile).toBeUndefined();
  });
});

describe('shoda s ukázkou smlouvy RES-OM-2026-001', () => {
  /** Činnosti lokality 10500 z checklist_10500.json, který vygeneroval referenční generátor (složka UKAZKA OM smlouvy). */
  const UKAZKA_IDS: string[] = ["LOK-001","LOK-002","LOK-003","LOK-004","LOK-005","LOK-006","LOK-007","LOK-008","LOK-009","LOK-010","LOK-011","LOK-012","LOK-013","MON-001","MON-002","MON-003","MON-004","MON-005","MON-006","IT-001","IT-002","IT-003","IT-004","IT-005","BOP-001","BOP-002","BOP-003","BOP-004","BOP-005","BOP-006","BOP-007","BOP-009","BOP-010","BOP-011","BOP-013","BOP-015","FVE-001","FVE-002","FVE-005","FVE-006","FVE-008","FVE-011","FVE-013","BESS-001","BESS-002","BESS-003","BESS-004","BESS-005","BESS-006","BESS-007","BESS-008","BESS-009","BESS-010","BESS-011","BESS-012","BESS-014","BESS-015","BESS-016","BESS-017","BESS-018","BESS-019","BESS-020","BESS-021","BESS-022","BESS-023","BESS-024","BEZ-001","BEZ-002","BEZ-003","BEZ-004","BEZ-006","ARE-001","ARE-002"];

  it('Mastířovice (FVE + BESS) mají stejných 73 činností jako referenční generátor', () => {
    const ids = activeItems(CAT, MASTIROVICE, ['FVE', 'BESS']).map((i) => i.activity.id);
    expect(ids).toHaveLength(73);
    expect(ids.slice().sort()).toEqual(UKAZKA_IDS.slice().sort());
  });
});
