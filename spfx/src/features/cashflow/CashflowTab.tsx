/**
 * Záložka Cashflow v detailu projektu: plán výdajů (platby nákladů podle vzoru Excelu „Průběh plateb“), plán příjmů
 * (fakturační milníky), graf a tabulka po týdnech nebo měsících, plán proti skutečnosti, kumulace.
 *
 * Platby a milníky jsou součástí rozpočtu projektu (jeden dokument) — ukládají se jeho tlačítkem Uložit. Měnu přehledu
 * přepíná společný přepínač CZK/EUR/USD (kurz ČNB); zobrazit jde bez DPH i s DPH.
 */

import * as React from 'react';
import { ActionButton, DefaultButton, IconButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { TextField } from '@fluentui/react/lib/TextField';
import { Toggle } from '@fluentui/react/lib/Toggle';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { CurrencySwitch } from '../../ui/components/CurrencySwitch';
import { useReportCurrency } from '../../ui/useReportCurrency';
import { Project } from '../../core/types';
import { formatMoney, parseAmount } from '../../core/format';
import { toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { CURRENCY_CODES, CurrencyCode, convertAmount } from '../../core/currency';
import {
  BudgetDoc,
  BudgetRecord,
  IncomeMilestone,
  PlannedPayment,
  VAT_REGIMES,
  VAT_REGIME_KEYS,
  VatRegime,
  budgetTotals,
  canEditBudget,
  newBudgetId,
  newMilestone,
  newPayment,
  validateBudget
} from '../../core/budget';
import { CfBucket, Granularity, InvoiceLike, buildCashflow, dayText, parsePercents, splitPayments } from '../../core/cashflow';
import { InvoiceStatus } from '../../core/invoiceBases';
import { CELL_INPUT, NumInput } from '../budget/NumInput';
import { CashflowChart } from './CashflowChart';
import { useAutosave, whenFlushed } from '../budget/useAutosave';
import { useFormDraft } from '../../ui/useFormDraft';
import { DraftBanner } from '../../ui/components/DraftBanner';
import { draftKey } from '../../core/drafts';
import { StickyHScroll } from '../../ui/components/StickyHScroll';

const Tile: React.FC<{ label: string; value: string; hint?: string; warn?: boolean }> = ({ label, value, hint, warn }) => (
  <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderLeft: `4px solid ${warn ? RES.red : RES.green}`, borderRadius: 4, padding: '8px 12px', minWidth: 150, flex: '1 1 150px' }}>
    <div style={{ fontSize: 12, color: RES.gray }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 600, color: RES.navy }}>{value}</div>
    {hint && <div style={{ fontSize: 11, color: warn ? RES.red : RES.gray }}>{hint}</div>}
  </div>
);

const TH: React.CSSProperties = { textAlign: 'left', fontWeight: 600, fontSize: 12, color: RES.gray, padding: '5px 4px', whiteSpace: 'nowrap' };
const TD: React.CSSProperties = { padding: '2px 3px', verticalAlign: 'middle' };
const DATE: React.CSSProperties = { ...CELL_INPUT, padding: '0 4px' };

interface SplitState {
  itemId?: string;
  total: string;
  percents: string;
  first: string;
  interval: string;
  dueDays: string;
  vat: VatRegime;
  currency: CurrencyCode;
  description: string;
}

