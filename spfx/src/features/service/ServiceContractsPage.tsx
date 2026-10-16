/**
 * Správa smluv (Servis → Správa smluv) — záložky: Smlouvy se zákazníky (seznam, verze, editor, kontroly), Smlouvy s dodavateli (připravujeme) a Údaje
 * smluv (nastavení, ze kterého si smlouva bere zhotovitele, parametry, sazebník, autorizace OEM, kontakty). Smlouva patří vždy jedné lokalitě
 * (číslo např. 10500-01). Obsahuje ceny, proto ji vidí jen správce servisu, vedení a administrátor.
 */

import * as React from 'react';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Pivot, PivotItem } from '@fluentui/react/lib/Pivot';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { PageHeading } from '../../ui/components/PageHeading';
import { canDeleteAnyInService, canManageSites } from '../../core/service';
import { ContractSettings, validateContractSettings } from '../../core/serviceContractSettings';
import { ContractSettingsEditor } from './ContractSettingsEditor';
import { ContractsTab } from './ContractsTab';

const ContractSettingsPanel: React.FC = () => {
  const { repos, user, settings, reloadSettings } = useApp();
  const saved = settings.service.contract;
  const [draft, setDraft] = React.useState<ContractSettings>(saved);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [notice, setNotice] = React.useState<string | undefined>(undefined);
  const mayEdit = canDeleteAnyInService(user.roles);
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const problems = validateContractSettings(draft);

  React.useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const save = (): void => {
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    repos.settings
      .saveSection('service', { ...settings.service, contract: draft })
      .then(() => reloadSettings())
      .then(() => setNotice('Údaje smluv jsou uložené. Platí pro nově zakládané smlouvy; už vytvořené smlouvy se nemění.'))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .then(() => setSaving(false), () => setSaving(false));
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 13, color: RES.gray, marginBottom: 10 }}>
        Údaje, ze kterých si nová servisní smlouva vezme <strong>kopii</strong>: zhotovitel, asset manager, výchozí parametry, sazebník, registr autorizací OEM a výchozí kontakty. Objednatel se bere z partnera
        (zákazníka lokality) a z ARES podle IČO.
      </div>
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>
          {error}
        </MessageBar>
      )}
      {notice && (
        <MessageBar messageBarType={MessageBarType.success} isMultiline onDismiss={() => setNotice(undefined)}>
          {notice}
        </MessageBar>
      )}
      {!mayEdit && (
        <MessageBar messageBarType={MessageBarType.info} isMultiline>
          Údaje smluv vidíte jen ke čtení — upravuje je administrátor (jsou součástí nastavení aplikace).
        </MessageBar>
      )}
      {mayEdit && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
          <PrimaryButton text={saving ? 'Ukládám…' : 'Uložit údaje smluv'} iconProps={{ iconName: 'Save' }} disabled={!changed || saving || problems.length > 0} onClick={save} />
          <DefaultButton text="Zahodit změny" disabled={!changed || saving} onClick={() => setDraft(saved)} />
        </div>
      )}
      {problems.length > 0 && (
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          {problems.map((p) => (
            <div key={p}>{p}</div>
          ))}
        </MessageBar>
      )}
      <ContractSettingsEditor value={draft} onChange={setDraft} disabled={!mayEdit} />
    </div>
  );
};

export const ServiceContractsPage: React.FC = () => {
  const { user } = useApp();
  if (!canManageSites(user.roles)) {
    return (
      <>
        <PageHeading title="Správa smluv" />
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          Servisní smlouvy obsahují ceny, proto je vidí jen správce servisu, vedení a administrátor.
        </MessageBar>
      </>
    );
  }
  return (
    <>
      <PageHeading title="Správa smluv" subtitle="Servisní smlouvy se zákazníky a s dodavateli. Smlouva patří jedné lokalitě (např. 10500-01), má přílohy a verze." />
      <Pivot aria-label="Správa smluv">
        <PivotItem headerText="Smlouvy se zákazníky" itemIcon="ContactCard">
          <ContractsTab />
        </PivotItem>
        <PivotItem headerText="Smlouvy s dodavateli" itemIcon="Handshake">
          <MessageBar messageBarType={MessageBarType.info} isMultiline styles={{ root: { marginTop: 10 } }}>
            Smlouvy s dodavateli servisu (z kusovníku činností) budou navazovat na smlouvy se zákazníky; zatím se nezakládají.
          </MessageBar>
        </PivotItem>
        <PivotItem headerText="Údaje smluv" itemIcon="Settings">
          <ContractSettingsPanel />
        </PivotItem>
      </Pivot>
    </>
  );
};
