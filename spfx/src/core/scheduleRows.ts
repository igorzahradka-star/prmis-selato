/**
 * Řádky editoru harmonogramu — převody mezi uloženými úkoly (PRM_Tasks), řádky formuláře a vstupem pro výpočet CPM.
 * Čistá logika bez SharePointu a Reactu.
 *
 * Řádek má stabilní klíč (`key`); předchůdci se v řádku drží jako text podle čísla WBS (`1, 3SS+2`), v uložených datech jako id úkolů.
 * U úkolů s předchůdci jsou termíny **vypočtené** (zahájení se nezadává); u úkolů bez předchůdců je zahájení vstup uživatele.
 * U smluvního termínu je ukončení **termín**, který se nikdy nepřepisuje výpočtem.
 */

import { ProjectTask, TaskType } from './types';
import { TaskInput } from '../data/repositories';
import { Dependency, ScheduleResult, ScheduleTask, computeSchedule, formatPredecessors, parsePredecessors } from './schedule';
import { CZECH_WORKDAYS, WorkCalendar, dayOf } from './workCalendar';

export interface ScheduleRow {
  /** Stabilní klíč řádku v editoru (u uložených `t<id>`, u nových `n<číslo>`). */
  key: string;
  /** Id uloženého úkolu; nové řádky ho nemají. */
  id?: number;
  wbs: string;
  title: string;
  taskType: TaskType;
  /** Zahájení zadané uživatelem (platí jen u úkolu bez předchůdců). */
  start?: Date;
  durationDays: number;
  /** Předchůdci jako text podle WBS, např. `1, 3SS+2`. */
  predText: string;
  percentComplete: number;
  contractual: boolean;
  /** Smluvní termín (nejzazší konec); jen když je `contractual`. */
  deadline?: Date;
  watch: boolean;
  baselineStart?: Date;
  baselineFinish?: Date;
  responsibleName?: string;
}

/** Úkoly seřazené podle pořadí v harmonogramu: uložené pořadí, jinak podle WBS, jinak podle data. */
export function sortTasksForSchedule(tasks: ProjectTask[]): ProjectTask[] {
  const hasOrder = tasks.some((t) => t.sortOrder !== undefined);
  return tasks.slice().sort((a, b) => {
    if (hasOrder) {
      const x = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const y = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (x !== y) {
        return x - y;
      }
    }
    const da = (a.startDate || a.finishDate || new Date(8640000000000000)).getTime();
    const db = (b.startDate || b.finishDate || new Date(8640000000000000)).getTime();
    return da - db || a.title.localeCompare(b.title, 'cs-CZ');
  });
}

/** Přirozené řazení čísel WBS (`1.2` před `1.10`). */
export const compareWbs = (a: string, b: string): number => a.localeCompare(b, 'cs-CZ', { numeric: true });

/** Výchozí trvání uloženého úkolu: z uloženého trvání, jinak z milníku/termínu, jinak z dat. */
function durationOfTask(t: ProjectTask, cal: WorkCalendar): number {
  if (t.durationDays !== undefined) {
    return t.durationDays;
  }
  if (t.taskType === TaskType.Milnik || (t.isContractualDeadline && !t.startDate)) {
    return 0;
  }
  if (t.startDate && t.finishDate) {
    let n = 0;
    let x = dayOf(t.startDate);
    const end = dayOf(t.finishDate).getTime();
    while (x.getTime() <= end && n < 5000) {
      if (cal.isWorkday(x)) {
        n++;
      }
      x = new Date(x.getFullYear(), x.getMonth(), x.getDate() + 1);
    }
    return Math.max(1, n);
  }
  return 1;
}

/** Řádky editoru z uložených úkolů. Číslo WBS, které úkol nemá, se doplní podle pořadí. */
export function rowsFromTasks(tasks: ProjectTask[], cal: WorkCalendar = CZECH_WORKDAYS): ScheduleRow[] {
  const sorted = sortTasksForSchedule(tasks);
  const used = new Set<string>();
  const wbsOf = new Map<number, string>();
  sorted.forEach((t, i) => {
    let w = (t.wbs || '').trim();
    if (w === '' || used.has(w)) {
      w = String(i + 1);
      while (used.has(w)) {
        w = String(parseInt(w, 10) + 1);
      }
    }
    used.add(w);
    wbsOf.set(t.id, w);
  });
  return sorted.map((t) => ({
    key: `t${t.id}`,
    id: t.id,
    wbs: wbsOf.get(t.id) as string,
    title: t.title,
    taskType: t.taskType,
    start: t.startDate,
    durationDays: durationOfTask(t, cal),
    predText: formatPredecessors(t.predecessors || [], (id) => wbsOf.get(id)),
    percentComplete: t.percentComplete,
    contractual: t.isContractualDeadline,
    deadline: t.isContractualDeadline ? t.finishDate : undefined,
    watch: t.watchAsCritical === true,
    baselineStart: t.baselineStart,
    baselineFinish: t.baselineFinish,
    responsibleName: t.responsibleName
  }));
}

