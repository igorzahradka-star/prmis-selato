/**
 * Průvodce založením projektu — zadání kap. 8.2.
 *
 * Zákazník (výběr/nový), typ, lokalita, PM, asistenti, cena, termíny →
 * náhled čísla a názvu → uložit. Po uložení aplikace přidělí číslo, založí
 * strukturu složek a otevře detail projektu. Když založení složek selže,
 * projekt zůstane uložený s tlačítkem na nový pokus.
 */

import * as React from 'react';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { TextField } from '@fluentui/react/lib/TextField';
import { ComboBox, IComboBoxOption } from '@fluentui/react/lib/ComboBox';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { DatePicker } from '@fluentui/react/lib/DatePicker';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { CS_CALENDAR_STRINGS } from '../../ui/csCalendarStrings';
import { navigate, RouteName } from '../../ui/router';
import { Currency, Partner, PartnerType, Project } from '../../core/types';
import { renderProjectTitle } from '../../core/numbering';
import { formatDate } from '../../core/format';

const CURRENCY_OPTIONS: IDropdownOption[] = [
  { key: 'CZK', text: 'CZK' },
  { key: 'EUR', text: 'EUR' }
];

export interface NewProjectPanelProps {
  isOpen: boolean;
  onDismiss: () => void;
  /** Zavolá se po úspěšném uložení, ještě než se panel zavře a přejde na detail. */
  onCreated?: (project: Project) => void;
}

