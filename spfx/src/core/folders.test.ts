import { buildProjectFolderPlan, findMatchingFolder, folderNameWithoutNumber, normalizeFolderName, projectFolderRoot } from './folders';
import { DEFAULT_FOLDER_TEMPLATE, FolderSettings } from './settings';

const BASE_SETTINGS: Pick<FolderSettings, 'rootFolder' | 'subfolderByYear' | 'template'> = {
  rootFolder: 'Projekty',
  subfolderByYear: true,
  template: [{ name: '01_Smlouvy' }, { name: '03_Nákup', children: [{ name: 'Objednávky' }] }]
};

describe('buildProjectFolderPlan', () => {
  it('sestaví cestu kořen -> rok -> projekt -> šablona v tomto pořadí', () => {
    const plan = buildProjectFolderPlan(BASE_SETTINGS, '26-014 ČEZ Distribuce', new Date(2026, 4, 24));
    expect(plan).toEqual([
      'Projekty',
      'Projekty/2026',
      'Projekty/2026/26-014 ČEZ Distribuce',
      'Projekty/2026/26-014 ČEZ Distribuce/01_Smlouvy',
      'Projekty/2026/26-014 ČEZ Distribuce/03_Nákup',
      'Projekty/2026/26-014 ČEZ Distribuce/03_Nákup/Objednávky'
    ]);
  });

  it('bez subfolderByYear vynechá rok', () => {
    const plan = buildProjectFolderPlan({ ...BASE_SETTINGS, subfolderByYear: false }, '26-014 X', new Date(2026, 0, 1));
    expect(plan[0]).toBe('Projekty');
    expect(plan[1]).toBe('Projekty/26-014 X');
  });

  it('prázdný rootFolder znamená založení přímo v kořeni knihovny', () => {
    const plan = buildProjectFolderPlan({ ...BASE_SETTINGS, rootFolder: '', subfolderByYear: false }, '26-014 X');
    expect(plan[0]).toBe('26-014 X');
  });

  it('očistí název projektu od znaků, které SharePoint v názvu složky nepovoluje', () => {
    const plan = buildProjectFolderPlan(
      { ...BASE_SETTINGS, subfolderByYear: false },
      '26-014 Firma "X" / Y',
      undefined
    );
    expect(plan[1]).toBe('Projekty/26-014 Firma X  Y');
  });

  it('výchozí šablona je skutečná struktura projektů RES (dvojčíslí-pomlčka) a zakládá i vnořené podsložky', () => {
    const plan = buildProjectFolderPlan(
      { rootFolder: 'Projekty', subfolderByYear: false, template: DEFAULT_FOLDER_TEMPLATE },
      '26-014 X'
    );
    expect(plan).toContain('Projekty/26-014 X/04-Zápisy');
    expect(plan).toContain('Projekty/26-014 X/03-Nákup/Objednávky');
    expect(plan).toContain('Projekty/26-014 X/03-Rozpočet projektu/Fakturace');
    expect(plan).toContain('Projekty/26-014 X/07-Dokumentace a podklady');
    expect(plan.filter((p) => p.indexOf('_') !== -1 && p.indexOf('Projekty/26-014 X/') === 0)).toEqual([]);
  });
});

