/**
 * PDF harmonogramu (A3 na šířku): vlevo tabulka úkolů (WBS, název, zahájení, dokončení, trvání, předchůdci), vpravo Ganttův diagram
 * nakreslený vektorově (pruhy, milníky, šipky závislostí, kritická cesta červeně, baseline, smluvní termíny, víkendy a svátky, dnešek).
 * Rozložení počítá `core/ganttLayout.ts`, souřadnice se jen zmenší tak, aby diagram vyšel na šířku strany. Dlouhý harmonogram
 * se dělí na strany po `ROWS_PER_PAGE` řádcích; časová osa je na všech stranách stejná.
 */

import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';

import { CompanySettings } from '../../core/settings';
import { formatDate } from '../../core/format';
import { GanttLink, GanttScale, ROW_HEIGHT, ganttLayout } from '../../core/ganttLayout';
import { ScheduleExportRow, paginate } from '../../core/scheduleExport';
import { BLUE, GRAY, NAVY, documentFooter, renderPdfDefinition } from '../orders/pdfCommon';

const RED = '#C8102E';
const AMBER = '#F2A900';
const GREEN = '#008a00';
const PALE = '#CFE3F2';
const PALE_CRIT = '#F4C9D1';

/** A3 na šířku: 1190 × 842 pt. */
const PAGE_WIDTH = 1190;
const MARGIN = 28;
export const ROWS_PER_PAGE = 30;
const ROW_H = 19;
const HEAD_H = 30;
const COLS = [{ w: 30 }, { w: 196 }, { w: 58 }, { w: 58 }, { w: 28 }, { w: 54 }];
const LEFT_W = COLS.reduce((s, c) => s + c.w, 0);
const CHART_W = PAGE_WIDTH - 2 * MARGIN - LEFT_W;

/** Měřítko osy podle délky harmonogramu, ať jsou popisky čitelné. */
export function pdfScale(items: ScheduleExportRow[], today: Date): GanttScale {
  const dates = [today.getTime()];
  items.forEach((i) => dates.push(i.start.getTime(), i.finish.getTime()));
  const days = (Math.max.apply(null, dates) - Math.min.apply(null, dates)) / 86400000;
  return days <= 75 ? 'day' : days <= 500 ? 'week' : 'month';
}

const cellText = (text: string, opts: Partial<TableCell> & { alignment?: 'left' | 'right' | 'center' } = {}): TableCell => ({ text, fontSize: 8, margin: [3, 2, 3, 0], noWrap: true, ...opts } as TableCell);

