/**
 * Vložení položek rozpočtu z Excelu: v Excelu se označí oblast buněk, zkopíruje se a vloží do okna. Aplikace pozná řádek
 * s nadpisy (Položka, Plán/Nákup, Množství, Cena za MJ…) a ukáže, co přečetla; potvrzením se položky přidají do zvolené skupiny.
 */

import * as React from 'react';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { TextField } from '@fluentui/react/lib/TextField';

import { RES } from '../../ui/theme';
import { BudgetDoc, BudgetItem, ImportedRow, newBudgetId, parseBudgetTable, parseClipboardTable } from '../../core/budget';
import { formatMoney } from '../../core/format';

export function rowsToItems(rows: ImportedRow[], groupId: string): BudgetItem[] {
  return rows.map((r) => ({
    id: newBudgetId('i'),
    groupId,
    description: r.description,
    supplier: r.supplier,
    currency: r.currency,
    quantity: r.quantity,
    unit: r.unit,
    unitCost: r.unitCost
  }));
}

export const BudgetImportDialog: React.FC<{
  doc: BudgetDoc;
  onImport: (items: BudgetItem[]) => void;
  onClose: () => void;
  /** Režim výnosů: bez výběru skupiny; z řádků vzniknou výnosy (popis a částka). */
  revenue?: boolean;
}> = ({ doc, onImport, onClose, revenue }) => {
  const [text, setText] = React.useState('');
  // Vkládat jde jen do běžných skupin (práce má hodiny a sazby, rezerva částku).
  const targets = doc.groups.filter((g) => g.kind === 'standard');
  const [groupId, setGroupId] = React.useState(targets.length > 0 ? targets[0].id : '');
  const result = React.useMemo(() => (text.trim() === '' ? undefined : parseBudgetTable(parseClipboardTable(text))), [text]);

  return (
    <Dialog
      hidden={false}
      onDismiss={onClose}
      dialogContentProps={{
        type: DialogType.normal,
        title: revenue ? 'Vložit výnosy z Excelu' : 'Vložit položky z Excelu',
        subText:
          'V Excelu označte buňky (nadpisy sloupců i řádky položek), zkopírujte je (Ctrl+C) a vložte sem (Ctrl+V). Čte se Položka/Popis, Plán/Nákup/Cena, nepovinně Dodavatel, Množství, MJ, Cena za MJ a Měna. Řádky CELKEM se přeskočí.'
      }}
      modalProps={{ isBlocking: true }}
      minWidth={640}
    >
      <TextField
        multiline
        rows={8}
        ariaLabel="Vložené buňky z Excelu"
        placeholder="Sem vložte buňky z Excelu…"
        value={text}
        onChange={(_, v) => setText(v ?? '')}
        styles={{ field: { fontFamily: 'Consolas, monospace', fontSize: 12 } }}
      />
      {!revenue && (
      <Dropdown
        label="Přidat do skupiny"
        options={targets.map((g) => ({ key: g.id, text: g.name }))}
        selectedKey={groupId}
        onChange={(_, o) => o && setGroupId(String(o.key))}
        styles={{ root: { marginTop: 8, maxWidth: 320 } }}
      />
      )}
      {result && (
        <div style={{ marginTop: 10 }}>
          {result.notes.map((n) => (
            <MessageBar key={n} messageBarType={MessageBarType.warning} isMultiline>
              {n}
            </MessageBar>
          ))}
          {result.rows.length > 0 && (
            <div style={{ maxHeight: 180, overflow: 'auto', border: `1px solid ${RES.grayBlue}`, borderRadius: 4, marginTop: 6 }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i} style={{ borderTop: i === 0 ? 'none' : `1px solid ${RES.background}` }}>
                      <td style={{ padding: '3px 6px' }}>{r.description}</td>
                      <td style={{ padding: '3px 6px', color: RES.gray }}>{r.supplier || ''}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right' }}>
                        {r.quantity !== 1 ? `${r.quantity} ${r.unit || ''} × ` : ''}
                        {formatMoney(r.unitCost, r.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.rows.length > 0 && <div style={{ fontSize: 12, color: RES.gray, marginTop: 4 }}>Přečteno položek: {result.rows.length}.</div>}
        </div>
      )}
      <DialogFooter>
        <PrimaryButton
          text={result && result.rows.length > 0 ? `Přidat ${result.rows.length} ${revenue ? 'výnosů' : 'položek'}` : 'Přidat'}
          disabled={!result || result.rows.length === 0 || (!revenue && !groupId)}
          onClick={() => result && onImport(rowsToItems(result.rows, groupId))}
        />
        <DefaultButton text="Zrušit" onClick={onClose} />
      </DialogFooter>
    </Dialog>
  );
};
