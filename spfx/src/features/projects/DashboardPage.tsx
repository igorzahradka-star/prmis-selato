/**
 * Dashboard projektů — úvodní obrazovka aplikace.
 *
 * KPI dlaždice, tabulka projektů, filtry a fulltext nad daty, která už v seznamu jsou.
 * Částky v přehledu jsou ve **výchozí měně** z Nastavení (přepočet kurzem ČNB).
 */

import * as React from 'react';
import { DetailsList, DetailsListLayoutMode, IColumn, SelectionMode } from '@fluentui/react/lib/DetailsList';
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { PrimaryButton } from '@fluentui/react/lib/Button';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Link } from '@fluentui/react/lib/Link';
import { useApp } from '../../ui/AppContext';
import { loadProjectManagerNames } from './projectManagers';
import { DEFAULT_SORT, ProjectSortKey, sortProjects } from '../../core/projectSort';
import { quickStatusChange } from '../../core/projectStatus';
import { isCustomOrder, moveColumn, orderColumns } from '../../core/columnOrder';
import { StatusSelect } from './StatusSelect';
import { RES, LAYOUT } from '../../ui/theme';
import { buildHash, RouteName } from '../../ui/router';
import { BudgetBadge } from '../../ui/components/StatusBadge';
import { KpiTiles } from './KpiTiles';
import { NewProjectPanel } from './NewProjectPanel';
import { BudgetStatus, Project, ProjectStatus, ACTIVE_PROJECT_STATUSES } from '../../core/types';
import { formatDate, formatMoney, dueLabel } from '../../core/format';
import { PurchaseOrder, SPENT_ORDER_STATUSES, spentByProject } from '../../core/orders';
import { ReportCurrency, useReportCurrency } from '../../ui/useReportCurrency';
import { canCreateProject, canEditProject } from '../../core/roles';
import streakUrl from '../../webparts/prm/assets/res-kpi-streak.png';

/** Stejný diagonální přechod (tmavá → navy → modrá) jako v grafickém manuálu RES. */
const HERO_GRADIENT = `linear-gradient(135deg, ${RES.text} 0%, ${RES.navyDark} 55%, ${RES.blue} 100%)`;

const VIEW_KEY = 'prm.dashboard.view';

interface SavedView {
  search: string;
  statuses: string[];
  pms: string[];
  sort: { key: ProjectSortKey; descending: boolean };
}

/**
 * Pohled (hledání, filtry, řazení) se pamatuje po dobu otevřené karty prohlížeče,
 * aby se člověk po návratu z detailu projektu nevracel do nefiltrovaného seznamu.
 * Když úložiště není k dispozici, seznam se prostě ukáže výchozí.
 */
function loadView(): SavedView | undefined {
  try {
    const raw = window.sessionStorage.getItem(VIEW_KEY);
    if (!raw) {
      return undefined;
    }
    const v = JSON.parse(raw) as Partial<SavedView>;
    const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every((i) => typeof i === 'string');
    if (typeof v.search !== 'string' || !strings(v.statuses) || !strings(v.pms) || !v.sort) {
      return undefined;
    }
    if (SORTABLE_KEYS.indexOf(v.sort.key) === -1 || typeof v.sort.descending !== 'boolean') {
      return undefined;
    }
    return v as SavedView;
  } catch {
    return undefined;
  }
}

function saveView(view: SavedView): void {
  try {
    window.sessionStorage.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    // Bez úložiště se pohled jen nezapamatuje.
  }
}

