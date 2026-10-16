import { SERVICE_CATALOG as CAT } from './serviceCatalog.data';
import { evaluateChecklist, SiteChecklist } from './serviceCatalog';
import {
  activeVersion,
  assetsFromDevices,
  buildContractInput,
  checklistSections,
  contractStatusChange,
  contractCoverage,
  contractSummary,
  contractValidUntil,
  deviceContractUpdates,
  deviceKindOfAsset,
  recomputeSiteActivities,
  ContractInput,
  latestVersion,
  nextVersionSnapshot,
  ServiceContractVersion,
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
import { ServiceDevice, ServiceSite } from './service';
import { contractSettingsWithDefaults } from './serviceContractSettings';

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

describe('nová smlouva z lokality', () => {
  const site = {
    id: 1, number: '10500', name: 'Mastířovice', customerName: 'Sunset Terrace s.r.o.', address: 'Vrbice', latitude: 50.4929273467662, longitude: 14.311543787718, isActive: true,
    cadastre: 'Mastířovice', lvNumber: '445', financingBank: 'Banka', checklist: CHECKLIST
  } as ServiceSite;
  const devices: ServiceDevice[] = [
    { id: 1, number: '10501', siteNumber: '10500', name: 'Mastířovice I.', kind: 'FVE', isActive: true, parameters: '4 950 kWp' },
    { id: 2, number: '10502', siteNumber: '10500', name: 'Mastířovice II.', kind: 'BESS', isActive: true, oemVendor: 'ABC Energy' },
    { id: 3, number: '10509', siteNumber: '10500', name: 'Vyřazený', kind: 'FVE', isActive: false },
    { id: 4, number: '10511', siteNumber: '10510', name: 'Jiná lokalita', kind: 'FVE', isActive: true }
  ];
  const settings = contractSettingsWithDefaults(undefined);
  const build = (): ContractInput =>
    buildContractInput({ catalog: CAT, contractNumber: '10500-01', site, devices, partner: { name: 'Sunset Terrace s.r.o.', ico: '12345678', dic: 'CZ12345678', address: 'Praha 1' }, settings });

  it('objednatel z partnera, zhotovitel a parametry ze nastavení, příloha z lokality', () => {
    const c = build();
    expect(c.smlouva.cislo).toBe('10500-01');
    expect(c.objednatel).toMatchObject({ nazev: 'Sunset Terrace s.r.o.', ico: '12345678', sidlo: 'Praha 1', dic: 'CZ12345678' });
    expect(c.zhotovitel.ico).toBe('29713536');
    expect(c.asset_manager).toMatchObject({ nazev: 'Revoltum a.s.' });
    expect(c.parametry.doba_let).toBe(10);
    const l = c.lokality[0];
    expect(l).toMatchObject({ kod: '10500', nazev: 'Mastířovice', katastr: 'Mastířovice', lv: '445', gps: '50.492927, 14.311544', verze: '1.0' });
    expect(l.assety.map((a) => a.kod)).toEqual(['10501', '10502']);
    expect(l.cinnosti).toHaveLength(73);
  });

  it('bankovní financování z checklistu zapne bankovní ujednání; kopie nastavení je nezávislá', () => {
    const c = build();
    expect(c.volby).toEqual({ skupina_revoltum: false, penale: false, bankovni_ujednani: true });
    c.parametry.doba_let = 1;
    c.eskalace[0].res = 'jiné';
    expect(settings.parametry.doba_let).toBe(10);
    expect(settings.eskalace[0].res).toBe('Vedoucí servisu');
  });

  it('nová smlouva má cenu k doplnění; chybí-li zákazník, vezme se jméno z lokality', () => {
    const c = build();
    expect(validateContract(CAT, c).map((i) => i.code)).toContain('CENA_CHYBI');
    const bez = buildContractInput({ catalog: CAT, contractNumber: '10500-02', site, devices, settings });
    expect(bez.objednatel.nazev).toBe('Sunset Terrace s.r.o.');
    expect(bez.objednatel.ico).toBe('');
  });

  it('dodatek je kopie s novým číslem verze přílohy', () => {
    const a = build();
    const b = nextVersionSnapshot(a, 2);
    expect(b.lokality[0].verze).toBe('2.0');
    expect(a.lokality[0].verze).toBe('1.0');
    expect(describeChanges(a, b, CAT)).toEqual([]);
  });

  it('souhrn smlouvy a výběr verzí', () => {
    const s = contractSummary(CAT, build());
    expect(s).toMatchObject({ assets: 2, activities: 73, errors: 1 });
    const versions = [
      { contractNumber: '10500-01', versionNo: 1, status: 'Nahrazená' },
      { contractNumber: '10500-01', versionNo: 2, status: 'Podepsaná' },
      { contractNumber: '10500-01', versionNo: 3, status: 'Návrh' },
      { contractNumber: '10510-01', versionNo: 1, status: 'Podepsaná' }
    ] as ServiceContractVersion[];
    expect(latestVersion(versions, '10500-01')?.versionNo).toBe(3);
    expect(activeVersion(versions, '10500-01')?.versionNo).toBe(2);
    expect(activeVersion(versions, '10520-01')).toBeUndefined();
  });
});

describe('změna stavu verze smlouvy', () => {
  const ver = (versionNo: number, status: string, snapshot: ContractInput = example()): ServiceContractVersion => ({ id: versionNo, contractNumber: '10500-01', versionNo, kind: versionNo === 1 ? 'Smlouva' : 'Dodatek', status, snapshot });

  it('správná smlouva jde k podpisu, smlouva s chybou ne', () => {
    expect(contractStatusChange(CAT, [ver(1, 'Návrh')], 1, 'K podpisu')).toEqual({ problem: '', updates: { 1: 'K podpisu' } });
    const bad = clone(example());
    bad.parametry.doba_let = 5;
    expect(contractStatusChange(CAT, [ver(1, 'Návrh', bad)], 1, 'K podpisu').problem).toMatch(/nevyřešených/);
  });

  it('podpis nové verze nahradí dříve podepsanou', () => {
    const r = contractStatusChange(CAT, [ver(1, 'Podepsaná'), ver(2, 'K podpisu')], 2, 'Podepsaná');
    expect(r).toEqual({ problem: '', updates: { 1: 'Nahrazená', 2: 'Podepsaná' } });
  });

  it('nepovolený přechod a neexistující verze', () => {
    expect(contractStatusChange(CAT, [ver(1, 'Návrh')], 1, 'Podepsaná').problem).toMatch(/nejde přejít/);
    expect(contractStatusChange(CAT, [ver(1, 'Podepsaná')], 1, 'Návrh').problem).toMatch(/nejde přejít/);
    expect(contractStatusChange(CAT, [], 3, 'K podpisu').problem).toMatch(/nebyla nalezena/);
    expect(contractStatusChange(CAT, [ver(1, 'K podpisu')], 1, 'Návrh').updates).toEqual({ 1: 'Návrh' });
  });
});

describe('přepočet činností přílohy', () => {
  it('odebrání souboru BESS odebere jeho činnosti, přidání je vrátí', () => {
    const l = example().lokality[0];
    const bezBess = recomputeSiteActivities(CAT, { ...l, assety: l.assety.filter((a) => a.typ !== 'BESS') });
    const full = recomputeSiteActivities(CAT, l);
    expect(full.cinnosti).toHaveLength(73);
    expect((bezBess.cinnosti || []).length).toBeLessThan(73);
    const bessIds = new Set(CAT.cinnosti.filter((a) => a.asset === 'BESS').map((a) => a.id));
    expect((bezBess.cinnosti || []).some((c) => bessIds.has(c.id))).toBe(false);
    expect((full.cinnosti || []).some((c) => bessIds.has(c.id))).toBe(true);
    expect(deviceKindOfAsset('ENC')).toBe('Kogenerace');
    expect(deviceKindOfAsset('FVE')).toBe('FVE');
  });
});

describe('pokrytí servisu smlouvou a platnost u souborů', () => {
  const contract = { id: 1, number: '10500-01', siteNumber: '10500' };
  const ver = (over: Partial<ServiceContractVersion> = {}): ServiceContractVersion => ({ id: 1, contractNumber: '10500-01', versionNo: 1, kind: 'Smlouva', status: 'Podepsaná', effectiveFrom: new Date(2026, 0, 1), snapshot: example(), ...over });
  const today = new Date(2026, 9, 16);

  it('délka platnosti: účinnost + doba v letech, poslední den', () => {
    expect(contractValidUntil(ver())?.toDateString()).toBe(new Date(2035, 11, 31).toDateString());
    expect(contractValidUntil(ver({ effectiveFrom: undefined }))).toBeUndefined();
  });

  it('platná smlouva pokrývá lokalitu i soubory v příloze, ne cizí soubor', () => {
    expect(contractCoverage('10500', '10501', [contract], [ver()], today)).toMatchObject({ state: 'platna', contractNumber: '10500-01' });
    expect(contractCoverage('10500', undefined, [contract], [ver()], today).state).toBe('platna');
    expect(contractCoverage('10500', '10500', [contract], [ver()], today).state).toBe('platna');
    expect(contractCoverage('10500', '10509', [contract], [ver()], today)).toMatchObject({ state: 'mimo-prilohu', contractNumber: '10500-01' });
  });

  it('bez podepsané verze, před účinností, po uplynutí i u jiné lokality', () => {
    expect(contractCoverage('10500', '10501', [contract], [ver({ status: 'Návrh' })], today).state).toBe('bez-smlouvy');
    expect(contractCoverage('10500', '10501', [contract], [ver({ effectiveFrom: new Date(2027, 0, 1) })], today).state).toBe('bez-smlouvy');
    expect(contractCoverage('10500', '10501', [contract], [ver({ effectiveFrom: new Date(2010, 0, 1) })], today).state).toBe('vyprsela');
    expect(contractCoverage('10510', '10511', [contract], [ver()], today).state).toBe('bez-smlouvy');
  });

  it('nejnovější podepsaná verze rozhoduje (dodatek přidal soubor)', () => {
    const v2 = example();
    v2.lokality[0].assety.push({ kod: '10503', typ: 'FVE', nazev: 'Nový' });
    const versions = [ver({ status: 'Nahrazená' }), ver({ versionNo: 2, kind: 'Dodatek', snapshot: v2 })];
    expect(contractCoverage('10500', '10503', [contract], versions, today).state).toBe('platna');
  });

  it('podpis nastaví soubory platnost od účinnosti na dobu smlouvy', () => {
    const u = deviceContractUpdates(ver({ contractNumber: '10500-01', versionNo: 2 }), new Date(2026, 5, 1));
    expect(u.map((x) => x.deviceNumber)).toEqual(['10501', '10502']);
    expect(u[0].contractFrom.getFullYear()).toBe(2026);
    expect(u[0].contractTo?.getFullYear()).toBe(2035);
    expect(u[0].contractNote).toBe('Smlouva 10500-01, verze 2');
    const bezDatumu = deviceContractUpdates(ver({ effectiveFrom: undefined }), new Date(2026, 5, 15));
    expect(bezDatumu[0].contractFrom.getDate()).toBe(15);
  });
});
