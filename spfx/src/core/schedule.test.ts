import { Dependency, ScheduleTask, computeSchedule, dependenciesFromJson, dependenciesToJson, durationBetween, findCycle, finishOf, formatPredecessors, parsePredecessors } from './schedule';
import { CALENDAR_DAYS, CZECH_WORKDAYS } from './workCalendar';

const d = (m: number, day: number): Date => new Date(2026, m - 1, day);
const dep = (taskId: number, type: Dependency['type'] = 'FS', lagDays = 0): Dependency => ({ taskId, type, lagDays });

function task(id: number, durationDays: number, over: Partial<ScheduleTask> = {}): ScheduleTask {
  return { id, title: `Úkol ${id}`, durationDays, predecessors: [], percentComplete: 0, ...over };
}

describe('harmonogram — termíny a závislosti', () => {
  it('úkol bez předchůdce začíná ve svém datu a končí po trvání (pracovní dny)', () => {
    const r = computeSchedule([task(1, 3, { start: d(10, 5) })]);
    expect(r.tasks[1].start).toEqual(d(10, 5));
    expect(r.tasks[1].finish).toEqual(d(10, 7));
    expect(finishOf(CZECH_WORKDAYS, d(10, 8), 3)).toEqual(d(10, 12)); // čt, pá, po
    expect(durationBetween(CZECH_WORKDAYS, d(10, 8), d(10, 12))).toBe(3);
  });

  it('FS: následník začne den po konci předchůdce; prodleva posune; víkend se přeskočí', () => {
    const r = computeSchedule([task(1, 3, { start: d(10, 5) }), task(2, 2, { predecessors: [dep(1)] }), task(3, 2, { predecessors: [dep(1, 'FS', 2)] })]);
    expect(r.tasks[2].start).toEqual(d(10, 8));
    expect(r.tasks[2].finish).toEqual(d(10, 9));
    expect(r.tasks[3].start).toEqual(d(10, 12)); // čt 8 + 2 pracovní dny prodlevy = po 12.
  });

  it('SS, FF a SF', () => {
    const base = task(1, 5, { start: d(10, 5) }); // po 5 – pá 9
    const ss = computeSchedule([base, task(2, 2, { predecessors: [dep(1, 'SS', 1)] })]);
    expect(ss.tasks[2].start).toEqual(d(10, 6));
    const ff = computeSchedule([base, task(2, 2, { predecessors: [dep(1, 'FF')] })]);
    expect(ff.tasks[2].finish).toEqual(d(10, 9));
    expect(ff.tasks[2].start).toEqual(d(10, 8));
    const sf = computeSchedule([base, task(2, 2, { predecessors: [dep(1, 'SF', 2)] })]);
    expect(sf.tasks[2].finish).toEqual(d(10, 7));
    expect(sf.tasks[2].start).toEqual(d(10, 6));
  });

  it('vlastní zahájení funguje jako „nejdřív v tento den“; víc předchůdců = nejpozdější', () => {
    const r = computeSchedule([
      task(1, 2, { start: d(10, 5) }),
      task(2, 6, { start: d(10, 5) }),
      task(3, 1, { predecessors: [dep(1), dep(2)], start: d(10, 8) })
    ]);
    expect(r.tasks[3].start).toEqual(d(10, 13)); // úkol 2 končí v pondělí 12.
    const later = computeSchedule([task(1, 2, { start: d(10, 5) }), task(2, 1, { predecessors: [dep(1)], start: d(10, 20) })]);
    expect(later.tasks[2].start).toEqual(d(10, 20));
  });

  it('milník nastává na konci dne: FS za úkolem končícím v pátek je v pátek; trvání 0', () => {
    const r = computeSchedule([task(1, 5, { start: d(10, 5) }), task(2, 0, { predecessors: [dep(1)] })]);
    expect(r.tasks[2].start).toEqual(d(10, 9));
    expect(r.tasks[2].finish).toEqual(d(10, 9));
  });

  it('smluvní termín bez předchůdců a bez trvání se bere z uloženého data', () => {
    const r = computeSchedule([task(1, 0, { finish: d(11, 30) })]);
    expect(r.tasks[1].finish).toEqual(d(11, 30));
  });

  it('kalendářní dny: víkendy se nepřeskakují', () => {
    const r = computeSchedule([task(1, 4, { start: d(10, 8) })], { calendar: CALENDAR_DAYS });
    expect(r.tasks[1].finish).toEqual(d(10, 11));
  });
});

