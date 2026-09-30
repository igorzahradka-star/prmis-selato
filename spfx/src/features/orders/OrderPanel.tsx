/**
 * Objednávka v postranním panelu: nová, úprava konceptu, zobrazení a akce schvalování.
 *
 * Co smí člověk udělat, rozhoduje `core/orderWorkflow` (tlačítka se podle něj jen nabízejí);
 * skutečná kontrola oprávnění znovu probíhá v datové vrstvě při zápisu.
 */

import * as React from 'react';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { TextField } from '@fluentui/react/lib/TextField';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { ComboBox, IComboBoxOption } from '@fluentui/react/lib/ComboBox';
import { DatePicker } from '@fluentui/react/lib/DatePicker';
import { PrimaryButton, DefaultButton, IconButton, ActionButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Dialog, DialogType, DialogFooter } from '@fluentui/react/lib/Dialog';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { Link } from '@fluentui/react/lib/Link';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { CS_CALENDAR_STRINGS } from '../../ui/csCalendarStrings';
import { buildHash, RouteName } from '../../ui/router';
import { Currency, Partner, PartnerType, Project } from '../../core/types';
import { formatDate, formatDateTime, formatMoney, parseAmount, parseCzechDate } from '../../core/format';
import {
  APPROVAL_LEVEL_LABELS,
  OrderLine,
  OrderStatus,
  PurchaseOrder,
  amountNetInCzk,
  lineTotalNet,
  orderTotals,
  validateOrderDraft
} from '../../core/orders';
import {
  OrderAction,
  availableActions,
  buildApprovalChain,
  canIssueOrder,
  describeApprovalRoute,
  toActor,
  toWorkflowProject
} from '../../core/orderWorkflow';
import { ApprovalRecord, OrderInput } from '../../data/repositories';
import { OrderStatusBadge } from './OrderStatusBadge';

export interface OrderPanelProps {
  isOpen: boolean;
  /** Existující objednávka; bez ní se zakládá nová. */
  orderId?: number;
  /** U nové objednávky předvybraný projekt (např. z detailu projektu). */
  projectNumber?: string;
  onDismiss: () => void;
  /** Objednávka se změnila — seznam za panelem se má načíst znovu. */
  onChanged: () => void;
}

/** Položka ve formuláři. Čísla se drží jako text, aby šlo psát desetinnou čárku. */
interface LineForm {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
}

const emptyLine = (): LineForm => ({ description: '', quantity: '1', unit: 'ks', unitPrice: '' });

type DialogKind = 'approve' | 'return' | 'reject' | 'cancel';

const DIALOG_TEXT: Record<DialogKind, { title: string; label: string; required: boolean; confirm: string }> = {
  approve: { title: 'Schválit objednávku', label: 'Komentář (nepovinný)', required: false, confirm: 'Schválit' },
  return: { title: 'Vrátit k úpravě', label: 'Co se má změnit?', required: true, confirm: 'Vrátit k úpravě' },
  reject: { title: 'Zamítnout objednávku', label: 'Důvod zamítnutí', required: true, confirm: 'Zamítnout' },
  cancel: { title: 'Stornovat objednávku', label: 'Důvod storna', required: true, confirm: 'Stornovat' }
};

const VAT_OPTIONS: IDropdownOption[] = [
  { key: 21, text: '21 %' },
  { key: 12, text: '12 %' },
  { key: 0, text: '0 % (bez DPH / přenesená povinnost)' }
];
const CURRENCY_OPTIONS: IDropdownOption[] = [
  { key: 'CZK', text: 'CZK' },
  { key: 'EUR', text: 'EUR' }
];