export const DashboardPage: React.FC = () => {
  const { repos, settings, user } = useApp();
  const savedView = React.useMemo(() => loadView(), []);

  const [projects, setProjects] = React.useState<Project[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [search, setSearch] = React.useState<string>(savedView ? savedView.search : '');
  const [statuses, setStatuses] = React.useState<string[]>(savedView ? savedView.statuses : []);
  const [pms, setPms] = React.useState<string[]>(savedView ? savedView.pms : []);
  const [pmOptions, setPmOptions] = React.useState<IDropdownOption[]>([]);
  const [isNewProjectOpen, setIsNewProjectOpen] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);
  // Výchozí řazení: podle čísla vzestupně. Klik na záhlaví sloupce řazení přepne.
  const [sort, setSort] = React.useState<{ key: ProjectSortKey; descending: boolean }>(
    savedView ? savedView.sort : DEFAULT_SORT
  );
  const [columnOrder, setColumnOrder] = React.useState<string[] | undefined>(() => loadColumnOrder(user.loginName));
  const [busyNumber, setBusyNumber] = React.useState<string | undefined>(undefined);
  const [statusError, setStatusError] = React.useState<string | undefined>(undefined);
  const [statusNote, setStatusNote] = React.useState<string | undefined>(undefined);
  const report = useReportCurrency();
  /** Objednávky všech projektů — z nich se počítá sloupec Vyčerpáno. Dokud se nenačtou (nebo když se nenačtou), je sloupec prázdný. */
  const [orders, setOrders] = React.useState<PurchaseOrder[] | undefined>(undefined);

  React.useEffect(() => {
    let cancelled = false;
    repos.orders
      .list({})
      .then((o) => !cancelled && setOrders(o))
      .catch(() => !cancelled && setOrders(undefined));
    return () => {
      cancelled = true;
    };
  }, [repos, refreshKey]);

  const spent = React.useMemo(() => (orders ? spentByProject(orders, (amount, currency) => report.convert(amount, currency)) : undefined), [orders, report]);

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

  React.useEffect(() => saveView({ search, statuses, pms, sort }), [search, statuses.join(','), pms.join(','), sort.key, sort.descending]);

  /** Změna stavu přímo ze seznamu — zapíše jen stav, ostatní údaje projektu zůstanou. */
  const changeStatus = (p: Project, status: ProjectStatus): void => {
    if (status === p.status) {
      return;
    }
    setBusyNumber(p.projectNumber);
    setStatusError(undefined);
    setStatusNote(undefined);
    const change = quickStatusChange(p, status);
    repos.projects
      .updateStatus(p.projectNumber, change, user)
      .then((updated) => {
        setBusyNumber(undefined);
        setProjects((cur) => (cur ? cur.map((x) => (x.projectNumber === updated.projectNumber ? updated : x)) : cur));
        setStatusNote(change.note);
      })
      .catch((e: Error) => {
        setBusyNumber(undefined);
        setStatusError(e.message);
      });
  };

  const displayedColumns = orderColumns(
    withSorting(
      buildColumns({
        canEdit: (p) =>
          canEditProject(user.roles, user.loginName, {
            projectManagerLogin: p.projectManagerLogin,
            assistantLogins: p.assistantLogins
          }),
        busyNumber,
        onStatus: changeStatus,
        report,
        spent
      }),
      sort,
      (key) =>
        setSort((cur) => (cur.key === key ? { key, descending: !cur.descending } : { key, descending: false }))
    ),
    columnOrder,
    DEFAULT_COLUMN_ORDER
  );
  const customColumns = isCustomOrder(columnOrder, DEFAULT_COLUMN_ORDER, DEFAULT_COLUMN_ORDER);

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
      </div>

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}

      {statusError && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setStatusError(undefined)}>
          {statusError}
        </MessageBar>
      )}
      {statusNote && (
        <MessageBar messageBarType={MessageBarType.info} isMultiline onDismiss={() => setStatusNote(undefined)}>
          {statusNote}
        </MessageBar>
      )}

      {!projects && !error && <Spinner size={SpinnerSize.large} label="Načítám projekty…" />}

      {projects && projects.length === 0 && !error && (
        <MessageBar messageBarType={MessageBarType.info}>
          Žádný projekt neodpovídá zadaným filtrům.
        </MessageBar>
      )}

      {projects && projects.length > 0 && customColumns && (
        <div style={{ margin: '0 0 6px', fontSize: 12 }}>
          Pořadí sloupců je upravené.{' '}
          <Link
            onClick={() => {
              setColumnOrder(undefined);
              saveColumnOrder(user.loginName, undefined);
            }}
          >
            Obnovit výchozí pořadí
          </Link>
        </div>
      )}

      {projects && projects.length > 0 && (
        <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4 }}>
          <DetailsList
            items={sortProjects(projects, sort.key, sort.descending, (p) => (p.contractPriceNet === undefined ? undefined : report.convert(p.contractPriceNet, p.currency)))}
            columns={displayedColumns}
            columnReorderOptions={{
              // Přetažením záhlaví si každý uloží pořadí sloupců po svém.
              onColumnDrop: ({ draggedIndex, targetIndex }) => {
                const next = moveColumn(
                  displayedColumns.map((c) => c.key),
                  draggedIndex,
                  targetIndex
                );
                setColumnOrder(next);
                saveColumnOrder(user.loginName, next);
              }
            }}
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

