/**
 * Harmonogram projektu (Fáze 4, krok 4a): tabulka úkolů se závislostmi, výpočtem termínů a kritickou cestou (CPM).
 * Gantt se vykresluje v dalším kroku; pravidla výpočtu jsou v `core/schedule.ts` a řádky v `core/scheduleRows.ts`.
 *
 * Úkol s předchůdci má termíny vypočtené (zahájení se nezadává), úkol bez předchůdců má zahájení zadané. Smluvní termín
 * (Termíny) je v harmonogramu úkol s příznakem „smluvní“ a nejzazším datem; výpočet ukáže, jestli se stíhá.
 */

import * as React from 'react';
import { PrimaryButton, DefaultButton, IconButton } from '@fluentui/react/lib/Button';
import { Checkbox } from '@fluentui/react/lib/Checkbox';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { DraftBanner } from '../../ui/components/DraftBanner';
import { StickyHScroll } from '../../ui/components/StickyHScroll';
import { GanttChart } from './GanttChart';
import { ScheduleExportRow, scheduleCsv, scheduleFileName } from '../../core/scheduleExport';
import { GanttItem, linksFromDeps } from '../../core/ganttLayout';
import { GanttOp, addLink, applyOp, linkOf, makeRow, removeLink, reorderRows, updateLink } from '../../core/ganttEdit';
import { DependencyType } from '../../core/schedule';
import { useFormDraft } from '../../ui/useFormDraft';
import { draftKey } from '../../core/drafts';
import { canEditProject } from '../../core/roles';
import { formatDate } from '../../core/format';
import { Project, ProjectTask, TaskType } from '../../core/types';
import { workdaysBetween, CZECH_WORKDAYS } from '../../core/workCalendar';
import {
  ScheduleRow,
  buildScheduleModel,
  fixBaseline,
  nextWbs,
  removeRowReferences,
  renumberRows,
  rowToTaskInput,
  rowsFromTasks,
  validateScheduleRows
} from '../../core/scheduleRows';

const TYPES: TaskType[] = [TaskType.Cinnost, TaskType.DodavkaMaterialu, TaskType.Sluzba, TaskType.Milnik];

const INPUT: React.CSSProperties = {
  boxSizing: 'border-box',
  height: 28,
  padding: '0 6px',
  border: `1px solid ${RES.grayBlue}`,
  borderRadius: 2,
  fontSize: 13,
  fontFamily: 'inherit',
  color: RES.text,
  background: RES.white,
  width: '100%'
};
const TH: React.CSSProperties = { textAlign: 'left', padding: '6px 6px', fontSize: 12, fontWeight: 600, color: RES.gray, whiteSpace: 'nowrap', background: RES.white, position: 'sticky', top: 0, zIndex: 2 };
const TD: React.CSSProperties = { padding: '3px 4px', borderTop: `1px solid ${RES.background}`, verticalAlign: 'middle' };

const toInput = (d: Date | undefined): string => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '');
const fromInput = (v: string): Date | undefined => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)) : undefined;
};

let counter = 0;
const newKey = (): string => `n${Date.now().toString(36)}${counter++}`;

