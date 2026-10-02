/**
 * Smluvní termíny plnění projektu (zadání kap. 8.4, PRM_Tasks).
 *
 * Ve Fázi 1 jde o samostatný seznam milníků: název, termín, odpovědná osoba,
 * dokončení v procentech. Celý harmonogram s Ganttem a závislostmi přijde
 * ve Fázi 4 — tyhle položky se do něj přenesou, je to stejný seznam.
 *
 * Výběr nejbližšího termínu a kontroly jsou v `core/deadlines.ts`.
 */

import * as React from 'react';
import { DetailsList, DetailsListLayoutMode, IColumn, SelectionMode } from '@fluentui/react/lib/DetailsList';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { TextField } from '@fluentui/react/lib/TextField';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { DatePicker } from '@fluentui/react/lib/DatePicker';
import { Toggle } from '@fluentui/react/lib/Toggle';
import { PrimaryButton, DefaultButton, IconButton } from '@fluentui/react/lib/Button';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Dialog, DialogType, DialogFooter } from '@fluentui/react/lib/Dialog';

import { PersonPicker, PickedPerson } from '../../ui/components/PersonPicker';
import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { CS_CALENDAR_STRINGS } from '../../ui/csCalendarStrings';
import { Project, ProjectTask, TaskType } from '../../core/types';
import { formatDate, parseCzechDate, dueLabel } from '../../core/format';
import { validateDeadline, deadlineWarnings, DeadlineValues } from '../../core/deadlines';
import { canEditProject } from '../../core/roles';
import { TaskInput } from '../../data/repositories';

const TYPE_OPTIONS: IDropdownOption[] = Object.keys(TaskType).map((k) => {
  const value = TaskType[k as keyof typeof TaskType];
  return { key: value, text: value };
});

