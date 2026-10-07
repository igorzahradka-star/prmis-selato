/**
 * Harmonogram projektu: závislosti (FS, SS, FF, SF s prodlevou), výpočet termínů a kritická cesta (CPM) — čistá logika.
 * Vykreslení (Gantt) je jinde; tady je jen výpočet, aby šel testovat samostatně.
 *
 * Pravidla (zjednodušený, ale úplný model):
 *  - Trvání je v pracovních dnech (kalendář se předává; výchozí české pracovní dny). Úkol začíná v den `start` a končí v den
 *    `finish` = start + (trvání − 1) pracovních dnů. **Milník** má trvání 0 (start = finish) a nastává na konci svého dne.
 *  - Úkol bez předchůdců začíná ve svém datu zahájení (nebo ve výchozím datu projektu). Úkol s předchůdci začíná, jakmile to
 *    dovolí všechny závislosti; vlastní datum zahájení funguje jako „nejdřív v tento den“.
 *  - Závislosti: FS = následník začne po skončení předchůdce, SS = začne společně s ním, FF = skončí společně s ním, SF = skončí,
 *    až předchůdce začne; prodleva (lag) v pracovních dnech (i záporná).
 *  - Kritická cesta: rezerva (total float) = o kolik pracovních dnů lze úkol posunout, aniž by se posunul konec projektu (nebo
 *    smluvní termín). Kritické jsou úkoly s rezervou ≤ 0. Smluvní termíny (`deadline`) omezují nejzazší konec úkolu.
 */

import { CZECH_WORKDAYS, WorkCalendar, addWorkdays, dayOf, nextWorkday, workdaysBetween } from './workCalendar';

export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';
export const DEPENDENCY_TYPES: DependencyType[] = ['FS', 'SS', 'FF', 'SF'];

export interface Dependency {
  taskId: number;
  type: DependencyType;
  /** Prodleva v pracovních dnech (záporná = překryv). */
  lagDays: number;
}

export interface ScheduleTask {
  id: number;
  title: string;
  /** Uložené zahájení (nejdřív v tento den). */
  start?: Date;
  /** Uložený konec — použije se jen u úkolu bez trvání a bez předchůdců (např. smluvní termín zadaný jen datem). */
  finish?: Date;
  /** Trvání v pracovních dnech; 0 = milník. */
  durationDays: number;
  predecessors: Dependency[];
  percentComplete: number;
  /** Smluvní termín: nejzazší datum konce úkolu. */
  deadline?: Date;
  /** Ruční příznak „sledovat jako kritické“. */
  watch?: boolean;
}

export interface ScheduledTask {
  id: number;
  start: Date;
  finish: Date;
  lateStart: Date;
  lateFinish: Date;
  /** Celková rezerva v pracovních dnech (záporná = nestíhá se termín). */
  totalFloat: number;
  critical: boolean;
  /** Konec je po smluvním termínu o tolik pracovních dnů (jen když se nestíhá). */
  lateByDays?: number;
}

export interface ScheduleResult {
  tasks: Record<number, ScheduledTask>;
  /** Pořadí úkolů v topologickém řazení. */
  order: number[];
  /** Úkoly v cyklu závislostí (když cyklus je, výpočet se neprovede). */
  cycle?: number[];
  projectStart?: Date;
  projectFinish?: Date;
  /** Srozumitelné problémy (cyklus, neexistující předchůdce). */
  problems: string[];
}

export interface ScheduleOptions {
  calendar?: WorkCalendar;
  /** Datum zahájení úkolů, které žádné nemají (typicky zahájení projektu). */
  defaultStart?: Date;
}

const isMilestone = (t: ScheduleTask): boolean => t.durationDays <= 0;

/** Konec úkolu podle zahájení a trvání. */
export function finishOf(cal: WorkCalendar, start: Date, durationDays: number): Date {
  return durationDays <= 0 ? nextWorkday(cal, start) : addWorkdays(cal, start, durationDays - 1);
}

/** Trvání (pracovní dny) mezi zahájením a koncem včetně obou dnů; nejméně 1. */
export function durationBetween(cal: WorkCalendar, start: Date, finish: Date): number {
  return Math.max(1, workdaysBetween(cal, start, finish) + 1);
}

