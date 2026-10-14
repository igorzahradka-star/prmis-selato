/**
 * SLA servisních požadavků — čistá logika. Aplikace čas jen **měří a indikuje**, žádné sankce.
 *
 * - **Reakce** = od přijetí požadavku po založení prvního servisního listu.
 * - **Vyřešení** = od přijetí požadavku po provedení práce na všech jeho (nezrušených) listech.
 * - Lhůty jsou pravidla v Nastavení → Servis podle druhu a priority požadavku; používá se nejpřesnější shodné pravidlo.
 * - Čas se počítá v běžných hodinách (celý den), ne v pracovní době.
 */

import { JobStatus, RequestStatus, ServiceJob, ServiceRequest } from './serviceJobs';

export interface SlaRule {
  /** Druh požadavku (Porucha, Preventivní prohlídka…); prázdné = všechny druhy. */
  kind?: string;
  /** Priorita (Havárie, Vysoká…); prázdné = všechny priority. */
  priority?: string;
  /** Lhůta reakce v hodinách; prázdné = nesleduje se. */
  reactionHours?: number;
  /** Lhůta vyřešení v hodinách; prázdné = nesleduje se. */
  resolveHours?: number;
}

export interface ServiceSettings {
  slaRules: SlaRule[];
  /** Kořenová složka Servisu v knihovně dokumentů (např. General/02_SERVIS); pod ní vznikají složky lokalit a souborů. */
  folderRoot: string;
}

/** Výchozí lhůty — návrh, upřesní zadavatel v Nastavení → Servis. */
export const DEFAULT_SERVICE_SETTINGS: ServiceSettings = {
  folderRoot: 'General/02_SERVIS',
  slaRules: [
    { priority: 'Havárie', reactionHours: 4, resolveHours: 24 },
    { priority: 'Vysoká', reactionHours: 8, resolveHours: 48 },
    { priority: 'Běžná', reactionHours: 24, resolveHours: 120 },
    { priority: 'Nízká', reactionHours: 48, resolveHours: 240 },
    { kind: 'Preventivní prohlídka' }
  ]
};

/** Doplní chybějící části nastavení Servisu výchozími hodnotami. */
export function serviceSettingsWithDefaults(stored: Partial<ServiceSettings> | undefined): ServiceSettings {
  return {
    slaRules: Array.isArray(stored?.slaRules) ? (stored?.slaRules as SlaRule[]) : DEFAULT_SERVICE_SETTINGS.slaRules.map((r) => ({ ...r })),
    folderRoot: stored?.folderRoot && stored.folderRoot.trim() !== '' ? stored.folderRoot.trim() : DEFAULT_SERVICE_SETTINGS.folderRoot
  };
}

/** Problémy v pravidlech SLA (české věty); prázdné pole = v pořádku. */
export function validateSlaRules(rules: SlaRule[]): string[] {
  const out: string[] = [];
  rules.forEach((r, i) => {
    const label = `Pravidlo SLA č. ${i + 1}`;
    [r.reactionHours, r.resolveHours].forEach((h) => {
      if (h !== undefined && (!isFinite(h) || h <= 0)) {
        out.push(`${label}: lhůta musí být kladné číslo hodin (nebo prázdná).`);
      }
    });
    if (r.reactionHours !== undefined && r.resolveHours !== undefined && r.resolveHours < r.reactionHours) {
      out.push(`${label}: lhůta vyřešení nemůže být kratší než lhůta reakce.`);
    }
  });
  return out;
}

/** Nejpřesnější pravidlo pro požadavek: shoda druhu i priority > jen druh > jen priorita > obecné pravidlo. */
export function matchSlaRule(rules: SlaRule[], request: Pick<ServiceRequest, 'kind' | 'priority'>): SlaRule | undefined {
  let best: SlaRule | undefined;
  let bestScore = -1;
  rules.forEach((r) => {
    if ((r.kind && r.kind !== request.kind) || (r.priority && r.priority !== request.priority)) {
      return;
    }
    const score = (r.kind ? 2 : 0) + (r.priority ? 1 : 0);
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  });
  return best;
}

