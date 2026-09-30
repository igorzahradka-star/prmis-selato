/**
 * Seznam objednávek napříč projekty s filtry a tlačítkem pro novou objednávku.
 *
 * Objednávka se otevírá v panelu; její číslo je v adrese (`#/objednavky/12`), takže jde poslat odkazem.
 */

import * as React from 'react';
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { Toggle } from '@fluentui/react/lib/Toggle';
import { PrimaryButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { PageHeading } from '../../ui/components/PageHeading';
import { navigate, RouteName } from '../../ui/router';
import { ORDER_STATUS_ORDER, PurchaseOrder, filterOrders } from '../../core/orders';
import { canIssueOrder, toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { normalizeLogin } from '../../core/roles';
import { Project } from '../../core/types';
import { OrdersTable } from './OrdersTable';
import { OrderPanel } from './OrderPanel';

export const OrdersPage: React.FC<{ orderId?: number }> = ({ orderId }) => {
  const { repos, user } = useApp();
  const [orders, setOrders] = React.useState<PurchaseOrder[] | undefined>(undefined);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [search, setSearch] = React.useState('');
  const [statuses, setStatuses] = React.useState<string[]>([]);
  const [onlyMine, setOnlyMine] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setError(undefined);
    Promise.all([repos.orders.list(), repos.projects.list({ includeOverhead: true })])
      .then(([o, p]) => {
        if (!cancelled) {
          setOrders(o);
          setProjects(p);
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
  }, [repos, reloadKey]);

  const actor = React.useMemo(() => toActor(user), [user]);
  const mayIssue = projects.some((p) => canIssueOrder(toWorkflowProject(p), actor));

  const statusOptions: IDropdownOption[] = ORDER_STATUS_ORDER.map((s) => ({ key: s, text: s }));
  const me = normalizeLogin(user.loginName);
  const shown = filterOrders(orders ?? [], { search, statuses }).filter(
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
        <SearchBox
          placeholder="Hledat číslo, předmět, dodavatele, projekt…"
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
          onChange={(_, o) =>
            o &&
            setStatuses((cur) => (o.selected ? [...cur, String(o.key)] : cur.filter((k) => k !== String(o.key))))
          }
          placeholder="Všechny stavy"
          styles={{ root: { minWidth: 200 } }}
        />
        <Toggle label="Jen moje" inlineLabel checked={onlyMine} onChange={(_, c) => setOnlyMine(!!c)} styles={{ root: { margin: 0 } }} />
        <div style={{ flex: '1 1 auto' }} />
        {orders && (
          <span style={{ color: RES.gray, fontSize: 12 }}>
            {shown.length} z {orders.length}
          </span>
        )}
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
        <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4 }}>
          <OrdersTable orders={shown} onOpen={(id) => navigate(RouteName.Orders, String(id))} />
        </div>
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
