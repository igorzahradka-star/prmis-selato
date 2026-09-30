/**
 * Dokumenty projektu (zadání kap. 8.4).
 *
 * Ukazuje naposledy změněné soubory ve složce projektu. Aplikace si nic
 * nekopíruje — čte přímo knihovnu SharePointu, takže seznam odpovídá tomu,
 * co je ve složce právě teď.
 *
 * Proč vůbec: prohlížeč neumí otevřít Průzkumníka. Bez tohohle seznamu
 * by se člověk k souborům dostal jen přes odkaz na složku a hledal by
 * ručně, co se změnilo.
 *
 * Číslované dokumenty (objednávky, podklady pro fakturaci, protokoly)
 * přibudou na tuhle záložku ve Fázi 2.
 */

import * as React from 'react';
import { DetailsList, DetailsListLayoutMode, IColumn, SelectionMode } from '@fluentui/react/lib/DetailsList';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { DefaultButton } from '@fluentui/react/lib/Button';
import { ExternalLink, EXTERNAL_LINK_PROPS } from '../../ui/components/ExternalLink';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { Project } from '../../core/types';
import { formatDateTime } from '../../core/format';
import { ProjectFile } from '../../data/repositories';
import { formatFileSize } from '../../data/sharepoint/documentQuery';

/** Kolik posledních změn se ukazuje. Víc už není přehled, ale výpis složky. */
const POCET = 10;

export const DocumentsTab: React.FC<{ project: Project }> = ({ project }) => {
  const { repos } = useApp();

  const [files, setFiles] = React.useState<ProjectFile[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setFiles(undefined);
    setError(undefined);
    repos.documents
      .listRecentFiles(project, POCET)
      .then((data) => {
        if (!cancelled) {
          setFiles(data);
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
  }, [repos, project.projectNumber, project.folderUrl, reloadKey]);

  if (!project.folderUrl) {
    return (
      <div style={{ marginTop: 16 }}>
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          Projekt nemá založenou složku, takže není co zobrazit. Složku můžete doplnit v detailu
          projektu — tlačítkem „Zkusit znovu založit složky&ldquo; v průvodci, nebo ji založit ručně
          v knihovně projektů.
        </MessageBar>
      </div>
    );
  }

  const columns: IColumn[] = [
    {
      key: 'name',
      name: 'Soubor',
      minWidth: 240,
      isResizable: true,
      onRender: (f: ProjectFile) => (
        <ExternalLink href={f.url} title={`Otevřít ${f.name}`}>
          {f.name}
        </ExternalLink>
      )
    },
    {
      key: 'relativeFolder',
      name: 'Složka',
      minWidth: 150,
      maxWidth: 220,
      isResizable: true,
      onRender: (f: ProjectFile) =>
        f.relativeFolder ? (
          f.relativeFolder
        ) : (
          <span style={{ color: RES.gray }}>kořen složky projektu</span>
        )
    },
    {
      key: 'modified',
      name: 'Změněno',
      minWidth: 140,
      maxWidth: 170,
      isResizable: true,
      onRender: (f: ProjectFile) => formatDateTime(f.modified)
    },
    {
      key: 'modifiedByName',
      name: 'Kdo',
      minWidth: 120,
      maxWidth: 170,
      isResizable: true,
      onRender: (f: ProjectFile) => f.modifiedByName || '—'
    },
    {
      key: 'sizeBytes',
      name: 'Velikost',
      minWidth: 80,
      maxWidth: 100,
      isResizable: true,
      onRender: (f: ProjectFile) => formatFileSize(f.sizeBytes)
    }
  ];

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <p style={{ margin: 0, flex: '1 1 auto', color: RES.gray, fontSize: 13 }}>
          Posledních {POCET} změněných souborů ve složce projektu, včetně podsložek. Soubory se
          otevírají v SharePointu — aplikace je nikam nekopíruje.
        </p>
        <DefaultButton
          iconProps={{ iconName: 'Refresh' }}
          text="Načíst znovu"
          onClick={() => setReloadKey((k) => k + 1)}
        />
        <DefaultButton
          iconProps={{ iconName: 'FolderHorizontal' }}
          text="Otevřít složku"
          href={project.folderUrl}
          {...EXTERNAL_LINK_PROPS}
        />
      </div>

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}

      {!files && !error && <Spinner size={SpinnerSize.medium} label="Načítám soubory…" />}

      {files && files.length === 0 && !error && (
        <MessageBar messageBarType={MessageBarType.info}>
          Ve složce projektu zatím nejsou žádné soubory.
        </MessageBar>
      )}

      {files && files.length > 0 && (
        <DetailsList
          items={files}
          columns={columns}
          selectionMode={SelectionMode.none}
          layoutMode={DetailsListLayoutMode.justified}
          compact
        />
      )}
    </div>
  );
};
