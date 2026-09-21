/**
 * Partneři — zákazníci a dodavatelé (PRM_Partners).
 *
 * Fáze 1: seznam, hledání, založení a úprava. Název, adresu a DIČ jde
 * dotáhnout z ARES podle IČO — kontaktní osobu, e-mail a telefon ARES nezná,
 * ty se doplňují ručně.
 */

import * as React from 'react';
import { DetailsList, DetailsListLayoutMode, IColumn, SelectionMode } from '@fluentui/react/lib/DetailsList';
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import { PrimaryButton, DefaultButton, IconButton } from '@fluentui/react/lib/Button';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { TextField } from '@fluentui/react/lib/TextField';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { Toggle } from '@fluentui/react/lib/Toggle';
import { Link } from '@fluentui/react/lib/Link';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { PageHeading } from '../../ui/components/PageHeading';
import { Partner, PartnerType } from '../../core/types';
import { canManagePartners } from '../../core/roles';
import { isValidIco } from '../../core/ico';
import { lookupCompanyByIco } from '../../data/ares';

const PARTNER_TYPE_OPTIONS: IDropdownOption[] = [
  { key: PartnerType.Zakaznik, text: PartnerType.Zakaznik },
  { key: PartnerType.Dodavatel, text: PartnerType.Dodavatel },
  { key: PartnerType.Oboji, text: PartnerType.Oboji }
];

const EMPTY_DRAFT: Omit<Partner, 'id'> = {
  name: '',
  partnerType: PartnerType.Zakaznik,
  ico: '',
  dic: '',
  address: '',
  contactName: '',
  email: '',
  phone: '',
  paymentTermDays: 30,
  isActive: true
};

export const PartnersPage: React.FC = () => {
  const { repos, user } = useApp();
  const canManage = canManagePartners(user.roles);

  const [partners, setPartners] = React.useState<Partner[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [search, setSearch] = React.useState<string>('');
  const [editing, setEditing] = React.useState<Partner | undefined>(undefined);
  const [isNew, setIsNew] = React.useState<boolean>(false);
  const [aresLoading, setAresLoading] = React.useState<boolean>(false);
  const [aresError, setAresError] = React.useState<string | undefined>(undefined);
  // Chrání proti tomu, aby pomalejší starší odpověď (např. při rychlém psaní
  // do hledání) přepsala výsledek novějšího dotazu.
  const requestId = React.useRef(0);

  const reload = React.useCallback(async (): Promise<void> => {
    const myRequestId = ++requestId.current;
    setError(undefined);
    try {
      const data = await repos.partners.list({ search, includeInactive: true });
      if (myRequestId === requestId.current) {
        setPartners(data);
      }
    } catch (e) {
      if (myRequestId === requestId.current) {
        setError((e as Error).message);
      }
    }
  }, [repos, search]);

  React.useEffect(() => {
    setPartners(undefined);
    reload().catch(() => {
      // `reload` si chyby zpracovává sama (nastaví `error`) — sem se nikdy nedostane.
    });
  }, [reload]);

  const openNew = (): void => {
    setEditing({ ...EMPTY_DRAFT, id: 0 });
    setIsNew(true);
    setAresError(undefined);
  };

  const openEdit = (partner: Partner): void => {
    setEditing({ ...partner });
    setIsNew(false);
    setAresError(undefined);
  };

  const close = (): void => setEditing(undefined);

  const loadFromAres = (): void => {
    if (!editing || !editing.ico) {
      return;
    }
    setAresError(undefined);
    setAresLoading(true);
    lookupCompanyByIco(editing.ico)
      .then((company) => {
        setEditing((current) =>
          current ? { ...current, name: company.name || current.name, address: company.address, dic: company.dic } : current
        );
        setAresLoading(false);
      })
      .catch((e: Error) => {
        setAresError(e.message);
        setAresLoading(false);
      });
  };

  const save = (): void => {
    if (!editing) {
      return;
    }
    const { id, ...data } = editing;
    const request = isNew ? repos.partners.create(data) : repos.partners.update(id, data);
    request
      .then(() => {
        close();
        return reload();
      })
      .catch((e: Error) => setError(e.message));
  };

  return (
    <>
      <PageHeading
        title="Partneři"
        subtitle="Zákazníci a dodavatelé"
        action={
          canManage ? <PrimaryButton iconProps={{ iconName: 'Add' }} text="Nový partner" onClick={openNew} /> : undefined
        }
      />

      <SearchBox
        placeholder="Hledat název, IČO, kontaktní osobu…"
        value={search}
        onChange={(_, v) => setSearch(v ?? '')}
        onClear={() => setSearch('')}
        styles={{ root: { width: 320, marginBottom: 12 } }}
      />

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}

      {!partners && !error && <Spinner size={SpinnerSize.large} label="Načítám partnery…" />}

      {partners && partners.length === 0 && !error && (
        <MessageBar messageBarType={MessageBarType.info}>Žádný partner neodpovídá hledání.</MessageBar>
      )}

      {partners && partners.length > 0 && (
        <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4 }}>
          <DetailsList
            items={partners}
            columns={buildColumns(canManage, openEdit)}
            selectionMode={SelectionMode.none}
            layoutMode={DetailsListLayoutMode.justified}
            compact
            isHeaderVisible
            ariaLabelForGrid="Seznam partnerů"
          />
        </div>
      )}

      <Panel
        isOpen={!!editing}
        onDismiss={close}
        type={PanelType.medium}
        headerText={isNew ? 'Nový partner' : 'Upravit partnera'}
        closeButtonAriaLabel="Zavřít"
      >
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            <TextField
              label="Název"
              required
              value={editing.name}
              onChange={(_, v) => setEditing({ ...editing, name: v ?? '' })}
            />
            <Dropdown
              label="Typ"
              options={PARTNER_TYPE_OPTIONS}
              selectedKey={editing.partnerType}
              onChange={(_, o) => o && setEditing({ ...editing, partnerType: o.key as PartnerType })}
            />
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
              <TextField
                label="IČO"
                value={editing.ico ?? ''}
                onChange={(_, v) => {
                  setAresError(undefined);
                  setEditing({ ...editing, ico: v });
                }}
                styles={{ root: { flex: '1 1 auto' } }}
              />
              <TooltipHost content="Načíst název, adresu a DIČ z ARES podle IČO">
                {aresLoading ? (
                  <Spinner size={SpinnerSize.small} styles={{ root: { padding: '0 8px', height: 32 } }} />
                ) : (
                  <IconButton
                    iconProps={{ iconName: 'Search' }}
                    ariaLabel="Načíst z ARES"
                    disabled={!editing.ico || !isValidIco(editing.ico)}
                    onClick={loadFromAres}
                  />
                )}
              </TooltipHost>
            </div>
            {aresError && (
              <MessageBar messageBarType={MessageBarType.warning} onDismiss={() => setAresError(undefined)}>
                {aresError}
              </MessageBar>
            )}
            <TextField label="DIČ" value={editing.dic ?? ''} onChange={(_, v) => setEditing({ ...editing, dic: v })} />
            <TextField
              label="Adresa"
              multiline
              rows={2}
              value={editing.address ?? ''}
              onChange={(_, v) => setEditing({ ...editing, address: v })}
            />
            <TextField
              label="Kontaktní osoba"
              value={editing.contactName ?? ''}
              onChange={(_, v) => setEditing({ ...editing, contactName: v })}
            />
            <TextField
              label="E-mail"
              value={editing.email ?? ''}
              onChange={(_, v) => setEditing({ ...editing, email: v })}
            />
            <TextField
              label="Telefon"
              value={editing.phone ?? ''}
              onChange={(_, v) => setEditing({ ...editing, phone: v })}
            />
            <TextField
              label="Splatnost (dnů)"
              type="number"
              value={String(editing.paymentTermDays ?? '')}
              onChange={(_, v) => setEditing({ ...editing, paymentTermDays: v ? Number(v) : undefined })}
            />
            <Toggle
              label="Aktivní"
              inlineLabel
              checked={editing.isActive}
              onChange={(_, c) => setEditing({ ...editing, isActive: !!c })}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <PrimaryButton text="Uložit" disabled={!editing.name.trim()} onClick={save} />
              <DefaultButton text="Zrušit" onClick={close} />
            </div>
          </div>
        )}
      </Panel>
    </>
  );
};