/** Sestaví definici PDF. `today` je jen pro svislou čáru „dnes“ a datum vytvoření. */
export function buildSchedulePdfDocument(args: {
  projectNumber: string;
  projectTitle: string;
  rows: ScheduleExportRow[];
  links: GanttLink[];
  company: CompanySettings;
  today?: Date;
  generatedBy?: string;
}): TDocumentDefinitions {
  const today = args.today ?? new Date();
  const scale = pdfScale(args.rows, today);
  const layout = ganttLayout(args.rows, args.links, scale, today);
  const kx = CHART_W / layout.width;
  const ky = ROW_H / ROW_HEIGHT;
  const pages = paginate(args.rows, ROWS_PER_PAGE);
  const content: Content[] = [];

  const legend: Content = {
    columns: [
      { text: 'Pruh = úkol (tmavě hotová část) · ◆ milník · červeně kritická cesta · šedý pruh pod úkolem = baseline · svislá značka = smluvní termín (červeně, když se nestíhá) · zelená čárkovaná čára = dnes', fontSize: 8, color: GRAY }
    ],
    margin: [0, 6, 0, 0]
  };

  const headTable = (): Content => ({
    table: {
      widths: layout.top.map((c) => c.width * kx),
      heights: HEAD_H / 2,
      body: [layout.top.map((c, i) => ({ text: c.width * kx > 40 ? c.label : '', fontSize: 8, bold: true, color: NAVY, margin: [3, 3, 0, 0], noWrap: true, fillColor: i % 2 ? '#E6EEF5' : '#F3F8FC' } as TableCell))]
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 }
  });
  const headBottom = (): Content => ({
    table: {
      widths: layout.bottom.map((c) => c.width * kx),
      heights: HEAD_H / 2,
      body: [layout.bottom.map((c, i) => ({ text: c.width * kx >= 12 ? c.label : '', fontSize: 6.5, color: GRAY, alignment: 'center', margin: [0, 3, 0, 0], noWrap: true, fillColor: i % 2 ? '#FFFFFF' : '#F7FAFC' } as TableCell))]
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 }
  });

  pages.forEach((pageRows, pageIndex) => {
    const offset = pageIndex * ROWS_PER_PAGE;
    const height = pageRows.length * ROW_H;

    // --- tabulka vlevo
    const head: TableCell[] = ['WBS', 'Úkol', 'Zahájení', 'Dokončení', 'Dny', 'Předch.'].map((t, i) => ({
      text: t,
      bold: true,
      fontSize: 8,
      color: '#FFFFFF',
      fillColor: NAVY,
      margin: [3, 9, 3, 0],
      alignment: i === 4 ? 'right' : 'left'
    } as TableCell));
    const body: TableCell[][] = [head];
    pageRows.forEach((r, i) => {
      const fill = i % 2 ? '#FAFAFA' : '#FFFFFF';
      const color = r.critical ? RED : '#1F2933';
      body.push([
        cellText(r.wbs, { color: GRAY, fillColor: fill }),
        cellText(r.title || '(bez názvu)', { bold: r.milestone, color, fillColor: fill }),
        cellText(formatDate(r.start), { fillColor: fill }),
        cellText(r.milestone ? '' : formatDate(r.finish), { fillColor: fill }),
        cellText(r.milestone ? '' : String(r.durationDays), { alignment: 'right', fillColor: fill }),
        cellText(r.predecessors, { color: GRAY, fillColor: fill })
      ]);
    });
    const left: Content = {
      table: { widths: COLS.map((c) => c.w), heights: (row: number) => (row === 0 ? HEAD_H : ROW_H), body },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 }
    };

    // --- diagram vpravo (canvas pod hlavičkou)
    const canvas: object[] = [];
    pageRows.forEach((_, i) => canvas.push({ type: 'rect', x: 0, y: i * ROW_H, w: CHART_W, h: ROW_H, color: i % 2 ? '#FAFAFA' : '#FFFFFF' }));
    layout.offDays.forEach((o) => canvas.push({ type: 'rect', x: o.x * kx, y: 0, w: o.width * kx, h: height, color: '#E8EDF2', fillOpacity: 0.8 }));
    if (layout.todayX !== undefined) {
      canvas.push({ type: 'line', x1: layout.todayX * kx, y1: 0, x2: layout.todayX * kx, y2: height, lineWidth: 1.2, lineColor: GREEN, dash: { length: 3, space: 2 } });
    }
    const here = (row: number): boolean => row >= offset && row < offset + pageRows.length;
    layout.arrows.forEach((a) => {
      const ys = a.points.map((p) => p.y);
      const minRow = Math.floor(Math.min.apply(null, ys) / ROW_HEIGHT);
      const maxRow = Math.floor(Math.max.apply(null, ys) / ROW_HEIGHT);
      if (!here(minRow) || !here(maxRow)) {
        return;
      }
      const pts = a.points.map((p) => ({ x: p.x * kx, y: (p.y - offset * ROW_HEIGHT) * ky }));
      const col = a.critical ? RED : '#6B7785';
      canvas.push({ type: 'polyline', lineWidth: 0.8, lineColor: col, closePath: false, points: pts });
      const end = pts[pts.length - 1];
      const dir = a.direction;
      canvas.push({ type: 'polyline', closePath: true, color: col, lineWidth: 0.3, lineColor: col, points: [end, { x: end.x - dir * 4, y: end.y - 2.2 }, { x: end.x - dir * 4, y: end.y + 2.2 }] });
    });
    layout.bars.forEach((b) => {
      if (!here(b.row)) {
        return;
      }
      const y = (b.row - offset) * ROW_H + (ROW_H - 10) / 2;
      const x = b.x * kx;
      const w = b.width * kx;
      const color = b.critical ? RED : BLUE;
      if (b.baseline) {
        canvas.push({ type: 'rect', x: b.baseline.x * kx, y: y + 11, w: Math.max(b.baseline.width * kx, 1), h: 2, color: '#9AA3AD' });
      }
      if (b.deadlineX !== undefined) {
        canvas.push({ type: 'line', x1: b.deadlineX * kx, y1: y - 3, x2: b.deadlineX * kx, y2: y + 13, lineWidth: 1.4, lineColor: b.late ? RED : AMBER });
      }
      if (b.milestone) {
        canvas.push({ type: 'polyline', closePath: true, color: b.late ? RED : NAVY, lineWidth: 0.8, lineColor: color, points: [{ x, y: y - 1 }, { x: x + 6, y: y + 5 }, { x, y: y + 11 }, { x: x - 6, y: y + 5 }] });
      } else {
        const wide = Math.max(w, 1.5);
        canvas.push({ type: 'rect', x, y, w: wide, h: 10, r: 1.5, color: b.critical ? PALE_CRIT : PALE, lineWidth: 0.7, lineColor: color });
        if (b.doneWidth > 0) {
          canvas.push({ type: 'rect', x, y, w: Math.max((b.doneWidth * kx), 0.5), h: 10, r: 1.5, color });
        }
      }
    });

    const right: Content = { stack: [headTable(), headBottom(), { canvas, margin: [0, 0, 0, 0] } as Content] };

    content.push({
      columns: [
        { width: LEFT_W, stack: [left] },
        { width: CHART_W, stack: [right] }
      ],
      columnGap: 0,
      pageBreak: pageIndex > 0 ? 'before' : undefined
    } as Content);
  });
  content.push(legend);

  const title: Content = {
    columns: [
      { stack: [{ text: `Harmonogram projektu ${args.projectNumber}`, fontSize: 16, bold: true, color: NAVY }, { text: args.projectTitle, fontSize: 10, color: GRAY }], width: '*' },
      { text: `${args.company.name}\nVytvořeno ${formatDate(today)}${args.generatedBy ? ` · ${args.generatedBy}` : ''}`, fontSize: 8, color: GRAY, alignment: 'right', width: 'auto' }
    ],
    margin: [0, 0, 0, 8]
  };

  return {
    pageSize: 'A3',
    pageOrientation: 'landscape',
    pageMargins: [MARGIN, MARGIN, MARGIN, 40],
    info: { title: `Harmonogram ${args.projectNumber}` },
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    content: [title, ...content],
    footer: documentFooter(args.company)
  };
}

/** Vykreslí PDF harmonogramu. */
export function renderSchedulePdf(args: Parameters<typeof buildSchedulePdfDocument>[0]): Promise<Blob> {
  return renderPdfDefinition(buildSchedulePdfDocument(args));
}
