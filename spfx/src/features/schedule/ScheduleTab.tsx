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
  const { repos, user } = useApp();
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
        setOriginal(tasks);
        setRows(r);
        setSaved(JSON.stringify(r));
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
  const model = React.useMemo(() => buildScheduleModel(rows, { defaultStart: project.startDate }), [rows, project.startDate]);

  const patch = (key: string, p: Partial<ScheduleRow>): void => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const addRow = (type: TaskType = TaskType.Cinnost): void =>
    setRows((cur) => [...cur, { key: newKey(), wbs: nextWbs(cur), title: '', taskType: type, durationDays: type === TaskType.Milnik ? 0 : 1, predText: '', percentComplete: 0, contractual: false, watch: false }]);
  const move = (index: number, d: number): void =>
    setRows((cur) => {
      const j = index + d;
      if (j < 0 || j >= cur.length) {
        return cur;
      }
      const next = cur.slice();
      const t = next[index];
      next[index] = next[j];
      next[j] = t;
      return next;
    });
  const doDelete = (r: ScheduleRow): void => {
    setRows((cur) => removeRowReferences(cur, r));
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
  const nestiha = model.problems.filter((p) => p.indexOf('nestíhá') !== -1);
  const baselineSet = rows.some((r) => r.baselineFinish);

  return (
    <div style={{ marginTop: 12 }}>
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
            <DefaultButton text="Přidat úkol" iconProps={{ iconName: 'Add' }} disabled={busy} onClick={() => addRow()} />
            <DefaultButton text="Přidat milník" iconProps={{ iconName: 'Flag' }} disabled={busy} onClick={() => addRow(TaskType.Milnik)} />
            <DefaultButton text="Přečíslovat" title="Přečísluje úkoly podle pořadí (1, 2, 3 …) a upraví odkazy v předchůdcích" disabled={busy} onClick={() => setRows((cur) => renumberRows(cur))} />
            <DefaultButton
              text={baselineSet ? 'Znovu zafixovat baseline' : 'Zafixovat baseline'}
              title="Uloží aktuální termíny jako základ pro porovnání (odchylky se pak ukazují ve sloupci Odchylka)"
              disabled={busy || hasCycle || rows.length === 0}
              onClick={() => setRows((cur) => fixBaseline(cur, model))}
            />
          </>
        )}
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

      {rows.length === 0 ? (
        <MessageBar messageBarType={MessageBarType.info} isMultiline>
          Harmonogram je zatím prázdný. {mayEdit ? 'Přidejte úkol nebo milník. Smluvní termíny ze záložky Termíny se sem přenesou samy.' : ''}
        </MessageBar>
      ) : (
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
