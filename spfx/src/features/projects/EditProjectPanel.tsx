/**
 * Úprava existujícího projektu.
 *
 * Mění se údaje, které se v průběhu projektu vyvíjejí: stav, cena, termíny,
 * zákazník, PM, lokalita. **Číslo projektu se nemění nikdy** — odkazují se na
 * něj složky, objednávky i faktury.
 *
 * Kontroly (termíny, cena, stav vs. skutečné ukončení) jsou v `core/projectEdit.ts`.
 */

import * as React from 'react';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { TextField } from '@fluentui/react/lib/TextField';
import { ComboBox, IComboBoxOption } from '@fluentui/react/lib/ComboBox';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { DatePicker } from '@fluentui/react/lib/DatePicker';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { CS_CALENDAR_STRINGS } from '../../ui/csCalendarStrings';
import { Currency, Partner, PartnerType, Project, ProjectStatus } from '../../core/types';
import { formatDate, parseCzechDate } from '../../core/format';
import {
  validateProjectEdit,
  projectEditWarnings,
  ProjectEditValues,
  ValidationIssue
} from '../../core/projectEdit';

const CURRENCY_OPTIONS: IDropdownOption[] = [
  { key: 'CZK', text: 'CZK' },
  { key: 'EUR', text: 'EUR' }
];

const STATUS_OPTIONS: IDropdownOption[] = Object.keys(ProjectStatus).map((k) => {
  const value = ProjectStatus[k as keyof typeof ProjectStatus];
  return { key: value, text: value };
});

export interface EditProjectPanelProps {
  isOpen: boolean;
  project: Project;
  onDismiss: () => void;
  /** Zavolá se po úspěšném uložení s novou podobou projektu. */
  onSaved: (project: Project) => void;
}

