import { RequestStatus, ServiceRequest } from './serviceJobs';
import { PlanItem } from './servicePlan';
import { buildCalendar, buildYear, filterRequests, isoWeekNumber, monthSpan, requestGroupCounts, shiftWeeks, weekStart } from './serviceOverview';

const req = (id: number, site: string, status: RequestStatus, receivedAt: string, requiredDate?: string): ServiceRequest => ({
  id,
  number: `SPO-2026-${String(id).padStart(4, '0')}`,
  siteNumber: site,
  title: `Požadavek ${id}`,
  priority: 'Běžná',
  kind: 'Porucha',
  receivedAt: new Date(receivedAt),
  receivedByName: 'Dispečer',
  requiredDate: requiredDate ? new Date(requiredDate) : undefined,
  status
});

const plan = (id: number, site: string, month: number, dueDate?: string, requestId?: number): PlanItem => ({
  id,
  year: 2026,
  siteNumber: site,
  title: `Plán ${id}`,
  month,
  dueDate: dueDate ? new Date(dueDate) : undefined,
  jobKind: 'Plánovaná',
  requestId
});

const REQUESTS = [
  req(1, '10500', RequestStatus.Prijato, '2026-10-01T08:00:00'),
  req(2, '10500', RequestStatus.Zpracovava, '2026-10-02T08:00:00', '2026-10-15T00:00:00'),
  req(3, '10510', RequestStatus.Vyreseno, '2026-09-20T08:00:00'),
  req(4, '10510', RequestStatus.Zamitnuto, '2026-09-21T08:00:00'),
  req(5, '10510', RequestStatus.Prijato, '2026-10-05T08:00:00', '2026-10-07T00:00:00')
];

describe('seznam požadavků', () => {
  it('skupiny stavů a nejnovější nahoře', () => {
    expect(filterRequests(REQUESTS, 'otevrene', []).map((r) => r.id)).toEqual([5, 2, 1]);
    expect(filterRequests(REQUESTS, 'zadane', []).map((r) => r.id)).toEqual([5, 1]);
    expect(filterRequests(REQUESTS, 'probihajici', []).map((r) => r.id)).toEqual([2]);
    expect(filterRequests(REQUESTS, 'hotove', []).map((r) => r.id)).toEqual([3]);
    expect(filterRequests(REQUESTS, 'vse', []).map((r) => r.id)).toEqual([5, 2, 1, 4, 3]);
  });

  it('filtr lokalit a počty', () => {
    expect(filterRequests(REQUESTS, 'vse', ['10510']).map((r) => r.id)).toEqual([5, 4, 3]);
    expect(requestGroupCounts(REQUESTS, [])).toEqual({ vse: 5, otevrene: 3, zadane: 2, probihajici: 1, hotove: 1 });
    expect(requestGroupCounts(REQUESTS, ['10500'])).toEqual({ vse: 2, otevrene: 2, zadane: 1, probihajici: 1, hotove: 0 });
  });
});

describe('týdny', () => {
  it('pondělí týdne a číslo týdne ISO', () => {
    expect(weekStart(new Date(2026, 9, 15)).getDate()).toBe(12); // čtvrtek 15. 10. 2026 → pondělí 12. 10.
    expect(weekStart(new Date(2026, 9, 18)).getDate()).toBe(12); // neděle patří k týdnu s pondělím 12.
    expect(weekStart(new Date(2026, 9, 12)).getDate()).toBe(12);
    expect(isoWeekNumber(new Date(2026, 9, 15))).toBe(42);
    expect(isoWeekNumber(new Date(2026, 0, 1))).toBe(1);
    expect(isoWeekNumber(new Date(2027, 0, 3))).toBe(53); // neděle 3. 1. 2027 je ještě poslední týden roku 2026
    expect(shiftWeeks(new Date(2026, 9, 15), 1).getDate()).toBe(19);
    expect(shiftWeeks(new Date(2026, 9, 15), -2).getDate()).toBe(28);
  });
});

