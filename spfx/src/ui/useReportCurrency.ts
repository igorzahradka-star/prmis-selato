/**
 * Měna přehledů. Přehledy (seznam projektů, objednávek, podkladů, KPI, mapa) ukazují částky ve **výchozí měně z Nastavení**
 * (Nastavení → Rozpočet a semafor → Výchozí měna přehledů), dokud si uživatel nepřepne měnu přepínačem CZK / EUR / USD
 * nad přehledem (volba platí pro všechny přehledy a pamatuje se). Přepočet dělá kurz ČNB. Doklady samotné
 * (objednávka, podklad) zůstávají v měně dokladu.
 */

import * as React from 'react';

import { useApp } from './AppContext';
import { CurrencyCode, RateTable, asCurrencyCode, convertAmount } from '../core/currency';
import { formatMoney } from '../core/format';
import { useOrderRates } from '../features/orders/useOrderRates';
import { getCurrencyChoice, setCurrencyChoice, subscribeCurrencyChoice } from './currencyChoice';

export interface ReportCurrency {
  currency: CurrencyCode;
  /** Výchozí měna z Nastavení (platí, dokud si uživatel nezvolí jinou). */
  defaultCurrency: CurrencyCode;
  /** Přepne měnu všech přehledů. */
  setCurrency: (currency: CurrencyCode) => void;
  /** Zkratka do záhlaví sloupce: „Kč“, „EUR“, „USD“. */
  label: string;
  rates: RateTable;
  /** Částka přepočtená do výchozí měny přehledů. */
  convert: (amount: number | undefined | null, from: string | undefined) => number;
  /** Částka přepočtená a naformátovaná (bez haléřů); chybějící částka dá „—“. */
  format: (amount: number | undefined | null, from: string | undefined) => string;
}

export function useReportCurrency(): ReportCurrency {
  const { settings } = useApp();
  const rates = useOrderRates();
  const defaultCurrency = asCurrencyCode(settings.budget.defaultCurrency);
  const [choice, setChoice] = React.useState<CurrencyCode | undefined>(getCurrencyChoice());
  React.useEffect(() => {
    setChoice(getCurrencyChoice());
    return subscribeCurrencyChoice(() => setChoice(getCurrencyChoice()));
  }, []);
  const currency = choice ?? defaultCurrency;
  return React.useMemo(
    () => ({
      currency,
      defaultCurrency,
      setCurrency: (c: CurrencyCode) => setCurrencyChoice(c === defaultCurrency ? undefined : c),
      label: currency === 'CZK' ? 'Kč' : currency,
      rates,
      convert: (amount, from) => convertAmount(amount, from, currency, rates),
      format: (amount, from) => (amount === undefined || amount === null ? '—' : formatMoney(convertAmount(amount, from, currency, rates), currency))
    }),
    [currency, defaultCurrency, rates]
  );
}
