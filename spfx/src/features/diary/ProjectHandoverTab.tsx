/**
 * Záložka Předávací protokoly v detailu projektu: seznam protokolů projektu a tlačítko pro nový protokol.
 * Protokol je zvláštní druh zápisu (viz `core/siteDiary`): píše se, uzavře a podepíše stejně jako zápis ze stavby,
 * ale má vlastní podobu dokumentu, závěr předání (bez výhrad / s výhradami / nepřevzato) a záruku.
 */

import * as React from 'react';
import { PrimaryButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { StickyHScroll } from '../../ui/components/StickyHScroll';
import { useAutoRefresh } from '../../ui/useAutoRefresh';
import { Project } from '../../core/types';
import { DiaryEntry, canWriteDiary, isHandover } from '../../core/siteDiary';
import { toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { EntriesTable } from './EntriesTable';
import { EntryPanel } from './EntryPanel';

export const ProjectHandoverTab: React.FC<{ project: Project }> = ({ project }) => {
  const { repos, user } = useApp();
  const [entries, setEntries] = React.useState<DiaryEntry[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [openId, setOpenId] = React.useState<number | undefined>(undefined);
  const [creating, setCreating] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setError(undefined);
    repos.diary
      .listEntries({ projectNumber: project.projectNumber, kind: 'predani' })
      .then((list) => !cancelled && setEntries(list.filter(isHandover)))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [repos, project.projectNumber, reloadKey]);

  useAutoRefresh(() => setReloadKey((k) => k + 1), openId !== undefined || creating);

  const mayWrite = canWriteDiary(toWorkflowProject(project), toActor(user));

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', color: RES.gray, fontSize: 13 }}>
          {project.isOverhead
            ? 'Na projekt Režie se předávací protokoly nevedou.'
            : `Předávací protokoly projektu ${project.projectNumber} (dílčí i konečné předání). Protokol se uloží do složky zápisů projektu a po uzavření z něj vznikne PDF a Word.`}
        </div>
        {mayWrite && <PrimaryButton iconProps={{ iconName: 'Add' }} text="Nový předávací protokol" onClick={() => setCreating(true)} />}
      </div>

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {!entries && !error && <Spinner size={SpinnerSize.medium} label="Načítám protokoly…" />}
      {entries && entries.length === 0 && !project.isOverhead && <MessageBar messageBarType={MessageBarType.info}>Tento projekt zatím nemá žádný předávací protokol.</MessageBar>}
      {entries && entries.length > 0 && (
        <StickyHScroll scrollSelector=".ms-DetailsList">
          <EntriesTable entries={entries} hideProject protocols onOpen={(id) => setOpenId(id)} ariaLabel="Seznam předávacích protokolů" />
        </StickyHScroll>
      )}

      <EntryPanel
        isOpen={openId !== undefined || creating}
        entryId={openId}
        projectNumber={project.projectNumber}
        kind="predani"
        onDismiss={() => {
          setOpenId(undefined);
          setCreating(false);
        }}
        onChanged={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
};
