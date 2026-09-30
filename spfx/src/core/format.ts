/**
 * Formátování čísel, částek a dat podle českých zvyklostí (cs-CZ).
 *
 * Vrstva `core` — žádná závislost na SharePointu ani Reactu.
 *
 * Pozn.: `Intl.NumberFormat('cs-CZ')` používá jako oddělovač tisíců
 * úzkou nezlomitelnou mezeru (U+00A0 nebo U+202F podle verze ICU).
 * Testy proto porovnávají po normalizaci mezer — viz `normalizeSpaces`.
 */

const LOCALE = 'cs-CZ';

/** Nahradí všechny druhy mezer běžnou mezerou. Pro testy a porovnávání. */
export function normalizeSpaces(text: string): string {
  return text.replace(/[   ]/g, ' ');
}

/**
 * Částka v Kč bez desetinných míst — pro tabulky a dlaždice.
 * `formatMoney(1234567)` → `1 234 567 Kč`
 */
export function formatMoney(value: number | undefined | null, currency: string = 'CZK'): string {
  if (value === undefined || value === null || isNaN(value)) {
    return '—';
  }
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

/**
 * Částka s haléři — pro detail dokladu, kde se musí sedět na korunu.
 * `formatMoneyExact(1234.5)` → `1 234,50 Kč`
 */
export function formatMoneyExact(value: number | undefined | null, currency: string = 'CZK'): string {
  if (value === undefined || value === null || isNaN(value)) {
    return '—';
  }
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

/** Číslo bez měny, se zadaným počtem desetinných míst. `formatNumber(1234.5, 1)` → `1 234,5` */
export function formatNumber(value: number | undefined | null, decimals: number = 0): string {
  if (value === undefined || value === null || isNaN(value)) {
    return '—';
  }
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

/**
 * Procento se znaménkem — pro odchylky rozpočtu.
 * `formatPercent(0.0523)` → `+5,2 %`, `formatPercent(-0.01)` → `−1,0 %`
 * Vstup je poměr (0,05 = 5 %), ne už vynásobené číslo.
 */
export function formatPercent(ratio: number | undefined | null, decimals: number = 1): string {
  if (ratio === undefined || ratio === null || isNaN(ratio)) {
    return '—';
  }
  const formatted = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(Math.abs(ratio) * 100);
  const sign = ratio > 0 ? '+' : ratio < 0 ? '−' : '';
  return `${sign}${formatted} %`;
}

/** Datum. `formatDate(new Date(2026, 8, 11))` → `11. 9. 2026` */
export function formatDate(value: Date | string | undefined | null): string {
  const date = toDate(value);
  if (!date) {
    return '—';
  }
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric'
  }).format(date);
}

/** Datum a čas. `formatDateTime(...)` → `11. 9. 2026 14:35` */
export function formatDateTime(value: Date | string | undefined | null): string {
  const date = toDate(value);
  if (!date) {
    return '—';
  }
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

/** Datum ve tvaru `2026-09-11` — pro `<input type="date">` a pro řazení. */
export function toIsoDate(value: Date | string | undefined | null): string {
  const date = toDate(value);
  if (!date) {
    return '';
  }
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

/** Doplní číslo na dvě místa nulou. (`padStart` není v cílové knihovně SPFx.) */
function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * Přečte datum zapsané česky: `20. 9. 2026`, `20.9.2026`, `20/9/2026`,
 * `20. 9.` (dopočítá se aktuální rok), `20. 9. 26` (dvojciferný rok → 2026).
 *
 * Potřebné proto, aby šlo datum ve formulářích **napsat**, ne jen vyklikat
 * v kalendáři. Fluent DatePicker umí sám jen anglické formáty.
 *
 * Vrací `undefined`, když text není platné datum — včetně zjevných nesmyslů
 * jako `31. 2. 2026` (prohlížeč by z nich jinak tiše udělal 3. března).
 */
export function parseCzechDate(text: string | undefined | null, today: Date = new Date()): Date | undefined {
  if (!text || !text.trim()) {
    return undefined;
  }
  const match = /^(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*(?:[.\-/]\s*(\d{1,4}))?\s*\.?$/.exec(text.trim());
  if (!match) {
    return undefined;
  }

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  let year = match[3] === undefined ? today.getFullYear() : parseInt(match[3], 10);
  if (match[3] !== undefined && match[3].length <= 2) {
    // Dvojciferný rok bereme jako tenhle věk: 26 → 2026.
    year += 2000;
  }

  const date = new Date(year, month - 1, day);
  // Kontrola, že se datum „nepřeteklo" — 31. 2. by se jinak stalo 3. 3.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }
  return date;
}

/** Převede hodnotu ze SharePointu (řetězec nebo Date) na Date, nebo undefined. */
export function toDate(value: Date | string | undefined | null): Date | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
}

/**
 * Počet dní mezi dvěma daty (kalendářních, bez ohledu na čas a letní čas).
 * `daysBetween(11.9., 14.9.)` → 3
 */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86400000);
}

/**
 * Slovní popis blízkosti termínu — pro dashboard.
 * `dueLabel(zítra)` → `zítra`, `dueLabel(za 5 dní)` → `za 5 dní`, minulost → `po termínu o 3 dny`
 */
export function dueLabel(deadline: Date | undefined, today: Date = new Date()): string {
  if (!deadline) {
    return '—';
  }
  const diff = daysBetween(today, deadline);
  if (diff < 0) {
    return `po termínu o ${pluralDays(-diff)}`;
  }
  if (diff === 0) {
    return 'dnes';
  }
  if (diff === 1) {
    return 'zítra';
  }
  return `za ${pluralDays(diff)}`;
}

/** České skloňování slova „den": 1 den, 2–4 dny, 5+ dní. */
export function pluralDays(count: number): string {
  if (count === 1) {
    return '1 den';
  }
  if (count >= 2 && count <= 4) {
    return `${count} dny`;
  }
  return `${count} dní`;
}

/**
 * Skloňování slova „projekt": 1 projekt, 2–4 projekty, 5+ projektů.
 * Používá dashboard v dlaždicích KPI.
 */
export function pluralProjects(count: number): string {
  if (count === 1) {
    return '1 projekt';
  }
  if (count >= 2 && count <= 4) {
    return `${count} projekty`;
  }
  return `${count} projektů`;
}

/**
 * Přečte číslo napsané česky: `1 250,50` → 1250.5. Mezery (i nezlomitelné) se ignorují,
 * desetinná čárka i tečka platí. Prázdný nebo nečitelný text vrátí `undefined`.
 */
export function parseAmount(text: string | undefined | null): number | undefined {
  if (text === undefined || text === null) {
    return undefined;
  }
  const cleaned = String(text)
    .replace(/[\s ]/g, '')
    .replace(',', '.');
  if (cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned)) {
    return undefined;
  }
  return Number(cleaned);
}
