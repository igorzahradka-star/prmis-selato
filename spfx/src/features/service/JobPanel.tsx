/**
 * Detail servisního listu: údaje, objednávka dodavateli, provedení, kontrola a fakturace, a tlačítka podle stavu a role.
 * Přechody dělá `repos.service.actOnJob` (pravidla v `core/serviceJobs`); tady se jen sbírají údaje a ukazují chyby.
 */

import * as React from 'react';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { ChoiceGroup } from '@fluentui/react/lib/ChoiceGroup';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { Link } from '@fluentui/react/lib/Link';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { TextField } from '@fluentui/react/lib/TextField';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { formatDate, formatDateTime } from '../../core/format';
import { Partner } from '../../core/types';
import { ServiceDevice, ServiceSite } from '../../core/service';
import { JobAction, JobActionInput, ServiceJob, availableJobActions, isJobOverdue } from '../../core/serviceJobs';
import { InvoiceStatus } from '../../core/invoiceBases';
import { OrderStatus } from '../../core/orders';
import { OrderPanel } from '../orders/OrderPanel';
import { InvoicePanel } from '../invoicing/InvoicePanel';
import { ServiceJobInput } from '../../data/repositories';
import { CommentDialog, JobDialog } from './ServiceDialogs';
import { notifyServiceManagers, serviceLink } from './serviceNotify';
import { serviceJobToCheckMail } from '../../core/notifications';
import { DATE_INPUT, Fact, JobKindBadge, JobStatusBadge, dateToInput, inputToDate } from './serviceUi';

const ACTION_LABELS: Record<JobAction, string> = {
  edit: 'Upravit',
  order: 'Objednat dodavatele',
  report: 'Zapsat provedení',
  returnToSupplier: 'Vrátit dodavateli',
  check: 'Zkontrolovat a odemknout fakturaci',
  invoice: 'Založit podklad pro fakturaci',
  markInvoiced: 'Označit jako vyfakturováno',
  close: 'Uzavřít',
  cancel: 'Zrušit servisní list'
};

type Dlg = JobAction | undefined;

