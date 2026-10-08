import { TaskType } from './types';
import { ScheduleRow, buildScheduleModel } from './scheduleRows';
import { addLink, applyOp, linkOf, linkTypeFor, makeRow, removeLink, reorderRows, updateLink } from './ganttEdit';

const d = (m: number, day: number): Date => new Date(2026, m - 1, day);

const row = (key: string, wbs: string, over: Partial<ScheduleRow> = {}): ScheduleRow => ({
  key,
  wbs,
  title: `Úkol ${wbs}`,
  taskType: TaskType.Cinnost,
  durationDays: 3,
  predText: '',
  percentComplete: 0,
  contractual: false,
  watch: false,
  ...over
});

// Po 5. 10. 2026 (pondělí): A 5.–7. 10., B (po A) 8.–12. 10. (3 pracovní dny: čt, pá, po), C samostatně 6.–8. 10.
const base = (): ScheduleRow[] => [row('a', '1', { start: d(10, 5) }), row('b', '2', { predText: '1' }), row('c', '3', { start: d(10, 6) })];
const startOf = (rows: ScheduleRow[], key: string): Date => {
  const m = buildScheduleModel(rows);
  return m.result.tasks[m.idOf[key]].start;
};
const finishOf = (rows: ScheduleRow[], key: string): Date => {
  const m = buildScheduleModel(rows);
  return m.result.tasks[m.idOf[key]].finish;
};

describe('posun pruhu', () => {
  it('úkol bez předchůdců dostane nové zahájení (víkend se přeskočí na pondělí)', () => {
    const r = applyOp(base(), { type: 'move', key: 'c', start: d(10, 10) }); // sobota
    expect(startOf(r, 'c')).toEqual(d(10, 12));
    expect(r.filter((x) => x.key === 'c')[0].start).toEqual(d(10, 12));
  });

  it('úkol s předchůdcem změní prodlevu vazby a dál se řídí předchůdcem', () => {
    const r = applyOp(base(), { type: 'move', key: 'b', start: d(10, 12) });
    expect(startOf(r, 'b')).toEqual(d(10, 12));
    expect(r.filter((x) => x.key === 'b')[0].predText).toBe('1FS+2');
    // posun předchůdce potáhne i následníka
    const later = applyOp(r, { type: 'move', key: 'a', start: d(10, 12) });
    expect(startOf(later, 'b')).toEqual(d(10, 19));
  });

  it('dřív, než předchůdce dovolí, úkol nepůjde (prodleva se zkrátí do záporné — „předstih“ — jen do hranice vazby)', () => {
    const r = applyOp(base(), { type: 'move', key: 'b', start: d(10, 7) });
    expect(startOf(r, 'b')).toEqual(d(10, 7));
    expect(r.filter((x) => x.key === 'b')[0].predText).toBe('1FS-1');
  });

  it('beze změny datumu vrací původní řádky', () => {
    const rows = base();
    expect(applyOp(rows, { type: 'move', key: 'c', start: d(10, 6) })).toBe(rows);
  });

  it('u více předchůdců se upraví ten, který úkol drží', () => {
    const rows = [row('a', '1', { start: d(10, 5), durationDays: 2 }), row('x', '2', { start: d(10, 5), durationDays: 6 }), row('b', '3', { predText: '1, 2' })];
    // b je držená úkolem 2 (končí 12. 10.), zahájení 13. 10.
    expect(startOf(rows, 'b')).toEqual(d(10, 13));
    const r = applyOp(rows, { type: 'move', key: 'b', start: d(10, 15) });
    expect(startOf(r, 'b')).toEqual(d(10, 15));
    expect(r.filter((x) => x.key === 'b')[0].predText).toBe('1, 2FS+2');
  });
});

describe('změna délky, hotovo', () => {
  it('změní trvání v pracovních dnech podle nového konce', () => {
    const r = applyOp(base(), { type: 'resize', key: 'c', finish: d(10, 13) }); // út 6. → po 13. = 6 pracovních dnů
    expect(r.filter((x) => x.key === 'c')[0].durationDays).toBe(6);
    expect(finishOf(r, 'c')).toEqual(d(10, 13));
  });

  it('nejméně 1 den a milník se neprodlužuje', () => {
    const r = applyOp(base(), { type: 'resize', key: 'c', finish: d(10, 1) });
    expect(r.filter((x) => x.key === 'c')[0].durationDays).toBe(1);
    const ms = [row('m', '1', { start: d(10, 5), taskType: TaskType.Milnik, durationDays: 0 })];
    expect(applyOp(ms, { type: 'resize', key: 'm', finish: d(10, 9) })).toBe(ms);
  });

  it('procenta se ořežou na 0–100', () => {
    expect(applyOp(base(), { type: 'percent', key: 'a', percent: 140 })[0].percentComplete).toBe(100);
    expect(applyOp(base(), { type: 'percent', key: 'a', percent: -5 })[0].percentComplete).toBe(0);
  });
});

