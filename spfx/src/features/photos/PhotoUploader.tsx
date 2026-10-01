/**
 * Fotodokumentace projektu po **dávkách**.
 *
 * 1. krok — nová dávka: zvolí se, do které složky podle data fotky půjdou (dnešní den vložení, nebo den pořízení každé fotky),
 *    a volitelný jednoslovný přídomek (např. KD = kontrolní den). Složka dávky se jmenuje `rok-měsíc-den_PŘÍDOMEK`.
 * 2. krok — do dávky se vkládají fotky: velká tlačítka Vyfotit / Vybrat z galerie, fronta nahrávání s opakováním.
 *
 * Určeno hlavně pro mobil. Fotky se po jedné zmenší (delší strana nejvýš 2 000 bodů, JPEG), pojmenují podle času pořízení a uloží do
 * složky projektu `…/FOTO/rok/den_přídomek`; složky vznikají samy (a už existující složka se najde i při trochu jiném psaní názvu).
 * Když nahrávání selže (slabý signál), fotka zůstane ve frontě a jde ji poslat znovu — stránku je ale potřeba nechat otevřenou.
 */

import * as React from 'react';
import { PrimaryButton, DefaultButton, IconButton } from '@fluentui/react/lib/Button';
import { TextField } from '@fluentui/react/lib/TextField';
import { ChoiceGroup, IChoiceGroupOption } from '@fluentui/react/lib/ChoiceGroup';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { Icon } from '@fluentui/react/lib/Icon';
import { Link } from '@fluentui/react/lib/Link';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { ExternalLink } from '../../ui/components/ExternalLink';
import { Project } from '../../core/types';
import {
  BATCH_TAG_MAX,
  PhotoDateMode,
  UploadState,
  batchFolderName,
  batchTag,
  buildPhotoName,
  folderLink,
  parentUrl,
  photoDay,
  photoFolderPath,
  photoYearFolderPath,
  uploadSummary
} from '../../core/photos';
import { formatDate } from '../../core/format';
import { extensionForType, resizeImage } from '../diary/imageUtils';
import { ProjectFile } from '../../data/repositories';

interface QueueItem {
  id: number;
  file: File;
  preview?: string;
  state: UploadState;
  error?: string;
}

interface Batch {
  tag: string;
  mode: PhotoDateMode;
  /** Den, ve kterém se dávka založila (u režimu „den vložení" je to den složky). */
  day: Date;
}

