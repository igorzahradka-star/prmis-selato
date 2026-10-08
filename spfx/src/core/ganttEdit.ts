/**
 * Úpravy harmonogramu přímo v Ganttově diagramu (Fáze 4, krok 4e) — čistá logika nad řádky editoru (`ScheduleRow`).
 * Pravidla se řídí MS Projectem:
 *
 *  - Posun pruhu úkolu **bez předchůdců** nastaví jeho zahájení. Posun úkolu **s předchůdci** upraví prodlevu (lag) u té vazby,
 *    která úkol drží (úkol se tak dál řídí předchůdci a posun předchůdce potáhne i jeho). Dřív než předchůdci dovolí, úkol nepůjde.
 *  - Změna délky pruhu změní trvání v pracovních dnech; milník se neprodlužuje.
 *  - Nová vazba z konce / začátku pruhu na konec / začátek jiného: FS, SS, FF, SF. Vazba, která by vytvořila smyčku, se odmítne.
 *  - Smazání poslední vazby úkolu zachová jeho dosavadní termín (zahájení se zapíše jako jeho vlastní).
 *  - Přeskládání řádků vazby nemění (vazby se drží čísla WBS, ne pořadí); pokud byla čísla jednoduchá řada 1, 2, 3 …,
 *    po přesunu se přečíslují podle nového pořadí a odkazy se upraví.
 */

import { TaskType } from './types';
import { Dependency, DependencyType, durationBetween, formatPredecessors } from './schedule';
import { ScheduleModel, ScheduleRow, buildScheduleModel, nextWbs, renumberRows } from './scheduleRows';
import { CZECH_WORKDAYS, WorkCalendar, dayOf, nextWorkday, prevWorkday, workdaysBetween } from './workCalendar';

export interface EditContext {
  calendar?: WorkCalendar;
  defaultStart?: Date;
}

export type GanttOp =
  | { type: 'move'; key: string; start: Date }
  | { type: 'resize'; key: string; finish: Date }
  | { type: 'percent'; key: string; percent: number };

const cal = (ctx: EditContext): WorkCalendar => ctx.calendar ?? CZECH_WORKDAYS;
const model = (rows: ScheduleRow[], ctx: EditContext): ScheduleModel => buildScheduleModel(rows, { calendar: cal(ctx), defaultStart: ctx.defaultStart });
const sameDate = (a: Date, b: Date): boolean => dayOf(a).getTime() === dayOf(b).getTime();

/** Klíč řádku podle id úkolu z modelu. */
function keyOfId(m: ScheduleModel, id: number): string | undefined {
  return Object.keys(m.idOf).filter((k) => m.idOf[k] === id)[0];
}

/** Text předchůdců z vazeb (podle čísel WBS řádků). */
function depsText(rows: ScheduleRow[], m: ScheduleModel, deps: Dependency[]): string {
  return formatPredecessors(deps, (id) => {
    const k = keyOfId(m, id);
    const row = rows.filter((r) => r.key === k)[0];
    return row ? row.wbs.trim() : undefined;
  });
}

function withDeps(rows: ScheduleRow[], m: ScheduleModel, key: string, deps: Dependency[], extra: Partial<ScheduleRow> = {}): ScheduleRow[] {
  const text = depsText(rows, m, deps);
  return rows.map((r) => (r.key === key ? { ...r, ...extra, predText: text } : r));
}