/** Okamžik první reakce: založení prvního servisního listu požadavku. */
export function requestReactedAt(jobs: Pick<ServiceJob, 'createdAt'>[]): Date | undefined {
  const times = jobs.map((j) => (j.createdAt ? j.createdAt.getTime() : NaN)).filter((t) => !isNaN(t));
  return times.length === 0 ? undefined : new Date(Math.min(...times));
}

const DONE_STATUSES: JobStatus[] = [JobStatus.Provedeno, JobStatus.KFakturaci, JobStatus.Vyfakturovano, JobStatus.Uzavreno];

/** Okamžik vyřešení: poslední provedení, jakmile jsou provedené všechny nezrušené listy; jinak `undefined`. */
export function requestResolvedAt(jobs: Pick<ServiceJob, 'status' | 'doneAt'>[]): Date | undefined {
  const live = jobs.filter((j) => j.status !== JobStatus.Zruseno);
  if (live.length === 0 || live.some((j) => DONE_STATUSES.indexOf(j.status) === -1 || !j.doneAt)) {
    return undefined;
  }
  return new Date(Math.max(...live.map((j) => (j.doneAt as Date).getTime())));
}

/** met = splněno včas, metLate = splněno po lhůtě, breached = běží a lhůta už uplynula, warning = uplynulo 80 % lhůty. */
export type SlaState = 'none' | 'running' | 'warning' | 'breached' | 'met' | 'metLate';

export interface SlaPart {
  limitHours?: number;
  elapsedHours: number;
  state: SlaState;
}

export interface SlaProgress {
  rule?: SlaRule;
  reaction: SlaPart;
  resolve: SlaPart;
}

const HOUR = 3600 * 1000;
const WARNING_SHARE = 0.8;

function part(limit: number | undefined, start: Date, end: Date | undefined, now: Date): SlaPart {
  const elapsedHours = Math.max(0, ((end ?? now).getTime() - start.getTime()) / HOUR);
  if (limit === undefined) {
    return { elapsedHours, state: 'none' };
  }
  if (end) {
    return { limitHours: limit, elapsedHours, state: elapsedHours <= limit ? 'met' : 'metLate' };
  }
  return { limitHours: limit, elapsedHours, state: elapsedHours > limit ? 'breached' : elapsedHours >= limit * WARNING_SHARE ? 'warning' : 'running' };
}

/** Stav SLA požadavku. Zamítnuté požadavky se nesledují. */
export function slaProgress(request: ServiceRequest, jobs: ServiceJob[], rules: SlaRule[], now: Date = new Date()): SlaProgress {
  const own = jobs.filter((j) => j.requestId === request.id);
  if (request.status === RequestStatus.Zamitnuto) {
    return { reaction: { elapsedHours: 0, state: 'none' }, resolve: { elapsedHours: 0, state: 'none' } };
  }
  const rule = matchSlaRule(rules, request);
  return {
    rule,
    reaction: part(rule?.reactionHours, request.receivedAt, requestReactedAt(own), now),
    resolve: part(rule?.resolveHours, request.receivedAt, requestResolvedAt(own), now)
  };
}

/** Je u požadavku právě teď některá lhůta překročená? (pro přehled „SLA po lhůtě“) */
export function isSlaBreached(progress: SlaProgress): boolean {
  return progress.reaction.state === 'breached' || progress.resolve.state === 'breached';
}

/** Hodiny jako text: „3 h“, „2 d 4 h“. */
export function formatHours(hours: number): string {
  const h = Math.round(hours);
  if (h < 48) {
    return `${h} h`;
  }
  const d = Math.floor(h / 24);
  const rest = h - d * 24;
  return rest === 0 ? `${d} d` : `${d} d ${rest} h`;
}
