/**
 * Přílohy servisního požadavku nebo servisního listu: fotky, dokumenty a nákresy (kreslení do prázdna i do fotky, stejně jako ve stavebním deníku).
 * Fotky se před uložením zmenší podle Nastavení → Fotky. U ještě neuloženého záznamu (`target` chybí) se soubory drží v paměti (`pending`)
 * a nahrají se až po uložení.
 */

import * as React from 'react';
import { ActionButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';

import { useApp } from '../../ui/AppContext';
import { OrderAttachment } from '../../core/orders';
import { canWorkInService } from '../../core/service';
import { ServiceAttachmentTarget } from '../../data/repositories';
import { AttachmentsSection } from '../orders/AttachmentsSection';
import { SketchDialog } from '../diary/SketchDialog';
import { resizeImage } from '../diary/imageUtils';

/** Fotku zmenší (gif a svg ne); název se při převodu na JPEG upraví na `.jpg`. */
export async function prepareAttachment(file: File, prefix: string): Promise<File> {
  let out: File = file;
  if (file.type.indexOf('image/') === 0 && file.type !== 'image/gif' && file.type !== 'image/svg+xml') {
    try {
      const blob = await resizeImage(file);
      if (blob !== file) {
        const name = blob.type === 'image/jpeg' ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name;
        out = new File([blob], name, { type: blob.type });
      }
    } catch {
      out = file; // fotka se nedá zmenšit — nahraje se původní
    }
  }
  return prefix && out.name.indexOf(prefix) !== 0 ? new File([out], prefix + out.name, { type: out.type }) : out;
}

export const ServiceAttachments: React.FC<{
  target?: ServiceAttachmentTarget;
  pending: File[];
  onPendingChange: (files: File[]) => void;
  /** Předpona názvu nově přidaných souborů (např. `Provedeni_` u fotek z provedení). */
  prefix?: string;
  /** Které uložené přílohy se ukážou: jen s předponou, jen bez ní, nebo všechny. */
  show?: 'all' | 'prefixed' | 'plain';
  /** Smí uživatel přidávat a odebírat? (Čtení je vždy.) */
  editable?: boolean;
  /** Počet zobrazených uložených příloh (např. pro kontrolu, že jsou nahrané fotky). */
  onCount?: (count: number) => void;
  /** Změnil se seznam příloh. */
  onChanged?: () => void;
  /** Nadpis; bez něj platí „Přílohy“. */
  hideTitle?: boolean;
}> = ({ target, pending, onPendingChange, prefix, show, editable, onCount, onChanged, hideTitle }) => {
  const { repos, user } = useApp();
  const [saved, setSaved] = React.useState<OrderAttachment[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [sketchOpen, setSketchOpen] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const mayEdit = (editable ?? true) && canWorkInService(user.roles);
  const targetKey = target ? `${target.kind}:${target.id}` : '';
  const pre = prefix ?? '';

  const visible = (list: OrderAttachment[]): OrderAttachment[] => {
    const mode = show ?? 'all';
    return mode === 'all' || !pre ? list : list.filter((a) => (a.name.indexOf(pre) === 0) === (mode === 'prefixed'));
  };

  React.useEffect(() => {
    if (!target) {
      setSaved([]);
      return undefined;
    }
    let cancelled = false;
    repos.service
      .listAttachments(target)
      .then((list) => {
        if (!cancelled) {
          const shown = visible(list);
          setSaved(shown);
          if (onCount) {
            onCount(shown.length);
          }
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repos, targetKey, reloadKey]);

  const add = (files: File[]): void => {
    setError(undefined);
    setBusy(true);
    (async (): Promise<void> => {
      const prepared: File[] = [];
      for (const f of files) {
        prepared.push(await prepareAttachment(f, pre));
      }
      if (!target) {
        onPendingChange([...pending, ...prepared]);
        return;
      }
      const failed: string[] = [];
      for (const f of prepared) {
        try {
          await repos.service.addAttachment(target, f, user);
        } catch (e) {
          failed.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      setReloadKey((k) => k + 1);
      if (onChanged) {
        onChanged();
      }
      if (failed.length > 0) {
        setError(failed.join(' | '));
      }
    })()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .then(() => setBusy(false), () => setBusy(false));
  };

  const removeSaved = (name: string): void => {
    if (!target) {
      return;
    }
    setBusy(true);
    setError(undefined);
    repos.service
      .removeAttachment(target, name, user)
      .then(() => {
        setReloadKey((k) => k + 1);
        if (onChanged) {
          onChanged();
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .then(() => setBusy(false), () => setBusy(false));
  };

  return (
    <div>
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>
          {error}
        </MessageBar>
      )}
      <AttachmentsSection
        attachments={saved}
        pending={pending}
        canAdd={mayEdit}
        canRemove={mayEdit}
        busy={busy}
        onAdd={add}
        onRemoveSaved={removeSaved}
        onRemovePending={(i) => onPendingChange(pending.filter((_, idx) => idx !== i))}
        hideTitle={hideTitle}
      />
      {mayEdit && (
        <ActionButton iconProps={{ iconName: 'Edit' }} text="Nákres nebo poznámky (kreslení)" disabled={busy} onClick={() => setSketchOpen(true)} />
      )}
      {sketchOpen && (
        <SketchDialog
          title="Nákres"
          onCancel={() => setSketchOpen(false)}
          onSave={(image) => {
            setSketchOpen(false);
            const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
            add([new File([image], `Nakres_${stamp}.${image.type === 'image/jpeg' ? 'jpg' : 'png'}`, { type: image.type || 'image/png' })]);
          }}
        />
      )}
    </div>
  );
};