/** Posune pruh na nové zahájení (viz popis souboru). Beze změny vrací původní pole. */
function moveRow(rows: ScheduleRow[], key: string, start: Date, ctx: EditContext): ScheduleRow[] {
  const c = cal(ctx);
  const m = model(rows, ctx);
  const cur = m.result.tasks[m.idOf[key]];
  const row = rows.filter((r) => r.key === key)[0];
  if (!cur || !row) {
    return rows;
  }
  const target = nextWorkday(c, dayOf(start));
  if (sameDate(target, cur.start)) {
    return rows;
  }
  const deps = m.deps[key] || [];
  if (deps.length === 0) {
    return rows.map((r) => (r.key === key ? { ...r, start: target } : r));
  }
  // Zkouší se po jedné vazbě: ta, po jejíž úpravě vyjde zahájení přesně na cíl, drží úkol. Jinak se vybere ta, která se cíli přiblíží nejvíc.
  const d = target.getTime() > dayOf(cur.start).getTime() ? workdaysBetween(c, cur.start, target) : -workdaysBetween(c, target, cur.start);
  let best: { rows: ScheduleRow[]; gap: number } | undefined;
  for (let i = 0; i < deps.length; i++) {
    const nd = deps.map((x, j) => (j === i ? { ...x, lagDays: x.lagDays + d } : x));
    const next = withDeps(rows, m, key, nd);
    const m2 = model(next, ctx);
    const s2 = m2.result.tasks[m2.idOf[key]];
    if (!s2 || m2.result.cycle) {
      continue;
    }
    const gap = Math.abs(s2.start.getTime() - target.getTime());
    if (!best || gap < best.gap) {
      best = { rows: next, gap };
    }
    if (gap === 0) {
      break;
    }
  }
  return best ? best.rows : rows;
}

/** Změní délku pruhu tak, aby končil v daný den (nejméně 1 pracovní den); milník se nemění. */
function resizeRow(rows: ScheduleRow[], key: string, finish: Date, ctx: EditContext): ScheduleRow[] {
  const c = cal(ctx);
  const m = model(rows, ctx);
  const cur = m.result.tasks[m.idOf[key]];
  const row = rows.filter((r) => r.key === key)[0];
  if (!cur || !row || row.taskType === TaskType.Milnik || row.durationDays <= 0) {
    return rows;
  }
  const end = prevWorkday(c, dayOf(finish));
  const duration = end.getTime() < dayOf(cur.start).getTime() ? 1 : durationBetween(c, cur.start, end);
  return duration === row.durationDays ? rows : rows.map((r) => (r.key === key ? { ...r, durationDays: duration } : r));
}

/** Použije jednu úpravu z diagramu. */
export function applyOp(rows: ScheduleRow[], op: GanttOp, ctx: EditContext = {}): ScheduleRow[] {
  switch (op.type) {
    case 'move':
      return moveRow(rows, op.key, op.start, ctx);
    case 'resize':
      return resizeRow(rows, op.key, op.finish, ctx);
    case 'percent': {
      const p = Math.max(0, Math.min(100, Math.round(op.percent)));
      return rows.map((r) => (r.key === op.key && r.percentComplete !== p ? { ...r, percentComplete: p } : r));
    }
  }
}

// --- vazby -----------------------------------------------------------------------------

export interface LinkResult {
  rows: ScheduleRow[];
  /** Důvod, proč vazbu nejde vytvořit (věta pro uživatele). */
  error?: string;
}

/** Typ vazby podle toho, ze kterého konce pruhu se táhne a na který konec jiného pruhu se pouští. */
export function linkTypeFor(fromEnd: 'start' | 'finish', toEnd: 'start' | 'finish'): DependencyType {
  if (fromEnd === 'finish') {
    return toEnd === 'start' ? 'FS' : 'FF';
  }
  return toEnd === 'start' ? 'SS' : 'SF';
}

/** Přidá vazbu `fromKey` → `toKey` (od předchůdce k následníkovi). */
export function addLink(rows: ScheduleRow[], fromKey: string, toKey: string, type: DependencyType, ctx: EditContext = {}): LinkResult {
  const from = rows.filter((r) => r.key === fromKey)[0];
  const to = rows.filter((r) => r.key === toKey)[0];
  if (!from || !to) {
    return { rows, error: 'Úkol už neexistuje.' };
  }
  if (fromKey === toKey) {
    return { rows, error: 'Úkol nemůže být svým vlastním předchůdcem.' };
  }
  if (from.wbs.trim() === '') {
    return { rows, error: 'Předchůdce nemá číslo (WBS) — doplňte ho v tabulce.' };
  }
  const m = model(rows, ctx);
  const deps = m.deps[toKey] || [];
  const fromId = m.idOf[fromKey];
  if (deps.some((d) => d.taskId === fromId)) {
    return { rows, error: `Vazba mezi „${from.title || from.wbs}“ a „${to.title || to.wbs}“ už existuje — upravte ji kliknutím na šipku.` };
  }
  const next = withDeps(rows, m, toKey, [...deps, { taskId: fromId, type, lagDays: 0 }]);
  const m2 = model(next, ctx);
  if (m2.result.cycle) {
    return { rows, error: `Vazba by vytvořila smyčku: „${from.title || from.wbs}“ už na „${to.title || to.wbs}“ (přímo nebo přes jiné úkoly) závisí.` };
  }
  return { rows: next };
}

