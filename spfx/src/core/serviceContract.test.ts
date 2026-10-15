import { SERVICE_CATALOG as CAT } from './serviceCatalog.data';
import { evaluateChecklist, SiteChecklist } from './serviceCatalog';
import {
  assetsFromDevices,
  checklistSections,
  ContractInput,
  describeChanges,
  hasBlockingError,
  isPlaceholder,
  newVersionProblem,
  nextContractNumber,
  nextStatuses,
  nextVersionNo,
  slaTable,
  snapshotActivities,
  statusChangeProblem,
  statusesAfterSigning,
  sumPriceRows,
  validateContract,
  versionLabel
} from './serviceContract';
import { ServiceDevice } from './service';

const CHECKLIST: SiteChecklist = {
  flags: ['vn_pripojeni', 'trafo_olejove', 'rizeni_pds', 'ups', 'oploceni', 'ezs', 'cctv', 'hasici_pristroje', 'osvetleni', 'travni_porost', 'meteostanice', 'bankovni_financovani', 'fve_pozemni', 'stridace_stringove', 'bess_kapalinove_chlazeni', 'bess_hasici_system', 'bess_detekce_plynu', 'bess_agregator', 'f_plyny'],
  modules: ['KOREKTIVA', 'ND', 'TECHMGMT', 'AREAL', 'BEZPECNOST', 'IT_OT'],
  disabled: [],
  enabled: [],
  periods: {}
};

/** Smlouva Mastířovice podle ukázkového vstupu (údaje, které v ukázce chybí, jsou doplněné). */
function example(): ContractInput {
  const items = evaluateChecklist(CAT, CHECKLIST, ['FVE', 'BESS']);
  return {
    smlouva: { cislo: 'RES-OM-2026-001' },
    objednatel: { nazev: 'Sunset Terrace s.r.o.', sidlo: 'Praha', ico: '12345678', zastoupen: 'Jan Novák, jednatel', podpis_jmeno: 'Jan Novák' },
    zhotovitel: { nazev: 'Revoltum Engineering & Services, s.r.o.', sidlo: 'Havlířská 1021, 568 01 Havlíčkův Brod', ico: '29713536', zastoupen: 'Karel Dvořák, jednatel', dispecink_tel: '+420 111 222 333' },
    asset_manager: { nazev: 'Revoltum a.s.', ico: '11111111', sidlo: 'Praha' },
    banka: { nazev: 'Banka', ico: '22222222' },
    volby: { skupina_revoltum: true, penale: false, bankovni_ujednani: true },
    parametry: { doba_let: 10, prodlouzeni_let: 1, vypovedni_lhuta_mesicu: 6, fakturace: 'čtvrtletně zpětně', splatnost_dni: 30, indexace_den: '1. lednu', indexace_prvni: '1. 1. 2028', limit_odpovednosti_pct: 100, pojisteni_mil_kc: 10, zaruka_prace_mesicu: 24, limit_bez_schvaleni_kc: 50000, servisni_zpravy_dni: 10, predani_mesicu: 3, planovana_udrzba_h_rok: 48, penale_dostupnost_pct: 2, penale_p1_kc_hod: 2000, penale_cap_pct: 20 },
    sazebnik: [{ polozka: 'Servisní technik', jednotka: 'hod', cena: 850 }],
    autorizace_oem: [{ vyrobce: 'ABC Energy', rozsah: 'Servis BESS', doklad: 'č. 1/2026', platnost_do: '2030-12-31' }],
    servisni_partneri: [],
    kontakty: [],
    eskalace: [],
    lokality: [
      {
        kod: '10500', nazev: 'Mastířovice', priloha_cislo: '1', verze: '1.0',
        priznaky: CHECKLIST.flags, moduly: CHECKLIST.modules, cinnosti_vypnute: [], cinnosti_zapnute: [], perioda_override: {},
        assety: [
          { kod: '10501', typ: 'FVE', nazev: 'Mastířovice I.', parametry: '4 950 kWp', vyrobce_oem: 'Střídače s.r.o.' },
          { kod: '10502', typ: 'BESS', nazev: 'Mastířovice II.', parametry: '25 644 kWh', vyrobce_oem: 'ABC Energy' }
        ],
        cinnosti: snapshotActivities(items),
        cena: { radky: [{ polozka: 'FVE', zaklad: '4 950 kWp', jednotkova: '75 Kč/kWp', rocne: 371250 }, { polozka: 'BESS', zaklad: '25 644 kWh', jednotkova: '18 Kč/kWh', rocne: 461592 }], celkem: 832842 },
        nd: [{ polozka: 'Bateriový modul', asset: '10502', mnozstvi: '2', umisteni: 'sklad' }],
        kontakty: [], zvlastni_ujednani: []
      }
    ]
  };
}

