/**
 * Dlaždice KPI nad tabulkou projektů.
 *
 * Počítají se z už načtených projektů — žádné další dotazy do SharePointu.
 * Dlaždice, které potřebují data z dalších modulů (objednávky ke schválení),
 * se doplní v příslušné fázi; do té doby se nezobrazují, aby neukazovaly nuly,
 * které nejsou pravda.
 */

import * as React from 'react';
import { Shimmer } from '@fluentui/react/lib/Shimmer';
import { Icon } from '@fluentui/react/lib/Icon';
import { Project, BudgetStatus, ACTIVE_PROJECT_STATUSES } from '../../core/types';
import { formatMoney, daysBetween } from '../../core/format';
import { CurrencyCode, RateTable, StoredRates, asCurrencyCode, convertAmount, describeRates, effectiveRates } from '../../core/currency';
import { fallbackRatesOf } from '../../core/settings';
import { useApp } from '../../ui/AppContext';
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
export function computeKpi(projects: Project[], today: Date = new Date(), rates?: RateTable, currency: CurrencyCode = 'CZK'): KpiSummary {
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
    // Projekty jsou v různých měnách (Kč, EUR, USD) — součet se dělá ve výchozí měně přehledů podle kurzu ČNB.
    // Bez kurzů (jen v testech) se sečtou holá čísla.
    activeValue: rates
      ? Math.round(active.reduce((sum, p) => sum + convertAmount(p.contractPriceNet, p.currency, currency, rates), 0) * 100) / 100
      : active.reduce((sum, p) => sum + (p.contractPriceNet ?? 0), 0),
    redCount: active.filter((p) => p.budgetStatus === BudgetStatus.Cervena).length,
    upcomingDeadlines: upcoming.length,
    overdueDeadlines: overdue.length
  };
}

/**
 * Vykresluje se na tmavém gradientovém podkladu hlavičky dashboardu
 * (viz `DashboardPage`) — sama žádné pozadí nemá, jen řadu dlaždic.
 */
export const KpiTiles: React.FC<{ projects: Project[] | undefined }> = ({ projects }) => {
  const { repos, settings } = useApp();
  const [stored, setStored] = React.useState<StoredRates | undefined>(undefined);

  React.useEffect(() => {
    let cancelled = false;
    repos.rates
      .getLatest()
      .then((r) => !cancelled && setStored(r))
      .catch(() => !cancelled && setStored({}));
    return () => {
      cancelled = true;
    };
  }, [repos]);

  if (!projects) {
    return <Shimmer styles={{ root: { height: 40 } }} />;
  }

  const rates = effectiveRates(stored, fallbackRatesOf(settings.approvals));
  const reportCurrency = asCurrencyCode(settings.budget.defaultCurrency);
  const kpi = computeKpi(projects, new Date(), rates, reportCurrency);
  const used = Array.from(new Set(projects.map((p) => p.currency))) as CurrencyCode[];
  const rateNote = describeRates(rates, Array.from(new Set([...used, reportCurrency])) as CurrencyCode[]);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <Tile
        icon="ViewList"
        label="Aktivní projekty"
        value={String(kpi.activeCount)}
        color={RES.blueLight}
      />
      <Tile
        icon="Money"
        label={`Hodnota aktivních (${reportCurrency === 'CZK' ? 'Kč' : reportCurrency})`}
        value={formatMoney(kpi.activeValue, reportCurrency)}
        color={RES.green}
        hint={rateNote || 'Součet cen aktivních projektů bez DPH.'}
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
      />
    </div>
  );
};

/**
 * Poloprůhledný šedý „čip" za textem — motiv v pozadí (viz `DashboardPage`)
 * zůstane vidět, ale číslo a popisek jsou čitelnější.
 */
const Tile: React.FC<{ icon: string; label: string; value: string; color: string; hint?: string }> = ({
  icon,
  label,
  value,
  color,
  hint
}) => (
  <div
    title={hint}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flex: '1 1 auto',
      minWidth: 150,
      padding: '8px 12px',
      background: 'rgba(120,128,140,0.3)',
      borderRadius: 6
    }}
  >
    <Icon iconName={icon} style={{ fontSize: 14, color }} />
    <span style={{ fontSize: 16, fontWeight: 700, color: RES.white }}>{value}</span>
    <span style={{ fontSize: 11, color: RES.bluePale, lineHeight: 1.2 }}>{label}</span>
  </div>
);
