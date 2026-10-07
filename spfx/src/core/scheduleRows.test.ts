import { ScheduleRow, buildScheduleModel, fixBaseline, nextWbs, removeRowReferences, renumberRows, rowToTaskInput, rowsFromTasks, validateScheduleRows } from './scheduleRows';
import { ProjectTask, TaskType } from './types';

const d = (m: number, day: number): Date => new Date(2026, m - 1, day);

function row(key: string, wbs: string, over: Partial<ScheduleRow> = {}): ScheduleRow {
  return { key, wbs, title: `Úkol ${wbs}`, taskType: TaskType.Cinnost, durationDays: 2, predText: '', percentComplete: 0, contractual: false, watch: false, ...over };
}

function stored(id: number, over: Partial<ProjectTask> = {}): ProjectTask {
  return { id, projectNumber: '26001', title: `Úkol ${id}`, taskType: TaskType.Cinnost, isContractualDeadline: false, percentComplete: 0, ...over };
}

describe('řádky harmonogramu — načtení', () => {
  it('uložené úkoly se seřadí, doplní se WBS a předchůdci se zapíšou podle WBS', () => {
    const rows = rowsFromTasks([
      stored(11, { sortOrder: 2, wbs: '2', durationDays: 3, predecessors: [{ taskId: 10, type: 'SS', lagDays: 1 }] }),
      stored(10, { sortOrder: 1, startDate: d(10, 5), durationDays: 2 }),
      stored(12, { sortOrder: 3, taskType: TaskType.Milnik, isContractualDeadline: true, finishDate: d(11, 30) })
    ]);
    expect(rows.map((r) => r.wbs)).toEqual(['1', '2', '3']);
    expect(rows[1].predText).toBe('1SS+1');
    expect(rows[2].durationDays).toBe(0);
    expect(rows[2].deadline).toEqual(d(11, 30));
    expect(rows[2].contractual).toBe(true);
  });

  it('úkol bez uloženého trvání dostane trvání z dat (pracovní dny); smluvní termín jen s datem je milník', () => {
    const rows = rowsFromTasks([stored(1, { startDate: d(10, 8), finishDate: d(10, 12) }), stored(2, { isContractualDeadline: true, finishDate: d(11, 1) })]);
    expect(rows.find((r) => r.id === 1)?.durationDays).toBe(3);
    expect(rows.find((r) => r.id === 2)?.durationDays).toBe(0);
  });

  it('duplicitní uložené WBS se přečíslují, aby se na úkoly dalo odkazovat', () => {
    const rows = rowsFromTasks([stored(1, { wbs: '1', sortOrder: 1 }), stored(2, { wbs: '1', sortOrder: 2 })]);
    expect(new Set(rows.map((r) => r.wbs)).size).toBe(2);
  });
});

describe('řádky harmonogramu — výpočet', () => {
  const rows = [
    row('a', '1', { start: d(10, 5), durationDays: 3 }),
    row('b', '2', { durationDays: 2, predText: '1' }),
    row('c', '3', { durationDays: 5, predText: '1' }),
    row('d', '4', { taskType: TaskType.Milnik, predText: '2, 3' })
  ];

  it('spočítá termíny a kritickou cestu; zahájení se u úkolu s předchůdcem ignoruje', () => {
    const withIgnored = rows.map((r) => (r.key === 'b' ? { ...r, start: d(10, 30) } : r));
    const model = buildScheduleModel(withIgnored);
    const r = model.result.tasks;
    expect(r[model.idOf.b].start).toEqual(d(10, 8));
    expect(r[model.idOf.d].finish).toEqual(d(10, 14));
    expect(r[model.idOf.c].critical).toBe(true);
    expect(r[model.idOf.b].critical).toBe(false);
    expect(validateScheduleRows(withIgnored, model)).toEqual([]);
  });

  it('chyby: neznámý předchůdce, duplicitní WBS, cyklus, chybějící název a termín', () => {
    const bad = [
      row('a', '1', { predText: '9' }),
      row('b', '1', { title: '' }),
      row('c', '3', { predText: '4' }),
      row('d', '4', { predText: '3' }),
      row('e', '5', { contractual: true })
    ];
    const model = buildScheduleModel(bad);
    const problems = validateScheduleRows(bad, model).join(' | ');
    expect(problems).toContain('Předchůdce „9“ neexistuje');
    expect(problems).toContain('už má jiný úkol');
    expect(problems).toContain('vyplňte název');
    expect(problems).toContain('smluvní termín potřebuje datum');
    expect(problems).toContain('cyklus');
  });

  it('smluvní termín nestíhaný harmonogramem se nahlásí', () => {
    const r = [row('a', '1', { start: d(10, 5), durationDays: 10 }), row('b', '2', { taskType: TaskType.Milnik, predText: '1', contractual: true, deadline: d(10, 9) })];
    const model = buildScheduleModel(r);
    expect(model.problems.join(' ')).toContain('nestíhá termín');
    expect(model.result.tasks[model.idOf.b].critical).toBe(true);
  });
});

describe('řádky harmonogramu — úpravy', () => {
  it('smazání úkolu odstraní odkazy na něj z ostatních, ostatní závislosti zůstanou', () => {
    const rows = [row('a', '1'), row('b', '2', { predText: '1, 3SS+1' }), row('c', '3')];
    const out = removeRowReferences(rows, rows[0]);
    expect(out.map((r) => r.key)).toEqual(['b', 'c']);
    expect(out[0].predText).toBe('3SS+1');
  });

  it('přečíslování upraví odkazy; další WBS je nejvyšší + 1', () => {
    const rows = [row('a', '5'), row('b', '7', { predText: '5FF-1' })];
    const out = renumberRows(rows);
    expect(out.map((r) => r.wbs)).toEqual(['1', '2']);
    expect(out[1].predText).toBe('1FF-1');
    expect(nextWbs(rows)).toBe('8');
    expect(nextWbs([])).toBe('1');
  });

  it('baseline zafixuje vypočtené termíny', () => {
    const rows = [row('a', '1', { start: d(10, 5), durationDays: 3 })];
    const fixed = fixBaseline(rows, buildScheduleModel(rows));
    expect(fixed[0].baselineStart).toEqual(d(10, 5));
    expect(fixed[0].baselineFinish).toEqual(d(10, 7));
  });

  it('vstup pro uložení: vypočtené termíny, skutečná id předchůdců; smluvní termín si drží svůj konec', () => {
    const rows = [row('a', '1', { start: d(10, 5), durationDays: 3 }), row('b', '2', { predText: '1FS+1', contractual: true, deadline: d(11, 30) })];
    const model = buildScheduleModel(rows);
    const real: Record<string, number> = { a: 101, b: 102 };
    const a = rowToTaskInput(rows[0], 1, model, (k) => real[k]);
    expect(a.startDate).toEqual(d(10, 5));
    expect(a.finishDate).toEqual(d(10, 7));
    expect(a.wbs).toBe('1');
    expect(a.isCritical).toBeDefined();
    const b = rowToTaskInput(rows[1], 2, model, (k) => real[k]);
    expect(b.predecessors).toEqual([{ taskId: 101, type: 'FS', lagDays: 1 }]);
    expect(b.finishDate).toEqual(d(11, 30));
    expect(b.sortOrder).toBe(2);
  });
});
