/**
 * Záložka Stavební deník v detailu projektu: deníky projektu (může jich být víc), jejich zápisy a tlačítka pro nový
 * deník a nový zápis. Deník jde přejmenovat, vypnout a zapnout.
 */

import * as React from 'react';
import { PrimaryButton, DefaultButton, IconButton } from '@fluentui/react/lib/Button';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { TextField } from '@fluentui/react/lib/TextField';
import { Dialog, DialogType, DialogFooter } from '@fluentui/react/lib/Dialog';
import { Checkbox } from '@fluentui/react/lib/Checkbox';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { useAutoRefresh } from '../../ui/useAutoRefresh';
import { Project } from '../../core/types';
import { DiaryEntry, SiteDiary, canWriteDiary, isHandover, isHandoverDiary } from '../../core/siteDiary';
import { toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { EntriesTable } from './EntriesTable';
import { EntryPanel } from './EntryPanel';

export const ProjectDiaryTab: React.FC<{ project: Project }> = ({ project }) => {
  const { repos, user } = useApp();
  const [diaries, setDiaries] = React.useState<SiteDiary[] | undefined>(undefined);
  const [entries, setEntries] = React.useState<DiaryEntry[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [diaryFilter, setDiaryFilter] = React.useState<number | undefined>(undefined);
  const [openId, setOpenId] = React.useState<number | undefined>(undefined);
  const [creating, setCreating] = React.useState(false);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setError(undefined);
    Promise.all([repos.diary.listDiaries(project.projectNumber), repos.diary.listEntries({ projectNumber: project.projectNumber })])
      .then(([d, e]) => {
        if (!cancelled) {
          // Předávací protokoly mají vlastní záložku — mezi zápisy ze stavby se neukazují.
          setDiaries(d.filter((x) => !isHandoverDiary(x)));
          setEntries(e.filter((x) => !isHandover(x)));
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [repos, project.projectNumber, reloadKey]);

  useAutoRefresh(() => setReloadKey((k) => k + 1), openId !== undefined || creating || manageOpen);

  const mayWrite = canWriteDiary(toWorkflowProject(project), toActor(user));
  const shown = (entries ?? []).filter((e) => diaryFilter === undefined || e.diaryId === diaryFilter);
  const diaryOptions: IDropdownOption[] = [
    { key: 0, text: 'Všechny deníky' },
    ...(diaries ?? []).map((d) => ({ key: d.id, text: d.isActive ? d.title : `${d.title} (vypnutý)` }))
  ];

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', color: RES.gray, fontSize: 13 }}>
          {project.isOverhead
            ? 'Na projekt Režie se stavební deník nevede.'
            : `Zápisy ze stavby projektu ${project.projectNumber}. Nový zápis se otevře s tímto projektem a jeho údaji; vše se dá ve formuláři změnit.`}
        </div>
        {diaries && diaries.length > 1 && (
          <Dropdown
            ariaLabel="Deník"
            options={diaryOptions}
            selectedKey={diaryFilter ?? 0}
            onChange={(_, o) => o && setDiaryFilter(Number(o.key) || undefined)}
            styles={{ root: { width: 220 } }}
          />
        )}
        {mayWrite && <DefaultButton iconProps={{ iconName: 'Settings' }} text="Deníky projektu" onClick={() => setManageOpen(true)} />}
        {mayWrite && <PrimaryButton iconProps={{ iconName: 'Add' }} text="Nový zápis" onClick={() => setCreating(true)} />}
      </div>

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {!entries && !error && <Spinner size={SpinnerSize.medium} label="Načítám zápisy…" />}
      {entries && diaries && diaries.length === 0 && !project.isOverhead && (
        <MessageBar messageBarType={MessageBarType.info} isMultiline>
          Projekt zatím nemá stavební deník. Deník se založí při prvním zápisu, nebo tlačítkem Deníky projektu.
        </MessageBar>
      )}
      {entries && diaries && diaries.length > 0 && shown.length === 0 && <MessageBar messageBarType={MessageBarType.info}>Zatím tu není žádný zápis.</MessageBar>}
      {shown.length > 0 && (
        <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4 }}>
          <EntriesTable entries={shown} hideProject onOpen={(id) => setOpenId(id)} />
        </div>
      )}

      <EntryPanel
        isOpen={openId !== undefined || creating}
        entryId={openId}
        projectNumber={project.projectNumber}
        diaryId={diaryFilter}
        onDismiss={() => {
          setOpenId(undefined);
          setCreating(false);
        }}
        onChanged={() => setReloadKey((k) => k + 1)}
      />

      {manageOpen && <DiariesDialog project={project} diaries={diaries ?? []} onClose={() => setManageOpen(false)} onChanged={() => setReloadKey((k) => k + 1)} />}
    </div>
  );
};

/** Správa deníků projektu: nový deník, přejmenování, vypnutí a zapnutí. */
const DiariesDialog: React.FC<{ project: Project; diaries: SiteDiary[]; onClose: () => void; onChanged: () => void }> = ({
  project,
  diaries,
  onClose,
  onChanged
}) => {
  const { repos, user } = useApp();
  const [names, setNames] = React.useState<Record<number, string>>({});
  const [newName, setNewName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  const run = (action: () => Promise<unknown>): void => {
    setBusy(true);
    setError(undefined);
    action()
      .then(() => {
        setBusy(false);
        onChanged();
      })
      .catch((e: Error) => {
        setBusy(false);
        setError(e.message);
      });
  };

  return (
    <Dialog
      hidden={false}
      onDismiss={onClose}
      dialogContentProps={{
        type: DialogType.normal,
        title: `Deníky projektu ${project.projectNumber}`,
        subText:
          'K jednomu projektu může být víc deníků (např. pro různé části stavby). Přejmenování se týká jen nových zápisů — složky už založených zápisů se nemění.'
      }}
      modalProps={{ isBlocking: true }}
      minWidth={520}
    >
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>
          {error}
        </MessageBar>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 0' }}>
        {diaries.map((d) => (
          <div key={d.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <TextField
              ariaLabel={`Název deníku ${d.title}`}
              value={names[d.id] ?? d.title}
              onChange={(_, v) => setNames((cur) => ({ ...cur, [d.id]: v ?? '' }))}
              styles={{ root: { flex: '1 1 auto' } }}
            />
            <IconButton
              iconProps={{ iconName: 'Save' }}
              title="Uložit název"
              ariaLabel="Uložit název"
              disabled={busy || (names[d.id] ?? d.title).trim() === '' || (names[d.id] ?? d.title) === d.title}
              onClick={() => run(() => repos.diary.updateDiary(d.id, { title: names[d.id] }, user))}
            />
            <Checkbox label="aktivní" checked={d.isActive} disabled={busy} onChange={(_, c) => run(() => repos.diary.updateDiary(d.id, { isActive: !!c }, user))} />
          </div>
        ))}
        {diaries.length === 0 && <div style={{ fontSize: 13, color: RES.gray }}>Projekt zatím nemá žádný deník.</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <TextField label="Nový deník" placeholder="např. Hlavní deník" value={newName} onChange={(_, v) => setNewName(v ?? '')} styles={{ root: { flex: '1 1 auto' } }} />
        <PrimaryButton
          text="Založit"
          disabled={busy || newName.trim() === ''}
          onClick={() =>
            run(async () => {
              await repos.diary.createDiary(project.projectNumber, newName, undefined, user);
              setNewName('');
            })
          }
        />
      </div>
      <DialogFooter>
        <DefaultButton text="Zavřít" onClick={onClose} />
      </DialogFooter>
    </Dialog>
  );
};
