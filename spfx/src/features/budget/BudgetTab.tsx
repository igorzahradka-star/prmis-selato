/**
 * Záložka Realizační rozpočet v detailu projektu. Rozpočet je jeden na projekt a průběžně se upravuje (nezamyká se);
 * schválení vedením uloží do historie záznam (plán nákupu, smluvní cena, marže v % i v Kč, kdo a kdy; první schválení nastaví prognózu na plán a uzamkne plán). Souhrn ukazuje plán, skutečnost
 * (nakoupeno) a zbývá nakoupit — tedy prostavěnost projektu.
 *
 * Co smí člověk udělat, rozhoduje `core/budget`; skutečná kontrola probíhá znovu v datové vrstvě při zápisu.
 */

import * as React from 'react';
import { ActionButton, DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { ApproveButton, ReturnButton } from '../../ui/components/ApprovalButtons';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { TextField } from '@fluentui/react/lib/TextField';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { CurrencySwitch } from '../../ui/components/CurrencySwitch';
import { useReportCurrency } from '../../ui/useReportCurrency';
import { Partner, Project, Role } from '../../core/types';
import { RoleMembership } from '../../core/userAdmin';
import { ApproverDialog } from '../orders/ApproverDialog';
import { formatDate, formatMoney } from '../../core/format';
import { asCurrencyCode } from '../../core/currency';
import { canIssueOrder, toActor, toWorkflowProject } from '../../core/orderWorkflow';
import {
  BudgetAction,
  BudgetDoc,
  BudgetGroup,
  BudgetItem,
  BudgetRecord,
  BudgetStatus,
  GROUP_KIND_LABELS,
  GroupKind,
  addGroup,
  addRate,
  availableBudgetActions,
  budgetTotals,
  calcItems,
  budgetApproverCandidates,
  canApproveBudget,
  emptyBudget,
  isPlanLocked,
  lastApproval,
  removeGroup,
  removeRate,
  updateRate,
  validateBudget
} from '../../core/budget';
import { BudgetHistoryEntry } from '../../data/repositories';
import { OrderPanel } from '../orders/OrderPanel';
import { refreshBudgetCache, computeSemaphore } from './budgetCache';
import { approvedMargin, ensureRevenues } from '../../core/budgetMargin';
import { RevenueTable } from './RevenueTable';
import { PurchaseOrder } from '../../core/orders';
import { BudgetStatus as Semafor } from '../../core/types';
import { BudgetGrid, pct } from './BudgetGrid';
import { useAutosave, whenFlushed } from './useAutosave';
import { useFormDraft } from '../../ui/useFormDraft';
import { DraftBanner } from '../../ui/components/DraftBanner';
import { draftKey } from '../../core/drafts';
import { BudgetImportDialog } from './BudgetImportDialog';
import { NewPartnerDialog } from './NewPartnerDialog';
import { CELL_INPUT, NumInput } from './NumInput';

const STATUS_COLOR: Record<BudgetStatus, { bg: string; fg: string }> = {
  [BudgetStatus.Koncept]: { bg: '#E8EDF2', fg: '#3F4A57' },
  [BudgetStatus.KeSchvaleni]: { bg: '#FFF1CC', fg: '#7A5A00' },
  [BudgetStatus.Schvaleno]: { bg: '#D6F2E1', fg: '#116B3A' }
};

const StatusBadge: React.FC<{ status: BudgetStatus }> = ({ status }) => (
  <span style={{ background: STATUS_COLOR[status].bg, color: STATUS_COLOR[status].fg, borderRadius: 10, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>{status}</span>
);

const Tile: React.FC<{ label: string; value: string; hint?: string; warn?: boolean }> = ({ label, value, hint, warn }) => (
  <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderLeft: `4px solid ${warn ? RES.red : RES.green}`, borderRadius: 4, padding: '8px 12px', minWidth: 150, flex: '1 1 150px' }}>
    <div style={{ fontSize: 12, color: RES.gray }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 600, color: RES.navy }}>{value}</div>
    {hint && <div style={{ fontSize: 11, color: warn ? RES.red : RES.gray }}>{hint}</div>}
  </div>
);

type DialogState = { kind: 'approve' | 'reject'; text: string } | { kind: 'group'; group: BudgetGroup } | { kind: 'newGroup'; name: string; type: GroupKind } | undefined;

