/**
 * Rozložení Ganttova diagramu: převod termínů úkolů na souřadnice (pixely) a šipky závislostí — čistá logika bez Reactu.
 * Vykresluje to `features/schedule/GanttChart.tsx`; tady je jen výpočet, aby šel testovat.
 *
 * Časová osa: úkol zabírá dny od `start` do `finish` včetně obou (pruh končí na konci dne `finish`); milník je kosočtverec
 * na konci svého dne. Měřítko dny / týdny / měsíce mění jen počet pixelů na den.
 */

import { Dependency, DependencyType } from './schedule';
import { CZECH_WORKDAYS, WorkCalendar, addDays, dayOf, diffDays } from './workCalendar';

export type GanttScale = 'day' | 'week' | 'month';

export const PX_PER_DAY: Record<GanttScale, number> = { day: 30, week: 9, month: 2.6 };
export const ROW_HEIGHT = 30;
export const BAR_HEIGHT = 16;
export const HEADER_HEIGHT = 44;

const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];

export interface GanttItem {
  key: string;
  wbs: string;
  title: string;
  start: Date;
  finish: Date;
  milestone: boolean;
  critical: boolean;
  percent: number;
  baselineStart?: Date;
  baselineFinish?: Date;
  /** Smluvní termín (nejzazší konec). */
  deadline?: Date;
  lateByDays?: number;
  totalFloat: number;
}

export interface GanttLink {
  fromKey: string;
  toKey: string;
  type: DependencyType;
}

export interface HeaderCell {
  x: number;
  width: number;
  label: string;
}

export interface GanttBar {
  key: string;
  row: number;
  /** Levý okraj, šířka (u milníku šířka 0) a svislá poloha pruhu. */
  x: number;
  width: number;
  y: number;
  milestone: boolean;
  /** Šířka dokončené části. */
  doneWidth: number;
  critical: boolean;
  /** Baseline pod pruhem (když je zadaná). */
  baseline?: { x: number; width: number; y: number };
  /** Svislá značka smluvního termínu. */
  deadlineX?: number;
  late: boolean;
  tooltip: string;
}

export interface GanttArrow {
  /** Body lomené čáry; poslední bod je u cílového pruhu. */
  points: { x: number; y: number }[];
  critical: boolean;
  /** Směr, kterým šipka míří do cíle (+1 zleva doprava, −1 zprava doleva). */
  direction: 1 | -1;
}

export interface GanttLayout {
  rangeStart: Date;
  rangeEnd: Date;
  width: number;
  height: number;
  pxPerDay: number;
  top: HeaderCell[];
  bottom: HeaderCell[];
  /** Nepracovní dny (víkendy a svátky) jako svislé pruhy; jen v měřítku den a týden. */
  offDays: { x: number; width: number }[];
  todayX?: number;
  bars: GanttBar[];
  arrows: GanttArrow[];
}

const fmt = (d: Date): string => `${d.getDate()}. ${d.getMonth() + 1}.`;

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function mondayOf(d: Date): Date {
  const x = dayOf(d);
  return addDays(x, -((x.getDay() + 6) % 7));
}

/** Jednoduchá lomená čára závislosti mezi dvěma pruhy (viz popis souboru). */
export function arrowPoints(type: DependencyType, from: GanttBar, to: GanttBar, rowHeight: number = ROW_HEIGHT): { points: { x: number; y: number }[]; direction: 1 | -1 } {
  const fromEnd = type === 'FS' || type === 'FF';
  const toStart = type === 'FS' || type === 'SS';
  const sx = fromEnd ? from.x + from.width : from.x;
  const sy = from.y + BAR_HEIGHT / 2;
  const tx = toStart ? to.x : to.x + to.width;
  const ty = to.y + BAR_HEIGHT / 2;
  const outDir = fromEnd ? 1 : -1;
  const inDir = toStart ? 1 : -1; // směr, kterým šipka vstupuje do cíle
  const gap = 8;
  const out = sx + outDir * gap;
  const approach = tx - inDir * gap;
  const pts: { x: number; y: number }[] = [{ x: sx, y: sy }, { x: out, y: sy }];
  const enough = outDir === inDir ? (inDir === 1 ? out <= approach : out >= approach) : false;
  if (enough) {
    pts.push({ x: out, y: ty });
  } else {
    // Cíl je „za“ zdrojem — obejde se přes mezeru mezi řádky.
    const midY = ty > sy ? ty - rowHeight / 2 : ty + rowHeight / 2;
    pts.push({ x: out, y: midY }, { x: approach, y: midY }, { x: approach, y: ty });
  }
  pts.push({ x: tx, y: ty });
  return { points: pts, direction: inDir as 1 | -1 };
}