/** Nejdřívější možné zahájení následníka podle jedné závislosti, když jsou termíny předchůdce `ps`/`pf`. */
function earliestStart(cal: WorkCalendar, dep: Dependency, succ: ScheduleTask, ps: Date, pf: Date): Date {
  const dur = succ.durationDays;
  const ms = isMilestone(succ);
  switch (dep.type) {
    case 'FS':
      // Milník nastává na konci dne, takže může vyjít na stejný den, kdy předchůdce končí.
      return ms ? addWorkdays(cal, pf, dep.lagDays) : addWorkdays(cal, pf, 1 + dep.lagDays);
    case 'SS':
      return addWorkdays(cal, ps, dep.lagDays);
    case 'FF':
      return ms ? addWorkdays(cal, pf, dep.lagDays) : addWorkdays(cal, addWorkdays(cal, pf, dep.lagDays), -(dur - 1));
    case 'SF':
      return ms ? addWorkdays(cal, ps, dep.lagDays) : addWorkdays(cal, addWorkdays(cal, ps, dep.lagDays), -(dur - 1));
  }
}

/** Nejzazší konec předchůdce podle jedné závislosti, když má následník nejpozději zahájení `ls` a konec `lf`. */
function latestFinish(cal: WorkCalendar, dep: Dependency, pred: ScheduleTask, succ: ScheduleTask, ls: Date, lf: Date): Date {
  const ms = isMilestone(succ);
  switch (dep.type) {
    case 'FS':
      return ms ? addWorkdays(cal, lf, -dep.lagDays) : addWorkdays(cal, ls, -(1 + dep.lagDays));
    case 'SS':
      // předchůdce musí začít nejpozději `ls − lag`; konec = začátek + trvání − 1
      return finishOf(cal, addWorkdays(cal, ls, -dep.lagDays), pred.durationDays);
    case 'FF':
      return addWorkdays(cal, lf, -dep.lagDays);
    case 'SF':
      return finishOf(cal, addWorkdays(cal, lf, -dep.lagDays), pred.durationDays);
  }
}

/** Najde cyklus v závislostech; vrací id úkolů, které se v cyklu točí (nebo prázdné pole). */
export function findCycle(tasks: ScheduleTask[]): number[] {
  const ids = new Set(tasks.map((t) => t.id));
  const indeg = new Map<number, number>();
  const succs = new Map<number, number[]>();
  tasks.forEach((t) => {
    indeg.set(t.id, 0);
    succs.set(t.id, []);
  });
  tasks.forEach((t) => {
    t.predecessors.forEach((d) => {
      if (ids.has(d.taskId) && d.taskId !== t.id) {
        indeg.set(t.id, (indeg.get(t.id) ?? 0) + 1);
        (succs.get(d.taskId) as number[]).push(t.id);
      }
    });
  });
  const selfLoop = tasks.filter((t) => t.predecessors.some((d) => d.taskId === t.id)).map((t) => t.id);
  const queue = tasks.filter((t) => (indeg.get(t.id) ?? 0) === 0).map((t) => t.id);
  const done = new Set<number>();
  while (queue.length > 0) {
    const id = queue.shift() as number;
    done.add(id);
    (succs.get(id) as number[]).forEach((s) => {
      indeg.set(s, (indeg.get(s) ?? 0) - 1);
      if ((indeg.get(s) ?? 0) === 0) {
        queue.push(s);
      }
    });
  }
  const rest = tasks.filter((t) => !done.has(t.id)).map((t) => t.id);
  return Array.from(new Set([...selfLoop, ...rest]));
}

