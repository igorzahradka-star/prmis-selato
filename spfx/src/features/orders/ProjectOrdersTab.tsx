/**
 * Záložka Objednávky v detailu projektu: objednávky tohoto projektu a tlačítko pro novou.
 */

import * as React from 'react';
import { PrimaryButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { Project } from '../../core/types';
import { PurchaseOrder } from '../../core/orders';
import { canIssueOrder, toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { OrdersTable } from './OrdersTable';
import { OrderPanel } from './OrderPanel';

export const ProjectOrdersTab: React.FC<{ project: Project }> = ({ project }) => {
  const { repos, user } = useApp();
  const [orders, setOrders] = React.useState<PurchaseOrder[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [openId, setOpenId] = React.useState<number | undefined>(undefined);
  const [creating, setCreating] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setError(undefined);
    repos.orders
      .list({ projectNumber: project.projectNumber })
      .then((o) => !cancelled && setOrders(o))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [repos, project.projectNumber, reloadKey]);

  const mayIssue = canIssueOrder(toWorkflowProject(project), toActor(user));

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ flex: '1 1 auto', color: RES.gray, fontSize: 13 }}>
          Objednávky projektu {project.projectNumber}. Všechny objednávky napříč projekty najdete v části Objednávky.
        </div>
        {mayIssue && (
          <PrimaryButton iconProps={{ iconName: 'Add' }} text="Nová objednávka" onClick={() => setCreating(true)} />
        )}
      </div>

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {!orders && !error && <Spinner size={SpinnerSize.medium} label="Načítám objednávky…" />}
      {orders && orders.length === 0 && (
        <MessageBar messageBarType={MessageBarType.info}>Tento projekt zatím nemá žádnou objednávku.</MessageBar>
      )}
      {orders && orders.length > 0 && (
        <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4 }}>
          <OrdersTable orders={orders} hideProject onOpen={(id) => setOpenId(id)} />
        </div>
      )}

      <OrderPanel
        isOpen={openId !== undefined || creating}
        orderId={openId}
        projectNumber={project.projectNumber}
        onDismiss={() => {
          setOpenId(undefined);
          setCreating(false);
        }}
        onChanged={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
};
