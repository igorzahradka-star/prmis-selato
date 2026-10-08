/**
 * Semafor rozpočtu a štítek stavu projektu.
 *
 * Barva nikdy nestojí sama — vždy je doplněná ikonou a textem.
 * Důvod: barvoslepost, černobílý tisk a čtečky obrazovky.
 */

import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';
import { BudgetStatus, ProjectStatus } from '../../core/types';
import { formatMoney, formatPercent } from '../../core/format';
import { SEMAFOR } from '../theme';
import { statusStyle } from '../../core/geo';

export interface BudgetBadgeProps {
  status: BudgetStatus;
  baseline?: number;
  forecast?: number;
  /** Jen barevný terčík bez textu (úzký sloupec v přehledu); význam je v bublině a ve čtečce. */
  compact?: boolean;
  /** Prodej rozpočtu, minimální marže a práh žluté (%) — pro vysvětlení v bublině, proč je semafor takový. */
  sale?: number;
  minMargin?: number;
  yellowPercent?: number;
}

/** Semafor rozpočtu s vysvětlením po najetí myší. */
export const BudgetBadge: React.FC<BudgetBadgeProps> = ({ status, baseline, forecast, compact, sale, minMargin, yellowPercent }) => {
  const style = SEMAFOR[status] ?? SEMAFOR['Bez rozpočtu'];
  const tooltip = `${status}. ${buildBudgetTooltip(status, baseline, forecast, sale, minMargin, yellowPercent)}`;

  if (compact) {
    return (
      <TooltipHost content={tooltip}>
        <span role="img" aria-label={`Rozpočet: ${tooltip}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 12, background: style.background, color: style.color }}>
          <Icon iconName={style.icon} style={{ fontSize: 13 }} />
        </span>
      </TooltipHost>
    );
  }

  return (
    <TooltipHost content={tooltip}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '2px 10px 2px 8px',
          borderRadius: 12,
          background: style.background,
          color: style.color,
          fontWeight: 600,
          fontSize: 12,
          whiteSpace: 'nowrap'
        }}
        aria-label={`Rozpočet: ${status}. ${tooltip}`}
      >
        <Icon iconName={style.icon} style={{ fontSize: 12 }} />
        {status}
      </span>
    </TooltipHost>
  );
};

/** Text do bubliny u semaforu — proč je zrovna takhle barevný. */
export function buildBudgetTooltip(
  status: BudgetStatus,
  baseline?: number,
  forecast?: number,
  sale?: number,
  minMargin?: number,
  yellowPercent?: number
): string {
  if (status === BudgetStatus.Bez || !baseline) {
    return 'Projekt zatím nemá schválený realizační rozpočet, semafor se nepočítá.';
  }
  if (forecast === undefined) {
    return `Schválený rozpočet ${formatMoney(baseline)}, prognóza zatím není zadaná.`;
  }
  const odchylka = (forecast - baseline) / baseline;
  let text =
    `Schválený rozpočet ${formatMoney(baseline)}, ` +
    `prognóza nákladů ${formatMoney(forecast)}. ` +
    `Odchylka ${formatPercent(odchylka)}` +
    (yellowPercent !== undefined ? ` (červená nad ${yellowPercent} %).` : '.');
  if (sale !== undefined && sale > 0) {
    const margin = (sale - forecast) / sale;
    text += ` Marže při prognóze ${formatPercent(margin)}` + (minMargin !== undefined ? ` (červená pod ${minMargin} %).` : '.');
  }
  return text;
}

/** Barvy štítků stavu projektu — stejná paleta jako špendlíky na mapě (viz `STATUS_STYLE` v core/geo). */

/** Štítek stavu projektu. */
export const StatusBadge: React.FC<{ status: ProjectStatus }> = ({ status }) => {
  const palette = statusStyle(status);
  const style = { color: palette.text, background: palette.fill, border: palette.stroke };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 10px',
        borderRadius: 12,
        background: style.background,
        color: style.color,
        border: `1px solid ${style.border}`,
        fontWeight: 600,
        fontSize: 12,
        whiteSpace: 'nowrap'
      }}
    >
      {status}
    </span>
  );
};
