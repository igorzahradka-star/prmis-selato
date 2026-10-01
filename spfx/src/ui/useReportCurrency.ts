/**
 * Měna přehledů. Přehledy (seznam projektů, objednávek, podkladů, KPI, grafy) ukazují částky v **výchozí měně z Nastavení**
 * (Nastavení → Rozpočet a semafor → Výchozí měna přehledů; zatím CZK) a přepočítají je kurzem ČNB. Doklady samotné
 * (objednávka, podklad) zůstávají v měně dokladu.
 */

import * as React from 'react';

import { useApp } from './AppContext';
import { CurrencyCode, RateTable, asCurrencyCode, convertAmount } from '../core/currency';
import { formatMoney } from '../core/format';
import { useOrderRates } from '../features/orders/useOrderRates';

export interface ReportCurrency {
  currency: CurrencyCode;
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
  const currency = asCurrencyCode(settings.budget.defaultCurrency);
  return React.useMemo(
    () => ({
      currency,
      label: currency === 'CZK' ? 'Kč' : currency,
      rates,
      convert: (amount, from) => convertAmount(amount, from, currency, rates),
      format: (amount, from) => (amount === undefined || amount === null ? '—' : formatMoney(convertAmount(amount, from, currency, rates), currency))
    }),
    [currency, rates]
  );
}
