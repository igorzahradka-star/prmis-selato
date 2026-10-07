/**
 * Kalendář pro harmonogram: pracovní dny (pondělí–pátek mimo české státní svátky) nebo všechny kalendářní dny.
 * Čistá logika bez SharePointu a Reactu. Data jsou dny bez času (v místním čase).
 */

const DAY_MS = 86400000;

/** Datum bez času (půlnoc místního času). */
export function dayOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Přidá kalendářní dny (i záporné). */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Počet kalendářních dnů od `a` do `b` (b − a). */
export function diffDays(a: Date, b: Date): number {
  return Math.round((dayOf(b).getTime() - dayOf(a).getTime()) / DAY_MS);
}

export const sameDay = (a: Date, b: Date): boolean => diffDays(a, b) === 0;

/** Velikonoční neděle (algoritmus Anonymous Gregorian). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** České státní svátky roku (volné dny). Velký pátek je svátek od roku 2016. */
export function czechHolidays(year: number): Date[] {
  const easter = easterSunday(year);
  const fixed: [number, number][] = [
    [1, 1],
    [5, 1],
    [5, 8],
    [7, 5],
    [7, 6],
    [9, 28],
    [10, 28],
    [11, 17],
    [12, 24],
    [12, 25],
    [12, 26]
  ];
  const days = fixed.map(([m, d]) => new Date(year, m - 1, d));
  days.push(addDays(easter, 1));
  if (year >= 2016) {
    days.push(addDays(easter, -2));
  }
  return days;
}

export interface WorkCalendar {
  /** Je den pracovní? */
  isWorkday(d: Date): boolean;
}

/** Všechny dny jsou pracovní (kalendářní dny). */
export const CALENDAR_DAYS: WorkCalendar = { isWorkday: () => true };

const holidayCache = new Map<number, Set<number>>();
function holidaysOf(year: number): Set<number> {
  let set = holidayCache.get(year);
  if (!set) {
    set = new Set(czechHolidays(year).map((d) => dayOf(d).getTime()));
    holidayCache.set(year, set);
  }
  return set;
}

/** Pondělí až pátek mimo české státní svátky. */
export const CZECH_WORKDAYS: WorkCalendar = {
  isWorkday(d: Date): boolean {
    const wd = d.getDay();
    if (wd === 0 || wd === 6) {
      return false;
    }
    return !holidaysOf(d.getFullYear()).has(dayOf(d).getTime());
  }
};

/** Nejbližší pracovní den ve směru `step` (včetně `d`, je-li pracovní). */
function snap(cal: WorkCalendar, d: Date, step: 1 | -1): Date {
  let x = dayOf(d);
  for (let i = 0; i < 4000 && !cal.isWorkday(x); i++) {
    x = addDays(x, step);
  }
  return x;
}

/** První pracovní den od `d` (včetně). */
export const nextWorkday = (cal: WorkCalendar, d: Date): Date => snap(cal, d, 1);
/** Poslední pracovní den do `d` (včetně). */
export const prevWorkday = (cal: WorkCalendar, d: Date): Date => snap(cal, d, -1);

/**
 * Posune o `n` pracovních dnů (i záporně). Výchozí den se nejdřív srovná na pracovní (při kladném posunu dopředu, při záporném dozadu).
 */
export function addWorkdays(cal: WorkCalendar, d: Date, n: number): Date {
  let x = n >= 0 ? snap(cal, d, 1) : snap(cal, d, -1);
  const step = n >= 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    x = snap(cal, addDays(x, step), step);
    left--;
  }
  return x;
}

/** Kolik pracovních dnů je od `a` do `b` (b později = kladné). Oba konce se nejdřív srovnají na pracovní den. */
export function workdaysBetween(cal: WorkCalendar, a: Date, b: Date): number {
  const forward = dayOf(b).getTime() >= dayOf(a).getTime();
  let x = snap(cal, a, 1);
  const y = snap(cal, b, 1);
  if (forward) {
    let n = 0;
    while (x.getTime() < y.getTime() && n < 100000) {
      x = snap(cal, addDays(x, 1), 1);
      n++;
    }
    return n;
  }
  let n = 0;
  let z = y;
  while (z.getTime() < x.getTime() && n < 100000) {
    z = snap(cal, addDays(z, 1), 1);
    n++;
  }
  return -n;
}