export const CashflowTab: React.FC<{ project: Project }> = ({ project }) => {
  const { repos, user } = useApp();
  const report = useReportCurrency();
  const actor = React.useMemo(() => toActor(user), [user]);
  const wf = React.useMemo(() => toWorkflowProject(project), [project]);

  const [loaded, setLoaded] = React.useState(false);
  const [record, setRecord] = React.useState<BudgetRecord | undefined>(undefined);
  const [doc, setDoc] = React.useState<BudgetDoc | undefined>(undefined);
  const [saved, setSaved] = React.useState('');
  const [etag, setEtag] = React.useState<string | undefined>(undefined);
  const [invoices, setInvoices] = React.useState<InvoiceLike[]>([]);
  const [granularity, setGranularity] = React.useState<Granularity>('mesic');
  const [withVat, setWithVat] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [notice, setNotice] = React.useState<string | undefined>(undefined);
  const [split, setSplit] = React.useState<SplitState | undefined>(undefined);
  const [issues, setIssues] = React.useState<string[]>([]);

  const editable = canEditBudget(wf, actor);
  const dirty = !!doc && JSON.stringify(doc) !== saved;
  const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

  const reload = React.useCallback(async (): Promise<void> => {
    await whenFlushed(project.projectNumber);
    const [b, inv] = await Promise.all([repos.budgets.get(project.projectNumber), repos.invoices.list({ projectNumber: project.projectNumber }).catch(() => [])]);
    setLoaded(true);
    setInvoices(inv.map((i) => ({ number: i.number, status: i.status, amountNet: i.amountNet, vatRate: i.vatRate, currency: i.currency, dueDate: i.dueDate, paidDate: i.paidDate })));
    if (!b) {
      setRecord(undefined);
      setDoc(undefined);
      return;
    }
    setRecord(b.record);
    setDoc(b.doc);
    setSaved(JSON.stringify(b.doc));
    setEtag(b.etag);
  }, [repos, project.projectNumber]);

  React.useEffect(() => {
    let cancelled = false;
    reload().catch((e: unknown) => {
      if (!cancelled) {
        setLoaded(true);
        setError(why(e));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const run = (job: () => Promise<void>): void => {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    job()
      .catch((e: unknown) => setError(why(e)))
      .then(() => setBusy(false))
      .catch(() => setBusy(false));
  };

  // Průběžné ukládání jako v rozpočtu: plán plateb se po pauze sám uloží; při odchodu z této záložky se uloží hned.
  const busyRef = React.useRef(false);
  busyRef.current = busy;
  const etagRef = React.useRef<string | undefined>(undefined);
  etagRef.current = etag;
  const [autoError, setAutoError] = React.useState<string | undefined>(undefined);
  const autosave = useAutosave<BudgetDoc>({
    projectNumber: project.projectNumber,
    enabled: !!record && editable && loaded,
    dirty,
    value: doc,
    busy: () => busyRef.current,
    persist: async (d) => {
      if (!record) {
        return undefined;
      }
      const found = validateBudget(d, false);
      if (found.length > 0) {
        throw new Error(found[0].message);
      }
      const t = budgetTotals(d, 'CZK', report.rates);
      await repos.budgets.save(record.id, d, { totalCost: t.cost, totalSale: t.sale }, user, etagRef.current, { auto: true });
      const fresh = await repos.budgets.get(project.projectNumber);
      return fresh ? fresh.etag : undefined;
    },
    onSaved: (d, e) => {
      setSaved(JSON.stringify(d));
      setEtag(e);
      setAutoError(undefined);
    },
    onError: (m) => setAutoError(m)
  });
  const draft = useFormDraft<BudgetDoc | null>({
    key: record && editable ? draftKey(user.loginName, 'budget', project.projectNumber) : undefined,
    value: doc ?? null,
    active: !!record && editable && !!doc,
    onRestore: (d) => {
      if (d) {
        setDoc(d);
      }
    }
  });

  const save = (): void => {
    if (!record || !doc) {
      return;
    }
    const found = validateBudget(doc, false);
    if (found.length > 0) {
      setIssues(found.map((i) => i.message));
      return;
    }
    setIssues([]);
    run(async () => {
      const t = budgetTotals(doc, 'CZK', report.rates);
      await repos.budgets.save(record.id, doc, { totalCost: t.cost, totalSale: t.sale }, user, etag);
      await reload();
      setNotice('Plán plateb a milníků je uložený.');
    });
  };

  if (project.isOverhead) {
    return <MessageBar messageBarType={MessageBarType.info}>Na projekt Režie se cashflow projektu nevede.</MessageBar>;
  }
  if (!loaded && !error) {
    return <Spinner size={SpinnerSize.medium} label="Načítám cashflow…" />;
  }
  if (loaded && !doc) {
    return (
      <div style={{ marginTop: 16 }}>
        {error && (
          <MessageBar messageBarType={MessageBarType.error} isMultiline>
            {error}
          </MessageBar>
        )}
        <MessageBar messageBarType={MessageBarType.info} isMultiline>
          Cashflow se plánuje z realizačního rozpočtu. Projekt zatím rozpočet nemá — založte ho v záložce Realizační rozpočet.
        </MessageBar>
      </div>
    );
  }
  if (!doc) {
    return null;
  }

  const today = new Date();
  const cf = buildCashflow({ doc, invoices, rates: report.rates, currency: report.currency, granularity, withVat });
  const payments = doc.payments ?? [];
  const income = doc.income ?? [];
  const items = doc.items.filter((i) => i.description.trim() !== '');
  const setPayments = (next: PlannedPayment[]): void => setDoc({ ...doc, payments: next });
  const setIncome = (next: IncomeMilestone[]): void => setDoc({ ...doc, income: next });
  const upPayment = (id: string, patch: Partial<PlannedPayment>): void => setPayments(payments.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const upMilestone = (id: string, patch: Partial<IncomeMilestone>): void => setIncome(income.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const peak = cf.buckets.reduce((m, b) => Math.min(m, b.cumPlan), 0);
  const last = cf.buckets[cf.buckets.length - 1];

  const openSplit = (itemId?: string): void => {
    const it = doc.items.filter((i) => i.id === itemId)[0];
    const c = cf.coverage.filter((x) => x.itemId === itemId)[0];
    setSplit({
      itemId,
      description: it ? it.description : '',
      currency: it ? it.currency : 'CZK',
      total: String(c ? Math.round(convertAmount(c.unplanned, report.currency, it ? it.currency : 'CZK', report.rates) * 100) / 100 : it ? it.unitCost * it.quantity : 0).replace('.', ','),
      percents: '30/40/30',
      first: dayText(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30)),
      interval: '30',
      dueDays: '30',
      vat: it && it.currency !== 'CZK' ? 'reverse' : 'dph21'
    });
  };

  const applySplit = (): void => {
    if (!split) {
      return;
    }
    const total = parseAmount(split.total);
    const percents = parsePercents(split.percents);
    const first = new Date(split.first);
    if (total === undefined || total <= 0 || percents.length === 0 || isNaN(first.getTime())) {
      setError('Rozložení nejde vytvořit: zadejte částku, podíly (např. 30/40/30) a datum první faktury.');
      return;
    }
    const created = splitPayments({
      total,
      percents,
      firstInvoice: new Date(first.getFullYear(), first.getMonth(), first.getDate()),
      intervalDays: Math.max(0, Number(split.interval) || 0),
      dueDays: Math.max(0, Number(split.dueDays) || 0),
      description: split.description || 'Platba',
      itemId: split.itemId,
      currency: split.currency,
      vat: split.vat,
      newId: () => newBudgetId('p')
    });
    setPayments([...payments, ...created]);
    setSplit(undefined);
    setNotice(`Přidáno ${created.length} plateb. Nezapomeňte plán uložit.`);
  };

  const cell = (b: CfBucket, v: number, bold?: boolean, negRed?: boolean): JSX.Element => (
    <td key={b.key} style={{ padding: '3px 8px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: bold ? 600 : 400, color: negRed && v < 0 ? RES.red : RES.text, background: today.getTime() >= b.from.getTime() && today.getTime() <= b.to.getTime() + 86399999 ? RES.bluePale : undefined }}>
      {v === 0 ? '—' : formatMoney(v, report.currency)}
    </td>
  );
  const row = (label: string, pick: (b: CfBucket) => number, bold?: boolean, negRed?: boolean): JSX.Element => (
    <tr style={{ borderTop: `1px solid ${RES.background}` }}>
      <td style={{ padding: '3px 8px', position: 'sticky', left: 0, background: RES.white, fontWeight: bold ? 600 : 400, whiteSpace: 'nowrap', zIndex: 1 }}>{label}</td>
      {cf.buckets.map((b) => cell(b, pick(b), bold, negRed))}
    </tr>
  );

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <DefaultButton text="Měsíčně" checked={granularity === 'mesic'} onClick={() => setGranularity('mesic')} styles={{ root: { minWidth: 0, padding: '0 12px' } }} />
        <DefaultButton text="Týdně" checked={granularity === 'tyden'} onClick={() => setGranularity('tyden')} styles={{ root: { minWidth: 0, padding: '0 12px' } }} />
        <Toggle label="Částky" inlineLabel onText="s DPH" offText="bez DPH" checked={withVat} onChange={(_, c) => setWithVat(!!c)} styles={{ root: { margin: 0 } }} />
        <span style={{ flex: '1 1 auto' }} />
        <CurrencySwitch />
      </div>

      {draft.pending && <DraftBanner savedAt={draft.pending.savedAt} what="plán plateb" onRestore={draft.restore} onDiscard={draft.discard} />}
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>
          {error}
        </MessageBar>
      )}
      {notice && (
        <MessageBar messageBarType={MessageBarType.success} isMultiline onDismiss={() => setNotice(undefined)}>
          {notice}
        </MessageBar>
      )}
      {cf.warnings.map((w) => (
        <MessageBar key={w} messageBarType={MessageBarType.warning} isMultiline>
          {w}
        </MessageBar>
      ))}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '10px 0' }}>
        <Tile label={`Příjmy – plán (${report.label})`} value={formatMoney(cf.totals.incomePlan, report.currency)} hint={`skutečně přijato ${formatMoney(cf.totals.incomeActual, report.currency)}`} />
        <Tile label={`Výdaje – plán (${report.label})`} value={formatMoney(cf.totals.expensePlan, report.currency)} hint={`skutečně zaplaceno ${formatMoney(cf.totals.expenseActual, report.currency)}`} />
        <Tile label="Saldo plánu" value={formatMoney(cf.totals.incomePlan - cf.totals.expensePlan, report.currency)} hint={last ? `nejnižší kumulace ${formatMoney(peak, report.currency)}` : undefined} warn={cf.totals.incomePlan - cf.totals.expensePlan < 0} />
        <Tile label="Zbývá naplánovat" value={formatMoney(cf.unplannedTotal, report.currency)} hint={cf.coverage.length > 0 ? `${cf.coverage.length} položek rozpočtu bez plateb` : 'náklady jsou rozplánované'} warn={cf.unplannedTotal > 0} />
      </div>

      <CashflowChart buckets={cf.buckets} currencyLabel={report.label} today={today} />
      {cf.buckets.length === 0 && <MessageBar messageBarType={MessageBarType.info}>Zatím není co zobrazit — doplňte platby nákladů a fakturační milníky s daty.</MessageBar>}

      {cf.buckets.length > 0 && (
        <StickyHScroll maxHeight={360} frameStyle={{ marginTop: 10 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...TH, position: 'sticky', left: 0, top: 0, background: RES.white, zIndex: 3 }}>{granularity === 'mesic' ? 'Měsíc' : 'Týden (od)'}</th>
                {cf.buckets.map((b) => (
                  <th key={b.key} style={{ ...TH, textAlign: 'right', padding: '5px 8px', position: 'sticky', top: 0, background: RES.white, zIndex: 2 }}>
                    {b.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {row('Příjmy – plán', (b) => b.incomePlan)}
              {row('Příjmy – skutečnost', (b) => b.incomeActual)}
              {row('Výdaje – plán', (b) => b.expensePlan)}
              {row('Výdaje – skutečnost', (b) => b.expenseActual)}
              {row('Saldo – plán', (b) => b.netPlan, true, true)}
              {row('Saldo – skutečnost', (b) => b.netActual, true, true)}
              {row('Kumulace – plán', (b) => b.cumPlan, true, true)}
              {row('Kumulace – skutečnost', (b) => b.cumActual, true, true)}
              {row('Náklad v čase (faktury)', (b) => b.accrual)}
            </tbody>
          </table>
        </StickyHScroll>
      )}

      {cf.coverage.length > 0 && (
        <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '8px 12px', marginTop: 12 }}>
          <div style={{ fontWeight: 600, color: RES.navy, marginBottom: 4 }}>Položky rozpočtu bez naplánovaných plateb</div>
          {cf.coverage.map((c) => (
            <div key={c.itemId} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, borderTop: `1px solid ${RES.background}`, padding: '2px 0' }}>
              <span style={{ flex: '1 1 auto' }}>{c.description}</span>
              <span style={{ color: RES.gray }}>naplánováno {formatMoney(c.planned, report.currency)} z {formatMoney(c.forecast, report.currency)}</span>
              <strong>zbývá {formatMoney(c.unplanned, report.currency)}</strong>
              {editable && <ActionButton text="Rozplánovat" iconProps={{ iconName: 'Calendar' }} onClick={() => openSplit(c.itemId)} />}
            </div>
          ))}
        </div>
      )}

      {/* Plán plateb nákladů */}
      <h3 style={{ margin: '18px 0 6px', color: RES.navy, fontSize: 15 }}>Plán plateb nákladů (výdaje)</h3>
      <div style={{ fontSize: 12, color: RES.gray, marginBottom: 6 }}>
        Podle vzoru „Průběh plateb“: částka bez DPH, režim DPH, datum faktury (náklad v čase), splatnost (výdaj — kdy se platí) a datum úhrady (skutečnost).
      </div>
      <StickyHScroll>
        <table style={{ width: '100%', minWidth: 1280, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 'auto' }} />
            <col style={{ width: 170 }} />
            <col style={{ width: 104 }} />
            <col style={{ width: 62 }} />
            <col style={{ width: 156 }} />
            <col style={{ width: 128 }} />
            <col style={{ width: 128 }} />
            <col style={{ width: 128 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 36 }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: `1px solid ${RES.grayBlue}` }}>
              <th style={TH}>Platba</th>
              <th style={TH}>Položka rozpočtu</th>
              <th style={{ ...TH, textAlign: 'right' }}>Bez DPH</th>
              <th style={TH}>Měna</th>
              <th style={TH}>Režim DPH</th>
              <th style={TH}>Faktura</th>
              <th style={TH}>Splatnost</th>
              <th style={TH}>Zaplaceno</th>
              <th style={{ ...TH, textAlign: 'right' }}>Zapl. částka</th>
              <th style={TH} />
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} style={{ borderTop: `1px solid ${RES.background}` }}>
                <td style={TD}>
                  <input aria-label="Popis platby" value={p.description} disabled={!editable} onChange={(e) => upPayment(p.id, { description: e.target.value })} style={CELL_INPUT} />
                </td>
                <td style={TD}>
                  <select aria-label="Položka rozpočtu" value={p.itemId ?? ''} disabled={!editable} onChange={(e) => upPayment(p.id, { itemId: e.target.value || undefined })} style={CELL_INPUT}>
                    <option value="">—</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.description}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={TD}>
                  <NumInput value={p.amount} ariaLabel="Částka bez DPH" disabled={!editable} onCommit={(v) => upPayment(p.id, { amount: Math.max(0, v ?? 0) })} />
                </td>
                <td style={TD}>
                  <select aria-label="Měna platby" value={p.currency} disabled={!editable} onChange={(e) => upPayment(p.id, { currency: e.target.value as CurrencyCode })} style={CELL_INPUT}>
                    {CURRENCY_CODES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={TD}>
                  <select aria-label="Režim DPH" value={p.vat} disabled={!editable} onChange={(e) => upPayment(p.id, { vat: e.target.value as VatRegime })} style={CELL_INPUT}>
                    {VAT_REGIME_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {VAT_REGIMES[k].label}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={TD}>
                  <input type="date" aria-label="Datum faktury" value={p.invoiceDate ?? ''} disabled={!editable} onChange={(e) => upPayment(p.id, { invoiceDate: e.target.value || undefined })} style={DATE} />
                </td>
                <td style={TD}>
                  <input type="date" aria-label="Splatnost" value={p.dueDate ?? ''} disabled={!editable} onChange={(e) => upPayment(p.id, { dueDate: e.target.value || undefined })} style={DATE} />
                </td>
                <td style={TD}>
                  <input type="date" aria-label="Datum úhrady" value={p.paidDate ?? ''} disabled={!editable} onChange={(e) => upPayment(p.id, { paidDate: e.target.value || undefined })} style={{ ...DATE, background: p.paidDate ? '#E4F6EC' : undefined }} />
                </td>
                <td style={TD}>
                  <NumInput value={p.paidAmount} ariaLabel="Skutečně zaplaceno bez DPH" placeholder="jako plán" allowEmpty disabled={!editable || !p.paidDate} onCommit={(v) => upPayment(p.id, { paidAmount: v === undefined ? undefined : Math.max(0, v) })} />
                </td>
                <td style={TD}>{editable && <IconButton iconProps={{ iconName: 'Delete' }} title="Smazat platbu" ariaLabel="Smazat platbu" onClick={() => setPayments(payments.filter((x) => x.id !== p.id))} styles={{ root: { width: 28, height: 28 } }} />}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={10} style={{ padding: 10, fontSize: 13, color: RES.gray }}>
                  Zatím žádná platba. Přidejte ji ručně, nebo „Rozplánovat“ náklady položky rozpočtu do několika plateb.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </StickyHScroll>
      {editable && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <ActionButton iconProps={{ iconName: 'Add' }} text="Přidat platbu" onClick={() => setPayments([...payments, newPayment(undefined, '', report.currency)])} />
          <ActionButton iconProps={{ iconName: 'Calendar' }} text="Rozplánovat položku do plateb…" onClick={() => openSplit(undefined)} />
        </div>
      )}

      {/* Fakturační milníky */}
      <h3 style={{ margin: '18px 0 6px', color: RES.navy, fontSize: 15 }}>Fakturační milníky (příjmy)</h3>
      <div style={{ fontSize: 12, color: RES.gray, marginBottom: 6 }}>
        Plánované datum faktury + splatnost určuje, kdy peníze přijdou. Navážete-li milník na podklad pro fakturaci, splatnost a úhrada se berou z něj.
      </div>
      <StickyHScroll>
        <table style={{ width: '100%', minWidth: 1180, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 'auto' }} />
            <col style={{ width: 128 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 62 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 128 }} />
            <col style={{ width: 36 }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: `1px solid ${RES.grayBlue}` }}>
              <th style={TH}>Milník</th>
              <th style={TH}>Datum faktury</th>
              <th style={{ ...TH, textAlign: 'right' }}>Bez DPH</th>
              <th style={TH}>Měna</th>
              <th style={{ ...TH, textAlign: 'right' }}>DPH %</th>
              <th style={{ ...TH, textAlign: 'right' }}>Splatnost (dny)</th>
              <th style={TH}>Podklad (FP)</th>
              <th style={TH}>Zaplaceno</th>
              <th style={TH} />
            </tr>
          </thead>
          <tbody>
            {income.map((m) => (
              <tr key={m.id} style={{ borderTop: `1px solid ${RES.background}` }}>
                <td style={TD}>
                  <input aria-label="Popis milníku" value={m.description} disabled={!editable} onChange={(e) => upMilestone(m.id, { description: e.target.value })} style={CELL_INPUT} />
                </td>
                <td style={TD}>
                  <input type="date" aria-label="Plánované datum faktury" value={m.plannedDate ?? ''} disabled={!editable} onChange={(e) => upMilestone(m.id, { plannedDate: e.target.value || undefined })} style={DATE} />
                </td>
                <td style={TD}>
                  <NumInput value={m.amount} ariaLabel="Částka milníku bez DPH" disabled={!editable} onCommit={(v) => upMilestone(m.id, { amount: Math.max(0, v ?? 0) })} />
                </td>
                <td style={TD}>
                  <select aria-label="Měna milníku" value={m.currency} disabled={!editable} onChange={(e) => upMilestone(m.id, { currency: e.target.value as CurrencyCode })} style={CELL_INPUT}>
                    {CURRENCY_CODES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={TD}>
                  <NumInput value={m.vatRate} ariaLabel="Sazba DPH" decimals={0} disabled={!editable} onCommit={(v) => upMilestone(m.id, { vatRate: Math.max(0, v ?? 0) })} />
                </td>
                <td style={TD}>
                  <NumInput value={m.dueDays} ariaLabel="Splatnost ve dnech" decimals={0} disabled={!editable} onCommit={(v) => upMilestone(m.id, { dueDays: Math.max(0, v ?? 0) })} />
                </td>
                <td style={TD}>
                  <select aria-label="Podklad pro fakturaci" value={m.invoiceNumber ?? ''} disabled={!editable} onChange={(e) => upMilestone(m.id, { invoiceNumber: e.target.value || undefined })} style={CELL_INPUT}>
                    <option value="">— nenavázáno —</option>
                    {invoices
                      .filter((i) => i.status !== InvoiceStatus.Storno)
                      .map((i) => (
                        <option key={i.number} value={i.number}>
                          {i.number} · {i.status}
                        </option>
                      ))}
                  </select>
                </td>
                <td style={TD}>
                  <input type="date" aria-label="Datum úhrady milníku" value={m.paidDate ?? ''} disabled={!editable} onChange={(e) => upMilestone(m.id, { paidDate: e.target.value || undefined })} style={{ ...DATE, background: m.paidDate ? '#E4F6EC' : undefined }} />
                </td>
                <td style={TD}>{editable && <IconButton iconProps={{ iconName: 'Delete' }} title="Smazat milník" ariaLabel="Smazat milník" onClick={() => setIncome(income.filter((x) => x.id !== m.id))} styles={{ root: { width: 28, height: 28 } }} />}</td>
              </tr>
            ))}
            {income.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 10, fontSize: 13, color: RES.gray }}>
                  Zatím žádný milník. Přidejte plánované faktury zákazníkovi (zálohy, dílčí plnění, předání).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </StickyHScroll>
      {editable && (
        <div style={{ marginTop: 4 }}>
          <ActionButton iconProps={{ iconName: 'Add' }} text="Přidat milník" onClick={() => setIncome([...income, newMilestone(report.currency)])} />
        </div>
      )}

      {/* Uložení — v patě stránky, ať je vidět */}
      {editable && (
        <div style={{ position: 'sticky', bottom: 0, background: RES.background, borderTop: `1px solid ${RES.grayBlue}`, padding: '8px 0', marginTop: 12, zIndex: 5 }}>
          {issues.length > 0 && (
            <MessageBar messageBarType={MessageBarType.warning} isMultiline onDismiss={() => setIssues([])} styles={{ root: { marginBottom: 6 } }}>
              <strong>Nejde uložit — něco chybí:</strong> {issues.join(' ')}
            </MessageBar>
          )}
          <PrimaryButton text={busy ? 'Pracuji…' : dirty ? 'Uložit plán plateb' : 'Uloženo'} disabled={busy || !dirty} onClick={save} />
          <span style={{ marginLeft: 10, fontSize: 12, color: autoError ? RES.red : RES.gray }} aria-live="polite">
            {autoError
              ? `Automatické uložení čeká: ${autoError}`
              : dirty
              ? 'Změny zatím nejsou uložené — uloží se samy za několik sekund.'
              : autosave.savedAt
              ? `Automaticky uloženo v ${autosave.savedAt.getHours()}:${String(autosave.savedAt.getMinutes()).padStart(2, '0')}.`
              : ''}
          </span>
        </div>
      )}

      {split && (
        <Dialog hidden={false} onDismiss={() => setSplit(undefined)} dialogContentProps={{ type: DialogType.normal, title: 'Rozplánovat náklady do plateb', subText: 'Částka se rozdělí podle podílů (např. 30/40/30 nebo 20/30/30/10/10) do faktur v pravidelných odstupech; splatnost = faktura + dny splatnosti.' }} modalProps={{ isBlocking: true }} minWidth={560}>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 14, fontWeight: 600 }} htmlFor="split-item">
              Položka rozpočtu
            </label>
            <select
              id="split-item"
              value={split.itemId ?? ''}
              onChange={(e) => {
                const it = doc.items.filter((i) => i.id === e.target.value)[0];
                setSplit({ ...split, itemId: e.target.value || undefined, description: it ? it.description : split.description, currency: it ? it.currency : split.currency, vat: it && it.currency !== 'CZK' ? 'reverse' : split.vat, total: it ? String(Math.round(it.unitCost * it.quantity * 100) / 100).replace('.', ',') : split.total });
              }}
              style={{ ...CELL_INPUT, height: 32, marginTop: 4 }}
            >
              <option value="">— bez položky —</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.description}
                </option>
              ))}
            </select>
          </div>
          <TextField label="Popis plateb" value={split.description} onChange={(_, v) => setSplit({ ...split, description: v ?? '' })} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <TextField label={`Celková částka bez DPH (${split.currency})`} value={split.total} onChange={(_, v) => setSplit({ ...split, total: v ?? '' })} styles={{ root: { flex: '1 1 200px' } }} />
            <TextField label="Podíly v %" value={split.percents} onChange={(_, v) => setSplit({ ...split, percents: v ?? '' })} styles={{ root: { flex: '1 1 160px' } }} />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 160px' }}>
              <label style={{ fontSize: 14, fontWeight: 600 }} htmlFor="split-first">
                První faktura
              </label>
              <input id="split-first" type="date" value={split.first} onChange={(e) => setSplit({ ...split, first: e.target.value })} style={{ ...CELL_INPUT, height: 32, marginTop: 4 }} />
            </div>
            <TextField label="Odstup faktur (dny)" value={split.interval} onChange={(_, v) => setSplit({ ...split, interval: v ?? '' })} styles={{ root: { flex: '1 1 120px' } }} />
            <TextField label="Splatnost (dny)" value={split.dueDays} onChange={(_, v) => setSplit({ ...split, dueDays: v ?? '' })} styles={{ root: { flex: '1 1 120px' } }} />
          </div>
          <label style={{ fontSize: 14, fontWeight: 600, display: 'block', marginTop: 8 }} htmlFor="split-vat">
            Režim DPH
          </label>
          <select id="split-vat" value={split.vat} onChange={(e) => setSplit({ ...split, vat: e.target.value as VatRegime })} style={{ ...CELL_INPUT, height: 32, marginTop: 4, maxWidth: 280 }}>
            {VAT_REGIME_KEYS.map((k) => (
              <option key={k} value={k}>
                {VAT_REGIMES[k].label}
              </option>
            ))}
          </select>
          <DialogFooter>
            <PrimaryButton text="Vytvořit platby" onClick={applySplit} />
            <DefaultButton text="Zrušit" onClick={() => setSplit(undefined)} />
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
};