const clone = (c: ContractInput): ContractInput => JSON.parse(JSON.stringify(c)) as ContractInput;
const codes = (c: ContractInput): string[] => validateContract(CAT, c).map((i) => i.code);

describe('číslování a verze', () => {
  it('číslo smlouvy = číslo lokality + pořadí', () => {
    expect(nextContractNumber('10500', [])).toBe('10500-01');
    expect(nextContractNumber('10500', ['10500-01', '10500-02', '10510-07'])).toBe('10500-03');
    expect(nextContractNumber('10510', ['10500-01'])).toBe('10510-01');
  });

  it('označení a pořadí verzí', () => {
    expect(versionLabel(2)).toBe('2.0');
    expect(nextVersionNo([])).toBe(1);
    expect(nextVersionNo([{ versionNo: 1, kind: 'Smlouva', status: 'Podepsaná' }, { versionNo: 2, kind: 'Dodatek', status: 'Návrh' }])).toBe(3);
  });

  it('nová verze až k podepsané a jen když není rozpracovaná jiná', () => {
    expect(newVersionProblem([])).not.toBe('');
    expect(newVersionProblem([{ versionNo: 1, kind: 'Smlouva', status: 'Návrh' }])).toMatch(/rozpracovaná/);
    expect(newVersionProblem([{ versionNo: 1, kind: 'Smlouva', status: 'Nahrazená' }])).toMatch(/podepsané/);
    expect(newVersionProblem([{ versionNo: 1, kind: 'Smlouva', status: 'Podepsaná' }])).toBe('');
  });

  it('přechody stavů a podpis nahradí předchozí verzi', () => {
    expect(nextStatuses('Návrh')).toEqual(['K podpisu']);
    expect(nextStatuses('Podepsaná')).toEqual([]);
    expect(statusChangeProblem('Návrh', 'Podepsaná', [])).toMatch(/nejde přejít/);
    expect(statusChangeProblem('K podpisu', 'Podepsaná', [])).toBe('');
    expect(statusesAfterSigning([{ versionNo: 1, kind: 'Smlouva', status: 'Podepsaná' }, { versionNo: 2, kind: 'Dodatek', status: 'K podpisu' }], 2)).toEqual({ 1: 'Nahrazená', 2: 'Podepsaná' });
  });

  it('k podpisu nejde smlouva s chybou ani s chybějícími údaji, s varováním jde', () => {
    expect(statusChangeProblem('Návrh', 'K podpisu', [{ code: 'X', severity: 'chyba', message: 'a' }])).toMatch(/nevyřešených/);
    expect(statusChangeProblem('Návrh', 'K podpisu', [{ code: 'X', severity: 'doplnit', message: 'a' }])).toMatch(/nevyřešených/);
    expect(statusChangeProblem('Návrh', 'K podpisu', [{ code: 'X', severity: 'varování', message: 'a' }])).toBe('');
  });
});

describe('přílohy, SLA a checklist', () => {
  it('soubory se převedou na assety a „Jiné“ se vynechá', () => {
    const d = (number: string, kind: string, isActive = true): ServiceDevice => ({ id: 1, number, siteNumber: '10500', name: `Soubor ${number}`, kind, isActive, oemVendor: 'ABC' });
    const assets = assetsFromDevices([d('10503', 'Kogenerace'), d('10501', 'FVE'), d('10502', 'Jiné'), d('10504', 'BESS', false)]);
    expect(assets.map((a) => [a.kod, a.typ])).toEqual([['10501', 'FVE'], ['10503', 'ENC']]);
    expect(assets[0].vyrobce_oem).toBe('ABC');
  });

  it('SLA profil Standard splňuje požadavek banky a úpravy lokality se uplatní', () => {
    const s = slaTable(CAT, undefined, undefined);
    expect(s.casy.P1.odstraneni_h).toBe(72);
    expect(s.radky.map((r) => r.kod)).toEqual(['P1', 'P2', 'P3', 'P4']);
    expect(slaTable(CAT, 'STANDARD', { P1: { odstraneni_h: 96 } }).casy.P1.odstraneni_h).toBe(96);
    expect(CAT.sla.profily.STANDARD.casy.P1.odstraneni_h).toBe(72);
  });

  it('sekce checklistu jsou po typech zařízení a mají 73 činností', () => {
    const items = evaluateChecklist(CAT, CHECKLIST, ['FVE', 'BESS']);
    const sections = checklistSections(CAT, items, example().lokality[0].assety);
    expect(sections.map((s) => s.typ)).toEqual(['LOK', 'BOP', 'FVE', 'BESS']);
    expect(sections.reduce((n, s) => n + s.polozky.length, 0)).toBe(73);
    expect(sections[3].nadpis).toContain('10502');
    expect(sections[0].polozky[0].rezim).toMatch(/^[PME]$/);
  });

  it('součet cen', () => {
    expect(sumPriceRows(example().lokality[0].cena.radky)).toBe(832842);
  });
});

