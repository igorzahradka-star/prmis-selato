/**
 * Project overview — marketingový přehled realizovaného projektu pro zákazníky (případová studie / use case), česky i anglicky.
 * Čistá logika bez SharePointu a Reactu: údaje přehledu, výchozí hodnoty z projektu, návrh textu ze šablony (bez AI),
 * zadání pro AI (zkopíruje se do Copilota nebo Clauda) a pravidla, kdo smí přehled upravovat.
 *
 * Přehled nikdy neobsahuje ceny, náklady ani marži. Jméno zákazníka se ukáže jen se souhlasem se zveřejněním;
 * bez něj obecné označení (např. „průmyslová společnost“).
 */

import { Project } from './types';

export type OverviewLang = 'cs' | 'en';
export const OVERVIEW_LANGS: OverviewLang[] = ['cs', 'en'];

/** Text v obou jazycích. */
export interface Bilingual {
  cs: string;
  en: string;
}

export type PowerUnit = 'kW' | 'kWp' | 'MW' | 'MWp' | 'kWe' | 'MWe';
export type CapacityUnit = 'kWh' | 'MWh';
export const POWER_UNITS: PowerUnit[] = ['kWp', 'MWp', 'kW', 'MW', 'kWe', 'MWe'];
export const CAPACITY_UNITS: CapacityUnit[] = ['kWh', 'MWh'];

/** Vybraná fotka z fotodokumentace: složka (cesta uvnitř složky projektu) a název souboru. */
export interface OverviewPhoto {
  folder: string;
  name: string;
  /** Popisek pod fotkou (nepovinný). */
  caption?: string;
}

export interface ProjectOverview {
  /** Předmět realizace, např. „Realizace bateriového úložiště“. */
  subject: Bilingual;
  /** Rok realizace. */
  year?: number;
  /** Instalovaný výkon. */
  power?: number;
  powerUnit: PowerUnit;
  /** Kapacita úložiště. */
  capacity?: number;
  capacityUnit: CapacityUnit;
  /** Další technické parametry, jeden na řádek („Panely: 3 200 ks“). */
  params: Bilingual;
  /** Popis realizace (ze šablony, z AI nebo ručně). */
  text: Bilingual;
  /** Zákazník souhlasí se zveřejněním jména. */
  customerConsent: boolean;
  /** Označení zákazníka bez souhlasu (např. „průmyslová společnost“; v 1. pádě). */
  customerAnonymous: Bilingual;
  /** Vybrané fotky, první je titulní. */
  photos: OverviewPhoto[];
  /** Ukázat mapu s polohou projektu. */
  showMap: boolean;
}

export const MAX_OVERVIEW_PHOTOS = 6;

const SUBJECTS: Record<string, Bilingual> = {
  FVE: { cs: 'Realizace fotovoltaické elektrárny', en: 'Photovoltaic power plant' },
  BESS: { cs: 'Realizace bateriového úložiště', en: 'Battery energy storage system' },
  MVE: { cs: 'Realizace malé vodní elektrárny', en: 'Small hydropower plant' },
  'Vítr': { cs: 'Realizace větrné elektrárny', en: 'Wind power plant' },
  Kogenerace: { cs: 'Realizace kogenerační jednotky', en: 'Combined heat and power unit' },
  'Připojení DS': { cs: 'Připojení k distribuční soustavě', en: 'Grid connection' },
  Servis: { cs: 'Servis a údržba energetického zařízení', en: 'Service and maintenance' }
};
const DEFAULT_SUBJECT: Bilingual = { cs: 'Realizace energetického projektu', en: 'Energy project' };

/** Výchozí jednotka výkonu podle typu projektu. */
function defaultPowerUnit(type: string | undefined): PowerUnit {
  if (type === 'FVE') {
    return 'kWp';
  }
  if (type === 'Kogenerace') {
    return 'kWe';
  }
  return 'kW';
}

/** Rok realizace z projektu: skutečné ukončení, jinak plánované, jinak zahájení. */
export function projectYear(p: Project): number | undefined {
  const d = p.endDateActual || p.endDatePlanned || p.startDate;
  return d ? d.getFullYear() : undefined;
}

/** Výchozí přehled podle údajů projektu (než ho někdo upraví). */
export function defaultOverview(p: Project): ProjectOverview {
  const subject = SUBJECTS[p.projectType || ''] || DEFAULT_SUBJECT;
  return {
    subject: { ...subject },
    year: projectYear(p),
    powerUnit: defaultPowerUnit(p.projectType),
    capacityUnit: 'kWh',
    params: { cs: '', en: '' },
    text: { cs: '', en: '' },
    customerConsent: false,
    customerAnonymous: { cs: 'průmyslová společnost', en: 'an industrial company' },
    photos: [],
    showMap: p.latitude !== undefined && p.longitude !== undefined
  };
}

const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) ? v : undefined);
function bi(v: unknown, fallback: Bilingual): Bilingual {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<Bilingual>;
  return { cs: str(o.cs, fallback.cs), en: str(o.en, fallback.en) };
}

