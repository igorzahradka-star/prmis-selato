import { isHiddenByDefault, quickStatusChange, statusAllowsApprovedBudget, statusChoices } from './projectStatus';
import { BudgetStatus, Project, ProjectStatus } from './types';
import { STATUS_ORDER } from './geo';

function projekt(extra: Partial<Project> = {}): Project {
  return {
    id: 1,
    projectNumber: '26001',
    title: '26001 Projekt',
    status: ProjectStatus.Realizace,
    currency: 'CZK',
    isOverhead: false,
    budgetStatus: BudgetStatus.Bez,
    ...extra
  };
}

describe('quickStatusChange', () => {
  const dnes = new Date(2026, 9, 1, 14, 30);

  it('běžná změna mění jen stav', () => {
    const z = quickStatusChange(projekt(), ProjectStatus.Pozastaveno, dnes);
    expect(z).toEqual({ status: ProjectStatus.Pozastaveno });
  });

  it('dokončení bez skutečného ukončení doplní dnešek a řekne to', () => {
    const z = quickStatusChange(projekt(), ProjectStatus.Dokonceno, dnes);
    expect(z.status).toBe(ProjectStatus.Dokonceno);
    expect(z.endDateActual).toEqual(new Date(2026, 9, 1));
    expect(z.note).toContain('26001');
    expect(z.note).toContain('dnešní');
  });

  it('dokončení projektu, který už skutečné ukončení má, ho nepřepíše', () => {
    const z = quickStatusChange(projekt({ endDateActual: new Date(2026, 8, 20) }), ProjectStatus.Dokonceno, dnes);
    expect(z).toEqual({ status: ProjectStatus.Dokonceno });
  });

  it('jiné stavy s nevyplněným ukončením datum nedoplňují', () => {
    expect(quickStatusChange(projekt(), ProjectStatus.Reklamace, dnes).endDateActual).toBeUndefined();
    expect(quickStatusChange(projekt(), ProjectStatus.Storno, dnes).endDateActual).toBeUndefined();
  });
});

describe('statusChoices', () => {
  it('nabídne všechny platné stavy', () => {
    expect(statusChoices('Realizace', STATUS_ORDER)).toEqual(STATUS_ORDER.map((s) => String(s)));
  });

  it('nestandardní uložená hodnota zůstane v nabídce první', () => {
    const v = statusChoices('Něco starého', STATUS_ORDER);
    expect(v[0]).toBe('Něco starého');
    expect(v.length).toBe(STATUS_ORDER.length + 1);
  });
});

describe('stav projektu a schválený rozpočet', () => {
  it('schválený rozpočet nesedí k Nabídce a Stornu; ostatní stavy jsou přípustné', () => {
    expect(statusAllowsApprovedBudget('Nabídka')).toBe(false);
    expect(statusAllowsApprovedBudget('Storno')).toBe(false);
    ['Příprava', 'Realizace', 'Pozastaveno', 'Dokončeno', 'Reklamace', 'Uzavřeno'].forEach((s) => expect(statusAllowsApprovedBudget(s)).toBe(true));
  });
  it('dokončené a stornované se v přehledu skrývají ve výchozím stavu', () => {
    expect(['Dokončeno', 'Storno', 'Uzavřeno'].map(isHiddenByDefault)).toEqual([true, true, true]);
    expect(['Nabídka', 'Příprava', 'Realizace', 'Pozastaveno', 'Reklamace'].map(isHiddenByDefault)).toEqual([false, false, false, false, false]);
  });
});