export const DeadlinesTab: React.FC<{ project: Project; onChanged?: () => void }> = ({
  project,
  onChanged
}) => {
  const { repos, user } = useApp();

  const [tasks, setTasks] = React.useState<ProjectTask[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [editing, setEditing] = React.useState<ProjectTask | 'novy' | undefined>(undefined);
  const [toDelete, setToDelete] = React.useState<ProjectTask | undefined>(undefined);
  const [busy, setBusy] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  const mayEdit = canEditProject(user.roles, user.loginName, {
    projectManagerLogin: project.projectManagerLogin,
    assistantLogins: project.assistantLogins
  });

  React.useEffect(() => {
    let cancelled = false;
    setTasks(undefined);
    setError(undefined);
    repos.tasks
      .listByProject(project.projectNumber)
      .then((data) => {
        if (!cancelled) {
          setTasks(data);
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
  }, [repos, project.projectNumber, reloadKey]);

  const refresh = (): void => {
    setReloadKey((k) => k + 1);
    onChanged?.();
  };

  const confirmDelete = (): void => {
    if (!toDelete) {
      return;
    }
    setBusy(true);
    repos.tasks
      .remove(toDelete.id)
      .then(() => {
        setBusy(false);
        setToDelete(undefined);
        refresh();
      })
      .catch((e: Error) => {
        setBusy(false);
        setError(e.message);
        setToDelete(undefined);
      });
  };

  const columns: IColumn[] = [
    {
      key: 'title',
      name: 'Termín',
      minWidth: 200,
      isResizable: true,
      onRender: (t: ProjectTask) => (
        <span>
          {t.isContractualDeadline && (
            <span
              title="Smluvní termín plnění"
              style={{
                display: 'inline-block',
                marginRight: 6,
                padding: '1px 6px',
                borderRadius: 3,
                background: RES.bluePale,
                color: RES.navy,
                fontSize: 11,
                fontWeight: 600
              }}
            >
              smluvní
            </span>
          )}
          {t.title}
        </span>
      )
    },
    {
      key: 'taskType',
      name: 'Typ',
      minWidth: 110,
      maxWidth: 140,
      isResizable: true,
      onRender: (t: ProjectTask) => t.taskType
    },
    {
      key: 'finishDate',
      name: 'Termín plnění',
      minWidth: 170,
      maxWidth: 200,
      isResizable: true,
      onRender: (t: ProjectTask) => {
        if (!t.finishDate) {
          return '—';
        }
        const hotovo = t.percentComplete >= 100;
        return (
          <span>
            {formatDate(t.finishDate)}
            {!hotovo && (
              <span style={{ color: RES.gray, fontSize: 12 }}> ({dueLabel(t.finishDate)})</span>
            )}
          </span>
        );
      }
    },
    {
      key: 'percentComplete',
      name: 'Dokončeno',
      minWidth: 90,
      maxWidth: 110,
      isResizable: true,
      onRender: (t: ProjectTask) => `${t.percentComplete} %`
    },
    {
      key: 'responsibleName',
      name: 'Odpovídá',
      minWidth: 120,
      maxWidth: 170,
      isResizable: true,
      onRender: (t: ProjectTask) => t.responsibleName || '—'
    }
  ];

  if (mayEdit) {
    columns.push({
      key: 'akce',
      name: '',
      minWidth: 70,
      maxWidth: 70,
      onRender: (t: ProjectTask) => (
        <div style={{ display: 'flex', gap: 2 }}>
          <IconButton
            iconProps={{ iconName: 'Edit' }}
            title="Upravit termín"
            ariaLabel={`Upravit ${t.title}`}
            onClick={() => setEditing(t)}
          />
          <IconButton
            iconProps={{ iconName: 'Delete' }}
            title="Smazat termín"
            ariaLabel={`Smazat ${t.title}`}
            onClick={() => setToDelete(t)}
          />
        </div>
      )
    });
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <p style={{ margin: 0, flex: '1 1 auto', color: RES.gray, fontSize: 13 }}>
          Termíny označené jako <strong>smluvní</strong> se hlídají — ten nejbližší nesplněný se
          ukazuje na dashboardu ve sloupci „Nejbližší termín&ldquo;.
        </p>
        {mayEdit && (
          <PrimaryButton
            iconProps={{ iconName: 'Add' }}
            text="Přidat termín"
            onClick={() => setEditing('novy')}
          />
        )}
      </div>

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>
          {error}
        </MessageBar>
      )}

      {!tasks && !error && <Spinner size={SpinnerSize.medium} label="Načítám termíny…" />}

      {tasks && tasks.length === 0 && (
        <MessageBar messageBarType={MessageBarType.info}>
          Projekt zatím nemá žádné termíny.{' '}
          {mayEdit ? 'Přidejte je tlačítkem výše.' : 'Přidat je může projektový manažer projektu.'}
        </MessageBar>
      )}

      {tasks && tasks.length > 0 && (
        <DetailsList
          items={tasks}
          columns={columns}
          selectionMode={SelectionMode.none}
          layoutMode={DetailsListLayoutMode.justified}
          compact
        />
      )}

      {editing && (
        <DeadlinePanel
          project={project}
          task={editing === 'novy' ? undefined : editing}
          onDismiss={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            refresh();
          }}
        />
      )}

      <Dialog
        hidden={!toDelete}
        onDismiss={() => setToDelete(undefined)}
        dialogContentProps={{ type: DialogType.normal, title: 'Smazat termín?' }}
        modalProps={{ isBlocking: true }}
      >
        <div style={{ fontSize: 13 }}>
          {toDelete?.title}
          {toDelete?.finishDate ? ` — ${formatDate(toDelete.finishDate)}` : ''}
        </div>
        <DialogFooter>
          <PrimaryButton text={busy ? 'Mažu…' : 'Smazat'} disabled={busy} onClick={confirmDelete} />
          <DefaultButton text="Zrušit" disabled={busy} onClick={() => setToDelete(undefined)} />
        </DialogFooter>
      </Dialog>
    </div>
  );
};

/** Panel pro přidání i úpravu termínu — formulář je v obou případech stejný. */
const DeadlinePanel: React.FC<{
  project: Project;
  task?: ProjectTask;
  onDismiss: () => void;
  onSaved: () => void;
}> = ({ project, task, onDismiss, onSaved }) => {
  const { repos } = useApp();

  const [title, setTitle] = React.useState(task?.title ?? '');
  const [taskType, setTaskType] = React.useState<TaskType>(task?.taskType ?? TaskType.Milnik);
  const [finishDate, setFinishDate] = React.useState<Date | undefined>(task?.finishDate);
  const [isContractual, setIsContractual] = React.useState(task?.isContractualDeadline ?? true);
  const [percentComplete, setPercentComplete] = React.useState(String(task?.percentComplete ?? 0));
  const [responsible, setResponsible] = React.useState<PickedPerson>(task?.responsibleName ? { name: task.responsibleName } : {});

  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | undefined>(undefined);
  const [showIssues, setShowIssues] = React.useState(false);

  const values: DeadlineValues = {
    title,
    finishDate,
    percentComplete: percentComplete.trim() === '' ? 0 : Number(percentComplete),
    isContractualDeadline: isContractual
  };
  const issues = validateDeadline(values);
  const warnings = deadlineWarnings(values, project.endDatePlanned);
  const issueFor = (field: string): string | undefined =>
    showIssues ? issues.filter((i) => i.field === field).map((i) => i.message)[0] : undefined;

  const save = (): void => {
    setShowIssues(true);
    if (issues.length > 0) {
      return;
    }
    setSaving(true);
    setSaveError(undefined);

    const input: TaskInput = {
      title: title.trim(),
      taskType,
      finishDate,
      isContractualDeadline: isContractual,
      percentComplete: values.percentComplete,
      responsibleName: responsible.name || undefined,
      responsibleLogin: responsible.login
    };

    const akce = task
      ? repos.tasks.update(task.id, input)
      : repos.tasks.create(project.projectNumber, input);

    akce
      .then(() => {
        setSaving(false);
        onSaved();
      })
      .catch((e: Error) => {
        setSaving(false);
        setSaveError(e.message);
      });
  };

  return (
    <Panel
      isOpen
      onDismiss={onDismiss}
      type={PanelType.medium}
      headerText={task ? 'Úprava termínu' : 'Nový termín'}
      closeButtonAriaLabel="Zavřít"
      isFooterAtBottom
      onRenderFooterContent={() => (
        <div>
          {showIssues && issues.length > 0 && (
            <MessageBar messageBarType={MessageBarType.error} isMultiline>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {issues.map((i) => (
                  <li key={i.message}>{i.message}</li>
                ))}
              </ul>
            </MessageBar>
          )}
          {saveError && (
            <MessageBar messageBarType={MessageBarType.error} isMultiline>
              {saveError}
            </MessageBar>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
          <PrimaryButton text={saving ? 'Ukládám…' : 'Uložit'} disabled={saving} onClick={save} />
          <DefaultButton text="Zrušit" onClick={onDismiss} disabled={saving} />
          </div>
        </div>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        <TextField
          label="Název termínu"
          required
          placeholder="Např. Předání díla, Dodávka trafostanice"
          value={title}
          errorMessage={issueFor('title')}
          onChange={(_, v) => setTitle(v ?? '')}
        />

        <Dropdown
          label="Typ"
          options={TYPE_OPTIONS}
          selectedKey={taskType}
          onChange={(_, o) => o && setTaskType(o.key as TaskType)}
        />

        <DatePicker
          label="Termín plnění"
          value={finishDate}
          onSelectDate={(d) => setFinishDate(d ?? undefined)}
          formatDate={(d) => (d ? formatDate(d) : '')}
          parseDateFromString={(t) => parseCzechDate(t) ?? null}
          allowTextInput
          strings={CS_CALENDAR_STRINGS}
          textField={{ errorMessage: issueFor('finishDate') }}
        />

        <Toggle
          label="Smluvní termín plnění"
          onText="Ano – hlídá se a je vidět na dashboardu"
          offText="Ne – jen interní položka"
          checked={isContractual}
          onChange={(_, c) => setIsContractual(!!c)}
        />

        <TextField
          label="Dokončeno (%)"
          type="number"
          min={0}
          max={100}
          value={percentComplete}
          errorMessage={issueFor('percentComplete')}
          onChange={(_, v) => setPercentComplete(v ?? '')}
        />

        <PersonPicker label="Odpovídá" description="Kdokoli z firmy (adresář Microsoft 365). Nepovinné." value={responsible} onChange={setResponsible} />

        {warnings.length > 0 && (
          <MessageBar messageBarType={MessageBarType.warning} isMultiline>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </MessageBar>
        )}

      </div>
    </Panel>
  );
};
