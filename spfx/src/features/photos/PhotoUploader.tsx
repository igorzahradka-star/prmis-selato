/**
 * Nahrávání fotek do projektu po **dávkách**.
 *
 * 1. Fotky se přidají do „odkládacího prostoru“: z počítače (Vybrat fotky) nebo rovnou z foťáku telefonu (Vyfotit).
 *    Ke každé fotce jde napsat poznámku (např. „mělký výkop“, „křivé provedení“).
 * 2. Označí se fotky, které k sobě patří (jeden nafocený problém, jedna část stavby), a uloží se do dávky. Dávka je buď nová —
 *    název a datum, z nich vznikne složka `rok-měsíc-den Název` ve složce FOTO — nebo už existující (dodatečné doplnění).
 *    Pak se stejně uloží další fotky do další dávky.
 *
 * Fotky se po jedné zmenší (delší strana nejvýš 2 000 bodů, JPEG), pojmenují podle času pořízení a nahrají do složky dávky; poznámka
 * se uloží přímo k souboru (pole Název), takže s fotkou putuje. Složky vznikají samy a už existující se najde i při trochu jiném
 * psaní názvu. Když nahrávání selže (slabý signál), fotka zůstane ve frontě a jde ji poslat znovu — stránku je ale potřeba nechat otevřenou.
 */

import { folderFor } from '../../core/projectFolders';
import * as React from 'react';
import { PrimaryButton, DefaultButton, IconButton } from '@fluentui/react/lib/Button';
import { TextField } from '@fluentui/react/lib/TextField';
import { Checkbox } from '@fluentui/react/lib/Checkbox';
import { ChoiceGroup, IChoiceGroupOption } from '@fluentui/react/lib/ChoiceGroup';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { Icon } from '@fluentui/react/lib/Icon';
import { Link } from '@fluentui/react/lib/Link';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { ExternalLink } from '../../ui/components/ExternalLink';
import { Project } from '../../core/types';
import {
  BATCH_TITLE_MAX,
  UploadState,
  batchTitle,
  buildPhotoName,
  folderLink,
  photoFolderPath,
  uploadSummary
} from '../../core/photos';
import { isoDay, parseIsoDay } from '../../core/siteDiary';
import { extensionForType, resizeImage } from '../diary/imageUtils';
import { PhotoBatch, batchFolderOf, loadBatches } from './photoBatches';

type ItemState = 'novy' | UploadState;

interface QueueItem {
  id: number;
  file: File;
  preview?: string;
  note: string;
  selected: boolean;
  state: ItemState;
  /** Složka dávky od složky projektu (po uložení do dávky). */
  folder?: string;
  /** Popisek dávky pro zobrazení. */
  label?: string;
  error?: string;
  noteWarning?: string;
}

export interface PhotoUploaderProps {
  project: Project;
  /** Dávka, do které se mají fotky přidat (tlačítko „Přidat fotky“ u dávky v galerii). */
  presetBatch?: PhotoBatch;
  /** Po každém dokončeném nahrávání — rodič obnoví galerii. */
  onUploaded?: () => void;
  onClose?: () => void;
}

interface SaveForm {
  target: 'nova' | 'existujici';
  title: string;
  date: string;
  existingPath: string;
}

