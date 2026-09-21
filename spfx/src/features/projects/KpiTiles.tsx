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
import streakUrl from '../../webparts/prm/assets/res-kpi-streak.png';

/** Stejný diagonální přechod (tmavá → navy → modrá) jako v grafickém manuálu RES. */
const KPI_GRADIENT = `linear-gradient(135deg, ${RES.text} 0%, ${RES.navyDark} 55%, ${RES.blue} 100%)`;

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
    return <Shimmer styles={{ root: { height: 40 } }} />;
  }

  const kpi = computeKpi(projects);

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        borderRadius: 4,
        overflow: 'hidden',
        backgroundImage: `url(${streakUrl}), ${KPI_GRADIENT}`,
        backgroundRepeat: 'no-repeat, no-repeat',
        backgroundPosition: 'center, center',
        backgroundSize: 'cover, cover'
      }}
    >
      <Tile
        icon="ViewList"
        label="Aktivní zakázky"
        value={String(kpi.activeCount)}
        color={RES.blueLight}
      />
      <Tile
        icon="Money"
        label="Hodnota aktivních"
        value={formatMoney(kpi.activeValue)}
        color={RES.green}
      />
      <Tile
        icon="StatusErrorFull"
        label="V červené"
        value={String(kpi.redCount)}
        color={kpi.redCount > 0 ? RES.red : RES.grayBlue}
      />
      <Tile
        icon="Clock"
        label={`Termíny do ${DEADLINE_WINDOW_DAYS} dní`}
        value={String(kpi.upcomingDeadlines)}
        color={RES.blueLight}
      />
      <Tile
        icon="Warning"
        label="Po splatnosti"
        value={String(kpi.overdueDeadlines)}
        color={kpi.overdueDeadlines > 0 ? RES.red : RES.grayBlue}
        isLast
      />
    </div>
  );
};

const Tile: React.FC<{ icon: string; label: string; value: string; color: string; isLast?: boolean }> = ({
  icon,
  label,
  value,
  color,
  isLast
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flex: '1 1 auto',
      minWidth: 150,
      padding: '10px 14px',
      borderRight: isLast ? 'none' : '1px solid rgba(255,255,255,0.2)'
    }}
  >
    <Icon iconName={icon} style={{ fontSize: 14, color }} />
    <span style={{ fontSize: 16, fontWeight: 700, color: RES.white }}>{value}</span>
    <span style={{ fontSize: 11, color: RES.bluePale, lineHeight: 1.2 }}>{label}</span>
  </div>
);
