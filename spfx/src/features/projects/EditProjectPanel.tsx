/**
 * Úprava existujícího projektu.
 *
 * Mění se údaje, které se v průběhu projektu vyvíjejí: stav, cena, termíny,
 * zákazník, PM, lokalita. **Číslo projektu se nemění nikdy** — odkazují se na
 * něj složky, objednávky i faktury.
 *
 * Kontroly (termíny, cena, stav vs. skutečné ukončení) jsou v `core/projectEdit.ts`.
 */

import { findSimilarNames, similarWarning } from '../../core/partnerDuplicates';
import * as React from 'react';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { TextField } from '@fluentui/react/lib/TextField';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { DatePicker } from '@fluentui/react/lib/DatePicker';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Dialog, DialogType, DialogFooter } from '@fluentui/react/lib/Dialog';

import { useApp } from '../../ui/AppContext';
import { loadProjectManagerNames } from './projectManagers';
import { CustomerComboBox } from './CustomerComboBox';
import { LocationPicker } from '../map/LocationPicker';
import { RES } from '../../ui/theme';
import { CS_CALENDAR_STRINGS } from '../../ui/csCalendarStrings';
import { navigate, RouteName } from '../../ui/router';
import { Currency, Partner, PartnerType, Project, ProjectStatus } from '../../core/types';
import { formatDate, parseCzechDate, formatMoney } from '../../core/format';
import { canDeleteProject } from '../../core/roles';
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
  const { repos, settings, user } = useApp();

  const [partners, setPartners] = React.useState<Partner[]>([]);
  const [pmOptions, setPmOptions] = React.useState<string[]>([]);

  const [customerId, setCustomerId] = React.useState<number | undefined>(undefined);
  const [customerName, setCustomerName] = React.useState('');
  const [projectManagerName, setProjectManagerName] = React.useState('');
  const [status, setStatus] = React.useState<ProjectStatus>(ProjectStatus.Nabidka);
  const [projectType, setProjectType] = React.useState<string | undefined>(undefined);
  const [location, setLocation] = React.useState('');
  const [latitude, setLatitude] = React.useState<number | undefined>(undefined);
  const [longitude, setLongitude] = React.useState<number | undefined>(undefined);
  const [shortName, setShortName] = React.useState('');
  const [contractPriceNet, setContractPriceNet] = React.useState('');
  const [priceFromBudget, setPriceFromBudget] = React.useState(false);
  const [currency, setCurrency] = React.useState<Currency>('CZK');
  const [startDate, setStartDate] = React.useState<Date | undefined>(undefined);
  const [endDatePlanned, setEndDatePlanned] = React.useState<Date | undefined>(undefined);
  const [endDateActual, setEndDateActual] = React.useState<Date | undefined>(undefined);
  const [title, setTitle] = React.useState('');

  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | undefined>(undefined);
  const [showIssues, setShowIssues] = React.useState(false);

  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = React.useState('');
  const [deleteReason, setDeleteReason] = React.useState('');
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | undefined>(undefined);

  const mayDelete = canDeleteProject(user.roles);

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
    setLatitude(project.latitude);
    setLongitude(project.longitude);
    setShortName(project.shortName ?? '');
    setContractPriceNet(project.contractPriceNet === undefined ? '' : String(project.contractPriceNet));
    setCurrency((project.currency as Currency) || 'CZK');
    // Po schválení rozpočtu je smluvní cena = prodej rozpočtu; ruční zadání je jen do prvního schválení.
    setPriceFromBudget(false);
    repos.budgets
      .get(project.projectNumber)
      .then((c) => setPriceFromBudget(!!c && c.record.approvals.length > 0))
      .catch(() => setPriceFromBudget(false));
    setStartDate(project.startDate);
    setEndDatePlanned(project.endDatePlanned);
    setEndDateActual(project.endDateActual);
    setTitle(project.title);
    setSaveError(undefined);
    setShowIssues(false);
    setDeleteOpen(false);
    setDeleteConfirm('');
    setDeleteReason('');
    setDeleteError(undefined);

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

    loadProjectManagerNames(repos, settings.roles, [project.projectManagerName]).then(setPmOptions).catch(() => undefined); // nabídka nikdy neselže, viz projectManagers.ts
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
          latitude,
          longitude,
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

  const confirmDelete = (): void => {
    setDeleting(true);
    setDeleteError(undefined);
    repos.projects
      .remove(project.projectNumber, user, deleteReason.trim() || undefined)
      .then(() => {
        setDeleting(false);
        setDeleteOpen(false);
        onDismiss();
        navigate(RouteName.Dashboard);
      })
      .catch((e: Error) => {
        setDeleting(false);
        setDeleteError(e.message);
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
    // Zákazník s podobným jménem už existuje? Pak ho uživatel vybere ze seznamu; jinou firmu založí v Partnerech (tam se potvrzuje).
    const all = await repos.partners.list({ includeInactive: true });
    const similar = findSimilarNames(all, name);
    if (similar.length > 0) {
      throw new Error(`${similarWarning(similar)} Vyberte ho ze seznamu zákazníků. Pokud jde opravdu o jinou firmu, založte ji nejdřív v části Partneři (tam se podobné jméno potvrzuje).`);
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
        <div>
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
          {saveError && (
            <MessageBar messageBarType={MessageBarType.error} isMultiline>
              {saveError}
            </MessageBar>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
          <PrimaryButton text={saving ? 'Ukládám…' : 'Uložit změny'} disabled={saving} onClick={save} />
          <DefaultButton text="Zrušit" onClick={onDismiss} disabled={saving} />
          </div>
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

        <CustomerComboBox
          partners={partners}
          name={customerName}
          onPick={(p) => {
            setCustomerId(p.id);
            setCustomerName(p.name);
          }}
          onType={(n) => {
            setCustomerId(undefined);
            setCustomerName(n);
          }}
        />

        <Dropdown
          label="Typ projektu"
          options={typeOptions}
          selectedKey={projectType ?? null}
          onChange={(_, o) => setProjectType(o ? String(o.key) : undefined)}
          placeholder="Vyberte typ"
        />

        <LocationPicker
          value={{ location, latitude, longitude }}
          onChange={(v) => {
            setLocation(v.location);
            setLatitude(v.latitude);
            setLongitude(v.longitude);
          }}
        />

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
            disabled={priceFromBudget}
            description={priceFromBudget ? 'Smluvní cena se přebírá z prodeje schváleného rozpočtu (záložka Realizační rozpočet).' : 'Do prvního schválení rozpočtu jde zadat ručně; po schválení ji přepíše prodej rozpočtu.'}
            value={contractPriceNet}
            errorMessage={issueFor('contractPriceNet')}
            onChange={(_, v) => setContractPriceNet(v ?? '')}
            styles={{ root: { flex: '1 1 auto' } }}
          />
          <Dropdown
            label="Měna"
            options={CURRENCY_OPTIONS}
            disabled={priceFromBudget}
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

        {mayDelete && (
          <div
            style={{
              marginTop: 8,
              paddingTop: 14,
              borderTop: `1px solid ${RES.grayBlue}`
            }}
          >
            <div style={{ fontSize: 12, color: RES.gray, marginBottom: 8 }}>
              Projekt se smaže do koše SharePointu — správce webu ho odtud 93 dní obnoví.
              Složka projektu a dokumenty v ní zůstanou. Běžnému ukončení projektu slouží
              stav „{ProjectStatus.Storno}&ldquo;, ne mazání.
            </div>
            <DefaultButton
              text="Smazat projekt"
              iconProps={{ iconName: 'Delete' }}
              onClick={() => setDeleteOpen(true)}
              disabled={saving}
              styles={{
                root: { borderColor: RES.red, color: RES.red },
                rootHovered: { backgroundColor: RES.red, color: RES.white, borderColor: RES.red },
                iconHovered: { color: RES.white }
              }}
            />
          </div>
        )}
      </div>

      <Dialog
        hidden={!deleteOpen}
        onDismiss={() => setDeleteOpen(false)}
        dialogContentProps={{
          type: DialogType.normal,
          title: `Smazat projekt ${project.projectNumber}?`
        }}
        modalProps={{ isBlocking: true }}
      >
        <div style={{ fontSize: 13, color: RES.text, marginBottom: 12 }}>
          <div style={{ marginBottom: 8 }}>{project.title}</div>
          <div style={{ color: RES.gray }}>
            Zákazník: {project.customerName || '—'} · Cena:{' '}
            {formatMoney(project.contractPriceNet, project.currency)} · Stav: {project.status}
          </div>
        </div>

        <TextField
          label="Důvod smazání"
          description="Zapíše se do auditního logu vedle toho, kdo a kdy mazal."
          multiline
          rows={2}
          value={deleteReason}
          onChange={(_, v) => setDeleteReason(v ?? '')}
        />

        <TextField
          label={`Pro potvrzení opište číslo projektu (${project.projectNumber})`}
          value={deleteConfirm}
          onChange={(_, v) => setDeleteConfirm(v ?? '')}
          styles={{ root: { marginTop: 12 } }}
        />

        {deleteError && (
          <MessageBar messageBarType={MessageBarType.error} isMultiline styles={{ root: { marginTop: 12 } }}>
            {deleteError}
          </MessageBar>
        )}

        <DialogFooter>
          <PrimaryButton
            text={deleting ? 'Mažu…' : 'Smazat projekt'}
            disabled={deleting || deleteConfirm.trim() !== project.projectNumber}
            onClick={confirmDelete}
            styles={{
              root: { backgroundColor: RES.red, borderColor: RES.red },
              rootHovered: { backgroundColor: RES.red, borderColor: RES.red },
              rootDisabled: { backgroundColor: RES.background }
            }}
          />
          <DefaultButton text="Zrušit" onClick={() => setDeleteOpen(false)} disabled={deleting} />
        </DialogFooter>
      </Dialog>
    </Panel>
  );
};
