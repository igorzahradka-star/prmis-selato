/**
 * Fotodokumentace projektu: seznam dávek (složek ve složce FOTO) jako galerie tříděná podle složek.
 *
 * Čte se přímo SharePoint, takže se po tlačítku Aktualizovat objeví i složky a fotky vložené mimo aplikaci. Dávka se rozbalí
 * na miniatury s poznámkami; kliknutí na fotku ji otevře v nové záložce. Tlačítko „Nahrát fotky“ otevře nahrávání (nová dávka),
 * „Přidat fotky“ u dávky přidá fotky do ní.
 */

import { folderFor } from '../../core/projectFolders';
import * as React from 'react';
import { PrimaryButton, DefaultButton, IconButton } from '@fluentui/react/lib/Button';
import { TextField } from '@fluentui/react/lib/TextField';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { Icon } from '@fluentui/react/lib/Icon';
import { Link } from '@fluentui/react/lib/Link';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { ExternalLink } from '../../ui/components/ExternalLink';
import { Project } from '../../core/types';
import { formatDate } from '../../core/format';
import { folderLink, parentUrl } from '../../core/photos';
import { canWriteDiary } from '../../core/siteDiary';
import { toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { ProjectFile } from '../../data/repositories';
import { PhotoUploader } from './PhotoUploader';
import { PhotoBatch, batchFolderOf, loadBatches } from './photoBatches';

/** Miniatura; když se náhled nenačte (starší soubor, chybí oprávnění k náhledu), použije se původní fotka. */
const Thumb: React.FC<{ file: ProjectFile; size: number }> = ({ file, size }) => {
  const [src, setSrc] = React.useState(file.thumbnailUrl || file.url);
  React.useEffect(() => setSrc(file.thumbnailUrl || file.url), [file.thumbnailUrl, file.url]);
  return (
    <ExternalLink href={file.url} title={file.name} styles={{ root: { display: 'block' } }}>
      <img
        src={src}
        alt={file.note || file.name}
        loading="lazy"
        onError={() => src !== file.url && setSrc(file.url)}
        style={{ width: size, height: Math.round(size * 0.75), objectFit: 'cover', borderRadius: 3, background: RES.background, display: 'block' }}
      />
    </ExternalLink>
  );
};

/** Fotky jedné dávky s poznámkami; poznámku jde upravit. */
const BatchPhotos: React.FC<{ project: Project; folder: string; reloadKey: number; canEdit: boolean }> = ({ project, folder, reloadKey, canEdit }) => {
  const { repos } = useApp();
  const [photos, setPhotos] = React.useState<ProjectFile[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [editing, setEditing] = React.useState<string | undefined>(undefined);
  const [draft, setDraft] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setError(undefined);
    repos.documents
      .listPhotos(project, folder)
      .then((p) => !cancelled && setPhotos(p))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [repos, project, folder, reloadKey]);

  const saveNote = (file: ProjectFile): void => {
    setBusy(true);
    repos.documents
      .setFileNote(project, folder, file.name, draft)
      .then(() => {
        setPhotos((cur) => (cur || []).map((p) => (p.name === file.name ? { ...p, note: draft.trim() === '' ? undefined : draft.trim() } : p)));
        setEditing(undefined);
        setBusy(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setBusy(false);
      });
  };

  if (error) {
    return (
      <MessageBar messageBarType={MessageBarType.warning} isMultiline>
        {error}
      </MessageBar>
    );
  }
  if (!photos) {
    return <Spinner size={SpinnerSize.small} label="Načítám fotky…" />;
  }
  if (photos.length === 0) {
    return <div style={{ fontSize: 13, color: RES.gray }}>V této složce nejsou žádné fotky (obrázky).</div>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      {photos.map((f) => (
        <div key={f.name} style={{ width: 168 }}>
          <Thumb file={f} size={168} />
          {editing === f.name ? (
            <div style={{ marginTop: 4 }}>
              <TextField value={draft} maxLength={250} autoFocus onChange={(_, v) => setDraft(v ?? '')} placeholder="Poznámka k fotce" />
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <PrimaryButton text="Uložit" disabled={busy} onClick={() => saveNote(f)} />
                <DefaultButton text="Zrušit" disabled={busy} onClick={() => setEditing(undefined)} />
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, marginTop: 3, color: f.note ? RES.text : RES.gray, wordBreak: 'break-word' }}>
              {f.note}
              {canEdit && (
                <Link
                  onClick={() => {
                    setDraft(f.note || '');
                    setEditing(f.name);
                  }}
                  styles={{ root: { marginLeft: f.note ? 6 : 0, fontSize: 12 } }}
                >
                  {f.note ? 'upravit' : 'přidat poznámku'}
                </Link>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export const ProjectPhotos: React.FC<{ project: Project }> = ({ project }) => {
  const { repos, settings, user } = useApp();
  const [batches, setBatches] = React.useState<PhotoBatch[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const [uploader, setUploader] = React.useState<{ preset?: PhotoBatch } | undefined>(undefined);
  const [reloadKey, setReloadKey] = React.useState(0);

  const base = folderFor(project, 'photos', settings.folders);
  const mayWrite = canWriteDiary(toWorkflowProject(project), toActor(user));

  const load = React.useCallback((): void => {
    setError(undefined);
    loadBatches(repos.documents, project, base)
      .then((b) => setBatches(b))
      .catch((e: Error) => setError(e.message));
  }, [repos, project, base]);

  React.useEffect(() => {
    setBatches(undefined);
    if (project.folderUrl) {
      load();
    }
  }, [load, project.folderUrl]);

  if (!project.folderUrl) {
    return (
      <MessageBar messageBarType={MessageBarType.warning} isMultiline>
        Projekt {project.projectNumber} nemá složku, kde by byly fotky. Složku doplňte v detailu projektu.
      </MessageBar>
    );
  }

  const refresh = (): void => {
    setReloadKey((k) => k + 1);
    load();
  };
  const allOpen = batches !== undefined && batches.length > 0 && batches.every((b) => open[b.path]);
  const toggleAll = (): void => {
    const next: Record<string, boolean> = {};
    (batches || []).forEach((b) => (next[b.path] = !allOpen));
    setOpen(next);
  };
  const fotoFolderUrl =
    batches && batches.length > 0 && batches[0].path.indexOf('/') === -1 ? parentUrl(batches[0].url) : folderLink(project.folderUrl, base);

  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', color: RES.gray, fontSize: 13 }}>
          Fotodokumentace projektu {project.projectNumber}. Každá dávka je složka ve složce FOTO. Fotky vložené do složek mimo aplikaci se zobrazí po
          kliknutí na Aktualizovat.
        </div>
        <DefaultButton iconProps={{ iconName: 'Refresh' }} text="Aktualizovat" onClick={refresh} />
        {batches && batches.length > 0 && <DefaultButton text={allOpen ? 'Sbalit vše' : 'Rozbalit vše'} onClick={toggleAll} />}
        <ExternalLink href={fotoFolderUrl}>Otevřít složku FOTO</ExternalLink>
        {mayWrite && !uploader && (
          <PrimaryButton iconProps={{ iconName: 'Camera' }} text="Nahrát fotky" onClick={() => setUploader({})} />
        )}
      </div>

      {!mayWrite && (
        <MessageBar messageBarType={MessageBarType.info} isMultiline>
          Fotky nahrává projektový manažer, asistent projektu a vedení. Prohlížet je můžete tady i ve složce projektu.
        </MessageBar>
      )}

      {uploader && mayWrite && (
        <PhotoUploader
          key={uploader.preset ? uploader.preset.path : 'nova'}
          project={project}
          presetBatch={uploader.preset}
          onUploaded={refresh}
          onClose={() => {
            setUploader(undefined);
            refresh();
          }}
        />
      )}

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {!batches && !error && <Spinner size={SpinnerSize.medium} label="Načítám dávky fotek…" />}
      {batches && batches.length === 0 && !error && (
        <MessageBar messageBarType={MessageBarType.info} isMultiline>
          Zatím tu nejsou žádné fotky. {mayWrite ? 'Tlačítkem Nahrát fotky přidáte první dávku.' : ''}
        </MessageBar>
      )}

      {(batches || []).map((b) => {
        const isOpen = !!open[b.path];
        return (
          <section key={b.path} style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', flexWrap: 'wrap' }}>
              <IconButton
                iconProps={{ iconName: isOpen ? 'ChevronDown' : 'ChevronRight' }}
                ariaLabel={isOpen ? 'Sbalit dávku' : 'Rozbalit dávku'}
                onClick={() => setOpen((cur) => ({ ...cur, [b.path]: !isOpen }))}
              />
              <Icon iconName="FolderHorizontal" style={{ color: RES.gray }} />
              <div style={{ flex: '1 1 220px', cursor: 'pointer' }} onClick={() => setOpen((cur) => ({ ...cur, [b.path]: !isOpen }))}>
                <div style={{ fontWeight: 600, color: RES.navy }}>{b.title || b.name}</div>
                <div style={{ fontSize: 12, color: RES.gray }}>
                  {b.date ? formatDate(b.date) : b.name} · {b.itemCount} {b.itemCount === 1 ? 'položka' : b.itemCount > 1 && b.itemCount < 5 ? 'položky' : 'položek'}
                </div>
              </div>
              {mayWrite && <DefaultButton iconProps={{ iconName: 'Add' }} text="Přidat fotky" onClick={() => setUploader({ preset: b })} />}
              <ExternalLink href={b.url}>Otevřít složku</ExternalLink>
            </div>
            {isOpen && (
              <div style={{ padding: '4px 14px 14px' }}>
                <BatchPhotos project={project} folder={batchFolderOf(base, b)} reloadKey={reloadKey} canEdit={mayWrite} />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};
