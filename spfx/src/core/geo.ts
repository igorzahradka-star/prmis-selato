/**
 * Poloha projektů a podklady pro mapu — čistá logika.
 *
 * Součást vrstvy `core` — bez SharePointu, Reactu a mapové knihovny.
 * Mapa samotná (Leaflet) je jen kreslení; co se na ní má ukázat, se rozhoduje tady.
 */

import { BudgetStatus, Project, ProjectStatus } from './types';
import { dueLabel, daysBetween, formatDate, formatMoney } from './format';

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

// --- barvy podle stavu projektu --------------------------------------------

/** Vzhled stavu: výplň špendlíku/štítku, jeho obrys a barva textu na výplni. */
export interface StatusStyle {
  fill: string;
  stroke: string;
  text: string;
}

/**
 * Barvy stavů projektu — jedna paleta pro špendlíky na mapě i štítky v seznamu.
 * Nabídka je bílá (jen s obrysem), Příprava nazelenalá, Realizace sytě zelená,
 * Pozastaveno žlutá, Dokončeno tmavě zelená, Reklamace a Storno červené.
 */
export const STATUS_STYLE: Record<ProjectStatus, StatusStyle> = {
  [ProjectStatus.Nabidka]: { fill: '#FFFFFF', stroke: '#6B7785', text: '#3F4A57' },
  [ProjectStatus.Priprava]: { fill: '#CBE9BA', stroke: '#7FB56A', text: '#2E5B1E' },
  [ProjectStatus.Realizace]: { fill: '#2FBF4A', stroke: '#1F8F36', text: '#0B3D14' },
  [ProjectStatus.Pozastaveno]: { fill: '#F7C948', stroke: '#C99A14', text: '#5A4300' },
  [ProjectStatus.Dokonceno]: { fill: '#1B5E3A', stroke: '#0F3F26', text: '#FFFFFF' },
  [ProjectStatus.Reklamace]: { fill: '#E24B4B', stroke: '#A32D2D', text: '#FFFFFF' },
  [ProjectStatus.Storno]: { fill: '#B3261E', stroke: '#7A1712', text: '#FFFFFF' }
};

const UNKNOWN_STATUS_STYLE: StatusStyle = { fill: '#CFD6DD', stroke: '#78909C', text: '#3F4A57' };

/** Vzhled stavu; neznámá hodnota (např. ručně přidaná ve SharePointu) dostane šedou. */
export function statusStyle(status: string | undefined): StatusStyle {
  return STATUS_STYLE[status as ProjectStatus] || UNKNOWN_STATUS_STYLE;
}

/** Stavy v pořadí životního cyklu projektu — tak se ukazují v legendě. */
export const STATUS_ORDER: ProjectStatus[] = [
  ProjectStatus.Nabidka,
  ProjectStatus.Priprava,
  ProjectStatus.Realizace,
  ProjectStatus.Pozastaveno,
  ProjectStatus.Dokonceno,
  ProjectStatus.Reklamace,
  ProjectStatus.Storno
];

/** Popisek typu — projekt bez typu se nesmí ztratit. */
export function projectTypeLabel(projectType: string | undefined): string {
  return projectType && projectType.trim() ? projectType : 'Bez typu';
}

/** Jeden řádek legendy: stav, jeho barvy a kolik projektů na mapě v něm je. */
export interface LegendEntry {
  status: ProjectStatus;
  style: StatusStyle;
  count: number;
}

/** Legenda se všemi stavy v pořadí cyklu (i s nulou) — je pořád stejná a nemění se pod rukama. */
export function buildLegend(projects: Project[]): LegendEntry[] {
  return STATUS_ORDER.map((status) => ({
    status,
    style: STATUS_STYLE[status],
    count: projects.filter((p) => p.status === status).length
  }));
}

// --- více projektů na jednom místě ------------------------------------------

/** Místo špendlíku v hromádce projektů na stejné lokalitě. */
export interface StackSlot {
  /** Pořadí v hromádce od 0; podle čísla projektu vzestupně. */
  index: number;
  /** Kolik projektů je na tomto místě celkem. */
  count: number;
}

/**
 * Seskupí projekty, které leží na stejném místě (do cca 100 m — jedno město zadané
 * hledáním dává vždy tytéž souřadnice), aby se špendlíky nepřekrývaly a nezůstal
 * vidět jen jeden. Klíčem výsledku je číslo projektu.
 */
export function stackSlots(projects: Project[], precision: number = 3): Record<string, StackSlot> {
  const groups: Record<string, Project[]> = {};
  projects.forEach((p) => {
    const c = projectCoordinates(p);
    if (!c) {
      return;
    }
    const key = `${c.latitude.toFixed(precision)},${c.longitude.toFixed(precision)}`;
    (groups[key] = groups[key] || []).push(p);
  });

  const slots: Record<string, StackSlot> = {};
  Object.keys(groups).forEach((key) => {
    const members = groups[key]
      .slice()
      .sort((a, b) => a.projectNumber.localeCompare(b.projectNumber, 'cs-CZ', { numeric: true }));
    members.forEach((p, index) => {
      slots[p.projectNumber] = { index, count: members.length };
    });
  });
  return slots;
}

