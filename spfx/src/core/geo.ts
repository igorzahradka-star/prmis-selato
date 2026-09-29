/**
 * Poloha projektů a podklady pro mapu — čistá logika.
 *
 * Součást vrstvy `core` — bez SharePointu, Reactu a mapové knihovny.
 * Mapa samotná (Leaflet) je jen kreslení; co se na ní má ukázat, se rozhoduje tady.
 */

import { BudgetStatus, Project } from './types';
import { dueLabel, daysBetween } from './format';

/** Souřadnice ve stupních (WGS 84) — tak je vrací mapy i vyhledávání míst. */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Jsou souřadnice použitelné? Prázdné, mimo rozsah a přesně 0/0 (prázdný sloupec
 * v tabulkách se často ukládá jako nula, ale střed Atlantiku není lokalita projektu).
 */
export function isValidCoordinates(latitude: number | undefined, longitude: number | undefined): boolean {
  if (latitude === undefined || longitude === undefined || isNaN(latitude) || isNaN(longitude)) {
    return false;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return false;
  }
  return !(latitude === 0 && longitude === 0);
}

/** Souřadnice projektu, nebo `undefined`, když je nemá (nebo jsou nepoužitelné). */
export function projectCoordinates(p: Pick<Project, 'latitude' | 'longitude'>): Coordinates | undefined {
  return isValidCoordinates(p.latitude, p.longitude)
    ? { latitude: p.latitude as number, longitude: p.longitude as number }
    : undefined;
}

/** Rozdělí projekty na ty, co jdou dát na mapu, a ty, které polohu nemají. */
export function splitByLocation(projects: Project[]): { located: Project[]; missing: Project[] } {
  const located: Project[] = [];
  const missing: Project[] = [];
  projects.forEach((p) => (projectCoordinates(p) ? located : missing).push(p));
  return { located, missing };
}

// --- barvy podle typu projektu --------------------------------------------

/**
 * Barva špendlíku podle typu projektu. Barvy jsou vzájemně dobře rozlišitelné
 * (i pro slabší vnímání barev) a nekřiklavé. Neznámý typ dostane šedou.
 */
export const PROJECT_TYPE_COLORS: Record<string, string> = {
  FVE: '#F2A900',
  BESS: '#1E88E5',
  MVE: '#00ACC1',
  'Vítr': '#7CB342',
  Kogenerace: '#E53935',
  'Připojení DS': '#8E24AA',
  Servis: '#6D4C41',
  'Režie': '#90A4AE',
  'Jiné': '#607D8B'
};

const UNKNOWN_TYPE_COLOR = '#78909C';

/** Barva pro typ; projekt bez typu i neznámý typ mají šedou. */
export function projectTypeColor(projectType: string | undefined): string {
  return (projectType && PROJECT_TYPE_COLORS[projectType]) || UNKNOWN_TYPE_COLOR;
}

/** Popisek typu — projekt bez typu se v legendě nesmí ztratit. */
export function projectTypeLabel(projectType: string | undefined): string {
  return projectType && projectType.trim() ? projectType : 'Bez typu';
}

/** Jeden řádek legendy: typ, jeho barva a kolik projektů na mapě je. */
export interface LegendEntry {
  type: string;
  label: string;
  color: string;
  count: number;
}