function buildColumns(canManage: boolean, onEdit: (p: Partner) => void): IColumn[] {
  const columns: IColumn[] = [
    {
      key: 'name',
      name: 'Název',
      fieldName: 'name',
      minWidth: 200,
      isResizable: true,
      onRender: (p: Partner) =>
        canManage ? (
          <Link onClick={() => onEdit(p)} style={{ fontWeight: 600 }}>
            {p.name}
          </Link>
        ) : (
          <span style={{ fontWeight: 600 }}>{p.name}</span>
        )
    },
    { key: 'type', name: 'Typ', fieldName: 'partnerType', minWidth: 90, maxWidth: 100, isResizable: true },
    { key: 'ico', name: 'IČO', fieldName: 'ico', minWidth: 90, maxWidth: 110, isResizable: true },
    {
      key: 'contact',
      name: 'Kontaktní osoba',
      fieldName: 'contactName',
      minWidth: 140,
      isResizable: true
    },
    { key: 'email', name: 'E-mail', fieldName: 'email', minWidth: 160, isResizable: true },
    { key: 'phone', name: 'Telefon', fieldName: 'phone', minWidth: 120, isResizable: true },
    {
      key: 'terms',
      name: 'Splatnost',
      minWidth: 80,
      maxWidth: 90,
      isResizable: true,
      onRender: (p: Partner) => (p.paymentTermDays !== undefined ? `${p.paymentTermDays} dnů` : '—')
    },
    {
      key: 'active',
      name: 'Aktivní',
      minWidth: 70,
      maxWidth: 80,
      onRender: (p: Partner) => (p.isActive ? 'Ano' : <span style={{ color: RES.gray }}>Ne</span>)
    }
  ];
  return columns;
}
