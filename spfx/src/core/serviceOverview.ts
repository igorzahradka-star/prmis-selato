/**
 * Přehledy Servisu pro dispečera — čistá logika: skupiny stavů požadavků a týdenní kalendář (plánované servisy z ročního plánu + přijaté
 * a rozpracované požadavky). Žádné zápisy, jen řazení a rozdělení do týdnů a dnů.
 */

import { RequestStatus, ServiceRequest } from './serviceJobs';
import { PlanItem, itemRange } from './servicePlan';

// --- seznam požadavků -------------------------------------------------------------------------------------------

export type RequestGroup = 'vse' | 'otevrene' | 'zadane' | 'probihajici' | 'hotove';

/** Skupiny stavů pro přehled: otevřené = zadané + probíhající; zadané = přijaté, ještě bez listu; hotové = vyřešené. Zamítnuté jsou jen ve skupině Vše. */
export const REQUEST_GROUPS: { key: RequestGroup; label: string; statuses: RequestStatus[] }[] = [
  { key: 'otevrene', label: 'Otevřené', statuses: [RequestStatus.Prijato, RequestStatus.Zpracovava] },
  { key: 'zadane', label: 'Zadané', statuses: [RequestStatus.Prijato] },
  { key: 'probihajici', label: 'Probíhající', statuses: [RequestStatus.Zpracovava] },
  { key: 'hotove', label: 'Hotové', statuses: [RequestStatus.Vyreseno] },
  { key: 'vse', label: 'Vše', statuses: [RequestStatus.Prijato, RequestStatus.Zpracovava, RequestStatus.Vyreseno, RequestStatus.Zamitnuto] }
];

/** Požadavky ve skupině stavů a v lokalitách (prázdný výběr lokalit = všechny); nejnovější nahoře. */
export function filterRequests(requests: ServiceRequest[], group: RequestGroup, sites: string[]): ServiceRequest[] {
  const def = REQUEST_GROUPS.filter((g) => g.key === group)[0];
  return requests
    .filter((r) => def.statuses.indexOf(r.status) >= 0 && (sites.length === 0 || sites.indexOf(r.siteNumber) >= 0))
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
}

/** Počty požadavků v jednotlivých skupinách (pro označení záložek) při daném výběru lokalit. */
export function requestGroupCounts(requests: ServiceRequest[], sites: string[]): Record<RequestGroup, number> {
  const out = {} as Record<RequestGroup, number>;
  REQUEST_GROUPS.forEach((g) => {
    out[g.key] = filterRequests(requests, g.key, sites).length;
  });
  return out;
}

// --- týdenní kalendář -----------------------------------------------------------------------------------------

const DAY_MS = 24 * 3600 * 1000;
const dayOnly = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Pondělí týdne, ve kterém datum leží. */
export function weekStart(d: Date): Date {
  const day = dayOnly(d);
  const dow = (day.getDay() + 6) % 7; // pondělí = 0
  return addDays(day, -dow);
}

/** Číslo týdne podle ISO 8601. */
export function isoWeekNumber(d: Date): number {
  const thursday = addDays(weekStart(d), 3);
  const week1Monday = weekStart(new Date(thursday.getFullYear(), 0, 4));
  return 1 + Math.round((weekStart(thursday).getTime() - week1Monday.getTime()) / (7 * DAY_MS));
}

export type CalendarEntryKind = 'plan' | 'request';

export interface CalendarEntry {
  kind: CalendarEntryKind;
  /** Jedinečný klíč (`plan-12`, `request-5`). */
  key: string;
  date: Date;
  title: string;
  siteNumber: string;
  deviceNumber?: string;
  /** Plán: Plánovaná / Nahodilá. Požadavek: priorita. */
  badge: string;
  /** Číslo požadavku (jen u požadavků). */
  requestNumber?: string;
  status?: string;
}

export interface CalendarDay {
  date: Date;
  entries: CalendarEntry[];
}

export interface CalendarWeek {
  start: Date;
  end: Date;
  number: number;
  isCurrent: boolean;
  days: CalendarDay[];
}

export interface CalendarOptions {
  /** Libovolné datum v prvním zobrazeném týdnu. */
  from: Date;
  weeks: number;
  /** Lokality; prázdné = všechny. */
  sites: string[];
  showPlan: boolean;
  showRequests: boolean;
  today?: Date;
}

