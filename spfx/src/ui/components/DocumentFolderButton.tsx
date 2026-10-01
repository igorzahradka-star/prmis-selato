/**
 * Tlačítko se symbolem složky: otevře v nové kartě složku, kde leží soubory dokumentu (objednávky, podkladu pro fakturaci, zápisu)
 * ve složce projektu v SharePointu — aby šel soubor rovnou vzít a odeslat. Vkládá se do hlavičky panelu dokumentu.
 *
 * Adresa složky se zjišťuje v SharePointu až po kliknutí (viz `openFolderInNewTab`), takže funguje i u starších dokumentů.
 */

import * as React from 'react';
import { IconButton } from '@fluentui/react/lib/Button';

import { useApp } from '../AppContext';
import { RES } from '../theme';
import { Project } from '../../core/types';
import { openFolderInNewTab } from '../openFolder';

export const DocumentFolderButton: React.FC<{ project?: Project; relativeFolder: string; title?: string }> = ({
  project,
  relativeFolder,
  title = 'Otevřít složku s dokumentem v SharePointu (nová karta)'
}) => {
  const { repos } = useApp();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | undefined>(undefined);

  const open = (): void => {
    if (!project) {
      return;
    }
    setBusy(true);
    setMessage(undefined);
    openFolderInNewTab(repos.documents, project, relativeFolder)
      .then((m) => {
        setBusy(false);
        setMessage(m);
        if (m) {
          window.setTimeout(() => setMessage(undefined), 8000);
        }
      })
      .catch(() => setBusy(false));
  };

  const available = !!project && !!project.folderUrl;
  return (
    <>
      {message && (
        <span role="alert" style={{ color: RES.red, fontSize: 12, marginRight: 6, maxWidth: 260 }}>
          {message}
        </span>
      )}
      <IconButton
        iconProps={{ iconName: 'FolderOpen' }}
        title={available ? title : 'Projekt nemá složku v SharePointu'}
        ariaLabel="Otevřít složku s dokumentem"
        disabled={!available || busy}
        onClick={open}
        styles={{ root: { marginRight: 4 } }}
      />
    </>
  );
};