export const BudgetTab: React.FC<{ project: Project }> = ({ project }) => {
  const { repos, settings, user } = useApp();
  const report = useReportCurrency();
  const actor = React.useMemo(() => toActor(user), [user]);
  const wf = React.useMemo(() => toWorkflowProject(project), [project]);
  // Při načtení se starý rozpočet (bez výnosů) převede na nový model; potřebuje smluvní cenu projektu a kurzy.
  const projectRef = React.useRef(project);
  projectRef.current = project;
  const ratesRef = React.useRef(report.rates);
  ratesRef.current = report.rates;

  const [loaded, setLoaded] = React.useState(false);
  const [record, setRecord] = React.useState<BudgetRecord | undefined>(undefined);
  const [doc, setDoc] = React.useState<BudgetDoc | undefined>(undefined);
  const [saved, setSaved] = React.useState('');
  const [etag, setEtag] = React.useState<string | undefined>(undefined);
  const [history, setHistory] = React.useState<BudgetHistoryEntry[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [issues, setIssues] = React.useState<string[]>([]);
  const [notice, setNotice] = React.useState<string | undefined>(undefined);
  const [dialog, setDialog] = React.useState<DialogState>(undefined);
  const [importOpen, setImportOpen] = React.useState(false);
  const [revImportOpen, setRevImportOpen] = React.useState(false);
  const [ratesOpen, setRatesOpen] = React.useState(false);
  const [partners, setPartners] = React.useState<Partner[]>([]);
  const [newPartner, setNewPartner] = React.useState<{ name: string; itemId: string } | undefined>(undefined);
  const [orders, setOrders] = React.useState<PurchaseOrder[]>([]);
  const [orderFrom, setOrderFrom] = React.useState<BudgetItem | undefined>(undefined);
  const [ordersKey, setOrdersKey] = React.useState(0);

  // Objednávky projektu — z navázaných se počítá „Objednáno“ a prognóza.
  React.useEffect(() => {
    let cancelled = false;
    repos.orders
      .list({ projectNumber: project.projectNumber })
      .then((l) => !cancelled && setOrders(l))
      .catch(() => !cancelled && setOrders([]));
    return () => {
      cancelled = true;
    };
  }, [repos, project.projectNumber, ordersKey]);

  const [approvers, setApprovers] = React.useState<RoleMembership[]>([]);
  const [approverOpen, setApproverOpen] = React.useState(false);
  const hasRecord = !!record;
  React.useEffect(() => {
    if (!hasRecord) {
      return;
    }
    repos.userAdmin
      .listRoleMembers(settings.roles)
      .then(setApprovers)
      .catch(() => setApprovers([]));
  }, [repos, settings.roles, hasRecord]);

  React.useEffect(() => {
    repos.partners
      .list({})
      .then(setPartners)
      .catch(() => setPartners([]));
  }, [repos]);

  const actions: BudgetAction[] = availableBudgetActions(record, wf, actor);
  const editable = actions.indexOf('edit') !== -1;
  const dirty = !!doc && JSON.stringify(doc) !== saved;
  const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

  const reload = React.useCallback(async (): Promise<void> => {
    // Když se zrovna ukládají změny z předchozí záložky, počká se na ně — ať se nenačte starý stav.
    await whenFlushed(project.projectNumber);
    const c = await repos.budgets.get(project.projectNumber);
    setLoaded(true);
    if (!c) {
      setRecord(undefined);
      setDoc(undefined);
      setSaved('');
      return;
    }
    // Převedený rozpočet se liší od uloženého, takže se při úpravě (u PM hned) sám uloží; číslo nákupu se nemění.
    const converted = ensureRevenues(c.doc, projectRef.current, ratesRef.current);
    setRecord(c.record);
    setDoc(converted);
    setSaved(JSON.stringify(c.doc));
    setEtag(c.etag);
    repos.budgets
      .history(c.record.id)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [repos, project.projectNumber]);

  React.useEffect(() => {
    let cancelled = false;
    setError(undefined);
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

  // Semafor se uloží do projektu (přehled projektů), kdykoli se rozpočet nebo objednávky změní.
  React.useEffect(() => {
    if (record && doc && !dirty) {
      refreshBudgetCache(repos, project, settings, report.rates).catch(() => undefined);
    }
  }, [record, saved, orders, report.rates]);

  const run = (job: () => Promise<void>): void => {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    job()
      .catch((e: unknown) => setError(why(e)))
      .then(() => setBusy(false))
      .catch(() => setBusy(false));
  };

  /** Součty v Kč, které se ukládají u záznamu a do schválení. */
  const czk = (d: BudgetDoc): { totalCost: number; totalSale: number; forecastCost: number; forecastSale: number } => {
    const t = budgetTotals(d, 'CZK', report.rates, orders);
    return { totalCost: t.cost, totalSale: t.sale, forecastCost: t.forecast, forecastSale: t.revenueForecast };
  };

  const save = async (): Promise<void> => {
    if (!record || !doc) {
      return;
    }
    await repos.budgets.save(record.id, doc, czk(doc), user, etag);
    await reload();
  };

  // Průběžné ukládání: rozpočet se po pauze sám uloží; při odchodu z této záložky se uloží hned.
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
      await repos.budgets.save(record.id, d, czk(d), user, etagRef.current, { auto: true });
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
  // Záloha v prohlížeči: kdyby se automatické uložení nepovedlo (výpadek spojení, souběh), změny se neztratí.
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

  const create = (): void =>
    run(async () => {
      const start = emptyBudget(settings.budget.categories, settings.budget.professions);
      await repos.budgets.create(project.projectNumber, start, czk(start), user);
      await reload();
      setNotice('Rozpočet je založený. Přidávejte položky, nebo vložte tabulku z Excelu. Sazby profesí pro vlastní práci jsou zkopírované z Nastavení a v projektu je můžete upravit.');
    });

  const requestApproval = (): void => {
    if (!doc) {
      return;
    }
    const found = validateBudget(doc, true);
    if (found.length > 0) {
      setIssues(found.map((i) => i.message));
      return;
    }
    setIssues([]);
    setApproverOpen(true);
  };

  const sendApprovalRequest = (picked: { login: string; name: string } | undefined): void => {
    setApproverOpen(false);
    run(async () => {
      if (dirty) {
        await save();
      }
      if (record) {
        await repos.budgets.requestApproval(record.id, user, picked);
        await reload();
        setNotice(`Žádost o schválení je odeslaná${picked ? `: ${picked.name}` : ' vedení'}. Rozpočet můžete dál upravovat; schválí se jeho aktuální podoba.`);
      }
    });
  };

  const confirmDialog = (): void => {
    const d = dialog;
    setDialog(undefined);
    if (!d || !doc) {
      return;
    }
    if (d.kind === 'group') {
      setDoc(removeGroup(doc, d.group.id));
      return;
    }
    if (d.kind === 'newGroup') {
      if (d.name.trim() !== '') {
        setDoc(addGroup(doc, d.name.trim(), d.type));
      }
      return;
    }
    if (!record) {
      return;
    }
    run(async () => {
      if (d.kind === 'approve') {
        if (dirty) {
          await save();
        }
        // Smluvní cena projektu = součet plánu výnosů schváleného rozpočtu (v měně projektu).
        const price = budgetTotals(doc, asCurrencyCode(project.currency), report.rates).sale;
        const firstApproval = record.approvals.length === 0;
        await repos.budgets.approve(record.id, czk(doc), d.text.trim() || undefined, user, { priceNet: price, currency: asCurrencyCode(project.currency) });
        setNotice(`Rozpočet je schválený. Marže při schválení je zafixovaná v historii dole, smluvní cena projektu je součet plánu výnosů a plán je teď uzamčený.${firstApproval ? ' Prognóza se nastavila na plán.' : ''}`);
      } else {
        await repos.budgets.reject(record.id, d.text, user);
        setNotice('Rozpočet je vrácený k úpravě.');
      }
      await reload();
    });
  };

  const withdraw = (): void =>
    run(async () => {
      if (record) {
        await repos.budgets.reject(record.id, '', user);
        await reload();
        setNotice('Žádost o schválení je stažená zpět.');
      }
    });

  const unlockPlan = (): void =>
    run(async () => {
      if (record) {
        if (dirty) {
          await save();
        }
        await repos.budgets.unlockPlan(record.id, user);
        await reload();
        setNotice('Plán je odemčený ke změně. Upravte plán nákupu nebo výnosů (např. přidejte dodatek) a požádejte o nové schválení; prognóza se nemění.');
      }
    });

  const exportCsv = (): void => {
    if (!doc) {
      return;
    }
    const head = ['Skupina', 'Popis', 'Dodavatel / profese', 'Kategorie', 'Měna', 'Nákup – plán', 'Nákup – prognóza', 'Nakoupeno', 'Zbývá nakoupit'];
    const n = (v: number): string => String(v).replace('.', ',');
    const q = (s: string): string => `"${s.replace(/"/g, '""')}"`;
    const lines = [head.map(q).join(';')];
    calcItems(doc, report.rates, orders).forEach((c) => {
      const rate = doc.rates.filter((r) => r.id === c.item.rateId)[0];
      lines.push(
        [
          q(c.group ? c.group.name : ''),
          q(c.item.description),
          q(rate ? rate.name : c.item.supplier ?? ''),
          q(c.item.category ?? ''),
          c.currency,
          n(c.cost),
          n(c.forecast),
          n(c.actualCost),
          n(c.remainingCost)
        ].join(';')
      );
    });
    lines.push('');
    lines.push(['Výnosy', 'Popis', 'Měna', 'Plán (smluvní)', 'Prognóza', 'Vyfakturováno'].map(q).join(';'));
    (doc.revenues ?? []).forEach((r) => {
      lines.push([q(''), q(r.description), r.currency, n(r.plan), n(r.forecast !== undefined ? r.forecast : r.plan), n(r.invoiced ?? 0)].join(';'));
    });
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Rozpocet_${project.projectNumber}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // --- zobrazení ---

  if (project.isOverhead) {
    return <MessageBar messageBarType={MessageBarType.info}>Na projekt Režie se realizační rozpočet nevede.</MessageBar>;
  }
  if (!loaded && !error) {
    return <Spinner size={SpinnerSize.medium} label="Načítám rozpočet…" />;
  }

  const totals = doc ? budgetTotals(doc, report.currency, report.rates, orders) : undefined;
  const semaphore = doc ? computeSemaphore(doc, record, orders, report.rates, settings, project) : undefined;
  const totalsCzk = doc ? budgetTotals(doc, 'CZK', report.rates) : undefined;
  const last = lastApproval(record);
  const planLocked = isPlanLocked(record);
  const approvedM = totalsCzk ? approvedMargin(last, totalsCzk.sale) : undefined;
  // Rozpočet schvaluje vedení nebo administrátor (bez určeného jednoho schvalovatele) — ukážou se jejich jména.
  const approverNames = (() => {
    if (record && record.approverName) {
      return record.approverName;
    }
    const names: string[] = [];
    approvers.forEach((m) => {
      if (m.role === Role.Vedeni || m.role === Role.Administrator) {
        m.members.forEach((p) => names.indexOf(p.displayName) === -1 && names.push(p.displayName));
      }
    });
    return names.length > 0 ? `vedení (${names.slice(0, 6).join(', ')}${names.length > 6 ? ' a další' : ''})` : 'vedení nebo administrátor PRM';
  })();
  const changed = !!approvedM && !!totalsCzk && (Math.abs(approvedM.cost - totalsCzk.cost) > 0.5 || Math.abs(approvedM.revenue - totalsCzk.sale) > 0.5);

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        {record && <StatusBadge status={record.status} />}
        {record && record.status === BudgetStatus.KeSchvaleni && (
          <span style={{ fontSize: 12, color: RES.gray }}>
            žádost podal {record.requestedByName || '—'}
            {record.requestedAt ? `, ${formatDate(record.requestedAt)}` : ''}
            {' · čeká na schválení: '}
            <strong>{approverNames}</strong>
          </span>
        )}
        {last && (
          <span style={{ fontSize: 12, color: RES.gray }}>
            poslední schválení č. {last.no}: {last.byName}, {formatDate(last.at)}
          </span>
        )}
        {changed && (
          <span style={{ fontSize: 12, color: '#7A5A00', background: '#FFF1CC', borderRadius: 10, padding: '1px 8px' }} title="Plán nákupu nebo výnosů se liší od posledního schválení — pro nové schválení podejte žádost znovu">
            plán změněn od posledního schválení
          </span>
        )}
        <span style={{ flex: '1 1 auto' }} />
        <CurrencySwitch />
      </div>

      {draft.pending && <DraftBanner savedAt={draft.pending.savedAt} what="rozpočet" onRestore={draft.restore} onDiscard={draft.discard} />}
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
      {record && record.status !== BudgetStatus.KeSchvaleni && record.comment && (
        <MessageBar messageBarType={MessageBarType.severeWarning} isMultiline>
          <strong>Vedení rozpočet vrátilo:</strong> {record.comment}
        </MessageBar>
      )}

      {loaded && !record && (
        <MessageBar
          messageBarType={MessageBarType.info}
          isMultiline
          actions={
            actions.indexOf('create') !== -1 ? (
              <div>
                <PrimaryButton text="Založit rozpočet" disabled={busy} onClick={create} />
              </div>
            ) : undefined
          }
        >
          Tento projekt zatím nemá realizační rozpočet.{' '}
          {actions.indexOf('create') !== -1 ? 'Založte ho — vznikne s kategoriemi z Nastavení jako skupinami; položky přidáte po jedné, nebo vložíte z Excelu.' : 'Založit ho smí projektový manažer, asistent nebo vedení.'}
        </MessageBar>
      )}

      {doc && totals && (
        <>
          {planLocked && (
            <MessageBar messageBarType={MessageBarType.info} isMultiline>
              <strong>Plán je uzamčený</strong> ({record && record.status === BudgetStatus.KeSchvaleni ? 'čeká na schválení' : 'rozpočet je schválený'}). Prognózu nákupu a tržeb, skutečnost a vyfakturováno můžete upravovat dál.
              {actions.indexOf('unlock') !== -1 ? ' Změna plánu (dodatek, vícepráce, jiný nákup) se dělá odemčením plánu a novým schválením.' : ''}
            </MessageBar>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '10px 0 6px' }}>
            <Tile label={`Nákup – plán (${report.label})`} value={formatMoney(totals.cost, report.currency)} hint="součet plánu nákupu" />
            <Tile label={`Tržby – plán / smluvní cena (${report.label})`} value={formatMoney(totals.sale, report.currency)} hint="součet plánu výnosů, bez DPH" warn={totals.sale <= 0} />
            <Tile
              label="Marže – plán"
              value={`${totals.plannedMargin.percent !== undefined ? pct(totals.plannedMargin.percent) : '—'} · ${formatMoney(totals.plannedMargin.amount, report.currency)}`}
              hint={approvedM && approvedM.percent !== undefined ? `zafixováno schválením: ${pct(approvedM.percent)}` : 'rozpočet ještě nebyl schválen'}
              warn={totals.plannedMargin.percent === undefined || totals.plannedMargin.percent < settings.budget.marginYellowPercent}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '0 0 6px' }}>
            <Tile label={`Nákup – prognóza (${report.label})`} value={formatMoney(totals.forecast, report.currency)} hint="ruční prognóza, jinak plán; nejméně objednáno a nakoupeno" warn={totals.forecast > totals.cost} />
            <Tile label={`Tržby – prognóza (${report.label})`} value={formatMoney(totals.revenueForecast, report.currency)} hint={`vyfakturováno ${formatMoney(totals.revenueInvoiced, report.currency)}`} />
            <Tile
              label="Marže – prognóza"
              value={`${totals.forecastMargin.percent !== undefined ? pct(totals.forecastMargin.percent) : '—'} · ${formatMoney(totals.forecastMargin.amount, report.currency)}`}
              hint={
                totals.forecastMargin.percent === undefined
                  ? 'bez výnosů nejde marži spočítat'
                  : totals.plannedMargin.percent !== undefined
                  ? `proti plánu ${totals.forecastMargin.percent - totals.plannedMargin.percent >= 0 ? '+' : ''}${(Math.round((totals.forecastMargin.percent - totals.plannedMargin.percent) * 10) / 10).toLocaleString('cs-CZ')} p. b.`
                  : '(tržby prognóza − nákup prognóza) / tržby prognóza'
              }
              warn={totals.forecastMargin.percent === undefined || totals.forecastMargin.percent < settings.budget.marginYellowPercent}
            />
            <SemaphoreTile view={semaphore} settings={settings.budget} />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '0 0 10px' }}>
            <Tile label={`Nakoupeno (${report.label})`} value={formatMoney(totals.actual, report.currency)} hint="součet nakoupeného a odpracovaného" />
            <Tile label={`Zbývá nakoupit (${report.label})`} value={formatMoney(totals.remaining, report.currency)} hint="plán nákupu − nakoupeno" warn={totals.remaining < 0} />
            <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderLeft: `4px solid ${totals.spentPercent > 100 ? RES.red : RES.green}`, borderRadius: 4, padding: '8px 12px', minWidth: 150, flex: '2 1 300px' }} title="Prostavěnost = nakoupeno / plán nákupu">
              <div style={{ fontSize: 12, color: RES.gray }}>Prostavěnost</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: RES.navy }}>{pct(totals.spentPercent)}</div>
              <div style={{ height: 8, background: RES.background, borderRadius: 4, marginTop: 4, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, totals.spentPercent)}%`, height: '100%', background: totals.spentPercent > 100 ? RES.red : RES.blue }} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            {editable && (
              <>
                <PrimaryButton text={busy ? 'Pracuji…' : dirty ? 'Uložit rozpočet' : 'Uloženo'} disabled={busy || !dirty} onClick={() => run(save)} />
                <span style={{ fontSize: 12, color: autoError ? RES.red : RES.gray }} aria-live="polite">
                  {autoError
                    ? `Automatické uložení čeká: ${autoError}`
                    : dirty
                    ? 'Neuložené změny se uloží samy za několik sekund.'
                    : autosave.savedAt
                    ? `Automaticky uloženo v ${autosave.savedAt.getHours()}:${String(autosave.savedAt.getMinutes()).padStart(2, '0')}.`
                    : ''}
                </span>
                <ActionButton iconProps={{ iconName: 'Add' }} text="Přidat skupinu" disabled={busy || planLocked} onClick={() => setDialog({ kind: 'newGroup', name: '', type: 'standard' })} />
                <ActionButton iconProps={{ iconName: 'Paste' }} text="Vložit z Excelu" disabled={busy || planLocked} onClick={() => setImportOpen(true)} />
              </>
            )}
            <ActionButton iconProps={{ iconName: ratesOpen ? 'ChevronUp' : 'Contact' }} text={`Sazby profesí (${doc.rates.length})`} onClick={() => setRatesOpen((o) => !o)} />
            <ActionButton iconProps={{ iconName: 'Download' }} text="Export do CSV" onClick={exportCsv} />
            <span style={{ flex: '1 1 auto' }} />
          </div>
          {(actions.indexOf('unlock') !== -1 || actions.indexOf('requestApproval') !== -1 || actions.indexOf('approve') !== -1 || actions.indexOf('reject') !== -1 || (actions.indexOf('withdraw') !== -1 && !canApproveBudget(actor, record))) && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', margin: '0 0 10px' }}>
              {actions.indexOf('unlock') !== -1 && <DefaultButton text="Odemknout plán ke změně" iconProps={{ iconName: 'Unlock' }} title="Plán nákupu a výnosů půjde upravit (např. dodatek); po úpravě je potřeba nové schválení" disabled={busy} onClick={unlockPlan} />}
              {actions.indexOf('requestApproval') !== -1 && <DefaultButton text="Požádat o schválení" disabled={busy} onClick={requestApproval} />}
              {actions.indexOf('withdraw') !== -1 && !canApproveBudget(actor, record) && <DefaultButton text="Stáhnout žádost" disabled={busy} onClick={withdraw} />}
              {actions.indexOf('reject') !== -1 && <ReturnButton text="Vrátit k úpravě" disabled={busy} onClick={() => setDialog({ kind: 'reject', text: '' })} />}
              {actions.indexOf('approve') !== -1 && <ApproveButton text="Schválit" disabled={busy} onClick={() => setDialog({ kind: 'approve', text: '' })} />}
            </div>
          )}
          {issues.length > 0 && (
            <MessageBar messageBarType={MessageBarType.warning} isMultiline onDismiss={() => setIssues([])}>
              <strong>Nejde požádat o schválení — něco chybí:</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {issues.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </MessageBar>
          )}

          {ratesOpen && <RatesTable doc={doc} onChange={setDoc} editable={editable && !busy && !planLocked} />}

          <RevenueTable doc={doc} onChange={setDoc} editable={editable && !busy} planLocked={planLocked} report={report} defaultCurrency={asCurrencyCode(project.currency)} onImport={() => setRevImportOpen(true)} />

          <h3 style={{ margin: '16px 0 4px', color: RES.navy, fontSize: 15 }}>Nákup</h3>
          <BudgetGrid
            doc={doc}
            onChange={setDoc}
            editable={editable && !busy}
            planLocked={planLocked}
            categories={settings.budget.categories}
            report={report}
            onRemoveGroup={(g) => setDialog({ kind: 'group', group: g })}
            partners={partners}
            orders={orders}
            onOrder={canIssueOrder(wf, actor) ? (item) => setOrderFrom(item) : undefined}
            onCreatePartner={(name, itemId) => setNewPartner({ name, itemId })}
          />

          <div style={{ fontSize: 12, color: RES.gray, marginTop: 8 }}>
            Nákup: plán je celková částka položky (u práce se hodiny dopočtou z nákladové sazby profese, u rezervy je to částka nebo % z nákupu ostatních položek; počty kusů a ceny za jednotku se řeší v nabídkovém nástroji RES CRM). Prognóza je ruční odhad celkového nákupu položky; když ji nezadáte, platí plán (nikdy nejde pod objednáno a nakoupeno).
            Do sloupce Nakoupeno zapisujte skutečnost; Zbývá nakoupit se dopočte; Prostavěnost = nakoupeno / plán nákupu. Marže projektu = (tržby − nákup) / tržby z prognóz — vychází ze sekce Výnosy. Částky se přepočítávají kurzem ČNB, takže marže s kurzem kolísá.
          </div>

          <div style={{ marginTop: 14, background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '8px 12px' }}>
            <div style={{ fontWeight: 600, color: RES.navy, marginBottom: 4 }}>Historie schválení</div>
            {record && record.approvals.length === 0 && <div style={{ fontSize: 13, color: RES.gray }}>Rozpočet zatím nebyl schválen.</div>}
            {record && record.approvals.length > 0 && (
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: RES.gray, fontSize: 12 }}>
                    <th style={{ padding: '3px 6px' }}>Č.</th>
                    <th style={{ padding: '3px 6px' }}>Datum</th>
                    <th style={{ padding: '3px 6px' }}>Schválil</th>
                    <th style={{ padding: '3px 6px', textAlign: 'right' }}>Plán nákupu (Kč)</th>
                    <th style={{ padding: '3px 6px', textAlign: 'right' }}>Smluvní cena (Kč)</th>
                    <th style={{ padding: '3px 6px', textAlign: 'right' }}>Marže</th>
                    <th style={{ padding: '3px 6px', textAlign: 'right' }}>Marže (Kč)</th>
                    <th style={{ padding: '3px 6px' }}>Poznámka</th>
                  </tr>
                </thead>
                <tbody>
                  {record.approvals
                    .slice()
                    .reverse()
                    .map((a) => (
                      <tr key={a.no} style={{ borderTop: `1px solid ${RES.background}` }}>
                        <td style={{ padding: '3px 6px' }}>{a.no}</td>
                        <td style={{ padding: '3px 6px' }}>{formatDate(a.at)}</td>
                        <td style={{ padding: '3px 6px' }}>{a.byName}</td>
                        <td style={{ padding: '3px 6px', textAlign: 'right' }}>{formatMoney(a.cost, 'CZK')}</td>
                        <td style={{ padding: '3px 6px', textAlign: 'right' }} title={a.basis === 'vynosy' ? undefined : 'Starší záznam: smluvní cena je dopočtená z aktuálního plánu výnosů'}>
                          {formatMoney(approvalView(a, totalsCzk ? totalsCzk.sale : 0).revenue, 'CZK')}
                        </td>
                        <td style={{ padding: '3px 6px', textAlign: 'right' }}>{pct(approvalView(a, totalsCzk ? totalsCzk.sale : 0).percent ?? 0)}</td>
                        <td style={{ padding: '3px 6px', textAlign: 'right' }}>{formatMoney(approvalView(a, totalsCzk ? totalsCzk.sale : 0).amount, 'CZK')}</td>
                        <td style={{ padding: '3px 6px' }}>{a.comment || ''}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
            {history.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: RES.gray }}>Podrobný záznam změn ({history.length})</summary>
                {history
                  .slice()
                  .reverse()
                  .map((h, i) => (
                    <div key={i} style={{ fontSize: 12 }}>
                      <strong>{h.action}</strong> — {h.byName}
                      {h.at ? `, ${formatDate(h.at)}` : ''}
                    </div>
                  ))}
              </details>
            )}
          </div>
        </>
      )}

      {orderFrom && doc && (
        <OrderPanel
          isOpen
          projectNumber={project.projectNumber}
          prefill={{
            subject: orderFrom.description,
            supplierName: orderFrom.supplier,
            currency: orderFrom.currency,
            budgetItemId: orderFrom.id,
            budgetItemName: orderFrom.description,
            lines: [{ description: orderFrom.description, quantity: orderFrom.quantity, unit: orderFrom.unit, unitPriceNet: orderFrom.unitCost }]
          }}
          onDismiss={() => setOrderFrom(undefined)}
          onChanged={() => setOrdersKey((k) => k + 1)}
        />
      )}

      {newPartner && (
        <NewPartnerDialog
          suggestedName={newPartner.name}
          onClose={() => setNewPartner(undefined)}
          onCreated={(p) => {
            const target = newPartner;
            setNewPartner(undefined);
            setPartners((cur) => [...cur, p]);
            if (doc && target) {
              setDoc({ ...doc, items: doc.items.map((i) => (i.id === target.itemId ? { ...i, supplier: p.name } : i)) });
            }
            setNotice(`Partner „${p.name}“ je založený a vybraný jako dodavatel. Nezapomeňte rozpočet uložit.`);
          }}
        />
      )}

      {approverOpen && (
        <ApproverDialog
          key="budget-approver"
          title="Požádat o schválení"
          description="Vyberte, kdo z vedení rozpočet schválí. „Kdokoli z role“ znamená, že ho může schválit kterýkoli člen vedení."
          confirmText="Požádat o schválení"
          rows={[{ level: 'vedeni', candidates: budgetApproverCandidates(approvers, user.loginName), selected: '' }]}
          busy={busy}
          onConfirm={(assignees) => sendApprovalRequest(assignees.vedeni)}
          onDismiss={() => setApproverOpen(false)}
        />
      )}

      {revImportOpen && doc && (
        <BudgetImportDialog
          doc={doc}
          revenue
          onClose={() => setRevImportOpen(false)}
          onImport={(items) => {
            const cur = doc.revenues ?? [];
            setDoc({ ...doc, revenues: [...cur, ...items.map((i) => ({ id: i.id, description: i.description, currency: i.currency, plan: Math.round(i.quantity * i.unitCost * 100) / 100 }))] });
            setRevImportOpen(false);
            setNotice(`Přidáno ${items.length} výnosů. Zkontrolujte je a rozpočet se sám uloží.`);
          }}
        />
      )}

      {importOpen && doc && (
        <BudgetImportDialog
          doc={doc}
          onClose={() => setImportOpen(false)}
          onImport={(items) => {
            setDoc({ ...doc, items: [...doc.items, ...items] });
            setImportOpen(false);
            setNotice(`Přidáno ${items.length} položek. Nezapomeňte rozpočet uložit.`);
          }}
        />
      )}

      {dialog && (
        <Dialog
          hidden={false}
          onDismiss={() => setDialog(undefined)}
          dialogContentProps={{
            type: DialogType.normal,
            title: dialog.kind === 'approve' ? 'Schválit rozpočet' : dialog.kind === 'reject' ? 'Vrátit rozpočet k úpravě' : dialog.kind === 'group' ? 'Smazat skupinu' : 'Nová skupina'
          }}
          modalProps={{ isBlocking: true }}
        >
          {dialog.kind === 'group' && <div style={{ fontSize: 13 }}>Skupina „{dialog.group.name}“ se smaže i se všemi svými položkami (změna se uloží až tlačítkem Uložit rozpočet).</div>}
          {dialog.kind === 'newGroup' && (
            <>
              <TextField label="Název skupiny" autoFocus value={dialog.name} onChange={(_, v) => setDialog({ kind: 'newGroup', name: v ?? '', type: dialog.type })} />
              <Dropdown
                label="Druh skupiny"
                selectedKey={dialog.type}
                options={(['standard', 'prace', 'rezerva'] as GroupKind[]).map((k) => ({ key: k, text: GROUP_KIND_LABELS[k] }))}
                onChange={(_, o) => o && setDialog({ kind: 'newGroup', name: dialog.name, type: o.key as GroupKind })}
              />
            </>
          )}
          {(dialog.kind === 'approve' || dialog.kind === 'reject') && (
            <>
              {dialog.kind === 'approve' && totalsCzk && (
                <div style={{ fontSize: 13, marginBottom: 8 }}>
                  Do historie se uloží: plán nákupu {formatMoney(totalsCzk.cost, 'CZK')}, smluvní cena (plán výnosů) {formatMoney(totalsCzk.sale, 'CZK')}, marže{' '}
                  {totalsCzk.plannedMargin.percent !== undefined ? pct(totalsCzk.plannedMargin.percent) : '—'} ({formatMoney(totalsCzk.plannedMargin.amount, 'CZK')}).
                  {record && record.approvals.length === 0 ? ' Je to první schválení: prognóza se nastaví na plán.' : ' Prognóza se nemění.'}
                </div>
              )}
              <TextField
                label={dialog.kind === 'approve' ? 'Poznámka ke schválení (nepovinná)' : 'Důvod vrácení (povinný)'}
                multiline
                rows={3}
                autoFocus
                value={dialog.text}
                onChange={(_, v) => setDialog({ kind: dialog.kind as 'approve' | 'reject', text: v ?? '' })}
              />
            </>
          )}
          <DialogFooter>
            {dialog.kind === 'approve' ? (
              <ApproveButton text="Schválit" onClick={confirmDialog} />
            ) : dialog.kind === 'reject' ? (
              <ReturnButton text="Vrátit k úpravě" disabled={dialog.text.trim() === ''} onClick={confirmDialog} />
            ) : (
              <PrimaryButton text={dialog.kind === 'group' ? 'Smazat' : 'Přidat'} disabled={dialog.kind === 'newGroup' && dialog.name.trim() === ''} onClick={confirmDialog} />
            )}
            <DefaultButton text="Zpět" onClick={() => setDialog(undefined)} />
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
};


const SEMAFOR_COLOR: Record<string, string> = {
  [Semafor.Zelena]: '#00A857',
  [Semafor.SvetleZelena]: '#8BC34A',
  [Semafor.Zluta]: '#F2A900',
  [Semafor.Cervena]: '#C8102E',
  [Semafor.TmaveCervena]: '#8B0F23'
};

const approvalView = (a: Parameters<typeof approvedMargin>[0], revenuePlanCzk: number): NonNullable<ReturnType<typeof approvedMargin>> => approvedMargin(a, revenuePlanCzk) as NonNullable<ReturnType<typeof approvedMargin>>;

/** Semafor rozpočtu: barva i slovo (nespoléhá jen na barvu) a vysvětlení podle aktuální marže z prognózy. */
const SemaphoreTile: React.FC<{ view: ReturnType<typeof computeSemaphore> | undefined; settings: { marginGreenPercent: number; marginLightGreenPercent: number; marginYellowPercent: number } }> = ({ view, settings }) => {
  if (!view) {
    return null;
  }
  const color = SEMAFOR_COLOR[view.status] ?? RES.gray;
  const hint =
    view.status === Semafor.Bez
      ? 'bez výnosů nebo rozpočtu nejde marži spočítat'
      : `aktuální marže ${view.marginPercent !== undefined ? pct(view.marginPercent) : '—'} · zelená od ${settings.marginGreenPercent} %, světle zelená od ${settings.marginLightGreenPercent} %, žlutá od ${settings.marginYellowPercent} %`;
  return (
    <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderLeft: `4px solid ${color}`, borderRadius: 4, padding: '8px 12px', minWidth: 150, flex: '2 1 280px' }}>
      <div style={{ fontSize: 12, color: RES.gray }}>Semafor rozpočtu</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: RES.navy }}>
        <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 6, background: color, marginRight: 8 }} />
        {view.status}
      </div>
      <div style={{ fontSize: 11, color: RES.gray }}>{hint}</div>
    </div>
  );
};

/** Sazby profesí projektu: kopie z číselníku v Nastavení; projekt si je drží a může upravit. */
const RatesTable: React.FC<{ doc: BudgetDoc; onChange: (d: BudgetDoc) => void; editable: boolean }> = ({ doc, onChange, editable }) => {
  const [name, setName] = React.useState('');
  return (
    <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '8px 12px', margin: '8px 0' }}>
      <div style={{ fontWeight: 600, color: RES.navy }}>Nákladové sazby profesí projektu (Kč za hodinu)</div>
      <div style={{ fontSize: 12, color: RES.gray, marginBottom: 6 }}>Při založení rozpočtu se převzaly z Nastavení; v tomto projektu je můžete upravit a projekt si je pamatuje.</div>
      <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: RES.gray, fontSize: 12 }}>
            <th style={{ padding: '3px 4px' }}>Profese</th>
            <th style={{ padding: '3px 4px', textAlign: 'right' }}>Nákladová sazba</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {doc.rates.map((r) => (
            <tr key={r.id}>
              <td style={{ padding: '2px 4px', width: 240 }}>
                <input aria-label="Název profese" value={r.name} disabled={!editable} onChange={(e) => onChange(updateRate(doc, r.id, { name: e.target.value }))} style={CELL_INPUT} />
              </td>
              <td style={{ padding: '2px 4px', width: 130 }}>
                <NumInput value={r.costRate} ariaLabel={`Nákladová sazba ${r.name}`} disabled={!editable} onCommit={(v) => onChange(updateRate(doc, r.id, { costRate: Math.max(0, v ?? 0) }))} />
              </td>
              <td>
                {editable && (
                  <DefaultButton text="Odebrat" onClick={() => onChange(removeRate(doc, r.id))} styles={{ root: { height: 26, minWidth: 0, padding: '0 8px' } }} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editable && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
          <input aria-label="Nová profese" placeholder="Nová profese" value={name} onChange={(e) => setName(e.target.value)} style={{ ...CELL_INPUT, width: 240 }} />
          <DefaultButton
            text="Přidat"
            disabled={name.trim() === ''}
            onClick={() => {
              onChange(addRate(doc, name));
              setName('');
            }}
          />
        </div>
      )}
    </div>
  );
};