export interface CalendarData {
  weeks: CalendarWeek[];
  /** Položky plánu, které mají jen měsíc (bez dne) — po měsících, které zasahují do zobrazeného období. */
  monthOnly: { year: number; month: number; items: PlanItem[] }[];
  /** Otevřené požadavky s termínem před začátkem období. */
  overdue: ServiceRequest[];
  /** Otevřené požadavky bez požadovaného termínu. */
  undated: ServiceRequest[];
}

const isOpen = (r: ServiceRequest): boolean => r.status === RequestStatus.Prijato || r.status === RequestStatus.Zpracovava;

/**
 * Týdny od `from` s položkami po dnech. Do dnů patří položky plánu s konkrétním datem; ty, které mají jen měsíc, jsou zvlášť (`monthOnly`),
 * protože nemají den. Položka plánu, ze které už vznikl požadavek, se nezobrazuje dvakrát — v kalendáři je jako požadavek. Požadavky:
 * jen otevřené (přijaté a zpracovávané), podle požadovaného termínu; bez termínu a po termínu jsou zvlášť.
 */
export function buildCalendar(plan: PlanItem[], requests: ServiceRequest[], o: CalendarOptions): CalendarData {
  const today = dayOnly(o.today ?? new Date());
  const first = weekStart(o.from);
  const last = addDays(first, o.weeks * 7 - 1);
  const inScope = (site: string): boolean => o.sites.length === 0 || o.sites.indexOf(site) >= 0;

  const weeks: CalendarWeek[] = [];
  for (let w = 0; w < o.weeks; w++) {
    const start = addDays(first, w * 7);
    weeks.push({
      start,
      end: addDays(start, 6),
      number: isoWeekNumber(start),
      isCurrent: today.getTime() >= start.getTime() && today.getTime() <= addDays(start, 6).getTime(),
      days: Array.from({ length: 7 }, (_, i) => ({ date: addDays(start, i), entries: [] as CalendarEntry[] }))
    });
  }
  const place = (e: CalendarEntry): void => {
    const idx = Math.round((dayOnly(e.date).getTime() - first.getTime()) / DAY_MS);
    if (idx >= 0 && idx < o.weeks * 7) {
      weeks[Math.floor(idx / 7)].days[idx % 7].entries.push(e);
    }
  };

  const monthOnly: CalendarData['monthOnly'] = [];
  if (o.showPlan) {
    plan
      .filter((p) => inScope(p.siteNumber) && !p.requestId)
      .forEach((p) => {
        if (p.dueDate) {
          place({ kind: 'plan', key: `plan-${p.id}`, date: p.dueDate, title: p.title, siteNumber: p.siteNumber, deviceNumber: p.deviceNumber, badge: p.jobKind });
          return;
        }
        const range = itemRange(p);
        if (range.to.getTime() < first.getTime() || range.from.getTime() > last.getTime()) {
          return;
        }
        let bucket = monthOnly.filter((m) => m.year === p.year && m.month === p.month)[0];
        if (!bucket) {
          bucket = { year: p.year, month: p.month, items: [] };
          monthOnly.push(bucket);
        }
        bucket.items.push(p);
      });
    monthOnly.sort((a, b) => a.year - b.year || a.month - b.month);
  }

  const overdue: ServiceRequest[] = [];
  const undated: ServiceRequest[] = [];
  if (o.showRequests) {
    requests
      .filter((r) => isOpen(r) && inScope(r.siteNumber))
      .forEach((r) => {
        if (!r.requiredDate) {
          undated.push(r);
        } else if (dayOnly(r.requiredDate).getTime() < first.getTime()) {
          overdue.push(r);
        } else {
          place({ kind: 'request', key: `request-${r.id}`, date: r.requiredDate, title: r.title, siteNumber: r.siteNumber, deviceNumber: r.deviceNumber, badge: r.priority, requestNumber: r.number, status: r.status });
        }
      });
    const byDate = (a: ServiceRequest, b: ServiceRequest): number => (a.requiredDate ? a.requiredDate.getTime() : 0) - (b.requiredDate ? b.requiredDate.getTime() : 0) || a.receivedAt.getTime() - b.receivedAt.getTime();
    overdue.sort(byDate);
    undated.sort(byDate);
  }
  weeks.forEach((w) => w.days.forEach((d) => d.entries.sort((a, b) => (a.kind === b.kind ? a.title.localeCompare(b.title, 'cs-CZ') : a.kind === 'request' ? -1 : 1))));
  return { weeks, monthOnly, overdue, undated };
}

/** Pondělí týdne posunutého o `n` týdnů (kladné = dopředu); pro tlačítka předchozí a další. */
export function shiftWeeks(d: Date, n: number): Date {
  return addDays(weekStart(d), n * 7);
}
