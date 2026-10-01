/**
 * Měny a přepočet na koruny — čistá logika.
 *
 * Součty napříč projekty a objednávkami se vždy dělají v Kč. Cizí měny se přepočítají kurzem ČNB
 * (střed). Kurz se do aplikace dostává ze seznamu PRM_ExchangeRates; když tam ještě žádný není, počítá
 * se kurzem „pro případ nouze" z Nastavení — a aplikace to řekne (viz `RateSource`).
 */

export type CurrencyCode = 'CZK' | 'EUR' | 'USD';

export const CURRENCY_CODES: CurrencyCode[] = ['CZK', 'EUR', 'USD'];

/** Jeden zapsaný kurz: kolik korun stojí jednotka měny. */
export interface StoredRate {
  currency: CurrencyCode;
  /** Kč za 1 jednotku měny. */
  rate: number;
  /** Den, pro který kurz platí. */
  date: Date;
  source?: string;
}

/** Nejnovější zapsané kurzy podle měn (bez CZK). */
export type StoredRates = Partial<Record<'EUR' | 'USD', StoredRate>>;

/** Kurzy pro počítání — vždy kompletní; u každého je vidět, odkud je. */
export interface RateTable {
  EUR: number;
  USD: number;
  /** Odkud se vzaly: zapsané kurzy, nebo nouzové z Nastavení. */
  source: { EUR: RateSource; USD: RateSource };
  /** Datum nejstaršího použitého zapsaného kurzu; u nouzových kurzů prázdné. */
  date?: Date;
}

export type RateSource = 'zapsaný' | 'nouzový';

export interface FallbackRates {
  EUR: number;
  USD: number;
}

/** Kurzy z Nastavení, když v seznamu zatím nic není. Nesmyslná hodnota (≤ 0) se nahradí jedničkou, aby se částka nevynulovala. */
const sane = (value: number): number => (value > 0 ? value : 1);

/**
 * Složí kurzy k počítání: zapsaný kurz má přednost, chybějící se doplní nouzovým.
 */
export function effectiveRates(stored: StoredRates | undefined, fallback: FallbackRates): RateTable {
  const eur = stored && stored.EUR && stored.EUR.rate > 0 ? stored.EUR : undefined;
  const usd = stored && stored.USD && stored.USD.rate > 0 ? stored.USD : undefined;
  const dates = [eur, usd].filter((r): r is StoredRate => !!r).map((r) => r.date.getTime());
  return {
    EUR: eur ? eur.rate : sane(fallback.EUR),
    USD: usd ? usd.rate : sane(fallback.USD),
    source: { EUR: eur ? 'zapsaný' : 'nouzový', USD: usd ? 'zapsaný' : 'nouzový' },
    date: dates.length > 0 ? new Date(Math.min.apply(null, dates)) : undefined
  };
}

/** Částka v korunách. Neznámá měna se bere jako koruny (nic se nevynuluje ani nezmizí). */
export function toCzk(amount: number | undefined | null, currency: string | undefined, rates: RateTable): number {
  const value = amount ?? 0;
  if (currency === 'EUR') {
    return round2(value * rates.EUR);
  }
  if (currency === 'USD') {
    return round2(value * rates.USD);
  }
  return round2(value);
}

/** Neznámou nebo prázdnou měnu bere jako koruny. */
export function asCurrencyCode(value: string | undefined | null): CurrencyCode {
  return value === 'EUR' || value === 'USD' ? value : 'CZK';
}

/**
 * Částka přepočtená z jedné měny do druhé (přes koruny, kurzem ČNB). Slouží přehledům, které ukazují vše v **výchozí měně**
 * z Nastavení; doklady samotné zůstávají v měně dokladu.
 */
export function convertAmount(amount: number | undefined | null, from: string | undefined, to: CurrencyCode, rates: RateTable): number {
  const czk = toCzk(amount, from, rates);
  if (to === 'EUR') {
    return round2(czk / rates.EUR);
  }
  if (to === 'USD') {
    return round2(czk / rates.USD);
  }
  return czk;
}

/** Součet částek v různých měnách, v Kč. */
export function sumInCzk(items: { amount: number | undefined | null; currency: string | undefined }[], rates: RateTable): number {
  return round2(items.reduce((sum, i) => sum + toCzk(i.amount, i.currency, rates), 0));
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Je nejnovější zapsaný kurz starý? (Dnes počítáme se středem ČNB, který se mění každý pracovní den.) */
export const STALE_RATE_DAYS = 7;

export function isRateStale(rates: RateTable, today: Date = new Date()): boolean {
  if (!rates.date) {
    return true;
  }
  const days = Math.floor((today.getTime() - rates.date.getTime()) / 86400000);
  return days > STALE_RATE_DAYS;
}

/** Věta pod součtem: z jakého kurzu se počítalo. Bez cizí měny v součtu tu není co vysvětlovat. */
export function describeRates(rates: RateTable, used: CurrencyCode[]): string {
  const foreign = used.filter((c) => c !== 'CZK') as ('EUR' | 'USD')[];
  if (foreign.length === 0) {
    return '';
  }
  const parts = foreign.map((c) => `1 ${c} = ${String(rates[c]).replace('.', ',')} Kč${rates.source[c] === 'nouzový' ? ' (nouzový kurz z Nastavení)' : ''}`);
  const date = rates.date ? `, kurz ČNB k ${rates.date.getDate()}. ${rates.date.getMonth() + 1}. ${rates.date.getFullYear()}` : '';
  return `Přepočet: ${parts.join(', ')}${date}.`;
}

/** Kontrola ručně zapsaného kurzu. Vrací věty pro člověka; prázdný seznam = v pořádku. */
export function validateRateEntry(entry: { currency: string; rate: number | undefined; date: Date | undefined }, today: Date = new Date()): string[] {
  const problems: string[] = [];
  if (entry.currency !== 'EUR' && entry.currency !== 'USD') {
    problems.push('Kurz jde zapsat jen pro EUR a USD.');
  }
  if (entry.rate === undefined || !(entry.rate > 0)) {
    problems.push('Kurz musí být kladné číslo (kolik korun stojí jedna jednotka měny).');
  } else if (entry.rate >= 1000) {
    problems.push('Kurz vypadá nesmyslně vysoký. Zadává se počet korun za jednu jednotku měny, např. 24,415.');
  }
  if (!entry.date || isNaN(entry.date.getTime())) {
    problems.push('Vyplňte den, pro který kurz platí.');
  } else if (entry.date.getTime() > today.getTime() + 86400000) {
    problems.push('Kurz nemůže platit pro budoucí den.');
  }
  return problems;
}
