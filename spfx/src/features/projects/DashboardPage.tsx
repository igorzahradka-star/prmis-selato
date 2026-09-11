/**
 * Dashboard zakázek — úvodní obrazovka aplikace.
 *
 * Fáze 0: KPI dlaždice, tabulka zakázek, filtry a fulltext nad daty,
 * která už v seznamu jsou. Zakládání zakázek, export do Excelu a uložené
 * filtry přijdou ve Fázi 1.
 */

import * as React from 'react';
import { DetailsList, DetailsListLayoutMode, IColumn, SelectionMode } from '@fluentui/react/lib/DetailsList';
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { Toggle } from '@fluentui/react/lib/Toggle';
import { PrimaryButton } from '@fluentui/react/lib/Button';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Link } from '@fluentui/react/lib/Link';
import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { buildHash, RouteName } from '../../ui/router';
import { BudgetBadge, StatusBadge } from '../../ui/components/StatusBadge';
import { PageHeading } from '../../ui/components/PageHeading';
import { KpiTiles } from './KpiTiles';
import { BudgetStatus, Project, ProjectStatus, ACTIVE_PROJECT_STATUSES } from '../../core/types';
import { formatDate, formatMoney, dueLabel } from '../../core/format';
import { canCreateProject } from '../../core/roles';

export const DashboardPage: React.FC = () => {
  const { repos, settings, user } = useApp();

  const [projects, setProjects] = React.useState<Project[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [search, setSearch] = React.useState<string>('');
  const [onlyMine, setOnlyMine] = React.useState<boolean>(false);
  const [statuses, setStatuses] = React.useState<string[]>([]);
  const [types, setTypes] = React.useState<string[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    setProjects(undefined);
    setError(undefined);

    repos.projects
      .list({ onlyMine, statuses, projectTypes: types, search })
      .then((data) => {
        if (!cancelled) {
          setProjects(data);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [repos, onlyMine, statuses.join(','), types.join(','), search]);

  const statusOptions: IDropdownOption[] = Object.keys(ProjectStatus).map((k) => ({
    key: ProjectStatus[k as keyof typeof ProjectStatus],
    text: ProjectStatus[k as keyof typeof ProjectStatus]
  }));

  const typeOptions: IDropdownOption[] = settings.projects.projectTypes.map((t) => ({
    key: t,
    text: t
  }));

  return (
    <>
      <PageHeading
        title="Zakázky"
        subtitle="Přehled zakázek Revoltum Engineering & Services"
        action={
          canCreateProject(user.roles) ? (
            <PrimaryButton
              iconProps={{ iconName: 'Add' }}
              text="Nová zakázka"
              disabled
              title="Zakládání zakázek přijde ve Fázi 1."
            />
          ) : undefined
        }
      />

      <KpiTiles projects={projects} />

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-end',
          margin: '20px 0 12px'
        }}
      >
        <SearchBox
          placeholder="Hledat číslo, název, zákazníka, lokalitu…"
          value={search}
          onChange={(_, v) => setSearch(v ?? '')}
          onClear={() => setSearch('')}
          styles={{ root: { width: 320 } }}
        />
        <Dropdown
          label="Stav"
          multiSelect
          options={statusOptions}
          selectedKeys={statuses}
          onChange={(_, option) => option && setStatuses(toggle(statuses, String(option.key), !!option.selected))}
          styles={{ root: { minWidth: 180 } }}
          placeholder="Všechny stavy"
        />
        <Dropdown
          label="Typ zakázky"
          multiSelect
          options={typeOptions}
          selectedKeys={types}
          onChange={(_, option) => option && setTypes(toggle(types, String(option.key), !!option.selected))}
          styles={{ root: { minWidth: 180 } }}
          placeholder="Všechny typy"
        />
        <Toggle
          label="Jen moje zakázky"
          inlineLabel
          checked={onlyMine}
          onChange={(_, checked) => setOnlyMine(!!checked)}
          styles={{ root: { marginBottom: 4 } }}
        />
      </div>

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}

      {!projects && !error && <Spinner size={SpinnerSize.large} label="Načítám zakázky…" />}

      {projects && projects.length === 0 && !error && (
        <MessageBar messageBarType={MessageBarType.info}>
          Žádná zakázka neodpovídá zadaným filtrům.
        </MessageBar>
      )}

      {projects && projects.length > 0 && (
        <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4 }}>
          <DetailsList
            items={projects}
            columns={buildColumns()}
            selectionMode={SelectionMode.none}
            layoutMode={DetailsListLayoutMode.justified}
            compact
            isHeaderVisible
            ariaLabelForGrid="Seznam zakázek"
          />
        </div>
      )}
    </>
  );
};

