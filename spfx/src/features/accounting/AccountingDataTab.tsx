/**
 * Záložka „Data z účetnictví“: řádky stažené z ABRA Flexi (faktura nebo její část, resp. zápis z účetního deníku — popis, účet,
 * projekt, částka). Projektový manažer je přiřazuje k položkám nákupu (přijaté) a k výnosům (vydané), kdykoli může položku změnit
 * nebo řádek vrátit mezi nepřiřazené. Přiřazené řádky jsou obarvené, jde filtrovat jen nepřiřazené. Zálohy se ukazují, ale
 * nepřiřazují se a do součtů se nezapočítávají. Přiřazení se ukládá v rozpočtu projektu.
 */

import * as React from 'react';
import { ActionButton, DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { TextField } from '@fluentui/react/lib/TextField';
import { ChoiceGroup } from '@fluentui/react/lib/ChoiceGroup';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { buildHash, RouteName } from '../../ui/router';
import { RES } from '../../ui/theme';
import { CurrencySwitch } from '../../ui/components/CurrencySwitch';
import { useReportCurrency } from '../../ui/useReportCurrency';
import { Project } from '../../core/types';
import { formatDate, formatDateTime, formatMoney } from '../../core/format';
import { toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { CurrencyCode } from '../../core/currency';
import { BudgetDoc, BudgetRecord, budgetTotals, canEditBudget, validateBudget } from '../../core/budget';
import { ensureRevenues } from '../../core/budgetMargin';
import { ABRA_DOC_LABELS, AbraDoc, DocAssignState, abraRowMatches, advanceSummary, allocatedOfDoc, assignStateOf, isAdvance, isApproximate, orphanAllocations, setDocTarget, targetKindOf, unallocatedTotals } from '../../core/abraDocs';
import { AbraCorrection, autoResolvable, correctionMail, correctionNoteProblem, openCorrectionsByDoc, summarizeCorrections } from '../../core/abraCorrections';
import { AbraSyncStatus } from '../../data/repositories';
import { useAutosave, whenFlushed } from '../budget/useAutosave';
import { refreshBudgetCache } from '../budget/budgetCache';
import { SplitDocDialog } from './SplitDocDialog';
import { UNASSIGNED_KEY, targetLabel, targetOptions } from './targets';

const TH: React.CSSProperties = { textAlign: 'left', fontWeight: 600, fontSize: 12, color: RES.gray, padding: '6px 6px', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: RES.white, zIndex: 1, boxShadow: `0 1px 0 ${RES.grayBlue}` };
const TD: React.CSSProperties = { padding: '4px 6px', fontSize: 13, verticalAlign: 'middle' };

/** Barvy řádků podle stavu přiřazení — přiřazené jsou zelené, částečně přiřazené žluté, nepřiřazené bílé s oranžovým proužkem. */
const ROW_STYLE: Record<DocAssignState, { background: string; border: string }> = {
  full: { background: '#E4F6EC', border: RES.green },
  partial: { background: '#FFF6DD', border: RES.amber },
  none: { background: RES.white, border: RES.amber },
  advance: { background: RES.background, border: RES.grayBlue }
};

type ShowFilter = 'all' | 'open' | 'done' | 'fix';
type KindFilter = 'all' | 'prijata' | 'vydana' | 'zaloha';

export const AccountingDataTab: React.FC<{ project: Project }> = ({ project }) => {
  const { repos, settings, user } = useApp();
  const report = useReportCurrency();
  const actor = React.useMemo(() => toActor(user), [user]);
  const wf = React.useMemo(() => toWorkflowProject(project), [project]);
  const projectRef = React.useRef(project);
  projectRef.current = project;
  const ratesRef = React.useRef(report.rates);
  ratesRef.current = report.rates;

  const [loaded, setLoaded] = React.useState(false);
  const [record, setRecord] = React.useState<BudgetRecord | undefined>(undefined);
  const [doc, setDoc] = React.useState<BudgetDoc | undefined>(undefined);
  const [saved, setSaved] = React.useState('');
  const [etag, setEtag] = React.useState<string | undefined>(undefined);
  const [rows, setRows] = React.useState<AbraDoc[]>([]);
  const [status, setStatus] = React.useState<AbraSyncStatus | undefined>(undefined);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [notice, setNotice] = React.useState<string | undefined>(undefined);
  const [show, setShow] = React.useState<ShowFilter>('all');
  const [kind, setKind] = React.useState<KindFilter>('all');
  const [search, setSearch] = React.useState('');
  const [splitRow, setSplitRow] = React.useState<AbraDoc | undefined>(undefined);
  const [corrections, setCorrections] = React.useState<AbraCorrection[]>([]);
  const [markRow, setMarkRow] = React.useState<AbraDoc | undefined>(undefined);
  const [sendOpen, setSendOpen] = React.useState(false);

  const editable = canEditBudget(wf, actor);
  const dirty = !!doc && JSON.stringify(doc) !== saved;
  const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

  const loadFeed = React.useCallback((): void => {
    repos.abraDocs
      .list(project.projectNumber)
      .then(setRows)
      .catch(() => setRows([]));
    repos.abraDocs
      .syncStatus()
      .then(setStatus)
      .catch(() => setStatus(undefined));
    repos.abraCorrections
      .list(project.projectNumber)
      .then(setCorrections)
      .catch(() => setCorrections([]));
  }, [repos, project.projectNumber]);

  const reload = React.useCallback(async (): Promise<void> => {
    await whenFlushed(project.projectNumber);
    const b = await repos.budgets.get(project.projectNumber);
    setLoaded(true);
    if (!b) {
      setRecord(undefined);
      setDoc(undefined);
      return;
    }
    setRecord(b.record);
    setDoc(ensureRevenues(b.doc, projectRef.current, ratesRef.current));
    setSaved(JSON.stringify(b.doc));
    setEtag(b.etag);
  }, [repos, project.projectNumber]);

  React.useEffect(loadFeed, [loadFeed]);
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

  // Přiřazení se ukládá do rozpočtu sama (po krátké pauze, při odchodu ze záložky hned) — stejně jako v rozpočtu a cashflow.
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
      // Přiřazení mění Nakoupeno a tím prognózu a marži — přehled projektů se aktualizuje hned.
      if (record) {
        refreshBudgetCache(repos, projectRef.current, settings, ratesRef.current).catch(() => undefined);
      }
    },
    onError: (m) => setAutoError(m)
  });

  // Opravy, jejichž řádek už v účetnictví projektu není (účtárna ho opravila), se uzavřou samy.
  React.useEffect(() => {
    if (!editable) {
      return;
    }
    const gone = autoResolvable(corrections, rows);
    if (gone.length === 0) {
      return;
    }
    repos.abraCorrections
      .resolve(gone.map((c) => c.id), 'Řádek už v účetnictví projektu není — opraveno v Abře.', user)
      .then(() => {
        setNotice(`Opraveno v účetnictví: ${gone.length === 1 ? 'oprava' : gone.length + ' oprav'} se uzavřelo (${gone.map((c) => c.docNumber).join(', ')}).`);
        return repos.abraCorrections.list(project.projectNumber).then(setCorrections);
      })
      .catch(() => undefined);
  }, [corrections, rows, editable]);

  const requestSync = (): void => {
    setBusy(true);
    setError(undefined);
    repos.abraDocs
      .requestSync(user)
      .then(() => {
        setBusy(false);
        setNotice('Žádost o aktualizaci z Abry je zapsaná. Nové řádky se objeví, jakmile je prostředník stáhne (obvykle do několika minut).');
        loadFeed();
      })
      .catch((e: unknown) => {
        setBusy(false);
        setError(why(e));
      });
  };

  const allocations = doc ? doc.allocations : undefined;
  const openFix = React.useMemo(() => openCorrectionsByDoc(corrections), [corrections]);
  const fixSummary = summarizeCorrections(corrections);

  const filtered = React.useMemo(
    () =>
      rows
        .filter((r) => {
          const state = assignStateOf(r, allocations);
          if (show === 'fix') {
            return openFix.has(r.abraId);
          }
          if (show === 'open' && (openFix.has(r.abraId) || (state !== 'none' && state !== 'partial'))) {
            return false;
          }
          if (show === 'done' && state !== 'full') {
            return false;
          }
          if (kind === 'prijata' && r.type !== 'prijata') {
            return false;
          }
          if (kind === 'vydana' && r.type !== 'vydana') {
            return false;
          }
          if (kind === 'zaloha' && !isAdvance(r)) {
            return false;
          }
          return abraRowMatches(r, search);
        })
        .sort((a, b) => (b.issueDate ? b.issueDate.getTime() : 0) - (a.issueDate ? a.issueDate.getTime() : 0)),
    [rows, allocations, show, kind, search, openFix]
  );

  if (!loaded && !error) {
    return <Spinner size={SpinnerSize.medium} label="Načítám data z účetnictví…" />;
  }
  if (loaded && !doc) {
    return (
      <MessageBar messageBarType={MessageBarType.info} isMultiline>
        Projekt zatím nemá realizační rozpočet. Data z účetnictví se přiřazují k položkám rozpočtu — založte ho v záložce Realizační rozpočet.
      </MessageBar>
    );
  }
  if (!doc) {
    return error ? (
      <MessageBar messageBarType={MessageBarType.error} isMultiline>
        {error}
      </MessageBar>
    ) : null;
  }

  const assignable = editable && !busy;
  const open = unallocatedTotals(rows.filter((r) => !openFix.has(r.abraId)), allocations, report.currency, report.rates);
  const adv = advanceSummary(rows, report.currency, report.rates);
  const orphans = orphanAllocations(rows, allocations);
  const booked = rows.filter((r) => !isAdvance(r));
  const doneCount = booked.filter((r) => assignStateOf(r, allocations) === 'full').length;

  const refreshCorrections = (): Promise<void> => repos.abraCorrections.list(project.projectNumber).then(setCorrections);

  const markFix = (row: AbraDoc, note: string): Promise<void> =>
    repos.abraCorrections.mark({ projectNumber: project.projectNumber, doc: row, note }, user).then(() => {
      // Řádek s opravou se odpojí od rozpočtu (nezapočítává se); po vyřešení se přiřazuje znovu.
      if (doc && (allocations || []).some((a) => a.docId === row.abraId)) {
        const rest = (allocations || []).filter((a) => a.docId !== row.abraId);
        setDoc({ ...doc, allocations: rest.length > 0 ? rest : undefined });
      }
      setMarkRow(undefined);
      setNotice(`Řádek ${row.number} je označený jako OPRAVA a nezapočítává se. Odešlete ho účtárně tlačítkem Odeslat účtárně.`);
      return refreshCorrections();
    });

  const cancelFix = (c: AbraCorrection): void => {
    setError(undefined);
    repos.abraCorrections
      .cancel(c.id, user)
      .then(refreshCorrections)
      .then(() => setNotice(`Označení opravy u dokladu ${c.docNumber} je zrušené; řádek můžete znovu přiřadit.`))
      .catch((e: unknown) => setError(why(e)));
  };

  const toSendList = corrections.filter((c) => c.status === 'Označeno');
  const send = (): Promise<void> => {
    const to = settings.company.accountingEmail.trim();
    if (to === '') {
      return Promise.reject(new Error('V Nastavení doplňte e-mail účtárny (Nastavení → Údaje firmy → E-mail účtárny).'));
    }
    const base = (typeof window !== 'undefined' ? window.location.href : '').split('#')[0];
    const mail = correctionMail({ projectNumber: project.projectNumber, projectTitle: project.title, requesterName: user.displayName, corrections: toSendList, link: `${base}${buildHash(RouteName.ProjectDetail, project.projectNumber)}` });
    return repos.mail
      .send({ to: [to], cc: user.email ? [user.email] : undefined, subject: mail.subject, bodyText: mail.bodyText, attachments: [] })
      .then(() => repos.abraCorrections.markSent(toSendList.map((c) => c.id), user))
      .then(refreshCorrections)
      .then(() => {
        setSendOpen(false);
        setNotice(`Žádost o opravu (${toSendList.length}) je odeslaná účtárně (${to}); kopie přišla Vám.`);
      });
  };

  const change = (row: AbraDoc, targetId: string): void => {
    const k = targetKindOf(row);
    if (!k) {
      return;
    }
    const r = setDocTarget(allocations, row, k, targetId === UNASSIGNED_KEY ? undefined : targetId);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    setError(undefined);
    setDoc({ ...doc, allocations: r.allocations.length > 0 ? r.allocations : undefined });
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: RES.gray }}>
          {status && !status.configured
            ? 'Seznam dat z účetnictví na webu ještě není (spusťte Instalaci a diagnostiku).'
            : status && status.lastSyncAt
            ? `Naposledy staženo z Abry ${formatDateTime(status.lastSyncAt)}${status.lastOk === false ? ' — s chybou' : ''}.`
            : 'Z Abry zatím nic nebylo staženo.'}
          {status && status.pendingSince ? ' Aktualizace čeká na stažení…' : ''}
        </span>
        <span style={{ flex: '1 1 auto' }} />
        <span style={{ fontSize: 12, color: autoError ? RES.red : RES.gray }} aria-live="polite">
          {autoError ? `Automatické uložení čeká: ${autoError}` : dirty ? 'Změny se uloží samy za několik sekund.' : autosave.savedAt ? `Uloženo v ${autosave.savedAt.getHours()}:${String(autosave.savedAt.getMinutes()).padStart(2, '0')}.` : ''}
        </span>
        <CurrencySwitch />
        {editable && <PrimaryButton text={`Odeslat účtárně (${toSendList.length})`} iconProps={{ iconName: 'Mail' }} disabled={toSendList.length === 0 || busy} title="Odešle účtárně jedním e-mailem všechny řádky označené jako OPRAVA" onClick={() => setSendOpen(true)} />}
        <DefaultButton text={busy || (status && status.pendingSince) ? 'Čeká na stažení…' : 'Aktualizovat z Abry'} iconProps={{ iconName: 'Sync' }} disabled={busy || !!(status && (status.pendingSince || !status.configured))} onClick={requestSync} />
      </div>
      {status && status.lastOk === false && status.lastMessage && (
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          Poslední stahování z Abry skončilo chybou: {status.lastMessage}
        </MessageBar>
      )}
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
      {orphans.length > 0 && (
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          {orphans.length} přiřazení patří k řádkům, které už v Abře nejsou (smazané nebo přečíslované). Počítají se dál; po ověření je odeberte v seznamu dokladů u příslušné položky rozpočtu.
        </MessageBar>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '8px 0' }}>
        <Tile label="Nepřiřazeno – nákup" value={formatMoney(open.cost, report.currency)} hint="přijaté faktury (a jejich části), které ještě nejsou přiřazené k položce" warn={Math.abs(open.cost) > 0.5} />
        <Tile label="Nepřiřazeno – výnosy" value={formatMoney(open.revenue, report.currency)} hint="vydané faktury (a jejich části), které ještě nejsou přiřazené k výnosu" warn={Math.abs(open.revenue) > 0.5} />
        <Tile label="Přiřazeno řádků" value={`${doneCount} z ${booked.length}`} hint="řádky přiřazené celé" />
        <Tile label="Oprava — k odeslání účtárně" value={String(fixSummary.toSend)} hint="řádky označené jako OPRAVA, které ještě nebyly odeslány účtárně" warn={fixSummary.toSend > 0} />
        <Tile label="Oprava — čeká na účtárnu" value={fixSummary.waiting > 0 ? `${fixSummary.waiting}${fixSummary.oldestWaitingDays !== undefined ? ` (nejdéle ${fixSummary.oldestWaitingDays} d)` : ''}` : '0'} hint="odesláno účtárně, čeká na opravu v Abře; po opravě řádek při dalším stažení zmizí a oprava se uzavře" warn={fixSummary.waiting > 0} />
        <Tile label="Zálohy přijaté / vydané" value={`${formatMoney(adv.received, report.currency)} / ${formatMoney(adv.issued, report.currency)}`} hint="jen přehled, do Nakoupeno ani Vyfakturováno se nezapočítávají" />
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
        <ChoiceGroup
          label="Zobrazit"
          selectedKey={show}
          options={[
            { key: 'all', text: 'Vše' },
            { key: 'open', text: 'Jen nepřiřazené' },
            { key: 'done', text: 'Jen přiřazené' },
            { key: 'fix', text: 'K opravě' }
          ]}
          onChange={(_, o) => o && setShow(o.key as ShowFilter)}
          styles={{ flexContainer: { display: 'flex', gap: 14 }, root: { minWidth: 430 } }}
        />
        <Dropdown
          label="Druh"
          selectedKey={kind}
          options={[
            { key: 'all', text: 'Všechny' },
            { key: 'prijata', text: 'Faktury přijaté' },
            { key: 'vydana', text: 'Faktury vydané' },
            { key: 'zaloha', text: 'Zálohy' }
          ]}
          onChange={(_, o) => o && setKind(o.key as KindFilter)}
          styles={{ root: { width: 170 } }}
        />
        <SearchBox placeholder="Hledat doklad, partnera, popis, účet…" value={search} onChange={(_, v) => setSearch(v ?? '')} onClear={() => setSearch('')} styles={{ root: { width: 300 } }} />
        <span style={{ fontSize: 12, color: RES.gray, paddingBottom: 8 }}>
          Zobrazeno {filtered.length} z {rows.length}
        </span>
      </div>
      <Legend />

      <div style={{ border: `1px solid ${RES.grayBlue}`, borderRadius: 4, background: RES.white, maxHeight: 'calc(100vh - 380px)', minHeight: 160, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1050 }}>
          <thead>
            <tr>
              <th style={TH}>Datum</th>
              <th style={TH}>Doklad</th>
              <th style={TH}>Partner / popis</th>
              <th style={TH}>Účet</th>
              <th style={{ ...TH, textAlign: 'right' }}>Částka bez DPH</th>
              <th style={TH}>Přiřazeno k položce rozpočtu</th>
              <th style={TH} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const state = assignStateOf(row, allocations);
              const style = ROW_STYLE[state];
              const k = targetKindOf(row);
              const own = (allocations || []).filter((a) => a.docId === row.abraId);
              const single = own.length === 1 ? own[0] : undefined;
              const left = Math.round((row.amountNet - allocatedOfDoc(allocations, row.abraId)) * 100) / 100;
              const fix = openFix.get(row.abraId);
              return (
                <tr key={row.abraId} style={{ background: fix ? '#FDE4CF' : style.background, borderTop: `1px solid ${RES.background}`, borderLeft: `4px solid ${fix ? '#D9822B' : style.border}` }}>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>{row.issueDate ? formatDate(row.issueDate) : '—'}</td>
                  <td style={TD}>
                    <strong>{row.number}</strong>
                    <div style={{ color: RES.gray, fontSize: 12 }}>{ABRA_DOC_LABELS[row.type]}</div>
                  </td>
                  <td style={TD} title={row.description}>
                    {row.partnerName || '—'}
                    {row.description && <div style={{ color: RES.gray, fontSize: 12, maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.description}</div>}
                  </td>
                  <td style={TD}>{row.accounts && row.accounts.length > 0 ? row.accounts.join(', ') : '—'}</td>
                  <td style={{ ...TD, textAlign: 'right', whiteSpace: 'nowrap', color: row.amountNet < 0 ? RES.red : RES.text }}>{formatMoney(row.amountNet, row.currency)}
                    {row.currency !== 'CZK' && row.amountNetCzk !== undefined && <div style={{ color: RES.gray, fontSize: 12, fontWeight: 400 }} title="Částka v Kč, jak ji zaúčtovala Abra (kurz dne zaúčtování)">účetně {formatMoney(row.amountNetCzk, 'CZK')}</div>}
                  </td>
                  <td style={{ ...TD, minWidth: 300 }}>
                    {fix ? (
                      <div>
                        <strong style={{ color: '#8A4B12' }}>OPRAVA — {fix.status === 'Odesláno' ? `odesláno účtárně ${fix.sentAt ? formatDate(fix.sentAt) : ''}` : 'čeká na odeslání účtárně'}</strong>
                        <div style={{ fontSize: 12, color: RES.text, whiteSpace: 'pre-wrap' }}>{fix.note}</div>
                        <div style={{ fontSize: 12, color: RES.gray }}>Řádek se nezapočítává; označil {fix.markedByName}{fix.markedAt ? `, ${formatDate(fix.markedAt)}` : ''}.</div>
                      </div>
                    ) : state === 'advance' ? (
                      <span style={{ color: RES.gray }}>Záloha — jen přehled, nepřiřazuje se</span>
                    ) : own.length > 1 ? (
                      <div>
                        <strong>Rozděleno ({own.length})</strong>
                        <div style={{ fontSize: 12, color: RES.gray }}>{own.map((a) => `${targetLabel(doc, a.kind, a.targetId)} (${formatMoney(a.amount, a.currency)})`).join('; ')}</div>
                      </div>
                    ) : (
                      <Dropdown
                        ariaLabel={`Přiřadit řádek ${row.number}`}
                        selectedKey={single ? single.targetId : UNASSIGNED_KEY}
                        options={k ? targetOptions(doc, k) : []}
                        disabled={!assignable}
                        onChange={(_, o) => o && change(row, String(o.key))}
                        styles={{ root: { minWidth: 280 } }}
                      />
                    )}
                    {single && isApproximate(row, targetCurrency(doc, single.kind, single.targetId)) && (
                      <div style={{ fontSize: 12, color: RES.amber }} title="Doklad a položka jsou v různých měnách a účetnictví nemá částku v měně položky — přepočítává se kurzem ČNB.">
                        Přepočteno kurzem ČNB (orientačně): položka je v {targetCurrency(doc, single.kind, single.targetId)}, doklad v {row.currency}
                      </div>
                    )}
                    {state === 'partial' && <div style={{ fontSize: 12, color: RES.amber }}>Přiřazena jen část — zbývá {formatMoney(left, row.currency)}</div>}
                  </td>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                    {assignable && state !== 'advance' && !fix && <ActionButton text="Rozdělit…" title="Rozdělit částku mezi víc položek" onClick={() => setSplitRow(row)} styles={{ root: { height: 28 } }} />}
                    {assignable && state !== 'advance' && !fix && <ActionButton text="Oprava…" iconProps={{ iconName: 'Edit' }} title="Řádek nepatří do projektu — označit jako OPRAVU a odeslat účtárně" onClick={() => setMarkRow(row)} styles={{ root: { height: 28 } }} />}
                    {assignable && fix && <ActionButton text="Zrušit označení" title="Omyl — řádek se vrátí mezi nepřiřazené" onClick={() => cancelFix(fix)} styles={{ root: { height: 28 } }} />}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...TD, color: RES.gray, padding: 14 }}>
                  {rows.length === 0 ? 'Pro tento projekt zatím nejsou z Abry stažené žádné řádky. Zakázka v Abře musí odpovídat číslu projektu.' : 'Filtru neodpovídá žádný řádek.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: RES.gray, marginTop: 6 }}>
        Součet přiřazených řádků je u položky rozpočtu <strong>Nakoupeno</strong> (u výnosu <strong>Vyfakturováno</strong>). Přiřazení můžete kdykoli změnit nebo zrušit.
      </div>
      {markRow && <MarkFixDialog row={markRow} onMark={(note) => markFix(markRow, note)} onClose={() => setMarkRow(undefined)} />}
      {sendOpen && <SendFixDialog corrections={toSendList} to={settings.company.accountingEmail.trim()} onSend={send} onClose={() => setSendOpen(false)} />}
      {splitRow && <SplitDocDialog row={splitRow} doc={doc} onSave={(d) => { setDoc(d); setSplitRow(undefined); }} onClose={() => setSplitRow(undefined)} />}
    </div>
  );
};

