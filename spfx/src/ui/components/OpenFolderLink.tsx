/**
 * Odkaz „Otevřít složku“: adresu složky zjistí v SharePointu až po kliknutí (tolerantně — viz `openFolderInNewTab`) a otevře ji v nové kartě.
 */

import * as React from 'react';
import { Link } from '@fluentui/react/lib/Link';

import { useApp } from '../AppContext';
import { RES } from '../theme';
import { Project } from '../../core/types';
import { openFolderInNewTab } from '../openFolder';

export const OpenFolderLink: React.FC<{ project: Project; relativeFolder: string; text: string }> = ({ project, relativeFolder, text }) => {
  const { repos } = useApp();
  const [message, setMessage] = React.useState<string | undefined>(undefined);
  return (
    <>
      {message && (
        <span role="alert" style={{ color: RES.red, fontSize: 12, marginRight: 8 }}>
          {message}
        </span>
      )}
      <Link
        onClick={() => {
          setMessage(undefined);
          openFolderInNewTab(repos.documents, project, relativeFolder)
            .then((m) => {
              setMessage(m);
              if (m) {
                window.setTimeout(() => setMessage(undefined), 8000);
              }
            })
            .catch(() => undefined);
        }}
      >
        {text}
      </Link>
    </>
  );
};
