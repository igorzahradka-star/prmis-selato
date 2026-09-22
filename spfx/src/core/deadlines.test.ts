import {
  nextContractualDeadline,
  sortDeadlines,
  validateDeadline,
  deadlineWarnings,
  DeadlineValues
} from './deadlines';
import { ProjectTask, TaskType } from './types';

const DNES = new Date(2026, 8, 22);

function task(over: Partial<ProjectTask> = {}): ProjectTask {
  return {
    id: 1,
    projectNumber: '26-001',
    title: 'Předání díla',
    taskType: TaskType.Milnik,
    finishDate: new Date(2026, 9, 15),
    isContractualDeadline: true,
    percentComplete: 0,
    ...over
  };
}

describe('nextContractualDeadline', () => {
  it('bez termínů vrátí undefined', () => {
    expect(nextContractualDeadline([], DNES)).toBeUndefined();
  });

  it('vybere nejbližší budoucí termín', () => {
    const blizky = new Date(2026, 8, 30);
    const tasks = [
      task({ id: 1, finishDate: new Date(2026, 10, 1) }),
      task({ id: 2, finishDate: blizky }),
      task({ id: 3, finishDate: new Date(2026, 9, 15) })
    ];
    expect(nextContractualDeadline(tasks, DNES)).toEqual(blizky);
  });

  it('zmeškaný termín má přednost před budoucím', () => {
    const propadly = new Date(2026, 8, 1);
    const tasks = [
      task({ id: 1, finishDate: new Date(2026, 8, 25) }),
      task({ id: 2, finishDate: propadly })
    ];
    expect(nextContractualDeadline(tasks, DNES)).toEqual(propadly);
  });

  it('z více zmeškaných vybere ten nejstarší', () => {
    const nejstarsi = new Date(2026, 6, 1);
    const tasks = [
      task({ id: 1, finishDate: new Date(2026, 7, 1) }),
      task({ id: 2, finishDate: nejstarsi })
    ];
    expect(nextContractualDeadline(tasks, DNES)).toEqual(nejstarsi);
  });

  it('hotové termíny přeskočí', () => {
    const otevreny = new Date(2026, 10, 1);
    const tasks = [
      task({ id: 1, finishDate: new Date(2026, 8, 25), percentComplete: 100 }),
      task({ id: 2, finishDate: otevreny })
    ];
    expect(nextContractualDeadline(tasks, DNES)).toEqual(otevreny);
  });

  it('položky bez příznaku smluvního termínu ignoruje', () => {
    const tasks = [
      task({ id: 1, finishDate: new Date(2026, 8, 23), isContractualDeadline: false }),
      task({ id: 2, finishDate: new Date(2026, 10, 1) })
    ];
    expect(nextContractualDeadline(tasks, DNES)).toEqual(new Date(2026, 10, 1));
  });

  it('položky bez data ignoruje', () => {
    const tasks = [task({ id: 1, finishDate: undefined }), task({ id: 2, finishDate: new Date(2026, 10, 1) })];
    expect(nextContractualDeadline(tasks, DNES)).toEqual(new Date(2026, 10, 1));
  });

  it('termín dnes se nepovažuje za zmeškaný', () => {
    const tasks = [task({ id: 1, finishDate: new Date(2026, 8, 22) })];
    expect(nextContractualDeadline(tasks, DNES)).toEqual(new Date(2026, 8, 22));
  });

  it('když jsou všechny hotové, nevrací nic', () => {
    const tasks = [task({ id: 1, percentComplete: 100 }), task({ id: 2, percentComplete: 100 })];
    expect(nextContractualDeadline(tasks, DNES)).toBeUndefined();
  });
});

describe('sortDeadlines', () => {
  it('řadí podle data vzestupně', () => {
    const tasks = [
      task({ id: 1, title: 'C', finishDate: new Date(2026, 10, 1) }),
      task({ id: 2, title: 'A', finishDate: new Date(2026, 8, 1) }),
      task({ id: 3, title: 'B', finishDate: new Date(2026, 9, 1) })
    ];
    expect(sortDeadlines(tasks).map((t) => t.title)).toEqual(['A', 'B', 'C']);
  });

  it('položky bez data dává nakonec', () => {
    const tasks = [
      task({ id: 1, title: 'Bez data', finishDate: undefined }),
      task({ id: 2, title: 'S datem', finishDate: new Date(2026, 9, 1) })
    ];
    expect(sortDeadlines(tasks).map((t) => t.title)).toEqual(['S datem', 'Bez data']);
  });

  it('původní pole nemění', () => {
    const tasks = [
      task({ id: 1, title: 'C', finishDate: new Date(2026, 10, 1) }),
      task({ id: 2, title: 'A', finishDate: new Date(2026, 8, 1) })
    ];
    sortDeadlines(tasks);
    expect(tasks[0].title).toBe('C');
  });
});

describe('validateDeadline', () => {
  function values(over: Partial<DeadlineValues> = {}): DeadlineValues {
    return {
      title: 'Předání díla',
      finishDate: new Date(2026, 9, 15),
      percentComplete: 0,
      isContractualDeadline: true,
      ...over
    };
  }

  it('správně vyplněný termín projde', () => {
    expect(validateDeadline(values())).toEqual([]);
  });

  it('vyžaduje název', () => {
    expect(validateDeadline(values({ title: '  ' })).map((i) => i.field)).toEqual(['title']);
  });

  it('smluvní termín vyžaduje datum', () => {
    expect(validateDeadline(values({ finishDate: undefined })).map((i) => i.field)).toEqual(['finishDate']);
  });

  it('běžná položka bez data projde', () => {
    expect(validateDeadline(values({ finishDate: undefined, isContractualDeadline: false }))).toEqual([]);
  });

  it('procenta mimo rozsah odmítne', () => {
    expect(validateDeadline(values({ percentComplete: -1 })).length).toBe(1);
    expect(validateDeadline(values({ percentComplete: 101 })).length).toBe(1);
  });

  it('0 i 100 procent jsou platné hodnoty', () => {
    expect(validateDeadline(values({ percentComplete: 0 }))).toEqual([]);
    expect(validateDeadline(values({ percentComplete: 100 }))).toEqual([]);
  });
});

describe('deadlineWarnings', () => {
  const zaklad: DeadlineValues = {
    title: 'Předání díla',
    finishDate: new Date(2026, 9, 15),
    percentComplete: 0,
    isContractualDeadline: true
  };

  it('bez problému nic nehlásí', () => {
    expect(deadlineWarnings(zaklad, new Date(2026, 10, 30))).toEqual([]);
  });

  it('upozorní na termín po plánovaném ukončení projektu', () => {
    const w = deadlineWarnings(zaklad, new Date(2026, 8, 30));
    expect(w.length).toBe(1);
    expect(w[0]).toContain('po plánovaném ukončení');
  });

  it('upozorní, že hotový smluvní termín přestane hlídat', () => {
    const w = deadlineWarnings({ ...zaklad, percentComplete: 100 }, new Date(2026, 10, 30));
    expect(w.some((x) => x.indexOf('přestane se počítat') !== -1)).toBe(true);
  });

  it('bez data ukončení projektu na pozdní termín neupozorňuje', () => {
    expect(deadlineWarnings(zaklad, undefined)).toEqual([]);
  });
});
