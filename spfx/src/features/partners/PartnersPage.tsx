/**
 * Partneři — zákazníci a dodavatelé (PRM_Partners).
 *
 * Fáze 1: seznam, hledání, založení a úprava. Název, adresu, DIČ a příznak
 * plátce DPH jde dotáhnout z ARES podle IČO — kontaktní osobu, e-mail
 * a telefon ARES nezná, ty se doplňují ručně.
 */

import * as React from 'react';
import { DetailsList, DetailsListLayoutMode, IColumn, SelectionMode } from '@fluentui/react/lib/DetailsList';
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import { PrimaryButton, DefaultButton, IconButton } from '@fluentui/react/lib/Button';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { TextField } from '@fluentui/react/lib/TextField';
import { Dropdown, DropdownMenuItemType, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { Toggle } from '@fluentui/react/lib/Toggle';
import { Link } from '@fluentui/react/lib/Link';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { PageHeading } from '../../ui/components/PageHeading';
import { Partner, PartnerType } from '../../core/types';
import { canManagePartners } from '../../core/roles';
import { isValidIco, normalizeIco } from '../../core/ico';
import { PanelMessages } from '../../ui/components/PanelMessages';
import { lookupCompanyByIco } from '../../data/ares';
import {
  DEFAULT_COUNTRY,
  EU_COUNTRIES,
  OTHER_COUNTRIES,
  countryName,
  findCountry,
  isDomestic,
  normalizeVatId,
  vatIdWarning
} from '../../core/countries';

const PARTNER_TYPE_OPTIONS: IDropdownOption[] = [
  { key: PartnerType.Zakaznik, text: PartnerType.Zakaznik },
  { key: PartnerType.Dodavatel, text: PartnerType.Dodavatel },
  { key: PartnerType.Oboji, text: PartnerType.Oboji }
];

const COUNTRY_OPTIONS: IDropdownOption[] = [
  { key: 'hdr-eu', text: 'Evropská unie', itemType: DropdownMenuItemType.Header },
  ...EU_COUNTRIES.map((c) => ({ key: c.code, text: c.name + ' (' + c.code + ')' })),
  { key: 'hdr-div', text: '', itemType: DropdownMenuItemType.Divider },
  { key: 'hdr-other', text: 'Ostatní země', itemType: DropdownMenuItemType.Header },
  ...OTHER_COUNTRIES.map((c) => ({ key: c.code, text: c.name + ' (' + c.code + ')' }))
];

const EMPTY_DRAFT: Omit<Partner, 'id'> = {
  name: '',
  partnerType: PartnerType.Zakaznik,
  country: DEFAULT_COUNTRY,
  ico: '',
  dic: '',
  isVatPayer: false,
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
  /** Co chybí k uložení a co se při ukládání nepovedlo — ukazuje se nad tlačítky v patě panelu. */
  const [saveIssues, setSaveIssues] = React.useState<string[]>([]);
  const [saveError, setSaveError] = React.useState<string | undefined>(undefined);
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
    setSaveIssues([]);
    setSaveError(undefined);
  };

  const openEdit = (partner: Partner): void => {
    setEditing({ ...partner });
    setIsNew(false);
    setAresError(undefined);
    setSaveIssues([]);
    setSaveError(undefined);
  };

  const close = (): void => setEditing(undefined);

  /** Proč lupa nejde, nebo na co si dát pozor (jinak `undefined`). */
  const icoHint = (ico: string | undefined): string | undefined => {
    const n = normalizeIco(ico);
    if (n === '') {
      return undefined;
    }
    if (n.length !== 8) {
      return 'IČO má 8 číslic — zkontrolujte, zda je zapsané celé a bez písmen.';
    }
    return isValidIco(n) ? undefined : 'Kontrolní číslice IČO nesouhlasí, IČO je nejspíš špatně opsané. Lupa přesto zkusí firmu v ARES najít.';
  };

  const loadFromAres = (): void => {
    const ico = normalizeIco(editing ? editing.ico : undefined);
    if (!editing || ico.length !== 8) {
      return;
    }
    setAresError(undefined);
    setAresLoading(true);
    lookupCompanyByIco(ico)
      .then((company) => {
        setEditing((current) =>
          current
            ? {
                ...current,
                ico,
                name: company.name || current.name,
                address: company.address,
                dic: company.dic,
                isVatPayer: company.isVatPayer
              }
            : current
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
    if (!editing.name.trim()) {
      setSaveIssues(['Vyplňte název partnera (nebo ho dotáhněte z ARES podle IČO).']);
      return;
    }
    setSaveIssues([]);
    setSaveError(undefined);
    const { id, ...data } = editing;
    const request = isNew ? repos.partners.create(data) : repos.partners.update(id, data);
    request
      .then(() => {
        close();
        return reload();
      })
      .catch((e: Error) => setSaveError(e.message));
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
        isFooterAtBottom
        onRenderFooterContent={() => (
          <div>
            <PanelMessages issues={saveIssues} error={saveError} onDismissError={() => setSaveError(undefined)} />
            <div style={{ display: 'flex', gap: 8 }}>
              <PrimaryButton text="Uložit" onClick={save} />
              <DefaultButton text="Zrušit" onClick={close} />
            </div>
          </div>
        )}
      >
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            <Dropdown
              label="Země"
              options={COUNTRY_OPTIONS}
              selectedKey={(editing.country || DEFAULT_COUNTRY).toUpperCase()}
              onChange={(_, o) => {
                if (o) {
                  setAresError(undefined);
                  setEditing({ ...editing, country: String(o.key) });
                }
              }}
            />
            {!isDomestic(editing.country) && (
              <MessageBar messageBarType={MessageBarType.info} isMultiline>
                Údaje o zahraniční firmě zatím vyplňte ručně. Automatické dohledání v registrech
                jednotlivých zemí a v evropském systému VIES zatím aplikace neumí.
              </MessageBar>
            )}
            {isDomestic(editing.country) && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <TextField
                label="IČO"
                description={
                  icoHint(editing.ico) ?? 'Vyplňte a dotáhněte zbytek údajů z ARES (Enter nebo lupa).'
                }
                value={editing.ico ?? ''}
                onChange={(_, v) => {
                  setAresError(undefined);
                  setEditing({ ...editing, ico: v });
                }}
                onBlur={() => {
                  const n = normalizeIco(editing.ico);
                  if (editing.ico && n !== editing.ico) {
                    setEditing({ ...editing, ico: n });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    loadFromAres();
                  }
                }}
                styles={{ root: { flex: '1 1 auto' } }}
              />
              <TooltipHost content="Načíst název, adresu, DIČ a plátce DPH z ARES podle IČO">
                {aresLoading ? (
                  <Spinner size={SpinnerSize.medium} styles={{ root: { width: 40, height: 36 } }} />
                ) : (
                  <IconButton
                    iconProps={{ iconName: 'Search' }}
                    ariaLabel="Načíst z ARES"
                    disabled={normalizeIco(editing.ico).length !== 8}
                    onClick={loadFromAres}
                    styles={{
                      root: {
                        width: 40,
                        height: 36,
                        backgroundColor: RES.blue,
                        color: RES.white,
                        borderRadius: 4
                      },
                      rootHovered: { backgroundColor: RES.blueMid, color: RES.white },
                      rootDisabled: { backgroundColor: RES.grayBlue, color: RES.white },
                      icon: { fontSize: 16 }
                    }}
                  />
                )}
              </TooltipHost>
            </div>
            )}
            {!isDomestic(editing.country) && (
              <TextField
                label="Registrační číslo firmy"
                description="Obdoba IČO v dané zemi (např. IČO na Slovensku, HRB v Německu)."
                value={editing.ico ?? ''}
                onChange={(_, v) => setEditing({ ...editing, ico: v })}
              />
            )}
            {aresError && (
              <MessageBar messageBarType={MessageBarType.warning} onDismiss={() => setAresError(undefined)}>
                {aresError}
              </MessageBar>
            )}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <TextField
                label={isDomestic(editing.country) ? 'DIČ' : 'DIČ / VAT ID'}
                description={
                  isDomestic(editing.country)
                    ? undefined
                    : findCountry(editing.country)?.vatExample
                    ? 'S předponou země, např. ' + findCountry(editing.country)?.vatExample
                    : 'Tak, jak je uvedeno na dokladech partnera (mimo EU se tvar nekontroluje).'
                }
                value={editing.dic ?? ''}
                onChange={(_, v) => setEditing({ ...editing, dic: v })}
                onBlur={() => {
                  // Uklidí zápis (mezery, malá písmena, chybějící předpona) až po opuštění pole,
                  // aby se při psaní nepřepisoval pod rukama.
                  if (editing.dic && !isDomestic(editing.country)) {
                    setEditing({ ...editing, dic: normalizeVatId(editing.dic, editing.country) });
                  }
                }}
                errorMessage={isDomestic(editing.country) ? undefined : vatIdWarning(editing.dic, editing.country)}
                styles={{ root: { flex: '1 1 auto' } }}
              />
              <Toggle
                label="Plátce DPH"
                inlineLabel
                checked={!!editing.isVatPayer}
                onChange={(_, c) => setEditing({ ...editing, isVatPayer: !!c })}
                styles={{ root: { marginBottom: 4 } }}
              />
            </div>
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
    {
      key: 'country',
      name: 'Země',
      minWidth: 70,
      maxWidth: 100,
      isResizable: true,
      onRender: (p: Partner) => countryName(p.country)
    },
    { key: 'ico', name: 'IČO', fieldName: 'ico', minWidth: 90, maxWidth: 110, isResizable: true },
    {
      key: 'vat',
      name: 'Plátce DPH',
      minWidth: 80,
      maxWidth: 90,
      onRender: (p: Partner) => (p.isVatPayer ? 'Ano' : <span style={{ color: RES.gray }}>Ne</span>)
    },
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
