/**
 * Dashboard projektů — úvodní obrazovka aplikace.
 *
 * Fáze 0: KPI dlaždice, tabulka projektů, filtry a fulltext nad daty,
 * která už v seznamu jsou. Zakládání projektů, export do Excelu a uložené
 * filtry přijdou ve Fázi 1.
 */

import * as React from 'react';
import { DetailsList, DetailsListLayoutMode, IColumn, SelectionMode } from '@fluentui/react/lib/DetailsList';
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Link } from '@fluentui/react/lib/Link';
import { useApp } from '../../ui/AppContext';
import { loadProjectManagerNames } from './projectManagers';
import { RES, LAYOUT } from '../../ui/theme';
import { buildHash, RouteName } from '../../ui/router';
import { BudgetBadge, StatusBadge } from '../../ui/components/StatusBadge';
import { KpiTiles } from './KpiTiles';
import { NewProjectPanel } from './NewProjectPanel';
import { BudgetStatus, Project, ProjectStatus, ACTIVE_PROJECT_STATUSES } from '../../core/types';
import { formatDate, formatMoney, dueLabel } from '../../core/format';
import { canCreateProject } from '../../core/roles';
import streakUrl from '../../webparts/prm/assets/res-kpi-streak.png';

/** Stejný diagonální přechod (tmavá → navy → modrá) jako v grafickém manuálu RES. */
const HERO_GRADIENT = `linear-gradient(135deg, ${RES.text} 0%, ${RES.navyDark} 55%, ${RES.blue} 100%)`;

export const DashboardPage: React.FC = () => {
  const { repos, settings, user } = useApp();

  const [projects, setProjects] = React.useState<Project[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [search, setSearch] = React.useState<string>('');
  const [statuses, setStatuses] = React.useState<string[]>([]);
  const [pms, setPms] = React.useState<string[]>([]);
  const [pmOptions, setPmOptions] = React.useState<IDropdownOption[]>([]);
  const [isNewProjectOpen, setIsNewProjectOpen] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | undefined>(undefined);

  /**
   * Exportuje se to, co je právě na obrazovce — včetně filtrů. Kdyby se
   * exportovalo vždycky všechno, člověk by si vyfiltroval svoje projekty,
   * stáhl tabulku a divil se, co v ní dělá zbytek firmy.
   */
  const exportuj = (): void => {
    if (!projects || projects.length === 0) {
      return;
    }
    setExporting(true);
    setExportError(undefined);
    const filtrovano = statuses.length > 0 || pms.length > 0 || search.trim() !== '';

    import(/* webpackChunkName: 'export-excel' */ './exportToExcel')
      .then((m) => m.exportProjectsToExcel(projects, filtrovano))
      .then(() => setExporting(false))
      .catch((e: Error) => {
        setExporting(false);
        setExportError(`Export se nepodařil: ${e.message}`);
      });
  };

  React.useEffect(() => {
    let cancelled = false;
    setProjects(undefined);
    setError(undefined);

    repos.projects
      .list({ statuses, projectManagerNames: pms, search, includeOverhead: true })
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
  }, [repos, statuses.join(','), pms.join(','), search, refreshKey]);

  // Nabídka jmen PM do filtru — ze všech projektů, nezávisle na aktuálním filtru.
  React.useEffect(() => {
    let cancelled = false;
    // Z členů rolí, ne jen z lidí, kteří už projekt vedou — jinak by v nabídce byl
    // jen ten, kdo nějaký projekt má.
    loadProjectManagerNames(repos, settings.roles).then((names) => {
      if (!cancelled) {
        setPmOptions(names.map((n) => ({ key: n, text: n })));
      }
    }).catch(() => undefined); // nabídka nikdy neselže, viz projectManagers.ts
    return () => {
      cancelled = true;
    };
  }, [repos]);

  const statusOptions: IDropdownOption[] = Object.keys(ProjectStatus).map((k) => ({
    key: ProjectStatus[k as keyof typeof ProjectStatus],
    text: ProjectStatus[k as keyof typeof ProjectStatus]
  }));

  return (
    <>
      <div
        style={{
          // "Full-bleed": vykompenzuje padding <main> (viz AppShell), aby podklad
          // sahal až k menu, k pravému okraji a k žluté liště ukázkového režimu.
          marginTop: -LAYOUT.contentPaddingTop,
          marginLeft: -LAYOUT.contentPaddingX,
          marginRight: -LAYOUT.contentPaddingX,
          marginBottom: 0,
          backgroundImage: `url(${streakUrl}), ${HERO_GRADIENT}`,
          backgroundRepeat: 'no-repeat, no-repeat',
          backgroundPosition: 'center, center',
          backgroundSize: 'cover, cover',
          padding: `${LAYOUT.contentPaddingTop}px ${LAYOUT.contentPaddingX}px`
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: RES.white }}>Projekty</h1>
            <p style={{ margin: '4px 0 0', color: RES.bluePale, fontSize: 13 }}>
              Přehled projektů Revoltum Engineering & Services
            </p>
          </div>
          {canCreateProject(user.roles) && (
            <div style={{ flex: '0 0 auto' }}>
              <PrimaryButton
                iconProps={{ iconName: 'Add' }}
                text="Nový projekt"
                onClick={() => setIsNewProjectOpen(true)}
              />
            </div>
          )}
        </div>

        <KpiTiles projects={projects} />
      </div>

      <NewProjectPanel
        isOpen={isNewProjectOpen}
        onDismiss={() => setIsNewProjectOpen(false)}
        onCreated={() => setRefreshKey((k) => k + 1)}
      />

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-end',
          margin: '12px 0'
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
          label="Projektový manažer"
          multiSelect
          options={pmOptions}
          selectedKeys={pms}
          onChange={(_, option) => option && setPms(toggle(pms, String(option.key), !!option.selected))}
          styles={{ root: { minWidth: 200 } }}
          placeholder="Všichni PM"
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
        <div style={{ flex: '1 1 auto' }} />
        <DefaultButton
          iconProps={{ iconName: 'ExcelDocument' }}
          text={exporting ? 'Připravuji…' : 'Export do Excelu'}
          title="Stáhne tabulku tak, jak je právě vyfiltrovaná"
          disabled={!projects || projects.length === 0 || exporting}
          onClick={exportuj}
        />
      </div>

      {exportError && (
        <MessageBar
          messageBarType={MessageBarType.error}
          isMultiline
          onDismiss={() => setExportError(undefined)}
        >
          {exportError}
        </MessageBar>
      )}

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}

      {!projects && !error && <Spinner size={SpinnerSize.large} label="Načítám projekty…" />}

      {projects && projects.length === 0 && !error && (
        <MessageBar messageBarType={MessageBarType.info}>
          Žádný projekt neodpovídá zadaným filtrům.
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
            ariaLabelForGrid="Seznam projektů"
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
      onRender: (p: Project) => {
        const name = titleWithoutNumber(p);
        return <span title={name}>{name}</span>;
      }
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

/**
 * Název projektu pro tabulku — bez čísla na začátku, to je už ve svém sloupci.
 * Číslo zůstává v `title` (generovaný název s číslem se používá jinde, např. na PDF).
 */
function titleWithoutNumber(p: Project): string {
  const prefix = `${p.projectNumber} `;
  return p.title.startsWith(prefix) ? p.title.slice(prefix.length) : p.title;
}

/** Projekty, které se počítají jako aktivní. Používá i KpiTiles. */
export function isActive(p: Project): boolean {
  return !p.isOverhead && ACTIVE_PROJECT_STATUSES.indexOf(p.status) !== -1;
}
