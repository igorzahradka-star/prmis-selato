/**
 * Roční plán servisu — čistá logika. Plán má každá lokalita nebo každý soubor na každý kalendářní rok: seznam plánovaných činností
 * (revize, pravidelné kontroly a opravy…) s obdobím (jen měsíc, nebo konkrétní datum) a druhem (v paušálu / nahodilé).
 * Plán jde načíst ze **šablony** (FVE, BESS…), zkopírovat do dalšího roku a z položky plánu vytvořit servisní požadavek.
 */

export const PLAN_JOB_KINDS = ['Plánovaná', 'Nahodilá'] as const;

export const MONTH_NAMES = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
export const MONTH_SHORT = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čvn', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro'];

export interface PlanItem {
  id: number;
  year: number;
  siteNumber: string;
  /** Prázdné = činnost se týká celé lokality. */
  deviceNumber?: string;
  /** Popis preventivního úkonu. */
  title: string;
  description?: string;
  /** Měsíc 1–12 (u konkrétního data je to měsíc data). */
  month: number;
  /** Konkrétní termín; bez něj stačí měsíc. */
  dueDate?: Date;
  /** Plánovaná = v paušálu, Nahodilá = mimo paušál. */
  jobKind: string;
  /** Požadavek vytvořený z této položky. */
  requestId?: number;
  requestNumber?: string;
  note?: string;
}

export interface PlanTemplateItem {
  title: string;
  description?: string;
  month: number;
  /** Den v měsíci, když se činnost plánuje na konkrétní datum. */
  day?: number;
  jobKind: string;
}

export interface PlanTemplate {
  /** Název šablony, např. „Fotovoltaická elektrárna (FVE)“. */
  name: string;
  /** Pro jaký druh souboru je určena (FVE, BESS, MVE, Kogenerace, Jiné) nebo „Lokalita“ pro společné činnosti. */
  kind: string;
  items: PlanTemplateItem[];
}

/** Výchozí šablony — návrh, který administrátor upraví v Nastavení → Servis. */
export const DEFAULT_PLAN_TEMPLATES: PlanTemplate[] = [
  {
    name: 'Fotovoltaická elektrárna (FVE)',
    kind: 'FVE',
    items: [
      { title: 'Roční prohlídka a kontrola FVE (panely, konstrukce, kabeláž)', month: 4, jobKind: 'Plánovaná' },
      { title: 'Kontrola a servis střídačů', month: 5, jobKind: 'Plánovaná' },
      { title: 'Termovizní kontrola panelů a rozvaděčů', month: 7, jobKind: 'Plánovaná' },
      { title: 'Revize elektrického zařízení (výchozí a pravidelná)', month: 9, jobKind: 'Plánovaná' },
      { title: 'Kontrola monitoringu a komunikace', month: 11, jobKind: 'Plánovaná' },
      { title: 'Čištění panelů', month: 6, jobKind: 'Nahodilá' }
    ]
  },
  {
    name: 'Bateriové úložiště (BESS)',
    kind: 'BESS',
    items: [
      { title: 'Roční prohlídka BESS (baterie, měniče, chlazení)', month: 3, jobKind: 'Plánovaná' },
      { title: 'Kontrola stavu baterií a kapacity (SoH)', month: 6, jobKind: 'Plánovaná' },
      { title: 'Revize elektrického zařízení a hasicího systému', month: 9, jobKind: 'Plánovaná' },
      { title: 'Aktualizace řídicího SW a kontrola komunikace', month: 11, jobKind: 'Plánovaná' }
    ]
  },
  {
    name: 'Lokalita — společné činnosti',
    kind: 'Lokalita',
    items: [
      { title: 'Kontrola EZS a CCTV', month: 3, jobKind: 'Plánovaná' },
      { title: 'Údržba zeleně (sečení trávy) — jaro', month: 5, jobKind: 'Plánovaná' },
      { title: 'Údržba zeleně (sečení trávy) — léto', month: 8, jobKind: 'Plánovaná' },
      { title: 'Kontrola oplocení a přístupových cest', month: 10, jobKind: 'Plánovaná' }
    ]
  }
];

