/**
 * Přílohy objednávky: seznam, přidání (i více souborů najednou) a odebrání.
 *
 * U ještě neuložené objednávky se soubory drží v paměti (`pending`) a nahrají se až po uložení —
 * SharePoint je může připojit jen k existující položce.
 */

import * as React from 'react';
import { ActionButton, IconButton } from '@fluentui/react/lib/Button';
import { Link } from '@fluentui/react/lib/Link';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';

import { RES } from '../../ui/theme';
import { OrderAttachment, validateAttachment } from '../../core/orders';
import { formatFileSize } from '../../data/sharepoint/documentQuery';

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
        {attachments.map((a) => (
          <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Link href={a.url} target="_blank">
              {a.name}
            </Link>
            {a.sizeBytes !== undefined && <span style={{ color: RES.gray }}>{formatFileSize(a.sizeBytes)}</span>}
            {canRemove && (
              <IconButton
                iconProps={{ iconName: 'Delete' }}
                ariaLabel={`Odebrat přílohu ${a.name}`}
                disabled={busy}
                onClick={() => onRemoveSaved(a.name)}
              />
            )}
          </div>
        ))}
        {pending.map((f, i) => (
          <div key={`${f.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{f.name}</span>
            <span style={{ color: RES.gray }}>{formatFileSize(f.size)} · nahraje se po uložení</span>
            <IconButton iconProps={{ iconName: 'Delete' }} ariaLabel={`Odebrat přílohu ${f.name}`} onClick={() => onRemovePending(i)} />
          </div>
        ))}
      </div>
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
