/**
 * „Čeká na mě" — objednávky, které právě čekají na schválení přihlášeným uživatelem.
 *
 * Kdo je na řadě, rozhoduje `core/orderWorkflow` (isWaitingFor): první nevyřízený krok
 * řetězce a role či projekt schvalovatele; vlastní objednávka sem nikdy nepatří.
 */

import * as React from 'react';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { PageHeading } from '../../ui/components/PageHeading';
import { navigate, RouteName } from '../../ui/router';
import { OrderStatus, PurchaseOrder } from '../../core/orders';
import { isWaitingFor, toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { Project } from '../../core/types';
import { OrdersTable } from './OrdersTable';
import { OrderPanel } from './OrderPanel';

export const WaitingForMePage: React.FC<{ orderId?: number }> = ({ orderId }) => {
  const { repos, user } = useApp();
  const [orders, setOrders] = React.useState<PurchaseOrder[] | undefined>(undefined);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setError(undefined);
    Promise.all([
      repos.orders.list({ statuses: [OrderStatus.KeSchvaleni] }),
      repos.projects.list({ includeOverhead: true })
    ])
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
  const mine = (orders ?? []).filter((o) => {
    const project = projects.filter((p) => p.projectNumber === o.projectNumber)[0];
    return !!project && isWaitingFor(o, toWorkflowProject(project), actor);
  });

  return (
    <>
      <PageHeading title="Čeká na mě" subtitle="Objednávky, které právě čekají na vaše schválení." />

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {!orders && !error && <Spinner size={SpinnerSize.large} label="Načítám…" />}
      {orders && mine.length === 0 && !error && (
        <MessageBar messageBarType={MessageBarType.success}>Nic na vás nečeká.</MessageBar>
      )}
      {mine.length > 0 && (
        <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4 }}>
          <OrdersTable
            orders={mine}
            onOpen={(id) => navigate(RouteName.WaitingForMe, String(id))}
            ariaLabel="Objednávky čekající na mě"
          />
        </div>
      )}

      <OrderPanel
        isOpen={orderId !== undefined}
        orderId={orderId}
        onDismiss={() => navigate(RouteName.WaitingForMe)}
        onChanged={() => setReloadKey((k) => k + 1)}
      />
    </>
  );
};