describe('vazby', () => {
  it('typ podle konců pruhů', () => {
    expect(linkTypeFor('finish', 'start')).toBe('FS');
    expect(linkTypeFor('finish', 'finish')).toBe('FF');
    expect(linkTypeFor('start', 'start')).toBe('SS');
    expect(linkTypeFor('start', 'finish')).toBe('SF');
  });

  it('přidá vazbu a následník se přesune za předchůdce', () => {
    const r = addLink(base(), 'a', 'c', 'FS');
    expect(r.error).toBeUndefined();
    expect(r.rows.filter((x) => x.key === 'c')[0].predText).toBe('1');
    expect(startOf(r.rows, 'c')).toEqual(d(10, 8));
    const ss = addLink(base(), 'a', 'c', 'SS');
    expect(ss.rows.filter((x) => x.key === 'c')[0].predText).toBe('1SS');
  });

  it('odmítne vazbu na sebe, duplicitní vazbu a smyčku', () => {
    expect(addLink(base(), 'a', 'a', 'FS').error).toMatch(/vlastním předchůdcem/);
    expect(addLink(base(), 'a', 'b', 'FS').error).toMatch(/už existuje/);
    expect(addLink(base(), 'b', 'a', 'FS').error).toMatch(/smyčku/);
    const rows = base();
    expect(addLink(rows, 'b', 'a', 'FS').rows).toBe(rows);
  });

  it('změní typ a prodlevu; odebrání poslední vazby ponechá dosavadní termín', () => {
    const t = updateLink(base(), 'a', 'b', { type: 'SS', lagDays: 2 });
    expect(t.filter((x) => x.key === 'b')[0].predText).toBe('1SS+2');
    expect(linkOf(t, 'a', 'b')).toMatchObject({ type: 'SS', lagDays: 2 });
    const bStart = startOf(base(), 'b');
    const removed = removeLink(base(), 'a', 'b');
    const b = removed.filter((x) => x.key === 'b')[0];
    expect(b.predText).toBe('');
    expect(b.start).toEqual(bStart);
    expect(startOf(removed, 'b')).toEqual(bStart);
  });
});

describe('řádky', () => {
  it('přeskládání jednoduchých čísel je přečísluje a vazby zůstanou stejné', () => {
    const rows = base(); // 1 A, 2 B (po 1), 3 C
    const r = reorderRows(rows, 2, 0); // C nahoru
    expect(r.map((x) => x.key)).toEqual(['c', 'a', 'b']);
    expect(r.map((x) => x.wbs)).toEqual(['1', '2', '3']);
    // B je dál za A (A má teď číslo 2)
    expect(r.filter((x) => x.key === 'b')[0].predText).toBe('2');
    expect(startOf(r, 'b')).toEqual(startOf(rows, 'b'));
  });

  it('vlastní čísla (např. 1.1) se při přesunu nemění', () => {
    const rows = [row('a', '1.1', { start: d(10, 5) }), row('b', '1.2', { predText: '1.1' })];
    const r = reorderRows(rows, 1, 0);
    expect(r.map((x) => x.wbs)).toEqual(['1.2', '1.1']);
    expect(r.filter((x) => x.key === 'b')[0].predText).toBe('1.1');
  });

  it('neplatný přesun vrací původní pole; nový řádek dostane další číslo a délku podle konce', () => {
    const rows = base();
    expect(reorderRows(rows, 0, 9)).toBe(rows);
    const n = makeRow(rows, 'n1', d(10, 10), d(10, 14), TaskType.Cinnost); // sobota → pondělí 12. až středa 14.
    expect(n.wbs).toBe('4');
    expect(n.start).toEqual(d(10, 12));
    expect(n.durationDays).toBe(3);
    const ms = makeRow(rows, 'n2', d(10, 9), undefined, TaskType.Milnik);
    expect(ms.durationDays).toBe(0);
  });
});