/** Sestaví rozložení diagramu. `today` se vykreslí jako svislá čára, když leží v rozsahu. */
export function ganttLayout(items: GanttItem[], links: GanttLink[], scale: GanttScale, today: Date = new Date(), calendar: WorkCalendar = CZECH_WORKDAYS): GanttLayout {
  const pxPerDay = PX_PER_DAY[scale];
  const dates: Date[] = [today];
  items.forEach((i) => {
    dates.push(i.start, i.finish);
    [i.baselineStart, i.baselineFinish, i.deadline].forEach((d) => d && dates.push(d));
  });
  const min = dates.reduce((a, b) => (dayOf(b).getTime() < a.getTime() ? dayOf(b) : a), dayOf(dates[0]));
  const max = dates.reduce((a, b) => (dayOf(b).getTime() > a.getTime() ? dayOf(b) : a), dayOf(dates[0]));
  const pad = scale === 'day' ? 3 : scale === 'week' ? 7 : 14;
  let rangeStart = addDays(min, -pad);
  rangeStart = scale === 'month' ? startOfMonth(rangeStart) : mondayOf(rangeStart);
  const rangeEnd = addDays(max, pad + 1);
  const totalDays = diffDays(rangeStart, rangeEnd);
  const width = Math.ceil(totalDays * pxPerDay);
  const xOf = (d: Date): number => diffDays(rangeStart, d) * pxPerDay;

  // --- záhlaví
  const top: HeaderCell[] = [];
  const bottom: HeaderCell[] = [];
  if (scale === 'month') {
    let y = rangeStart.getFullYear();
    let cur = rangeStart;
    while (cur.getTime() < rangeEnd.getTime()) {
      const nextYear = new Date(y + 1, 0, 1);
      const end = nextYear.getTime() < rangeEnd.getTime() ? nextYear : rangeEnd;
      top.push({ x: xOf(cur), width: diffDays(cur, end) * pxPerDay, label: String(y) });
      cur = end;
      y++;
    }
    let m = rangeStart;
    while (m.getTime() < rangeEnd.getTime()) {
      const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      bottom.push({ x: xOf(m), width: diffDays(m, next) * pxPerDay, label: MONTHS[m.getMonth()].slice(0, 3) });
      m = next;
    }
  } else {
    let m = rangeStart;
    while (m.getTime() < rangeEnd.getTime()) {
      const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      const end = next.getTime() < rangeEnd.getTime() ? next : rangeEnd;
      top.push({ x: xOf(m), width: diffDays(m, end) * pxPerDay, label: `${MONTHS[m.getMonth()]} ${m.getFullYear()}` });
      m = end;
    }
    if (scale === 'day') {
      for (let d = rangeStart; d.getTime() < rangeEnd.getTime(); d = addDays(d, 1)) {
        bottom.push({ x: xOf(d), width: pxPerDay, label: String(d.getDate()) });
      }
    } else {
      for (let d = rangeStart; d.getTime() < rangeEnd.getTime(); d = addDays(d, 7)) {
        bottom.push({ x: xOf(d), width: 7 * pxPerDay, label: fmt(d) });
      }
    }
  }

  // --- nepracovní dny
  const offDays: { x: number; width: number }[] = [];
  if (scale !== 'month') {
    for (let d = rangeStart; d.getTime() < rangeEnd.getTime(); d = addDays(d, 1)) {
      if (!calendar.isWorkday(d)) {
        const last = offDays[offDays.length - 1];
        const x = xOf(d);
        if (last && Math.abs(last.x + last.width - x) < 0.01) {
          last.width += pxPerDay;
        } else {
          offDays.push({ x, width: pxPerDay });
        }
      }
    }
  }

  // --- pruhy
  const barKey: Record<string, GanttBar> = {};
  const bars: GanttBar[] = items.map((it, row) => {
    const y = row * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;
    const x0 = xOf(it.start);
    const endX = xOf(addDays(dayOf(it.finish), 1));
    const milestone = it.milestone;
    const x = milestone ? endX : x0;
    const w = milestone ? 0 : Math.max(endX - x0, 3);
    const bar: GanttBar = {
      key: it.key,
      row,
      x,
      width: w,
      y,
      milestone,
      doneWidth: milestone ? 0 : (w * Math.max(0, Math.min(100, it.percent))) / 100,
      critical: it.critical,
      baseline: it.baselineStart && it.baselineFinish ? { x: xOf(it.baselineStart), width: Math.max(xOf(addDays(dayOf(it.baselineFinish), 1)) - xOf(it.baselineStart), 3), y: y + BAR_HEIGHT + 1 } : undefined,
      deadlineX: it.deadline ? xOf(addDays(dayOf(it.deadline), 1)) : undefined,
      late: it.lateByDays !== undefined && it.lateByDays > 0,
      tooltip: `${it.wbs} ${it.title} — ${fmt(it.start)}${milestone ? '' : ` – ${fmt(it.finish)}`}, rezerva ${it.totalFloat} d${it.percent > 0 ? `, hotovo ${it.percent} %` : ''}${it.lateByDays ? `, nestíhá termín o ${it.lateByDays} d` : ''}`
    };
    barKey[it.key] = bar;
    return bar;
  });

  // --- šipky závislostí
  const criticalKeys = new Set(items.filter((i) => i.critical).map((i) => i.key));
  const arrows: GanttArrow[] = [];
  links.forEach((l) => {
    const a = barKey[l.fromKey];
    const b = barKey[l.toKey];
    if (a && b) {
      const r = arrowPoints(l.type, a, b);
      arrows.push({ points: r.points, direction: r.direction, critical: criticalKeys.has(l.fromKey) && criticalKeys.has(l.toKey) });
    }
  });

  const t = dayOf(today);
  const todayInRange = t.getTime() >= rangeStart.getTime() && t.getTime() < rangeEnd.getTime();

  return { rangeStart, rangeEnd, width, height: items.length * ROW_HEIGHT, pxPerDay, top, bottom, offDays, todayX: todayInRange ? xOf(t) + pxPerDay / 2 : undefined, bars, arrows };
}

/** Závislosti jako dvojice klíčů řádků (z modelu: id úkolu → klíč). */
export function linksFromDeps(deps: Record<string, Dependency[]>, keyOfId: (id: number) => string | undefined): GanttLink[] {
  const out: GanttLink[] = [];
  Object.keys(deps).forEach((toKey) => {
    deps[toKey].forEach((d) => {
      const fromKey = keyOfId(d.taskId);
      if (fromKey !== undefined) {
        out.push({ fromKey, toKey, type: d.type });
      }
    });
  });
  return out;
}