/** Přečte uložený přehled (JSON); chybějící nebo poškozené části doplní výchozími podle projektu. */
export function overviewFromJson(text: string | undefined, p: Project): ProjectOverview {
  const d = defaultOverview(p);
  if (!text) {
    return d;
  }
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return d;
  }
  if (!raw || typeof raw !== 'object') {
    return d;
  }
  const photos = Array.isArray(raw.photos)
    ? (raw.photos as unknown[])
        .filter((x): x is OverviewPhoto => !!x && typeof (x as OverviewPhoto).folder === 'string' && typeof (x as OverviewPhoto).name === 'string')
        .map((x) => ({ folder: x.folder, name: x.name, caption: typeof x.caption === 'string' ? x.caption : undefined }))
        .slice(0, MAX_OVERVIEW_PHOTOS)
    : [];
  return {
    subject: bi(raw.subject, d.subject),
    year: raw.year === null ? undefined : num(raw.year) ?? d.year,
    power: num(raw.power),
    powerUnit: POWER_UNITS.indexOf(raw.powerUnit as PowerUnit) !== -1 ? (raw.powerUnit as PowerUnit) : d.powerUnit,
    capacity: num(raw.capacity),
    capacityUnit: CAPACITY_UNITS.indexOf(raw.capacityUnit as CapacityUnit) !== -1 ? (raw.capacityUnit as CapacityUnit) : d.capacityUnit,
    params: bi(raw.params, d.params),
    text: bi(raw.text, d.text),
    customerConsent: raw.customerConsent === true,
    customerAnonymous: bi(raw.customerAnonymous, d.customerAnonymous),
    photos,
    showMap: typeof raw.showMap === 'boolean' ? raw.showMap : d.showMap
  };
}

export function overviewToJson(o: ProjectOverview): string {
  return JSON.stringify({ ...o, year: o.year === undefined ? null : o.year });
}

/** Číslo s českou nebo anglickou čárkou a mezerami po tisících. */
export function formatQuantity(value: number, lang: OverviewLang): string {
  return new Intl.NumberFormat(lang === 'cs' ? 'cs-CZ' : 'en-GB', { maximumFractionDigits: 2 }).format(value);
}

export const formatPower = (o: ProjectOverview, lang: OverviewLang): string | undefined => (o.power !== undefined ? `${formatQuantity(o.power, lang)} ${o.powerUnit}` : undefined);
export const formatCapacity = (o: ProjectOverview, lang: OverviewLang): string | undefined =>
  o.capacity !== undefined ? `${formatQuantity(o.capacity, lang)} ${o.capacityUnit}` : undefined;

/** Jak se v přehledu jmenuje zákazník: jménem jen se souhlasem, jinak obecně. */
export function customerLabel(o: ProjectOverview, p: Project, lang: OverviewLang): string {
  if (o.customerConsent && p.customerName) {
    return p.customerName;
  }
  return o.customerAnonymous[lang] || (lang === 'cs' ? 'zákazník' : 'customer');
}

/** Technické parametry jako řádky „Popisek: hodnota“ (prázdné řádky se vynechají). */
export function paramLines(o: ProjectOverview, lang: OverviewLang): { label: string; value: string }[] {
  return o.params[lang]
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .map((l) => {
      const i = l.indexOf(':');
      return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : { label: '', value: l };
    });
}

const lowerFirst = (s: string): string => (s ? s.charAt(0).toLocaleLowerCase('cs-CZ') + s.slice(1) : s);

/**
 * Návrh textu ze šablony (bez AI) — složí věty z údajů přehledu. Slouží jako výchozí text, který PM upraví,
 * nebo jako podklad pro AI.
 */
export function templateText(o: ProjectOverview, p: Project, company: string, lang: OverviewLang): string {
  const customer = customerLabel(o, p, lang);
  const power = formatPower(o, lang);
  const capacity = formatCapacity(o, lang);
  const params = paramLines(o, lang);
  if (lang === 'cs') {
    const s: string[] = [];
    // Věty jsou postavené tak, aby nebylo nutné skloňovat předmět ani zákazníka (zákazník je v 1. pádě).
    s.push(`${o.subject.cs || 'Realizace energetického projektu'}${p.location ? ` v lokalitě ${p.location}` : ''}.`);
    s.push(`${company} projekt realizovala${o.year ? ` v roce ${o.year}` : ''}, objednatelem je ${customer}.`);
    if (power && capacity) {
      s.push(`Instalovaný výkon je ${power} a kapacita úložiště ${capacity}.`);
    } else if (power) {
      s.push(`Instalovaný výkon je ${power}.`);
    } else if (capacity) {
      s.push(`Kapacita úložiště je ${capacity}.`);
    }
    if (params.length > 0) {
      s.push(`Hlavní parametry: ${params.map((x) => (x.label ? `${lowerFirst(x.label)} ${x.value}` : x.value)).join(', ')}.`);
    }
    s.push(`Projekt jsme připravili a dodali na klíč — od přípravy a dodávek technologie přes montáž až po uvedení do provozu.`);
    return s.join(' ');
  }
  const s: string[] = [];
  s.push(`${o.subject.en || 'Energy project'}${p.location ? ` in ${p.location}` : ''}.`);
  s.push(`${company} delivered the project${o.year ? ` in ${o.year}` : ''} for ${customer}.`);
  if (power && capacity) {
    s.push(`The installed power is ${power} with a storage capacity of ${capacity}.`);
  } else if (power) {
    s.push(`The installed power is ${power}.`);
  } else if (capacity) {
    s.push(`The storage capacity is ${capacity}.`);
  }
  if (params.length > 0) {
    s.push(`Key parameters: ${params.map((x) => (x.label ? `${x.label.toLowerCase()} ${x.value}` : x.value)).join(', ')}.`);
  }
  s.push('We delivered the project on a turnkey basis — from engineering and technology supply to installation and commissioning.');
  return s.join(' ');
}

