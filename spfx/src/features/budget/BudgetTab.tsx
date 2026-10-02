/**
 * Záložka Realizační rozpočet v detailu projektu: verze rozpočtu (Koncept → Ke schválení → Schváleno = baseline), editovatelná
 * tabulka skupin a položek (nákup, přirážka, prodej, marže), souhrn proti smluvní ceně, vložení z Excelu a export do CSV.
 *
 * Co smí člověk udělat, rozhoduje `core/budget`; skutečná kontrola probíhá znovu v datové vrstvě při zápisu.
 */

import * as React from 'react';
import { ActionButton, DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { TextField } from '@fluentui/react/lib/TextField';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { CurrencySwitch } from '../../ui/components/CurrencySwitch';
import { useReportCurrency } from '../../ui/useReportCurrency';
import { Project } from '../../core/types';
import { formatDate, formatMoney } from '../../core/format';
import { convertAmount } from '../../core/currency';
import { toActor, toWorkflowProject } from '../../core/orderWorkflow';
import {
  BudgetAction,
  BudgetDoc,
  BudgetGroup,
  BudgetItem,
  BudgetVersion,
  BudgetVersionStatus,
  addGroup,
  availableBudgetActions,
  baselineOf,
  budgetTotals,
  canApproveBudget,
  emptyBudget,
  itemCost,
  itemMarkup,
  itemSale,
  latestVersion,
  marginPercent,
  removeGroup,
  validateBudget
} from '../../core/budget';
import { BudgetHistoryEntry } from '../../data/repositories';
import { BudgetGrid, pct } from './BudgetGrid';
import { BudgetImportDialog } from './BudgetImportDialog';

const STATUS_COLOR: Record<BudgetVersionStatus, { bg: string; fg: string }> = {
  [BudgetVersionStatus.Koncept]: { bg: '#E8EDF2', fg: '#3F4A57' },
  [BudgetVersionStatus.KeSchvaleni]: { bg: '#FFF1CC', fg: '#7A5A00' },
  [BudgetVersionStatus.Schvaleno]: { bg: '#D6F2E1', fg: '#116B3A' }
};

const StatusBadge: React.FC<{ status: BudgetVersionStatus; baseline?: boolean }> = ({ status, baseline }) => (
  <span style={{ background: STATUS_COLOR[status].bg, color: STATUS_COLOR[status].fg, borderRadius: 10, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
    {status}
    {baseline ? ' · baseline' : ''}
  </span>
);

const Tile: React.FC<{ label: string; value: string; hint?: string; warn?: boolean }> = ({ label, value, hint, warn }) => (
  <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderLeft: `4px solid ${warn ? RES.red : RES.green}`, borderRadius: 4, padding: '8px 12px', minWidth: 150, flex: '1 1 150px' }}>
    <div style={{ fontSize: 12, color: RES.gray }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 600, color: RES.navy }}>{value}</div>
    {hint && <div style={{ fontSize: 11, color: RES.gray }}>{hint}</div>}
  </div>
);

type DialogState = { kind: 'approve' | 'return'; text: string } | { kind: 'group'; group: BudgetGroup } | { kind: 'newGroup'; name: string } | undefined;

