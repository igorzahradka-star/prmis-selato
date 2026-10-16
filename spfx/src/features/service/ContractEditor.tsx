/**
 * Editor servisní smlouvy (jedné verze) — boční panel se záložkami: Objednatel, Podmínky, Soubory a cena, Sazebník a kontakty, Kontrola.
 * Upravit jde jen návrh; ostatní verze se zobrazí jen ke čtení. Kontroly (chyby blokují předání k podpisu a generování, varování a
 * chybějící údaje jen upozorňují) se přepočítávají průběžně. Co se ve smlouvě mění, je snapshot dat verze — nastavení ani checklist lokality
 * se tím nemění.
 */

import * as React from 'react';
import { ActionButton, DefaultButton, IconButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { Pivot, PivotItem } from '@fluentui/react/lib/Pivot';
import { TextField } from '@fluentui/react/lib/TextField';
import { Toggle } from '@fluentui/react/lib/Toggle';

import { RES } from '../../ui/theme';
import { ServiceDevice, ServiceSite } from '../../core/service';
import { cleanChecklist, evaluateChecklist, SiteChecklist } from '../../core/serviceCatalog';
import { SERVICE_CATALOG as CATALOG } from '../../core/serviceCatalog.data';
import {
  assetsFromDevices,
  ContractAsset,
  ContractInput,
  ContractIssue,
  ContractSite,
  deviceKindOfAsset,
  describeChanges,
  recomputeSiteActivities,
  ServiceContractVersion,
  slaTable,
  snapshotActivities,
  sumPriceRows,
  validateContract
} from '../../core/serviceContract';
import { boxStyle, boxTitle, CONTRACT_PARAM_FIELDS, gridStyle, numText, parseNum, PartyEditor, RowsEditor } from './ContractSettingsEditor';
import { DATE_INPUT, dateToInput, inputToDate, TD, TH } from './serviceUi';

const SEVERITY_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  chyba: { bg: '#F6DADA', fg: '#8A2A2A', label: 'Chyba' },
  doplnit: { bg: '#FFF1CC', fg: '#7A5A00', label: 'Doplnit' },
  varování: { bg: '#E8EEF4', fg: '#34506B', label: 'Varování' }
};

export const IssueList: React.FC<{ issues: ContractIssue[] }> = ({ issues }) =>
  issues.length === 0 ? (
    <MessageBar messageBarType={MessageBarType.success}>Kontrola nenašla žádný problém — smlouvu lze dát k podpisu.</MessageBar>
  ) : (
    <div>
      {issues.map((i, k) => {
        const s = SEVERITY_STYLE[i.severity];
        return (
          <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 4, fontSize: 13 }}>
            <span style={{ background: s.bg, color: s.fg, borderRadius: 10, padding: '1px 9px', fontSize: 12, whiteSpace: 'nowrap' }}>{s.label}</span>
            <span>{i.message}</span>
          </div>
        );
      })}
    </div>
  );