/** Měna položky nebo výnosu, ke kterému je řádek přiřazen. */
function targetCurrency(doc: BudgetDoc, kind: 'item' | 'revenue', id: string): CurrencyCode {
  if (kind === 'revenue') {
    const l = (doc.revenues || []).filter((x) => x.id === id)[0];
    return l ? l.currency : 'CZK';
  }
  const i = doc.items.filter((x) => x.id === id)[0];
  const g = i ? doc.groups.filter((x) => x.id === i.groupId)[0] : undefined;
  return i && !(g && g.kind === 'rezerva' && i.reservePercent !== undefined) ? i.currency : 'CZK';
}

const Tile: React.FC<{ label: string; value: string; hint?: string; warn?: boolean }> = ({ label, value, hint, warn }) => (
  <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderLeft: `4px solid ${warn ? RES.amber : RES.grayBlue}`, borderRadius: 4, padding: '6px 12px', minWidth: 150, flex: '1 1 200px' }} title={hint}>
    <div style={{ fontSize: 12, color: RES.gray }}>{label}</div>
    <div style={{ fontSize: 16, fontWeight: 600, color: RES.navy }}>{value}</div>
  </div>
);

const Legend: React.FC = () => (
  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: RES.gray, marginBottom: 6 }}>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 14, height: 14, background: '#FDE4CF', border: `1px solid ${RES.grayBlue}`, borderLeft: '4px solid #D9822B', display: 'inline-block' }} />
      OPRAVA (nezapočítává se)
    </span>
    {(
      [
        ['full', 'přiřazeno'],
        ['partial', 'přiřazeno jen částečně'],
        ['none', 'nepřiřazeno'],
        ['advance', 'záloha (nezapočítává se)']
      ] as [DocAssignState, string][]
    ).map(([s, t]) => (
      <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 14, height: 14, background: ROW_STYLE[s].background, borderLeft: `4px solid ${ROW_STYLE[s].border}`, border: `1px solid ${RES.grayBlue}`, borderLeftWidth: 4, display: 'inline-block' }} />
        {t}
      </span>
    ))}
  </div>
);