export interface ScheduleModel {
  /** Vypočtený harmonogram (prázdný při cyklu). */
  result: ScheduleResult;
  /** Předchůdci řádků podle klíče řádku. */
  deps: Record<string, Dependency[]>;
  /** Id úkolu použité ve výpočtu podle klíče řádku (u nových řádků záporné). */
  idOf: Record<string, number>;
  /** Problémy po řádcích (text předchůdců, duplicitní WBS …) podle klíče řádku. */
  rowProblems: Record<string, string[]>;
  /** Problémy celého harmonogramu (cyklus, nestíhané termíny). */
  problems: string[];
}

/** Z řádků složí vstup pro CPM, zkontroluje je a harmonogram spočítá. */
export function buildScheduleModel(rows: ScheduleRow[], options: { calendar?: WorkCalendar; defaultStart?: Date } = {}): ScheduleModel {
  const idOf: Record<string, number> = {};
  rows.forEach((r, i) => {
    idOf[r.key] = r.id !== undefined ? r.id : -(i + 1);
  });
  const rowProblems: Record<string, string[]> = {};
  const note = (key: string, text: string): void => {
    (rowProblems[key] = rowProblems[key] || []).push(text);
  };

  // WBS musí být jednoznačné, jinak se nedá odkazovat.
  const byWbs = new Map<string, string>();
  rows.forEach((r) => {
    const w = r.wbs.trim();
    if (w === '') {
      note(r.key, 'Vyplňte číslo (WBS), aby se na úkol dalo odkazovat.');
    } else if (byWbs.has(w)) {
      note(r.key, `Číslo ${w} už má jiný úkol.`);
    } else {
      byWbs.set(w, r.key);
    }
  });

  const deps: Record<string, Dependency[]> = {};
  rows.forEach((r) => {
    const parsed = parsePredecessors(r.predText, (label) => {
      const key = byWbs.get(label.trim());
      return key === undefined ? undefined : idOf[key];
    });
    parsed.errors.forEach((e) => note(r.key, e));
    const own = idOf[r.key];
    deps[r.key] = parsed.deps.filter((d) => {
      if (d.taskId === own) {
        note(r.key, 'Úkol nemůže být svým vlastním předchůdcem.');
        return false;
      }
      return true;
    });
  });

  const tasks: ScheduleTask[] = rows.map((r) => ({
    id: idOf[r.key],
    title: r.title || r.wbs || 'Bez názvu',
    // Zahájení zadává uživatel jen u úkolu bez předchůdců; jinak je vypočtené.
    start: deps[r.key].length === 0 ? r.start : undefined,
    finish: r.contractual ? r.deadline : undefined,
    durationDays: r.taskType === TaskType.Milnik ? 0 : Math.max(0, r.durationDays),
    predecessors: deps[r.key],
    percentComplete: r.percentComplete,
    deadline: r.contractual ? r.deadline : undefined,
    watch: r.watch
  }));

  const result = computeSchedule(tasks, { calendar: options.calendar ?? CZECH_WORKDAYS, defaultStart: options.defaultStart });
  return { result, deps, idOf, rowProblems, problems: result.problems };
}

/** Odstraní z textů předchůdců ostatních řádků odkazy na smazaný úkol (podle jeho WBS). */
export function removeRowReferences(rows: ScheduleRow[], removed: ScheduleRow): ScheduleRow[] {
  const label = removed.wbs.trim();
  return rows.filter((r) => r.key !== removed.key).map((r) => ({ ...r, predText: keepText(r.predText, label) }));
}