export const ContractEditor: React.FC<{
  version: ServiceContractVersion;
  site?: ServiceSite;
  devices: ServiceDevice[];
  previous?: ContractInput;
  canEdit: boolean;
  onSave: (snapshot: ContractInput, meta: { effectiveFrom?: Date; changeNote?: string }) => Promise<unknown>;
  onClose: () => void;
}> = ({ version, site, devices, previous, canEdit, onSave, onClose }) => {
  const initial = React.useMemo(() => JSON.stringify({ s: version.snapshot, e: dateToInput(version.effectiveFrom), n: version.changeNote ?? '' }), [version]);
  const [draft, setDraft] = React.useState<ContractInput>(version.snapshot);
  const [effective, setEffective] = React.useState(dateToInput(version.effectiveFrom));
  const [note, setNote] = React.useState(version.changeNote ?? '');
  const [tab, setTab] = React.useState('objednatel');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [showActivities, setShowActivities] = React.useState(false);

  const l = draft.lokality[0];
  const dirty = JSON.stringify({ s: draft, e: effective, n: note }) !== initial;
  const issues = validateContract(CATALOG, draft);
  const dis = !canEdit;
  const patch = (p: Partial<ContractInput>): void => setDraft({ ...draft, ...p });
  const patchSite = (p: Partial<ContractSite>): void => setDraft({ ...draft, lokality: [{ ...l, ...p }, ...draft.lokality.slice(1)] });
  const sla = slaTable(CATALOG, l.sla_profil, l.sla_override);
  const siteDevices = devices.filter((d) => site && d.siteNumber === site.number && d.isActive);
  const addable = assetsFromDevices(siteDevices).filter((a) => !l.assety.some((x) => x.kod === a.kod));
  const patchAsset = (i: number, p: Partial<ContractAsset>): void => patchSite({ assety: l.assety.map((a, k) => (k === i ? { ...a, ...p } : a)) });
  const changes = previous ? describeChanges(previous, draft, CATALOG) : [];
  const counts = { chyba: issues.filter((i) => i.severity === 'chyba').length, doplnit: issues.filter((i) => i.severity === 'doplnit').length, varovani: issues.filter((i) => i.severity === 'varování').length };

  const withAssets = (assety: ContractAsset[]): void => setDraft({ ...draft, lokality: [recomputeSiteActivities(CATALOG, { ...l, assety }), ...draft.lokality.slice(1)] });

  const refreshFromChecklist = (): void => {
    if (!site || !site.checklist) {
      return;
    }
    const c: SiteChecklist = cleanChecklist(CATALOG, site.checklist);
    patchSite({
      priznaky: c.flags,
      moduly: c.modules,
      cinnosti_vypnute: c.disabled,
      cinnosti_zapnute: c.enabled,
      perioda_override: c.periods,
      sla_profil: c.slaProfile,
      cinnosti: snapshotActivities(evaluateChecklist(CATALOG, c, l.assety.map((a) => deviceKindOfAsset(a.typ))))
    });
  };

  const submit = (): void => {
    setBusy(true);
    setError(undefined);
    onSave({ ...draft, lokality: draft.lokality.map((x) => ({ ...x, cena: { ...x.cena, celkem: sumPriceRows(x.cena.radky) } })) }, { effectiveFrom: inputToDate(effective), changeNote: note.trim() || undefined })
      .then(() => setBusy(false))
      .catch((e: unknown) => {
        setBusy(false);
        setError(e instanceof Error ? e.message : String(e));
      });
  };

  const sections = React.useMemo(() => {
    const items = evaluateChecklist(CATALOG, cleanChecklist(CATALOG, { flags: l.priznaky, modules: l.moduly, disabled: l.cinnosti_vypnute, enabled: l.cinnosti_zapnute, periods: l.perioda_override, slaProfile: l.sla_profil }), l.assety.map((a) => deviceKindOfAsset(a.typ)));
    const active = new Set((l.cinnosti || []).map((c) => c.id));
    return items.filter((i) => active.has(i.activity.id));
  }, [l]);

  return (
    <Panel
      isOpen
      onDismiss={busy ? undefined : onClose}
      type={PanelType.custom}
      customWidth="1000px"
      headerText={`Smlouva ${version.contractNumber} · verze ${version.versionNo} (${version.kind.toLocaleLowerCase('cs-CZ')}, ${version.status.toLocaleLowerCase('cs-CZ')})`}
      closeButtonAriaLabel="Zavřít"
      isFooterAtBottom
      onRenderFooterContent={() => (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {canEdit && <PrimaryButton text={busy ? 'Ukládám…' : 'Uložit'} disabled={busy || !dirty} onClick={submit} />}
          <DefaultButton text={canEdit ? 'Zavřít' : 'Zavřít'} disabled={busy} onClick={onClose} />
          <span style={{ fontSize: 12, color: RES.gray }}>
            {counts.chyba} chyb · {counts.doplnit} k doplnění · {counts.varovani} varování{dirty && canEdit ? ' · změny nejsou uložené' : ''}
          </span>
        </div>
      )}
    >
      {!canEdit && (
        <MessageBar messageBarType={MessageBarType.info} isMultiline>
          Tato verze je ve stavu „{version.status}“ a jde jen číst. Změny se dělají v nové verzi (dodatku) k podepsané smlouvě.
        </MessageBar>
      )}
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>
          {error}
        </MessageBar>
      )}
      <Pivot aria-label="Části smlouvy" selectedKey={tab} onLinkClick={(i) => i && i.props.itemKey && setTab(i.props.itemKey)}>
        <PivotItem itemKey="objednatel" headerText="Objednatel">
          <div style={{ marginTop: 10 }}>
            <div style={boxStyle}>
              <div style={boxTitle}>Objednatel (zákazník lokality)</div>
              <PartyEditor value={draft.objednatel} onChange={(objednatel) => patch({ objednatel })} disabled={dis} />
            </div>
            <div style={boxStyle}>
              <div style={boxTitle}>Asset manager, banka a podpis</div>
              <Toggle label="Asset manager zastupuje objednatele (dává pokyny)" inlineLabel checked={!!draft.asset_manager} disabled={dis} onChange={(_, v) => patch({ asset_manager: v ? { nazev: '', ico: '', sidlo: '' } : null })} />
              {draft.asset_manager && (
                <div style={gridStyle}>
                  <TextField label="Asset manager — název" disabled={dis} value={draft.asset_manager.nazev} onChange={(_, v) => patch({ asset_manager: { ...(draft.asset_manager as NonNullable<ContractInput['asset_manager']>), nazev: v ?? '' } })} />
                  <TextField label="IČO" disabled={dis} value={draft.asset_manager.ico} onChange={(_, v) => patch({ asset_manager: { ...(draft.asset_manager as NonNullable<ContractInput['asset_manager']>), ico: v ?? '' } })} />
                  <TextField label="Sídlo" disabled={dis} value={draft.asset_manager.sidlo} onChange={(_, v) => patch({ asset_manager: { ...(draft.asset_manager as NonNullable<ContractInput['asset_manager']>), sidlo: v ?? '' } })} />
                </div>
              )}
              <div style={gridStyle}>
                <TextField label="Financující banka — název" disabled={dis} value={draft.banka ? draft.banka.nazev : ''} onChange={(_, v) => patch({ banka: v ? { nazev: v, ico: draft.banka ? draft.banka.ico : '' } : null })} />
                <TextField label="Financující banka — IČO" disabled={dis || !draft.banka} value={draft.banka ? draft.banka.ico : ''} onChange={(_, v) => draft.banka && patch({ banka: { ...draft.banka, ico: v ?? '' } })} />
                <TextField label="Místo podpisu" disabled={dis} value={draft.smlouva.misto_podpisu ?? ''} onChange={(_, v) => patch({ smlouva: { ...draft.smlouva, misto_podpisu: v ?? '' } })} />
              </div>
            </div>
            <div style={boxStyle}>
              <div style={boxTitle}>Volby smlouvy</div>
              <Toggle label="Skupina Revoltum (prohlášení k převodním cenám)" inlineLabel checked={draft.volby.skupina_revoltum} disabled={dis} onChange={(_, v) => patch({ volby: { ...draft.volby, skupina_revoltum: !!v } })} />
              <Toggle label="Smluvní pokuty (penále)" inlineLabel checked={draft.volby.penale} disabled={dis} onChange={(_, v) => patch({ volby: { ...draft.volby, penale: !!v } })} />
              <Toggle label="Bankovní ujednání (čl. 16: zastavení, step-in, oznámení bance)" inlineLabel checked={draft.volby.bankovni_ujednani} disabled={dis} onChange={(_, v) => patch({ volby: { ...draft.volby, bankovni_ujednani: !!v } })} />
            </div>
          </div>
        </PivotItem>

        <PivotItem itemKey="podminky" headerText="Podmínky">
          <div style={{ marginTop: 10 }}>
            <div style={boxStyle}>
              <div style={boxTitle}>Platnost a změny</div>
              <label style={{ fontSize: 14 }}>
                <div>Účinnost od</div>
                <input type="date" value={effective} disabled={dis} onChange={(e) => setEffective(e.target.value)} style={DATE_INPUT} />
              </label>
              {(version.kind === 'Dodatek' || note !== '') && <TextField label="Popis změn (dodatek)" multiline rows={3} disabled={dis} value={note} onChange={(_, v) => setNote(v ?? '')} />}
            </div>
            <div style={boxStyle}>
              <div style={boxTitle}>Parametry</div>
              <div style={gridStyle}>
                {CONTRACT_PARAM_FIELDS.map((p) => {
                  const v = draft.parametry[p.key];
                  return (
                    <TextField
                      key={p.key}
                      label={p.label}
                      disabled={dis}
                      value={p.text ? String(v) : numText(v as number)}
                      onChange={(_, val) => patch({ parametry: { ...draft.parametry, [p.key]: p.text ? val ?? '' : parseNum(val ?? '') } })}
                    />
                  );
                })}
              </div>
            </div>
            <div style={boxStyle}>
              <div style={boxTitle}>SLA lokality</div>
              <Dropdown
                label="Profil SLA"
                selectedKey={l.sla_profil || 'STANDARD'}
                disabled={dis}
                options={Object.keys(CATALOG.sla.profily).map((k) => ({ key: k, text: CATALOG.sla.profily[k].nazev }))}
                onChange={(_, o) => o && patchSite({ sla_profil: String(o.key) === 'STANDARD' ? undefined : String(o.key), sla_override: undefined })}
                styles={{ root: { maxWidth: 420 } }}
              />
              <table style={{ borderCollapse: 'collapse', marginTop: 8 }}>
                <thead>
                  <tr>
                    {['Priorita', 'Reakce', 'Příjezd', 'Dočasné opatření', 'Odstranění'].map((h) => (
                      <th key={h} style={TH}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sla.radky.map((r) => (
                    <tr key={r.kod} style={{ borderTop: `1px solid ${RES.background}` }}>
                      <td style={TD}>
                        <strong>{r.kod}</strong> {r.nazev}
                      </td>
                      <td style={TD}>{r.reakce}</td>
                      <td style={TD}>{r.prijezd}</td>
                      <td style={TD}>{r.docasne}</td>
                      <td style={TD}>{r.odstraneni}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </PivotItem>

        <PivotItem itemKey="soubory" headerText="Soubory a cena">
          <div style={{ marginTop: 10 }}>
            <div style={boxStyle}>
              <div style={boxTitle}>
                Lokalita {l.kod} {l.nazev}
              </div>
              <div style={{ fontSize: 12, color: RES.gray }}>
                {[l.adresa, l.katastr && `k. ú. ${l.katastr}`, l.lv && `LV ${l.lv}`, l.gps].filter((x) => !!x).join(' · ')}
              </div>
            </div>
            <div style={boxStyle}>
              <div style={boxTitle}>Soubory v příloze lokality</div>
              {l.assety.length === 0 && <div style={{ color: RES.gray, fontSize: 13 }}>Příloha zatím nemá žádný soubor.</div>}
              {l.assety.map((a, i) => (
                <div key={a.kod} style={{ borderTop: i === 0 ? undefined : `1px solid ${RES.background}`, paddingTop: 6, marginTop: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong>
                      {a.kod} {a.nazev}
                    </strong>
                    <span style={{ color: RES.gray }}>· {a.typ}</span>
                    <span style={{ flex: '1 1 auto' }} />
                    {!dis && <IconButton iconProps={{ iconName: 'Delete' }} title="Odebrat soubor z přílohy" ariaLabel="Odebrat soubor z přílohy" onClick={() => withAssets(l.assety.filter((_, k) => k !== i))} />}
                  </div>
                  <div style={gridStyle}>
                    <TextField label="Parametry" disabled={dis} value={a.parametry ?? ''} onChange={(_, v) => patchAsset(i, { parametry: v ?? '' })} />
                    <TextField label="Výrobce (OEM)" disabled={dis} value={a.vyrobce_oem ?? ''} onChange={(_, v) => patchAsset(i, { vyrobce_oem: v ?? '' })} />
                    <TextField label="Technologie" disabled={dis} multiline rows={2} value={a.technologie ?? ''} onChange={(_, v) => patchAsset(i, { technologie: v ?? '' })} />
                    <TextField label="Záruky" disabled={dis} multiline rows={2} value={a.zaruky ?? ''} onChange={(_, v) => patchAsset(i, { zaruky: v ?? '' })} />
                  </div>
                </div>
              ))}
              {!dis && addable.length > 0 && (
                <Dropdown
                  label="Přidat soubor lokality do přílohy"
                  placeholder="Vyberte soubor"
                  selectedKey={null}
                  options={addable.map((a) => ({ key: a.kod, text: `${a.kod} ${a.nazev} (${a.typ})` }))}
                  onChange={(_, o) => {
                    const a = o ? addable.filter((x) => x.kod === String(o.key))[0] : undefined;
                    if (a) {
                      withAssets([...l.assety, a].sort((x, y) => x.kod.localeCompare(y.kod)));
                    }
                  }}
                  styles={{ root: { maxWidth: 420, marginTop: 8 } }}
                />
              )}
            </div>

            <div style={boxStyle}>
              <div style={boxTitle}>Činnosti v příloze: {(l.cinnosti || []).length}</div>
              <div style={{ fontSize: 12, color: RES.gray, marginBottom: 4 }}>
                Činnosti plynou z checklistu lokality (příznaky, moduly, ruční úpravy) a ze souborů v příloze. Checklist se upravuje v Servis → Lokality → Checklist; tlačítkem níže se jeho aktuální stav přenese do této verze.
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {!dis && <DefaultButton iconProps={{ iconName: 'Refresh' }} text="Obnovit z checklistu lokality" disabled={!site || !site.checklist} onClick={refreshFromChecklist} />}
                <ActionButton text={showActivities ? 'Skrýt seznam činností' : 'Zobrazit seznam činností'} onClick={() => setShowActivities(!showActivities)} />
              </div>
              {showActivities && (
                <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 6 }}>
                  <thead>
                    <tr>
                      <th style={TH}>Činnost</th>
                      <th style={TH}>Perioda</th>
                      <th style={TH}>Zahrnutí</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sections.map((i) => (
                      <tr key={i.activity.id} style={{ borderTop: `1px solid ${RES.background}` }}>
                        <td style={TD}>
                          <span style={{ color: RES.gray, fontSize: 12 }}>{i.activity.id}</span> {i.activity.nazev}
                        </td>
                        <td style={TD}>{CATALOG.periodicity[i.period].nazev}</td>
                        <td style={TD}>{CATALOG.zahrnuti[i.activity.zahrnuti]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <RowsEditor
              heading={`Cena lokality (ročně) — celkem ${Math.round(sumPriceRows(l.cena.radky)).toLocaleString('cs-CZ')} Kč`}
              hint="Řádky ceny podle souborů a služeb (základ × jednotková cena = ročně). Celkem se sečte automaticky."
              rows={l.cena.radky}
              columns={[
                { key: 'polozka', label: 'Položka' },
                { key: 'zaklad', label: 'Základ', width: 130 },
                { key: 'jednotkova', label: 'Jednotková', width: 140 },
                { key: 'rocne', label: 'Ročně (Kč)', width: 120, number: true }
              ]}
              blank={{ polozka: '', zaklad: '', jednotkova: '', rocne: 0 }}
              disabled={dis}
              onChange={(radky) => patchSite({ cena: { ...l.cena, radky, celkem: sumPriceRows(radky) } })}
            />
            <div style={boxStyle}>
              <div style={gridStyle}>
                <TextField label="Hodin korektivní údržby v ceně (ročně)" disabled={dis} value={l.cena.korektiva_hodin === undefined ? '' : numText(l.cena.korektiva_hodin)} onChange={(_, v) => patchSite({ cena: { ...l.cena, korektiva_hodin: v ? parseNum(v) : undefined } })} />
                <TextField label="Limit náhradních dílů v ceně (Kč)" disabled={dis} value={l.cena.nd_limit === undefined ? '' : numText(l.cena.nd_limit)} onChange={(_, v) => patchSite({ cena: { ...l.cena, nd_limit: v ? parseNum(v) : undefined } })} />
              </div>
              <TextField label="Poznámka k ceně" multiline rows={2} disabled={dis} value={l.cena.poznamka ?? ''} onChange={(_, v) => patchSite({ cena: { ...l.cena, poznamka: v ?? '' } })} />
            </div>
            <RowsEditor
              heading="Strategické náhradní díly"
              hint="U BESS s bankovním financováním se očekává seznam strategických dílů (varování, když chybí)."
              rows={l.nd}
              columns={[
                { key: 'polozka', label: 'Položka' },
                { key: 'asset', label: 'Soubor', width: 100 },
                { key: 'mnozstvi', label: 'Množství', width: 90 },
                { key: 'umisteni', label: 'Umístění' }
              ]}
              blank={{ polozka: '', asset: '', mnozstvi: '', umisteni: '' }}
              disabled={dis}
              onChange={(nd) => patchSite({ nd })}
            />
          </div>
        </PivotItem>

        <PivotItem itemKey="sazebnik" headerText="Sazebník a kontakty">
          <div style={{ marginTop: 10 }}>
            <RowsEditor
              heading="Sazebník"
              rows={draft.sazebnik}
              columns={[
                { key: 'polozka', label: 'Položka' },
                { key: 'jednotka', label: 'Jednotka', width: 90 },
                { key: 'cena', label: 'Cena', width: 100, number: true },
                { key: 'poznamka', label: 'Poznámka' }
              ]}
              blank={{ polozka: '', jednotka: 'hod', cena: 0, poznamka: '' }}
              disabled={dis}
              onChange={(sazebnik) => patch({ sazebnik })}
            />
            <RowsEditor
              heading="Autorizace OEM"
              hint="U BESS musí být autorizace pro výrobce uvedeného u souboru; jinak smlouvu nejde dát k podpisu."
              rows={draft.autorizace_oem}
              columns={[
                { key: 'vyrobce', label: 'Výrobce' },
                { key: 'rozsah', label: 'Rozsah' },
                { key: 'doklad', label: 'Doklad' },
                { key: 'platnost_do', label: 'Platnost do', width: 120 }
              ]}
              blank={{ vyrobce: '', rozsah: '', doklad: '', platnost_do: '' }}
              disabled={dis}
              onChange={(autorizace_oem) => patch({ autorizace_oem })}
            />
            <RowsEditor
              heading="Servisní partneři (podzhotovitelé)"
              rows={draft.servisni_partneri}
              columns={[
                { key: 'nazev', label: 'Název' },
                { key: 'ico', label: 'IČO', width: 100 },
                { key: 'cinnosti', label: 'Činnosti' },
                { key: 'opravneni', label: 'Oprávnění' }
              ]}
              blank={{ nazev: '', ico: '', cinnosti: '', opravneni: '' }}
              disabled={dis}
              onChange={(servisni_partneri) => patch({ servisni_partneri })}
            />
            <RowsEditor
              heading="Kontakty (smlouva)"
              rows={draft.kontakty}
              columns={[
                { key: 'strana', label: 'Strana', width: 110 },
                { key: 'role', label: 'Role' },
                { key: 'jmeno', label: 'Jméno' },
                { key: 'telefon', label: 'Telefon', width: 140 },
                { key: 'email', label: 'E-mail' }
              ]}
              blank={{ strana: 'Zhotovitel', role: '', jmeno: '', telefon: '', email: '' }}
              disabled={dis}
              onChange={(kontakty) => patch({ kontakty })}
            />
            <RowsEditor
              heading="Kontakty lokality"
              rows={l.kontakty}
              columns={[
                { key: 'role', label: 'Role' },
                { key: 'jmeno', label: 'Jméno' },
                { key: 'telefon', label: 'Telefon', width: 140 },
                { key: 'email', label: 'E-mail' }
              ]}
              blank={{ role: '', jmeno: '', telefon: '', email: '' }}
              disabled={dis}
              onChange={(kontakty) => patchSite({ kontakty })}
            />
            <RowsEditor
              heading="Eskalace"
              rows={draft.eskalace}
              columns={[
                { key: 'uroven', label: 'Úroveň', width: 70 },
                { key: 'spoustec', label: 'Spouštěč' },
                { key: 'res', label: 'Za zhotovitele' },
                { key: 'objednatel', label: 'Za objednatele' }
              ]}
              blank={{ uroven: '', spoustec: '', res: '', objednatel: '' }}
              disabled={dis}
              onChange={(eskalace) => patch({ eskalace })}
            />
          </div>
        </PivotItem>

        <PivotItem itemKey="kontrola" headerText={`Kontrola (${counts.chyba + counts.doplnit + counts.varovani})`}>
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 13, color: RES.gray, marginBottom: 8 }}>
              <strong>Chyby</strong> (požadavky banky: P1 ≤ 72 h, doba ≥ 10 let, autorizace OEM u BESS) blokují předání k podpisu a vygenerování smlouvy. <strong>Doplnit</strong> jsou chybějící povinné údaje (blokují předání k podpisu),{' '}
              <strong>varování</strong> jen upozorňují.
            </div>
            <IssueList issues={issues} />
            {previous && (
              <div style={{ marginTop: 14 }}>
                <div style={boxTitle}>Změny oproti předchozí verzi</div>
                {changes.length === 0 ? <div style={{ color: RES.gray, fontSize: 13 }}>Beze změny.</div> : changes.map((c, k) => <div key={k} style={{ fontSize: 13 }}>• {c}</div>)}
              </div>
            )}
          </div>
        </PivotItem>
      </Pivot>
    </Panel>
  );
};
