import { projectFolderRemovalTarget } from './projectDeletion';
import { projectFolderName } from './folders';

const LIB = '/sites/RevoltumEngineeringServices/Shared Documents';

describe('složka ke smazání', () => {
  it('složka přímo v kořenové složce projektů se smí smazat', () => {
    const r = projectFolderRemovalTarget(`${LIB}/General/01_PROJEKTY/26007-TEST`, LIB, 'General/01_PROJEKTY');
    expect(r.path).toBe(`${LIB}/General/01_PROJEKTY/26007-TEST`);
    expect(r.warning).toBeUndefined();
  });

  it('velikost písmen v cestě nerozhoduje', () => {
    expect(projectFolderRemovalTarget(`${LIB}/general/01_projekty/26007-TEST`, LIB, 'General/01_PROJEKTY').path).toBeDefined();
  });

  it('složka v chybně vzniklé „General01_PROJEKTY“ se nesmaže', () => {
    const r = projectFolderRemovalTarget(`${LIB}/General01_PROJEKTY/26007 X`, LIB, 'General/01_PROJEKTY');
    expect(r.path).toBeUndefined();
    expect(r.warning).toContain('neleží v kořenové složce');
  });

  it('odkaz do podsložky projektu se nesmaže (chybný odkaz na 10-Servis)', () => {
    const r = projectFolderRemovalTarget(`${LIB}/General/01_PROJEKTY/26007-TEST/10-Servis`, LIB, 'General/01_PROJEKTY');
    expect(r.path).toBeUndefined();
    expect(r.warning).toContain('podsložky');
  });

  it('samotná kořenová složka ani prázdný odkaz se nesmaže', () => {
    expect(projectFolderRemovalTarget(`${LIB}/General/01_PROJEKTY`, LIB, 'General/01_PROJEKTY').path).toBeUndefined();
    expect(projectFolderRemovalTarget(undefined, LIB, 'General/01_PROJEKTY').warning).toContain('nemá odkaz');
    expect(projectFolderRemovalTarget('', LIB, 'General/01_PROJEKTY').path).toBeUndefined();
  });

  it('bez kořenové složky v nastavení platí totéž pravidlo od kořene knihovny', () => {
    expect(projectFolderRemovalTarget(`${LIB}/26007-TEST`, LIB, '').path).toBeDefined();
    expect(projectFolderRemovalTarget(`${LIB}/26007-TEST/10-Servis`, LIB, '').path).toBeUndefined();
  });
});

describe('název složky projektu', () => {
  it('číslo, podtržítko a zbytek názvu; části oddělené pomlčkou se spojí podtržítkem; číslo se nezdvojí', () => {
    expect(projectFolderName('26ZA00007', '26ZA00007 EKOL – UL BM kotel Trmice')).toBe('26ZA00007_EKOL_UL BM kotel Trmice');
    expect(projectFolderName('26ZA00001', 'MASTIROVICE 1 GENERALNI OPRAVA')).toBe('26ZA00001_MASTIROVICE 1 GENERALNI OPRAVA');
    expect(projectFolderName('26ZA00001', '26ZA00001_MASTIROVICE')).toBe('26ZA00001_MASTIROVICE');
    expect(projectFolderName('26ZA00005', '26ZA00005 CWS – Rozvaděč RM2 – FVE')).toBe('26ZA00005_CWS_Rozvaděč RM2_FVE');
  });

  it('nepovolené znaky pryč, délka omezená, prázdný název dá jen číslo', () => {
    expect(projectFolderName('26ZA00002', 'FVE: Brno/Sever?')).toBe('26ZA00002_FVE BrnoSever');
    expect(projectFolderName('26ZA00003', 'x'.repeat(300)).length).toBeLessThanOrEqual(100);
    expect(projectFolderName('26ZA00004', '')).toBe('26ZA00004');
  });
});