/** Dialog „Označit jako opravu“: popis, co je špatně a kam řádek patří. */
const MarkFixDialog: React.FC<{ row: AbraDoc; onMark: (note: string) => Promise<void>; onClose: () => void }> = ({ row, onMark, onClose }) => {
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  return (
    <Dialog hidden={false} onDismiss={busy ? undefined : onClose} dialogContentProps={{ type: DialogType.normal, title: `Označit jako OPRAVU — ${row.number}`, subText: 'Řádek nepatří do tohoto projektu (nebo je špatně zaúčtovaný). Po označení se přestane započítávat; odešlete ho účtárně tlačítkem Odeslat účtárně.' }} modalProps={{ isBlocking: true }} minWidth={560}>
      <div style={{ fontSize: 13, marginBottom: 8 }}>
        <strong>{row.partnerName || '—'}</strong> · {row.description || '—'} · {formatMoney(row.amountNet, row.currency)}
      </div>
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      <TextField label="Popis opravy (co je špatně, kam doklad patří)" required multiline rows={4} value={note} onChange={(_, v) => setNote(v ?? '')} />
      <DialogFooter>
        <PrimaryButton
          text={busy ? 'Ukládám…' : 'Označit jako opravu'}
          disabled={busy}
          onClick={() => {
            const problem = correctionNoteProblem(note);
            if (problem) {
              setError(problem);
              return;
            }
            setBusy(true);
            setError(undefined);
            onMark(note).catch((e: unknown) => {
              setBusy(false);
              setError(e instanceof Error ? e.message : String(e));
            });
          }}
        />
        <DefaultButton text="Zrušit" disabled={busy} onClick={onClose} />
      </DialogFooter>
    </Dialog>
  );
};

