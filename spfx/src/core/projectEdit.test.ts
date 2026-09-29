import { validateProjectEdit, projectEditWarnings, ProjectEditValues } from './projectEdit';
import { ProjectStatus } from './types';

function values(over: Partial<ProjectEditValues> = {}): ProjectEditValues {
  return {
    title: '26-001 ČEZ Distribuce, a.s. – Havlíčkův Brod',
    projectManagerName: 'Igor Zahrádka',
    status: ProjectStatus.Realizace,
    contractPriceNet: 1500000,
    startDate: new Date(2026, 2, 1),
    endDatePlanned: new Date(2026, 8, 30),
    ...over
  };
}

describe('validateProjectEdit', () => {
  it('správně vyplněný formulář projde bez výtek', () => {
    expect(validateProjectEdit(values())).toEqual([]);
  });

  it('vyžaduje název projektu', () => {
    const issues = validateProjectEdit(values({ title: '   ' }));
    expect(issues.map((i) => i.field)).toEqual(['title']);
  });

  it('vyžaduje projektového manažera', () => {
    const issues = validateProjectEdit(values({ projectManagerName: '' }));
    expect(issues.map((i) => i.field)).toEqual(['projectManagerName']);
  });

  it('odmítne zápornou cenu', () => {
    const issues = validateProjectEdit(values({ contractPriceNet: -1 }));
    expect(issues.map((i) => i.field)).toEqual(['contractPriceNet']);
  });

  it('cenu 0 bere jako platnou (projekt se může teprve oceňovat)', () => {
    expect(validateProjectEdit(values({ contractPriceNet: 0 }))).toEqual([]);
  });

  it('odmítne nečíselnou cenu', () => {
    const issues = validateProjectEdit(values({ contractPriceNet: Number.NaN }));
    expect(issues.map((i) => i.message)).toEqual(['Cena musí být číslo.']);
  });

  it('plánované ukončení nesmí být před zahájením', () => {
    const issues = validateProjectEdit(
      values({ startDate: new Date(2026, 5, 1), endDatePlanned: new Date(2026, 4, 31) })
    );
    expect(issues.map((i) => i.field)).toEqual(['endDatePlanned']);
  });

  it('stejný den zahájení i ukončení je v pořádku (jednodenní zásah)', () => {
    const den = new Date(2026, 5, 1);
    expect(validateProjectEdit(values({ startDate: den, endDatePlanned: new Date(2026, 5, 1) }))).toEqual([]);
  });

  it('porovnává jen datum, ne čas', () => {
    const rano = new Date(2026, 5, 1, 7, 0);
    const vecer = new Date(2026, 5, 1, 19, 0);
    expect(validateProjectEdit(values({ startDate: vecer, endDatePlanned: rano }))).toEqual([]);
  });

  it('chybějící termíny nevadí — projekt ve stavu Nabídka je nemusí mít', () => {
    const issues = validateProjectEdit(
      values({ status: ProjectStatus.Nabidka, startDate: undefined, endDatePlanned: undefined })
    );
    expect(issues).toEqual([]);
  });

  it('u dokončeného projektu vyžaduje skutečné ukončení', () => {
    const issues = validateProjectEdit(values({ status: ProjectStatus.Dokonceno }));
    expect(issues.map((i) => i.field)).toEqual(['endDateActual']);
  });

  it('u dokončeného projektu se skutečným ukončením je vše v pořádku', () => {
    const issues = validateProjectEdit(
      values({ status: ProjectStatus.Dokonceno, endDateActual: new Date(2026, 8, 20) })
    );
    expect(issues).toEqual([]);
  });

  it('skutečné ukončení nesmí být před zahájením', () => {
    const issues = validateProjectEdit(
      values({
        status: ProjectStatus.Dokonceno,
        startDate: new Date(2026, 5, 1),
        endDateActual: new Date(2026, 4, 1)
      })
    );
    expect(issues.map((i) => i.field)).toEqual(['endDateActual']);
  });

  it('vypíše všechny výtky najednou, ne jen první', () => {
    const issues = validateProjectEdit(
      values({ title: '', projectManagerName: '', contractPriceNet: -5 })
    );
    expect(issues.length).toBe(3);
  });
});

describe('projectEditWarnings', () => {
  it('u správně vyplněného projektu nic nehlásí', () => {
    expect(projectEditWarnings(values())).toEqual([]);
  });

  it('upozorní na skutečné ukončení u neukončeného projektu', () => {
    const w = projectEditWarnings(values({ endDateActual: new Date(2026, 8, 20) }));
    expect(w.length).toBe(1);
    expect(w[0]).toContain('Dokončeno');
  });

  it('upozorní na projekt v realizaci bez ceny', () => {
    const w = projectEditWarnings(values({ contractPriceNet: undefined }));
    expect(w).toEqual(['Projekt je v realizaci, ale nemá vyplněnou cenu bez DPH.']);
  });

  it('upozornění nejsou výtky — uložení nebrání', () => {
    const v = values({ contractPriceNet: undefined });
    expect(projectEditWarnings(v).length).toBeGreaterThan(0);
    expect(validateProjectEdit(v)).toEqual([]);
  });
});