describe('týdenní kalendář', () => {
  const o = { from: new Date(2026, 9, 15), weeks: 3, sites: [] as string[], showPlan: true, showRequests: true, today: new Date(2026, 9, 15) };

  it('má požadovaný počet týdnů po 7 dnech od pondělí a označí aktuální týden', () => {
    const c = buildCalendar([], [], o);
    expect(c.weeks).toHaveLength(3);
    expect(c.weeks[0].days).toHaveLength(7);
    expect(c.weeks[0].start.getDate()).toBe(12);
    expect(c.weeks.map((w) => w.isCurrent)).toEqual([true, false, false]);
    expect(c.weeks[0].number).toBe(42);
  });

  it('plán s datem je ve svém dni, požadavky podle požadovaného termínu', () => {
    const c = buildCalendar([plan(1, '10500', 10, '2026-10-20T00:00:00')], REQUESTS, o);
    const day = (w: number, d: number): string[] => c.weeks[w].days[d].entries.map((e) => e.key);
    expect(day(1, 1)).toEqual(['plan-1']); // úterý 20. 10.
    expect(day(0, 3)).toEqual(['request-2']); // čtvrtek 15. 10.
  });

  it('požadavky po termínu a bez termínu jsou zvlášť, vyřešené se nezobrazují', () => {
    const c = buildCalendar([], REQUESTS, o);
    expect(c.overdue.map((r) => r.id)).toEqual([5]);
    expect(c.undated.map((r) => r.id)).toEqual([1]);
  });

  it('plán jen s měsícem je zvlášť po měsících a jen když zasahuje do období', () => {
    const c = buildCalendar([plan(1, '10500', 10), plan(2, '10500', 10), plan(3, '10500', 12)], [], o);
    expect(c.monthOnly.map((m) => [m.month, m.items.length])).toEqual([[10, 2]]);
  });

  it('položka plánu, ze které je požadavek, se nezobrazí dvakrát', () => {
    const c = buildCalendar([plan(1, '10500', 10, '2026-10-20T00:00:00', 2)], [], o);
    expect(c.weeks[1].days[1].entries).toEqual([]);
    expect(c.monthOnly).toEqual([]);
  });

  it('filtr lokalit a přepínače plán / požadavky', () => {
    const p = [plan(1, '10500', 10, '2026-10-20T00:00:00'), plan(2, '10510', 10, '2026-10-20T00:00:00')];
    expect(buildCalendar(p, [], { ...o, sites: ['10510'] }).weeks[1].days[1].entries.map((e) => e.key)).toEqual(['plan-2']);
    const bezPlanu = buildCalendar(p, REQUESTS, { ...o, showPlan: false });
    expect(bezPlanu.weeks[1].days[1].entries).toEqual([]);
    expect(bezPlanu.overdue).toHaveLength(1);
    const bezPozadavku = buildCalendar(p, REQUESTS, { ...o, showRequests: false });
    expect(bezPozadavku.overdue).toEqual([]);
    expect(bezPozadavku.undated).toEqual([]);
    expect(bezPozadavku.weeks[1].days[1].entries).toHaveLength(2);
  });

  it('v jednom dni jsou požadavky před plánem', () => {
    const c = buildCalendar([plan(1, '10500', 10, '2026-10-15T00:00:00')], REQUESTS, o);
    expect(c.weeks[0].days[3].entries.map((e) => e.kind)).toEqual(['request', 'plan']);
  });
});

describe('měsíční a roční pohled', () => {
  it('počet týdnů měsíce a pondělí prvního', () => {
    const oct = monthSpan(2026, 9); // říjen 2026: čt 1. 10. – so 31. 10.
    expect(oct.weeks).toBe(5);
    expect(oct.from.getMonth()).toBe(8);
    expect(oct.from.getDate()).toBe(28);
    expect(monthSpan(2027, 1).weeks).toBe(4); // únor 2027: po 1. 2. – ne 28. 2.
    expect(monthSpan(2026, 7).weeks).toBe(6); // srpen 2026: so 1. 8. – po 31. 8. zasahuje do šesti týdnů
  });

  it('roční přehled spočítá dny, požadavky a plán a drží zarovnání měsíců', () => {
    const y = buildYear(
      [plan(1, '10500', 10, '2026-10-20T00:00:00'), { ...plan(2, '10500', 10, '2026-10-20T00:00:00'), jobKind: 'Nahodilá' }, plan(3, '10500', 3)],
      REQUESTS,
      { year: 2026, sites: [], showPlan: true, showRequests: true, today: new Date(2026, 9, 15) }
    );
    expect(y.months).toHaveLength(12);
    expect(y.months[9].days).toHaveLength(31);
    expect(y.months[1].days).toHaveLength(28);
    expect(y.months[9].offset).toBe(3); // 1. 10. 2026 je čtvrtek
    const day20 = y.months[9].days[19];
    expect([day20.planned, day20.extra, day20.requests]).toEqual([1, 1, 0]);
    expect(y.months[9].days[14].requests).toBe(1); // požadavek 2 s termínem 15. 10.
    expect(y.months[2].monthOnly).toBe(1);
    expect(y.totals).toEqual({ planned: 1, extra: 1, requests: 2, monthOnly: 1 });
    expect(y.overdue).toEqual([]); // v ročním pohledu je „po termínu“ jen to, co skončilo před začátkem roku
    expect(y.months[9].days[6].requests).toBe(1); // požadavek 5 s termínem 7. 10.
    expect(y.undated.map((r) => r.id)).toEqual([1]);
  });

  it('filtr lokalit platí i v ročním přehledu', () => {
    const y = buildYear([plan(1, '10500', 10, '2026-10-20T00:00:00'), plan(2, '10510', 10, '2026-10-21T00:00:00')], [], { year: 2026, sites: ['10510'], showPlan: true, showRequests: true });
    expect(y.totals.planned).toBe(1);
    expect(y.months[9].days[20].planned).toBe(1);
  });
});
