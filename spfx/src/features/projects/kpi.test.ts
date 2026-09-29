import { computeKpi, DEADLINE_WINDOW_DAYS } from './KpiTiles';
import { BudgetStatus, Project, ProjectStatus } from '../../core/types';

const DNES = new Date(2026, 8, 11);

function projekt(over: Partial<Project>): Project {
  return {
    id: 1,
    projectNumber: '26-001',
    title: 'Testovací projekt',
    status: ProjectStatus.Realizace,
    currency: 'CZK',
    isOverhead: false,
    budgetStatus: BudgetStatus.Zelena,
    ...over
  };
}

function zaDni(dny: number): Date {
  const d = new Date(DNES);
  d.setDate(d.getDate() + dny);
  return d;
}

describe('computeKpi', () => {
  it('z prázdného seznamu vrátí samé nuly', () => {
    expect(computeKpi([], DNES)).toEqual({
      activeCount: 0,
      activeValue: 0,
      redCount: 0,
      upcomingDeadlines: 0,
      overdueDeadlines: 0
    });
  });

  it('počítá jen aktivní projekty', () => {
    const data = [
      projekt({ status: ProjectStatus.Realizace }),
      projekt({ id: 2, status: ProjectStatus.Priprava }),
      projekt({ id: 3, status: ProjectStatus.Nabidka }),
      projekt({ id: 4, status: ProjectStatus.Pozastaveno }),
      projekt({ id: 5, status: ProjectStatus.Dokonceno }),
      projekt({ id: 6, status: ProjectStatus.Reklamace }),
      projekt({ id: 7, status: ProjectStatus.Storno })
    ];
    expect(computeKpi(data, DNES).activeCount).toBe(4);
  });

  it('projekt Režie do dlaždic nezapočítá', () => {
    const data = [
      projekt({ contractPriceNet: 1000000 }),
      projekt({ id: 2, isOverhead: true, contractPriceNet: 500000 })
    ];
    const kpi = computeKpi(data, DNES);
    expect(kpi.activeCount).toBe(1);
    expect(kpi.activeValue).toBe(1000000);
  });

  it('sečte cenu aktivních projektů a nezakopne o chybějící cenu', () => {
    const data = [
      projekt({ contractPriceNet: 1000000 }),
      projekt({ id: 2, contractPriceNet: undefined }),
      projekt({ id: 3, contractPriceNet: 250000 })
    ];
    expect(computeKpi(data, DNES).activeValue).toBe(1250000);
  });

  it('spočítá projekty v červené — jen mezi aktivními', () => {
    const data = [
      projekt({ budgetStatus: BudgetStatus.Cervena }),
      projekt({ id: 2, budgetStatus: BudgetStatus.Cervena, status: ProjectStatus.Dokonceno }),
      projekt({ id: 3, budgetStatus: BudgetStatus.Zluta })
    ];
    expect(computeKpi(data, DNES).redCount).toBe(1);
  });

  it('hlídá termíny v okně 14 dní včetně dnešku a posledního dne', () => {
    const data = [
      projekt({ id: 1, nextDeadline: zaDni(0) }),
      projekt({ id: 2, nextDeadline: zaDni(DEADLINE_WINDOW_DAYS) }),
      projekt({ id: 3, nextDeadline: zaDni(DEADLINE_WINDOW_DAYS + 1) }),
      projekt({ id: 4, nextDeadline: undefined })
    ];
    expect(computeKpi(data, DNES).upcomingDeadlines).toBe(2);
  });

  it('zmeškané termíny počítá zvlášť, ne mezi nadcházejícími', () => {
    const data = [
      projekt({ id: 1, nextDeadline: zaDni(-1) }),
      projekt({ id: 2, nextDeadline: zaDni(-30) }),
      projekt({ id: 3, nextDeadline: zaDni(5) })
    ];
    const kpi = computeKpi(data, DNES);
    expect(kpi.overdueDeadlines).toBe(2);
    expect(kpi.upcomingDeadlines).toBe(1);
  });

  it('termíny u neaktivních projektů nehlídá', () => {
    const data = [projekt({ status: ProjectStatus.Dokonceno, nextDeadline: zaDni(-5) })];
    expect(computeKpi(data, DNES).overdueDeadlines).toBe(0);
  });
});
