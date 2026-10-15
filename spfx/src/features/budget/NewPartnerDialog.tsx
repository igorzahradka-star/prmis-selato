/**
 * Rychlé založení partnera (dodavatele) přímo z rozpočtu: název, IČO s dotažením z ARES (lupa), DIČ a adresa.
 * Partner se uloží do společného seznamu Partneři, takže je hned k dispozici i jinde v aplikaci.
 */

import * as React from 'react';
import { DefaultButton, IconButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { TextField } from '@fluentui/react/lib/TextField';

import { useApp } from '../../ui/AppContext';
import { isValidIco, normalizeIco } from '../../core/ico';
import { checkPartner, similarWarning } from '../../core/partnerDuplicates';
import { Partner, PartnerType } from '../../core/types';
import { PartnerKinds, partnerTypeFrom } from '../../core/partnerKinds';
import { PartnerKindPicker } from '../partners/PartnerKindPicker';
import { lookupCompanyByIco } from '../../data/ares';

export const NewPartnerDialog: React.FC<{
  suggestedName: string;
  onCreated: (partner: Partner) => void;
  onClose: () => void;
}> = ({ suggestedName, onCreated, onClose }) => {
  const { repos } = useApp();
  const [name, setName] = React.useState(suggestedName);
  const [kinds, setKinds] = React.useState<PartnerKinds>({ customer: false, supplier: true, serviceSupplier: false });
  const [ico, setIco] = React.useState('');
  const [dic, setDic] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [vat, setVat] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [missing, setMissing] = React.useState(false);
  const [similarWarn, setSimilarWarn] = React.useState<string | undefined>(undefined);

  const normalized = normalizeIco(ico);

  const lookup = (): void => {
    if (normalized.length !== 8) {
      return;
    }
    setBusy(true);
    setError(undefined);
    lookupCompanyByIco(normalized)
      .then((c) => {
        setIco(normalized);
        setName(c.name || name);
        setDic(c.dic ?? '');
        setAddress(c.address ?? '');
        setVat(c.isVatPayer);
        setBusy(false);
      })
      .catch((e: Error) => {
        setBusy(false);
        setError(e.message);
      });
  };

  const create = (force: boolean = false): void => {
    if (name.trim() === '') {
      setMissing(true);
      return;
    }
    setBusy(true);
    setError(undefined);
    setSimilarWarn(undefined);
    const type = partnerTypeFrom(kinds);
    if (!type) {
      setMissing(true);
      return;
    }
    const input = { name: name.trim(), partnerType: type, isServiceSupplier: kinds.serviceSupplier, country: 'CZ', ico: normalized || undefined, dic: dic.trim() || undefined, isVatPayer: vat, address: address.trim() || undefined, isActive: true };
    // Stejné IČO se neuloží; stejné nebo podobné jméno jen upozorní a založení potvrdí uživatel.
    repos.partners
      .list({ includeInactive: true })
      .then((all) => {
        const check = checkPartner(all, input);
        if (check.blocking) {
          throw new Error(check.blocking);
        }
        if (!force && check.similar.length > 0) {
          setSimilarWarn(similarWarning(check.similar));
          setBusy(false);
          return undefined;
        }
        return repos.partners.create(input);
      })
      .then((p) => {
        if (!p) {
          return;
        }
        setBusy(false);
        onCreated(p);
      })
      .catch((e: Error) => {
        setBusy(false);
        setError(e.message);
      });
  };

  return (
    <Dialog hidden={false} onDismiss={busy ? undefined : onClose} dialogContentProps={{ type: DialogType.normal, title: 'Nový partner', subText: 'Uloží se do seznamu Partneři (zemí Česko) — údaje jde doplnit později v Partnerech.' }} modalProps={{ isBlocking: true }} minWidth={520}>
      {error && (
        <MessageBar messageBarType={MessageBarType.warning} isMultiline onDismiss={() => setError(undefined)}>
          {error}
        </MessageBar>
      )}
      {similarWarn && (
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          {similarWarn} Jde o jinou firmu? Jinak vyberte stávajícího partnera.
        </MessageBar>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <TextField
          label="IČO"
          description={normalized.length === 8 && !isValidIco(normalized) ? 'Kontrolní číslice nesouhlasí — zkontrolujte IČO.' : 'Vyplňte a dotáhněte údaje z ARES (Enter nebo lupa).'}
          value={ico}
          onChange={(_, v) => setIco(v ?? '')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              lookup();
            }
          }}
          styles={{ root: { flex: '1 1 auto' } }}
        />
        {busy ? <Spinner size={SpinnerSize.medium} styles={{ root: { width: 40, height: 32 } }} /> : <IconButton iconProps={{ iconName: 'Search' }} ariaLabel="Načíst z ARES" disabled={normalized.length !== 8} onClick={lookup} styles={{ root: { width: 40, height: 32 } }} />}
      </div>
      <TextField label="Název" required value={name} errorMessage={missing && name.trim() === '' ? 'Vyplňte název partnera.' : undefined} onChange={(_, v) => setName(v ?? '')} />
      <PartnerKindPicker value={kinds} error={missing && !partnerTypeFrom(kinds)} onChange={setKinds} />
      <TextField label="DIČ" value={dic} onChange={(_, v) => setDic(v ?? '')} />
      <TextField label="Adresa" multiline rows={2} value={address} onChange={(_, v) => setAddress(v ?? '')} />
      <DialogFooter>
        <PrimaryButton text="Založit partnera" disabled={busy} onClick={() => create(false)} />
        {similarWarn && <DefaultButton text="Přesto založit" disabled={busy} onClick={() => create(true)} />}
        <DefaultButton text="Zrušit" disabled={busy} onClick={onClose} />
      </DialogFooter>
    </Dialog>
  );
};