describe('vnořená kořenová složka a Režie', () => {
  const nastaveni = { rootFolder: 'General/01_PROJEKTY', subfolderByYear: false, template: [{ name: '03-Nákup', children: [{ name: 'Objednávky' }] }] };

  it('lomítko v kořenové složce se zachová (nevznikne „General01_PROJEKTY“)', () => {
    const plan = buildProjectFolderPlan(nastaveni, '26006 ČEZ');
    expect(plan).toEqual([
      'General',
      'General/01_PROJEKTY',
      'General/01_PROJEKTY/26006 ČEZ',
      'General/01_PROJEKTY/26006 ČEZ/03-Nákup',
      'General/01_PROJEKTY/26006 ČEZ/03-Nákup/Objednávky'
    ]);
    expect(plan.join('|')).not.toContain('General01');
  });

  it('odkaz míří na kořen projektu, ne na poslední podsložku šablony', () => {
    expect(projectFolderRoot(nastaveni, '26006 ČEZ')).toBe('General/01_PROJEKTY/26006 ČEZ');
  });

  it('Režie: společná složka 99900-Režie a pod ní rok, uvnitř struktura projektu', () => {
    const plan = buildProjectFolderPlan(nastaveni, '26999 Režie RES 2026', new Date(2026, 0, 5), 2026);
    expect(plan).toEqual([
      'General',
      'General/01_PROJEKTY',
      'General/01_PROJEKTY/99900-Režie',
      'General/01_PROJEKTY/99900-Režie/2026',
      'General/01_PROJEKTY/99900-Režie/2026/03-Nákup',
      'General/01_PROJEKTY/99900-Režie/2026/03-Nákup/Objednávky'
    ]);
    expect(projectFolderRoot(nastaveni, 'x', undefined, 2027)).toBe('General/01_PROJEKTY/99900-Režie/2027');
  });

  it('podsložka podle roku se u Režie nepřidává dvakrát', () => {
    const plan = buildProjectFolderPlan({ ...nastaveni, subfolderByYear: true }, 'x', new Date(2026, 0, 1), 2026);
    expect(plan.filter((p) => p.split('/').length === 5)).toEqual(['General/01_PROJEKTY/99900-Režie/2026/03-Nákup']);
  });
});

describe('normalizeFolderName a findMatchingFolder', () => {
  it('podtržítko, pomlčka a mezera jsou totéž; velikost písmen a diakritika nerozhodují', () => {
    expect(normalizeFolderName('07_Dokumentace a podklady')).toBe(normalizeFolderName('07-Dokumentace a podklady'));
    expect(normalizeFolderName('06-Dodavatelé')).toBe(normalizeFolderName('06_DODAVATELE'));
    expect(normalizeFolderName('Zápisy')).toBe('zapisy');
  });

  it('různé složky se nesplynou', () => {
    expect(normalizeFolderName('07-Dokumentace')).not.toBe(normalizeFolderName('08-Dokumentace'));
    expect(normalizeFolderName('FOTO')).not.toBe(normalizeFolderName('FOTO 2'));
  });

  it('najde skutečný název existující složky; přesná shoda má přednost', () => {
    const existing = ['06-Dodavatelé', '07-Dokumentace a podklady', '09-Projektová dokumentace'];
    expect(findMatchingFolder(existing, '07_Dokumentace a podklady')).toBe('07-Dokumentace a podklady');
    expect(findMatchingFolder(existing, '06-DODAVATELE')).toBe('06-Dodavatelé');
    expect(findMatchingFolder(existing, 'FOTO')).toBeUndefined();
    expect(findMatchingFolder(['foto', 'FOTO'], 'FOTO')).toBe('FOTO');
    expect(findMatchingFolder([], 'x')).toBeUndefined();
  });

  it('složku najde i bez číselné předpony: „Zápisy“ použije existující „04-Zápisy“', () => {
    const existing = ['03-Rozpočet projektu', '04-Zápisy', '07-Dokumentace a podklady'];
    expect(findMatchingFolder(existing, 'Zápisy')).toBe('04-Zápisy');
    expect(findMatchingFolder(existing, '04_Zapisy')).toBe('04-Zápisy');
    expect(findMatchingFolder(existing, '03-Nákup')).toBeUndefined();
    expect(findMatchingFolder(['2026-10-01', '2026-10-02'], '10-01')).toBeUndefined();
  });

  it('číselná předpona nemění datum ani názvy bez předpony', () => {
    expect(folderNameWithoutNumber('04-Zápisy')).toBe('zapisy');
    expect(folderNameWithoutNumber('2026-10-01_KD')).toBe('2026 10 01 kd');
    expect(folderNameWithoutNumber('12')).toBe('12');
  });
});
