/**
 * Dlaždice KPI nad tabulkou zakázek.
 *
 * Počítají se z už načtených zakázek — žádné další dotazy do SharePointu.
 * Dlaždice, které potřebují data z dalších modulů (objednávky ke schválení),
 * se doplní v příslušné fázi; do té doby se nezobrazují, aby neukazovaly nuly,
 * které nejsou pravda.
 */

import * as React from 'react';
import { Shimmer } from '@fluentui/react/lib/Shimmer';
import { Icon } from '@fluentui/react/lib/Icon';
import { Project, BudgetStatus, ACTIVE_PROJECT_STATUSES } from '../../core/types';
import { formatMoney, daysBetween } from '../../core/format';
import { RES } from '../../ui/theme';

/** Kolik dní dopředu se hlídají smluvní termíny. Ze zadání: 14 dní. */
export const DEADLINE_WINDOW_DAYS = 14;

export interface KpiSummary {
  activeCount: number;
  activeValue: number;
  redCount: number;
  upcomingDeadlines: number;
  overdueDeadlines: number;
}

/** Spočítá čísla do dlaždic. Vytaženo ven kvůli testovatelnosti. */
export function computeKpi(projects: Project[], today: Date = new Date()): KpiSummary {
  const active = projects.filter(
    (p) => !p.isOverhead && ACTIVE_PROJECT_STATUSES.indexOf(p.status) !== -1
  );

  const upcoming = active.filter((p) => {
    if (!p.nextDeadline) {
      return false;
    }
    const diff = daysBetween(today, p.nextDeadline);
    return diff >= 0 && diff <= DEADLINE_WINDOW_DAYS;
  });

  const overdue = active.filter(
    (p) => !!p.nextDeadline && daysBetween(today, p.nextDeadline) < 0
  );

  return {
    activeCount: active.length,
    activeValue: active.reduce((sum, p) => sum + (p.contractPriceNet ?? 0), 0),
    redCount: active.filter((p) => p.budgetStatus === BudgetStatus.Cervena).length,
    upcomingDeadlines: upcoming.length,
    overdueDeadlines: overdue.length
  };
}

export const KpiTiles: React.FC<{ projects: Project[] | undefined }> = ({ projects }) => {
  if (!projects) {
    return (
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[0, 1, 2, 3].map((i) => (
          <Shimmer key={i} width={200} styles={{ root: { height: 86 } }} />
        ))}
      </div>
    );
  }

  const kpi = computeKpi(projects);

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <Tile
        icon="ViewList"
        label="Aktivní zakázky"
        value={String(kpi.activeCount)}
        color={RES.blue}
      />
      <Tile
        icon="Money"
        label="Hodnota aktivních zakázek"
        value={formatMoney(kpi.activeValue)}
        color={RES.greenDark}
      />
      <Tile
        icon="StatusErrorFull"
        label="Zakázky v červené"
        value={String(kpi.redCount)}
        color={kpi.redCount > 0 ? RES.red : RES.gray}
      />
      <Tile
        icon="Clock"
        label={`Termíny do ${DEADLINE_WINDOW_DAYS} dní`}
        value={String(kpi.upcomingDeadlines)}
        color={RES.blueMid}
      />
      <Tile
        icon="Warning"
        label="Termíny po splatnosti"
        value={String(kpi.overdueDeadlines)}
        color={kpi.overdueDeadlines > 0 ? RES.red : RES.gray}
      />
    </div>
  );
};

const Tile: React.FC<{ icon: string; label: string; value: string; color: string }> = ({
  icon,
  label,
  value,
  color
}) => (
  <div
    style={{
      flex: '1 1 180px',
      maxWidth: 280,
      background: RES.white,
      border: `1px solid ${RES.grayBlue}`,
      borderRadius: 4,
      borderLeft: `3px solid ${color}`,
      padding: '12px 16px'
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: RES.gray, fontSize: 12 }}>
      <Icon iconName={icon} style={{ fontSize: 13 }} />
      {label}
    </div>
    <div style={{ fontSize: 22, fontWeight: 600, color: RES.text, marginTop: 4 }}>{value}</div>
  </div>
);
