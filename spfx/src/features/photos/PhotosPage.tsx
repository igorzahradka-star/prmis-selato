/**
 * Fotodokumentace — stránka určená hlavně pro mobil: vybrat projekt, vyfotit, hotovo. Fotky se samy uloží do složky
 * projektu `…/FOTO/rok/den`. Naposledy zvolený projekt si prohlížeč pamatuje, aby se na stavbě nemuselo vybírat pořád dokola.
 */

import * as React from 'react';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { PageHeading } from '../../ui/components/PageHeading';
import { Project } from '../../core/types';
import { canWriteDiary } from '../../core/siteDiary';
import { toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { PhotoUploader } from './PhotoUploader';

const STORAGE_KEY = 'prm-photo-project';

function remembered(): string | undefined {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || undefined;
  } catch {
    return undefined;
  }
}

function remember(projectNumber: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, projectNumber);
  } catch {
    // Bez úložiště se volba jen nezapamatuje.
  }
}

export const PhotosPage: React.FC = () => {
  const { repos, user } = useApp();
  const [projects, setProjects] = React.useState<Project[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [selected, setSelected] = React.useState<string | undefined>(remembered());

  React.useEffect(() => {
    let cancelled = false;
    repos.projects
      .list({})
      .then((p) => !cancelled && setProjects(p))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [repos]);

  const actor = React.useMemo(() => toActor(user), [user]);
  const writable = React.useMemo(() => (projects ?? []).filter((p) => canWriteDiary(toWorkflowProject(p), actor)), [projects, actor]);
  const options: IDropdownOption[] = writable
    .slice()
    .sort((a, b) => b.projectNumber.localeCompare(a.projectNumber, 'cs-CZ', { numeric: true }))
    .map((p) => ({ key: p.projectNumber, text: `${p.projectNumber} · ${p.shortName || p.title}` }));
  const project = writable.filter((p) => p.projectNumber === selected)[0];

  return (
    <>
      <PageHeading
        title="Fotodokumentace"
        subtitle="Vyfoťte stavbu a fotky se samy uloží do složky projektu (FOTO / rok / den). Na mobilu otevřete aplikaci v SharePointu nebo v prohlížeči."
      />

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {!projects && !error && <Spinner size={SpinnerSize.large} label="Načítám projekty…" />}
      {projects && writable.length === 0 && (
        <MessageBar messageBarType={MessageBarType.info} isMultiline>
          Nemáte žádný projekt, do kterého byste mohli nahrávat fotky. Fotky nahrává projektový manažer, asistent projektu a vedení.
        </MessageBar>
      )}

      {writable.length > 0 && (
        <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Dropdown
            label="Projekt"
            options={options}
            selectedKey={project ? project.projectNumber : null}
            placeholder="Vyberte projekt"
            onChange={(_, o) => {
              if (o) {
                setSelected(String(o.key));
                remember(String(o.key));
              }
            }}
          />
          {project && <PhotoUploader project={project} />}
        </div>
      )}
    </>
  );
};