/** Nejvíc špendlíků, které se v hromádce rozestoupí; další se skládají na poslední, aby hromádka nebyla široká přes půl mapy. */
export const MAX_STACK_SPREAD = 8;

/** Vodorovný posun špendlíku v obrazovkových pixelech. Hromádka je vystředěná na skutečné místo. */
export function stackOffsetPx(slot: StackSlot, stepPx: number = 9): number {
  const visible = Math.min(slot.count, MAX_STACK_SPREAD);
  const position = Math.min(slot.index, MAX_STACK_SPREAD - 1);
  return (position - (visible - 1) / 2) * stepPx;
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
  status: string;
  statusStyle: StatusStyle;
  budgetLabel: string;
  budgetSignal: Signal;
  deadlineLabel: string;
  deadlineSignal: Signal;
  manager: string;
  /** Celková cena projektu (ve výchozí měně přehledů, když ji zná volající). */
  priceLabel: string;
  /** Předpokládaný termín dokončení (plánované ukončení). */
  endLabel: string;
}

/** Název projektu bez čísla na začátku — číslo se ukazuje zvlášť. */
function nameWithoutNumber(p: Project): string {
  const base = p.shortName || p.title;
  const prefix = `${p.projectNumber} `;
  return base.indexOf(prefix) === 0 ? base.slice(prefix.length) : base;
}

