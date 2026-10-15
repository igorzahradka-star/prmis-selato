import { evaluateChecklist, SiteChecklist } from './serviceCatalog';
import { SERVICE_CATALOG as CAT } from './serviceCatalog.data';
import { newPlanItemsOnly, occurrenceMonths, planFromChecklist, planTargetKey, templatesFromCatalog } from './servicePlanCatalog';
import { DEFAULT_PLAN_TEMPLATES, validatePlanTemplates } from './servicePlan';

const CHECKLIST: SiteChecklist = {
  flags: ['vn_pripojeni', 'trafo_olejove', 'rizeni_pds', 'ups', 'oploceni', 'ezs', 'cctv', 'hasici_pristroje', 'osvetleni', 'travni_porost', 'meteostanice', 'bankovni_financovani', 'fve_pozemni', 'stridace_stringove', 'bess_kapalinove_chlazeni', 'bess_hasici_system', 'bess_detekce_plynu', 'bess_agregator', 'f_plyny'],
  modules: ['KOREKTIVA', 'ND', 'TECHMGMT', 'AREAL', 'BEZPECNOST', 'IT_OT'],
  disabled: [],
  enabled: [],
  periods: {}
};
const DEVICES = [{ number: '10501', kind: 'FVE' }, { number: '10502', kind: 'BESS' }];

describe('měsíce činností podle periody', () => {
  it('ročně, pololetně, čtvrtletně a měsíčně', () => {
    expect(occurrenceMonths(CAT, '12M', 0)).toEqual([1]);
    expect(occurrenceMonths(CAT, '12M', 3)).toEqual([4]);
    expect(occurrenceMonths(CAT, '12M', 14)).toEqual([3]);
    expect(occurrenceMonths(CAT, '6M', 2)).toEqual([3, 9]);
    expect(occurrenceMonths(CAT, '3M', 0)).toEqual([1, 4, 7, 10]);
    expect(occurrenceMonths(CAT, '3M', 5)).toEqual([3, 6, 9, 12]);
    expect(occurrenceMonths(CAT, '1M', 4)).toHaveLength(12);
  });

  it('periody delší než rok se plánují jen v příslušném roce', () => {
    expect(occurrenceMonths(CAT, '24M', 2, 0)).toEqual([3]);
    expect(occurrenceMonths(CAT, '24M', 2, 1)).toEqual([]);
    expect(occurrenceMonths(CAT, '24M', 2, 2)).toEqual([3]);
    expect(occurrenceMonths(CAT, '60M', 0, 5)).toEqual([1]);
    expect(occurrenceMonths(CAT, '60M', 0, 4)).toEqual([]);
  });

  it('kontinuální, denní, týdenní, sezónní a nárazové činnosti se do plánu nezařazují', () => {
    ['KONT', 'D', 'T', 'SEZ', 'NP', 'UVOD', 'NEZNAMA'].forEach((p) => expect(occurrenceMonths(CAT, p, 0)).toEqual([]));
  });
});

describe('šablony z katalogu', () => {
  const templates = templatesFromCatalog(CAT);

  it('jsou pro FVE, BESS, MVE a lokalitu (kogenerace má činnosti jen podle příznaků, proto jen z checklistu) a projdou kontrolou šablon', () => {
    expect(templates.map((t) => t.kind)).toEqual(['FVE', 'BESS', 'MVE', 'Lokalita']);
    expect(validatePlanTemplates(templates)).toEqual([]);
    expect(DEFAULT_PLAN_TEMPLATES).toEqual(templates);
  });

  it('obsahují jen činnosti základního servisu bez podmínky na příznak, měsíce 1–12, řazené podle měsíce', () => {
    const known = new Set(CAT.cinnosti.filter((a) => a.modul === 'ZAKLAD' && a.aktivace.length === 0).map((a) => a.nazev));
    templates.forEach((t) => {
      expect(t.items.length).toBeGreaterThan(0);
      t.items.forEach((i) => {
        expect(known.has(i.title)).toBe(true);
        expect(i.month).toBeGreaterThanOrEqual(1);
        expect(i.month).toBeLessThanOrEqual(12);
      });
      expect(t.items.map((i) => i.month)).toEqual(t.items.map((i) => i.month).sort((a, b) => a - b));
    });
  });
});