export const ScheduleTab: React.FC<{ project: Project }> = ({ project }) => {
  const { repos, user, settings } = useApp();
  const mayEdit = canEditProject(user.roles, user.loginName, { projectManagerLogin: project.projectManagerLogin, assistantLogins: project.assistantLogins });

  const [original, setOriginal] = React.useState<ProjectTask[] | undefined>(undefined);
  const [rows, setRows] = React.useState<ScheduleRow[]>([]);
  const [saved, setSaved] = React.useState('');
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [notice, setNotice] = React.useState<string | undefined>(undefined);
  const [issues, setIssues] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<ScheduleRow | undefined>(undefined);
  const [reloadKey, setReloadKey] = React.useState(0);
  // Zpět / znovu: stavy řádků před úpravami z diagramu a tlačítek (psaní do políček tabulky se do historie nezapisuje).
  const [hist, setHist] = React.useState<{ past: ScheduleRow[][]; future: ScheduleRow[][] }>({ past: [], future: [] });
  const [preview, setPreview] = React.useState<GanttOp | null>(null);
  const [selectedLink, setSelectedLink] = React.useState<{ fromKey: string; toKey: string } | undefined>(undefined);
  const [focusKey, setFocusKey] = React.useState<string | undefined>(undefined);
  const [showTable, setShowTable] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setOriginal(undefined);
    repos.tasks
      .listByProject(project.projectNumber)
      .then((tasks) => {
        if (cancelled) {
          return;
        }
        const r = rowsFromTasks(tasks);
        // Pořadí je důležité: `original` se nastavuje jako poslední. Ve chvíli, kdy se zapne hlídání rozepsaného formuláře
        // (useFormDraft si zapamatuje výchozí stav), už musí být řádky načtené — jinak se načtená data považují za „rozepsané změny“.
        setRows(r);
        setHist({ past: [], future: [] });
        setSaved(JSON.stringify(r));
        setOriginal(tasks);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [repos, project.projectNumber, reloadKey]);

  const draft = useFormDraft<ScheduleRow[] | null>({
    key: mayEdit ? draftKey(user.loginName, 'schedule', project.projectNumber) : undefined,
    value: original ? rows : null,
    active: !!original && mayEdit,
    onRestore: (d) => {
      if (d) {
        setRows(d);
      }
    }
  });

  const dirty = !!original && JSON.stringify(rows) !== saved;
  const [exporting, setExporting] = React.useState(false);
  const model = React.useMemo(() => buildScheduleModel(rows, { defaultStart: project.startDate }), [rows, project.startDate]);
  const editCtx = React.useMemo(() => ({ defaultStart: project.startDate }), [project.startDate]);
  // Během tažení v diagramu se jen ukazuje náhled; do řádků se úprava zapíše až po puštění myši.
  const viewRows = React.useMemo(() => (preview ? applyOp(rows, preview, editCtx) : rows), [rows, preview, editCtx]);
  const viewModel = React.useMemo(() => (preview ? buildScheduleModel(viewRows, { defaultStart: project.startDate }) : model), [preview, viewRows, model, project.startDate]);
  // Podklad pro Gantt (hooky musí být nad prvním `return` komponenty).
  const ganttData = React.useMemo(() => {
    const items: GanttItem[] = [];
    const keyOfId: Record<number, string> = {};
    viewRows.forEach((r) => {
      const s = viewModel.result.tasks[viewModel.idOf[r.key]];
      if (s) {
        keyOfId[viewModel.idOf[r.key]] = r.key;
        items.push({
          key: r.key,
          wbs: r.wbs,
          title: r.title,
          start: s.start,
          finish: s.finish,
          milestone: r.taskType === TaskType.Milnik || r.durationDays <= 0,
          critical: s.critical,
          percent: r.percentComplete,
          baselineStart: r.baselineStart,
          baselineFinish: r.baselineFinish,
          deadline: r.contractual ? r.deadline : undefined,
          lateByDays: s.lateByDays,
          totalFloat: s.totalFloat
        });
      }
    });
    return { items, links: linksFromDeps(viewModel.deps, (id) => keyOfId[id]) };
  }, [viewRows, viewModel]);

  const patch = (key: string, p: Partial<ScheduleRow>): void => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const exportRows = (): ScheduleExportRow[] =>
    ganttData.items.map((it) => {
      const r = rows.filter((x) => x.key === it.key)[0];
      return { ...it, durationDays: r ? r.durationDays : 0, predecessors: r ? r.predText : '' };
    });
  const download = (blob: Blob, name: string): void => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportCsv = (): void => {
    download(new Blob(['﻿' + scheduleCsv(exportRows())], { type: 'text/csv;charset=utf-8' }), scheduleFileName(project.projectNumber, 'csv'));
  };
  const exportPdf = (): void => {
    setExporting(true);
    import(/* webpackChunkName: 'schedule-pdf' */ './schedulePdf')
      .then((m) => m.renderSchedulePdf({ projectNumber: project.projectNumber, projectTitle: project.title, rows: exportRows(), links: ganttData.links, company: settings.company, generatedBy: user.displayName }))
      .then((blob) => download(blob, scheduleFileName(project.projectNumber, 'pdf')))
      .catch((e: unknown) => window.alert(`PDF se nepodařilo vytvořit: ${e instanceof Error ? e.message : String(e)}`))
      .then(() => setExporting(false), () => setExporting(false));
  };

  /** Zapíše změnu řádků a uloží předchozí stav do historie (Zpět). */
  const commit = (next: ScheduleRow[]): void => {
    if (next === rows) {
      return;
    }
    setHist((h) => ({ past: [...h.past.slice(-99), rows], future: [] }));
    setRows(next);
  };
  const undo = (): void => {
    if (hist.past.length === 0) {
      return;
    }
    const prev = hist.past[hist.past.length - 1];
    setHist({ past: hist.past.slice(0, -1), future: [rows, ...hist.future].slice(0, 100) });
    setRows(prev);
  };
  const redo = (): void => {
    if (hist.future.length === 0) {
      return;
    }
    const next = hist.future[0];
    setHist({ past: [...hist.past, rows].slice(-100), future: hist.future.slice(1) });
    setRows(next);
  };
  const addRow = (type: TaskType = TaskType.Cinnost): void => {
    const key = newKey();
    commit([...rows, { key, wbs: nextWbs(rows), title: '', taskType: type, durationDays: type === TaskType.Milnik ? 0 : 1, predText: '', percentComplete: 0, contractual: false, watch: false }]);
    setFocusKey(key);
  };
  const onGanttCommit = (op: GanttOp): void => commit(applyOp(rows, op, editCtx));
  const onGanttLink = (fromKey: string, toKey: string, type: DependencyType): void => {
    const r = addLink(rows, fromKey, toKey, type, editCtx);
    if (r.error) {
      setError(r.error);
      return;
    }
    setError(undefined);
    commit(r.rows);
    setSelectedLink({ fromKey, toKey });
  };
  const onGanttCreate = (from: Date, to: Date): void => {
    const key = newKey();
    commit([...rows, makeRow(rows, key, from, to, TaskType.Cinnost, editCtx)]);
    setFocusKey(key);
  };
  const onGanttKey = (e: React.KeyboardEvent): void => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return;
    }
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLink && mayEdit) {
      e.preventDefault();
      commit(removeLink(rows, selectedLink.fromKey, selectedLink.toKey, editCtx));
      setSelectedLink(undefined);
    }
  };
  const move = (index: number, d: number): void => commit(reorderRows(rows, index, index + d));
  const doDelete = (r: ScheduleRow): void => {
    commit(removeRowReferences(rows, r));
    setConfirmDelete(undefined);
  };

  const save = async (): Promise<void> => {
    const found = validateScheduleRows(rows, model);
    if (found.length > 0) {
      setIssues(found);
      return;
    }
    setIssues([]);
    setError(undefined);
    setNotice(undefined);
    setBusy(true);
    try {
      const realId: Record<string, number> = {};
      rows.forEach((r) => {
        if (r.id !== undefined) {
          realId[r.key] = r.id;
        }
      });
      // 1) nové úkoly se založí (aby měly id pro odkazy), 2) všechny se uloží s vypočtenými termíny a předchůdci, 3) smazané se odeberou.
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.id === undefined) {
          const created = await repos.tasks.create(project.projectNumber, { title: r.title.trim(), taskType: r.taskType, isContractualDeadline: r.contractual, percentComplete: r.percentComplete, finishDate: r.contractual ? r.deadline : undefined }, { deferRefresh: true });
          realId[r.key] = created.id;
        }
      }
      const originalById: Record<number, ProjectTask> = {};
      (original || []).forEach((t) => (originalById[t.id] = t));
      for (let i = 0; i < rows.length; i++) {
        const input = rowToTaskInput(rows[i], i + 1, model, (k) => realId[k]);
        await repos.tasks.update(realId[rows[i].key], input, { deferRefresh: true });
      }
      const keep = new Set(Object.keys(realId).map((k) => realId[k]));
      const removed = (original || []).filter((t) => !keep.has(t.id));
      for (let i = 0; i < removed.length; i++) {
        await repos.tasks.remove(removed[i].id, { deferRefresh: true });
      }
      await repos.tasks.refreshNextDeadline(project.projectNumber);
      draft.clear();
      setNotice(`Harmonogram je uložený (${rows.length} úkolů${removed.length > 0 ? `, smazáno ${removed.length}` : ''}).`);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!original && !error) {
    return <Spinner size={SpinnerSize.large} label="Načítám harmonogram…" />;
  }

  const hasCycle = !!model.result.cycle;
  const selectedDep = selectedLink ? linkOf(rows, selectedLink.fromKey, selectedLink.toKey, editCtx) : undefined;
  const titleOfKey = (key: string): string => {
    const r = rows.filter((x) => x.key === key)[0];
    return r ? r.title || r.wbs : '';
  };
  const linkEditInfo =
    selectedLink && selectedDep
      ? {
          fromTitle: titleOfKey(selectedLink.fromKey),
          toTitle: titleOfKey(selectedLink.toKey),
          type: selectedDep.type,
          lagDays: selectedDep.lagDays,
          onType: (t: DependencyType) => commit(updateLink(rows, selectedLink.fromKey, selectedLink.toKey, { type: t }, editCtx)),
          onLag: (n: number) => commit(updateLink(rows, selectedLink.fromKey, selectedLink.toKey, { lagDays: n }, editCtx)),
          onDelete: () => {
            commit(removeLink(rows, selectedLink.fromKey, selectedLink.toKey, editCtx));
            setSelectedLink(undefined);
          }
        }
      : undefined;
  const nestiha = model.problems.filter((p) => p.indexOf('nestíhá') !== -1);
  const baselineSet = rows.some((r) => r.baselineFinish);

  return (
    <div style={{ marginTop: 12, outline: 'none' }} onKeyDown={onGanttKey}>
      {draft.pending && <DraftBanner savedAt={draft.pending.savedAt} what="harmonogram" onRestore={draft.restore} onDiscard={draft.discard} />}
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>
          {error}
        </MessageBar>
      )}
      {notice && (
        <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setNotice(undefined)}>
          {notice}
        </MessageBar>
      )}
      {!mayEdit && <MessageBar messageBarType={MessageBarType.info}>Harmonogram může upravovat jen projektový manažer projektu, asistent, vedení a administrátor.</MessageBar>}
      {hasCycle && (
        <MessageBar messageBarType={MessageBarType.severeWarning} isMultiline>
          {model.problems.filter((p) => p.indexOf('cyklus') !== -1)[0]}
        </MessageBar>
      )}
      {nestiha.length > 0 && (
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          <strong>Smluvní termíny se nestíhají:</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {nestiha.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </MessageBar>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' }}>
        {mayEdit && (
          <>
            <PrimaryButton text={busy ? 'Ukládám…' : dirty ? 'Uložit harmonogram' : 'Uloženo'} disabled={busy || !dirty} onClick={() => save().catch(() => undefined)} />
            <DefaultButton text="Zpět" iconProps={{ iconName: 'Undo' }} title="Vrátí poslední změnu (Ctrl+Z)" disabled={busy || hist.past.length === 0} onClick={undo} />
            <DefaultButton text="Znovu" iconProps={{ iconName: 'Redo' }} title="Opakuje vrácenou změnu (Ctrl+Y)" disabled={busy || hist.future.length === 0} onClick={redo} />
            <DefaultButton text="Přidat úkol" iconProps={{ iconName: 'Add' }} disabled={busy} onClick={() => addRow()} />
            <DefaultButton text="Přidat milník" iconProps={{ iconName: 'Flag' }} disabled={busy} onClick={() => addRow(TaskType.Milnik)} />
            <DefaultButton text="Přečíslovat" title="Přečísluje úkoly podle pořadí (1, 2, 3 …) a upraví odkazy v předchůdcích" disabled={busy} onClick={() => commit(renumberRows(rows))} />
            <DefaultButton
              text={baselineSet ? 'Znovu zafixovat baseline' : 'Zafixovat baseline'}
              title="Uloží aktuální termíny jako základ pro porovnání (odchylky se pak ukazují ve sloupci Odchylka)"
              disabled={busy || hasCycle || rows.length === 0}
              onClick={() => commit(fixBaseline(rows, model))}
            />
          </>
        )}
        {rows.length > 0 && <DefaultButton text={showTable ? 'Skrýt tabulku úkolů' : 'Tabulka úkolů'} iconProps={{ iconName: 'Table' }} title="Tabulka s ručním zadáním typu, předchůdců, smluvních termínů a dalších údajů" onClick={() => setShowTable((v) => !v)} />}
        <DefaultButton text="Export do Excelu" iconProps={{ iconName: 'ExcelDocument' }} title="Stáhne tabulku harmonogramu jako CSV (otevře se v Excelu) podle toho, co je právě v tabulce" disabled={hasCycle || ganttData.items.length === 0} onClick={() => exportCsv()} />
        <DefaultButton text={exporting ? 'Vytvářím PDF…' : 'PDF (A3)'} iconProps={{ iconName: 'PDF' }} title="Harmonogram s Ganttovým diagramem na A3 na šířku" disabled={exporting || hasCycle || ganttData.items.length === 0} onClick={() => exportPdf()} />
        {model.result.projectStart && model.result.projectFinish && !hasCycle && (
          <span style={{ fontSize: 13, color: RES.gray }}>
            Harmonogram: {formatDate(model.result.projectStart)} – {formatDate(model.result.projectFinish)} ({workdaysBetween(CZECH_WORKDAYS, model.result.projectStart, model.result.projectFinish) + 1} pracovních dnů)
          </span>
        )}
      </div>

      {issues.length > 0 && (
        <MessageBar messageBarType={MessageBarType.warning} isMultiline onDismiss={() => setIssues([])}>
          <strong>Nejde uložit — něco chybí:</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {issues.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </MessageBar>
      )}

      {!hasCycle && ganttData.items.length > 0 && (
        <GanttChart
          items={ganttData.items}
          links={ganttData.links}
          editable={mayEdit && !busy}
          selectedLink={selectedLink}
          linkEdit={linkEditInfo}
          focusKey={focusKey}
          onFocused={() => setFocusKey(undefined)}
          onSelectLink={setSelectedLink}
          onPreview={setPreview}
          onCommit={onGanttCommit}
          onLink={onGanttLink}
          onCreate={onGanttCreate}
          onReorder={(from, to) => commit(reorderRows(rows, from, to))}
          onTitle={(key, title) => patch(key, { title })}
          onDeleteRow={(key) => setConfirmDelete(rows.filter((x) => x.key === key)[0])}
        />
      )}

      {rows.length === 0 ? (
        <MessageBar messageBarType={MessageBarType.info} isMultiline>
          Harmonogram je zatím prázdný. {mayEdit ? 'Přidejte úkol nebo milník. Smluvní termíny ze záložky Termíny se sem přenesou samy.' : ''}
        </MessageBar>
      ) : !showTable ? null : (
        <StickyHScroll maxHeight="calc(100vh - 300px)">
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: 1180 }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 90 }}> </th>
                <th style={{ ...TH, width: 56 }}>Číslo</th>
                <th style={{ ...TH, minWidth: 220 }}>Název</th>
                <th style={{ ...TH, width: 130 }}>Typ</th>
                <th style={{ ...TH, width: 130 }}>Zahájení</th>
                <th style={{ ...TH, width: 66 }}>Trvání</th>
                <th style={{ ...TH, width: 100 }}>Ukončení</th>
                <th style={{ ...TH, width: 120 }}>Předchůdci</th>
                <th style={{ ...TH, width: 60 }}>Hotovo %</th>
                <th style={{ ...TH, width: 150 }}>Smluvní termín</th>
                <th style={{ ...TH, width: 66 }}>Rezerva</th>
                <th style={{ ...TH, width: 78 }}>Odchylka</th>
                <th style={{ ...TH, width: 60 }}>Kritické</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const s = model.result.tasks[model.idOf[r.key]];
                const probs = model.rowProblems[r.key] || [];
                const hasPred = (model.deps[r.key] || []).length > 0;
                const milestone = r.taskType === TaskType.Milnik;
                const late = s && s.lateByDays !== undefined;
                const shift = s && r.baselineFinish ? workdaysBetween(CZECH_WORKDAYS, r.baselineFinish, s.finish) : undefined;
                const dis = !mayEdit || busy;
                return (
                  <tr key={r.key} style={{ background: s && s.critical ? '#FDF3F5' : undefined }}>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                      {mayEdit && (
                        <>
                          <IconButton iconProps={{ iconName: 'Up' }} ariaLabel="Posunout výš" disabled={dis || i === 0} onClick={() => move(i, -1)} styles={{ root: { height: 24, width: 24 } }} />
                          <IconButton iconProps={{ iconName: 'Down' }} ariaLabel="Posunout níž" disabled={dis || i === rows.length - 1} onClick={() => move(i, 1)} styles={{ root: { height: 24, width: 24 } }} />
                          <IconButton iconProps={{ iconName: 'Delete' }} ariaLabel={`Smazat úkol ${r.wbs}`} disabled={dis} onClick={() => (r.id !== undefined ? setConfirmDelete(r) : doDelete(r))} styles={{ root: { height: 24, width: 24 } }} />
                        </>
                      )}
                    </td>
                    <td style={TD}>
                      <input style={INPUT} value={r.wbs} disabled={dis} aria-label="Číslo úkolu" onChange={(e) => patch(r.key, { wbs: e.target.value })} />
                    </td>
                    <td style={TD}>
                      <input style={{ ...INPUT, fontWeight: milestone ? 600 : 400 }} value={r.title} disabled={dis} aria-label="Název úkolu" placeholder="Název úkolu" onChange={(e) => patch(r.key, { title: e.target.value })} />
                    </td>
                    <td style={TD}>
                      <select
                        style={INPUT}
                        value={r.taskType}
                        disabled={dis}
                        aria-label="Typ úkolu"
                        onChange={(e) => {
                          const t = e.target.value as TaskType;
                          patch(r.key, { taskType: t, durationDays: t === TaskType.Milnik ? 0 : r.durationDays > 0 ? r.durationDays : 1 });
                        }}
                      >
                        {TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={TD}>
                      <input
                        type="date"
                        style={{ ...INPUT, background: hasPred ? RES.background : RES.white }}
                        value={toInput(hasPred && s ? s.start : r.start)}
                        disabled={dis || hasPred}
                        title={hasPred ? 'Úkol má předchůdce — zahájení se vypočítá z nich.' : undefined}
                        aria-label="Zahájení"
                        onChange={(e) => patch(r.key, { start: fromInput(e.target.value) })}
                      />
                    </td>
                    <td style={TD}>
                      <input
                        style={{ ...INPUT, textAlign: 'right' }}
                        value={milestone ? '0' : String(r.durationDays)}
                        disabled={dis || milestone}
                        aria-label="Trvání v pracovních dnech"
                        inputMode="numeric"
                        onChange={(e) => {
                          const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                          patch(r.key, { durationDays: isNaN(n) ? 0 : n });
                        }}
                      />
                    </td>
                    <td style={{ ...TD, fontSize: 13, whiteSpace: 'nowrap', color: late ? RES.red : RES.text }}>{s ? formatDate(s.finish) : '—'}</td>
                    <td style={TD}>
                      <input
                        style={{ ...INPUT, borderColor: probs.some((p) => p.indexOf('ředchůdc') !== -1 || p.indexOf('cyklus') !== -1 || p.indexOf('nemůže') !== -1) ? RES.red : RES.grayBlue }}
                        value={r.predText}
                        disabled={dis}
                        aria-label="Předchůdci"
                        placeholder="např. 1, 3SS+2"
                        title={probs.length > 0 ? probs.join(' ') : 'Čísla úkolů, na které úkol navazuje; typ FS/SS/FF/SF a prodleva za číslem, např. 3SS+2.'}
                        onChange={(e) => patch(r.key, { predText: e.target.value })}
                      />
                    </td>
                    <td style={TD}>
                      <input
                        style={{ ...INPUT, textAlign: 'right' }}
                        value={String(r.percentComplete)}
                        disabled={dis}
                        aria-label="Hotovo v procentech"
                        inputMode="numeric"
                        onChange={(e) => {
                          const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                          patch(r.key, { percentComplete: isNaN(n) ? 0 : Math.min(100, n) });
                        }}
                      />
                    </td>
                    <td style={TD}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Checkbox ariaLabel="Smluvní termín" checked={r.contractual} disabled={dis} onChange={(_, c) => patch(r.key, { contractual: !!c, deadline: c ? r.deadline : undefined })} />
                        {r.contractual && (
                          <input
                            type="date"
                            style={{ ...INPUT, borderColor: r.deadline ? RES.grayBlue : RES.red }}
                            value={toInput(r.deadline)}
                            disabled={dis}
                            aria-label="Nejzazší datum smluvního termínu"
                            onChange={(e) => patch(r.key, { deadline: fromInput(e.target.value) })}
                          />
                        )}
                      </div>
                    </td>
                    <td style={{ ...TD, fontSize: 13, textAlign: 'right', color: s && s.totalFloat < 0 ? RES.red : RES.text }}>{s ? `${s.totalFloat} d` : '—'}</td>
                    <td style={{ ...TD, fontSize: 13, textAlign: 'right', color: shift && shift > 0 ? RES.red : shift && shift < 0 ? RES.greenDark : RES.gray }}>
                      {shift === undefined ? '—' : shift === 0 ? '0' : `${shift > 0 ? '+' : ''}${shift} d`}
                    </td>
                    <td style={TD}>
                      <Checkbox
                        ariaLabel="Sledovat jako kritické"
                        title="Ruční příznak: sledovat jako kritické, i když má úkol rezervu"
                        checked={r.watch}
                        disabled={dis}
                        onChange={(_, c) => patch(r.key, { watch: !!c })}
                        label={s && s.critical ? '●' : undefined}
                        styles={{ label: { color: RES.red, fontSize: 12 } }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </StickyHScroll>
      )}

      <div style={{ fontSize: 12, color: RES.gray, marginTop: 8, lineHeight: 1.5 }}>
        Trvání je v pracovních dnech (pondělí–pátek mimo české státní svátky). Úkol s předchůdci se řídí jimi (zahájení se vypočítá), úkol bez předchůdců začíná v zadaném datu. Rezerva je o kolik pracovních dnů lze úkol posunout, aniž by
        se posunul konec harmonogramu nebo smluvní termín; <strong>kritické</strong> jsou úkoly s rezervou 0 nebo zápornou (červeně), případně ručně označené. Typy závislostí: FS = začne po skončení, SS = začne společně, FF = skončí
        společně, SF = skončí, až předchůdce začne. Odchylka ukazuje posun konce proti zafixované baseline.
      </div>

      {confirmDelete && (
        <Dialog
          hidden={false}
          onDismiss={() => setConfirmDelete(undefined)}
          dialogContentProps={{ type: DialogType.normal, title: `Smazat úkol „${confirmDelete.title || confirmDelete.wbs}“`, subText: 'Úkol se smaže po uložení harmonogramu (do koše SharePointu). Odkazy na něj se odeberou z ostatních úkolů.' }}
          modalProps={{ isBlocking: true }}
        >
          <DialogFooter>
            <PrimaryButton text="Smazat" onClick={() => doDelete(confirmDelete)} />
            <DefaultButton text="Zpět" onClick={() => setConfirmDelete(undefined)} />
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
};