export const BudgetTab: React.FC<{ project: Project }> = ({ project }) => {
  const { repos, settings, user } = useApp();
  const report = useReportCurrency();
  const actor = React.useMemo(() => toActor(user), [user]);
  const wf = React.useMemo(() => toWorkflowProject(project), [project]);

  const [versions, setVersions] = React.useState<BudgetVersion[] | undefined>(undefined);
  const [selectedId, setSelectedId] = React.useState<number | undefined>(undefined);
  const [doc, setDoc] = React.useState<BudgetDoc | undefined>(undefined);
  const [saved, setSaved] = React.useState<string>('');
  const [etag, setEtag] = React.useState<string | undefined>(undefined);
  const [history, setHistory] = React.useState<BudgetHistoryEntry[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [issues, setIssues] = React.useState<string[]>([]);
  const [notice, setNotice] = React.useState<string | undefined>(undefined);
  const [dialog, setDialog] = React.useState<DialogState>(undefined);
  const [importOpen, setImportOpen] = React.useState(false);

  const version = (versions ?? []).filter((v) => v.id === selectedId)[0];
  const latest = versions ? latestVersion(versions) : undefined;
  const baseline = versions ? baselineOf(versions) : undefined;
  const actions: BudgetAction[] = versions ? availableBudgetActions(version, !!version && !!latest && version.id === latest.id, wf, actor) : [];
  const editable = !!version && actions.indexOf('edit') !== -1;
  const dirty = !!doc && JSON.stringify(doc) !== saved;
  const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

  const loadContent = React.useCallback(
    async (id: number): Promise<void> => {
      const c = await repos.budgets.getContent(id);
      setDoc(c.doc);
      setSaved(JSON.stringify(c.doc));
      setEtag(c.etag);
      repos.budgets
        .history(id)
        .then(setHistory)
        .catch(() => setHistory([]));
    },
    [repos]
  );

  const loadVersions = React.useCallback(
    async (preferId?: number): Promise<void> => {
      const list = await repos.budgets.listVersions(project.projectNumber);
      setVersions(list);
      const pick = list.filter((v) => v.id === preferId)[0] ?? list[0];
      setSelectedId(pick ? pick.id : undefined);
      if (pick) {
        await loadContent(pick.id);
      } else {
        setDoc(undefined);
      }
    },
    [repos, project.projectNumber, loadContent]
  );

  React.useEffect(() => {
    let cancelled = false;
    setError(undefined);
    loadVersions()
      .catch((e: unknown) => !cancelled && setError(why(e)))
      .then(() => undefined)
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loadVersions]);

  const run = (job: () => Promise<void>): void => {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    job()
      .catch((e: unknown) => setError(why(e)))
      .then(() => setBusy(false))
      .catch(() => setBusy(false));
  };

  const totalsOf = (d: BudgetDoc): { totalCost: number; totalSale: number } => {
    const t = budgetTotals(d, (a, c) => convertAmount(a, c, 'CZK', report.rates));
    return { totalCost: t.cost, totalSale: t.sale };
  };

  const save = async (): Promise<void> => {
    if (!version || !doc) {
      return;
    }
    await repos.budgets.saveContent(version.id, doc, totalsOf(doc), user, etag);
    await loadVersions(version.id);
  };

  const create = (): void =>
    run(async () => {
      const source = baseline && version ? (await repos.budgets.getContent(baseline.id)).doc : undefined;
      const start = source ?? emptyBudget(settings.budget.categories);
      const v = await repos.budgets.createVersion(project.projectNumber, start, totalsOf(start), user);
      await loadVersions(v.id);
      setNotice(source ? `Založena verze ${v.versionNo} jako kopie schválené verze ${baseline ? baseline.versionNo : ''}. Úpravy se projeví až po novém schválení.` : 'Rozpočet je založený. Přidávejte položky, nebo vložte tabulku z Excelu.');
    });

  const submit = (): void => {
    if (!doc) {
      return;
    }
    const found = validateBudget(doc, true);
    if (found.length > 0) {
      setIssues(found.map((i) => i.message));
      return;
    }
    setIssues([]);
    run(async () => {
      if (version && dirty) {
        await save();
      }
      if (version) {
        const v = await repos.budgets.submit(version.id, user);
        await loadVersions(v.id);
        setNotice('Rozpočet je odeslaný ke schválení vedení. Do schválení ho nejde upravovat (vedení ho může vrátit, vy stáhnout zpět).');
      }
    });
  };

  const confirmDialog = (): void => {
    const d = dialog;
    setDialog(undefined);
    if (!d || !version || !doc) {
      return;
    }
    if (d.kind === 'group') {
      setDoc(removeGroup(doc, d.group.id));
      return;
    }
    if (d.kind === 'newGroup') {
      if (d.name.trim() !== '') {
        setDoc(addGroup(doc, d.name.trim(), 0));
      }
      return;
    }
    run(async () => {
      const v = d.kind === 'approve' ? await repos.budgets.approve(version.id, d.text.trim() || undefined, user) : await repos.budgets.returnToDraft(version.id, d.text, user);
      await loadVersions(v.id);
      setNotice(d.kind === 'approve' ? `Verze ${v.versionNo} je schválená a je z ní baseline projektu.` : 'Rozpočet je vrácený do konceptu.');
    });
  };

  const exportCsv = (): void => {
    if (!doc) {
      return;
    }
    const head = ['Skupina', 'Popis', 'Dodavatel', 'Kategorie', 'Měna', 'Množství', 'MJ', 'Nákup za MJ', 'Nákup celkem', 'Přirážka %', 'Prodej celkem', 'Marže %'];
    const n = (v: number): string => String(v).replace('.', ',');
    const q = (s: string): string => `"${s.replace(/"/g, '""')}"`;
    const lines = [head.map(q).join(';')];
    doc.groups.forEach((g) => {
      doc.items
        .filter((i) => i.groupId === g.id)
        .forEach((i: BudgetItem) => {
          const c = itemCost(i);
          const s = itemSale(i, g);
          lines.push([q(g.name), q(i.description), q(i.supplier ?? ''), q(i.category ?? ''), i.currency, n(i.quantity), q(i.unit ?? ''), n(i.unitCost), n(c), n(itemMarkup(i, g)), n(s), n(marginPercent(c, s))].join(';'));
        });
    });
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Rozpocet_${project.projectNumber}_v${version ? version.versionNo : 1}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // --- zobrazení ---

  if (project.isOverhead) {
    return <MessageBar messageBarType={MessageBarType.info}>Na projekt Režie se realizační rozpočet nevede.</MessageBar>;
  }
  if (!versions && !error) {
    return <Spinner size={SpinnerSize.medium} label="Načítám rozpočet…" />;
  }

  const totals = doc ? budgetTotals(doc, (a, c) => report.convert(a, c)) : undefined;
  const contract = project.contractPriceNet !== undefined ? report.convert(project.contractPriceNet, project.currency) : undefined;
  const contractMargin = contract !== undefined && totals ? marginPercent(totals.cost, contract) : undefined;
  const minMargin = settings.budget.minimumMarginPercent;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        {versions && versions.length > 0 && (
          <Dropdown
            ariaLabel="Verze rozpočtu"
            selectedKey={selectedId}
            disabled={busy || dirty}
            title={dirty ? 'Nejdřív uložte změny' : undefined}
            options={versions.map((v) => ({ key: v.id, text: `Verze ${v.versionNo} · ${v.status}${baseline && baseline.id === v.id ? ' (baseline)' : ''}` }))}
            onChange={(_, o) => {
              if (o) {
                setSelectedId(Number(o.key));
                run(() => loadContent(Number(o.key)));
              }
            }}
            styles={{ root: { width: 260 } }}
          />
        )}
        {version && <StatusBadge status={version.status} baseline={!!baseline && baseline.id === version.id} />}
        {version && version.status === BudgetVersionStatus.Schvaleno && version.approvedByName && (
          <span style={{ fontSize: 12, color: RES.gray }}>
            schválil {version.approvedByName}
            {version.approvedAt ? `, ${formatDate(version.approvedAt)}` : ''}
          </span>
        )}
        <span style={{ flex: '1 1 auto' }} />
        <CurrencySwitch />
      </div>

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
      {version && version.status === BudgetVersionStatus.Koncept && version.comment && (
        <MessageBar messageBarType={MessageBarType.severeWarning} isMultiline>
          <strong>Vedení rozpočet vrátilo:</strong> {version.comment}
        </MessageBar>
      )}

      {versions && versions.length === 0 && (
        <MessageBar
          messageBarType={MessageBarType.info}
          isMultiline
          actions={
            actions.indexOf('newVersion') !== -1 ? (
              <div>
                <PrimaryButton text="Založit rozpočet" disabled={busy} onClick={create} />
              </div>
            ) : undefined
          }
        >
          Tento projekt zatím nemá realizační rozpočet.{' '}
          {actions.indexOf('newVersion') !== -1 ? 'Založte ho — vznikne s kategoriemi z Nastavení jako skupinami; položky přidáte po jedné, nebo vložíte z Excelu.' : 'Založit ho smí projektový manažer, asistent nebo vedení.'}
        </MessageBar>
      )}

      {doc && totals && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '10px 0' }}>
            <Tile label={`Nákup celkem (${report.label})`} value={formatMoney(totals.cost, report.currency)} hint="náklady rozpočtu" />
            <Tile label={`Prodej celkem (${report.label})`} value={formatMoney(totals.sale, report.currency)} hint={`přirážka ${pct(totals.markupPercent)}`} />
            <Tile label="Marže z prodeje" value={pct(totals.marginPercent)} hint="podíl zisku na prodeji (součet položek)" warn={totals.sale > 0 && totals.marginPercent < minMargin} />
            {contract !== undefined && (
              <Tile
                label="Smluvní cena projektu"
                value={formatMoney(contract, report.currency)}
                hint={contractMargin !== undefined ? `plánovaná marže ${pct(contractMargin)} (min. ${pct(minMargin)})` : undefined}
                warn={contractMargin !== undefined && contractMargin < minMargin}
              />
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            {editable && (
              <>
                <PrimaryButton text={busy ? 'Pracuji…' : dirty ? 'Uložit rozpočet' : 'Uloženo'} disabled={busy || !dirty} onClick={() => run(save)} />
                <ActionButton iconProps={{ iconName: 'Add' }} text="Přidat skupinu" disabled={busy} onClick={() => setDialog({ kind: 'newGroup', name: '' })} />
                <ActionButton iconProps={{ iconName: 'Paste' }} text="Vložit z Excelu" disabled={busy} onClick={() => setImportOpen(true)} />
              </>
            )}
            <ActionButton iconProps={{ iconName: 'Download' }} text="Export do CSV" onClick={exportCsv} />
            <span style={{ flex: '1 1 auto' }} />
            {actions.indexOf('submit') !== -1 && <DefaultButton text="Odeslat ke schválení" disabled={busy} onClick={submit} />}
            {actions.indexOf('approve') !== -1 && <PrimaryButton text="Schválit (baseline)" disabled={busy} onClick={() => setDialog({ kind: 'approve', text: '' })} />}
            {actions.indexOf('return') !== -1 && (
              <DefaultButton text={canApproveBudget(actor) ? 'Vrátit k úpravě' : 'Stáhnout zpět'} disabled={busy} onClick={() => (canApproveBudget(actor) ? setDialog({ kind: 'return', text: '' }) : run(async () => {
                if (version) {
                  const v = await repos.budgets.returnToDraft(version.id, '', user);
                  await loadVersions(v.id);
                }
              }))} />
            )}
            {actions.indexOf('newVersion') !== -1 && versions && versions.length > 0 && <DefaultButton text="Nová verze (úprava)" disabled={busy} onClick={create} />}
          </div>
          {issues.length > 0 && (
            <MessageBar messageBarType={MessageBarType.warning} isMultiline onDismiss={() => setIssues([])}>
              <strong>Nejde odeslat — něco chybí:</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {issues.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </MessageBar>
          )}

          <BudgetGrid doc={doc} onChange={setDoc} editable={editable && !busy} categories={settings.budget.categories} report={report} onRemoveGroup={(g) => setDialog({ kind: 'group', group: g })} />

          <div style={{ fontSize: 12, color: RES.gray, marginTop: 8 }}>
            Výchozí je nákup. Prodej = nákup × (1 + přirážka). Přirážku zadáváte u skupiny (platí pro její položky) nebo u položky; můžete místo toho zadat rovnou prodejní cenu a přirážka se dopočte.
            Marže je podíl zisku na prodeji, tedy menší číslo než přirážka (přirážka 20 % = marže 16,7 %). Částky se přepočítávají kurzem ČNB.
          </div>

          {history.length > 0 && (
            <div style={{ marginTop: 14, background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '8px 12px' }}>
              <div style={{ fontWeight: 600, color: RES.navy, marginBottom: 4 }}>Historie verze</div>
              {history.map((h, i) => (
                <div key={i} style={{ fontSize: 13 }}>
                  <strong>{h.action}</strong> — {h.byName}
                  {h.at ? `, ${formatDate(h.at)}` : ''}
                </div>
              ))}
            </div>
          )}
        </>
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
            title:
              dialog.kind === 'approve'
                ? 'Schválit rozpočet'
                : dialog.kind === 'return'
                ? 'Vrátit rozpočet k úpravě'
                : dialog.kind === 'group'
                ? 'Smazat skupinu'
                : 'Nová skupina'
          }}
          modalProps={{ isBlocking: true }}
        >
          {dialog.kind === 'group' && <div style={{ fontSize: 13 }}>Skupina „{dialog.group.name}“ se smaže i se všemi svými položkami (změna se uloží až tlačítkem Uložit rozpočet).</div>}
          {dialog.kind === 'newGroup' && <TextField label="Název skupiny" autoFocus value={dialog.name} onChange={(_, v) => setDialog({ kind: 'newGroup', name: v ?? '' })} />}
          {(dialog.kind === 'approve' || dialog.kind === 'return') && (
            <TextField
              label={dialog.kind === 'approve' ? 'Poznámka ke schválení (nepovinná)' : 'Důvod vrácení (povinný)'}
              multiline
              rows={3}
              autoFocus
              value={dialog.text}
              onChange={(_, v) => setDialog({ kind: dialog.kind as 'approve' | 'return', text: v ?? '' })}
            />
          )}
          <DialogFooter>
            <PrimaryButton
              text={dialog.kind === 'approve' ? 'Schválit' : dialog.kind === 'return' ? 'Vrátit' : dialog.kind === 'group' ? 'Smazat' : 'Přidat'}
              disabled={(dialog.kind === 'return' && dialog.text.trim() === '') || (dialog.kind === 'newGroup' && dialog.name.trim() === '')}
              onClick={confirmDialog}
            />
            <DefaultButton text="Zpět" onClick={() => setDialog(undefined)} />
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
};
