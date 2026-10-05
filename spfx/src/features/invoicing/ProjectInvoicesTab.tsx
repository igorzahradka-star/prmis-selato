/**
 * Záložka Fakturace v detailu projektu: podklady pro fakturaci tohoto projektu a tlačítko pro nový.
 * (Plán fakturačních milníků přibude s realizačním rozpočtem a cashflow.)
 */

import * as React from 'react';
import { PrimaryButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { StickyHScroll } from '../../ui/components/StickyHScroll';
import { useAutoRefresh } from '../../ui/useAutoRefresh';
import { Project } from '../../core/types';
import { InvoiceBasis } from '../../core/invoiceBases';
import { canIssueInvoice } from '../../core/invoiceWorkflow';
import { toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { InvoicesTable } from './InvoicesTable';
import { CurrencySwitch } from '../../ui/components/CurrencySwitch';
import { InvoicePanel } from './InvoicePanel';

export const ProjectInvoicesTab: React.FC<{ project: Project }> = ({ project }) => {
  const { repos, user } = useApp();
  const [invoices, setInvoices] = React.useState<InvoiceBasis[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [openId, setOpenId] = React.useState<number | undefined>(undefined);
  const [creating, setCreating] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setError(undefined);
    repos.invoices
      .list({ projectNumber: project.projectNumber })
      .then((i) => !cancelled && setInvoices(i))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [repos, project.projectNumber, reloadKey]);

  useAutoRefresh(() => setReloadKey((k) => k + 1), openId !== undefined || creating);

  const mayIssue = canIssueInvoice(toWorkflowProject(project), toActor(user));

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ flex: '1 1 auto', color: RES.gray, fontSize: 13 }}>
          {project.isOverhead
            ? 'Na projekt Režie se nefakturuje.'
            : `Podklady pro fakturaci projektu ${project.projectNumber}. Všechny podklady napříč projekty najdete v části Fakturace.`}
        </div>
        <div style={{ marginRight: 12 }}>
          <CurrencySwitch />
        </div>
        {mayIssue && <PrimaryButton iconProps={{ iconName: 'Add' }} text="Nový podklad" onClick={() => setCreating(true)} />}
      </div>

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {!invoices && !error && <Spinner size={SpinnerSize.medium} label="Načítám podklady…" />}
      {invoices && invoices.length === 0 && !project.isOverhead && (
        <MessageBar messageBarType={MessageBarType.info}>Tento projekt zatím nemá žádný podklad pro fakturaci.</MessageBar>
      )}
      {invoices && invoices.length > 0 && (
        <StickyHScroll scrollSelector=".ms-DetailsList">
          <InvoicesTable invoices={invoices} hideProject onOpen={(id) => setOpenId(id)} />
        </StickyHScroll>
      )}

      <InvoicePanel
        isOpen={openId !== undefined || creating}
        invoiceId={openId}
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