/** Spočítá harmonogram: termíny, rezervy a kritickou cestu. */
export function computeSchedule(tasks: ScheduleTask[], options: ScheduleOptions = {}): ScheduleResult {
  const cal = options.calendar ?? CZECH_WORKDAYS;
  const problems: string[] = [];
  const byId = new Map<number, ScheduleTask>();
  tasks.forEach((t) => byId.set(t.id, t));

  // Závislosti na neexistujících úkolech se ignorují (a oznámí).
  const clean: ScheduleTask[] = tasks.map((t) => {
    const preds = t.predecessors.filter((d) => {
      if (!byId.has(d.taskId)) {
        problems.push(`Úkol „${t.title}“ má předchůdce, který už neexistuje.`);
        return false;
      }
      return true;
    });
    return { ...t, predecessors: preds };
  });
  const cleanById = new Map<number, ScheduleTask>();
  clean.forEach((t) => cleanById.set(t.id, t));

  const cycle = findCycle(clean);
  if (cycle.length > 0) {
    const names = cycle.map((id) => `„${(byId.get(id) as ScheduleTask).title}“`).join(', ');
    problems.push(`Závislosti tvoří cyklus (${names}) — harmonogram nejde spočítat. Odeberte jednu ze závislostí.`);
    return { tasks: {}, order: [], cycle, problems };
  }

  // Topologické pořadí (Kahnův algoritmus; při shodě podle pořadí v zadání).
  const indeg = new Map<number, number>();
  const succs = new Map<number, { to: number; dep: Dependency }[]>();
  clean.forEach((t) => {
    indeg.set(t.id, t.predecessors.length);
    succs.set(t.id, []);
  });
  clean.forEach((t) => t.predecessors.forEach((d) => (succs.get(d.taskId) as { to: number; dep: Dependency }[]).push({ to: t.id, dep: d })));
  const order: number[] = [];
  const queue = clean.filter((t) => (indeg.get(t.id) ?? 0) === 0).map((t) => t.id);
  while (queue.length > 0) {
    const id = queue.shift() as number;
    order.push(id);
    (succs.get(id) as { to: number; dep: Dependency }[]).forEach((s) => {
      indeg.set(s.to, (indeg.get(s.to) ?? 0) - 1);
      if ((indeg.get(s.to) ?? 0) === 0) {
        queue.push(s.to);
      }
    });
  }

  const fallbackStart = nextWorkday(cal, options.defaultStart ?? new Date());

  // --- dopředný průchod
  const es = new Map<number, Date>();
  const ef = new Map<number, Date>();
  order.forEach((id) => {
    const t = cleanById.get(id) as ScheduleTask;
    let start: Date | undefined = t.start ? nextWorkday(cal, t.start) : undefined;
    if (t.predecessors.length === 0 && isMilestone(t) && !t.start && t.finish) {
      start = nextWorkday(cal, t.finish);
    }
    t.predecessors.forEach((d) => {
      const ps = es.get(d.taskId) as Date;
      const pf = ef.get(d.taskId) as Date;
      const c = earliestStart(cal, d, t, ps, pf);
      if (!start || c.getTime() > start.getTime()) {
        start = c;
      }
    });
    const s = start ?? fallbackStart;
    es.set(id, s);
    ef.set(id, finishOf(cal, s, t.durationDays));
  });

  let projectStart: Date | undefined;
  let projectFinish: Date | undefined;
  order.forEach((id) => {
    const s = es.get(id) as Date;
    const f = ef.get(id) as Date;
    if (!projectStart || s.getTime() < projectStart.getTime()) {
      projectStart = s;
    }
    if (!projectFinish || f.getTime() > projectFinish.getTime()) {
      projectFinish = f;
    }
  });

  // --- zpětný průchod
  const lf = new Map<number, Date>();
  const ls = new Map<number, Date>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const t = cleanById.get(id) as ScheduleTask;
    // Smluvní termín určuje nejzazší konec úkolu (i když je později než konec projektu — pak je rezerva kladná).
    // Úkol bez následníků a bez termínu končí nejpozději s projektem; úkol s následníky omezují jen oni (a případný termín).
    const successors = succs.get(id) as { to: number; dep: Dependency }[];
    let late: Date | undefined = t.deadline ? dayOf(t.deadline) : successors.length === 0 ? (projectFinish as Date) : undefined;
    successors.forEach((s) => {
      const succ = cleanById.get(s.to) as ScheduleTask;
      const c = latestFinish(cal, s.dep, t, succ, ls.get(s.to) as Date, lf.get(s.to) as Date);
      if (!late || c.getTime() < late.getTime()) {
        late = c;
      }
    });
    if (!late) {
      late = projectFinish as Date;
    }
    lf.set(id, late);
    ls.set(id, isMilestone(t) ? late : addWorkdays(cal, late, -(t.durationDays - 1)));
  }

  const result: Record<number, ScheduledTask> = {};
  order.forEach((id) => {
    const t = cleanById.get(id) as ScheduleTask;
    const float = workdaysBetween(cal, ef.get(id) as Date, lf.get(id) as Date);
    const late = t.deadline ? workdaysBetween(cal, dayOf(t.deadline), ef.get(id) as Date) : 0;
    result[id] = {
      id,
      start: es.get(id) as Date,
      finish: ef.get(id) as Date,
      lateStart: ls.get(id) as Date,
      lateFinish: lf.get(id) as Date,
      totalFloat: float,
      critical: float <= 0 || !!t.watch,
      lateByDays: late > 0 ? late : undefined
    };
    if (late > 0) {
      problems.push(`Úkol „${t.title}“ nestíhá termín o ${late} pracovních dnů.`);
    }
  });

  return { tasks: result, order, projectStart, projectFinish, problems };
}

