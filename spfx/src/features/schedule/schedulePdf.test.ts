import { ScheduleExportRow } from '../../core/scheduleExport';
import { ROWS_PER_PAGE, buildSchedulePdfDocument, pdfScale } from './schedulePdf';

const d = (m: number, day: number): Date => new Date(2026, m - 1, day);
const company = { name: 'Revoltum Engineering & Services a.s.', street: '', city: '', zip: '', ico: '', dic: '', claim: '' } as never;

const row = (n: number, over: Partial<ScheduleExportRow> = {}): ScheduleExportRow => ({
  key: `k${n}`,
  wbs: String(n),
  title: `Úkol ${n}`,
  start: d(10, 5 + n),
  finish: d(10, 7 + n),
  milestone: false,
  critical: n % 2 === 0,
  percent: 50,
  totalFloat: 0,
  durationDays: 3,
  predecessors: n > 1 ? String(n - 1) : '',
  ...over
});

describe('PDF harmonogramu', () => {
  const rows = [row(1), row(2), row(3, { milestone: true, deadline: d(10, 20), baselineStart: d(10, 8), baselineFinish: d(10, 9) })];
  const links = [{ fromKey: 'k1', toKey: 'k2', type: 'FS' as const }, { fromKey: 'k2', toKey: 'k3', type: 'FS' as const }];

  it('je A3 na šířku s nadpisem a jednou stranou diagramu', () => {
    const doc = buildSchedulePdfDocument({ projectNumber: '26001', projectTitle: 'Testovací', rows, links, company, today: d(10, 8) });
    expect(doc.pageSize).toBe('A3');
    expect(doc.pageOrientation).toBe('landscape');
    const content = doc.content as { columns?: unknown[] }[];
    expect(content.filter((c) => c.columns && c.columns.length === 2 && (c as { columnGap?: number }).columnGap === 0)).toHaveLength(1);
  });

  it('dlouhý harmonogram se dělí na strany a každá další začíná novou stranou', () => {
    const many = Array.from({ length: ROWS_PER_PAGE + 5 }, (_, i) => row(i + 1));
    const doc = buildSchedulePdfDocument({ projectNumber: '26001', projectTitle: 'Dlouhý', rows: many, links: [], company, today: d(10, 8) });
    const blocks = (doc.content as { columns?: unknown[]; pageBreak?: string }[]).filter((c) => c.columns && c.columns.length === 2 && (c as { columnGap?: number }).columnGap === 0);
    expect(blocks).toHaveLength(2);
    expect(blocks[1].pageBreak).toBe('before');
    expect(blocks[0].pageBreak).toBeUndefined();
  });

  it('měřítko osy podle délky: krátký dny, střední týdny, dlouhý měsíce', () => {
    expect(pdfScale([row(1)], d(10, 6))).toBe('day');
    expect(pdfScale([row(1, { finish: d(12, 31) })], d(10, 6))).toBe('week');
    expect(pdfScale([row(1, { finish: new Date(2029, 5, 1) })], d(10, 6))).toBe('month');
  });

  it('prázdný harmonogram nespadne', () => {
    const doc = buildSchedulePdfDocument({ projectNumber: '26001', projectTitle: 'Prázdný', rows: [], links: [], company, today: d(10, 8) });
    expect(doc.content).toBeDefined();
  });
});
