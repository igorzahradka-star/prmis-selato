/**
 * Kusovník — společná databáze položek pro všechny projekty. Seznam s hledáním podle písmen, úprava a (vedení a
 * administrátor) mazání. Položky se do kusovníku ukládají z rozpočtu (⋯ → Uložit do kusovníku); zde jde přidat i ručně.
 */

import * as React from 'react';
import { DefaultButton, IconButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { DetailsList, DetailsListLayoutMode, IColumn, SelectionMode } from '@fluentui/react/lib/DetailsList';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { PageHeading } from '../../ui/components/PageHeading';
import { formatDate, formatMoney } from '../../core/format';
import { toActor } from '../../core/orderWorkflow';
import { CatalogInput, CatalogItem, canDeleteCatalog, canWriteCatalog, filterCatalog } from '../../core/catalog';
import { CatalogItemDialog } from './CatalogItemDialog';

const EMPTY: CatalogInput = { description: '', currency: 'CZK', unitCost: 0 };

export const CatalogPage: React.FC = () => {
  const { repos, user } = useApp();
  const actor = React.useMemo(() => toActor(user), [user]);
  const [list, setList] = React.useState<CatalogItem[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [search, setSearch] = React.useState('');
  const [edit, setEdit] = React.useState<{ item?: CatalogItem } | undefined>(undefined);
  const [removing, setRemoving] = React.useState<CatalogItem | undefined>(undefined);
  const [notice, setNotice] = React.useState<string | undefined>(undefined);

  const reload = React.useCallback((): void => {
    repos.catalog
      .list()
      .then(setList)
      .catch((e: Error) => setError(e.message));
  }, [repos]);
  React.useEffect(reload, [reload]);

  const mayWrite = canWriteCatalog(actor);
  const mayDelete = canDeleteCatalog(actor);
  const shown = filterCatalog(list ?? [], search);

  const columns: IColumn[] = [
    { key: 'description', name: 'Popis položky', minWidth: 220, isResizable: true, onRender: (c: CatalogItem) => <strong>{c.description}</strong> },
    { key: 'supplier', name: 'Dodavatel', minWidth: 130, maxWidth: 200, isResizable: true, onRender: (c: CatalogItem) => c.supplier || '—' },
    { key: 'category', name: 'Kategorie', minWidth: 100, maxWidth: 150, isResizable: true, onRender: (c: CatalogItem) => c.category || '—' },
    { key: 'cost', name: 'Nákup za MJ', minWidth: 110, maxWidth: 150, isResizable: true, onRender: (c: CatalogItem) => `${formatMoney(c.unitCost, c.currency)}${c.unit ? ` / ${c.unit}` : ''}` },
    { key: 'source', name: 'Z projektu', minWidth: 70, maxWidth: 90, isResizable: true, onRender: (c: CatalogItem) => c.sourceProject || '—' },
    { key: 'by', name: 'Přidal', minWidth: 100, maxWidth: 150, isResizable: true, onRender: (c: CatalogItem) => c.createdByName || '—' },
    { key: 'modified', name: 'Změněno', minWidth: 80, maxWidth: 100, isResizable: true, onRender: (c: CatalogItem) => (c.modified ? formatDate(c.modified) : '—') },
    {
      key: 'actions',
      name: '',
      minWidth: 70,
      maxWidth: 80,
      onRender: (c: CatalogItem) => (
        <div style={{ display: 'flex' }}>
          {mayWrite && <IconButton iconProps={{ iconName: 'Edit' }} title="Upravit" ariaLabel={`Upravit ${c.description}`} onClick={() => setEdit({ item: c })} />}
          {mayDelete && <IconButton iconProps={{ iconName: 'Delete' }} title="Smazat" ariaLabel={`Smazat ${c.description}`} onClick={() => setRemoving(c)} />}
        </div>
      )
    }
  ];

  return (
    <>
      <PageHeading title="Kusovník" subtitle="Společná databáze položek pro všechny projekty — know-how pro další nabídky a rozpočty" action={mayWrite ? <PrimaryButton iconProps={{ iconName: 'Add' }} text="Nová položka" onClick={() => setEdit({})} /> : undefined} />
      <SearchBox placeholder="Hledat popis, dodavatele, kategorii…" value={search} onChange={(_, v) => setSearch(v ?? '')} onClear={() => setSearch('')} styles={{ root: { width: 340, marginBottom: 12 } }} />
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {notice && (
        <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setNotice(undefined)}>
          {notice}
        </MessageBar>
      )}
      {!list && !error && <Spinner size={SpinnerSize.large} label="Načítám kusovník…" />}
      {list && list.length === 0 && <MessageBar messageBarType={MessageBarType.info}>Kusovník je zatím prázdný. Položky se do něj ukládají z rozpočtu projektu (⋯ → Uložit do kusovníku).</MessageBar>}
      {list && list.length > 0 && (
        <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4 }}>
          <DetailsList items={shown} columns={columns} selectionMode={SelectionMode.none} layoutMode={DetailsListLayoutMode.justified} compact ariaLabelForGrid="Kusovník" />
          {shown.length === 0 && <div style={{ padding: 12, fontSize: 13, color: RES.gray }}>Nic nenalezeno.</div>}
        </div>
      )}

      {edit && list && (
        <CatalogItemDialog
          initial={edit.item ? { description: edit.item.description, supplier: edit.item.supplier, category: edit.item.category, currency: edit.item.currency, unit: edit.item.unit, unitCost: edit.item.unitCost, note: edit.item.note, sourceProject: edit.item.sourceProject } : EMPTY}
          editId={edit.item ? edit.item.id : undefined}
          existing={list}
          onClose={() => setEdit(undefined)}
          onSaved={(item, updated) => {
            setEdit(undefined);
            setNotice(updated ? `Položka „${item.description}“ je v kusovníku upravená.` : `Položka „${item.description}“ je uložená v kusovníku.`);
            reload();
          }}
        />
      )}

      {removing && (
        <Dialog hidden={false} onDismiss={() => setRemoving(undefined)} dialogContentProps={{ type: DialogType.normal, title: 'Smazat položku kusovníku', subText: `Položka „${removing.description}“ se smaže z kusovníku (do koše SharePointu). Rozpočty projektů se nemění.` }} modalProps={{ isBlocking: true }}>
          <DialogFooter>
            <PrimaryButton
              text="Smazat"
              onClick={() => {
                const r = removing;
                setRemoving(undefined);
                repos.catalog
                  .remove(r.id, user)
                  .then(reload)
                  .catch((e: Error) => setError(e.message));
              }}
            />
            <DefaultButton text="Zpět" onClick={() => setRemoving(undefined)} />
          </DialogFooter>
        </Dialog>
      )}
    </>
  );
};