describe('plán z checklistu lokality', () => {
  const items = evaluateChecklist(CAT, CHECKLIST, ['FVE', 'BESS']);
  const plan = planFromChecklist(CAT, items, DEVICES, { siteNumber: '10500', year: 2026 });

  it('činnosti lokality jdou na lokalitu, činnosti zařízení na soubory jejich typu', () => {
    expect(plan.length).toBeGreaterThan(50);
    const byAsset = (asset: string): Set<string | undefined> => new Set(plan.filter((p) => CAT.cinnosti.some((a) => a.nazev === p.title && a.asset === asset)).map((p) => p.deviceNumber));
    expect(Array.from(byAsset('LOK'))).toEqual([undefined]);
    expect(Array.from(byAsset('FVE'))).toEqual(['10501']);
    expect(Array.from(byAsset('BESS'))).toEqual(['10502']);
    expect(plan.every((p) => p.siteNumber === '10500' && p.year === 2026 && p.month >= 1 && p.month <= 12)).toBe(true);
  });

  it('činnost účtovaná zvlášť je nahodilá, ostatní plánované', () => {
    const extra = CAT.cinnosti.filter((a) => a.zahrnuti === 'EXTRA' && a.perioda === '12M' && a.asset === 'FVE')[0];
    if (extra) {
      expect(plan.filter((p) => p.title === extra.nazev).every((p) => p.jobKind === 'Nahodilá')).toBe(true);
    }
    expect(plan.some((p) => p.jobKind === 'Plánovaná')).toBe(true);
  });

  it('dva soubory stejného typu dostanou každý své činnosti; neaktivní soubor žádné', () => {
    const fveOnly = (devs: { number: string; kind: string; isActive?: boolean }[]): number =>
      planFromChecklist(CAT, items, devs, { siteNumber: '10500', year: 2026 }).filter((p) => p.deviceNumber === '10501' || p.deviceNumber === '10503').length;
    const one = fveOnly([{ number: '10501', kind: 'FVE' }]);
    expect(fveOnly([{ number: '10501', kind: 'FVE' }, { number: '10503', kind: 'FVE' }])).toBe(one * 2);
    expect(fveOnly([{ number: '10501', kind: 'FVE', isActive: false }])).toBe(0);
  });

  it('vypnutá činnost v plánu není', () => {
    const first = items.filter((i) => i.active && i.activity.asset === 'LOK' && occurrenceMonths(CAT, i.period, 0).length > 0)[0];
    const vypnuta = items.map((i) => (i === first ? { ...i, active: false } : i));
    const p2 = planFromChecklist(CAT, vypnuta, DEVICES, { siteNumber: '10500', year: 2026 });
    expect(p2.some((p) => p.title === first.activity.nazev)).toBe(false);
    expect(plan.some((p) => p.title === first.activity.nazev)).toBe(true);
  });

  it('činnosti s periodou delší než rok jsou jen v příslušných letech smlouvy', () => {
    const multi = items.filter((i) => i.active && ['24M', '36M', '48M', '60M'].indexOf(i.period) >= 0);
    expect(multi.length).toBeGreaterThan(0);
    const y0 = planFromChecklist(CAT, items, DEVICES, { siteNumber: '10500', year: 2026, startYear: 2026 }).length;
    const y1 = planFromChecklist(CAT, items, DEVICES, { siteNumber: '10500', year: 2027, startYear: 2026 }).length;
    expect(y1).toBeLessThan(y0);
  });
});

describe('přidání do plánu bez duplicit', () => {
  it('vynechá položky, které v plánu už jsou', () => {
    const cand = [
      { year: 2026, siteNumber: '10500', deviceNumber: '10501', month: 3, title: 'Kontrola', jobKind: 'Plánovaná' },
      { year: 2026, siteNumber: '10500', deviceNumber: '10501', month: 4, title: 'Kontrola', jobKind: 'Plánovaná' }
    ];
    const existing = [{ id: 1, year: 2026, siteNumber: '10500', deviceNumber: '10501', month: 3, title: ' kontrola ', jobKind: 'Plánovaná' }];
    expect(newPlanItemsOnly(existing, cand)).toEqual([cand[1]]);
    expect(newPlanItemsOnly([], cand)).toHaveLength(2);
  });
});

describe('výběr, co z checklistu do plánu nahrát', () => {
  const items = evaluateChecklist(CAT, CHECKLIST, ['FVE', 'BESS']);
  const all = planFromChecklist(CAT, items, DEVICES, { siteNumber: '10500', year: 2026 });
  const count = (key: string): number => all.filter((p) => planTargetKey(p.deviceNumber) === key).length;

  it('klíč cíle: společné činnosti lokality = site, jinak číslo souboru', () => {
    expect(planTargetKey(undefined)).toBe('site');
    expect(planTargetKey('10501')).toBe('10501');
  });

  it('jen společné činnosti, jen jeden soubor, nebo kombinace; součet odpovídá celku', () => {
    const only = (keys: string[]) => planFromChecklist(CAT, items, DEVICES, { siteNumber: '10500', year: 2026, only: keys });
    expect(only(['site'])).toHaveLength(count('site'));
    expect(only(['10501'])).toHaveLength(count('10501'));
    expect(only(['10502'])).toHaveLength(count('10502'));
    expect(only(['site', '10501'])).toHaveLength(count('site') + count('10501'));
    expect(count('site') + count('10501') + count('10502')).toBe(all.length);
    expect(only([])).toEqual([]);
  });

  it('činnosti zařízení jdou jen na soubory stejného typu (BESS ne na FVE a naopak)', () => {
    const fve = new Set(CAT.cinnosti.filter((a) => a.asset === 'FVE').map((a) => a.nazev));
    const bess = new Set(CAT.cinnosti.filter((a) => a.asset === 'BESS').map((a) => a.nazev));
    all.filter((p) => p.deviceNumber === '10501').forEach((p) => expect(bess.has(p.title) && !fve.has(p.title)).toBe(false));
    all.filter((p) => p.deviceNumber === '10502').forEach((p) => expect(fve.has(p.title) && !bess.has(p.title)).toBe(false));
  });
});