/** Text předchůdců bez odkazů na `label` (ostatní zůstávají v původním zápisu). */
function keepText(text: string, label: string): string {
  return text
    .split(/[,;]+/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .filter((p) => {
      const m = /^([^\s+-]+?)(FS|SS|FF|SF)?\s*([+-]\s*\d+)?$/i.exec(p);
      return !(m && m[1].trim() === label);
    })
    .join(', ');
}

/** Další volné číslo WBS (nejvyšší celé číslo na nejvyšší úrovni + 1). */
export function nextWbs(rows: ScheduleRow[]): string {
  let max = 0;
  rows.forEach((r) => {
    const n = parseInt(r.wbs, 10);
    if (!isNaN(n) && n > max) {
      max = n;
    }
  });
  return String(max + 1);
}

/** Přečísluje WBS podle pořadí řádků (1, 2, 3 …) a upraví odkazy v textech předchůdců. */
export function renumberRows(rows: ScheduleRow[]): ScheduleRow[] {
  const map = new Map<string, string>();
  rows.forEach((r, i) => map.set(r.wbs.trim(), String(i + 1)));
  return rows.map((r, i) => {
    const parts = r.predText
      .split(/[,;]+/)
      .map((p) => p.trim())
      .filter((p) => p !== '')
      .map((p) => {
        const m = /^([^\s+-]+?)(FS|SS|FF|SF)?\s*([+-]\s*\d+)?$/i.exec(p);
        if (!m) {
          return p;
        }
        const to = map.get(m[1].trim());
        return to === undefined ? p : `${to}${m[2] ? m[2].toUpperCase() : ''}${m[3] ? m[3].replace(/\s+/g, '') : ''}`;
      });
    return { ...r, wbs: String(i + 1), predText: parts.join(', ') };
  });
}

/**
 * Vstup pro uložení řádku. `model` obsahuje vypočtené termíny a skutečné id předchůdců (po založení nových úkolů).
 * Smluvní termín si ponechá své datum konce; ostatní úkoly dostanou vypočtené zahájení a konec.
 */
export function rowToTaskInput(row: ScheduleRow, sortOrder: number, model: ScheduleModel, realIdOf: (key: string) => number | undefined, responsibleLogin?: string): TaskInput {
  const scheduled = model.result.tasks[model.idOf[row.key]];
  const deps = (model.deps[row.key] || [])
    .map((d) => {
      const key = Object.keys(model.idOf).filter((k) => model.idOf[k] === d.taskId)[0];
      const real = key !== undefined ? realIdOf(key) : undefined;
      return real === undefined ? undefined : { ...d, taskId: real };
    })
    .filter((d): d is Dependency => d !== undefined);
  return {
    title: row.title.trim(),
    taskType: row.taskType,
    startDate: scheduled ? scheduled.start : row.start,
    finishDate: row.contractual ? row.deadline : scheduled ? scheduled.finish : undefined,
    isContractualDeadline: row.contractual,
    percentComplete: row.percentComplete,
    responsibleName: row.responsibleName,
    responsibleLogin,
    sortOrder,
    wbs: row.wbs.trim(),
    durationDays: row.taskType === TaskType.Milnik ? 0 : Math.max(0, row.durationDays),
    predecessors: deps,
    baselineStart: row.baselineStart,
    baselineFinish: row.baselineFinish,
    isCritical: scheduled ? scheduled.critical : false,
    watchAsCritical: row.watch
  };
}

/** Zafixuje baseline: do každého řádku zapíše aktuálně vypočtené zahájení a konec. */
export function fixBaseline(rows: ScheduleRow[], model: ScheduleModel): ScheduleRow[] {
  return rows.map((r) => {
    const s = model.result.tasks[model.idOf[r.key]];
    return s ? { ...r, baselineStart: s.start, baselineFinish: s.finish } : r;
  });
}

/** Problémy před uložením (věty); prázdné pole = uložit jde. */
export function validateScheduleRows(rows: ScheduleRow[], model: ScheduleModel): string[] {
  const out: string[] = [];
  rows.forEach((r, i) => {
    const name = r.title.trim() || `řádek ${i + 1}`;
    if (r.title.trim() === '') {
      out.push(`Řádek ${i + 1}: vyplňte název.`);
    }
    if (r.contractual && !r.deadline) {
      out.push(`„${name}“: smluvní termín potřebuje datum.`);
    }
    (model.rowProblems[r.key] || []).forEach((p) => out.push(`„${name}“: ${p}`));
  });
  if (model.result.cycle) {
    out.push(model.problems.filter((p) => p.indexOf('cyklus') !== -1)[0] || 'Závislosti tvoří cyklus.');
  }
  return out;
}
