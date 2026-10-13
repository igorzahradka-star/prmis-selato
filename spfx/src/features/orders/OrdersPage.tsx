/**
 * Seznam objednávek napříč projekty s filtry a tlačítkem pro novou objednávku.
 *
 * Objednávka se otevírá v panelu; její číslo je v adrese (`#/objednavky/12`), takže jde poslat odkazem.
 */

import * as React from 'react';
import { hiddenServiceNumbers } from '../../core/service';
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { Toggle } from '@fluentui/react/lib/Toggle';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { DatePicker } from '@fluentui/react/lib/DatePicker';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { StickyHScroll } from '../../ui/components/StickyHScroll';
import { PageHeading } from '../../ui/components/PageHeading';
import { CONTROL_HEIGHT, FilterField as Field } from '../../ui/components/FilterField';
import { CS_CALENDAR_STRINGS } from '../../ui/csCalendarStrings';
import { useAutoRefresh } from '../../ui/useAutoRefresh';
import { formatDate, parseCzechDate } from '../../core/format';
import { navigate, RouteName } from '../../ui/router';
import { ORDER_STATUS_ORDER, PurchaseOrder, filterOrders } from '../../core/orders';
import { canIssueOrder, toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { normalizeLogin } from '../../core/roles';
import { Project } from '../../core/types';
import { OrdersTable } from './OrdersTable';
import { CurrencySwitch } from '../../ui/components/CurrencySwitch';
import { OrderPanel } from './OrderPanel';

export const OrdersPage: React.FC<{ orderId?: number }> = ({ orderId }) => {
  const { repos, user } = useApp();
  const [orders, setOrders] = React.useState<PurchaseOrder[] | undefined>(undefined);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [search, setSearch] = React.useState('');
  const [statuses, setStatuses] = React.useState<string[]>([]);
  const [onlyMine, setOnlyMine] = React.useState(false);
  const [issuedFrom, setIssuedFrom] = React.useState<Date | undefined>(undefined);
  const [issuedTo, setIssuedTo] = React.useState<Date | undefined>(undefined);
  const [creating, setCreating] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setError(undefined);
    Promise.all([repos.orders.list(), repos.projects.list({ includeOverhead: true, includeService: true })])
      .then(([o, p]) => {
        if (!cancelled) {
          const hidden = hiddenServiceNumbers(p, user.roles);
          setOrders(o.filter((x) => !hidden.has(x.projectNumber)));
          setProjects(p.filter((x) => !hidden.has(x.projectNumber)));
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
  }, [repos, user, reloadKey]);

  // Objednávku mezitím mohl schválit nebo zamítnout někdo jiný — seznam se sám obnoví.
  useAutoRefresh(() => setReloadKey((k) => k + 1), creating || orderId !== undefined);

  const actor = React.useMemo(() => toActor(user), [user]);
  const mayIssue = projects.some((p) => canIssueOrder(toWorkflowProject(p), actor));

  const statusOptions: IDropdownOption[] = ORDER_STATUS_ORDER.map((s) => ({ key: s, text: s }));
  const me = normalizeLogin(user.loginName);
  const shown = filterOrders(orders ?? [], { search, statuses, issuedFrom, issuedTo }).filter(
    (o) => !onlyMine || normalizeLogin(o.requestedByLogin) === me
  );

  return (
    <>
      <PageHeading
        title="Objednávky"
        subtitle="Nákupní objednávky napříč projekty. Schvalování podle limitů z Nastavení."
        action={
          mayIssue ? (
            <PrimaryButton iconProps={{ iconName: 'Add' }} text="Nová objednávka" onClick={() => setCreating(true)} />
          ) : undefined
        }
      />

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
        <Field label="Hledat">
          <SearchBox
            placeholder="Číslo, předmět, dodavatel, projekt…"
            ariaLabel="Hledat v objednávkách"
            value={search}
            onChange={(_, v) => setSearch(v ?? '')}
            onClear={() => setSearch('')}
            styles={{ root: { width: 280, height: CONTROL_HEIGHT } }}
          />
        </Field>
        <Field label="Stav">
          <Dropdown
            ariaLabel="Stav objednávky"
            multiSelect
            options={statusOptions}
            selectedKeys={statuses}
            onChange={(_, o) =>
              o &&
              setStatuses((cur) => (o.selected ? [...cur, String(o.key)] : cur.filter((k) => k !== String(o.key))))
            }
            placeholder="Všechny stavy"
            styles={{ root: { width: 190 } }}
          />
        </Field>
        <Field label="Vystaveno od">
          <DatePicker
            ariaLabel="Vystaveno od"
            value={issuedFrom}
            onSelectDate={(d) => setIssuedFrom(d ?? undefined)}
            formatDate={(d) => (d ? formatDate(d) : '')}
            strings={CS_CALENDAR_STRINGS}
            parseDateFromString={(t) => parseCzechDate(t) ?? null}
            allowTextInput
            placeholder="kdykoli"
            styles={{ root: { width: 150 } }}
          />
        </Field>
        <Field label="Vystaveno do">
          <DatePicker
            ariaLabel="Vystaveno do"
            value={issuedTo}
            onSelectDate={(d) => setIssuedTo(d ?? undefined)}
            formatDate={(d) => (d ? formatDate(d) : '')}
            strings={CS_CALENDAR_STRINGS}
            parseDateFromString={(t) => parseCzechDate(t) ?? null}
            allowTextInput
            placeholder="kdykoli"
            styles={{ root: { width: 150 } }}
          />
        </Field>
        {(issuedFrom || issuedTo) && (
          <Field label="">
            <DefaultButton
              text="Zrušit datum"
              onClick={() => {
                setIssuedFrom(undefined);
                setIssuedTo(undefined);
              }}
            />
          </Field>
        )}
        <Field label="Jen moje">
          <div style={{ height: CONTROL_HEIGHT, display: 'flex', alignItems: 'center' }}>
            <Toggle
              ariaLabel="Jen moje objednávky"
              checked={onlyMine}
              onChange={(_, c) => setOnlyMine(!!c)}
              styles={{ root: { margin: 0 } }}
            />
          </div>
        </Field>
        <div style={{ flex: '1 1 auto' }} />
        <CurrencySwitch stacked />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', height: CONTROL_HEIGHT }}>
          {orders && (
            <span style={{ color: RES.gray, fontSize: 12 }}>
              {shown.length} z {orders.length}
            </span>
          )}
          <DefaultButton iconProps={{ iconName: 'Refresh' }} text="Obnovit" onClick={() => setReloadKey((k) => k + 1)} />
        </div>
      </div>

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {!orders && !error && <Spinner size={SpinnerSize.large} label="Načítám objednávky…" />}
      {orders && orders.length === 0 && !error && (
        <MessageBar messageBarType={MessageBarType.info} isMultiline>
          Zatím tu není žádná objednávka. {mayIssue ? 'Založte první tlačítkem Nová objednávka.' : ''}
        </MessageBar>
      )}
      {orders && orders.length > 0 && shown.length === 0 && (
        <MessageBar messageBarType={MessageBarType.info}>Žádná objednávka neodpovídá filtru.</MessageBar>
      )}

      {shown.length > 0 && (
        <StickyHScroll scrollSelector=".ms-DetailsList">
          <OrdersTable orders={shown} onOpen={(id) => navigate(RouteName.Orders, String(id))} />
        </StickyHScroll>
      )}

      <OrderPanel
        isOpen={orderId !== undefined || creating}
        orderId={orderId}
        onDismiss={() => {
          setCreating(false);
          if (orderId !== undefined) {
            navigate(RouteName.Orders);
          }
        }}
        onChanged={() => setReloadKey((k) => k + 1)}
      />
    </>
  );
};

