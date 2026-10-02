/**
 * Seznam podkladů pro fakturaci napříč projekty s filtry a tlačítkem pro nový podklad.
 *
 * Podklad se otevírá v panelu; jeho ID je v adrese (`#/fakturace/12`), takže jde poslat odkazem (např. v e-mailu kontrolorovi).
 */

import * as React from 'react';
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { Toggle } from '@fluentui/react/lib/Toggle';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { DatePicker } from '@fluentui/react/lib/DatePicker';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { PageHeading } from '../../ui/components/PageHeading';
import { CONTROL_HEIGHT, FilterField as Field } from '../../ui/components/FilterField';
import { CS_CALENDAR_STRINGS } from '../../ui/csCalendarStrings';
import { useAutoRefresh } from '../../ui/useAutoRefresh';
import { navigate, RouteName } from '../../ui/router';
import { formatDate, parseCzechDate } from '../../core/format';
import { INVOICE_STATUS_ORDER, InvoiceBasis, filterInvoices } from '../../core/invoiceBases';
import { canIssueInvoice } from '../../core/invoiceWorkflow';
import { toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { normalizeLogin } from '../../core/roles';
import { Project } from '../../core/types';
import { InvoicesTable } from './InvoicesTable';
import { CurrencySwitch } from '../../ui/components/CurrencySwitch';
import { InvoicePanel } from './InvoicePanel';

export const InvoicesPage: React.FC<{ invoiceId?: number }> = ({ invoiceId }) => {
  const { repos, user } = useApp();
  const [invoices, setInvoices] = React.useState<InvoiceBasis[] | undefined>(undefined);
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
    Promise.all([repos.invoices.list(), repos.projects.list({})])
      .then(([i, p]) => {
        if (!cancelled) {
          setInvoices(i);
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

  // Podklad mezitím mohl zkontrolovat nebo předat někdo jiný — seznam se sám obnoví.
  useAutoRefresh(() => setReloadKey((k) => k + 1), creating || invoiceId !== undefined);

  const actor = React.useMemo(() => toActor(user), [user]);
  const mayIssue = projects.some((p) => canIssueInvoice(toWorkflowProject(p), actor));

  const statusOptions: IDropdownOption[] = INVOICE_STATUS_ORDER.map((s) => ({ key: s, text: s }));
  const me = normalizeLogin(user.loginName);
  const shown = filterInvoices(invoices ?? [], { search, statuses, issuedFrom, issuedTo }).filter(
    (i) => !onlyMine || normalizeLogin(i.requestedByLogin) === me
  );

  return (
    <>
      <PageHeading
        title="Fakturace"
        subtitle="Podklady pro fakturaci napříč projekty. Fakturu vystavuje účtárna; tady se hlídá, co je předáno, vyfakturováno a uhrazeno."
        action={
          mayIssue ? (
            <PrimaryButton iconProps={{ iconName: 'Add' }} text="Nový podklad" onClick={() => setCreating(true)} />
          ) : undefined
        }
      />

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
        <Field label="Hledat">
          <SearchBox
            placeholder="Číslo, odběratel, projekt, faktura…"
            ariaLabel="Hledat v podkladech"
            value={search}
            onChange={(_, v) => setSearch(v ?? '')}
            onClear={() => setSearch('')}
            styles={{ root: { width: 280, height: CONTROL_HEIGHT } }}
          />
        </Field>
        <Field label="Stav">
          <Dropdown
            ariaLabel="Stav podkladu"
            multiSelect
            options={statusOptions}
            selectedKeys={statuses}
            onChange={(_, o) =>
              o && setStatuses((cur) => (o.selected ? [...cur, String(o.key)] : cur.filter((k) => k !== String(o.key))))
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
            <Toggle ariaLabel="Jen moje podklady" checked={onlyMine} onChange={(_, c) => setOnlyMine(!!c)} styles={{ root: { margin: 0 } }} />
          </div>
        </Field>
        <div style={{ flex: '1 1 auto' }} />
        <CurrencySwitch stacked />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', height: CONTROL_HEIGHT }}>
          {invoices && (
            <span style={{ color: RES.gray, fontSize: 12 }}>
              {shown.length} z {invoices.length}
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
      {!invoices && !error && <Spinner size={SpinnerSize.large} label="Načítám podklady…" />}
      {invoices && invoices.length === 0 && !error && (
        <MessageBar messageBarType={MessageBarType.info} isMultiline>
          Zatím tu není žádný podklad. {mayIssue ? 'Založte první tlačítkem Nový podklad.' : ''}
        </MessageBar>
      )}
      {invoices && invoices.length > 0 && shown.length === 0 && (
        <MessageBar messageBarType={MessageBarType.info}>Žádný podklad neodpovídá filtru.</MessageBar>
      )}

      {shown.length > 0 && (
        <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4 }}>
          <InvoicesTable invoices={shown} onOpen={(id) => navigate(RouteName.Invoicing, String(id))} />
        </div>
      )}

      <InvoicePanel
        isOpen={invoiceId !== undefined || creating}
        invoiceId={invoiceId}
        onDismiss={() => {
          setCreating(false);
          if (invoiceId !== undefined) {
            navigate(RouteName.Invoicing);
          }
        }}
        onChanged={() => setReloadKey((k) => k + 1)}
      />
    </>
  );
};