/** Potvrzení odeslání oprav účtárně: seznam řádků a adresa. */
const SendFixDialog: React.FC<{ corrections: AbraCorrection[]; to: string; onSend: () => Promise<void>; onClose: () => void }> = ({ corrections, to, onSend, onClose }) => {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  return (
    <Dialog hidden={false} onDismiss={busy ? undefined : onClose} dialogContentProps={{ type: DialogType.normal, title: `Odeslat účtárně (${corrections.length})`, subText: to ? `Jedním e-mailem odejde na ${to} (kopie Vám) žádost o opravu těchto řádků:` : 'V Nastavení není vyplněný e-mail účtárny — doplňte ho, jinak nejde odeslat.' }} modalProps={{ isBlocking: true }} minWidth={560}>
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      <div style={{ fontSize: 13 }}>
        {corrections.map((c) => (
          <div key={c.id} style={{ marginBottom: 6 }}>
            <strong>{c.docNumber}</strong> — {c.line.partnerName || '—'}, {formatMoney(c.line.amountNet, c.line.currency)}
            <div style={{ color: RES.gray, whiteSpace: 'pre-wrap' }}>{c.note}</div>
          </div>
        ))}
      </div>
      <DialogFooter>
        <PrimaryButton
          text={busy ? 'Odesílám…' : 'Odeslat účtárně'}
          disabled={busy || !to}
          onClick={() => {
            setBusy(true);
            setError(undefined);
            onSend().catch((e: unknown) => {
              setBusy(false);
              setError(e instanceof Error ? e.message : String(e));
            });
          }}
        />
        <DefaultButton text="Zrušit" disabled={busy} onClick={onClose} />
      </DialogFooter>
    </Dialog>
  );
};