export const PhotoUploader: React.FC<PhotoUploaderProps> = ({ project, presetBatch, onUploaded, onClose }) => {
  const { repos, settings } = useApp();
  const [items, setItems] = React.useState<QueueItem[]>([]);
  const [batches, setBatches] = React.useState<PhotoBatch[]>([]);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [form, setForm] = React.useState<SaveForm>({ target: 'nova', title: '', date: isoDay(new Date()), existingPath: '' });
  const [formError, setFormError] = React.useState<string | undefined>(undefined);

  const cameraRef = React.useRef<HTMLInputElement>(null);
  const pickRef = React.useRef<HTMLInputElement>(null);
  const itemsRef = React.useRef<QueueItem[]>([]);
  const nextId = React.useRef(1);
  const running = React.useRef(false);
  const namesByFolder = React.useRef<Map<string, string[]>>(new Map());
  const projectRef = React.useRef(project);
  projectRef.current = project;
  const onUploadedRef = React.useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  const base = folderFor(project, 'photos', settings.folders);

  const reloadBatches = React.useCallback((): void => {
    loadBatches(repos.documents, projectRef.current, base)
      .then(setBatches)
      .catch(() => setBatches([]));
  }, [repos, base]);

  // Při změně projektu se fronta zahodí.
  React.useEffect(() => {
    itemsRef.current.forEach((i) => i.preview && URL.revokeObjectURL(i.preview));
    itemsRef.current = [];
    setItems([]);
    namesByFolder.current = new Map();
    reloadBatches();
  }, [project.projectNumber, reloadBatches]);

  const setAll = (next: QueueItem[]): void => {
    itemsRef.current = next;
    setItems(next);
  };

  const update = (id: number, patch: Partial<QueueItem>): void => {
    setAll(itemsRef.current.map((i) => (i.id === id ? { ...i, ...patch } : i)));
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
    let uploaded = false;
    try {
      let next = itemsRef.current.filter((i) => i.state === 'ceka')[0];
      while (next) {
        update(next.id, { state: 'nahrava', error: undefined, noteWarning: undefined });
        try {
          const folder = next.folder as string;
          const blob = await resizeImage(next.file);
          const taken = new Date(next.file.lastModified || Date.now());
          const namesHere = await namesIn(folder);
          const name = buildPhotoName(taken, namesHere, extensionForType(blob.type) || '.jpg');
          await repos.documents.saveProjectFile(projectRef.current, folder, name, blob);
          namesByFolder.current.set(folder, [...namesHere, name]);
          uploaded = true;
          let warning: string | undefined;
          if (next.note.trim() !== '') {
            try {
              await repos.documents.setFileNote(projectRef.current, folder, name, next.note);
            } catch (e) {
              warning = `Fotka je nahraná, ale poznámku se nepodařilo uložit: ${e instanceof Error ? e.message : String(e)}`;
            }
          }
          update(next.id, { state: 'hotovo', noteWarning: warning });
        } catch (e) {
          update(next.id, { state: 'chyba', error: e instanceof Error ? e.message : String(e) });
        }
        next = itemsRef.current.filter((i) => i.state === 'ceka')[0];
      }
    } finally {
      running.current = false;
      if (uploaded) {
        reloadBatches();
        if (onUploadedRef.current) {
          onUploadedRef.current();
        }
      }
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
      note: '',
      selected: true,
      state: 'novy'
    }));
    setAll([...itemsRef.current, ...created]);
  };

  const remove = (id: number): void => {
    const gone = itemsRef.current.filter((i) => i.id === id)[0];
    if (gone && gone.preview && typeof URL !== 'undefined') {
      URL.revokeObjectURL(gone.preview);
    }
    setAll(itemsRef.current.filter((i) => i.id !== id));
  };

  const retry = (id: number): void => {
    update(id, { state: 'ceka', error: undefined });
    pump().catch(() => undefined);
  };

  const retryAll = (): void => {
    setAll(itemsRef.current.map((i) => (i.state === 'chyba' ? { ...i, state: 'ceka', error: undefined } : i)));
    pump().catch(() => undefined);
  };

  const clearDone = (): void => {
    itemsRef.current.filter((i) => i.state === 'hotovo').forEach((i) => i.preview && URL.revokeObjectURL(i.preview));
    setAll(itemsRef.current.filter((i) => i.state !== 'hotovo'));
  };

  const fresh = items.filter((i) => i.state === 'novy');
  const selected = fresh.filter((i) => i.selected);

  const toggleAll = (on: boolean): void => {
    setAll(itemsRef.current.map((i) => (i.state === 'novy' ? { ...i, selected: on } : i)));
  };

  const removeSelected = (): void => {
    selected.forEach((i) => i.preview && URL.revokeObjectURL(i.preview));
    setAll(itemsRef.current.filter((i) => !(i.state === 'novy' && i.selected)));
  };

  const openSave = (): void => {
    setFormError(undefined);
    setForm({
      target: presetBatch ? 'existujici' : 'nova',
      title: '',
      date: isoDay(new Date()),
      existingPath: presetBatch ? presetBatch.path : ''
    });
    setSaveOpen(true);
  };

  const useTakenDate = (): void => {
    const stamps = selected.map((i) => i.file.lastModified).filter((t) => t > 0);
    if (stamps.length > 0) {
      setForm((f) => ({ ...f, date: isoDay(new Date(Math.min(...stamps))) }));
    }
  };

  const save = (): void => {
    let folder: string;
    let label: string;
    if (form.target === 'existujici') {
      const b = batches.filter((x) => x.path === form.existingPath)[0];
      if (!b) {
        setFormError('Vyberte dávku, do které se fotky přidají.');
        return;
      }
      folder = batchFolderOf(base, b);
      label = b.name;
    } else {
      const day = parseIsoDay(form.date);
      if (!day) {
        setFormError('Zadejte datum složky.');
        return;
      }
      folder = photoFolderPath(base, day, form.title);
      label = folder.slice(folder.lastIndexOf('/') + 1);
    }
    setSaveOpen(false);
    setAll(itemsRef.current.map((i) => (i.state === 'novy' && i.selected ? { ...i, state: 'ceka', folder, label, selected: false } : i)));
    pump().catch(() => undefined);
  };

  if (!project.folderUrl) {
    return (
      <MessageBar messageBarType={MessageBarType.warning} isMultiline>
        Projekt {project.projectNumber} nemá složku, kam by se fotky uložily. Složku doplňte v detailu projektu.
      </MessageBar>
    );
  }

  const uploading = items.filter((i) => i.state !== 'novy');
  const groups = new Map<string, QueueItem[]>();
  uploading.forEach((i) => {
    const key = i.folder as string;
    groups.set(key, [...(groups.get(key) || []), i]);
  });
  const upStates = uploading.map((i) => i.state as UploadState);
  const hasFailed = upStates.indexOf('chyba') !== -1;
  const hasDone = upStates.indexOf('hotovo') !== -1;
  const busy = upStates.indexOf('nahrava') !== -1 || upStates.indexOf('ceka') !== -1;
  const bigButton = { root: { height: 56, fontSize: 17, flex: '1 1 220px' }, icon: { fontSize: 22 } };
  const previewDay = parseIsoDay(form.date);
  const previewFolder =
    form.target === 'existujici'
      ? (batches.filter((x) => x.path === form.existingPath)[0] || { name: '—' }).name
      : previewDay
      ? photoFolderPath(base, previewDay, form.title).slice(base.replace(/^\/+|\/+$/g, '').length + 1)
      : '—';

  const targetOptions: IChoiceGroupOption[] = [
    { key: 'nova', text: 'Nová dávka' },
    { key: 'existujici', text: 'Existující dávka (dodatečně přidat fotky)', disabled: batches.length === 0 }
  ];
  const batchOptions: IDropdownOption[] = batches.map((b) => ({ key: b.path, text: `${b.name} (${b.itemCount})` }));

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

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontWeight: 600, color: RES.navy, fontSize: 16, flex: '1 1 auto' }}>
          {presetBatch ? `Přidat fotky do dávky „${presetBatch.name}“` : 'Nahrát fotky'}
        </div>
        {onClose && <DefaultButton text="Zavřít" disabled={busy} onClick={onClose} />}
      </div>
      <div style={{ fontSize: 13, color: RES.gray }}>
        1) Přidejte fotky (na telefonu Vyfotit, na počítači Vybrat fotky). 2) Označte ty, které k sobě patří (jeden problém, jedna část stavby),
        a uložte je do dávky. Pak stejně další. Ke každé fotce můžete napsat poznámku.
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <PrimaryButton iconProps={{ iconName: 'Camera' }} text="Vyfotit" onClick={() => cameraRef.current && cameraRef.current.click()} styles={bigButton} />
        <DefaultButton iconProps={{ iconName: 'Photo2' }} text="Vybrat fotky" onClick={() => pickRef.current && pickRef.current.click()} styles={bigButton} />
      </div>

      {fresh.length > 0 && (
        <div style={{ border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '10px 12px', background: RES.bluePale }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <strong style={{ color: RES.navy }}>Připravené fotky ({fresh.length})</strong>
            <span style={{ fontSize: 13, color: RES.gray }}>označeno {selected.length}</span>
            <span style={{ flex: '1 1 auto' }} />
            <Link onClick={() => toggleAll(true)}>Označit vše</Link>
            <Link onClick={() => toggleAll(false)}>Zrušit označení</Link>
            <DefaultButton text="Odebrat označené" disabled={selected.length === 0} onClick={removeSelected} />
            <PrimaryButton iconProps={{ iconName: 'Save' }} text="Uložit označené do dávky…" disabled={selected.length === 0} onClick={openSave} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {fresh.map((i) => (
              <div key={i.id} style={{ width: 168, position: 'relative' }}>
                <div
                  style={{
                    height: 120,
                    background: RES.background,
                    borderRadius: 3,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    outline: i.selected ? `3px solid ${RES.blue}` : 'none'
                  }}
                  onClick={() => update(i.id, { selected: !i.selected })}
                >
                  {i.preview ? <img src={i.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} /> : <Icon iconName="Photo2" />}
                </div>
                <Checkbox
                  ariaLabel="Označit fotku"
                  checked={i.selected}
                  onChange={(_, c) => update(i.id, { selected: !!c })}
                  styles={{ root: { position: 'absolute', top: 4, left: 4, background: 'rgba(255,255,255,0.9)', borderRadius: 3, padding: 2 } }}
                />
                <IconButton
                  iconProps={{ iconName: 'Cancel' }}
                  ariaLabel="Odebrat fotku"
                  title="Odebrat fotku"
                  onClick={() => remove(i.id)}
                  styles={{
                    root: { position: 'absolute', top: 2, right: 2, width: 24, height: 24, background: 'rgba(255,255,255,0.9)', borderRadius: 12 },
                    icon: { fontSize: 11 }
                  }}
                />
                <TextField
                  placeholder="Poznámka k fotce"
                  value={i.note}
                  maxLength={250}
                  onChange={(_, v) => update(i.id, { note: v ?? '' })}
                  styles={{ root: { marginTop: 4 } }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {uploading.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <strong style={{ color: RES.navy }}>Ukládání do dávek</strong>
            <span style={{ fontSize: 13, color: RES.gray }}>{uploadSummary(upStates)}</span>
            <span style={{ flex: '1 1 auto' }} />
            {hasFailed && <DefaultButton text="Zkusit znovu vše" onClick={retryAll} />}
            {hasDone && <DefaultButton text="Skrýt hotové" onClick={clearDone} />}
          </div>
          {busy && <div style={{ fontSize: 12, color: RES.gray, marginBottom: 6 }}>Nechte prosím stránku otevřenou, dokud se fotky nenahrají.</div>}
          {Array.from(groups.entries()).map(([folder, list]) => (
            <div key={folder} style={{ border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '8px 10px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <strong style={{ color: RES.navy }}>{list[0].label}</strong>
                <span style={{ fontSize: 12, color: RES.gray }}>{uploadSummary(list.map((i) => i.state as UploadState))}</span>
                <span style={{ flex: '1 1 auto' }} />
                <ExternalLink href={folderLink(project.folderUrl as string, folder)}>Otevřít složku</ExternalLink>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {list.map((i) => (
                  <div key={i.id} style={{ width: 104 }}>
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
                      {i.preview ? <img src={i.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon iconName="Photo2" />}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 2, color: i.state === 'chyba' ? RES.red : i.state === 'hotovo' ? RES.greenDark : RES.gray }}>
                      {i.state === 'ceka' && 'čeká'}
                      {i.state === 'nahrava' && (
                        <Spinner size={SpinnerSize.xSmall} label="nahrávám" labelPosition="right" styles={{ root: { justifyContent: 'flex-start' } }} />
                      )}
                      {i.state === 'hotovo' && (i.noteWarning ? <span title={i.noteWarning}>✓ nahráno, bez poznámky</span> : '✓ nahráno')}
                      {i.state === 'chyba' && (
                        <span title={i.error}>
                          nepovedlo se · <Link onClick={() => retry(i.id)}>znovu</Link>
                        </span>
                      )}
                    </div>
                    {i.note.trim() !== '' && <div style={{ fontSize: 11, color: RES.text, wordBreak: 'break-word' }}>{i.note}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {hasFailed && <div style={{ fontSize: 12, color: RES.red }}>{uploading.filter((i) => i.state === 'chyba')[0].error}</div>}
          {uploading.filter((i) => i.noteWarning)[0] && (
            <div style={{ fontSize: 12, color: RES.red }}>{(uploading.filter((i) => i.noteWarning)[0] as QueueItem).noteWarning}</div>
          )}
        </div>
      )}

      {saveOpen && (
        <Dialog
          hidden={false}
          onDismiss={() => setSaveOpen(false)}
          dialogContentProps={{
            type: DialogType.normal,
            title: `Uložit ${selected.length} ${selected.length === 1 ? 'fotku' : selected.length < 5 ? 'fotky' : 'fotek'} do dávky`
          }}
          modalProps={{ isBlocking: true }}
          minWidth={460}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {formError && <MessageBar messageBarType={MessageBarType.error}>{formError}</MessageBar>}
            <ChoiceGroup options={targetOptions} selectedKey={form.target} onChange={(_, o) => o && setForm((f) => ({ ...f, target: o.key as SaveForm['target'] }))} />
            {form.target === 'nova' ? (
              <>
                <TextField
                  label="Název dávky"
                  placeholder="např. Mělký výkop, Problém č. 1, Kontrolní den"
                  value={form.title}
                  maxLength={BATCH_TITLE_MAX + 20}
                  onChange={(_, v) => setForm((f) => ({ ...f, title: v ?? '' }))}
                  description={`Nepovinný, nejvýš ${BATCH_TITLE_MAX} znaků. Znaky nepovolené v názvu složky se vynechají.${
                    form.title.trim() !== '' && batchTitle(form.title) !== form.title.trim() ? ` Použije se: „${batchTitle(form.title) || '—'}“.` : ''
                  }`}
                />
                <TextField label="Datum složky" type="date" value={form.date} onChange={(_, v) => setForm((f) => ({ ...f, date: v ?? '' }))} />
                <div style={{ fontSize: 12 }}>
                  <Link onClick={useTakenDate}>Použít datum pořízení nejstarší označené fotky</Link>
                </div>
              </>
            ) : (
              <Dropdown
                label="Dávka"
                options={batchOptions}
                selectedKey={form.existingPath || null}
                placeholder="Vyberte dávku"
                onChange={(_, o) => o && setForm((f) => ({ ...f, existingPath: String(o.key) }))}
              />
            )}
            <div style={{ fontSize: 13 }}>
              Složka: <strong>{previewFolder}</strong>
            </div>
          </div>
          <DialogFooter>
            <PrimaryButton text="Uložit" onClick={save} />
            <DefaultButton text="Zrušit" onClick={() => setSaveOpen(false)} />
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
};