export const PhotoUploader: React.FC<{ project: Project }> = ({ project }) => {
  const { repos, settings } = useApp();
  const [batch, setBatch] = React.useState<Batch | undefined>(undefined);
  const [tagInput, setTagInput] = React.useState('');
  const [mode, setMode] = React.useState<PhotoDateMode>('vlozeni');
  const [items, setItems] = React.useState<QueueItem[]>([]);
  const [gallery, setGallery] = React.useState<ProjectFile[] | undefined>(undefined);
  const [galleryError, setGalleryError] = React.useState<string | undefined>(undefined);
  const [existingCount, setExistingCount] = React.useState<number | undefined>(undefined);
  const [savedFolderUrl, setSavedFolderUrl] = React.useState<string | undefined>(undefined);

  const cameraRef = React.useRef<HTMLInputElement>(null);
  const pickRef = React.useRef<HTMLInputElement>(null);
  const itemsRef = React.useRef<QueueItem[]>([]);
  const nextId = React.useRef(1);
  const running = React.useRef(false);
  const batchRef = React.useRef<Batch | undefined>(undefined);
  const namesByFolder = React.useRef<Map<string, string[]>>(new Map());
  const projectRef = React.useRef(project);
  projectRef.current = project;
  batchRef.current = batch;

  const base = settings.folders.photoFolder;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const tag = batchTag(tagInput);
  /** Složka, do které by se uložilo, kdyby se dávka založila právě teď (náhled v 1. kroku). */
  const previewFolder = photoFolderPath(base, todayStart, tag);

  // Při změně projektu se dávka i fronta zahodí.
  React.useEffect(() => {
    setBatch(undefined);
    setItems([]);
    itemsRef.current = [];
    setGallery(undefined);
    setExistingCount(undefined);
    setSavedFolderUrl(undefined);
    namesByFolder.current = new Map();
  }, [project.projectNumber]);

  /** Fotky ve složce dávky (jen u dne vložení — u dne pořízení může jít jedna dávka do víc složek). */
  const loadGallery = React.useCallback((): void => {
    const b = batchRef.current;
    if (!b || b.mode !== 'vlozeni' || !projectRef.current.folderUrl) {
      return;
    }
    const folder = photoFolderPath(base, b.day, b.tag);
    repos.documents
      .listFolderFiles(projectRef.current, folder)
      .then((list) => {
        setGallery(list);
        setGalleryError(undefined);
        namesByFolder.current.set(
          folder,
          list.map((f) => f.name)
        );
      })
      .catch((e: Error) => setGalleryError(e.message));
  }, [repos, base]);

  const startBatch = (): void => {
    const b: Batch = { tag, mode, day: todayStart };
    batchRef.current = b;
    setBatch(b);
    setItems([]);
    itemsRef.current = [];
    setGallery(undefined);
    setSavedFolderUrl(undefined);
    setExistingCount(undefined);
    if (mode === 'vlozeni') {
      const folder = photoFolderPath(base, b.day, b.tag);
      repos.documents
        .listFolderFiles(project, folder)
        .then((list) => {
          setExistingCount(list.length);
          setGallery(list);
          namesByFolder.current.set(
            folder,
            list.map((f) => f.name)
          );
        })
        .catch((e: Error) => setGalleryError(e.message));
    }
  };

  const finishBatch = (): void => {
    itemsRef.current.forEach((i) => i.preview && URL.revokeObjectURL(i.preview));
    itemsRef.current = [];
    setItems([]);
    setBatch(undefined);
    setGallery(undefined);
    setExistingCount(undefined);
    setSavedFolderUrl(undefined);
    setTagInput('');
  };

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
          const b = batchRef.current as Batch;
          const blob = await resizeImage(next.file);
          const taken = new Date(next.file.lastModified || Date.now());
          const folder = photoFolderPath(base, photoDay(b.mode, taken, b.day), b.tag);
          const namesHere = await namesIn(folder);
          const name = buildPhotoName(taken, namesHere, extensionForType(blob.type) || '.jpg');
          const url = await repos.documents.saveProjectFile(projectRef.current, folder, name, blob);
          namesByFolder.current.set(folder, [...namesHere, name]);
          setSavedFolderUrl(parentUrl(url));
          update(next.id, { state: 'hotovo' });
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

  const modeOptions: IChoiceGroupOption[] = [
    { key: 'vlozeni', text: `Podle dne vložení — dnes (${formatDate(todayStart)})` },
    { key: 'porizeni', text: 'Podle dne pořízení každé fotky (podle údaje v souboru; fotky z různých dnů půjdou do různých složek)' }
  ];

  // --- 1. krok: nová dávka ---
  if (!batch) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          background: RES.white,
          border: `1px solid ${RES.grayBlue}`,
          borderRadius: 4,
          padding: '14px 16px'
        }}
      >
        <div style={{ fontWeight: 600, color: RES.navy, fontSize: 16 }}>Nová dávka fotek</div>
        <div style={{ fontSize: 13, color: RES.gray }}>
          Dávka je balík fotek, který patří k sobě (např. kontrolní den, kontrola kabeláže). Má vlastní složku a fotky se do ní ukládají samy.
        </div>
        <ChoiceGroup label="Do složky s datem" options={modeOptions} selectedKey={mode} onChange={(_, o) => o && setMode(o.key as PhotoDateMode)} />
        <TextField
          label="Přídomek složky (nepovinný, jedno slovo)"
          placeholder="např. KD (kontrolní den)"
          value={tagInput}
          maxLength={BATCH_TAG_MAX + 8}
          onChange={(_, v) => setTagInput(v ?? '')}
          description={`Písmena, číslice a pomlčka, nejvýš ${BATCH_TAG_MAX} znaků, bez mezer.${
            tagInput.trim() !== '' && tag !== tagInput.trim() ? ` Použije se: „${tag || '—'}“.` : ''
          }`}
        />
        <div style={{ fontSize: 13 }}>
          Složka dávky:{' '}
          <strong>{mode === 'vlozeni' ? previewFolder : `${base}/${today.getFullYear()}/RRRR-MM-DD${tag ? '_' + tag : ''} (den podle každé fotky)`}</strong>
        </div>
        <div>
          <PrimaryButton iconProps={{ iconName: 'Add' }} text="Začít dávku" onClick={startBatch} styles={{ root: { height: 48, fontSize: 16 } }} />
        </div>
      </div>
    );
  }

  // --- 2. krok: vkládání fotek do dávky ---
  const batchFolder = photoFolderPath(base, batch.day, batch.tag);
  const batchName = batchFolderName(batch.day, batch.tag);
  const states = items.map((i) => i.state);
  const hasFailed = states.indexOf('chyba') !== -1;
  const hasDone = states.indexOf('hotovo') !== -1;
  const busy = states.indexOf('nahrava') !== -1 || states.indexOf('ceka') !== -1;
  const bigButton = { root: { height: 64, fontSize: 18, flex: '1 1 220px' }, icon: { fontSize: 22 } };
  const openFolder = savedFolderUrl || folderLink(project.folderUrl, photoYearFolderPath(base, today.getFullYear()));

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

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          background: RES.bluePale,
          border: `1px solid ${RES.grayBlue}`,
          borderRadius: 4,
          padding: '10px 14px'
        }}
      >
        <div style={{ flex: '1 1 260px' }}>
          <div style={{ fontSize: 12, color: RES.gray }}>Dávka</div>
          <div style={{ fontWeight: 600, color: RES.navy, fontSize: 16 }}>
            {batch.mode === 'vlozeni' ? batchName : `podle dne pořízení${batch.tag ? ` · ${batch.tag}` : ''}`}
          </div>
          <div style={{ fontSize: 12, color: RES.gray, wordBreak: 'break-all' }}>
            {batch.mode === 'vlozeni' ? batchFolder : `${base}/${batch.day.getFullYear()}/RRRR-MM-DD${batch.tag ? '_' + batch.tag : ''}`}
          </div>
          {existingCount !== undefined && existingCount > 0 && (
            <div style={{ fontSize: 12, color: RES.gray }}>Složka už existuje ({existingCount} fotek) — nové se přidají k nim.</div>
          )}
        </div>
        <DefaultButton text="Ukončit dávku" disabled={busy} onClick={finishBatch} />
      </div>

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
          {busy && <div style={{ fontSize: 12, color: RES.gray, marginBottom: 6 }}>Nechte prosím stránku otevřenou, dokud se fotky nenahrají.</div>}
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
                  {i.state === 'nahrava' && (
                    <Spinner size={SpinnerSize.xSmall} label="nahrávám" labelPosition="right" styles={{ root: { justifyContent: 'flex-start' } }} />
                  )}
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
                    styles={{
                      root: { position: 'absolute', top: 2, right: 2, width: 22, height: 22, background: 'rgba(255,255,255,0.9)', borderRadius: 11 },
                      icon: { fontSize: 10 }
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          {hasFailed && <div style={{ fontSize: 12, color: RES.red, marginTop: 6 }}>{items.filter((i) => i.state === 'chyba')[0].error}</div>}
        </div>
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
          <strong style={{ color: RES.navy }}>{batch.mode === 'vlozeni' ? `Fotky v dávce${gallery ? ` (${gallery.length})` : ''}` : 'Nahrané fotky'}</strong>
          <span style={{ flex: '1 1 auto' }} />
          <ExternalLink href={openFolder}>Otevřít složku {savedFolderUrl ? 'dávky' : 'FOTO'}</ExternalLink>
        </div>
        {galleryError && (
          <MessageBar messageBarType={MessageBarType.warning} isMultiline>
            {galleryError}
          </MessageBar>
        )}
        {batch.mode === 'vlozeni' && !gallery && !galleryError && <Spinner size={SpinnerSize.small} label="Načítám…" />}
        {batch.mode === 'vlozeni' && gallery && gallery.length === 0 && (
          <div style={{ fontSize: 13, color: RES.gray }}>V dávce zatím nejsou žádné fotky. Složka vznikne při první nahrané fotce.</div>
        )}
        {batch.mode === 'porizeni' && (
          <div style={{ fontSize: 13, color: RES.gray }}>
            U dávky podle dne pořízení se seznam fotek neukazuje — fotky jsou rozdělené do složek podle dne.
          </div>
        )}
        {batch.mode === 'vlozeni' && gallery && gallery.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {gallery
              .slice()
              .reverse()
              .map((f) => (
                <ExternalLink key={f.name} href={f.url} title={f.name} styles={{ root: { display: 'block' } }}>
                  <img
                    src={f.url}
                    alt={f.name}
                    style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 3, background: RES.background, display: 'block' }}
                  />
                </ExternalLink>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};