describe('harmonogram — kritická cesta', () => {
  const tasks = [
    task(1, 3, { start: d(10, 5) }), // po–st
    task(2, 2, { predecessors: [dep(1)] }), // čt–pá
    task(3, 5, { predecessors: [dep(1)] }), // čt – st 14.
    task(4, 0, { predecessors: [dep(2), dep(3)] }) // milník
  ];

  it('kritické jsou úkoly na nejdelší cestě, ostatní mají rezervu', () => {
    const r = computeSchedule(tasks);
    expect(r.projectFinish).toEqual(d(10, 14));
    expect(r.tasks[1].critical).toBe(true);
    expect(r.tasks[3].critical).toBe(true);
    expect(r.tasks[4].critical).toBe(true);
    expect(r.tasks[2].critical).toBe(false);
    expect(r.tasks[2].totalFloat).toBe(3);
    expect(r.tasks[3].totalFloat).toBe(0);
  });

  it('prodloužení úkolu mimo kritickou cestu ji může změnit', () => {
    const longer = tasks.map((t) => (t.id === 2 ? { ...t, durationDays: 8 } : t));
    const r = computeSchedule(longer);
    expect(r.tasks[2].critical).toBe(true);
    expect(r.tasks[3].critical).toBe(false);
  });

  it('ruční příznak „sledovat jako kritické“ označí úkol i s rezervou', () => {
    const r = computeSchedule(tasks.map((t) => (t.id === 2 ? { ...t, watch: true } : t)));
    expect(r.tasks[2].critical).toBe(true);
    expect(r.tasks[2].totalFloat).toBe(3);
  });

  it('smluvní termín dřív než konec: záporná rezerva, hlášení a kritické úkoly', () => {
    const r = computeSchedule(tasks.map((t) => (t.id === 4 ? { ...t, deadline: d(10, 12) } : t)));
    expect(r.tasks[4].lateByDays).toBe(2);
    expect(r.tasks[4].totalFloat).toBeLessThan(0);
    expect(r.problems.join(' ')).toContain('nestíhá termín o 2 pracovních dnů');
    const ok = computeSchedule(tasks.map((t) => (t.id === 4 ? { ...t, deadline: d(10, 20) } : t)));
    expect(ok.tasks[4].lateByDays).toBeUndefined();
    expect(ok.tasks[4].totalFloat).toBeGreaterThan(0);
    expect(ok.tasks[3].critical).toBe(false);
  });
});

describe('harmonogram — cykly a chyby', () => {
  it('cyklus se najde a výpočet se neprovede', () => {
    const t = [task(1, 1, { start: d(10, 5), predecessors: [dep(2)] }), task(2, 1, { predecessors: [dep(1)] }), task(3, 1, { start: d(10, 5) })];
    expect(findCycle(t).sort()).toEqual([1, 2]);
    const r = computeSchedule(t);
    expect(r.cycle).toEqual(expect.arrayContaining([1, 2]));
    expect(r.problems.join(' ')).toContain('cyklus');
    expect(Object.keys(r.tasks)).toHaveLength(0);
    expect(findCycle([task(1, 1, { predecessors: [dep(1)] })])).toEqual([1]);
  });

  it('předchůdce, který už neexistuje, se ignoruje a oznámí', () => {
    const r = computeSchedule([task(1, 1, { start: d(10, 5), predecessors: [dep(99)] })]);
    expect(r.tasks[1].start).toEqual(d(10, 5));
    expect(r.problems.join(' ')).toContain('už neexistuje');
  });
});

describe('předchůdci jako text a JSON', () => {
  const labels: Record<string, number> = { '1': 11, '2': 12, '1.2': 13 };
  const resolve = (l: string): number | undefined => labels[l];

  it('přečte 3, 5SS+2, 7FF-1 i víceúrovňové popisky', () => {
    const r = parsePredecessors('1, 2SS+2, 1.2FF-1', resolve);
    expect(r.errors).toEqual([]);
    expect(r.deps).toEqual([dep(11), dep(12, 'SS', 2), dep(13, 'FF', -1)]);
    expect(parsePredecessors('', resolve).deps).toEqual([]);
  });

  it('hlásí neexistující, dvojitého a nečitelného předchůdce', () => {
    const r = parsePredecessors('9, 1, 1, ??', resolve);
    expect(r.errors).toHaveLength(3);
    expect(r.errors[0]).toContain('neexistuje');
  });

  it('zapíše zpět a převede JSON (poškozený = prázdný)', () => {
    const deps = [dep(11), dep(12, 'SS', 2), dep(13, 'FF', -1)];
    const reverse: Record<number, string> = { 11: '1', 12: '2', 13: '1.2' };
    expect(formatPredecessors(deps, (id) => reverse[id])).toBe('1, 2SS+2, 1.2FF-1');
    expect(dependenciesFromJson(dependenciesToJson(deps))).toEqual(deps);
    expect(dependenciesFromJson('{rozbité')).toEqual([]);
    expect(dependenciesFromJson(undefined)).toEqual([]);
    expect(dependenciesFromJson('[{"taskId":5,"type":"XX","lagDays":"a"}]')).toEqual([dep(5)]);
  });
});
