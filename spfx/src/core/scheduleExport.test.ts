import { SCHEDULE_CSV_HEADER, ScheduleExportRow, paginate, scheduleCsv, scheduleFileName } from './scheduleExport';

const d = (m: number, day: number): Date => new Date(2026, m - 1, day);

const row = (over: Partial<ScheduleExportRow> = {}): ScheduleExportRow => ({
  key: 'a',
  wbs: '1',
  title: 'Příprava',
  start: d(10, 5),
  finish: d(10, 7),
  milestone: false,
  critical: true,
  percent: 40,
  totalFloat: 0,
  durationDays: 3,
  predecessors: '',
  ...over
});

describe('export harmonogramu', () => {
  it('CSV má hlavičku, středníky a data ve tvaru RRRR-MM-DD', () => {
    const lines = scheduleCsv([row()]).split('\r\n');
    expect(lines[0].split(';')).toHaveLength(SCHEDULE_CSV_HEADER.length);
    expect(lines[1]).toBe('1;Příprava;Úkol;2026-10-05;2026-10-07;3;;0;ano;40;;;;;');
  });

  it('milník má trvání 0, baseline vyplní odchylku, smluvní termín a nestíhání', () => {
    const lines = scheduleCsv([row({ milestone: true, start: d(10, 9), finish: d(10, 9), baselineStart: d(10, 8), baselineFinish: d(10, 7), deadline: d(10, 8), lateByDays: 1, critical: false, totalFloat: 2, predecessors: '1, 3SS+2' })]).split('\r\n');
    expect(lines[1]).toBe('1;Příprava;Milník;2026-10-09;2026-10-09;0;1, 3SS+2;2;ne;40;2026-10-08;2026-10-07;2;2026-10-08;1');
  });

  it('text se středníkem nebo uvozovkami se uzavře do uvozovek', () => {
    const line = scheduleCsv([row({ title: 'Montáž; "hrubá"' })]).split('\r\n')[1];
    expect(line).toContain('"Montáž; ""hrubá"""');
  });

  it('strany: dělení po daném počtu, prázdný seznam dá jednu prázdnou stranu', () => {
    expect(paginate([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(paginate([], 3)).toEqual([[]]);
  });

  it('název souboru', () => {
    expect(scheduleFileName('26/001', 'pdf')).toBe('Harmonogram_26_001.pdf');
  });
});
