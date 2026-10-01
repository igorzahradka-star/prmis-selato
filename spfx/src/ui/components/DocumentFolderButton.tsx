/**
 * Tlačítko se symbolem složky: otevře v nové kartě složku, kde leží soubory dokumentu (objednávky, podkladu pro fakturaci, zápisu)
 * ve složce projektu v SharePointu — aby šel soubor rovnou vzít a odeslat. Vkládá se do hlavičky panelu dokumentu.
 */

import * as React from 'react';
import { IconButton } from '@fluentui/react/lib/Button';

import { Project } from '../../core/types';
import { folderLink } from '../../core/photos';
import { EXTERNAL_LINK_PROPS } from './ExternalLink';

export const DocumentFolderButton: React.FC<{ project?: Project; relativeFolder: string; title?: string }> = ({
  project,
  relativeFolder,
  title = 'Otevřít složku s dokumentem v SharePointu (nová karta)'
}) => {
  const href = project && project.folderUrl ? folderLink(project.folderUrl, relativeFolder) : undefined;
  return (
    <IconButton
      iconProps={{ iconName: 'FolderOpen' }}
      title={href ? title : 'Projekt nemá složku v SharePointu'}
      ariaLabel="Otevřít složku s dokumentem"
      href={href}
      disabled={!href}
      {...EXTERNAL_LINK_PROPS}
      styles={{ root: { marginRight: 4 } }}
    />
  );
};
