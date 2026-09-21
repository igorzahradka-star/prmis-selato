/**
 * Nastavení aplikace (jen administrátor).
 *
 * Fáze 0: umístění projektových složek, šablona složek, vzor názvu projektu,
 * typy projektů, kategorie rozpočtu, prahy semaforu, limity schvalování,
 * názvy skupin rolí a fakturační údaje RES.
 *
 * Číselné řady dokumentů se doplní ve Fázi 1 (až budou k dispozici čítače),
 * kategorie firemního cashflow ve Fázi 5.
 */

import * as React from 'react';
import { Pivot, PivotItem } from '@fluentui/react/lib/Pivot';
import { TextField } from '@fluentui/react/lib/TextField';
import { Toggle } from '@fluentui/react/lib/Toggle';
import { SpinButton } from '@fluentui/react/lib/SpinButton';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { PageHeading } from '../../ui/components/PageHeading';
import { canOpenAdmin } from '../../core/roles';
import { ROLE_LABELS, Role } from '../../core/types';
import {
  AppSettings,
  FolderTemplateNode,
  validateSettings,
  withDefaults
} from '../../core/settings';

export const SettingsPage: React.FC = () => {
  const { settings, repos, user, reloadSettings } = useApp();

  const [draft, setDraft] = React.useState<AppSettings>(settings);
  const [saving, setSaving] = React.useState<boolean>(false);
  const [saved, setSaved] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  React.useEffect(() => setDraft(settings), [settings]);

  if (!canOpenAdmin(user.roles)) {
    return (
      <MessageBar messageBarType={MessageBarType.blocked} isMultiline>
        Nastavení může měnit jen administrátor PRM.
      </MessageBar>
    );
  }

  const problems = validateSettings(draft);
  const changed = JSON.stringify(draft) !== JSON.stringify(settings);

  const save = async (): Promise<void> => {
    setSaving(true);
    setSaved(false);
    setError(undefined);
    try {
      const keys: (keyof AppSettings)[] = [
        'folders',
        'projects',
        'budget',
        'approvals',
        'roles',
        'company'
      ];
      for (const key of keys) {
        if (JSON.stringify(draft[key]) !== JSON.stringify(settings[key])) {
          await repos.settings.saveSection(key, draft[key]);
        }
      }
      await reloadSettings();
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const patch = <K extends keyof AppSettings>(key: K, value: Partial<AppSettings[K]>): void =>
    setDraft((d) => withDefaults({ ...d, [key]: { ...d[key], ...value } }));

  return (
    <>
      <PageHeading
        title="Nastavení"
        subtitle="Chování aplikace pro celou firmu. Změny platí pro všechny uživatele."
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <DefaultButton text="Zahodit změny" onClick={() => setDraft(settings)} disabled={!changed || saving} />
            <PrimaryButton
              text={saving ? 'Ukládám…' : 'Uložit'}
              iconProps={{ iconName: 'Save' }}
              onClick={save}
              disabled={!changed || saving || problems.length > 0}
            />
          </div>
        }
      />

      {problems.length > 0 && (
        <MessageBar messageBarType={MessageBarType.severeWarning} isMultiline>
          <strong>Nastavení zatím nejde uložit:</strong>
          <ul style={{ margin: '6px 0 0 18px' }}>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </MessageBar>
      )}
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {saved && !changed && (
        <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setSaved(false)}>
          Nastavení uloženo.
        </MessageBar>
      )}

      <Pivot styles={{ root: { marginTop: 12 } }}>
        <PivotItem headerText="Složky projektů" itemIcon="FolderHorizontal">
          <Panel>
            <Hint>
              Kam se zakládají složky nových projektů. Knihovnu doporučujeme mít v Průzkumníku
              trvale synchronizovanou přes OneDrive — viz Nápověda.
            </Hint>
            <TextField
              label="Adresa webu s knihovnou"
              description="Nechte prázdné, pokud je knihovna na stejném webu jako aplikace."
              placeholder="https://firma.sharepoint.com/sites/RES-Projekty"
              value={draft.folders.siteUrl}
              onChange={(_, v) => patch('folders', { siteUrl: v || '' })}
            />
            <TextField
              label="Název knihovny dokumentů"
              required
              value={draft.folders.libraryTitle}
              onChange={(_, v) => patch('folders', { libraryTitle: v || '' })}
            />
            <TextField
              label="Kořenová složka v knihovně"
              description="Například „Projekty“. Prázdné = složky vznikají přímo v kořeni knihovny."
              value={draft.folders.rootFolder}
              onChange={(_, v) => patch('folders', { rootFolder: v || '' })}
            />
            <Toggle
              label="Zakládat podsložku podle roku"
              onText="Ano – Projekty / 2026 / 26-014"
              offText="Ne – Projekty / 26-014"
              checked={draft.folders.subfolderByYear}
              onChange={(_, c) => patch('folders', { subfolderByYear: !!c })}
            />
            <FolderTemplateEditor
              template={draft.folders.template}
              onChange={(template) => patch('folders', { template })}
            />
          </Panel>
        </PivotItem>

        <PivotItem headerText="Projekty" itemIcon="ViewList">
          <Panel>
            <TextField
              label="Vzor názvu projektu"
              required
              description="Tokeny: {CISLO}, {ZAKAZNIK}, {LOKALITA}, {TYP}, {ROK}. Projektový manažer může název před uložením upravit."
              value={draft.projects.titlePattern}
              onChange={(_, v) => patch('projects', { titlePattern: v || '' })}
            />
            <ListEditor
              label="Typy projektů"
              description="Nabídka v průvodci založením projektu. Odebráním typu se nezmění už založené projekty."
              values={draft.projects.projectTypes}
              onChange={(projectTypes) => patch('projects', { projectTypes })}
            />
          </Panel>
        </PivotItem>

        <PivotItem headerText="Rozpočet a semafor" itemIcon="Financial">
          <Panel>
            <ListEditor
              label="Kategorie rozpočtu"
              values={draft.budget.categories}
              onChange={(categories) => patch('budget', { categories })}
            />
            <Hint>
              Semafor: <strong>zelená</strong> při odchylce prognózy proti schválenému rozpočtu do 0 %,
              <strong> žlutá</strong> do zadaného prahu, <strong>červená</strong> nad ním nebo když marže
              klesne pod minimum.
            </Hint>
            <NumberField
              label="Práh žluté (% odchylky)"
              value={draft.budget.yellowThresholdPercent}
              onChange={(v) => patch('budget', { yellowThresholdPercent: v })}
            />
            <NumberField
              label="Minimální plánovaná marže (%)"
              value={draft.budget.minimumMarginPercent}
              onChange={(v) => patch('budget', { minimumMarginPercent: v })}
            />
          </Panel>
        </PivotItem>

        <PivotItem headerText="Schvalování" itemIcon="CheckMark">
          <Panel>
            <Hint>
              Limity jsou v korunách <strong>bez DPH</strong>. Nikdo nemůže schválit objednávku,
              kterou sám vystavil — to platí vždy a nedá se vypnout.
            </Hint>
            <NumberField
              label="Limit projektového manažera (Kč)"
              value={draft.approvals.pmLimit}
              step={10000}
              onChange={(v) => patch('approvals', { pmLimit: v })}
            />
            <NumberField
              label="Limit vedení (Kč)"
              description="Nad tuto částku schvaluje jednatel."
              value={draft.approvals.vedeniLimit}
              step={100000}
              onChange={(v) => patch('approvals', { vedeniLimit: v })}
            />
            <Toggle
              label="Objednávku do svého limitu si projektový manažer schvaluje sám"
              onText="Ano – objednávka je rovnou schválená"
              offText="Ne – schvaluje ji vedení"
              checked={draft.approvals.pmSelfApprovalEnabled}
              onChange={(_, c) => patch('approvals', { pmSelfApprovalEnabled: !!c })}
            />
            <Toggle
              label="Objednávky na Režii vždy schvaluje vedení"
              checked={draft.approvals.overheadRequiresVedeni}
              onChange={(_, c) => patch('approvals', { overheadRequiresVedeni: !!c })}
            />
          </Panel>
        </PivotItem>

        <PivotItem headerText="Role" itemIcon="People">
          <Panel>
            <Hint>
              Role odpovídají skupinám SharePointu. Tady se zadává jen <strong>název skupiny</strong> —
              kdo do ní patří, se spravuje v SharePointu (Nastavení webu → Oprávnění webu).
              Změna názvu tady skupinu nepřejmenuje.
            </Hint>
            {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
              <TextField
                key={role}
                label={ROLE_LABELS[role]}
                value={draft.roles[role]}
                onChange={(_, v) => patch('roles', { [role]: v || '' } as Partial<AppSettings['roles']>)}
              />
            ))}
          </Panel>
        </PivotItem>

        <PivotItem headerText="Údaje firmy" itemIcon="ContactCard">
          <Panel>
            <Hint>Tyto údaje se tisknou do hlaviček a patiček PDF dokumentů.</Hint>
            <TextField label="Název" value={draft.company.name} onChange={(_, v) => patch('company', { name: v || '' })} />
            <TextField label="Ulice a číslo" value={draft.company.street} onChange={(_, v) => patch('company', { street: v || '' })} />
            <TextField label="PSČ" value={draft.company.zip} onChange={(_, v) => patch('company', { zip: v || '' })} />
            <TextField label="Město" value={draft.company.city} onChange={(_, v) => patch('company', { city: v || '' })} />
            <TextField label="IČO" value={draft.company.ico} onChange={(_, v) => patch('company', { ico: v || '' })} />
            <TextField label="DIČ" value={draft.company.dic} onChange={(_, v) => patch('company', { dic: v || '' })} />
            <TextField
              label="E-mail účtárny"
              description="Kam se posílají podklady pro fakturaci."
              value={draft.company.accountingEmail}
              onChange={(_, v) => patch('company', { accountingEmail: v || '' })}
            />
            <TextField
              label="Claim do patičky"
              value={draft.company.claim}
              onChange={(_, v) => patch('company', { claim: v || '' })}
            />
          </Panel>
        </PivotItem>
      </Pivot>
    </>
  );
};

