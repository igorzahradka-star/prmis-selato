/**
 * Přílohy objednávky jako dlaždice s miniaturou (velikost jako „střední ikony" ve Windows, ať je vidět,
 * co v dokumentu zhruba je): obrázek se ukáže přímo, u PDF první strana, ostatní soubory ikonou podle typu.
 * Přidání (i víc souborů najednou) a odebrání.
 *
 * U ještě neuložené objednávky se soubory drží v paměti (`pending`) a nahrají se až po uložení —
 * SharePoint je může připojit jen k existující položce.
 */

import * as React from 'react';
import { ActionButton, IconButton } from '@fluentui/react/lib/Button';
import { Icon } from '@fluentui/react/lib/Icon';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';

import { RES } from '../../ui/theme';
import { ExternalLink } from '../../ui/components/ExternalLink';
import { AttachmentKind, OrderAttachment, attachmentKind, validateAttachment } from '../../core/orders';
import { formatFileSize } from '../../data/sharepoint/documentQuery';
import { pdfThumbnail } from './attachmentThumb';

export interface AttachmentsSectionProps {
  /** Už uložené přílohy. */
  attachments: OrderAttachment[];
  /** Soubory čekající na uložení nové objednávky. */
  pending: File[];
  canAdd: boolean;
  canRemove: boolean;
  busy: boolean;
  /** Nové soubory; rodič je buď nahraje hned, nebo si je podrží do uložení. */
  onAdd: (files: File[]) => void;
  onRemoveSaved: (name: string) => void;
  onRemovePending: (index: number) => void;
  /** Nadpis se nevykreslí (sekce už nadpis má). */
  hideTitle?: boolean;
}

const KIND_ICON: Record<AttachmentKind, string> = {
  image: 'FileImage',
  pdf: 'PDF',
  word: 'WordDocument',
  excel: 'ExcelDocument',
  powerpoint: 'PowerPointDocument',
  archive: 'ZipFolder',
  other: 'Page'
};

const KIND_COLOR: Record<AttachmentKind, string> = {
  image: '#6b7d8e',
  pdf: '#c0392b',
  word: '#2b579a',
  excel: '#217346',
  powerpoint: '#d24726',
  archive: '#8a6d1d',
  other: '#6b7d8e'
};

const TILE_W = 116;
const THUMB_H = 96;

/** Ikona typu souboru — záloha, když se miniatura nepodaří nebo se ještě načítá. */
const KindIcon: React.FC<{ kind: AttachmentKind }> = ({ kind }) => (
  <Icon iconName={KIND_ICON[kind]} styles={{ root: { fontSize: 44, color: KIND_COLOR[kind] } }} />
);

/** Obsah miniatury: obrázek, první strana PDF, nebo ikona. */
const Thumb: React.FC<{ name: string; imageUrl?: string; pdfKey?: string; loadBlob?: () => Promise<Blob> }> = ({
  name,
  imageUrl,
  pdfKey,
  loadBlob
}) => {
  const kind = attachmentKind(name);
  const [src, setSrc] = React.useState<string | undefined>(kind === 'image' ? imageUrl : undefined);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (kind !== 'pdf' || !pdfKey || !loadBlob) {
      return undefined;
    }
    let cancelled = false;
    pdfThumbnail(pdfKey, loadBlob)
      .then((data) => {
        if (!cancelled) {
          if (data) {
            setSrc(data);
          } else {
            setFailed(true);
          }
        }
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [kind, pdfKey, loadBlob]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }}
      />
    );
  }
  return <KindIcon kind={kind} />;
};

