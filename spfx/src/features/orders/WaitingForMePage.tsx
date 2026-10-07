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
import { useAutoRefresh } from '../../ui/useAutoRefresh';
import { navigate, RouteName } from '../../ui/router';
import { OrderStatus, PurchaseOrder } from '../../core/orders';
import { isWaitingFor, toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { Project } from '../../core/types';
import { InvoiceBasis, InvoiceStatus } from '../../core/invoiceBases';
import { isWaitingForCheck } from '../../core/invoiceWorkflow';
import { InvoicesTable } from '../invoicing/InvoicesTable';
import { BudgetRecord, canApproveBudget } from '../../core/budget';
import { formatDate } from '../../core/format';
import { buildHash } from '../../ui/router';
import { Link } from '@fluentui/react/lib/Link';
import { OrdersTable } from './OrdersTable';
import { CurrencySwitch } from '../../ui/components/CurrencySwitch';
import { OrderPanel } from './OrderPanel';

export const WaitingForMePage: React.FC<{ orderId?: number }> = ({ orderId }) => {
  const { repos, user } = useApp();
  const [orders, setOrders] = React.useState<PurchaseOrder[] | undefined>(undefined);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [invoices, setInvoices] = React.useState<InvoiceBasis[]>([]);
  const [budgets, setBudgets] = React.useState<BudgetRecord[]>([]);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setError(undefined);
    Promise.all([
      repos.orders.list({ statuses: [OrderStatus.KeSchvaleni] }),
      repos.projects.list({ includeOverhead: true }),
      // Podklady ke kontrole; když seznam podkladů na webu ještě není (neběžela Instalace), stránka objednávek nespadne.
      repos.invoices.list({ statuses: [InvoiceStatus.KeKontrole] }).catch((): InvoiceBasis[] => []),
      // Rozpočty ke schválení vidí jen ten, kdo je smí schvalovat (vedení, administrátor).
      canApproveBudget(toActor(user)) ? repos.budgets.listPendingApproval().catch((): BudgetRecord[] => []) : Promise.resolve([] as BudgetRecord[])
    ])
      .then(([o, p, i, b]) => {
        if (!cancelled) {
          setOrders(o);
          setProjects(p);
          setInvoices(i);
          setBudgets(b);
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

  useAutoRefresh(() => setReloadKey((k) => k + 1), orderId !== undefined);

  const actor = React.useMemo(() => toActor(user), [user]);
  const mine = (orders ?? []).filter((o) => {
    const project = projects.filter((p) => p.projectNumber === o.projectNumber)[0];
    return !!project && isWaitingFor(o, toWorkflowProject(project), actor);
  });

  const invoicesToCheck = invoices.filter((i) => {
    const project = projects.filter((p) => p.projectNumber === i.projectNumber)[0];
    return !!project && isWaitingForCheck(i, toWorkflowProject(project), actor);
  });

  return (
    <>
      <PageHeading title="Čeká na mě" subtitle="Objednávky a rozpočty čekající na vaše schválení a podklady pro fakturaci čekající na vaši kontrolu." />

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {!orders && !error && <Spinner size={SpinnerSize.large} label="Načítám…" />}
      {orders && mine.length === 0 && invoicesToCheck.length === 0 && budgets.length === 0 && !error && (
        <MessageBar messageBarType={MessageBarType.success}>Nic na vás nečeká.</MessageBar>
      )}
      {(mine.length > 0 || invoicesToCheck.length > 0 || budgets.length > 0) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '4px 0' }}>
          <CurrencySwitch />
        </div>
      )}
      {mine.length > 0 && <h2 style={{ fontSize: 15, margin: '8px 0', color: RES.navy }}>Objednávky ke schválení</h2>}
      {mine.length > 0 && (
        <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4 }}>
          <OrdersTable
            orders={mine}
            onOpen={(id) => navigate(RouteName.WaitingForMe, String(id))}
            ariaLabel="Objednávky čekající na mě"
          />
        </div>
      )}

      {budgets.length > 0 && (
        <>
          <h2 style={{ fontSize: 15, margin: '16px 0 8px', color: RES.navy }}>Realizační rozpočty ke schválení</h2>
          <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '4px 12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: RES.gray, fontSize: 12 }}>
                  <th style={{ padding: '6px 4px' }}>Projekt</th>
                  <th style={{ padding: '6px 4px' }}>Žádost podal</th>
                  <th style={{ padding: '6px 4px' }}>Kdy</th>
                </tr>
              </thead>
              <tbody>
                {budgets.map((b) => {
                  const p = projects.filter((x) => x.projectNumber === b.projectNumber)[0];
                  return (
                    <tr key={b.id} style={{ borderTop: `1px solid ${RES.background}` }}>
                      <td style={{ padding: '6px 4px' }}>
                        <Link href={buildHash(RouteName.ProjectDetail, b.projectNumber)} style={{ fontWeight: 600 }}>
                          {b.projectNumber}
                          {p ? ` · ${p.shortName || p.title}` : ''}
                        </Link>
                      </td>
                      <td style={{ padding: '6px 4px' }}>{b.requestedByName || '—'}</td>
                      <td style={{ padding: '6px 4px' }}>{b.requestedAt ? formatDate(b.requestedAt) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ fontSize: 12, color: RES.gray, padding: '6px 4px' }}>Rozpočet se schvaluje v detailu projektu, záložka Realizační rozpočet (tlačítko Schválit nebo Vrátit k úpravě).</div>
          </div>
        </>
      )}

      {invoicesToCheck.length > 0 && (
        <>
          <h2 style={{ fontSize: 15, margin: '16px 0 8px', color: RES.navy }}>Podklady pro fakturaci ke kontrole</h2>
          <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4 }}>
            <InvoicesTable
              invoices={invoicesToCheck}
              onOpen={(id) => navigate(RouteName.Invoicing, String(id))}
              ariaLabel="Podklady pro fakturaci čekající na kontrolu"
            />
          </div>
        </>
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
