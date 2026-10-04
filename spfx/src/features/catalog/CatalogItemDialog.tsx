/**
 * Uložení nebo úprava položky kusovníku. Při uložení z rozpočtu se ukáže, jestli už v kusovníku stejná položka je
 * (stejný popis a dodavatel) — pak se přepíše její cena a údaje, žádný duplikát nevznikne.
 */

import * as React from 'react';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { TextField } from '@fluentui/react/lib/TextField';

import { useApp } from '../../ui/AppContext';
import { CURRENCY_CODES, CurrencyCode } from '../../core/currency';
import { formatMoney, parseAmount } from '../../core/format';
import { CatalogInput, CatalogItem, findInCatalog, validateCatalogInput } from '../../core/catalog';

export const CatalogItemDialog: React.FC<{
  /** Výchozí údaje (z položky rozpočtu, nebo upravovaná položka kusovníku). */
  initial: CatalogInput;
  /** Úprava existující položky kusovníku (id); bez něj se ukládá nová / přepisuje shodná. */
  editId?: number;
  existing: CatalogItem[];
  onSaved: (item: CatalogItem, updated: boolean) => void;
  onClose: () => void;
}> = ({ initial, editId, existing, onSaved, onClose }) => {
  const { repos, settings, user } = useApp();
  const [description, setDescription] = React.useState(initial.description);
  const [supplier, setSupplier] = React.useState(initial.supplier ?? '');
  const [category, setCategory] = React.useState(initial.category ?? '');
  const [currency, setCurrency] = React.useState<CurrencyCode>(initial.currency);
  const [unit, setUnit] = React.useState(initial.unit ?? '');
  const [cost, setCost] = React.useState(String(initial.unitCost).replace('.', ','));
  const [note, setNote] = React.useState(initial.note ?? '');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [issues, setIssues] = React.useState<string[]>([]);

  const input: CatalogInput = {
    description: description.trim(),
    supplier: supplier.trim() || undefined,
    category: category || undefined,
    currency,
    unit: unit.trim() || undefined,
    unitCost: parseAmount(cost) ?? NaN,
    note: note.trim() || undefined,
    sourceProject: initial.sourceProject
  };
  const duplicate = editId === undefined ? findInCatalog(existing, input) : undefined;

  const save = (): void => {
    const found = validateCatalogInput(input);
    if (found.length > 0) {
      setIssues(found);
      return;
    }
    setIssues([]);
    setBusy(true);
    setError(undefined);
    const job = editId !== undefined ? repos.catalog.update(editId, input, user).then((item) => ({ item, updated: true })) : repos.catalog.save(input, user);
    job
      .then((r) => onSaved(r.item, r.updated))
      .catch((e: Error) => {
        setBusy(false);
        setError(e.message);
      });
  };

  return (
    <Dialog
      hidden={false}
      onDismiss={busy ? undefined : onClose}
      dialogContentProps={{ type: DialogType.normal, title: editId !== undefined ? 'Upravit položku kusovníku' : 'Uložit do kusovníku', subText: 'Kusovník je společný pro všechny projekty — slouží jako know-how pro další nabídky a rozpočty.' }}
      modalProps={{ isBlocking: true }}
      minWidth={560}
    >
      {duplicate && (
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          Stejná položka (popis a dodavatel) už v kusovníku je za {formatMoney(duplicate.unitCost, duplicate.currency)}. Uložením se její cena a údaje <strong>přepíšou</strong>.
        </MessageBar>
      )}
      <TextField label="Popis položky" required value={description} onChange={(_, v) => setDescription(v ?? '')} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <TextField label="Dodavatel" value={supplier} onChange={(_, v) => setSupplier(v ?? '')} styles={{ root: { flex: '2 1 220px' } }} />
        <Dropdown label="Kategorie" selectedKey={category} options={[{ key: '', text: '—' }, ...settings.budget.categories.map((c) => ({ key: c, text: c }))]} onChange={(_, o) => o && setCategory(String(o.key))} styles={{ root: { flex: '1 1 160px' } }} />
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <TextField label="Nákup za jednotku" required value={cost} onChange={(_, v) => setCost(v ?? '')} styles={{ root: { flex: '1 1 140px' } }} />
        <Dropdown label="Měna" selectedKey={currency} options={CURRENCY_CODES.map((c) => ({ key: c, text: c }))} onChange={(_, o) => o && setCurrency(o.key as CurrencyCode)} styles={{ root: { flex: '0 0 100px' } }} />
        <TextField label="MJ" value={unit} onChange={(_, v) => setUnit(v ?? '')} styles={{ root: { flex: '0 0 80px' } }} />
      </div>
      <TextField label="Poznámka" multiline rows={2} value={note} onChange={(_, v) => setNote(v ?? '')} />
      {(issues.length > 0 || error) && (
        <MessageBar messageBarType={error ? MessageBarType.error : MessageBarType.warning} isMultiline styles={{ root: { marginTop: 8 } }}>
          {error ?? (
            <>
              <strong>Nejde uložit — něco chybí:</strong> {issues.join(' ')}
            </>
          )}
        </MessageBar>
      )}
      <DialogFooter>
        <PrimaryButton text={busy ? 'Ukládám…' : duplicate ? 'Přepsat v kusovníku' : 'Uložit'} disabled={busy} onClick={save} />
        <DefaultButton text="Zrušit" disabled={busy} onClick={onClose} />
      </DialogFooter>
    </Dialog>
  );
};