/** Přidá nebo odebere hodnotu ze seznamu vybraných. */
function toggle(current: string[], value: string, selected: boolean): string[] {
  return selected ? [...current, value] : current.filter((v) => v !== value);
}

/** Sloupce tabulky podle zadání, kap. 8.1. */
function buildColumns(): IColumn[] {
  return [
    {
      key: 'number',
      name: 'Číslo',
      fieldName: 'projectNumber',
      minWidth: 70,
      maxWidth: 90,
      isResizable: true,
      onRender: (p: Project) => (
        <Link href={buildHash(RouteName.ProjectDetail, p.projectNumber)} style={{ fontWeight: 600 }}>
          {p.projectNumber}
        </Link>
      )
    },
    {
      key: 'title',
      name: 'Název',
      fieldName: 'title',
      minWidth: 220,
      isResizable: true,
      isMultiline: false,
      onRender: (p: Project) => <span title={p.title}>{p.title}</span>
    },
    {
      key: 'pm',
      name: 'Projektový manažer',
      fieldName: 'projectManagerName',
      minWidth: 130,
      maxWidth: 170,
      isResizable: true,
      onRender: (p: Project) => p.projectManagerName ?? '—'
    },
    {
      key: 'budget',
      name: 'Rozpočet',
      minWidth: 110,
      maxWidth: 130,
      isResizable: true,
      onRender: (p: Project) => (
        <BudgetBadge
          status={p.budgetStatus ?? BudgetStatus.Bez}
          baseline={p.budgetBaselineTotal}
          forecast={p.costForecastTotal}
        />
      )
    },
    {
      key: 'price',
      name: 'Celková cena',
      minWidth: 110,
      maxWidth: 130,
      isResizable: true,
      styles: { cellTitle: { justifyContent: 'flex-end' } },
      onRender: (p: Project) => (
        <div style={{ textAlign: 'right' }}>{formatMoney(p.contractPriceNet, p.currency)}</div>
      )
    },
    {
      key: 'deadline',
      name: 'Nejbližší termín',
      minWidth: 130,
      maxWidth: 160,
      isResizable: true,
      onRender: (p: Project) => {
        if (!p.nextDeadline) {
          return '—';
        }
        const overdue = p.nextDeadline.getTime() < Date.now();
        return (
          <span style={{ color: overdue ? RES.red : undefined, fontWeight: overdue ? 600 : undefined }}>
            {formatDate(p.nextDeadline)}{' '}
            <span style={{ color: RES.gray, fontSize: 11 }}>({dueLabel(p.nextDeadline)})</span>
          </span>
        );
      }
    },
    {
      key: 'start',
      name: 'Zahájení',
      minWidth: 85,
      maxWidth: 100,
      isResizable: true,
      onRender: (p: Project) => formatDate(p.startDate)
    },
    {
      key: 'end',
      name: 'Ukončení',
      minWidth: 85,
      maxWidth: 100,
      isResizable: true,
      onRender: (p: Project) => formatDate(p.endDateActual ?? p.endDatePlanned)
    },
    {
      key: 'status',
      name: 'Stav',
      minWidth: 100,
      maxWidth: 120,
      isResizable: true,
      onRender: (p: Project) => <StatusBadge status={p.status} />
    }
  ];
}

/** Zakázky, které se počítají jako aktivní. Používá i KpiTiles. */
export function isActive(p: Project): boolean {
  return !p.isOverhead && ACTIVE_PROJECT_STATUSES.indexOf(p.status) !== -1;
}