/** Legenda jen z typů, které na mapě opravdu jsou; nejčetnější první, při shodě abecedně. */
export function buildLegend(projects: Project[]): LegendEntry[] {
  const counts: Record<string, number> = {};
  projects.forEach((p) => {
    const key = p.projectType && p.projectType.trim() ? p.projectType : '';
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.keys(counts)
    .map((type) => ({
      type,
      label: projectTypeLabel(type),
      color: projectTypeColor(type),
      count: counts[type]
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'cs-CZ'));
}

// --- semafor termínů -------------------------------------------------------

export type Signal = 'green' | 'yellow' | 'red' | 'none';

/** Kolik dní předem se termín považuje za „blíží se" (žlutá). */
export const DEADLINE_WARNING_DAYS = 14;

/**
 * Semafor nejbližšího smluvního termínu:
 * červená = po termínu, žlutá = do 14 dní včetně dneška, zelená = dál, šedá = žádný termín.
 */
export function deadlineSignal(deadline: Date | undefined, today: Date = new Date()): Signal {
  if (!deadline) {
    return 'none';
  }
  const days = daysBetween(today, deadline);
  if (days < 0) {
    return 'red';
  }
  return days <= DEADLINE_WARNING_DAYS ? 'yellow' : 'green';
}

/** Semafor rozpočtu převedený na stejné hodnoty jako semafor termínů. */
export function budgetSignal(status: BudgetStatus | undefined): Signal {
  switch (status) {
    case BudgetStatus.Zelena:
      return 'green';
    case BudgetStatus.Zluta:
      return 'yellow';
    case BudgetStatus.Cervena:
      return 'red';
    default:
      return 'none';
  }
}

// --- obsah bubliny u špendlíku --------------------------------------------

/** Vše, co bublina po najetí na špendlík ukazuje. */
export interface PinInfo {
  projectNumber: string;
  name: string;
  typeLabel: string;
  typeColor: string;
  budgetLabel: string;
  budgetSignal: Signal;
  deadlineLabel: string;
  deadlineSignal: Signal;
  manager: string;
}

/** Název projektu bez čísla na začátku — číslo se ukazuje zvlášť. */
function nameWithoutNumber(p: Project): string {
  const base = p.shortName || p.title;
  const prefix = `${p.projectNumber} `;
  return base.indexOf(prefix) === 0 ? base.slice(prefix.length) : base;
}

export function buildPinInfo(p: Project, today: Date = new Date()): PinInfo {
  return {
    projectNumber: p.projectNumber,
    name: nameWithoutNumber(p),
    typeLabel: projectTypeLabel(p.projectType),
    typeColor: projectTypeColor(p.projectType),
    budgetLabel: p.budgetStatus || BudgetStatus.Bez,
    budgetSignal: budgetSignal(p.budgetStatus),
    deadlineLabel: p.nextDeadline ? dueLabel(p.nextDeadline, today) : 'bez termínu',
    deadlineSignal: deadlineSignal(p.nextDeadline, today),
    manager: p.projectManagerName || '—'
  };
}

/** Barvy semaforu — stejné odstíny jako štítky rozpočtu v seznamu projektů. */
export const SIGNAL_COLORS: Record<Signal, string> = {
  green: '#00A857',
  yellow: '#E8A200',
  red: '#C4314B',
  none: '#9AA3AD'
};

/** Slovní doplněk k barvě semaforu — barva nikdy nestojí sama (barvoslepost, tisk). */
const SIGNAL_TEXT: Record<Signal, string> = {
  green: 'v pořádku',
  yellow: 'pozor',
  red: 'problém',
  none: 'bez hodnocení'
};

function signalDot(signal: Signal): string {
  return (
    `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;` +
    `background:${SIGNAL_COLORS[signal]};margin-right:6px;vertical-align:middle"></span>`
  );
}

/**
 * HTML bubliny, která vyskočí po najetí na špendlík: název, typ, semafor rozpočtu,
 * semafor termínů a projektový manažer. Všechny texty z dat jsou escapované.
 */
export function pinTooltipHtml(info: PinInfo): string {
  const row = (label: string, value: string): string =>
    `<div style="display:flex;justify-content:space-between;gap:14px;margin-top:3px">` +
    `<span style="color:#5A6472">${label}</span><span style="text-align:right">${value}</span></div>`;

  return (
    `<div style="min-width:230px;font-size:12px;line-height:1.4;color:#1B1F2A">` +
    `<div style="font-size:13px;font-weight:600">${escapeHtml(info.projectNumber)} · ${escapeHtml(info.name)}</div>` +
    row(
      'Typ',
      `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;` +
        `background:${info.typeColor};margin-right:6px;vertical-align:middle"></span>${escapeHtml(info.typeLabel)}`
    ) +
    row(
      'Rozpočet',
      `${signalDot(info.budgetSignal)}${escapeHtml(info.budgetLabel)}`
    ) +
    row(
      'Termíny',
      `${signalDot(info.deadlineSignal)}${escapeHtml(info.deadlineLabel)} (${SIGNAL_TEXT[info.deadlineSignal]})`
    ) +
    row('Projektový manažer', escapeHtml(info.manager)) +
    `</div>`
  );
}

/** Escapování textu do HTML — bublina se skládá jako text HTML, názvy projektů píšou lidé. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
