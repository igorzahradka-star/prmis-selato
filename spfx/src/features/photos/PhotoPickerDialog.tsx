/**
 * Výběr fotek z galerie projektu — dávky (složky ve složce FOTO) s miniaturami a zaškrtávátky.
 * Používá se při psaní zápisu ze stavby: „Z galerie projektu“ přiloží vybrané fotky k bodu zápisu.
 *
 * Dialog se musí vykreslovat **uvnitř panelu zápisu** (viz EntryPanel), jinak by klik v něm zavřel celý panel.
 */

import * as React from 'react';
import { PrimaryButton, DefaultButton, IconButton } from '@fluentui/react/lib/Button';
import { Checkbox } from '@fluentui/react/lib/Checkbox';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { Project } from '../../core/types';
import { formatDate } from '../../core/format';
import { ProjectFile } from '../../data/repositories';
import { PhotoBatch, batchFolderOf, loadBatches } from './photoBatches';

/** Fotka vybraná v galerii: kde leží a jak se jmenuje. */
export interface PickedPhoto {
  folder: string;
  name: string;
  note?: string;
}

const PickerThumb: React.FC<{ file: ProjectFile; checked: boolean; onToggle: (on: boolean) => void }> = ({ file, checked, onToggle }) => {
  const [src, setSrc] = React.useState(file.thumbnailUrl || file.url);
  return (
    <div style={{ width: 128, position: 'relative' }}>
      <img
        src={src}
        alt={file.note || file.name}
        loading="lazy"
        onError={() => src !== file.url && setSrc(file.url)}
        onClick={() => onToggle(!checked)}
        style={{
          width: 128,
          height: 96,
          objectFit: 'cover',
          borderRadius: 3,
          background: RES.background,
          display: 'block',
          cursor: 'pointer',
          outline: checked ? `3px solid ${RES.blue}` : 'none'
        }}
      />
      <Checkbox
        ariaLabel={`Vybrat ${file.name}`}
        checked={checked}
        onChange={(_, c) => onToggle(!!c)}
        styles={{ root: { position: 'absolute', top: 4, left: 4, background: 'rgba(255,255,255,0.9)', borderRadius: 3, padding: 2 } }}
      />
      {file.note && <div style={{ fontSize: 11, marginTop: 2, color: RES.text, wordBreak: 'break-word' }}>{file.note}</div>}
    </div>
  );
};

export const PhotoPickerDialog: React.FC<{ project: Project; onPick: (photos: PickedPhoto[]) => void; onClose: () => void }> = ({
  project,
  onPick,
  onClose
}) => {
  const { repos, settings } = useApp();
  const base = settings.folders.photoFolder;
  const [batches, setBatches] = React.useState<PhotoBatch[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const [photos, setPhotos] = React.useState<Record<string, ProjectFile[]>>({});
  const [chosen, setChosen] = React.useState<Record<string, PickedPhoto>>({});

  React.useEffect(() => {
    let cancelled = false;
    loadBatches(repos.documents, project, base)
      .then((b) => {
        if (cancelled) {
          return;
        }
        setBatches(b);
        if (b.length > 0) {
          setOpen({ [b[0].path]: true });
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [repos, project, base]);

  // Fotky dávky se načtou, až se dávka rozbalí.
  React.useEffect(() => {
    (batches || [])
      .filter((b) => open[b.path] && !photos[b.path])
      .forEach((b) => {
        repos.documents
          .listPhotos(project, batchFolderOf(base, b))
          .then((list) => setPhotos((cur) => ({ ...cur, [b.path]: list })))
          .catch((e: Error) => setError(e.message));
      });
  }, [batches, open, photos, repos, project, base]);

  const count = Object.keys(chosen).length;
  const toggle = (folder: string, f: ProjectFile, on: boolean): void => {
    const key = `${folder}/${f.name}`;
    setChosen((cur) => {
      const next = { ...cur };
      if (on) {
        next[key] = { folder, name: f.name, note: f.note };
      } else {
        delete next[key];
      }
      return next;
    });
  };

  return (
    <Dialog
      hidden={false}
      onDismiss={onClose}
      dialogContentProps={{ type: DialogType.normal, title: `Fotky z galerie projektu ${project.projectNumber}` }}
      modalProps={{ isBlocking: true }}
      minWidth={620}
      maxWidth={900}
    >
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>
          {error}
        </MessageBar>
      )}
      {!batches && !error && <Spinner size={SpinnerSize.medium} label="Načítám galerii…" />}
      {batches && batches.length === 0 && (
        <MessageBar messageBarType={MessageBarType.info} isMultiline>
          V galerii projektu zatím nejsou žádné fotky. Nahrajte je na záložce Fotodokumentace v detailu projektu.
        </MessageBar>
      )}
      <div style={{ maxHeight: '55vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(batches || []).map((b) => {
          const isOpen = !!open[b.path];
          const folder = batchFolderOf(base, b);
          const list = photos[b.path];
          return (
            <section key={b.path} style={{ border: `1px solid ${RES.grayBlue}`, borderRadius: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', cursor: 'pointer' }} onClick={() => setOpen((cur) => ({ ...cur, [b.path]: !isOpen }))}>
                <IconButton iconProps={{ iconName: isOpen ? 'ChevronDown' : 'ChevronRight' }} ariaLabel={isOpen ? 'Sbalit' : 'Rozbalit'} />
                <div style={{ flex: '1 1 auto' }}>
                  <div style={{ fontWeight: 600, color: RES.navy }}>{b.title || b.name}</div>
                  <div style={{ fontSize: 12, color: RES.gray }}>
                    {b.date ? formatDate(b.date) : b.name} · {b.itemCount}
                  </div>
                </div>
              </div>
              {isOpen && (
                <div style={{ padding: '4px 12px 12px' }}>
                  {!list && <Spinner size={SpinnerSize.small} label="Načítám fotky…" />}
                  {list && list.length === 0 && <div style={{ fontSize: 13, color: RES.gray }}>V dávce nejsou žádné fotky.</div>}
                  {list && list.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {list.map((f) => (
                        <PickerThumb key={f.name} file={f} checked={!!chosen[`${folder}/${f.name}`]} onToggle={(on) => toggle(folder, f, on)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <DialogFooter>
        <PrimaryButton
          text={count > 0 ? `Přiložit vybrané (${count})` : 'Přiložit vybrané'}
          disabled={count === 0}
          onClick={() => onPick(Object.keys(chosen).map((k) => chosen[k]))}
        />
        <DefaultButton text="Zrušit" onClick={onClose} />
      </DialogFooter>
    </Dialog>
  );
};