const Tile: React.FC<{
  name: string;
  sizeBytes?: number;
  note?: string;
  href?: string;
  thumb: React.ReactNode;
  onRemove?: () => void;
  removeDisabled?: boolean;
}> = ({ name, sizeBytes, note, href, thumb, onRemove, removeDisabled }) => {
  const body = (
    <>
      <div
        style={{
          height: THUMB_H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: RES.background,
          borderRadius: 3,
          overflow: 'hidden',
          padding: 4,
          boxSizing: 'border-box'
        }}
      >
        {thumb}
      </div>
      <div
        title={name}
        style={{
          marginTop: 4,
          fontSize: 12,
          lineHeight: '15px',
          color: RES.text,
          wordBreak: 'break-word',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}
      >
        {name}
      </div>
      <div style={{ fontSize: 11, color: RES.gray }}>
        {sizeBytes !== undefined ? formatFileSize(sizeBytes) : ''}
        {note ? `${sizeBytes !== undefined ? ' · ' : ''}${note}` : ''}
      </div>
    </>
  );
  return (
    <div style={{ position: 'relative', width: TILE_W }}>
      {href ? (
        <ExternalLink href={href} title={`Otevřít ${name}`} styles={{ root: { display: 'block', textDecoration: 'none' } }}>
          {body}
        </ExternalLink>
      ) : (
        <div>{body}</div>
      )}
      {onRemove && (
        <IconButton
          iconProps={{ iconName: 'Delete' }}
          ariaLabel={`Odebrat přílohu ${name}`}
          title="Odebrat přílohu"
          disabled={removeDisabled}
          onClick={onRemove}
          styles={{
            root: { position: 'absolute', top: 2, right: 2, width: 26, height: 26, background: 'rgba(255,255,255,0.9)', borderRadius: 13 },
            icon: { fontSize: 13 }
          }}
        />
      )}
    </div>
  );
};

/** Soubor z adresy (SharePoint i ukázkový režim). Přihlášení se posílá samo, je to stejný web. */
function loadFromUrl(url: string): () => Promise<Blob> {
  return () =>
    fetch(url, { credentials: 'same-origin' }).then((r) => {
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}`);
      }
      return r.blob();
    });
}

const SavedTile: React.FC<{ a: OrderAttachment; canRemove: boolean; busy: boolean; onRemove: (name: string) => void }> = ({
  a,
  canRemove,
  busy,
  onRemove
}) => {
  const load = React.useMemo(() => loadFromUrl(a.url), [a.url]);
  return (
    <Tile
      name={a.name}
      sizeBytes={a.sizeBytes}
      href={a.url || undefined}
      thumb={<Thumb name={a.name} imageUrl={a.url} pdfKey={a.url} loadBlob={load} />}
      onRemove={canRemove ? () => onRemove(a.name) : undefined}
      removeDisabled={busy}
    />
  );
};

const PendingTile: React.FC<{ file: File; onRemove: () => void }> = ({ file, onRemove }) => {
  const [url, setUrl] = React.useState<string | undefined>(undefined);
  React.useEffect(() => {
    const created = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : undefined;
    setUrl(created);
    return () => {
      if (created) {
        URL.revokeObjectURL(created);
      }
    };
  }, [file]);
  const load = React.useMemo(() => (): Promise<Blob> => Promise.resolve(file), [file]);
  return (
    <Tile
      name={file.name}
      sizeBytes={file.size}
      note="nahraje se po uložení"
      thumb={<Thumb name={file.name} imageUrl={url} pdfKey={`pending:${file.name}:${file.size}:${file.lastModified}`} loadBlob={load} />}
      onRemove={onRemove}
    />
  );
};

export const AttachmentsSection: React.FC<AttachmentsSectionProps> = ({
  attachments,
  pending,
  canAdd,
  canRemove,
  busy,
  onAdd,
  onRemoveSaved,
  onRemovePending,
  hideTitle
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [problems, setProblems] = React.useState<string[]>([]);

  const picked = (list: FileList | null): void => {
    const files: File[] = [];
    const found: string[] = [];
    Array.from(list ?? []).forEach((f) => {
      const p = validateAttachment(f.name, f.size);
      if (p) {
        found.push(p);
      } else {
        files.push(f);
      }
    });
    setProblems(found);
    if (files.length > 0) {
      onAdd(files);
    }
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const empty = attachments.length === 0 && pending.length === 0;

  return (
    <div>
      {!hideTitle && <div style={{ fontWeight: 600, marginBottom: 4 }}>Přílohy</div>}
      {problems.length > 0 && (
        <MessageBar messageBarType={MessageBarType.warning} isMultiline onDismiss={() => setProblems([])}>
          {problems.join(' ')}
        </MessageBar>
      )}
      {empty && <div style={{ fontSize: 13, color: RES.gray, marginBottom: 4 }}>Zatím žádné přílohy.</div>}
      {!empty && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
          {attachments.map((a) => (
            <SavedTile key={a.name} a={a} canRemove={canRemove} busy={busy} onRemove={onRemoveSaved} />
          ))}
          {pending.map((f, i) => (
            <PendingTile key={`${f.name}-${i}`} file={f} onRemove={() => onRemovePending(i)} />
          ))}
        </div>
      )}
      {canAdd && (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => picked(e.target.files)}
          />
          <ActionButton
            iconProps={{ iconName: 'Attach' }}
            text="Přidat přílohu"
            disabled={busy}
            onClick={() => inputRef.current && inputRef.current.click()}
          />
        </>
      )}
    </div>
  );
};