/** Sloupce, podle kterých jde řadit (klik na záhlaví). Rozpočet je obrázek, ne hodnota. */
const SORTABLE_KEYS: ProjectSortKey[] = ['number', 'title', 'pm', 'price', 'deadline', 'start', 'end', 'status'];

/** Doplní sloupcům šipku řazení a reakci na klik. */
function withSorting(
  columns: IColumn[],
  sort: { key: ProjectSortKey; descending: boolean },
  onSort: (key: ProjectSortKey) => void
): IColumn[] {
  return columns.map((c) => {
    const key = c.key as ProjectSortKey;
    if (SORTABLE_KEYS.indexOf(key) === -1) {
      return c;
    }
    return {
      ...c,
      isSorted: sort.key === key,
      isSortedDescending: sort.key === key && sort.descending,
      onColumnClick: () => onSort(key)
    };
  });
}

/** Sloupce tabulky podle zadání, kap. 8.1. */
interface ColumnContext {
  canEdit: (p: Project) => boolean;
  busyNumber?: string;
  onStatus: (p: Project, status: ProjectStatus) => void;
  /** Výchozí měna přehledů a přepočet do ní. */
  report: ReportCurrency;
  /** Vyčerpáno podle projektu (ve výchozí měně přehledů); `undefined`, dokud se objednávky nenačtou. */
  spent?: Record<string, number>;
}

function buildColumns(ctx: ColumnContext): IColumn[] {
  const columns: IColumn[] = [
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
        <div
          style={{ textAlign: 'right' }}
          title={p.currency === ctx.report.currency || p.contractPriceNet === undefined ? undefined : `Původně ${formatMoney(p.contractPriceNet, p.currency)}, přepočteno kurzem ČNB`}
        >
          {p.currency !== ctx.report.currency && p.contractPriceNet !== undefined ? '≈ ' : ''}
          {ctx.report.format(p.contractPriceNet, p.currency)}
        </div>
      )
    },
    {
      key: 'cost',
      name: 'Náklady',
      minWidth: 100,
      maxWidth: 120,
      isResizable: true,
      styles: { cellTitle: { justifyContent: 'flex-end' } },
      onRender: () => (
        <div style={{ textAlign: 'right', color: RES.gray }} title="Plánované náklady doplníme z realizačního rozpočtu (Fáze 3).">
          —
        </div>
      )
    },
    {
      key: 'spent',
      name: 'Vyčerpáno',
      minWidth: 100,
      maxWidth: 120,
      isResizable: true,
      styles: { cellTitle: { justifyContent: 'flex-end' } },
      onRender: (p: Project) => (
        <div
          style={{ textAlign: 'right' }}
          title={`Součet vystavených objednávek projektu bez DPH (${SPENT_ORDER_STATUSES.join(', ')}) ve výchozí měně přehledů.`}
        >
          {ctx.spent ? formatMoney(ctx.spent[p.projectNumber] ?? 0, ctx.report.currency) : '…'}
        </div>
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
      minWidth: 120,
      maxWidth: 140,
      isResizable: true,
      onRender: (p: Project) => (
        <StatusSelect
          status={p.status}
          projectNumber={p.projectNumber}
          canEdit={ctx.canEdit(p)}
          busy={ctx.busyNumber === p.projectNumber}
          onChange={(s) => ctx.onStatus(p, s)}
        />
      )
    }
  ];
  return columns;
}

/** Výchozí pořadí sloupců: Stav hned za projektovým manažerem. */
const DEFAULT_COLUMN_ORDER = ['number', 'title', 'pm', 'status', 'budget', 'price', 'cost', 'spent', 'deadline', 'start', 'end'];

/** Pořadí sloupců si pamatuje prohlížeč, zvlášť pro každého přihlášeného uživatele. */
function columnOrderKey(loginName: string): string {
  return `prm.dashboard.columns.${loginName}`;
}

function loadColumnOrder(loginName: string): string[] | undefined {
  try {
    const raw = window.localStorage.getItem(columnOrderKey(loginName));
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    return Array.isArray(parsed) && parsed.every((k) => typeof k === 'string') ? (parsed as string[]) : undefined;
  } catch {
    return undefined;
  }
}

function saveColumnOrder(loginName: string, order: string[] | undefined): void {
  try {
    if (order) {
      window.localStorage.setItem(columnOrderKey(loginName), JSON.stringify(order));
    } else {
      window.localStorage.removeItem(columnOrderKey(loginName));
    }
  } catch {
    // Bez úložiště se pořadí jen nezapamatuje.
  }
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