export const NewProjectPanel: React.FC<NewProjectPanelProps> = ({ isOpen, onDismiss, onCreated }) => {
  const { repos, settings, user } = useApp();

  const [partners, setPartners] = React.useState<Partner[]>([]);
  const [pmOptions, setPmOptions] = React.useState<string[]>([]);
  const [previewNumber, setPreviewNumber] = React.useState<string | undefined>(undefined);
  const [previewError, setPreviewError] = React.useState<string | undefined>(undefined);

  const [customerId, setCustomerId] = React.useState<number | undefined>(undefined);
  const [customerName, setCustomerName] = React.useState('');
  const [projectType, setProjectType] = React.useState<string | undefined>(undefined);
  const [location, setLocation] = React.useState('');
  const [projectManagerName, setProjectManagerName] = React.useState(user.displayName);
  const [contractPriceNet, setContractPriceNet] = React.useState<string>('');
  const [currency, setCurrency] = React.useState<Currency>('CZK');
  const [startDate, setStartDate] = React.useState<Date | undefined>(undefined);
  const [endDatePlanned, setEndDatePlanned] = React.useState<Date | undefined>(undefined);
  const [title, setTitle] = React.useState('');
  const [titleTouched, setTitleTouched] = React.useState(false);

  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | undefined>(undefined);
  const [folderRetry, setFolderRetry] = React.useState<{ projectNumber: string; message: string } | undefined>(
    undefined
  );

  // Načtení nabídek při otevření — číslo je jen náhled, čítač se zvýší až při uložení.
  React.useEffect(() => {
    if (!isOpen) {
      return;
    }
    resetForm();
    repos.partners
      .list({})
      .then(setPartners)
      .catch(() => setPartners([]));
    repos.projects
      .list({})
      .then((all) => {
        const names = Array.from(new Set(all.map((p) => p.projectManagerName).filter((n): n is string => !!n)));
        if (names.indexOf(user.displayName) === -1) {
          names.push(user.displayName);
        }
        names.sort((a, b) => a.localeCompare(b, 'cs-CZ'));
        setPmOptions(names);
      })
      .catch(() => setPmOptions([user.displayName]));
    repos.numbering
      .previewNextNumber('PRJ')
      .then(setPreviewNumber)
      .catch((e: Error) => setPreviewError(e.message));
  }, [isOpen]);

  const generatedTitle = renderProjectTitle(settings.projects.titlePattern, {
    cislo: previewNumber ?? '…',
    zakaznik: customerName || undefined,
    lokalita: location || undefined,
    typ: projectType,
    rok: new Date().getFullYear()
  });

  React.useEffect(() => {
    if (!titleTouched) {
      setTitle(generatedTitle);
    }
  }, [generatedTitle, titleTouched]);

  function resetForm(): void {
    setCustomerId(undefined);
    setCustomerName('');
    setProjectType(undefined);
    setLocation('');
    setProjectManagerName(user.displayName);
    setContractPriceNet('');
    setCurrency('CZK');
    setStartDate(undefined);
    setEndDatePlanned(undefined);
    setTitle('');
    setTitleTouched(false);
    setSaveError(undefined);
    setFolderRetry(undefined);
    setPreviewError(undefined);
  }

  const partnerOptions: IComboBoxOption[] = partners.map((p) => ({ key: p.id, text: p.name }));
  const typeOptions: IDropdownOption[] = settings.projects.projectTypes.map((t) => ({ key: t, text: t }));
  const pmDropdownOptions: IDropdownOption[] = pmOptions.map((n) => ({ key: n, text: n }));

  const canSave = !!customerName.trim() && !!projectManagerName.trim() && !saving;

  const save = (): void => {
    setSaving(true);
    setSaveError(undefined);

    ensureCustomerId()
      .then((resolvedCustomerId) =>
        repos.projects.create({
          customerId: resolvedCustomerId,
          customerName: customerName.trim(),
          projectManagerName: projectManagerName.trim(),
          projectType,
          location: location.trim() || undefined,
          contractPriceNet: contractPriceNet ? Number(contractPriceNet) : undefined,
          currency,
          startDate,
          endDatePlanned,
          title: title.trim() || generatedTitle
        })
      )
      .then((result) => {
        setSaving(false);
        if (result.folderError) {
          setFolderRetry({ projectNumber: result.project.projectNumber, message: result.folderError });
          onCreated?.(result.project);
          return;
        }
        onCreated?.(result.project);
        onDismiss();
        navigate(RouteName.ProjectDetail, result.project.projectNumber);
      })
      .catch((e: Error) => {
        setSaving(false);
        setSaveError(e.message);
      });
  };

  const retryFolders = (): void => {
    if (!folderRetry) {
      return;
    }
    const projectNumber = folderRetry.projectNumber;
    setSaving(true);
    repos.projects
      .retryCreateFolders(projectNumber)
      .then(() => {
        setSaving(false);
        setFolderRetry(undefined);
        onDismiss();
        navigate(RouteName.ProjectDetail, projectNumber);
      })
      .catch((e: Error) => {
        setSaving(false);
        setFolderRetry({ projectNumber, message: e.message });
      });
  };

  /** Když zadané jméno neodpovídá žádnému existujícímu partnerovi, rovnou ho založí jako nového. */
  async function ensureCustomerId(): Promise<number | undefined> {
    if (customerId) {
      return customerId;
    }
    const name = customerName.trim();
    if (!name) {
      return undefined;
    }
    const existing = partners.filter((p) => p.name.toLocaleLowerCase('cs-CZ') === name.toLocaleLowerCase('cs-CZ'))[0];
    if (existing) {
      return existing.id;
    }
    const created = await repos.partners.create({
      name,
      partnerType: PartnerType.Zakaznik,
      isActive: true
    });
    return created.id;
  }

  return (
    <Panel
      isOpen={isOpen}
      onDismiss={onDismiss}
      type={PanelType.medium}
      headerText="Nový projekt"
      closeButtonAriaLabel="Zavřít"
      isFooterAtBottom
      onRenderFooterContent={() => (
        <div style={{ display: 'flex', gap: 8 }}>
          <PrimaryButton text={saving ? 'Ukládám…' : 'Uložit'} disabled={!canSave} onClick={save} />
          <DefaultButton text="Zrušit" onClick={onDismiss} disabled={saving} />
        </div>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        <div
          style={{
            background: RES.bluePale,
            border: `1px solid ${RES.grayBlue}`,
            borderRadius: 4,
            padding: '10px 14px'
          }}
        >
          <div style={{ fontSize: 11, color: RES.gray, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Náhled čísla a názvu
          </div>
          {previewError ? (
            <div style={{ color: RES.red, fontSize: 13 }}>{previewError}</div>
          ) : (
            <div style={{ fontSize: 15, fontWeight: 600, color: RES.text }}>
              {previewNumber ?? <Spinner size={SpinnerSize.xSmall} />} {!titleTouched && customerName ? '· ' + generatedTitle : ''}
            </div>
          )}
          <div style={{ fontSize: 11, color: RES.gray, marginTop: 4 }}>
            Skutečné číslo se přidělí až při uložení — mezitím ho může dostat jiný projekt.
          </div>
        </div>

        <ComboBox
          label="Zákazník"
          required
          allowFreeform
          autoComplete="on"
          text={customerName}
          options={partnerOptions}
          onChange={(_, option, __, value) => {
            if (option) {
              setCustomerId(option.key as number);
              setCustomerName(option.text);
            } else {
              setCustomerId(undefined);
              setCustomerName(value ?? '');
            }
          }}
          placeholder="Vyberte, nebo zadejte nového zákazníka"
        />

        <Dropdown
          label="Typ projektu"
          options={typeOptions}
          selectedKey={projectType}
          onChange={(_, o) => setProjectType(o ? String(o.key) : undefined)}
          placeholder="Vyberte typ"
        />

        <TextField label="Lokalita" value={location} onChange={(_, v) => setLocation(v ?? '')} />

        <Dropdown
          label="Projektový manažer"
          required
          options={pmDropdownOptions}
          selectedKey={projectManagerName}
          onChange={(_, o) => o && setProjectManagerName(String(o.key))}
        />

        <div style={{ display: 'flex', gap: 12 }}>
          <TextField
            label="Cena bez DPH"
            type="number"
            value={contractPriceNet}
            onChange={(_, v) => setContractPriceNet(v ?? '')}
            styles={{ root: { flex: '1 1 auto' } }}
          />
          <Dropdown
            label="Měna"
            options={CURRENCY_OPTIONS}
            selectedKey={currency}
            onChange={(_, o) => o && setCurrency(o.key as Currency)}
            styles={{ root: { width: 100 } }}
          />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <DatePicker
            label="Zahájení"
            value={startDate}
            onSelectDate={(d) => setStartDate(d ?? undefined)}
            formatDate={(d) => (d ? formatDate(d) : '')}
            strings={CS_CALENDAR_STRINGS}
            styles={{ root: { flex: '1 1 auto' } }}
          />
          <DatePicker
            label="Ukončení plánované"
            value={endDatePlanned}
            onSelectDate={(d) => setEndDatePlanned(d ?? undefined)}
            formatDate={(d) => (d ? formatDate(d) : '')}
            strings={CS_CALENDAR_STRINGS}
            styles={{ root: { flex: '1 1 auto' } }}
          />
        </div>

        <TextField
          label="Název projektu"
          description="Vygenerováno podle vzoru z Nastavení — dá se před uložením upravit."
          value={title}
          onChange={(_, v) => {
            setTitleTouched(true);
            setTitle(v ?? '');
          }}
        />

        {saveError && (
          <MessageBar messageBarType={MessageBarType.error} isMultiline>
            {saveError}
          </MessageBar>
        )}

        {folderRetry && (
          <MessageBar
            messageBarType={MessageBarType.warning}
            actions={
              <DefaultButton text="Zkusit znovu založit složky" onClick={retryFolders} disabled={saving} />
            }
          >
            Projekt {folderRetry.projectNumber} je uložený. {folderRetry.message}
          </MessageBar>
        )}
      </div>
    </Panel>
  );
};
