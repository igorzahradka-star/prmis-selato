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
import { Checkbox } from '@fluentui/react/lib/Checkbox';
import { MAX_WEB_LIST_ROWS, WEB_LIST_STATUS_CHOICES } from '../../core/webProjects';
import { SpinButton } from '@fluentui/react/lib/SpinButton';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { PageHeading } from '../../ui/components/PageHeading';
import { canOpenAdmin } from '../../core/roles';
import { ROLE_LABELS, Role, Project } from '../../core/types';
import {
  AppSettings,
  ApprovalSettings,
  FolderTemplateNode,
  validateSettings,
  withDefaults
} from '../../core/settings';
import { describeApprovalLadder } from '../../core/approval';
import { CurrencyCode } from '../../core/currency';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { folderSettingsWarnings } from '../../core/projectFolders';
import { overheadProjectNumber } from '../../core/overhead';
import { OVERHEAD_ACCESS_ROLES, accessGroupsForRoles } from '../../core/projectAccess';
import { parseListText, sameList } from '../../core/listText';
import { buildHash, RouteName } from '../../ui/router';
import { ImportProjectsPanel } from '../admin/ImportProjectsPanel';
import { RatesTab } from './RatesTab';
import { SlaRulesEditor } from './SlaRulesEditor';
import { DefaultApproversEditor } from './DefaultApproversEditor';
import { DeleteOrderCard } from './DeleteOrderCard';

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
        'company',
        'webList',
        'service'
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

      <Pivot styles={{ root: { marginTop: 12 } }} overflowBehavior="menu" overflowAriaLabel="Další záložky">
        <PivotItem headerText="Složky projektů" itemIcon="FolderHorizontal">
          <Panel>
            <Hint>
              Kam se zakládají složky nových projektů. Knihovnu doporučujeme mít v Průzkumníku
              trvale synchronizovanou přes OneDrive — viz Nápověda.
            </Hint>
            <TextField
              label="Adresa webu s knihovnou"
              description="Nechte prázdné, pokud je knihovna na stejném webu jako aplikace."
              placeholder="https://revoltum.sharepoint.com/sites/RevoltumEngineeringServices"
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
              description="Například „General/01_PROJEKTY“. Prázdné = složky vznikají přímo v kořeni knihovny."
              value={draft.folders.rootFolder}
              onChange={(_, v) => patch('folders', { rootFolder: v || '' })}
            />
            <Toggle
              label="Zakládat podsložku podle roku"
              onText="Ano – 01_PROJEKTY / 2026 / 26006"
              offText="Ne – 01_PROJEKTY / 26006"
              checked={draft.folders.subfolderByYear}
              onChange={(_, c) => patch('folders', { subfolderByYear: !!c })}
            />
            <TextField
              label="Složka zápisů a stavebních deníků"
              description="Cesta uvnitř složky projektu, např. „04-Zápisy“ (stejně jako ve skutečných projektech). Chybějící podsložky vzniknou při prvním uložení zápisu."
              value={draft.folders.diaryFolder}
              onChange={(_, v) => patch('folders', { diaryFolder: v || '' })}
            />
            <TextField
              label="Složka fotodokumentace"
              description="Cesta uvnitř složky projektu, např. „07-Dokumentace a podklady/FOTO“. Uvnitř vznikají složky podle roku a dne dávky (např. 2026/2026-10-01_KD). Existující složka se najde i při trochu jiném psaní názvu (07_ a 07-)."
              value={draft.folders.photoFolder}
              onChange={(_, v) => patch('folders', { photoFolder: v || '' })}
            />
            <TextField
              label="Složka objednávek"
              description="Cesta uvnitř složky projektu, kam se ukládají PDF odeslaných objednávek, např. „03-Nákup/Objednávky“."
              value={draft.folders.orderFolder}
              onChange={(_, v) => patch('folders', { orderFolder: v || '' })}
            />
            <TextField
              label="Složka reportů"
              description="Cesta uvnitř složky projektu, kam se ukládají PDF reporty ze stavu projektu, např. „07-Dokumentace a podklady/Reporty“."
              value={draft.folders.reportFolder}
              onChange={(_, v) => patch('folders', { reportFolder: v || '' })}
            />
            <TextField
              label="Složka podkladů pro fakturaci"
              description="Cesta uvnitř složky projektu, kam se ukládají PDF podkladů předaných účtárně, např. „03-Rozpočet projektu/Fakturace“."
              value={draft.folders.invoiceFolder}
              onChange={(_, v) => patch('folders', { invoiceFolder: v || '' })}
            />
            <FolderTemplateEditor
              template={draft.folders.template}
              onChange={(template) => patch('folders', { template })}
            />
            <FolderTemplateEditor
              label="Šablona složek projektu Režie"
              description="Režie má jinou strukturu než běžný projekt. Složka Režie je 99900-Režie/rok; tato šablona se zakládá uvnitř roku. Jedna složka na řádek, podsložku odsaďte dvěma mezerami."
              rows={6}
              template={draft.folders.overheadTemplate}
              onChange={(overheadTemplate) => patch('folders', { overheadTemplate })}
            />
            <TextField
              label="Složka objednávek Režie"
              description="Cesta uvnitř složky Režie, kam se ukládají PDF objednávek Režie, např. „01-Objednávky“. Má patřit do šablony Režie."
              value={draft.folders.overheadOrderFolder}
              onChange={(_, v) => patch('folders', { overheadOrderFolder: v || '' })}
            />
            {folderSettingsWarnings(draft.folders).map((w) => (
              <MessageBar key={w} messageBarType={MessageBarType.warning} isMultiline>
                {w}
              </MessageBar>
            ))}
            <Hint>
              Šablona a tyto cesty platí jen pro <strong>nově zakládané projekty</strong>. U už založených projektů se nic nemění — každý projekt má v detailu
              (<strong>Složky projektu</strong>) vlastní mapu, kde má složky objednávek, fakturace, zápisů a fotek, takže pozdější změna šablony stará data nerozbije.
              Složky se hledají tolerantně (číslo na začátku, pomlčka/podtržítko a diakritika nerozhodují); aplikace žádné složky nemaže ani nepřejmenovává.
            </Hint>
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

        <PivotItem headerText="Projekty na webu" itemIcon="Globe">
          <Panel>
            <Hint>
              Řídí web part <strong>Běžící projekty</strong> na úvodní stránce RES (a jeho kopii na webu Revoltum). Seznam se řídí{' '}
              <strong>jen stavem projektu</strong>: ukáže projekty ve stavech zaškrtnutých níže, ostatní se filtrují. Projekt Režie se neukazuje nikdy.
              Na webu je vidět název, projektový manažer, lokalita, celková cena a stav — <strong>náklady a marže se na web nikdy nenačítají</strong>.
              Změna platí hned po obnovení stránky s web partem.
            </Hint>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Stavy projektů, které se na webu ukazují</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {WEB_LIST_STATUS_CHOICES.map((s) => (
                  <Checkbox
                    key={s}
                    label={s}
                    checked={draft.webList.statuses.indexOf(s) !== -1}
                    onChange={(_, checked) =>
                      patch('webList', { statuses: checked ? [...draft.webList.statuses, s] : draft.webList.statuses.filter((x) => x !== s) })
                    }
                  />
                ))}
              </div>
            </div>
            <SpinButton
              label="Kolik řádků se ukáže hned (zbytek po kliknutí na „Zobrazit vše“)"
              min={1}
              max={MAX_WEB_LIST_ROWS}
              step={5}
              value={String(draft.webList.maxRows)}
              onChange={(_, v) => patch('webList', { maxRows: Math.round(Number(v)) || 1 })}
              styles={{ root: { maxWidth: 160 } }}
            />
            <Toggle
              label="Ukazovat sloupec Celková cena"
              checked={draft.webList.showPrice}
              onChange={(_, checked) => patch('webList', { showPrice: !!checked })}
              onText="Ano"
              offText="Ne"
            />
            <Hint>
              Web part se na stránku přidá v úpravách stránky (+ → <strong>Běžící projekty (PRM)</strong>). U kopie na webu Revoltum se v nastavení web partu
              vyplní adresa webu s PRMIS. Čtení seznamu projektů musí mít na webu PRMIS povolené všichni, kdo seznam uvidí (SharePoint → oprávnění).
            </Hint>
          </Panel>
        </PivotItem>

        <PivotItem headerText="Rozpočet a semafor" itemIcon="Financial">
          <Panel>
            <Dropdown
              label="Výchozí měna přehledů"
              options={[
                { key: 'CZK', text: 'CZK (koruny)' },
                { key: 'EUR', text: 'EUR' },
                { key: 'USD', text: 'USD' }
              ]}
              selectedKey={draft.budget.defaultCurrency}
              onChange={(_, o) => o && patch('budget', { defaultCurrency: String(o.key) as CurrencyCode })}
              styles={{ root: { maxWidth: 260 } }}
            />
            <Hint>
              V této měně ukazují částky všechny <strong>přehledy</strong> (seznam projektů, objednávek, podkladů, dlaždice, grafy). Částky v jiné
              měně se přepočítají kurzem ČNB (záložka Kurzy). <strong>Doklady samotné</strong> zůstávají v měně dokladu (CZK, EUR, USD).
            </Hint>
            <ListEditor
              label="Kategorie rozpočtu"
              values={draft.budget.categories}
              onChange={(categories) => patch('budget', { categories })}
            />
            <div style={{ fontWeight: 600, margin: '12px 0 4px' }}>Profese a hodinové sazby (vlastní práce)</div>
            <Hint>
              Číselník pro skupinu <strong>Vlastní práce</strong> v rozpočtech. Při založení rozpočtu si projekt sazby <strong>zkopíruje a pak drží vlastní</strong> —
              změna tady se do už založených rozpočtů nepromítá (v projektu je lze upravit zvlášť). Sazby jsou v Kč za hodinu.
            </Hint>
            <table style={{ borderCollapse: 'collapse', fontSize: 13, marginBottom: 8 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: RES.gray, fontSize: 12 }}>
                  <th style={{ padding: '3px 4px' }}>Profese</th>
                  <th style={{ padding: '3px 4px' }}>Nákladová sazba</th>
                  <th style={{ padding: '3px 4px' }}>Prodejní sazba</th>
                  <th style={{ padding: '3px 4px', textAlign: 'right' }}>Marže</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {draft.budget.professions.map((p, i) => (
                  <tr key={p.id}>
                    <td style={{ padding: '2px 4px' }}>
                      <TextField
                        ariaLabel={`Název profese ${i + 1}`}
                        value={p.name}
                        onChange={(_, v) => patch('budget', { professions: draft.budget.professions.map((x) => (x.id === p.id ? { ...x, name: v ?? '' } : x)) })}
                        styles={{ root: { width: 240 } }}
                      />
                    </td>
                    <td style={{ padding: '2px 4px' }}>
                      <TextField
                        ariaLabel={`Nákladová sazba ${p.name}`}
                        suffix="Kč/h"
                        value={String(p.costRate)}
                        onChange={(_, v) => patch('budget', { professions: draft.budget.professions.map((x) => (x.id === p.id ? { ...x, costRate: Math.max(0, Number(String(v ?? '').replace(',', '.')) || 0) } : x)) })}
                        styles={{ root: { width: 140 } }}
                      />
                    </td>
                    <td style={{ padding: '2px 4px' }}>
                      <TextField
                        ariaLabel={`Prodejní sazba ${p.name}`}
                        suffix="Kč/h"
                        value={String(p.saleRate)}
                        onChange={(_, v) => patch('budget', { professions: draft.budget.professions.map((x) => (x.id === p.id ? { ...x, saleRate: Math.max(0, Number(String(v ?? '').replace(',', '.')) || 0) } : x)) })}
                        styles={{ root: { width: 140 } }}
                      />
                    </td>
                    <td style={{ padding: '2px 8px', textAlign: 'right' }}>
                      {p.saleRate > 0 ? `${(Math.round(((p.saleRate - p.costRate) / p.saleRate) * 1000) / 10).toLocaleString('cs-CZ')} %` : '—'}
                    </td>
                    <td>
                      <DefaultButton
                        text="Odebrat"
                        onClick={() => patch('budget', { professions: draft.budget.professions.filter((x) => x.id !== p.id) })}
                        styles={{ root: { height: 26, minWidth: 0, padding: '0 8px' } }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <DefaultButton
              text="Přidat profesi"
              iconProps={{ iconName: 'Add' }}
              onClick={() => patch('budget', { professions: [...draft.budget.professions, { id: `p${Date.now().toString(36)}`, name: '', costRate: 0, saleRate: 0 }] })}
              styles={{ root: { marginBottom: 8 } }}
            />
            <Hint>
              Semafor rozpočtu se řídí <strong>aktuální marží projektu</strong> = (tržby − nákup) / tržby z prognóz. Hranice jsou od zadané
              hodnoty nahoru: <strong>zelená</strong>, <strong>světle zelená</strong>, <strong>žlutá</strong>; pod žlutou je <strong>červená</strong>
              a záporná marže je <strong>tmavě červená</strong>.
            </Hint>
            <NumberField
              label="Zelená od marže (%) — cíl firmy"
              value={draft.budget.marginGreenPercent}
              onChange={(v) => patch('budget', { marginGreenPercent: v })}
            />
            <NumberField
              label="Světle zelená od marže (%)"
              value={draft.budget.marginLightGreenPercent}
              onChange={(v) => patch('budget', { marginLightGreenPercent: v })}
            />
            <NumberField
              label="Žlutá od marže (%)"
              value={draft.budget.marginYellowPercent}
              onChange={(v) => patch('budget', { marginYellowPercent: v })}
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
              description="Nad limit PM až sem schvaluje navíc vedení."
              value={draft.approvals.vedeniLimit}
              step={100000}
              onChange={(v) => patch('approvals', { vedeniLimit: v })}
            />
            <NumberField
              label="Limit jednatele (Kč)"
              description="Nad limit vedení až sem schvaluje navíc jednatel. Nad tuto částku se schvaluje stejně — aplikace schvaluje všechno, nic nezůstává mimo ni."
              value={draft.approvals.jednatelLimit}
              step={100000}
              onChange={(v) => patch('approvals', { jednatelLimit: v })}
            />
            <ApprovalLadder settings={draft.approvals} />
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
            <DefaultApproversEditor
              value={draft.approvals.defaultApprovers}
              onChange={(defaultApprovers) => patch('approvals', { defaultApprovers })}
            />
            <Hint>
              Objednávky v EUR a USD se pro určení pásma přepočítají kurzem ČNB ze záložky <strong>Kurzy</strong>.
              Nouzové kurzy níže platí jen do chvíle, než tam bude zapsaný první kurz.
            </Hint>
            <NumberField
              label="Nouzový kurz EUR (Kč)"
              value={draft.approvals.eurRateForLimits}
              step={0.5}
              onChange={(v) => patch('approvals', { eurRateForLimits: v })}
            />
            <NumberField
              label="Nouzový kurz USD (Kč)"
              value={draft.approvals.usdRateForLimits}
              step={0.5}
              onChange={(v) => patch('approvals', { usdRateForLimits: v })}
            />
          </Panel>
        </PivotItem>

        <PivotItem headerText="Kurzy" itemIcon="Money">
          <RatesTab />
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

        <PivotItem headerText="Servis" itemIcon="Repair">
          <Panel>
            <Hint>
              <strong>Lhůty SLA servisních požadavků.</strong> Aplikace měří čas od přijetí požadavku do <strong>první reakce</strong> (založení servisního listu) a do
              <strong> vyřešení</strong> (provedení práce na všech listech) a jen to <strong>ukazuje</strong> v seznamu požadavků — nic nesankcionuje. Použije se nejpřesnější shodné
              pravidlo (druh i priorita, pak jen druh, pak jen priorita, pak obecné). Prázdná lhůta = nesleduje se. Čas se počítá v běžných hodinách (celý den). Hodnoty jsou návrh,
              upřesněte je podle smluv.
            </Hint>
            <SlaRulesEditor rules={draft.service.slaRules} onChange={(slaRules) => patch('service', { slaRules })} />
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

        <PivotItem headerText="Odkazy v záhlaví" itemIcon="Link">
          <Panel>
            <Hint>
              Tlačítko <strong>RES CRM</strong> v záhlaví aplikace vede na sesterskou aplikaci RES CRM (nabídky a obchodní případy). Běží-li PRMIS přes celé okno,
              přenese se to i do RES CRM.
            </Hint>
            <Toggle label="Zobrazit tlačítko RES CRM" checked={draft.links.showCrm} onChange={(_, checked) => patch('links', { showCrm: !!checked })} onText="Ano" offText="Ne" />
            <TextField
              label="Adresa stránky RES CRM"
              description="Prázdné = výchozí adresa na stejném webu: …/SitePages/REVCRM.aspx"
              placeholder="https://revoltum.sharepoint.com/sites/RevoltumEngineeringServices/SitePages/REVCRM.aspx"
              value={draft.links.crmUrl}
              onChange={(_, v) => patch('links', { crmUrl: v || '' })}
            />
          </Panel>
        </PivotItem>

        <PivotItem headerText="Jednorázové akce" itemIcon="Repair">
          <OneOffActions />
        </PivotItem>
      </Pivot>
    </>
  );
};

/**
 * Akce, které se dělají jednou a pak už ne — proto nejsou na dashboardu,
 * kde by lidem denně překážely.
 *
 * Nic z toho se neděje samo: obojí vyžaduje kliknutí a obojí se dá pustit
 * opakovaně, aniž by to něco zdvojilo.
 */
const OneOffActions: React.FC = () => {
  const { repos, settings, user } = useApp();

  const [overhead, setOverhead] = React.useState<Project | null | undefined>(undefined);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [importOpen, setImportOpen] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [repairing, setRepairing] = React.useState(false);
  const [repairMessage, setRepairMessage] = React.useState<{ text: string; type: MessageBarType } | undefined>(
    undefined
  );

  React.useEffect(() => {
    let cancelled = false;
    setOverhead(undefined);
    repos.projects
      .list({ includeOverhead: true })
      .then((all) => {
        if (!cancelled) {
          // Režie letošního roku — loňská tu být může a je v pořádku.
          const cislo = overheadProjectNumber(new Date().getFullYear());
          setOverhead(all.filter((p) => p.projectNumber === cislo)[0] ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOverhead(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repos, reloadKey]);

  const zalozitRezii = (): void => {
    setCreating(true);
    setError(undefined);
    repos.projects
      .ensureOverheadProject(user.displayName)
      .then((p) => {
        setCreating(false);
        setOverhead(p);
      })
      .catch((e: Error) => {
        setCreating(false);
        setError(e.message);
        // Režie mohla vzniknout, i když se omezení přístupu nepovedlo — ať je vidět v kartě.
        setReloadKey((k) => k + 1);
      });
  };

  const opravitOdkazy = (): void => {
    setRepairing(true);
    setRepairMessage(undefined);
    repos.projects
      .repairFolderLinks()
      .then((r) => {
        setRepairing(false);
        if (r.failed.length > 0) {
          setRepairMessage({
            text: `Opraveno ${r.fixed.length}, nepovedlo se ${r.failed.length}: ${r.failed
              .map((f) => `${f.projectNumber} (${f.message})`)
              .join('; ')}`,
            type: MessageBarType.warning
          });
        } else if (r.fixed.length > 0) {
          setRepairMessage({
            text: `Hotovo. Opravené odkazy: ${r.fixed.join(', ')}. Ostatních ${r.unchanged} projektů se oprava netýkala.`,
            type: MessageBarType.success
          });
        } else {
          setRepairMessage({
            text: 'Všechny odkazy jsou v pořádku, nebylo co opravovat.',
            type: MessageBarType.success
          });
        }
      })
      .catch((e: Error) => {
        setRepairing(false);
        setRepairMessage({ text: e.message, type: MessageBarType.error });
      });
  };

  const rok = new Date().getFullYear();
  const accessNames = accessGroupsForRoles(OVERHEAD_ACCESS_ROLES, settings.roles)
    .map((g) => g.groupName)
    .join(', ');

  return (
    <Panel>
      <Hint>
        Věci, které se dělají jednou — při zavádění aplikace nebo jednou za rok.
        Proto nejsou na dashboardu, kde by denně překážely.
      </Hint>

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>
          {error}
        </MessageBar>
      )}

      <ActionCard
        title={`Projekt Režie ${rok}`}
        description={`Vnitřní projekt pro režijní objednávky a náklady, co nepatří konkrétní zakázce — nájem, telefony, software. Dostane číslo ${overheadProjectNumber(rok)}. Přístup se omezí hned při založení: uvidí ji jen ${accessNames}. Projektoví manažeři a asistenti ji v seznamu ani v knihovně dokumentů neuvidí. Zakládá se jednou za rok.`}
        state={
          overhead === undefined
            ? 'načítám…'
            : overhead
              ? `hotovo — ${overhead.projectNumber}`
              : 'ještě neexistuje'
        }
        done={!!overhead}
        action={
          overhead ? (
            <DefaultButton
              text="Otevřít"
              href={buildHash(RouteName.ProjectDetail, overhead.projectNumber)}
            />
          ) : (
            <PrimaryButton
              text={creating ? 'Zakládám…' : 'Založit Režii'}
              disabled={creating || overhead === undefined}
              onClick={zalozitRezii}
            />
          )
        }
      />

      <ActionCard
        title="Import stávajících projektů"
        description={`Přečte složky v ${settings.folders.rootFolder || 'kořeni knihovny'} a k projektům, které tam už jsou, založí záznamy v aplikaci. Složky nepřejmenovává ani nepřesouvá. Po importu bude číslování navazovat za nejvyšším existujícím číslem.`}
        state="spustí se ručně, dá se opakovat"
        done={false}
        action={<PrimaryButton text="Otevřít import" onClick={() => setImportOpen(true)} />}
      />

      <ActionCard
        title="Opravit odkazy na složky projektů"
        description="Když tlačítko „Otevřít složku projektu“ skončí chybou „404 NOT FOUND“, je v projektu uložený odkaz na složku se špatnou adresou knihovny. Tohle tlačítko takové odkazy opraví. Přepisuje jen odkazy poznatelně špatného tvaru, správné a jinam mířící nechá být."
        state="dá se pustit opakovaně"
        done={false}
        action={<PrimaryButton text={repairing ? 'Opravuji…' : 'Opravit odkazy'} disabled={repairing} onClick={opravitOdkazy} />}
      />
      {repairMessage && (
        <MessageBar messageBarType={repairMessage.type} isMultiline onDismiss={() => setRepairMessage(undefined)}>
          {repairMessage.text}
        </MessageBar>
      )}

      <DeleteOrderCard />

      <MessageBar messageBarType={MessageBarType.warning} isMultiline>
        <strong>Import spusťte dřív, než někdo založí první projekt.</strong> Dokud neproběhne,
        aplikace neví, na jakém čísle skončila dosavadní řada, a nový projekt by dostal číslo,
        které už některá složka má.
      </MessageBar>

      <ImportProjectsPanel
        isOpen={importOpen}
        onDismiss={() => setImportOpen(false)}
        onImported={() => setReloadKey((k) => k + 1)}
      />
    </Panel>
  );
};

/** Jedna jednorázová akce: co dělá, v jakém je stavu a tlačítko. */
const ActionCard: React.FC<{
  title: string;
  description: string;
  state: string;
  done: boolean;
  action: React.ReactNode;
}> = ({ title, description, state, done, action }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 16,
      border: `1px solid ${RES.grayBlue}`,
      borderRadius: 4,
      padding: '14px 18px'
    }}
  >
    <div style={{ flex: '1 1 auto', minWidth: 0 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: RES.navy }}>{title}</h3>
      <p style={{ margin: '4px 0 0', fontSize: 12, color: RES.gray, lineHeight: 1.55 }}>{description}</p>
      <div
        style={{
          marginTop: 6,
          fontSize: 12,
          fontWeight: 600,
          color: done ? RES.greenDark : RES.gray
        }}
      >
        {state}
      </div>
    </div>
    <div style={{ flex: '0 0 auto' }}>{action}</div>
  </div>
);

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

/**
 * Převede zadaná čísla na věty, aby si administrátor ověřil, že limity
 * znamenají to, co chtěl. Čtyři čísla v polích se kontrolují špatně.
 */
const ApprovalLadder: React.FC<{ settings: ApprovalSettings }> = ({ settings }) => (
  <div
    style={{
      background: RES.bluePale,
      border: `1px solid ${RES.grayBlue}`,
      borderRadius: 4,
      padding: '10px 14px'
    }}
  >
    <div
      style={{
        fontSize: 11,
        color: RES.gray,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        marginBottom: 6
      }}
    >
      Co to znamená
    </div>
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: RES.text }}>
      {describeApprovalLadder(settings).map((row) => (
        <li key={row}>{row}</li>
      ))}
    </ul>
  </div>
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
}> = ({ label, description, values, onChange }) => {
  // Text si drží editor sám. Kdyby se pole plnilo ze seznamu, prázdný řádek
  // (právě stisknutý Enter) by se při každém stisku klávesy smazal a nešlo by
  // přidat novou položku.
  const [text, setText] = React.useState(values.join('\n'));

  React.useEffect(() => {
    // Změna zvenku (Zahodit změny, načtení nastavení) přepíše text; vlastní psaní ne.
    if (!sameList(values, parseListText(text))) {
      setText(values.join('\n'));
    }
  }, [values]);

  return (
    <TextField
      label={label}
      description={description || 'Jedna položka na řádek.'}
      multiline
      rows={6}
      value={text}
      onChange={(_, v) => {
        setText(v || '');
        onChange(parseListText(v || ''));
      }}
    />
  );
};

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
  label?: string;
  description?: string;
  rows?: number;
}> = ({ template, onChange, label, description, rows }) => {
  // Stejný důvod jako u ListEditor: odsazení a prázdné řádky se při psaní
  // nesmí přepisovat přepočítaným stromem.
  const [text, setText] = React.useState(templateToText(template));

  React.useEffect(() => {
    if (templateToText(template) !== templateToText(textToTemplate(text))) {
      setText(templateToText(template));
    }
  }, [template]);

  return (
    <TextField
      label={label || 'Šablona složek projektu'}
      description={description || 'Jedna složka na řádek. Podsložku odsaďte dvěma mezerami.'}
      multiline
      rows={rows || 12}
      value={text}
      onChange={(_, v) => {
        setText(v || '');
        onChange(textToTemplate(v || ''));
      }}
      styles={{ field: { fontFamily: 'Consolas, monospace', fontSize: 12 } }}
    />
  );
};

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