describe('kontroly smlouvy', () => {
  it('Mastířovice z ukázky: žádné chyby ani varování', () => {
    expect(validateContract(CAT, example())).toEqual([]);
  });

  it('banka: P1 delší než 72 h je chyba', () => {
    const c = clone(example());
    c.lokality[0].sla_override = { P1: { odstraneni_h: 96 } };
    expect(codes(c)).toEqual(['BANKA_P1_72H']);
    expect(hasBlockingError(validateContract(CAT, c))).toBe(true);
    c.lokality[0].priznaky = c.lokality[0].priznaky.filter((f) => f !== 'bankovni_financovani');
    expect(codes(c)).toEqual([]);
  });

  it('banka: doba kratší než 10 let je chyba', () => {
    const c = clone(example());
    c.parametry.doba_let = 8;
    expect(codes(c)).toEqual(['BANKA_DOBA_10']);
  });

  it('BESS bez autorizace OEM je chyba, porovnání ignoruje velikost písmen a části názvu', () => {
    const c = clone(example());
    c.autorizace_oem = [];
    expect(codes(c)).toEqual(['BESS_AUTORIZACE']);
    c.autorizace_oem = [{ vyrobce: 'abc energy europe', rozsah: 'x', doklad: 'y', platnost_do: 'z' }];
    expect(codes(c)).toEqual([]);
    c.lokality[0].assety[1].vyrobce_oem = '';
    expect(codes(c)).toEqual(['BESS_AUTORIZACE']);
  });

  it('varování: chybí bankovní ujednání, ND u BESS a penále ve skupině', () => {
    const c = clone(example());
    c.volby.bankovni_ujednani = false;
    c.lokality[0].nd = [];
    c.volby.penale = true;
    expect(codes(c).sort()).toEqual(['BANKA_UJEDNANI', 'BESS_ND', 'PENALE_SKUPINA']);
    expect(hasBlockingError(validateContract(CAT, c))).toBe(false);
  });

  it('chybějící údaje a vzory v hranatých závorkách se hlásí jako „doplnit“', () => {
    const c = clone(example());
    c.objednatel.sidlo = '[SÍDLO SPV]';
    c.zhotovitel.dispecink_tel = '';
    c.lokality[0].assety = [];
    const issues = validateContract(CAT, c);
    expect(issues.map((i) => i.code).sort()).toEqual(['ASSETY_CHYBI', 'OBJ_SIDLO', 'ZHO_DISPECINK']);
    expect(issues.every((i) => i.severity === 'doplnit')).toBe(true);
    expect(isPlaceholder('[DATUM]')).toBe(true);
    expect(isPlaceholder('Praha')).toBe(false);
  });
});

describe('změny mezi verzemi', () => {
  it('beze změny nic nehlásí', () => {
    expect(describeChanges(example(), example(), CAT)).toEqual([]);
  });

  it('přidání a odebrání souboru, změna ceny, činnosti a periody', () => {
    const a = example();
    const b = clone(a);
    b.lokality[0].assety.push({ kod: '10503', typ: 'FVE', nazev: 'Mastířovice III.' });
    b.lokality[0].assety = b.lokality[0].assety.filter((x) => x.kod !== '10501');
    b.lokality[0].cena.celkem = 900000;
    const cin = b.lokality[0].cinnosti || [];
    const removed = cin[0];
    b.lokality[0].cinnosti = cin.slice(1);
    const changed = (b.lokality[0].cinnosti || [])[0];
    changed.perioda = changed.perioda === '60M' ? '12M' : '60M';
    const text = describeChanges(a, b, CAT).join('\n');
    expect(text).toContain('Přidán soubor 10503');
    expect(text).toContain('Odebrán soubor 10501');
    expect(text).toContain('Změněna roční cena lokality 10500');
    expect(text).toContain(`Odebrána činnost ${removed.id}`);
    expect(text).toContain(`Změněna perioda činnosti ${changed.id}`);
  });

  it('změna parametru, volby, sazebníku a objednatele', () => {
    const a = example();
    const b = clone(a);
    b.parametry.splatnost_dni = 45;
    b.volby.penale = true;
    b.sazebnik[0].cena = 900;
    b.objednatel.nazev = 'Jiná s.r.o.';
    const text = describeChanges(a, b, CAT).join('\n');
    expect(text).toContain('Změněn parametr splatnost_dni: 30 → 45');
    expect(text).toContain('Změněna volba penale: ne → ano');
    expect(text).toContain('Změněn sazebník');
    expect(text).toContain('Změněn objednatel');
  });
});