/** Text závislosti jako `3FS+2`; FS bez prodlevy se zapíše jen číslem (`3`). `label` převede id úkolu na jeho popisek (např. WBS). */
export function formatPredecessors(deps: Dependency[], label: (taskId: number) => string | undefined): string {
  return deps
    .map((d) => {
      const l = label(d.taskId);
      if (l === undefined) {
        return '';
      }
      const lag = d.lagDays === 0 ? '' : d.lagDays > 0 ? `+${d.lagDays}` : String(d.lagDays);
      return d.type === 'FS' && lag === '' ? l : `${l}${d.type}${lag}`;
    })
    .filter((x) => x !== '')
    .join(', ');
}

/**
 * Přečte text předchůdců (`3, 5SS+2, 7FF-1`). `resolve` převede popisek (WBS) na id úkolu; neznámý popisek se vrátí jako chyba.
 */
export function parsePredecessors(text: string, resolve: (label: string) => number | undefined): { deps: Dependency[]; errors: string[] } {
  const deps: Dependency[] = [];
  const errors: string[] = [];
  text
    .split(/[,;]+/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .forEach((part) => {
      const m = /^([^\s+-]+?)(FS|SS|FF|SF)?\s*([+-]\s*\d+)?$/i.exec(part);
      if (!m) {
        errors.push(`„${part}“ nejde přečíst (správně např. 3, 5SS+2, 7FF-1).`);
        return;
      }
      const id = resolve(m[1]);
      if (id === undefined) {
        errors.push(`Předchůdce „${m[1]}“ neexistuje.`);
        return;
      }
      const type = (m[2] ? m[2].toUpperCase() : 'FS') as DependencyType;
      const lag = m[3] ? parseInt(m[3].replace(/\s+/g, ''), 10) : 0;
      if (deps.some((d) => d.taskId === id)) {
        errors.push(`Předchůdce „${m[1]}“ je uvedený dvakrát.`);
        return;
      }
      deps.push({ taskId: id, type, lagDays: lag });
    });
  return { deps, errors };
}

/** Uloženou hodnotu sloupce Předchůdci (JSON) převede na pole závislostí; poškozený text vrátí jako prázdný. */
export function dependenciesFromJson(text: string | undefined): Dependency[] {
  if (!text) {
    return [];
  }
  try {
    const raw = JSON.parse(text) as unknown;
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .filter((x): x is { taskId: number; type?: string; lagDays?: number } => !!x && typeof (x as { taskId: unknown }).taskId === 'number')
      .map((x) => ({
        taskId: x.taskId,
        type: DEPENDENCY_TYPES.indexOf(x.type as DependencyType) !== -1 ? (x.type as DependencyType) : 'FS',
        lagDays: typeof x.lagDays === 'number' && isFinite(x.lagDays) ? Math.round(x.lagDays) : 0
      }));
  } catch {
    return [];
  }
}

export function dependenciesToJson(deps: Dependency[]): string {
  return JSON.stringify(deps.map((d) => ({ taskId: d.taskId, type: d.type, lagDays: d.lagDays })));
}
