/**
 * Vložení položek z kusovníku do rozpočtu: hledání podle písmen, zaškrtnutí jedné nebo více položek, volba skupiny.
 * Do rozpočtu se přidají s množstvím 1 a cenou z kusovníku (upraví se v tabulce).
 */

import * as React from 'react';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Checkbox } from '@fluentui/react/lib/Checkbox';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { formatMoney } from '../../core/format';
import { BudgetDoc } from '../../core/budget';
import { CatalogItem, filterCatalog } from '../../core/catalog';

export const CatalogPickerDialog: React.FC<{
  doc: BudgetDoc;
  onPick: (items: CatalogItem[], groupId: string) => void;
  onClose: () => void;
}> = ({ doc, onPick, onClose }) => {
  const { repos } = useApp();
  const targets = doc.groups.filter((g) => g.kind === 'standard');
  const [list, setList] = React.useState<CatalogItem[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [search, setSearch] = React.useState('');
  const [chosen, setChosen] = React.useState<number[]>([]);
  const [groupId, setGroupId] = React.useState(targets.length > 0 ? targets[0].id : '');

  React.useEffect(() => {
    let cancelled = false;
    repos.catalog
      .list()
      .then((l) => !cancelled && setList(l))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [repos]);

  const shown = filterCatalog(list ?? [], search);
  const toggle = (id: number, on: boolean): void => setChosen((cur) => (on ? [...cur, id] : cur.filter((x) => x !== id)));

  return (
    <Dialog hidden={false} onDismiss={onClose} dialogContentProps={{ type: DialogType.normal, title: 'Vložit z kusovníku' }} modalProps={{ isBlocking: true }} minWidth={680}>
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {!list && !error && <Spinner size={SpinnerSize.medium} label="Načítám kusovník…" />}
      {list && (
        <>
          <SearchBox placeholder="Hledat popis, dodavatele, kategorii…" value={search} onChange={(_, v) => setSearch(v ?? '')} onClear={() => setSearch('')} autoFocus />
          <div style={{ maxHeight: 300, overflow: 'auto', border: `1px solid ${RES.grayBlue}`, borderRadius: 4, margin: '8px 0' }}>
            {shown.length === 0 && <div style={{ padding: 10, fontSize: 13, color: RES.gray }}>{list.length === 0 ? 'Kusovník je zatím prázdný. Položky se do něj ukládají z rozpočtu (⋯ → Uložit do kusovníku).' : 'Nic nenalezeno.'}</div>}
            {shown.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderTop: `1px solid ${RES.background}` }}>
                <Checkbox ariaLabel={`Vybrat ${c.description}`} checked={chosen.indexOf(c.id) !== -1} onChange={(_, ch) => toggle(c.id, !!ch)} />
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>{c.description}</div>
                  <div style={{ fontSize: 11, color: RES.gray }}>{[c.supplier, c.category, c.sourceProject ? `z projektu ${c.sourceProject}` : ''].filter((x) => !!x).join(' · ')}</div>
                </div>
                <div style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                  {formatMoney(c.unitCost, c.currency)}
                  {c.unit ? ` / ${c.unit}` : ''}
                </div>
              </div>
            ))}
          </div>
          <Dropdown label="Přidat do skupiny" selectedKey={groupId} options={targets.map((g) => ({ key: g.id, text: g.name }))} onChange={(_, o) => o && setGroupId(String(o.key))} styles={{ root: { maxWidth: 320 } }} />
        </>
      )}
      <DialogFooter>
        <PrimaryButton text={chosen.length > 0 ? `Vložit (${chosen.length})` : 'Vložit'} disabled={chosen.length === 0 || !groupId} onClick={() => onPick((list ?? []).filter((c) => chosen.indexOf(c.id) !== -1), groupId)} />
        <DefaultButton text="Zrušit" onClick={onClose} />
      </DialogFooter>
    </Dialog>
  );
};