/** Doplní chybějící šablony výchozími (pokud nastavení šablony ještě nemá). */
export function planTemplatesWithDefaults(stored: PlanTemplate[] | undefined): PlanTemplate[] {
  return Array.isArray(stored) ? stored : DEFAULT_PLAN_TEMPLATES.map((t) => ({ ...t, items: t.items.map((i) => ({ ...i })) }));
}

/** Kontrola šablon (české věty); prázdné pole = v pořádku. */
export function validatePlanTemplates(templates: PlanTemplate[]): string[] {
  const out: string[] = [];
  const names = new Set<string>();
  templates.forEach((t, i) => {
    const label = `Šablona plánu č. ${i + 1}`;
    if (t.name.trim() === '') {
      out.push(`${label}: vyplňte název.`);
    } else if (names.has(t.name.trim().toLocaleLowerCase('cs-CZ'))) {
      out.push(`${label}: název „${t.name}“ už existuje.`);
    }
    names.add(t.name.trim().toLocaleLowerCase('cs-CZ'));
    t.items.forEach((it, k) => {
      if (it.title.trim() === '') {
        out.push(`${label}, položka ${k + 1}: vyplňte činnost.`);
      }
      if (!(it.month >= 1 && it.month <= 12)) {
        out.push(`${label}, položka ${k + 1}: měsíc musí být 1 až 12.`);
      }
    });
  });
  return out;
}

const daysInMonth = (year: number, month: number): number => new Date(year, month, 0).getDate();

/** Datum v roce a měsíci; den se ořízne na poslední den měsíce (29. 2. v nepřestupném roce → 28. 2.). */
export function dateIn(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, Math.min(Math.max(1, day), daysInMonth(year, month)));
}

/** Období položky pro kalendář: celý měsíc, nebo jeden den. */
export function itemRange(item: Pick<PlanItem, 'year' | 'month' | 'dueDate'>): { from: Date; to: Date } {
  if (item.dueDate) {
    const d = new Date(item.dueDate.getFullYear(), item.dueDate.getMonth(), item.dueDate.getDate());
    return { from: d, to: d };
  }
  return { from: new Date(item.year, item.month - 1, 1), to: new Date(item.year, item.month - 1, daysInMonth(item.year, item.month)) };
}

/** Text období: „říjen 2026“ nebo „15. 10. 2026“. */
export function periodLabel(item: Pick<PlanItem, 'year' | 'month' | 'dueDate'>): string {
  if (item.dueDate) {
    return `${item.dueDate.getDate()}. ${item.dueDate.getMonth() + 1}. ${item.dueDate.getFullYear()}`;
  }
  return `${MONTH_NAMES[item.month - 1]} ${item.year}`;
}

export type PlanItemState = 'hotovo' | 'po-terminu' | 'tento-mesic' | 'budouci';

/** Stav položky: hotovo = už je z ní požadavek; po termínu = období skončilo a požadavek nevznikl; tento měsíc; budoucí. */
export function planItemState(item: PlanItem, today: Date = new Date()): PlanItemState {
  if (item.requestId) {
    return 'hotovo';
  }
  const range = itemRange(item);
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (range.to.getTime() < day.getTime()) {
    return 'po-terminu';
  }
  return range.from.getTime() <= day.getTime() ? 'tento-mesic' : 'budouci';
}

export interface PlanScopeFilter {
  year: number;
  /** Prázdné = všechny lokality. */
  site: string;
  /** Prázdné = všechny soubory (včetně činností celé lokality); jinak jen vyjmenované (číslo lokality = činnosti celé lokality). */
  devices: string[];
}

/** Položky plánu pro rok, lokalitu a soubory; řazené podle období. */
export function filterPlan(items: PlanItem[], f: PlanScopeFilter): PlanItem[] {
  return items
    .filter((i) => i.year === f.year && (!f.site || i.siteNumber === f.site))
    .filter((i) => f.devices.length === 0 || f.devices.indexOf(i.deviceNumber || i.siteNumber) !== -1)
    .sort((a, b) => itemRange(a).from.getTime() - itemRange(b).from.getTime() || a.siteNumber.localeCompare(b.siteNumber) || (a.deviceNumber || '').localeCompare(b.deviceNumber || '') || a.title.localeCompare(b.title, 'cs-CZ'));
}

