/**
 * Rozdělení řádku z účetnictví mezi víc položek (nebo výnosů): každá část má cíl a částku, součet nesmí přesáhnout částku řádku.
 * Uložením se původní přiřazení řádku nahradí zadanými částmi.
 */

import * as React from 'react';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { DefaultButton, IconButton, PrimaryButton, ActionButton } from '@fluentui/react/lib/Button';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { TextField } from '@fluentui/react/lib/TextField';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';

import { RES } from '../../ui/theme';
import { formatMoney } from '../../core/format';
import { round2 } from '../../core/budget';
import { BudgetDoc } from '../../core/budget';
import { AbraDoc, replaceDocAllocations, targetKindOf } from '../../core/abraDocs';
import { UNASSIGNED_KEY, targetOptions } from './targets';

interface Part {
  targetId: string;
  amountText: string;
}

const amountText = (n: number): string => String(n).replace('.', ',');
const parse = (t: string): number => Number(t.replace(/\s/g, '').replace(',', '.'));

export const SplitDocDialog: React.FC<{
  row: AbraDoc;
  doc: BudgetDoc;
  onSave: (doc: BudgetDoc) => void;
  onClose: () => void;
}> = ({ row, doc, onSave, onClose }) => {
  const kind = targetKindOf(row);
  const existing = (doc.allocations || []).filter((a) => a.docId === row.abraId);
  const [parts, setParts] = React.useState<Part[]>(existing.length > 0 ? existing.map((a) => ({ targetId: a.targetId, amountText: amountText(a.amount) })) : [{ targetId: UNASSIGNED_KEY, amountText: amountText(row.amountNet) }]);
  const [error, setError] = React.useState<string | undefined>(undefined);
  if (!kind) {
    return null;
  }

  const sum = round2(parts.reduce((s, p) => s + (isFinite(parse(p.amountText)) ? parse(p.amountText) : 0), 0));
  const left = round2(row.amountNet - sum);
  const set = (i: number, patch: Partial<Part>): void => setParts(parts.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const save = (): void => {
    const numbers = parts.map((p) => parse(p.amountText));
    if (numbers.some((n) => !isFinite(n))) {
      setError('Některá částka není číslo.');
      return;
    }
    const r = replaceDocAllocations(doc.allocations, row, kind, parts.map((p, i) => ({ targetId: p.targetId, amount: numbers[i] })));
    if ('error' in r) {
      setError(r.error);
      return;
    }
    onSave({ ...doc, allocations: r.allocations.length > 0 ? r.allocations : undefined });
  };

  return (
    <Dialog
      hidden={false}
      onDismiss={onClose}
      dialogContentProps={{ type: DialogType.normal, title: `Rozdělit řádek ${row.number}`, subText: `${row.partnerName || ''} ${row.description ? '· ' + row.description : ''} · částka ${formatMoney(row.amountNet, row.currency)}` }}
      modalProps={{ isBlocking: true }}
      minWidth={640}
    >
      {error && (
        <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError(undefined)}>
          {error}
        </MessageBar>
      )}
      {parts.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 6 }}>
          <Dropdown label={i === 0 ? 'Položka' : undefined} selectedKey={p.targetId} options={targetOptions(doc, kind)} onChange={(_, o) => o && set(i, { targetId: String(o.key) })} styles={{ root: { flex: '1 1 auto' } }} />
          <TextField label={i === 0 ? `Částka (${row.currency})` : undefined} value={p.amountText} onChange={(_, v) => set(i, { amountText: v ?? '' })} styles={{ root: { width: 140 } }} />
          <IconButton iconProps={{ iconName: 'Delete' }} title="Odebrat část" ariaLabel="Odebrat část" disabled={parts.length === 1} onClick={() => setParts(parts.filter((_, idx) => idx !== i))} />
        </div>
      ))}
      <ActionButton iconProps={{ iconName: 'Add' }} text="Přidat část" onClick={() => setParts([...parts, { targetId: UNASSIGNED_KEY, amountText: left !== 0 ? amountText(left) : '' }])} />
      <div style={{ fontSize: 13, marginTop: 4, color: Math.abs(left) > 0.005 ? RES.amber : RES.gray }}>
        Rozděleno {formatMoney(sum, row.currency)} z {formatMoney(row.amountNet, row.currency)}
        {Math.abs(left) > 0.005 ? ` — zbývá ${formatMoney(left, row.currency)} (zůstane nepřiřazené)` : ''}
      </div>
      <DialogFooter>
        <PrimaryButton text="Uložit rozdělení" onClick={save} />
        <DefaultButton text="Zrušit" onClick={onClose} />
      </DialogFooter>
    </Dialog>
  );
};