export const OrderPanel: React.FC<OrderPanelProps> = ({ isOpen, orderId, projectNumber, onDismiss, onChanged }) => {
  const { repos, settings, user } = useApp();
  const actor = React.useMemo(() => toActor(user), [user]);

  const [loading, setLoading] = React.useState(false);
  const [order, setOrder] = React.useState<PurchaseOrder | undefined>(undefined);
  const [approvals, setApprovals] = React.useState<ApprovalRecord[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [partners, setPartners] = React.useState<Partner[]>([]);
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [issues, setIssues] = React.useState<string[]>([]);
  const [dialog, setDialog] = React.useState<{ kind: DialogKind; comment: string } | undefined>(undefined);

  const [fProject, setFProject] = React.useState<string | undefined>(undefined);
  const [fSupplierId, setFSupplierId] = React.useState<number | undefined>(undefined);
  const [fSubject, setFSubject] = React.useState('');
  const [fLines, setFLines] = React.useState<LineForm[]>([emptyLine()]);
  const [fVat, setFVat] = React.useState(21);
  const [fCurrency, setFCurrency] = React.useState<Currency>('CZK');
  const [fDelivery, setFDelivery] = React.useState<Date | undefined>(undefined);
  const [fPayment, setFPayment] = React.useState('30');
  const [fNote, setFNote] = React.useState('');

  const fillForm = (o: PurchaseOrder | undefined, preset: string | undefined): void => {
    setFProject(o ? o.projectNumber : preset);
    setFSupplierId(o?.supplierId);
    setFSubject(o ? o.subject : '');
    setFLines(
      o && o.lines.length > 0
        ? o.lines.map((l) => ({
            description: l.description,
            quantity: String(l.quantity).replace('.', ','),
            unit: l.unit ?? '',
            unitPrice: String(l.unitPriceNet).replace('.', ',')
          }))
        : [emptyLine()]
    );
    setFVat(o ? o.vatRate : 21);
    setFCurrency((o?.currency as Currency) || 'CZK');
    setFDelivery(o?.deliveryDate);
    setFPayment(o?.paymentTermDays !== undefined ? String(o.paymentTermDays) : '30');
    setFNote(o?.note ?? '');
  };

  // Načtení dat při otevření panelu.
  React.useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    let cancelled = false;
    setError(undefined);
    setIssues([]);
    setDialog(undefined);
    setBusy(false);
    setLoading(true);
    setOrder(undefined);
    setApprovals([]);

    Promise.all([
      repos.projects.list({ includeOverhead: true }),
      repos.partners.list({}),
      orderId !== undefined ? repos.orders.getById(orderId) : Promise.resolve(undefined)
    ])
      .then(([projectList, partnerList, loaded]) => {
        if (cancelled) {
          return;
        }
        setProjects(projectList);
        setPartners(partnerList);
        setOrder(loaded);
        fillForm(loaded, projectNumber);
        setEditing(orderId === undefined);
        setLoading(false);
        if (orderId !== undefined && !loaded) {
          setError('Objednávka nebyla nalezena. Nejspíš ji někdo smazal, nebo k ní nemáte oprávnění.');
        }
        if (loaded) {
          repos.orders
            .listApprovals(loaded.id)
            .then((a) => !cancelled && setApprovals(a))
            .catch(() => undefined);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setLoading(false);
          setError(e.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, orderId, projectNumber, repos]);

  const workflowProject = React.useMemo(() => {
    const p = projects.filter((x) => x.projectNumber === (order ? order.projectNumber : fProject))[0];
    return p ? toWorkflowProject(p) : undefined;
  }, [projects, order, fProject]);

  const issuableProjects = React.useMemo(
    () => projects.filter((p) => canIssueOrder(toWorkflowProject(p), actor)),
    [projects, actor]
  );
  const projectOptions: IDropdownOption[] = (order ? projects : issuableProjects)
    .slice()
    .sort((a, b) => a.projectNumber.localeCompare(b.projectNumber, 'cs-CZ', { numeric: true }))
    .map((p) => ({ key: p.projectNumber, text: `${p.projectNumber} · ${p.shortName || p.title}` }));

  const suppliers = partners.filter((p) => p.partnerType !== PartnerType.Zakaznik);
  const supplierOptions: IComboBoxOption[] = suppliers.map((p) => ({ key: p.id, text: p.name }));

  const buildLines = (): OrderLine[] =>
    fLines
      .filter((l) => l.description.trim() !== '' || l.unitPrice.trim() !== '')
      .map((l) => ({
        description: l.description,
        quantity: parseAmount(l.quantity) ?? 0,
        unit: l.unit.trim() || undefined,
        unitPriceNet: parseAmount(l.unitPrice) ?? 0
      }));

  const buildInput = (): OrderInput => ({
    projectNumber: fProject ?? '',
    supplierId: fSupplierId,
    supplierName: suppliers.filter((s) => s.id === fSupplierId)[0]?.name,
    subject: fSubject,
    lines: buildLines(),
    vatRate: fVat,
    currency: fCurrency,
    deliveryDate: fDelivery,
    paymentTermDays: parseAmount(fPayment),
    note: fNote.trim() || undefined
  });

  const afterChange = (saved: PurchaseOrder): void => {
    setOrder(saved);
    setBusy(false);
    onChanged();
    repos.orders
      .listApprovals(saved.id)
      .then(setApprovals)
      .catch(() => undefined);
  };

  const save = async (thenSubmit: boolean): Promise<void> => {
    const input = buildInput();
    const found = validateOrderDraft(input, thenSubmit);
    if (found.length > 0) {
      setIssues(found.map((i) => i.message));
      return;
    }
    setIssues([]);
    setError(undefined);
    setBusy(true);
    try {
      let saved = order ? await repos.orders.update(order.id, input, user) : await repos.orders.create(input, user);
      // Hned po uložení si objednávku pamatujeme — kdyby selhalo odeslání, další pokus koncept upraví, nezaloží druhý.
      setOrder(saved);
      onChanged();
      if (thenSubmit) {
        saved = await repos.orders.submit(saved.id, user);
      }
      afterChange(saved);
      setEditing(false);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const run = (action: () => Promise<PurchaseOrder>): void => {
    setError(undefined);
    setBusy(true);
    action()
      .then((o) => afterChange(o))
      .catch((e: Error) => {
        setBusy(false);
        setError(e.message);
      });
  };

  const confirmDialog = (): void => {
    if (!dialog || !order) {
      return;
    }
    const { kind, comment } = dialog;
    setDialog(undefined);
    if (kind === 'cancel') {
      run(() => repos.orders.cancel(order.id, comment, user));
    } else {
      run(() => repos.orders.decide(order.id, kind, comment, user));
    }
  };

  // Náhled cesty schvalování ve formuláři — ať vystavitel ví, co ho čeká, ještě než objednávku odešle.
  const input = buildInput();
  const totals = orderTotals(input.lines, fVat);
  const formProject = projects.filter((p) => p.projectNumber === fProject)[0];
  const route = formProject
    ? buildApprovalChain({
        amountNetCzk: amountNetInCzk(totals.net, fCurrency, settings.approvals.eurRateForLimits),
        issuerLogin: order ? order.requestedByLogin : user.loginName,
        projectManagerLogin: formProject.projectManagerLogin,
        isOverhead: formProject.isOverhead,
        settings: settings.approvals
      })
    : undefined;

  const actions: OrderAction[] = order && workflowProject ? availableActions(order, workflowProject, actor) : [];

  const headerText = order ? `Objednávka ${order.orderNumber}` : 'Nová objednávka';

  const footer = (): JSX.Element | null => {
    if (loading) {
      return null;
    }
    if (editing) {
      return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <DefaultButton text={busy ? 'Ukládám…' : 'Uložit koncept'} disabled={busy} onClick={() => save(false).catch(() => undefined)} />
          <PrimaryButton
            text="Uložit a odeslat ke schválení"
            disabled={busy}
            onClick={() => save(true).catch(() => undefined)}
          />
          {order && (
            <DefaultButton
              text="Zrušit úpravy"
              disabled={busy}
              onClick={() => {
                fillForm(order, undefined);
                setIssues([]);
                setError(undefined);
                setEditing(false);
              }}
            />
          )}
        </div>
      );
    }
    if (!order) {
      return null;
    }
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {actions.indexOf('edit') !== -1 && (
          <DefaultButton iconProps={{ iconName: 'Edit' }} text="Upravit" disabled={busy} onClick={() => setEditing(true)} />
        )}
        {actions.indexOf('submit') !== -1 && (
          <PrimaryButton text="Odeslat ke schválení" disabled={busy} onClick={() => run(() => repos.orders.submit(order.id, user))} />
        )}
        {actions.indexOf('approve') !== -1 && (
          <PrimaryButton text="Schválit" disabled={busy} onClick={() => setDialog({ kind: 'approve', comment: '' })} />
        )}
        {actions.indexOf('return') !== -1 && (
          <DefaultButton text="Vrátit k úpravě" disabled={busy} onClick={() => setDialog({ kind: 'return', comment: '' })} />
        )}
        {actions.indexOf('reject') !== -1 && (
          <DefaultButton text="Zamítnout" disabled={busy} onClick={() => setDialog({ kind: 'reject', comment: '' })} />
        )}
        {actions.indexOf('send') !== -1 && (
          <PrimaryButton text="Odesláno dodavateli" disabled={busy} onClick={() => run(() => repos.orders.send(order.id, user))} />
        )}
        {actions.indexOf('deliver') !== -1 && (
          <PrimaryButton text="Označit jako dodané" disabled={busy} onClick={() => run(() => repos.orders.deliver(order.id, user))} />
        )}
        {actions.indexOf('close') !== -1 && (
          <PrimaryButton text="Uzavřít" disabled={busy} onClick={() => run(() => repos.orders.close(order.id, user))} />
        )}
        {actions.indexOf('cancel') !== -1 && (
          <DefaultButton text="Stornovat" disabled={busy} onClick={() => setDialog({ kind: 'cancel', comment: '' })} />
        )}
      </div>
    );
  };

  const setLine = (index: number, patch: Partial<LineForm>): void =>
    setFLines((cur) => cur.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  return (
    <>
      <Panel
        isOpen={isOpen}
        onDismiss={onDismiss}
        type={PanelType.large}
        headerText={headerText}
        closeButtonAriaLabel="Zavřít"
        isFooterAtBottom
        onRenderFooterContent={footer}
      >
        {loading && <Spinner size={SpinnerSize.large} label="Načítám…" />}

        {error && (
          <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>
            {error}
          </MessageBar>
        )}

        {!loading && editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
            {issues.length > 0 && (
              <MessageBar messageBarType={MessageBarType.warning} isMultiline>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {issues.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </MessageBar>
            )}

            {order && order.status === OrderStatus.VracenoKUprave && (
              <MessageBar messageBarType={MessageBarType.severeWarning} isMultiline>
                Objednávka byla vrácena k úpravě. {lastComment(approvals)}
              </MessageBar>
            )}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Dropdown
                label="Projekt"
                required
                disabled={!!order}
                options={projectOptions}
                selectedKey={fProject ?? null}
                onChange={(_, o) => o && setFProject(String(o.key))}
                placeholder="Vyberte projekt"
                styles={{ root: { flex: '1 1 280px' } }}
              />
              <ComboBox
                label="Dodavatel"
                required
                allowFreeform={false}
                autoComplete="on"
                options={supplierOptions}
                selectedKey={fSupplierId ?? null}
                onChange={(_, o) => {
                  if (o) {
                    const id = o.key as number;
                    setFSupplierId(id);
                    const partner = suppliers.filter((s) => s.id === id)[0];
                    if (partner && partner.paymentTermDays !== undefined) {
                      setFPayment(String(partner.paymentTermDays));
                    }
                  }
                }}
                placeholder="Vyberte dodavatele z partnerů"
                styles={{ root: { flex: '1 1 280px' } }}
              />
            </div>
            {suppliers.length === 0 && (
              <div style={{ fontSize: 12, color: RES.gray }}>
                V Partnerech zatím není žádný dodavatel. Založte ho v části Partneři (typ Dodavatel) a vraťte se.
              </div>
            )}

            <TextField label="Předmět objednávky" required value={fSubject} onChange={(_, v) => setFSubject(v ?? '')} />

            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Položky</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {fLines.map((l, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <TextField
                      placeholder="Popis položky"
                      ariaLabel={`Popis položky ${i + 1}`}
                      value={l.description}
                      onChange={(_, v) => setLine(i, { description: v ?? '' })}
                      styles={{ root: { flex: '1 1 220px' } }}
                    />
                    <TextField
                      placeholder="Množství"
                      ariaLabel={`Množství položky ${i + 1}`}
                      value={l.quantity}
                      onChange={(_, v) => setLine(i, { quantity: v ?? '' })}
                      styles={{ root: { width: 80 } }}
                    />
                    <TextField
                      placeholder="Jedn."
                      ariaLabel={`Jednotka položky ${i + 1}`}
                      value={l.unit}
                      onChange={(_, v) => setLine(i, { unit: v ?? '' })}
                      styles={{ root: { width: 64 } }}
                    />
                    <TextField
                      placeholder="Cena za jednotku bez DPH"
                      ariaLabel={`Cena položky ${i + 1}`}
                      value={l.unitPrice}
                      onChange={(_, v) => setLine(i, { unitPrice: v ?? '' })}
                      styles={{ root: { width: 150 } }}
                    />
                    <div style={{ width: 110, textAlign: 'right', paddingTop: 6, fontSize: 13 }}>
                      {formatMoney(
                        lineTotalNet({
                          description: l.description,
                          quantity: parseAmount(l.quantity) ?? 0,
                          unitPriceNet: parseAmount(l.unitPrice) ?? 0
                        }),
                        fCurrency
                      )}
                    </div>
                    <IconButton
                      iconProps={{ iconName: 'Delete' }}
                      ariaLabel={`Odebrat položku ${i + 1}`}
                      disabled={fLines.length === 1}
                      onClick={() => setFLines((cur) => cur.filter((_, idx) => idx !== i))}
                    />
                  </div>
                ))}
              </div>
              <ActionButton
                iconProps={{ iconName: 'Add' }}
                text="Přidat položku"
                onClick={() => setFLines((cur) => [...cur, emptyLine()])}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Dropdown
                label="Sazba DPH"
                options={VAT_OPTIONS}
                selectedKey={fVat}
                onChange={(_, o) => o && setFVat(Number(o.key))}
                styles={{ root: { flex: '1 1 200px' } }}
              />
              <Dropdown
                label="Měna"
                options={CURRENCY_OPTIONS}
                selectedKey={fCurrency}
                onChange={(_, o) => o && setFCurrency(String(o.key) as Currency)}
                styles={{ root: { width: 100 } }}
              />
              <DatePicker
                label="Termín dodání"
                value={fDelivery}
                onSelectDate={(d) => setFDelivery(d ?? undefined)}
                formatDate={(d) => (d ? formatDate(d) : '')}
                strings={CS_CALENDAR_STRINGS}
                parseDateFromString={(t) => parseCzechDate(t) ?? null}
                allowTextInput
                styles={{ root: { flex: '1 1 180px' } }}
              />
              <TextField
                label="Splatnost (dnů)"
                value={fPayment}
                onChange={(_, v) => setFPayment(v ?? '')}
                styles={{ root: { width: 120 } }}
              />
            </div>

            <TextField label="Poznámka" multiline rows={2} value={fNote} onChange={(_, v) => setFNote(v ?? '')} />

            <TotalsBox net={totals.net} vat={totals.vat} gross={totals.gross} currency={fCurrency} vatRate={fVat} />

            {route && (
              <MessageBar
                messageBarType={route.outsideApp ? MessageBarType.warning : MessageBarType.info}
                isMultiline
              >
                {route.outsideApp ? (
                  <>
                    Částka překračuje limit jednatele ({formatMoney(settings.approvals.jednatelLimit)}). Takovou objednávku
                    nejde v aplikaci schválit — schvaluje se mimo aplikaci.
                  </>
                ) : (
                  <>
                    <strong>Schvaluje:</strong> {describeApprovalRoute(route.steps)}.
                  </>
                )}
              </MessageBar>
            )}
          </div>
        )}

        {!loading && !editing && order && (
          <OrderDetail order={order} approvals={approvals} />
        )}
      </Panel>

      {dialog && (
        <Dialog
          hidden={false}
          onDismiss={() => setDialog(undefined)}
          dialogContentProps={{ type: DialogType.normal, title: DIALOG_TEXT[dialog.kind].title }}
          modalProps={{ isBlocking: true }}
        >
          <TextField
            label={DIALOG_TEXT[dialog.kind].label}
            multiline
            rows={3}
            value={dialog.comment}
            onChange={(_, v) => setDialog({ ...dialog, comment: v ?? '' })}
            autoFocus
          />
          <DialogFooter>
            <PrimaryButton
              text={DIALOG_TEXT[dialog.kind].confirm}
              disabled={DIALOG_TEXT[dialog.kind].required && dialog.comment.trim() === ''}
              onClick={confirmDialog}
            />
            <DefaultButton text="Zpět" onClick={() => setDialog(undefined)} />
          </DialogFooter>
        </Dialog>
      )}
    </>
  );
};

/** Poslední komentář schvalovatele — ukáže se nad vrácenou objednávkou, aby bylo hned vidět, co má opravit. */
function lastComment(approvals: ApprovalRecord[]): string {
  const last = approvals.filter((a) => a.comment).slice(-1)[0];
  return last ? `${last.approverName}: „${last.comment}“` : '';
}

const TotalsBox: React.FC<{ net: number; vat: number; gross: number; currency: string; vatRate: number }> = ({
  net,
  vat,
  gross,
  currency,
  vatRate
}) => (
  <div
    style={{
      alignSelf: 'flex-end',
      minWidth: 280,
      padding: '8px 14px',
      border: `1px solid ${RES.grayBlue}`,
      borderRadius: 4,
      background: RES.white,
      fontSize: 13
    }}
  >
    <Row label="Celkem bez DPH" value={formatMoney(net, currency)} />
    <Row label={`DPH ${vatRate} %`} value={formatMoney(vat, currency)} />
    <Row label="Celkem s DPH" value={formatMoney(gross, currency)} bold />
  </div>
);

const Row: React.FC<{ label: string; value: React.ReactNode; bold?: boolean }> = ({ label, value, bold }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '2px 0', fontWeight: bold ? 600 : 400 }}>
    <span style={{ color: bold ? RES.text : RES.gray }}>{label}</span>
    <span>{value}</span>
  </div>
);

/** Zobrazení objednávky jen ke čtení: údaje, položky, součty, cesta schvalování a historie. */
const OrderDetail: React.FC<{ order: PurchaseOrder; approvals: ApprovalRecord[] }> = ({ order, approvals }) => {
  const totals = orderTotals(order.lines, order.vatRate);
  const currentIndex = order.approvalChain.findIndex((s) => !s.approved);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <OrderStatusBadge status={order.status} />
        {order.status === OrderStatus.KeSchvaleni && order.currentApprovalLevel && (
          <span style={{ fontSize: 13, color: RES.gray }}>
            čeká na: <strong style={{ color: RES.text }}>{APPROVAL_LEVEL_LABELS[order.currentApprovalLevel]}</strong>
          </span>
        )}
      </div>

      {order.status === OrderStatus.Storno && order.cancelReason && (
        <MessageBar messageBarType={MessageBarType.blocked} isMultiline>
          <strong>Stornováno.</strong> {order.cancelReason}
        </MessageBar>
      )}

      <Section title="Údaje">
        <Row
          label="Projekt"
          value={<Link href={buildHash(RouteName.ProjectDetail, order.projectNumber)}>{order.projectNumber}</Link>}
        />
        <Row label="Dodavatel" value={order.supplierName || '—'} />
        <Row label="Předmět" value={order.subject || '—'} />
        <Row label="Termín dodání" value={order.deliveryDate ? formatDate(order.deliveryDate) : '—'} />
        <Row label="Splatnost" value={order.paymentTermDays !== undefined ? `${order.paymentTermDays} dnů` : '—'} />
        <Row label="Vystavil" value={order.requestedByName || '—'} />
        {order.sentDate && <Row label="Odesláno dodavateli" value={formatDate(order.sentDate)} />}
        {order.note && <Row label="Poznámka" value={order.note} />}
      </Section>

      <Section title="Položky">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: RES.gray }}>
              <th style={{ padding: '4px 6px' }}>Popis</th>
              <th style={{ padding: '4px 6px', textAlign: 'right' }}>Množství</th>
              <th style={{ padding: '4px 6px', textAlign: 'right' }}>Cena/jedn.</th>
              <th style={{ padding: '4px 6px', textAlign: 'right' }}>Celkem</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${RES.background}` }}>
                <td style={{ padding: '4px 6px' }}>{l.description}</td>
                <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                  {l.quantity} {l.unit || ''}
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'right' }}>{formatMoney(l.unitPriceNet, order.currency)}</td>
                <td style={{ padding: '4px 6px', textAlign: 'right' }}>{formatMoney(lineTotalNet(l), order.currency)}</td>
              </tr>
            ))}
            {order.lines.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 8, color: RES.gray }}>
                  Objednávka zatím nemá žádné položky.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <TotalsBox net={totals.net} vat={totals.vat} gross={totals.gross} currency={order.currency} vatRate={order.vatRate} />
      </Section>

      {order.approvalChain.length > 0 && (
        <Section title="Schvalování">
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.7 }}>
            {order.approvalChain.map((s, i) => (
              <li key={i} style={{ fontWeight: i === currentIndex && order.status === OrderStatus.KeSchvaleni ? 600 : 400 }}>
                {s.approved ? '✓ ' : i === currentIndex && order.status === OrderStatus.KeSchvaleni ? '⏳ ' : '○ '}
                {APPROVAL_LEVEL_LABELS[s.level]}
                {s.approved && s.auto && ' — schváleno automaticky (vystavitel je projektový manažer)'}
                {s.approved && !s.auto && s.byName && ` — ${s.byName}${s.at ? `, ${formatDateTime(s.at)}` : ''}`}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {approvals.length > 0 && (
        <Section title="Historie rozhodnutí">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            {approvals.map((a, i) => (
              <div key={i}>
                <strong>{a.decision}</strong> — {a.approverName}
                {a.decidedAt ? `, ${formatDateTime(a.decidedAt)}` : ''}
                {a.comment && <div style={{ color: RES.gray }}>„{a.comment}“</div>}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section
    style={{
      background: RES.white,
      border: `1px solid ${RES.grayBlue}`,
      borderRadius: 4,
      padding: '10px 14px'
    }}
  >
    <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: RES.navy }}>{title}</h3>
    {children}
  </section>
);
