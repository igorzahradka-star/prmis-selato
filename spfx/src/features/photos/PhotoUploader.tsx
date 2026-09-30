/**
 * Fotodokumentace projektu: velká tlačítka Vyfotit / Z galerie, fronta nahrávání a dnešní fotky projektu.
 *
 * Určeno hlavně pro mobil. Fotky se po jedné zmenší (delší strana nejvýš 2 000 bodů, JPEG), pojmenují podle času
 * pořízení (a volitelného popisu) a uloží do složky projektu `…/FOTO/rok/den`; složky vznikají samy. Když nahrávání selže
 * (slabý signál), fotka zůstane ve frontě a jde ji poslat znovu — stránku je ale potřeba nechat otevřenou.
 */

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
import { UploadState, buildPhotoName, folderLink, photoFolderPath, photoYearFolderPath, uploadSummary } from '../../core/photos';
import { extensionForType, resizeImage } from '../diary/imageUtils';
import { ProjectFile } from '../../data/repositories';

interface QueueItem {
  id: number;
  file: File;
  preview?: string;
  state: UploadState;
  error?: string;
  savedName?: string;
}

export const PhotoUploader: React.FC<{ project: Project }> = ({ project }) => {
  const { repos, settings } = useApp();
  const [items, setItems] = React.useState<QueueItem[]>([]);
  const [tag, setTag] = React.useState('');
  const [gallery, setGallery] = React.useState<ProjectFile[] | undefined>(undefined);
  const [galleryError, setGalleryError] = React.useState<string | undefined>(undefined);

  const cameraRef = React.useRef<HTMLInputElement>(null);
  const pickRef = React.useRef<HTMLInputElement>(null);
  const itemsRef = React.useRef<QueueItem[]>([]);
  const nextId = React.useRef(1);
  const running = React.useRef(false);
  const tagRef = React.useRef('');
  const namesByFolder = React.useRef<Map<string, string[]>>(new Map());
  const projectRef = React.useRef(project);
  projectRef.current = project;
  tagRef.current = tag;

  const todayFolder = photoFolderPath(settings.folders.photoFolder, new Date());

  const loadGallery = React.useCallback((): void => {
    if (!project.folderUrl) {
      setGallery([]);
      return;
    }
    repos.documents
      .listFolderFiles(project, todayFolder)
      .then((list) => {
        setGallery(list);
        setGalleryError(undefined);
        namesByFolder.current.set(todayFolder, list.map((f) => f.name));
      })
      .catch((e: Error) => setGalleryError(e.message));
  }, [repos, project, todayFolder]);

  // Při změně projektu se fronta i dnešní fotky načtou znovu.
  React.useEffect(() => {
    setItems([]);
    itemsRef.current = [];
    setGallery(undefined);
    namesByFolder.current = new Map();
    loadGallery();
  }, [project.projectNumber, loadGallery]);

  const update = (id: number, patch: Partial<QueueItem>): void => {
    itemsRef.current = itemsRef.current.map((i) => (i.id === id ? { ...i, ...patch } : i));
    setItems(itemsRef.current);
  };

  const namesIn = async (folder: string): Promise<string[]> => {
    const known = namesByFolder.current.get(folder);
    if (known) {
      return known;
    }
    let names: string[] = [];
    try {
      names = (await repos.documents.listFolderFiles(projectRef.current, folder)).map((f) => f.name);
    } catch {
      names = [];
    }
    namesByFolder.current.set(folder, names);
    return names;
  };

  /** Nahrává fronta po jedné fotce; další se bere, až předchozí skončí (úspěchem i chybou). */
  const pump = async (): Promise<void> => {
    if (running.current) {
      return;
    }
    running.current = true;
    try {
      let next = itemsRef.current.filter((i) => i.state === 'ceka')[0];
      while (next) {
        update(next.id, { state: 'nahrava', error: undefined });
        try {
          const blob = await resizeImage(next.file);
          const taken = new Date(next.file.lastModified || Date.now());
          const folder = photoFolderPath(settings.folders.photoFolder, taken);
          const namesHere = await namesIn(folder);
          const name = buildPhotoName(taken, tagRef.current, namesHere, extensionForType(blob.type) || '.jpg');
          await repos.documents.saveProjectFile(projectRef.current, folder, name, blob);
          namesByFolder.current.set(folder, [...namesHere, name]);
          update(next.id, { state: 'hotovo', savedName: name });
        } catch (e) {
          update(next.id, { state: 'chyba', error: e instanceof Error ? e.message : String(e) });
        }
        next = itemsRef.current.filter((i) => i.state === 'ceka')[0];
      }
    } finally {
      running.current = false;
      loadGallery();
    }
  };

  const addFiles = (list: File[]): void => {
    const images = list.filter((f) => f.type.indexOf('image/') === 0 || /\.(jpe?g|png|webp|gif|heic)$/i.test(f.name));
    if (images.length === 0) {
      return;
    }
    const created: QueueItem[] = images.map((file) => ({
      id: nextId.current++,
      file,
      preview: typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : undefined,
      state: 'ceka'
    }));
    itemsRef.current = [...itemsRef.current, ...created];
    setItems(itemsRef.current);
    pump().catch(() => undefined);
  };

  const retry = (id: number): void => {
    update(id, { state: 'ceka', error: undefined });
    pump().catch(() => undefined);
  };

  const retryAll = (): void => {
    itemsRef.current = itemsRef.current.map((i) => (i.state === 'chyba' ? { ...i, state: 'ceka', error: undefined } : i));
    setItems(itemsRef.current);
    pump().catch(() => undefined);
  };

  const remove = (id: number): void => {
    const gone = itemsRef.current.filter((i) => i.id === id)[0];
    if (gone && gone.preview && typeof URL !== 'undefined') {
      URL.revokeObjectURL(gone.preview);
    }
    itemsRef.current = itemsRef.current.filter((i) => i.id !== id);
    setItems(itemsRef.current);
  };

  const clearDone = (): void => {
    itemsRef.current.filter((i) => i.state === 'hotovo').forEach((i) => i.preview && URL.revokeObjectURL(i.preview));
    itemsRef.current = itemsRef.current.filter((i) => i.state !== 'hotovo');
    setItems(itemsRef.current);
  };

  if (!project.folderUrl) {
    return (
      <MessageBar messageBarType={MessageBarType.warning} isMultiline>
        Projekt {project.projectNumber} nemá složku, kam by se fotky uložily. Složku doplňte v detailu projektu.
      </MessageBar>
    );
  }

  const now = new Date();
  const folderUrl = folderLink(project.folderUrl, photoYearFolderPath(settings.folders.photoFolder, now.getFullYear()));
  const states = items.map((i) => i.state);
  const hasFailed = states.indexOf('chyba') !== -1;
  const hasDone = states.indexOf('hotovo') !== -1;
  const busy = states.indexOf('nahrava') !== -1 || states.indexOf('ceka') !== -1;
  const bigButton = { root: { height: 64, fontSize: 18, flex: '1 1 220px' }, icon: { fontSize: 22 } };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          e.target.value = '';
          addFiles(list);
        }}
      />
      <input
        ref={pickRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          e.target.value = '';
          addFiles(list);
        }}
      />

      <TextField
        label="Popis fotek (nepovinný)"
        placeholder="např. panely jih, rozvaděč R1, kabelová trasa"
        value={tag}
        onChange={(_, v) => setTag(v ?? '')}
        description="Přidá se do názvu souboru. Platí pro fotky, které teprve nahrajete."
      />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <PrimaryButton iconProps={{ iconName: 'Camera' }} text="Vyfotit" onClick={() => cameraRef.current && cameraRef.current.click()} styles={bigButton} />
        <DefaultButton iconProps={{ iconName: 'Photo2' }} text="Vybrat z galerie" onClick={() => pickRef.current && pickRef.current.click()} styles={bigButton} />
      </div>

      {items.length > 0 && (
        <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <strong style={{ color: RES.navy }}>Nahrávání</strong>
            <span style={{ fontSize: 13, color: RES.gray }}>{uploadSummary(states)}</span>
            <span style={{ flex: '1 1 auto' }} />
            {hasFailed && <DefaultButton text="Zkusit znovu vše" onClick={retryAll} />}
            {hasDone && <DefaultButton text="Skrýt hotové" onClick={clearDone} />}
          </div>
          {busy && (
            <div style={{ fontSize: 12, color: RES.gray, marginBottom: 6 }}>Nechte prosím stránku otevřenou, dokud se fotky nenahrají.</div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {items.map((i) => (
              <div key={i.id} style={{ width: 104, position: 'relative' }}>
                <div
                  style={{
                    height: 78,
                    background: RES.background,
                    borderRadius: 3,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: i.state === 'hotovo' ? 1 : 0.75
                  }}
                >
                  {i.preview ? <img src={i.preview} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }} /> : <Icon iconName="Photo2" />}
                </div>
                <div style={{ fontSize: 11, marginTop: 2, color: i.state === 'chyba' ? RES.red : i.state === 'hotovo' ? RES.greenDark : RES.gray }}>
                  {i.state === 'ceka' && 'čeká'}
                  {i.state === 'nahrava' && <Spinner size={SpinnerSize.xSmall} label="nahrávám" labelPosition="right" styles={{ root: { justifyContent: 'flex-start' } }} />}
                  {i.state === 'hotovo' && '✓ nahráno'}
                  {i.state === 'chyba' && (
                    <span title={i.error}>
                      nepovedlo se · <Link onClick={() => retry(i.id)}>znovu</Link>
                    </span>
                  )}
                </div>
                {i.state !== 'nahrava' && (
                  <IconButton
                    iconProps={{ iconName: 'Cancel' }}
                    ariaLabel="Odebrat z fronty"
                    title="Odebrat z fronty"
                    onClick={() => remove(i.id)}
                    styles={{ root: { position: 'absolute', top: 2, right: 2, width: 22, height: 22, background: 'rgba(255,255,255,0.9)', borderRadius: 11 }, icon: { fontSize: 10 } }}
                  />
                )}
              </div>
            ))}
          </div>
          {hasFailed && (
            <div style={{ fontSize: 12, color: RES.red, marginTop: 6 }}>
              {items.filter((i) => i.state === 'chyba')[0].error}
            </div>
          )}
        </div>
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
          <strong style={{ color: RES.navy }}>
            Dnešní fotky projektu{gallery ? ` (${gallery.length})` : ''}
          </strong>
          <span style={{ flex: '1 1 auto' }} />
          <ExternalLink href={folderUrl}>Otevřít složku FOTO</ExternalLink>
        </div>
        {galleryError && (
          <MessageBar messageBarType={MessageBarType.warning} isMultiline>
            {galleryError}
          </MessageBar>
        )}
        {!gallery && !galleryError && <Spinner size={SpinnerSize.small} label="Načítám…" />}
        {gallery && gallery.length === 0 && <div style={{ fontSize: 13, color: RES.gray }}>Dnes zatím nejsou žádné fotky. Složka {todayFolder} vznikne při první nahrané fotce.</div>}
        {gallery && gallery.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {gallery
              .slice()
              .reverse()
              .map((f) => (
                <ExternalLink key={f.name} href={f.url} title={f.name} styles={{ root: { display: 'block' } }}>
                  <img src={f.url} alt={f.name} style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 3, background: RES.background, display: 'block' }} />
                </ExternalLink>
              ))}
          </div>
        )}
        <div style={{ fontSize: 11, color: RES.gray, marginTop: 6 }}>Fotky se ukládají do složky projektu: {todayFolder}</div>
      </div>
    </div>
  );
};
