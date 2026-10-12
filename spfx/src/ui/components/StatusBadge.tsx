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
import { SEMAFOR } from '../theme';
import { statusStyle } from '../../core/geo';

export interface BudgetBadgeProps {
  status: BudgetStatus;
  /** Vysvětlení v bublině: proč je semafor takový (marže, zadání, hranice). */
  tooltip: string;
  /** Jen barevný terčík bez textu (úzký sloupec v přehledu); význam je v bublině a ve čtečce. */
  compact?: boolean;
}

/** Semafor rozpočtu s vysvětlením po najetí myší. */
export const BudgetBadge: React.FC<BudgetBadgeProps> = ({ status, tooltip, compact }) => {
  const style = SEMAFOR[status] ?? SEMAFOR['Bez rozpočtu'];
  const text = `${status}. ${tooltip}`;

  if (compact) {
    return (
      <TooltipHost content={text}>
        <span role="img" aria-label={`Rozpočet: ${text}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 12, background: style.background, color: style.color }}>
          <Icon iconName={style.icon} style={{ fontSize: 13 }} />
        </span>
      </TooltipHost>
    );
  }

  return (
    <TooltipHost content={text}>
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
        aria-label={`Rozpočet: ${text}`}
      >
        <Icon iconName={style.icon} style={{ fontSize: 12 }} />
        {status}
      </span>
    </TooltipHost>
  );
};

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