export const EditProjectPanel: React.FC<EditProjectPanelProps> = ({
  isOpen,
  project,
  onDismiss,
  onSaved
}) => {
  const { repos, settings } = useApp();

  const [partners, setPartners] = React.useState<Partner[]>([]);
  const [pmOptions, setPmOptions] = React.useState<string[]>([]);

  const [customerId, setCustomerId] = React.useState<number | undefined>(undefined);
  const [customerName, setCustomerName] = React.useState('');
  const [projectManagerName, setProjectManagerName] = React.useState('');
  const [status, setStatus] = React.useState<ProjectStatus>(ProjectStatus.Nabidka);
  const [projectType, setProjectType] = React.useState<string | undefined>(undefined);
  const [location, setLocation] = React.useState('');
  const [shortName, setShortName] = React.useState('');
  const [contractPriceNet, setContractPriceNet] = React.useState('');
  const [currency, setCurrency] = React.useState<Currency>('CZK');
  const [startDate, setStartDate] = React.useState<Date | undefined>(undefined);
  const [endDatePlanned, setEndDatePlanned] = React.useState<Date | undefined>(undefined);
  const [endDateActual, setEndDateActual] = React.useState<Date | undefined>(undefined);
  const [title, setTitle] = React.useState('');

  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | undefined>(undefined);
  const [showIssues, setShowIssues] = React.useState(false);

  // Naplnění formuláře při otevření. Projekt se bere takový, jaký přišel z detailu.
  React.useEffect(() => {
    if (!isOpen) {
      return;
    }
    setCustomerId(undefined);
    setCustomerName(project.customerName ?? '');
    setProjectManagerName(project.projectManagerName ?? '');
    setStatus(project.status);
    setProjectType(project.projectType);
    setLocation(project.location ?? '');
    setShortName(project.shortName ?? '');
    setContractPriceNet(project.contractPriceNet === undefined ? '' : String(project.contractPriceNet));
    setCurrency((project.currency as Currency) || 'CZK');
    setStartDate(project.startDate);
    setEndDatePlanned(project.endDatePlanned);
    setEndDateActual(project.endDateActual);
    setTitle(project.title);
    setSaveError(undefined);
    setShowIssues(false);

    repos.partners
      .list({})
      .then((list) => {
        setPartners(list);
        const match = list.filter((p) => p.name === project.customerName)[0];
        if (match) {
          setCustomerId(match.id);
        }
      })
      .catch(() => setPartners([]));

    repos.projects
      .list({})
      .then((all) => {
        const names = Array.from(
          new Set(all.map((p) => p.projectManagerName).filter((n): n is string => !!n))
        );
        if (project.projectManagerName && names.indexOf(project.projectManagerName) === -1) {
          names.push(project.projectManagerName);
        }
        names.sort((a, b) => a.localeCompare(b, 'cs-CZ'));
        setPmOptions(names);
      })
      .catch(() => setPmOptions(project.projectManagerName ? [project.projectManagerName] : []));
  }, [isOpen, project]);

  const parsedPrice = contractPriceNet.trim() === '' ? undefined : Number(contractPriceNet);
  const values: ProjectEditValues = {
    title,
    customerName: customerName.trim() || undefined,
    projectManagerName,
    status,
    projectType,
    location: location.trim() || undefined,
    shortName: shortName.trim() || undefined,
    contractPriceNet: parsedPrice,
    startDate,
    endDatePlanned,
    endDateActual
  };

  const issues = validateProjectEdit(values);
  const warnings = projectEditWarnings(values);
  const issueFor = (field: keyof ProjectEditValues): string | undefined =>
    showIssues ? issues.filter((i: ValidationIssue) => i.field === field).map((i) => i.message)[0] : undefined;

  const partnerOptions: IComboBoxOption[] = partners.map((p) => ({ key: p.id, text: p.name }));
  const typeOptions: IDropdownOption[] = settings.projects.projectTypes.map((t) => ({ key: t, text: t }));
  const pmDropdownOptions: IDropdownOption[] = pmOptions.map((n) => ({ key: n, text: n }));

  const save = (): void => {
    setShowIssues(true);
    if (issues.length > 0) {
      return;
    }
    setSaving(true);
    setSaveError(undefined);

    ensureCustomerId()
      .then((resolvedCustomerId) =>
        repos.projects.update(project.projectNumber, {
          title: title.trim(),
          shortName: shortName.trim() || undefined,
          customerId: resolvedCustomerId,
          customerName: customerName.trim() || undefined,
          projectManagerName: projectManagerName.trim(),
          status,
          projectType,
          location: location.trim() || undefined,
          contractPriceNet: parsedPrice,
          currency,
          startDate,
          endDatePlanned,
          endDateActual
        })
      )
      .then((updated) => {
        setSaving(false);
        onSaved(updated);
        onDismiss();
      })
      .catch((e: Error) => {
        setSaving(false);
        setSaveError(e.message);
      });
  };

  /** Nový zákazník napsaný rovnou do pole se založí jako partner — stejně jako v průvodci. */
  async function ensureCustomerId(): Promise<number | undefined> {
    const name = customerName.trim();
    if (!name) {
      return undefined;
    }
    if (customerId) {
      return customerId;
    }
    const existing = partners.filter(
      (p) => p.name.toLocaleLowerCase('cs-CZ') === name.toLocaleLowerCase('cs-CZ')
    )[0];
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
      headerText={`Úprava projektu ${project.projectNumber}`}
      closeButtonAriaLabel="Zavřít"
      isFooterAtBottom
      onRenderFooterContent={() => (
        <div style={{ display: 'flex', gap: 8 }}>
          <PrimaryButton text={saving ? 'Ukládám…' : 'Uložit změny'} disabled={saving} onClick={save} />
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
            padding: '10px 14px',
            fontSize: 12,
            color: RES.gray
          }}
        >
          Číslo projektu <strong style={{ color: RES.text }}>{project.projectNumber}</strong> se
          nemění — odkazují se na něj složky i doklady.
        </div>

        <Dropdown
          label="Stav projektu"
          required
          options={STATUS_OPTIONS}
          selectedKey={status}
          onChange={(_, o) => o && setStatus(o.key as ProjectStatus)}
        />

        <ComboBox
          label="Zákazník"
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
          selectedKey={projectType ?? null}
          onChange={(_, o) => setProjectType(o ? String(o.key) : undefined)}
          placeholder="Vyberte typ"
        />

        <TextField label="Lokalita" value={location} onChange={(_, v) => setLocation(v ?? '')} />

        <Dropdown
          label="Projektový manažer"
          required
          options={pmDropdownOptions}
          selectedKey={projectManagerName}
          errorMessage={issueFor('projectManagerName')}
          onChange={(_, o) => o && setProjectManagerName(String(o.key))}
        />

        <div style={{ display: 'flex', gap: 12 }}>
          <TextField
            label="Cena bez DPH"
            type="number"
            value={contractPriceNet}
            errorMessage={issueFor('contractPriceNet')}
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
            parseDateFromString={(t) => parseCzechDate(t) ?? null}
            allowTextInput
            styles={{ root: { flex: '1 1 auto' } }}
          />
          <DatePicker
            label="Ukončení plánované"
            value={endDatePlanned}
            onSelectDate={(d) => setEndDatePlanned(d ?? undefined)}
            formatDate={(d) => (d ? formatDate(d) : '')}
            strings={CS_CALENDAR_STRINGS}
            parseDateFromString={(t) => parseCzechDate(t) ?? null}
            allowTextInput
            textField={{ errorMessage: issueFor('endDatePlanned') }}
            styles={{ root: { flex: '1 1 auto' } }}
          />
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <DatePicker
            label="Ukončení skutečné"
            value={endDateActual}
            onSelectDate={(d) => setEndDateActual(d ?? undefined)}
            formatDate={(d) => (d ? formatDate(d) : '')}
            strings={CS_CALENDAR_STRINGS}
            parseDateFromString={(t) => parseCzechDate(t) ?? null}
            allowTextInput
            textField={{ errorMessage: issueFor('endDateActual') }}
            styles={{ root: { flex: '1 1 auto' } }}
          />
          <DefaultButton
            text="Vymazat"
            disabled={!endDateActual}
            onClick={() => setEndDateActual(undefined)}
            styles={{ root: { height: 32 } }}
          />
        </div>

        <TextField
          label="Zkratka"
          description="Krátký název do tabulek a hlaviček. Nepovinné."
          value={shortName}
          onChange={(_, v) => setShortName(v ?? '')}
        />

        <TextField
          label="Název projektu"
          required
          multiline
          autoAdjustHeight
          value={title}
          errorMessage={issueFor('title')}
          onChange={(_, v) => setTitle(v ?? '')}
        />

        {showIssues && issues.length > 0 && (
          <MessageBar messageBarType={MessageBarType.error} isMultiline>
            Opravte prosím označená pole:
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {issues.map((i) => (
                <li key={`${i.field}-${i.message}`}>{i.message}</li>
              ))}
            </ul>
          </MessageBar>
        )}

        {warnings.length > 0 && (
          <MessageBar messageBarType={MessageBarType.warning} isMultiline>
            {warnings.length === 1 ? (
              warnings[0]
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </MessageBar>
        )}

        {saveError && (
          <MessageBar messageBarType={MessageBarType.error} isMultiline>
            {saveError}
          </MessageBar>
        )}
      </div>
    </Panel>
  );
};
