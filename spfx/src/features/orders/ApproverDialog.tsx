/**
 * Výběr schvalovatele: při odeslání ke schválení (všechny nevyřízené kroky) a při změně schvalovatele
 * (jeden krok). U každého kroku je předvyplněná osoba z číselníku (u PM je to PM projektu);
 * „Kdokoli z role" znamená, že krok smí schválit kterýkoli člen příslušné role.
 *
 * Dialog si drží výběr sám; rodič ho nechává „přeskládat" změnou `key`, když se otevírá znovu.
 */

import * as React from 'react';
import { Dialog, DialogType, DialogFooter } from '@fluentui/react/lib/Dialog';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';

import { ApprovalLevel, APPROVAL_LEVEL_LABELS } from '../../core/orders';
import { Assignee } from '../../core/orderWorkflow';

export interface ApproverRow {
  level: ApprovalLevel;
  candidates: Assignee[];
  /** Předvybraný schvalovatel (přihlašovací jméno); prázdný = kdokoli z role. */
  selected: string;
}

export interface ApproverDialogProps {
  title: string;
  description?: string;
  confirmText: string;
  rows: ApproverRow[];
  busy: boolean;
  onConfirm: (assignees: Partial<Record<ApprovalLevel, Assignee>>) => void;
  onDismiss: () => void;
}

export const ApproverDialog: React.FC<ApproverDialogProps> = ({
  title,
  description,
  confirmText,
  rows,
  busy,
  onConfirm,
  onDismiss
}) => {
  const [selected, setSelected] = React.useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    rows.forEach((r) => (initial[r.level] = r.selected));
    return initial;
  });

  const confirm = (): void => {
    const result: Partial<Record<ApprovalLevel, Assignee>> = {};
    rows.forEach((r) => {
      const login = selected[r.level];
      const found = r.candidates.filter((c) => c.login === login)[0];
      if (found) {
        result[r.level] = found;
      }
    });
    onConfirm(result);
  };

  return (
    <Dialog
      hidden={false}
      onDismiss={onDismiss}
      dialogContentProps={{ type: DialogType.normal, title, subText: description }}
      modalProps={{ isBlocking: true }}
      minWidth={440}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map((r) => {
          const options: IDropdownOption[] = [
            { key: '', text: `Kdokoli z role (${APPROVAL_LEVEL_LABELS[r.level]})` },
            ...r.candidates.map((c) => ({ key: c.login, text: c.name }))
          ];
          return (
            <Dropdown
              key={r.level}
              label={`Schvaluje: ${APPROVAL_LEVEL_LABELS[r.level]}`}
              options={options}
              selectedKey={selected[r.level] ?? ''}
              onChange={(_, o) => o && setSelected({ ...selected, [r.level]: String(o.key) })}
            />
          );
        })}
        {rows.every((r) => r.candidates.length === 0) && (
          <div style={{ fontSize: 12, color: '#5A6472' }}>
            V příslušných skupinách zatím nikdo není (Uživatelé a role), proto je možné nechat krok „kdokoli z role“.
          </div>
        )}
      </div>
      <DialogFooter>
        <PrimaryButton text={busy ? 'Pracuji…' : confirmText} disabled={busy} onClick={confirm} />
        <DefaultButton text="Zpět" disabled={busy} onClick={onDismiss} />
      </DialogFooter>
    </Dialog>
  );
};