/** Položky rozdělené po měsících (1–12) pro kalendář. */
export function planByMonth(items: PlanItem[]): PlanItem[][] {
  const out: PlanItem[][] = Array.from({ length: 12 }, () => []);
  items.forEach((i) => {
    if (i.month >= 1 && i.month <= 12) {
      out[i.month - 1].push(i);
    }
  });
  return out;
}

/** Nové položky plánu ze šablony pro lokalitu nebo soubor a rok. */
export function instantiateTemplate(template: PlanTemplate, scope: { siteNumber: string; deviceNumber?: string }, year: number): Omit<PlanItem, 'id'>[] {
  return template.items.map((i) => ({
    year,
    siteNumber: scope.siteNumber,
    deviceNumber: scope.deviceNumber,
    title: i.title,
    description: i.description,
    month: i.month,
    dueDate: i.day ? dateIn(year, i.month, i.day) : undefined,
    jobKind: i.jobKind
  }));
}

/** Kopie položek do jiného roku: konkrétní datum se přenese na stejný den a měsíc, požadavek se u kopie nepřenáší. */
export function copyPlanItems(items: PlanItem[], toYear: number): Omit<PlanItem, 'id'>[] {
  return items.map((i) => ({
    year: toYear,
    siteNumber: i.siteNumber,
    deviceNumber: i.deviceNumber,
    title: i.title,
    description: i.description,
    month: i.month,
    dueDate: i.dueDate ? dateIn(toYear, i.dueDate.getMonth() + 1, i.dueDate.getDate()) : undefined,
    jobKind: i.jobKind,
    note: i.note
  }));
}

/** Šablona z položek plánu (činnosti se uloží bez lokality a roku). */
export function templateFromItems(name: string, kind: string, items: PlanItem[]): PlanTemplate {
  return {
    name: name.trim(),
    kind,
    items: items.map((i) => ({ title: i.title, description: i.description, month: i.month, day: i.dueDate ? i.dueDate.getDate() : undefined, jobKind: i.jobKind }))
  };
}

/** Termín vyřízení požadavku vytvořeného z položky: konkrétní datum, jinak poslední den měsíce. */
export function requiredDateOf(item: Pick<PlanItem, 'year' | 'month' | 'dueDate'>): Date {
  return itemRange(item).to;
}

/** Druh požadavku vytvořeného z položky: plánovaná činnost je preventivní prohlídka, nahodilá „Ostatní“. */
export function requestKindOf(item: Pick<PlanItem, 'jobKind'>): string {
  return item.jobKind === 'Plánovaná' ? 'Preventivní prohlídka' : 'Ostatní';
}

/** Kontrola položky plánu před uložením: název, měsíc, rok a (nepovinné) datum ve stejném roce. Vrací větu pro člověka, nebo prázdný text. */
export function planItemProblem(input: Pick<PlanItem, 'title' | 'year' | 'month' | 'dueDate' | 'jobKind'>): string {
  if (input.title.trim() === '') {
    return 'Vyplňte činnost (co se má udělat).';
  }
  if (!(input.year >= 2000 && input.year <= 2100)) {
    return 'Rok plánu není platný.';
  }
  if (!(input.month >= 1 && input.month <= 12)) {
    return 'Měsíc musí být 1 až 12.';
  }
  if (input.dueDate && (input.dueDate.getFullYear() !== input.year || input.dueDate.getMonth() + 1 !== input.month)) {
    return 'Konkrétní termín musí ležet ve vybraném měsíci a roce plánu.';
  }
  if (PLAN_JOB_KINDS.indexOf(input.jobKind as (typeof PLAN_JOB_KINDS)[number]) === -1) {
    return 'Druh musí být Plánovaná (v paušálu) nebo Nahodilá (mimo paušál).';
  }
  return '';
}
