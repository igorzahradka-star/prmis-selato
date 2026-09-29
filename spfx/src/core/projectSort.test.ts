import { sortProjects } from './projectSort';
import { Project, ProjectStatus, BudgetStatus } from './types';

function projekt(cislo: string, extra: Partial<Project> = {}): Project {
  return {
    id: Number(cislo),
    projectNumber: cislo,
    title: `${cislo} Projekt`,
    status: ProjectStatus.Realizace,
    currency: 'CZK',
    isOverhead: false,
    budgetStatus: BudgetStatus.Bez,
    ...extra
  };
}

const cisla = (list: Project[]): string[] => list.map((p) => p.projectNumber);

describe('sortProjects — číslo', () => {
  const data = [projekt('26010'), projekt('26002'), projekt('26999'), projekt('26001')];

  it('vzestupně: 26001 první, Režie 26999 poslední', () => {
    expect(cisla(sortProjects(data, 'number', false))).toEqual(['26001', '26002', '26010', '26999']);
  });

  it('sestupně je pořadí opačné', () => {
    expect(cisla(sortProjects(data, 'number', true))).toEqual(['26999', '26010', '26002', '26001']);
  });

  it('řadí podle hodnoty, ne abecedně (26009 před 26010, i když by čísla měla různou délku)', () => {
    const r = sortProjects([projekt('100000'), projekt('26009'), projekt('26010')], 'number', false);
    expect(cisla(r)).toEqual(['26009', '26010', '100000']);
  });

  it('původní pole nemění', () => {
    const kopie = cisla(data);
    sortProjects(data, 'number', false);
    expect(cisla(data)).toEqual(kopie);
  });
});

describe('sortProjects — prázdné hodnoty jsou vždy na konci', () => {
  const data = [
    projekt('26001', { contractPriceNet: 500 }),
    projekt('26002'),
    projekt('26003', { contractPriceNet: 100 })
  ];

  it('vzestupně podle ceny', () => {
    expect(cisla(sortProjects(data, 'price', false))).toEqual(['26003', '26001', '26002']);
  });

  it('sestupně podle ceny — projekt bez ceny zůstane poslední, ne první', () => {
    expect(cisla(sortProjects(data, 'price', true))).toEqual(['26001', '26003', '26002']);
  });

  it('podle termínu: projekty bez termínu na konci v obou směrech', () => {
    const d = [
      projekt('26001'),
      projekt('26002', { nextDeadline: new Date(2026, 11, 1) }),
      projekt('26003', { nextDeadline: new Date(2026, 5, 1) })
    ];
    expect(cisla(sortProjects(d, 'deadline', false))).toEqual(['26003', '26002', '26001']);
    expect(cisla(sortProjects(d, 'deadline', true))).toEqual(['26002', '26003', '26001']);
  });
});

describe('sortProjects — text', () => {
  it('projektoví manažeři česky: Čech až za Cyrilem, bez PM na konci', () => {
    const d = [
      projekt('26001', { projectManagerName: 'Čech' }),
      projekt('26002'),
      projekt('26003', { projectManagerName: 'Cyril' }),
      projekt('26004', { projectManagerName: 'Adam' })
    ];
    expect(cisla(sortProjects(d, 'pm', false))).toEqual(['26004', '26003', '26001', '26002']);
  });

  it('při shodě zůstane původní pořadí (stabilní řazení)', () => {
    const d = [
      projekt('26003', { projectManagerName: 'Igor' }),
      projekt('26001', { projectManagerName: 'Igor' }),
      projekt('26002', { projectManagerName: 'Igor' })
    ];
    expect(cisla(sortProjects(d, 'pm', false))).toEqual(['26003', '26001', '26002']);
    expect(cisla(sortProjects(d, 'pm', true))).toEqual(['26003', '26001', '26002']);
  });

  it('ukončení: skutečné datum má přednost před plánovaným', () => {
    const d = [
      projekt('26001', { endDatePlanned: new Date(2026, 0, 1), endDateActual: new Date(2026, 9, 1) }),
      projekt('26002', { endDatePlanned: new Date(2026, 5, 1) })
    ];
    expect(cisla(sortProjects(d, 'end', false))).toEqual(['26002', '26001']);
  });
});
