import { buildProjectFolderPlan } from './folders';
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
