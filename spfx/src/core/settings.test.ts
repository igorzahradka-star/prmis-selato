import { ENTITY } from '../config/entity';
import { withDefaults, validateSettings, DEFAULT_SETTINGS, AppSettings } from './settings';

describe('withDefaults', () => {
  it('z prázdného nastavení udělá kompletní výchozí', () => {
    const s = withDefaults(undefined);
    expect(s.folders.libraryTitle).toBe(ENTITY.folders.libraryTitle);
    expect(s.projects.projectTypes.length).toBeGreaterThan(0);
  });

  it('zachová uložené hodnoty', () => {
    const s = withDefaults({ folders: { ...DEFAULT_SETTINGS.folders, rootFolder: 'Projekty' } });
    expect(s.folders.rootFolder).toBe('Projekty');
  });

  it('doplní klíč, který v uloženém nastavení chybí — aplikace nesmí spadnout po rozšíření', () => {
    // Simuluje starší uložené nastavení, které ještě neznalo sekci `budget`.
    const stare = { folders: DEFAULT_SETTINGS.folders } as Partial<AppSettings>;
    const s = withDefaults(stare);
    expect([s.budget.marginGreenPercent, s.budget.marginLightGreenPercent, s.budget.marginYellowPercent]).toEqual([15, 10, 5]);
    expect(s.approvals.pmLimit).toBe(DEFAULT_SETTINGS.approvals.pmLimit);
  });
});

describe('validateSettings', () => {
  it('výchozí nastavení je platné', () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual([]);
  });

  it('upozorní na prázdný název knihovny', () => {
    const s = withDefaults({ folders: { ...DEFAULT_SETTINGS.folders, libraryTitle: '  ' } });
    expect(validateSettings(s).join(' ')).toContain('knihovny');
  });

  it('upozorní na prázdnou šablonu složek', () => {
    const s = withDefaults({ folders: { ...DEFAULT_SETTINGS.folders, template: [] } });
    expect(validateSettings(s).join(' ')).toContain('Šablona složek');
  });

  it('vyžaduje token {CISLO} ve vzoru názvu projektu', () => {
    const s = withDefaults({
      projects: { ...DEFAULT_SETTINGS.projects, titlePattern: '{ZAKAZNIK} – {TYP}' }
    });
    expect(validateSettings(s).join(' ')).toContain('{CISLO}');
  });

  it('odmítne limit vedení nižší než limit PM', () => {
    const s = withDefaults({
      approvals: { ...DEFAULT_SETTINGS.approvals, pmLimit: 500000, vedeniLimit: 100000 }
    });
    expect(validateSettings(s).join(' ')).toContain('Limit vedení');
  });

  it('odmítne záporné limity', () => {
    const s = withDefaults({
      approvals: { ...DEFAULT_SETTINGS.approvals, pmLimit: -1 }
    });
    expect(validateSettings(s).join(' ')).toContain('záporné');
  });

  it('vypíše všechny problémy najednou, ne jen první', () => {
    const s = withDefaults({
      folders: { ...DEFAULT_SETTINGS.folders, libraryTitle: '', template: [] }
    });
    expect(validateSettings(s).length).toBeGreaterThanOrEqual(2);
  });
});

describe('přejmenované typy projektů (SELATO)', () => {
  it('výchozí typy nemají FVE ani BESS', () => {
    expect(DEFAULT_SETTINGS.projects.projectTypes.slice(0, 2)).toEqual(['Výrobní automatizace', 'Procesní automatizace']);
    expect(DEFAULT_SETTINGS.projects.projectTypes).not.toContain('FVE');
    expect(DEFAULT_SETTINGS.projects.projectTypes).not.toContain('BESS');
  });
  it('uložené nastavení se starými názvy se při načtení převede, bez opakování a se zachováním pořadí', () => {
    const s = withDefaults({ projects: { titlePattern: '{CISLO}', projectTypes: ['FVE', 'Jiné', 'BESS', 'Výrobní automatizace'], overheadProjectNumber: '' } });
    expect(s.projects.projectTypes).toEqual(['Výrobní automatizace', 'Jiné', 'Procesní automatizace']);
    expect(s.projects.titlePattern).toBe('{CISLO}');
  });
});