/** `priceText` je cena už přepočtená do výchozí měny přehledů; bez ní se ukáže cena v měně projektu. */
export function buildPinInfo(p: Project, today: Date = new Date(), priceText?: string): PinInfo {
  return {
    projectNumber: p.projectNumber,
    name: nameWithoutNumber(p),
    typeLabel: projectTypeLabel(p.projectType),
    status: p.status,
    statusStyle: statusStyle(p.status),
    budgetLabel: p.budgetStatus || BudgetStatus.Bez,
    budgetSignal: budgetSignal(p.budgetStatus),
    deadlineLabel: p.nextDeadline ? dueLabel(p.nextDeadline, today) : 'bez termínu',
    deadlineSignal: deadlineSignal(p.nextDeadline, today),
    manager: p.projectManagerName || '—',
    priceLabel: priceText ?? (p.contractPriceNet === undefined ? '—' : formatMoney(p.contractPriceNet, p.currency)),
    endLabel: p.endDatePlanned ? formatDate(p.endDatePlanned) : 'neuvedeno'
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
 * HTML bubliny, která vyskočí po najetí na špendlík: název, projektový manažer, celková cena, předpokládaný termín dokončení,
 * stav a semafor rozpočtu. Všechny texty z dat jsou escapované.
 */
export function pinTooltipHtml(info: PinInfo): string {
  const row = (label: string, value: string): string =>
    `<div style="display:flex;justify-content:space-between;gap:14px;margin-top:3px">` +
    `<span style="color:#5A6472">${label}</span><span style="text-align:right">${value}</span></div>`;

  return (
    `<div style="min-width:230px;font-size:12px;line-height:1.4;color:#1B1F2A">` +
    `<div style="font-size:13px;font-weight:600">${escapeHtml(info.projectNumber)} · ${escapeHtml(info.name)}</div>` +
    row('Projektový manažer', escapeHtml(info.manager)) +
    row('Celková cena', escapeHtml(info.priceLabel)) +
    row('Dokončení (předpokládané)', escapeHtml(info.endLabel)) +
    row(
      'Stav',
      `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${info.statusStyle.fill};` +
        `border:1px solid ${info.statusStyle.stroke};margin-right:6px;vertical-align:middle"></span>${escapeHtml(info.status)}`
    ) +
    row('Rozpočet', `${signalDot(info.budgetSignal)}${escapeHtml(info.budgetLabel)} (${SIGNAL_TEXT[info.budgetSignal]})`) +
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

// --- slučování špendlíků do skupin ----------------------------------------------------

/** Špendlík v pixelech mapy při aktuálním přiblížení (`map.project(souřadnice, zoom)`). */
export interface PixelPoint {
  id: string;
  x: number;
  y: number;
}

/** Skupina špendlíků, které by se při daném přiblížení překrývaly; `x`, `y` je střed skupiny. */
export interface PointCluster {
  ids: string[];
  x: number;
  y: number;
}

/**
 * Sloučí špendlíky blíž k sobě než `radius` pixelů do skupin. Každý špendlík jde do nejbližší skupiny v dosahu, jinak založí novou;
 * střed skupiny je průměr jejích bodů. Samotný špendlík je skupina o jednom prvku. Pořadí skupin odpovídá pořadí prvního bodu.
 */
export function clusterPoints(points: PixelPoint[], radius: number): PointCluster[] {
  const clusters: { ids: string[]; sumX: number; sumY: number }[] = [];
  points.forEach((p) => {
    let best: { ids: string[]; sumX: number; sumY: number } | undefined;
    let bestDistance = radius;
    clusters.forEach((c) => {
      const dx = c.sumX / c.ids.length - p.x;
      const dy = c.sumY / c.ids.length - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= bestDistance) {
        best = c;
        bestDistance = d;
      }
    });
    if (best) {
      best.ids.push(p.id);
      best.sumX += p.x;
      best.sumY += p.y;
    } else {
      clusters.push({ ids: [p.id], sumX: p.x, sumY: p.y });
    }
  });
  return clusters.map((c) => ({ ids: c.ids, x: c.sumX / c.ids.length, y: c.sumY / c.ids.length }));
}

/** Leží všechny body prakticky na jednom místě (rozdíl menší než ~1 m)? Takovou skupinu přiblížením nerozdělíš. */
export function sameLocation(points: { latitude: number; longitude: number }[], tolerance: number = 0.00001): boolean {
  if (points.length < 2) {
    return true;
  }
  const a = points[0];
  return points.every((p) => Math.abs(p.latitude - a.latitude) <= tolerance && Math.abs(p.longitude - a.longitude) <= tolerance);
}

/**
 * Seznam projektů ve skupině — do bubliny po najetí (bez odkazů) a do vyskakovacího okna po kliknutí (s odkazy na detail).
 * Dlouhý seznam se zkrátí na `max` řádků a řekne, kolik jich ještě je.
 */
export function clusterListHtml(items: PinInfo[], links: boolean, hrefOf: (projectNumber: string) => string, max: number = 12): string {
  const rows = items.slice(0, max).map((info) => {
    const label = `${escapeHtml(info.projectNumber)} · ${escapeHtml(info.name)}`;
    const name = links
      ? `<a href="${escapeHtml(hrefOf(info.projectNumber))}" style="font-weight:600;color:#0030ac">${label}</a>`
      : `<span style="font-weight:600">${label}</span>`;
    return (
      `<div style="margin-top:4px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${info.statusStyle.fill};` +
      `border:1px solid ${info.statusStyle.stroke};margin-right:6px;vertical-align:middle"></span>${name}` +
      `<div style="margin-left:16px;color:#5A6472">${escapeHtml(info.status)} · ${escapeHtml(info.manager)}</div></div>`
    );
  });
  const more = items.length > max ? `<div style="margin-top:6px;color:#5A6472">…a dalších ${items.length - max}</div>` : '';
  return (
    `<div style="min-width:240px;max-width:340px;font-size:12px;line-height:1.35;color:#1B1F2A">` +
    `<div style="font-size:13px;font-weight:700;margin-bottom:2px">${items.length} projektů na tomto místě</div>` +
    rows.join('') +
    more +
    (links ? '' : `<div style="margin-top:6px;color:#5A6472">Kliknutím se mapa přiblíží, nebo se otevře seznam s odkazy.</div>`) +
    `</div>`
  );
}

/**
 * Souřadnice z textu — např. zkopírované z Map Google nebo mapy.cz: „49.4063, 15.4333“, „49,4063; 15,4333“, „49.4063°N, 15.4333°E“,
 * „49.4063 15.4333“. Jižní šířka (S, J) a západní délka (W, Z) dá zápornou hodnotu. Vrací `undefined`, když to nejsou dvě platná čísla.
 */
export function parseCoordinatePair(text: string): Coordinates | undefined {
  // Písmeno světové strany se přilepí k číslu před ním („40.7 N 74.0 W“ → „40.7N 74.0W“).
  const t = (text || '').replace(/[°º]/g, ' ').replace(/(\d)\s+([NSEWJZ])\b/gi, '$1$2').trim();
  if (t === '') {
    return undefined;
  }
  let parts: string[];
  if (t.indexOf(';') !== -1) {
    parts = t.split(';');
  } else if (/,\s/.test(t) || ((t.match(/,/g) || []).length === 1 && t.indexOf('.') !== -1)) {
    parts = t.split(',');
  } else {
    parts = t.split(/\s+/);
  }
  parts = parts.map((p) => p.trim()).filter((p) => p !== '');
  if (parts.length !== 2) {
    return undefined;
  }
  const num = (p: string): number | undefined => {
    const m = p.match(/-?\d+(?:[.,]\d+)?/);
    if (!m) {
      return undefined;
    }
    const v = parseFloat(m[0].replace(',', '.'));
    return /[SJWZ]/i.test(p.replace(m[0], '')) ? -Math.abs(v) : v;
  };
  const lat = num(parts[0]);
  const lng = num(parts[1]);
  return lat !== undefined && lng !== undefined && isValidCoordinates(lat, lng) ? { latitude: lat, longitude: lng } : undefined;
}
