/**
 * Záložka „Data z účetnictví“: řádky stažené z ABRA Flexi (faktura nebo její část, resp. zápis z účetního deníku — popis, účet,
 * projekt, částka). Projektový manažer je přiřazuje k položkám nákupu (přijaté) a k výnosům (vydané), kdykoli může položku změnit
 * nebo řádek vrátit mezi nepřiřazené. Přiřazené řádky jsou obarvené, jde filtrovat jen nepřiřazené. Zálohy se ukazují, ale
 * nepřiřazují se a do součtů se nezapočítávají. Přiřazení se ukládá v rozpočtu projektu.
 */

import * as React from 'react';
import { ActionButton, DefaultButton } from '@fluentui/react/lib/Button';
import { ChoiceGroup } from '@fluentui/react/lib/ChoiceGroup';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { CurrencySwitch } from '../../ui/components/CurrencySwitch';
import { useReportCurrency } from '../../ui/useReportCurrency';
import { Project } from '../../core/types';
import { formatDate, formatDateTime, formatMoney } from '../../core/format';
import { toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { BudgetDoc, BudgetRecord, budgetTotals, canEditBudget, validateBudget } from '../../core/budget';
import { ensureRevenues } from '../../core/budgetMargin';
import { ABRA_DOC_LABELS, AbraDoc, DocAssignState, abraRowMatches, advanceSummary, allocatedOfDoc, assignStateOf, isAdvance, orphanAllocations, setDocTarget, targetKindOf, unallocatedTotals } from '../../core/abraDocs';
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

type ShowFilter = 'all' | 'open' | 'done';
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
        void refreshBudgetCache(repos, projectRef.current, settings, ratesRef.current);
      }
    },
    onError: (m) => setAutoError(m)
  });

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

  const filtered = React.useMemo(
    () =>
      rows
        .filter((r) => {
          const state = assignStateOf(r, allocations);
          if (show === 'open' && state !== 'none' && state !== 'partial') {
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
    [rows, allocations, show, kind, search]
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
  const open = unallocatedTotals(rows, allocations, report.currency, report.rates);
  const adv = advanceSummary(rows, report.currency, report.rates);
  const orphans = orphanAllocations(rows, allocations);
  const booked = rows.filter((r) => !isAdvance(r));
  const doneCount = booked.filter((r) => assignStateOf(r, allocations) === 'full').length;

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
        <Tile label="Zálohy přijaté / vydané" value={`${formatMoney(adv.received, report.currency)} / ${formatMoney(adv.issued, report.currency)}`} hint="jen přehled, do Nakoupeno ani Vyfakturováno se nezapočítávají" />
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
        <ChoiceGroup
          label="Zobrazit"
          selectedKey={show}
          options={[
            { key: 'all', text: 'Vše' },
            { key: 'open', text: 'Jen nepřiřazené' },
            { key: 'done', text: 'Jen přiřazené' }
          ]}
          onChange={(_, o) => o && setShow(o.key as ShowFilter)}
          styles={{ flexContainer: { display: 'flex', gap: 14 }, root: { minWidth: 330 } }}
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
              return (
                <tr key={row.abraId} style={{ background: style.background, borderTop: `1px solid ${RES.background}`, borderLeft: `4px solid ${style.border}` }}>
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
                  <td style={{ ...TD, textAlign: 'right', whiteSpace: 'nowrap', color: row.amountNet < 0 ? RES.red : RES.text }}>{formatMoney(row.amountNet, row.currency)}</td>
                  <td style={{ ...TD, minWidth: 300 }}>
                    {state === 'advance' ? (
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
                    {state === 'partial' && <div style={{ fontSize: 12, color: RES.amber }}>Přiřazena jen část — zbývá {formatMoney(left, row.currency)}</div>}
                  </td>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>{assignable && state !== 'advance' && <ActionButton text="Rozdělit…" title="Rozdělit částku mezi víc položek" onClick={() => setSplitRow(row)} styles={{ root: { height: 28 } }} />}</td>
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
      {splitRow && <SplitDocDialog row={splitRow} doc={doc} onSave={(d) => { setDoc(d); setSplitRow(undefined); }} onClose={() => setSplitRow(undefined)} />}
    </div>
  );
};

const Tile: React.FC<{ label: string; value: string; hint?: string; warn?: boolean }> = ({ label, value, hint, warn }) => (
  <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderLeft: `4px solid ${warn ? RES.amber : RES.grayBlue}`, borderRadius: 4, padding: '6px 12px', minWidth: 150, flex: '1 1 200px' }} title={hint}>
    <div style={{ fontSize: 12, color: RES.gray }}>{label}</div>
    <div style={{ fontSize: 16, fontWeight: 600, color: RES.navy }}>{value}</div>
  </div>
);

const Legend: React.FC = () => (
  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: RES.gray, marginBottom: 6 }}>
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
