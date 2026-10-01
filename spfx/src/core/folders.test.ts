import { buildProjectFolderPlan, findMatchingFolder, normalizeFolderName } from './folders';
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

  it('s výchozí šablonou ze zadání založí i vnořené podsložky', () => {
    const plan = buildProjectFolderPlan(
      { rootFolder: 'Projekty', subfolderByYear: false, template: DEFAULT_FOLDER_TEMPLATE },
      '26-014 X'
    );
    expect(plan).toContain('Projekty/26-014 X/03_Nákup');
    expect(plan).toContain('Projekty/26-014 X/03_Nákup/Objednávky');
    expect(plan).toContain('Projekty/26-014 X/03_Nákup/Nabídky dodavatelů');
    expect(plan).toContain('Projekty/26-014 X/05_Realizace/Stavební deník');
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
});