/** Odebere vazbu. Zbude-li úkol bez předchůdců, ponechá si dosavadní zahájení. */
export function removeLink(rows: ScheduleRow[], fromKey: string, toKey: string, ctx: EditContext = {}): ScheduleRow[] {
  const m = model(rows, ctx);
  const deps = m.deps[toKey] || [];
  const fromId = m.idOf[fromKey];
  const left = deps.filter((d) => d.taskId !== fromId);
  if (left.length === deps.length) {
    return rows;
  }
  const cur = m.result.tasks[m.idOf[toKey]];
  return withDeps(rows, m, toKey, left, left.length === 0 && cur ? { start: cur.start } : {});
}

/** Změní typ nebo prodlevu (v pracovních dnech, i záporně) existující vazby. */
export function updateLink(rows: ScheduleRow[], fromKey: string, toKey: string, patch: { type?: DependencyType; lagDays?: number }, ctx: EditContext = {}): ScheduleRow[] {
  const m = model(rows, ctx);
  const deps = m.deps[toKey] || [];
  const fromId = m.idOf[fromKey];
  if (!deps.some((d) => d.taskId === fromId)) {
    return rows;
  }
  const next = deps.map((d) =>
    d.taskId === fromId ? { ...d, type: patch.type ?? d.type, lagDays: patch.lagDays !== undefined && isFinite(patch.lagDays) ? Math.round(patch.lagDays) : d.lagDays } : d
  );
  return withDeps(rows, m, toKey, next);
}

/** Aktuální typ a prodleva vazby (pro editor vazby); `undefined`, když vazba není. */
export function linkOf(rows: ScheduleRow[], fromKey: string, toKey: string, ctx: EditContext = {}): Dependency | undefined {
  const m = model(rows, ctx);
  return (m.deps[toKey] || []).filter((d) => d.taskId === m.idOf[fromKey])[0];
}

// --- řádky -----------------------------------------------------------------------------

/** Nový řádek (úkol nebo milník) začínající v daný den; konec určuje trvání (nejméně 1 pracovní den, u milníku 0). */
export function makeRow(rows: ScheduleRow[], key: string, start: Date, finish: Date | undefined, type: TaskType, ctx: EditContext = {}): ScheduleRow {
  const c = cal(ctx);
  const s = nextWorkday(c, dayOf(start));
  const milestone = type === TaskType.Milnik;
  return {
    key,
    wbs: nextWbs(rows),
    title: milestone ? 'Nový milník' : 'Nový úkol',
    taskType: type,
    start: s,
    durationDays: milestone ? 0 : finish ? durationBetween(c, s, prevWorkday(c, dayOf(finish))) : 1,
    predText: '',
    percentComplete: 0,
    contractual: false,
    watch: false
  };
}

/** Čísla WBS jsou jednoduchá řada 1, 2, 3 … podle pořadí? */
function isSimpleSequence(rows: ScheduleRow[]): boolean {
  return rows.every((r, i) => r.wbs.trim() === String(i + 1));
}

/**
 * Přesune řádek z pozice `from` na pozici `to` (pozice v novém pořadí). Vazby zůstávají (drží se čísla WBS);
 * jednoduchá čísla 1, 2, 3 … se po přesunu přečíslují podle nového pořadí a odkazy v předchůdcích se upraví.
 */
export function reorderRows(rows: ScheduleRow[], from: number, to: number): ScheduleRow[] {
  if (from < 0 || from >= rows.length || to < 0 || to >= rows.length || from === to) {
    return rows;
  }
  const simple = isSimpleSequence(rows);
  const next = rows.slice();
  const moved = next.splice(from, 1)[0];
  next.splice(to, 0, moved);
  return simple ? renumberRows(next) : next;
}
