/**
 * Export harmonogramu (Fáze 4, krok 4d) — čistá logika. Tabulka pro Excel (CSV se středníky, česky, s BOM, stejně jako
 * export rozpočtu) a rozdělení řádků na strany pro PDF. Samotné PDF skládá `features/schedule/schedulePdf.ts`.
 */

import { GanttItem } from './ganttLayout';
import { dayOf, diffDays } from './workCalendar';

/** Řádek harmonogramu pro export: podklad Ganttu + trvání a předchůdci. */
export interface ScheduleExportRow extends GanttItem {
  durationDays: number;
  /** Předchůdci jako text (např. `1, 3SS+2`). */
  predecessors: string;
}

const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
/** Datum pro Excel: `RRRR-MM-DD` (Excel ho pozná a dá se podle něj řadit). */
export const exportDay = (d: Date | undefined): string => (d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '');

function cell(v: string | number): string {
  const s = String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const SCHEDULE_CSV_HEADER = ['WBS', 'Úkol', 'Typ', 'Zahájení', 'Dokončení', 'Trvání (pracovní dny)', 'Předchůdci', 'Rezerva (dny)', 'Kritická cesta', 'Hotovo %', 'Baseline zahájení', 'Baseline dokončení', 'Odchylka dokončení (kal. dny)', 'Smluvní termín', 'Nestíhá termín o (dny)'];

/** Obsah CSV souboru (bez BOM; ten se přidává při stahování). Řádky oddělené `\r\n`. */
export function scheduleCsv(rows: ScheduleExportRow[]): string {
  const lines = [SCHEDULE_CSV_HEADER.map(cell).join(';')];
  rows.forEach((r) => {
    const deviation = r.baselineFinish ? diffDays(dayOf(r.baselineFinish), dayOf(r.finish)) : '';
    lines.push(
      [
        r.wbs,
        r.title,
        r.milestone ? 'Milník' : 'Úkol',
        exportDay(r.start),
        exportDay(r.finish),
        r.milestone ? 0 : r.durationDays,
        r.predecessors,
        r.totalFloat,
        r.critical ? 'ano' : 'ne',
        r.percent,
        exportDay(r.baselineStart),
        exportDay(r.baselineFinish),
        deviation,
        exportDay(r.deadline),
        r.lateByDays && r.lateByDays > 0 ? r.lateByDays : ''
      ]
        .map(cell)
        .join(';')
    );
  });
  return lines.join('\r\n');
}

/** Rozdělí řádky na strany po `perPage`; vždy aspoň jedna (prázdná) strana. */
export function paginate<T>(rows: T[], perPage: number): T[][] {
  const size = Math.max(1, Math.floor(perPage));
  const pages: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    pages.push(rows.slice(i, i + size));
  }
  return pages.length > 0 ? pages : [[]];
}

/** Název souboru bez nepovolených znaků: `Harmonogram_26001.csv`. */
export function scheduleFileName(projectNumber: string, extension: 'csv' | 'pdf'): string {
  return `Harmonogram_${projectNumber.replace(/[^A-Za-z0-9._-]/g, '_')}.${extension}`;
}
