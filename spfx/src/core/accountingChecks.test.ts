import { AbraDoc } from './abraDocs';
import { AbraCorrection, correctionLine } from './abraCorrections';
import { checksTotals, projectChecks } from './accountingChecks';

const doc = (abraId: string, project: string, extra: Partial<AbraDoc> = {}): AbraDoc => ({ id: 1, abraId, type: 'prijata', number: `FP-${abraId}`, projectNumber: project, currency: 'CZK', amountNet: 1000, ...extra });
const fix = (id: number, abraId: string, project: string, status: AbraCorrection['status'], sentAt?: Date): AbraCorrection => ({ id, projectNumber: project, abraId, docNumber: `FP-${abraId}`, note: 'oprava', status, line: correctionLine(doc(abraId, project)), markedByName: 'PM', sentAt });

const projects = [
  { projectNumber: '26001', title: 'Mastířovice', projectManagerName: 'Petr' },
  { projectNumber: '26002', title: 'Boršov', projectManagerName: 'Jana' },
  { projectNumber: '26003', title: 'Bez účetnictví', projectManagerName: 'Karel' }
];
const today = new Date(2026, 9, 17);

describe('kontroly účetnictví napříč projekty', () => {
  const docs = [doc('A', '26001'), doc('B', '26001'), doc('C', '26001', { type: 'zaloha-prijata' }), doc('D', '26002'), doc('E', '26002')];
  const allocations = { '26001': [{ docId: 'A', kind: 'item' as const, targetId: 'i1', amount: 1000, currency: 'CZK' as const }], '26002': undefined };

  it('nepřiřazené řádky bez záloh; přiřazený řádek se nepočítá; projekt bez dat se vynechá', () => {
    const c = projectChecks(projects, docs, allocations, [], today);
    expect(c.map((x) => x.projectNumber).sort()).toEqual(['26001', '26002']);
    expect(c.filter((x) => x.projectNumber === '26001')[0]).toMatchObject({ lines: 2, unassigned: 1, hasProblem: true });
    expect(c.filter((x) => x.projectNumber === '26002')[0]).toMatchObject({ lines: 2, unassigned: 2 });
  });

  it('řádek s otevřenou opravou se nepočítá jako nepřiřazený; opravy se dělí na k odeslání a čekající', () => {
    const corrections = [fix(1, 'B', '26001', 'Označeno'), fix(2, 'D', '26002', 'Odesláno', new Date(2026, 9, 7)), fix(3, 'E', '26002', 'Vyřešeno')];
    const c = projectChecks(projects, docs, allocations, corrections, today);
    const p1 = c.filter((x) => x.projectNumber === '26001')[0];
    const p2 = c.filter((x) => x.projectNumber === '26002')[0];
    expect(p1).toMatchObject({ unassigned: 0, fixToSend: 1, fixWaiting: 0, hasProblem: true });
    expect(p2).toMatchObject({ unassigned: 1, fixToSend: 0, fixWaiting: 1, oldestWaitingDays: 10 });
  });

  it('řazení: nejdéle čekající oprava na účtárně první; souhrn', () => {
    const corrections = [fix(2, 'D', '26002', 'Odesláno', new Date(2026, 9, 7))];
    const c = projectChecks(projects, docs, allocations, corrections, today);
    expect(c[0].projectNumber).toBe('26002');
    expect(checksTotals(c)).toEqual({ projects: 2, unassigned: 2, fixToSend: 0, fixWaiting: 1, oldestWaitingDays: 10 });
  });

  it('projekt úplně přiřazený a bez oprav není problém', () => {
    const c = projectChecks([projects[0]], [doc('A', '26001')], { '26001': [{ docId: 'A', kind: 'item', targetId: 'i1', amount: 1000, currency: 'CZK' }] }, [], today);
    expect(c[0].hasProblem).toBe(false);
    expect(checksTotals(c).projects).toBe(0);
  });
});