export const JobPanel: React.FC<{
  job: ServiceJob;
  sites: ServiceSite[];
  devices: ServiceDevice[];
  partners: Partner[];
  allJobs: ServiceJob[];
  onClose: () => void;
  onChanged: () => void;
}> = ({ job, sites, devices, partners, allJobs, onClose, onChanged }) => {
  const { repos, user, settings } = useApp();
  const [dlg, setDlg] = React.useState<Dlg>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [orderOpen, setOrderOpen] = React.useState(false);
  const [invoiceOpen, setInvoiceOpen] = React.useState(false);
  const [reload, setReload] = React.useState(0);
  const [orders, setOrders] = React.useState<{ id: number; orderNumber: string; supplierName: string; status: string; subject: string }[]>([]);
  const [invoices, setInvoices] = React.useState<{ id: number; number: string; status: string; customerName?: string }[]>([]);
  const [pick, setPick] = React.useState<number | undefined>(undefined);

  const site = sites.filter((s) => s.number === job.siteNumber)[0];
  const device = devices.filter((d) => d.number === job.deviceNumber)[0];
  const actions = availableJobActions(job, user.roles);

  React.useEffect(() => {
    repos.orders
      .list({ projectNumber: job.deviceNumber })
      .then((l) => setOrders(l.map((o) => ({ id: o.id, orderNumber: o.orderNumber, supplierName: o.supplierName || '', status: o.status, subject: o.subject }))))
      .catch(() => setOrders([]));
    repos.invoices
      .list({ projectNumber: job.deviceNumber })
      .then((l) => setInvoices(l.map((i) => ({ id: i.id, number: i.number, status: i.status, customerName: i.customerName }))))
      .catch(() => setInvoices([]));
  }, [repos, job.deviceNumber, reload]);

  const act = (action: JobAction, input: JobActionInput): Promise<unknown> => repos.service.actOnJob(job.id, action, input, user);
  const done = (): void => {
    setDlg(undefined);
    setPick(undefined);
    onChanged();
  };

  const usedOrders = new Set(allJobs.filter((j) => j.id !== job.id && j.orderId).map((j) => j.orderId));
  const usedInvoices = new Set(allJobs.filter((j) => j.id !== job.id && j.invoiceId).map((j) => j.invoiceId));
  const orderOptions = orders.filter((o) => !usedOrders.has(o.id) && o.status !== OrderStatus.Storno).map((o) => ({ key: o.id, text: `${o.orderNumber} · ${o.supplierName} · ${o.subject} (${o.status})` }));
  const invoiceOptions = invoices.filter((i) => !usedInvoices.has(i.id) && i.status !== InvoiceStatus.Storno).map((i) => ({ key: i.id, text: `${i.number} · ${i.customerName || '—'} (${i.status})` }));

  const [reportText, setReportText] = React.useState(job.workReport ?? '');
  const [proofKind, setProofKind] = React.useState<string>(job.proofKind ?? 'Popis');
  const [verifiedBy, setVerifiedBy] = React.useState(user.displayName);
  const [hours, setHours] = React.useState(job.hours !== undefined ? String(job.hours).replace('.', ',') : '');
  const [material, setMaterial] = React.useState(job.material ?? '');
  const [photosUrl, setPhotosUrl] = React.useState(job.photosUrl ?? '');
  const [doneAt, setDoneAt] = React.useState(dateToInput(job.doneAt ?? new Date()));
  const [busy, setBusy] = React.useState(false);
  const [dlgError, setDlgError] = React.useState<string | undefined>(undefined);

  const submit = (action: JobAction, input: JobActionInput): void => {
    setBusy(true);
    setDlgError(undefined);
    act(action, input)
      .then(async () => {
        // Provedení zapsané za dodavatele čeká na kontrolu správcem — správci dostanou upozornění.
        if (action === 'report') {
          await notifyServiceManagers(repos, settings, user, serviceJobToCheckMail({ number: job.number, title: job.title, deviceName: device ? `${device.number} ${device.name}` : job.deviceNumber, supplierName: job.supplierName, reportedBy: user.displayName, link: serviceLink(), companyName: settings.company.name }));
        }
        setBusy(false);
        done();
      })
      .catch((e: unknown) => {
        setBusy(false);
        setDlgError(e instanceof Error ? e.message : String(e));
      });
  };

  const closeDialog = (): void => {
    setDlg(undefined);
    setDlgError(undefined);
    setPick(undefined);
  };

  const orderLink = job.orderId ? (
    <Link href={`#/objednavky/${job.orderId}`}>{job.orderNumber || `objednávka ${job.orderId}`}</Link>
  ) : (
    job.orderNumber
  );
  const invoiceLink = job.invoiceId ? (
    <Link href={`#/fakturace/${job.invoiceId}`}>{job.invoiceNumber || `podklad ${job.invoiceId}`}</Link>
  ) : (
    job.invoiceNumber
  );

  const footer = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 0' }}>
      {actions.map((a) =>
        a === 'check' || a === 'order' || a === 'report' || a === 'invoice' ? (
          <PrimaryButton key={a} text={ACTION_LABELS[a]} onClick={() => setDlg(a)} />
        ) : (
          <DefaultButton key={a} text={ACTION_LABELS[a]} onClick={() => setDlg(a)} />
        )
      )}
      <DefaultButton text="Zavřít" onClick={onClose} />
    </div>
  );

  return (
    <>
      <Panel isOpen onDismiss={onClose} type={PanelType.medium} headerText={`${job.number} · ${job.title}`} closeButtonAriaLabel="Zavřít" isFooterAtBottom onRenderFooterContent={() => footer}>
        {error && (
          <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>
            {error}
          </MessageBar>
        )}
        <div style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <JobStatusBadge status={job.status} />
          {isJobOverdue(job) && <span style={{ color: RES.red, fontSize: 12 }}>po plánovaném termínu</span>}
        </div>
        <Fact label="Lokalita / soubor">
          {site ? `${site.number} ${site.name}` : job.siteNumber} · {device ? `${device.number} ${device.name}` : job.deviceNumber === job.siteNumber ? 'celá lokalita (společné zásahy)' : job.deviceNumber}{' '}
          <Link href={`#/projekt/${job.deviceNumber}`}>servisní projekt</Link>
        </Fact>
        <Fact label="Druh listu">
          <JobKindBadge kind={job.jobKind} />
        </Fact>
        {job.requestNumber && <Fact label="Požadavek">{job.requestNumber}</Fact>}
        <Fact label="Zadání práce">{job.description && <span style={{ whiteSpace: 'pre-wrap' }}>{job.description}</span>}</Fact>
        <Fact label="Dodavatel">{job.supplierName}</Fact>
        <Fact label="Plánovaný termín">{job.plannedDate ? formatDate(job.plannedDate) : ''}</Fact>
        <Fact label="Objednávka dodavateli">{orderLink}</Fact>

        {(job.doneAt || job.workReport) && (
          <div style={{ borderTop: `1px solid ${RES.grayBlue}`, paddingTop: 8, marginTop: 4 }}>
            <div style={{ fontWeight: 600, color: RES.navy, marginBottom: 6 }}>Provedení</div>
            <Fact label="Provedeno dne">{job.doneAt ? formatDate(job.doneAt) : ''}</Fact>
            <Fact label="Doklad o provedení">{job.proofKind ? (job.proofKind === 'Vzdálené ověření' && job.verifiedByName ? `Ověření na dálku — ${job.verifiedByName}${job.verifiedAt ? ', ' + formatDateTime(job.verifiedAt) : ''}` : job.proofKind) : ''}</Fact>
            <Fact label="Zpráva o provedení">{job.workReport && <span style={{ whiteSpace: 'pre-wrap' }}>{job.workReport}</span>}</Fact>
            <Fact label="Odpracované hodiny">{job.hours !== undefined ? String(job.hours).replace('.', ',') : ''}</Fact>
            <Fact label="Materiál">{job.material}</Fact>
            <Fact label="Fotky">{job.photosUrl && <Link href={job.photosUrl} target="_blank">Otevřít složku s fotkami</Link>}</Fact>
          </div>
        )}
        {(job.checkedAt || job.checkNote) && (
          <div style={{ borderTop: `1px solid ${RES.grayBlue}`, paddingTop: 8, marginTop: 4 }}>
            <div style={{ fontWeight: 600, color: RES.navy, marginBottom: 6 }}>Kontrola</div>
            <Fact label="Zkontroloval">{job.checkedByName ? `${job.checkedByName}${job.checkedAt ? ', ' + formatDateTime(job.checkedAt) : ''}` : ''}</Fact>
            <Fact label="Poznámka">{job.checkNote}</Fact>
          </div>
        )}
        {(job.invoiceNumber || job.invoiceId) && (
          <div style={{ borderTop: `1px solid ${RES.grayBlue}`, paddingTop: 8, marginTop: 4 }}>
            <div style={{ fontWeight: 600, color: RES.navy, marginBottom: 6 }}>Fakturace</div>
            <Fact label="Podklad pro fakturaci zákazníkovi">{invoiceLink}</Fact>
          </div>
        )}
        {job.cancelReason && <Fact label="Důvod zrušení">{job.cancelReason}</Fact>}
      {/* Dialogy a vnořené panely jsou uvnitř panelu: jinak je panel bere jako klik mimo sebe a zavře se i s rozdělanou prací. */}
      {dlg === 'edit' && (
        <JobDialog
          job={job}
          sites={sites}
          devices={devices}
          partners={partners}
          save={(input: ServiceJobInput) => repos.service.saveJob({ ...input, id: job.id }, user)}
          onSaved={done}
          onClose={closeDialog}
        />
      )}
      {(dlg === 'returnToSupplier' || dlg === 'check' || dlg === 'markInvoiced' || dlg === 'close' || dlg === 'cancel') && (
        <CommentDialog
          title={ACTION_LABELS[dlg]}
          subText={dlg === 'check' ? 'Po kontrole se odemkne fakturace servisního listu.' : undefined}
          label={dlg === 'returnToSupplier' ? 'Co má dodavatel opravit nebo doplnit?' : dlg === 'cancel' ? 'Důvod zrušení' : 'Poznámka (nepovinná)'}
          required={dlg === 'returnToSupplier' || dlg === 'cancel'}
          confirm={ACTION_LABELS[dlg]}
          onConfirm={(text) => act(dlg, { comment: text })}
          onSaved={done}
          onClose={closeDialog}
        />
      )}

      {(dlg === 'order' || dlg === 'invoice') && (
        <Dialog
          hidden={false}
          onDismiss={busy ? undefined : closeDialog}
          dialogContentProps={{
            type: DialogType.normal,
            title: dlg === 'order' ? 'Objednávka dodavateli' : 'Podklad pro fakturaci',
            subText:
              dlg === 'order'
                ? 'Vystavte objednávku na servisní projekt souboru a navažte ji na servisní list. Dodavatel musí být vybraný v servisním listu.'
                : 'Založte podklad pro fakturaci zákazníkovi (lokalitě) na servisní projekt souboru a navažte ho na servisní list.'
          }}
          modalProps={{ isBlocking: true }}
          minWidth={600}
        >
          {dlgError && (
            <MessageBar messageBarType={MessageBarType.error} isMultiline>
              {dlgError}
            </MessageBar>
          )}
          <Dropdown
            label={dlg === 'order' ? 'Objednávka' : 'Podklad'}
            selectedKey={pick}
            placeholder={(dlg === 'order' ? orderOptions : invoiceOptions).length === 0 ? 'Zatím žádná k dispozici — nejdřív ji vystavte' : 'Vyberte'}
            options={dlg === 'order' ? orderOptions : invoiceOptions}
            onChange={(_, o) => o && setPick(Number(o.key))}
          />
          <div style={{ marginTop: 8 }}>
            <DefaultButton text={dlg === 'order' ? 'Vystavit novou objednávku…' : 'Založit nový podklad…'} onClick={() => (dlg === 'order' ? setOrderOpen(true) : setInvoiceOpen(true))} />
          </div>
          <DialogFooter>
            <PrimaryButton
              text="Navázat na servisní list"
              disabled={busy || pick === undefined}
              onClick={() => {
                if (dlg === 'order') {
                  const o = orders.filter((x) => x.id === pick)[0];
                  submit('order', { orderId: pick, orderNumber: o ? o.orderNumber : undefined });
                } else {
                  const i = invoices.filter((x) => x.id === pick)[0];
                  submit('invoice', { invoiceId: pick, invoiceNumber: i ? i.number : undefined });
                }
              }}
            />
            <DefaultButton text="Zrušit" disabled={busy} onClick={closeDialog} />
          </DialogFooter>
        </Dialog>
      )}

      {dlg === 'report' && (
        <Dialog hidden={false} onDismiss={busy ? undefined : closeDialog} dialogContentProps={{ type: DialogType.normal, title: 'Provedení servisu', subText: 'Zápis provedení za dodavatele (běžně ho zapisuje dodavatel sám přes externí web).' }} modalProps={{ isBlocking: true }} minWidth={600}>
          {dlgError && (
            <MessageBar messageBarType={MessageBarType.error} isMultiline>
              {dlgError}
            </MessageBar>
          )}
          <label style={{ fontSize: 14 }}>
            <div>Provedeno dne</div>
            <input type="date" value={doneAt} onChange={(e) => setDoneAt(e.target.value)} style={DATE_INPUT} />
          </label>
          <ChoiceGroup
            label="Čím je provedení doloženo"
            selectedKey={proofKind}
            options={[
              { key: 'Popis', text: 'Popis práce (textem)' },
              { key: 'Fotka', text: 'Fotky (odkaz na složku)' },
              { key: 'Vzdálené ověření', text: 'Ověření na dálku (např. dispečer podle dat ve vizualizaci)' }
            ]}
            onChange={(_, o) => o && setProofKind(o.key)}
            styles={{ flexContainer: { display: 'flex', flexDirection: 'column', gap: 4 } }}
          />
          <TextField label="Co se provedlo" required={proofKind === 'Popis'} multiline rows={4} value={reportText} onChange={(_, v) => setReportText(v ?? '')} />
          {proofKind === 'Vzdálené ověření' && <TextField label="Kdo provedení ověřil na dálku" required value={verifiedBy} onChange={(_, v) => setVerifiedBy(v ?? '')} />}
          <div style={{ display: 'flex', gap: 10 }}>
            <TextField label="Odpracované hodiny" value={hours} onChange={(_, v) => setHours(v ?? '')} styles={{ root: { width: 160 } }} />
            <TextField label="Použitý materiál" value={material} onChange={(_, v) => setMaterial(v ?? '')} styles={{ root: { flex: '1 1 auto' } }} />
          </div>
          <TextField label="Fotky (odkaz na složku)" required={proofKind === 'Fotka'} value={photosUrl} onChange={(_, v) => setPhotosUrl(v ?? '')} />
          <DialogFooter>
            <PrimaryButton
              text={busy ? 'Ukládám…' : 'Zapsat provedení'}
              disabled={busy}
              onClick={() => {
                const h = hours.trim() === '' ? undefined : Number(hours.replace(/\s/g, '').replace(',', '.'));
                if (h !== undefined && !isFinite(h)) {
                  setDlgError('Odpracované hodiny nejsou číslo.');
                  return;
                }
                submit('report', { workReport: reportText, hours: h, material, photosUrl: photosUrl.trim() || undefined, doneAt: inputToDate(doneAt), proofKind, verifiedBy });
              }}
            />
            <DefaultButton text="Zrušit" disabled={busy} onClick={closeDialog} />
          </DialogFooter>
        </Dialog>
      )}

      <OrderPanel
        isOpen={orderOpen}
        projectNumber={job.deviceNumber}
        prefill={{ subject: `${job.title} (${job.number})`, supplierName: job.supplierName, currency: 'CZK', lines: [{ description: job.title, quantity: 1, unit: 'kpl', unitPriceNet: 0 }] }}
        onDismiss={() => setOrderOpen(false)}
        onChanged={() => setReload((k) => k + 1)}
      />
      <InvoicePanel isOpen={invoiceOpen} projectNumber={job.deviceNumber} onDismiss={() => setInvoiceOpen(false)} onChanged={() => setReload((k) => k + 1)} />
      </Panel>
    </>
  );
};
