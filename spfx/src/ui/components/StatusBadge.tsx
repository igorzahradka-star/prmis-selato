/**
 * Semafor rozpočtu a štítek stavu zakázky.
 *
 * Barva nikdy nestojí sama — vždy je doplněná ikonou a textem.
 * Důvod: barvoslepost, černobílý tisk a čtečky obrazovky.
 */

import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';
import { BudgetStatus, ProjectStatus } from '../../core/types';
import { formatMoney, formatPercent } from '../../core/format';
import { RES, SEMAFOR } from '../theme';

export interface BudgetBadgeProps {
  status: BudgetStatus;
  baseline?: number;
  forecast?: number;
}

/** Semafor rozpočtu s vysvětlením po najetí myší. */
export const BudgetBadge: React.FC<BudgetBadgeProps> = ({ status, baseline, forecast }) => {
  const style = SEMAFOR[status] ?? SEMAFOR['Bez rozpočtu'];
  const tooltip = buildBudgetTooltip(status, baseline, forecast);

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
  forecast?: number
): string {
  if (status === BudgetStatus.Bez || !baseline) {
    return 'Zakázka zatím nemá schválený realizační rozpočet, semafor se nepočítá.';
  }
  if (forecast === undefined) {
    return `Schválený rozpočet ${formatMoney(baseline)}, prognóza zatím není zadaná.`;
  }
  const odchylka = (forecast - baseline) / baseline;
  return (
    `Schválený rozpočet ${formatMoney(baseline)}, ` +
    `prognóza nákladů ${formatMoney(forecast)}. ` +
    `Odchylka ${formatPercent(odchylka)}.`
  );
}

/** Barvy štítků stavu zakázky. Jen odstíny palety RES, nic křiklavého. */
const STATUS_STYLE: Record<string, { color: string; background: string }> = {
  [ProjectStatus.Nabidka]: { color: RES.navy, background: '#EAF0F5' },
  [ProjectStatus.Priprava]: { color: RES.blueMid, background: '#E4F0F8' },
  [ProjectStatus.Realizace]: { color: RES.blue, background: RES.bluePale },
  [ProjectStatus.Pozastaveno]: { color: RES.amber, background: '#FDF3DC' },
  [ProjectStatus.Dokonceno]: { color: RES.greenDark, background: '#E7F6EE' },
  [ProjectStatus.Uzavreno]: { color: RES.gray, background: '#F1F3F5' },
  [ProjectStatus.Storno]: { color: RES.red, background: '#FBE8EB' }
};

/** Štítek stavu zakázky. */
export const StatusBadge: React.FC<{ status: ProjectStatus }> = ({ status }) => {
  const style = STATUS_STYLE[status] ?? { color: RES.gray, background: '#F1F3F5' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 12,
        background: style.background,
        color: style.color,
        fontWeight: 600,
        fontSize: 12,
        whiteSpace: 'nowrap'
      }}
    >
      {status}
    </span>
  );
};
