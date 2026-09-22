import {
  EXPORT_COLUMNS,
  exportRow,
  budgetVariance,
  titleWithoutNumber,
  exportFileName,
  exportSubtitle
} from './projectExport';
import { BudgetStatus, Project, ProjectStatus } from './types';
import { normalizeSpaces } from './format';

function projekt(over: Partial<Project> = {}): Project {
  return {
    id: 1,
    projectNumber: '26-001',
    title: '26-001 ČEZ Distribuce – Havlíčkův Brod – Připojení DS',
    customerName: 'ČEZ Distribuce, a.s.',
    projectManagerName: 'Igor Zahrádka',
    status: ProjectStatus.Realizace,
    projectType: 'Připojení DS',
    location: 'Havlíčkův Brod',
    contractPriceNet: 4850000,
    currency: 'CZK',
    startDate: new Date(2026, 4, 25),
    endDatePlanned: new Date(2026, 10, 6),
    isOverhead: false,
    budgetStatus: BudgetStatus.Zelena,
    budgetBaselineTotal: 3900000,
    costForecastTotal: 3820000,
    ...over
  };
}

describe('exportRow', () => {
  it('má stejný počet hodnot jako je sloupců', () => {
    expect(exportRow(projekt()).length).toBe(EXPORT_COLUMNS.length);
  });

  it('částky posílá jako čísla, ne jako text — v Excelu se musí dát sčítat', () => {
    const row = exportRow(projekt());
    const cena = row[EXPORT_COLUMNS.findIndex((c) => c.header === 'Cena bez DPH')];
    expect(typeof cena).toBe('number');
    expect(cena).toBe(4850000);
  });

  it('data posílá jako Date, ne jako text', () => {
    const row = exportRow(projekt());
    const zahajeni = row[EXPORT_COLUMNS.findIndex((c) => c.header === 'Zahájení')];
    expect(zahajeni instanceof Date).toBe(true);
  });

  it('prázdné hodnoty nechává prázdné, nedává do nich pomlčku', () => {
    const row = exportRow(projekt({ location: undefined, endDateActual: undefined }));
    expect(row[EXPORT_COLUMNS.findIndex((c) => c.header === 'Lokalita')]).toBeUndefined();
    expect(row[EXPORT_COLUMNS.findIndex((c) => c.header === 'Ukončení skutečné')]).toBeUndefined();
  });

  it('název je bez čísla — číslo má vlastní sloupec', () => {
    const row = exportRow(projekt());
    expect(row[0]).toBe('26-001');
    expect(row[1]).toBe('ČEZ Distribuce – Havlíčkův Brod – Připojení DS');
  });
});

describe('budgetVariance', () => {
  it('spočítá kladnou odchylku prognózy proti baseline', () => {
    const v = budgetVariance(projekt({ budgetBaselineTotal: 1000000, costForecastTotal: 1050000 }));
    expect(v).toBeCloseTo(0.05, 6);
  });

  it('spočítá zápornou odchylku', () => {
    const v = budgetVariance(projekt({ budgetBaselineTotal: 1000000, costForecastTotal: 950000 }));
    expect(v).toBeCloseTo(-0.05, 6);
  });

  it('bez schválené baseline nevrací nulu, ale nic — nula by se četla jako „v pořádku"', () => {
    expect(budgetVariance(projekt({ budgetBaselineTotal: undefined }))).toBeUndefined();
    expect(budgetVariance(projekt({ budgetBaselineTotal: 0 }))).toBeUndefined();
  });

  it('bez prognózy nevrací nic', () => {
    expect(budgetVariance(projekt({ costForecastTotal: undefined }))).toBeUndefined();
  });

  it('prognóza rovná baseline je nulová odchylka, ne prázdno', () => {
    expect(budgetVariance(projekt({ budgetBaselineTotal: 1000000, costForecastTotal: 1000000 }))).toBe(0);
  });
});

describe('titleWithoutNumber', () => {
  it('odstraní číslo ze začátku názvu', () => {
    expect(titleWithoutNumber(projekt())).toBe('ČEZ Distribuce – Havlíčkův Brod – Připojení DS');
  });

  it('název, který číslem nezačíná, nechá být', () => {
    expect(titleWithoutNumber(projekt({ title: 'Jiný název' }))).toBe('Jiný název');
  });

  it('číslo uprostřed názvu neodstraní', () => {
    expect(titleWithoutNumber(projekt({ title: 'Navazuje na 26-001 projekt' }))).toBe(
      'Navazuje na 26-001 projekt'
    );
  });
});

describe('exportFileName', () => {
  it('obsahuje datum s doplněnými nulami', () => {
    expect(exportFileName(new Date(2026, 0, 5))).toBe('PRM-projekty-2026-01-05.xlsx');
  });

  it('je bez diakritiky a mezer', () => {
    expect(exportFileName(new Date(2026, 8, 22))).toMatch(/^[A-Za-z0-9.-]+$/);
  });
});

describe('exportSubtitle', () => {
  it('řekne, kolik projektů se vyexportovalo a kdy', () => {
    expect(normalizeSpaces(exportSubtitle(7, false, new Date(2026, 8, 22)))).toBe(
      'Vyexportováno 7 projektů, 22. 9. 2026'
    );
  });

  it('u filtrovaného exportu to zmíní — jinak by čtenář myslel, že jsou to všechny', () => {
    expect(exportSubtitle(3, true, new Date(2026, 8, 22))).toContain('podle nastavených filtrů');
  });
});
