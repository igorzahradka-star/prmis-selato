import { GanttItem, ROW_HEIGHT, arrowPoints, ganttLayout, linksFromDeps, PX_PER_DAY } from './ganttLayout';

const d = (m: number, day: number): Date => new Date(2026, m - 1, day);

function item(key: string, start: Date, finish: Date, over: Partial<GanttItem> = {}): GanttItem {
  return { key, wbs: key, title: `Úkol ${key}`, start, finish, milestone: false, critical: false, percent: 0, totalFloat: 0, ...over };
}

describe('rozložení Ganttova diagramu', () => {
  const items = [item('a', d(10, 5), d(10, 7)), item('b', d(10, 8), d(10, 9), { percent: 50, critical: true }), item('m', d(10, 9), d(10, 9), { milestone: true })];

  it('rozsah začíná v pondělí před prvním úkolem a počítá šířku z pixelů na den', () => {
    const l = ganttLayout(items, [], 'day', d(10, 6));
    expect(l.rangeStart.getDay()).toBe(1);
    expect(l.rangeStart.getTime()).toBeLessThanOrEqual(d(10, 5).getTime());
    expect(l.width).toBeCloseTo(Math.ceil(((l.rangeEnd.getTime() - l.rangeStart.getTime()) / 86400000) * PX_PER_DAY.day), 0);
    expect(l.height).toBe(3 * ROW_HEIGHT);
  });

  it('pruh zabírá dny od zahájení do konce včetně; hotová část podle procent; milník je bez šířky na konci dne', () => {
    const l = ganttLayout(items, [], 'day', d(10, 6));
    const a = l.bars[0];
    expect(a.width).toBeCloseTo(3 * PX_PER_DAY.day, 5);
    const b = l.bars[1];
    expect(b.doneWidth).toBeCloseTo(b.width / 2, 5);
    expect(b.x).toBeCloseTo(a.x + 3 * PX_PER_DAY.day, 5);
    const m = l.bars[2];
    expect(m.milestone).toBe(true);
    expect(m.width).toBe(0);
    expect(m.x).toBeCloseTo(b.x + b.width, 5);
    expect(l.bars[1].row).toBe(1);
  });

  it('záhlaví: měsíce nahoře, dny dole; víkendy jako nepracovní pruhy; dnešek jako svislá čára', () => {
    const l = ganttLayout(items, [], 'day', d(10, 6));
    expect(l.top.map((c) => c.label)).toEqual(['září 2026', 'říjen 2026']);
    expect(l.bottom).toHaveLength(Math.round(l.width / PX_PER_DAY.day));
    expect(l.offDays.length).toBeGreaterThan(0);
    expect(l.offDays[0].width % PX_PER_DAY.day).toBe(0);
    expect(l.todayX).toBeDefined();
    const bar6 = l.bars[0].x + PX_PER_DAY.day; // 6. 10.
    expect(l.todayX).toBeCloseTo(bar6 + PX_PER_DAY.day / 2, 5);
  });

  it('měřítko týden a měsíc: týdny po 7 dnech, měsíce pod roky, bez nepracovních pruhů v měsíčním', () => {
    const w = ganttLayout(items, [], 'week', d(10, 6));
    expect(w.bottom[0].width).toBeCloseTo(7 * PX_PER_DAY.week, 5);
    expect(w.bottom[0].label).toMatch(/^\d+\. \d+\.$/);
    const m = ganttLayout(items, [], 'month', d(10, 6));
    expect(m.offDays).toEqual([]);
    expect(m.top[0].label).toBe('2026');
    expect(m.bottom[0].label.length).toBe(3);
    expect(m.rangeStart.getDate()).toBe(1);
  });

  it('baseline pod pruhem a značka smluvního termínu; nestíhání označí pruh', () => {
    const l = ganttLayout([item('a', d(10, 5), d(10, 9), { baselineStart: d(10, 5), baselineFinish: d(10, 7), deadline: d(10, 8), lateByDays: 1 })], [], 'day', d(10, 6));
    const bar = l.bars[0];
    expect(bar.baseline).toBeDefined();
    expect((bar.baseline as { width: number }).width).toBeCloseTo(3 * PX_PER_DAY.day, 5);
    expect(bar.deadlineX).toBeCloseTo(bar.x + 4 * PX_PER_DAY.day, 5);
    expect(bar.late).toBe(true);
    expect(bar.tooltip).toContain('nestíhá termín o 1 d');
  });
});

describe('šipky závislostí', () => {
  const mk = (x: number, w: number, row: number): Parameters<typeof arrowPoints>[1] => ({ key: String(row), row, x, width: w, y: row * ROW_HEIGHT + 7, milestone: false, doneWidth: 0, critical: false, late: false, tooltip: '' });

  it('FS s mezerou je jednoduchý lom: z konce předchůdce dolů do začátku následníka', () => {
    const r = arrowPoints('FS', mk(0, 100, 0), mk(140, 80, 1));
    expect(r.direction).toBe(1);
    expect(r.points[0]).toEqual({ x: 100, y: 15 });
    expect(r.points[r.points.length - 1]).toEqual({ x: 140, y: ROW_HEIGHT + 15 });
    expect(r.points).toHaveLength(4);
  });

  it('FS, když následník začíná dřív, obejde se přes mezeru mezi řádky; šipka míří vždy zleva', () => {
    const r = arrowPoints('FS', mk(0, 100, 0), mk(50, 80, 1));
    expect(r.points.length).toBeGreaterThan(4);
    expect(r.direction).toBe(1);
    expect(r.points[r.points.length - 1]).toEqual({ x: 50, y: ROW_HEIGHT + 15 });
  });

  it('FF a SF vstupují do cíle zprava, SS opouští předchůdce zleva', () => {
    expect(arrowPoints('FF', mk(0, 100, 0), mk(20, 80, 1)).direction).toBe(-1);
    const ss = arrowPoints('SS', mk(40, 100, 0), mk(60, 80, 1));
    expect(ss.points[1].x).toBeLessThan(ss.points[0].x);
    expect(ss.direction).toBe(1);
    expect(arrowPoints('SF', mk(200, 50, 0), mk(0, 80, 1)).direction).toBe(-1);
  });

  it('závislosti z modelu se převedou na dvojice klíčů', () => {
    const links = linksFromDeps({ b: [{ taskId: 11, type: 'SS', lagDays: 0 }], c: [{ taskId: 99, type: 'FS', lagDays: 0 }] }, (id) => (id === 11 ? 'a' : undefined));
    expect(links).toEqual([{ fromKey: 'a', toKey: 'b', type: 'SS' }]);
  });

  it('šipky mezi pruhy jsou v rozložení; kritická jen mezi dvěma kritickými úkoly', () => {
    const items = [item('a', d(10, 5), d(10, 7), { critical: true }), item('b', d(10, 8), d(10, 9), { critical: true }), item('c', d(10, 8), d(10, 9))];
    const l = ganttLayout(items, [{ fromKey: 'a', toKey: 'b', type: 'FS' }, { fromKey: 'a', toKey: 'c', type: 'FS' }], 'day', d(10, 6));
    expect(l.arrows).toHaveLength(2);
    expect(l.arrows[0].critical).toBe(true);
    expect(l.arrows[1].critical).toBe(false);
  });
});