// --- pomocné komponenty --------------------------------------------------

const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      background: RES.white,
      border: `1px solid ${RES.grayBlue}`,
      borderRadius: 4,
      padding: '18px 22px',
      marginTop: 12,
      maxWidth: 720,
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }}
  >
    {children}
  </div>
);

const Hint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p
    style={{
      margin: 0,
      padding: '10px 12px',
      background: RES.background,
      borderLeft: `3px solid ${RES.blueLight}`,
      color: RES.text,
      fontSize: 13,
      lineHeight: 1.55
    }}
  >
    {children}
  </p>
);

const NumberField: React.FC<{
  label: string;
  description?: string;
  value: number;
  step?: number;
  onChange: (value: number) => void;
}> = ({ label, description, value, step = 1, onChange }) => (
  <SpinButton
    label={label}
    value={String(value)}
    min={0}
    step={step}
    onChange={(_, v) => {
      const parsed = parseFloat((v || '0').replace(',', '.'));
      onChange(isNaN(parsed) ? 0 : parsed);
    }}
    styles={{ root: { maxWidth: 320 } }}
    title={description}
  />
);

/** Editor jednoduchého seznamu textů — jedna hodnota na řádek. */
const ListEditor: React.FC<{
  label: string;
  description?: string;
  values: string[];
  onChange: (values: string[]) => void;
}> = ({ label, description, values, onChange }) => (
  <TextField
    label={label}
    description={description || 'Jedna položka na řádek.'}
    multiline
    rows={6}
    value={values.join('\n')}
    onChange={(_, v) =>
      onChange(
        (v || '')
          .split('\n')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      )
    }
  />
);

