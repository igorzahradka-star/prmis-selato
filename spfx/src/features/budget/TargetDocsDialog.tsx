/**
 * Doklady z účetnictví přiřazené jedné položce nákupu nebo jednomu výnosu: seznam (kolik z kterého dokladu), odebrání a přiřazení
 * dalšího dokladu — celého zbytku, nebo jen části (doklad pak jde rozdělit mezi víc položek). Součet je skutečnost položky.
 */

import * as React from 'react';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { DefaultButton, IconButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { TextField } from '@fluentui/react/lib/TextField';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';

import { RES } from '../../ui/theme';
import { CurrencyCode, RateTable, convertAmount } from '../../core/currency';
import { formatDate, formatMoney } from '../../core/format';
import { BudgetDoc, round2 } from '../../core/budget';
import { ABRA_DOC_LABELS, AbraDoc, assignDoc, docsForTarget, targetKindOf, unallocatedDocs, unallocatedOfDoc, unassignDoc } from '../../core/abraDocs';

export interface DocsTarget {
  kind: 'item' | 'revenue';
  id: string;
  label: string;
  currency: CurrencyCode;
}

const TH: React.CSSProperties = { textAlign: 'left', fontWeight: 600, fontSize: 12, color: RES.gray, padding: '4px 6px', whiteSpace: 'nowrap' };
const TD: React.CSSProperties = { padding: '4px 6px', fontSize: 13, verticalAlign: 'top' };

function parseAmount(text: string): number | undefined {
  const t = text.replace(/\s/g, '').replace(',', '.');
  if (t === '') {
    return undefined;
  }
  const n = Number(t);
  return isFinite(n) ? n : NaN;
}

export const TargetDocsDialog: React.FC<{
  target: DocsTarget;
  doc: BudgetDoc;
  docs: AbraDoc[];
  rates: RateTable;
  editable: boolean;
  onChange: (doc: BudgetDoc) => void;
  onClose: () => void;
}> = ({ target, doc, docs, rates, editable, onChange, onClose }) => {
  const [pick, setPick] = React.useState<string | undefined>(undefined);
  const [amountText, setAmountText] = React.useState('');
  const [error, setError] = React.useState<string | undefined>(undefined);

  const assigned = docsForTarget(docs, doc.allocations, target.kind, target.id);
  const total = round2(assigned.reduce((s, x) => s + convertAmount(x.amount, x.doc.currency, target.currency, rates), 0));
  const open = unallocatedDocs(docs, doc.allocations).filter((d) => targetKindOf(d) === target.kind);

  const add = (): void => {
    const chosen = open.filter((d) => d.abraId === pick)[0];
    if (!chosen) {
      return;
    }
    const amount = parseAmount(amountText);
    if (amount !== undefined && isNaN(amount)) {
      setError('Částka není číslo.');
      return;
    }
    const result = assignDoc(doc.allocations, chosen, target.kind, target.id, amount);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError(undefined);
    setPick(undefined);
    setAmountText('');
    onChange({ ...doc, allocations: result.allocations });
  };

  return (
    <Dialog
      hidden={false}
      onDismiss={onClose}
      dialogContentProps={{ type: DialogType.normal, title: `Doklady: ${target.label}`, subText: 'Součet přiřazených dokladů je skutečnost této položky. Zálohové faktury se nepřiřazují.' }}
      modalProps={{ isBlocking: false }}
      minWidth={760}
    >
      {error && (
        <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError(undefined)}>
          {error}
        </MessageBar>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${RES.grayBlue}` }}>
            <th style={TH}>Doklad</th>
            <th style={TH}>Partner</th>
            <th style={TH}>Datum</th>
            <th style={{ ...TH, textAlign: 'right' }}>Přiřazeno</th>
            <th style={TH} />
          </tr>
        </thead>
        <tbody>
          {assigned.map((x) => (
            <tr key={x.doc.abraId} style={{ borderTop: `1px solid ${RES.background}` }}>
              <td style={TD} title={x.doc.description}>
                <strong>{x.doc.number}</strong>
                <div style={{ color: RES.gray, fontSize: 12 }}>
                  {ABRA_DOC_LABELS[x.doc.type]}
                  {x.split ? ' · rozdělený mezi víc položek' : ''}
                </div>
              </td>
              <td style={TD}>{x.doc.partnerName || '—'}</td>
              <td style={TD}>{x.doc.issueDate ? formatDate(x.doc.issueDate) : '—'}</td>
              <td style={{ ...TD, textAlign: 'right', color: x.amount < 0 ? RES.red : RES.text }}>
                {formatMoney(x.amount, x.doc.currency)}
                {x.doc.currency !== 'CZK' && x.doc.amountNetCzk !== undefined && <div style={{ color: RES.gray, fontSize: 12 }}>účetně {formatMoney(Math.round(((x.amount * x.doc.amountNetCzk) / x.doc.amountNet) * 100) / 100, 'CZK')}</div>}
                {x.split && <div style={{ color: RES.gray, fontSize: 12 }}>z {formatMoney(x.doc.amountNet, x.doc.currency)}</div>}
              </td>
              <td style={TD}>
                {editable && <IconButton iconProps={{ iconName: 'Cancel' }} title="Odebrat doklad z této položky" ariaLabel={`Odebrat doklad ${x.doc.number}`} onClick={() => onChange({ ...doc, allocations: unassignDoc(doc.allocations, x.doc.abraId, target.kind, target.id) })} styles={{ root: { width: 28, height: 28 } }} />}
              </td>
            </tr>
          ))}
          {assigned.length === 0 && (
            <tr>
              <td colSpan={5} style={{ ...TD, color: RES.gray }}>
                Zatím žádný doklad. Do té doby platí ručně zadaná hodnota.
              </td>
            </tr>
          )}
          {assigned.length > 0 && (
            <tr style={{ borderTop: `1px solid ${RES.grayBlue}`, fontWeight: 600 }}>
              <td style={TD} colSpan={3}>
                Celkem ({assigned.length})
              </td>
              <td style={{ ...TD, textAlign: 'right' }}>{formatMoney(total, target.currency)}</td>
              <td style={TD} />
            </tr>
          )}
        </tbody>
      </table>

      {editable && (
        <div style={{ borderTop: `1px solid ${RES.grayBlue}`, paddingTop: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Přiřadit další doklad</div>
          {open.length === 0 ? (
            <div style={{ fontSize: 13, color: RES.gray }}>Žádný nepřiřazený doklad tohoto druhu. Nové doklady se objeví po aktualizaci z Abry.</div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Dropdown
                label="Doklad"
                selectedKey={pick}
                placeholder="Vyberte doklad"
                options={open.map((d) => ({ key: d.abraId, text: `${d.number} · ${d.partnerName || '—'} · zbývá ${formatMoney(unallocatedOfDoc(d, doc.allocations), d.currency)}` }))}
                onChange={(_, o) => o && setPick(String(o.key))}
                styles={{ root: { flex: '1 1 320px' } }}
              />
              <TextField label="Částka (prázdné = celý zbytek)" value={amountText} onChange={(_, v) => setAmountText(v ?? '')} styles={{ root: { width: 190 } }} />
              <PrimaryButton text="Přiřadit" disabled={!pick} onClick={add} />
            </div>
          )}
        </div>
      )}
      <DialogFooter>
        <DefaultButton text="Zavřít" onClick={onClose} />
      </DialogFooter>
    </Dialog>
  );
};