/**
 * Zadání pro AI (Copilot, Claude…): fakta projektu a pokyny. Uživatel ho zkopíruje do AI a hotový text vloží zpět.
 * Zadání nikdy neobsahuje ceny, náklady ani marži a jméno zákazníka jen se souhlasem.
 */
export function aiPrompt(o: ProjectOverview, p: Project, company: string, lang: OverviewLang): string {
  const facts: string[] = [];
  const add = (label: string, value: string | undefined): void => {
    if (value) {
      facts.push(`- ${label}: ${value}`);
    }
  };
  add('Dodavatel (my)', company);
  add('Předmět realizace', o.subject.cs);
  add('Zákazník', customerLabel(o, p, 'cs'));
  add('Lokalita', p.location);
  add('Rok realizace', o.year ? String(o.year) : undefined);
  add('Instalovaný výkon', formatPower(o, 'cs'));
  add('Kapacita úložiště', formatCapacity(o, 'cs'));
  paramLines(o, 'cs').forEach((x) => add(x.label || 'Parametr', x.value));
  const draft = o.text.cs.trim() || templateText(o, p, company, 'cs');
  const language = lang === 'cs' ? 'česky' : 'anglicky (britská angličtina)';
  return [
    `Napiš ${language} krátký marketingový text (případová studie / reference) o realizovaném energetickém projektu pro prezentaci zákazníkům.`,
    '',
    'Fakta o projektu:',
    ...facts,
    '',
    'Současný návrh textu (můžeš ho přepsat):',
    draft,
    '',
    'Pokyny:',
    '- délka 120–180 slov, 2–3 odstavce, věcný a profesionální tón, bez superlativů a frází;',
    '- používej jen uvedená fakta, nic si nevymýšlej (žádná čísla, termíny, ani technologie, které nejsou výše);',
    '- neuváděj ceny, náklady ani marži;',
    '- zákazníka označuj přesně tak, jak je uvedeno výše;',
    '- vrať jen samotný text bez nadpisu a bez komentářů.'
  ].join('\n');
}

/** Upozornění před vytvořením PDF (nic nebrání vytvoření — jen aby přehled nebyl poloprázdný). */
export function overviewWarnings(o: ProjectOverview, lang: OverviewLang): string[] {
  const w: string[] = [];
  if (!o.subject[lang].trim()) {
    w.push(lang === 'cs' ? 'Chybí předmět realizace.' : 'Chybí předmět realizace v angličtině.');
  }
  if (!o.text[lang].trim()) {
    w.push(lang === 'cs' ? 'Chybí popis realizace — použije se návrh ze šablony.' : 'Chybí anglický popis realizace — použije se návrh ze šablony.');
  }
  if (o.power === undefined && o.capacity === undefined) {
    w.push('Není vyplněný výkon ani kapacita.');
  }
  if (o.photos.length === 0) {
    w.push('Nejsou vybrané žádné fotky — přehled bude bez fotek.');
  }
  return w;
}

/** Název souboru PDF. */
export function overviewFileName(projectNumber: string, lang: OverviewLang): string {
  return `Project overview ${projectNumber} ${lang.toUpperCase()}.pdf`;
}

/** Popisky PDF v obou jazycích. */
export const OVERVIEW_LABELS: Record<OverviewLang, Record<string, string>> = {
  cs: {
    kicker: 'REFERENCE',
    subject: 'Předmět realizace',
    customer: 'Zákazník',
    location: 'Lokalita',
    year: 'Rok realizace',
    power: 'Instalovaný výkon',
    capacity: 'Kapacita úložiště',
    params: 'Technické parametry',
    about: 'O projektu',
    gallery: 'Fotodokumentace',
    map: 'Umístění',
    contact: 'Revoltujte s námi',
    contact2: 'za moderní decentralizovanou energetiku'
  },
  en: {
    kicker: 'CASE STUDY',
    subject: 'Scope',
    customer: 'Customer',
    location: 'Location',
    year: 'Year of completion',
    power: 'Installed power',
    capacity: 'Storage capacity',
    params: 'Technical parameters',
    about: 'About the project',
    gallery: 'Photo documentation',
    map: 'Location',
    contact: 'Join the energy revolution',
    contact2: 'for modern decentralised energy'
  }
};