/**
 * Editor stromu složek. Odsazení dvěma mezerami = podsložka.
 *
 * Proč textové pole a ne přetahovací strom: struktura má 8–12 položek
 * a mění se výjimečně. Text se dá zkopírovat, poslat kolegovi a vrátit zpět —
 * u přetahovacího stromu to neplatí.
 */
const FolderTemplateEditor: React.FC<{
  template: FolderTemplateNode[];
  onChange: (template: FolderTemplateNode[]) => void;
}> = ({ template, onChange }) => (
  <TextField
    label="Šablona složek projektu"
    description="Jedna složka na řádek. Podsložku odsaďte dvěma mezerami."
    multiline
    rows={12}
    value={templateToText(template)}
    onChange={(_, v) => onChange(textToTemplate(v || ''))}
    styles={{ field: { fontFamily: 'Consolas, monospace', fontSize: 12 } }}
  />
);

/** Strom složek → text. */
export function templateToText(nodes: FolderTemplateNode[], level: number = 0): string {
  return nodes
    .map((n) => {
      const line = `${'  '.repeat(level)}${n.name}`;
      const children = n.children && n.children.length > 0
        ? `\n${templateToText(n.children, level + 1)}`
        : '';
      return line + children;
    })
    .join('\n');
}

/**
 * Text → strom složek.
 * Podporuje dvě úrovně; hlubší odsazení se připojí k nejbližší nadřazené složce.
 */
export function textToTemplate(text: string): FolderTemplateNode[] {
  const result: FolderTemplateNode[] = [];
  text.split('\n').forEach((rawLine) => {
    const line = rawLine.replace(/\t/g, '  ');
    const name = line.trim();
    if (!name) {
      return;
    }
    const indent = line.length - line.replace(/^ +/, '').length;
    if (indent === 0 || result.length === 0) {
      result.push({ name });
    } else {
      const parent = result[result.length - 1];
      parent.children = parent.children || [];
      parent.children.push({ name });
    }
  });
  return result;
}
