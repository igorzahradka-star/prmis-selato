/**
 * Editor údajů pro servisní smlouvy (Servis → Správa smluv → Údaje smluv): zhotovitel (s načtením z ARES), asset manager, výchozí parametry,
 * sazebník, registr autorizací OEM, výchozí kontakty a eskalace. Smlouva si z nich při založení vezme kopii. Sdílené stavební kameny
 * (`RowsEditor`, `PartyEditor`, `CONTRACT_PARAM_FIELDS`) používá i editor smlouvy.
 */

import * as React from 'react';
import { ActionButton, DefaultButton, IconButton } from '@fluentui/react/lib/Button';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { TextField } from '@fluentui/react/lib/TextField';

import { RES } from '../../ui/theme';
import { AresRepresentative, lookupCompanyByIco, lookupRegisterByIco } from '../../data/ares';
import { ContractParameters, ContractParty } from '../../core/serviceContract';
import { ContractSettings } from '../../core/serviceContractSettings';

export const boxStyle: React.CSSProperties = { background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: 10, marginBottom: 12 };
export const boxTitle: React.CSSProperties = { fontWeight: 600, color: RES.navy, marginBottom: 6 };
export const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '2px 14px' };

export const CONTRACT_PARAM_FIELDS: { key: keyof ContractParameters; label: string; text?: boolean }[] = [
  { key: 'doba_let', label: 'Doba trvání (let)' },
  { key: 'prodlouzeni_let', label: 'Prodloužení (let)' },
  { key: 'vypovedni_lhuta_mesicu', label: 'Výpovědní lhůta (měsíců)' },
  { key: 'fakturace', label: 'Fakturace', text: true },
  { key: 'splatnost_dni', label: 'Splatnost (dní)' },
  { key: 'indexace_den', label: 'Indexace k datu', text: true },
  { key: 'indexace_prvni', label: 'První indexace', text: true },
  { key: 'limit_odpovednosti_pct', label: 'Limit odpovědnosti (% ročního plnění)' },
  { key: 'pojisteni_mil_kc', label: 'Pojištění (mil. Kč)' },
  { key: 'zaruka_prace_mesicu', label: 'Záruka na práci (měsíců)' },
  { key: 'limit_bez_schvaleni_kc', label: 'Limit bez schválení (Kč)' },
  { key: 'servisni_zpravy_dni', label: 'Servisní zprávy do (dní)' },
  { key: 'predani_mesicu', label: 'Předání do servisu (měsíců)' },
  { key: 'planovana_udrzba_h_rok', label: 'Plánovaná údržba (h/rok)' },
  { key: 'penale_dostupnost_pct', label: 'Penále za dostupnost (%)' },
  { key: 'penale_p1_kc_hod', label: 'Penále P1 (Kč/h)' },
  { key: 'penale_cap_pct', label: 'Strop penále (%)' }
];

export const numText = (n: number): string => (isFinite(n) ? String(n).replace('.', ',') : '');
export const parseNum = (s: string): number => (s.trim() === '' ? NaN : Number(s.trim().replace(',', '.')));

export interface RowColumn<T> {
  key: keyof T & string;
  label: string;
  width?: number;
  number?: boolean;
}

/** Tabulka řádků s přidáním a odebráním. */
export function RowsEditor<T extends object>({ heading, hint, rows, columns, blank, disabled, onChange }: { heading: string; hint?: string; rows: T[]; columns: RowColumn<T>[]; blank: T; disabled: boolean; onChange: (rows: T[]) => void }): React.ReactElement {
  const set = (i: number, key: string, value: string | number): void => onChange(rows.map((r, k) => (k === i ? { ...r, [key]: value } : r)));
  return (
    <div style={boxStyle}>
      <div style={boxTitle}>{heading}</div>
      {hint && <div style={{ fontSize: 12, color: RES.gray, marginBottom: 4 }}>{hint}</div>}
      {rows.length > 0 && (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={{ textAlign: 'left', fontSize: 12, color: RES.gray, fontWeight: 600, padding: '2px 6px' }}>
                  {c.label}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => {
                  const v = (r as Record<string, unknown>)[c.key];
                  return (
                    <td key={c.key} style={{ padding: '2px 6px', width: c.width }}>
                      <TextField
                        ariaLabel={c.label}
                        disabled={disabled}
                        value={c.number ? (typeof v === 'number' ? numText(v) : '') : String(v ?? '')}
                        onChange={(_, val) => set(i, c.key, c.number ? parseNum(val ?? '') : val ?? '')}
                      />
                    </td>
                  );
                })}
                <td style={{ padding: '2px 6px', width: 36 }}>
                  {!disabled && <IconButton iconProps={{ iconName: 'Delete' }} title="Odebrat řádek" ariaLabel="Odebrat řádek" onClick={() => onChange(rows.filter((_, k) => k !== i))} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!disabled && <ActionButton iconProps={{ iconName: 'Add' }} text="Přidat řádek" onClick={() => onChange(rows.concat({ ...blank }))} />}
    </div>
  );
}

const PARTY_FIELDS: { key: keyof ContractParty; label: string; dispatch?: boolean }[] = [
  { key: 'nazev', label: 'Název' },
  { key: 'sidlo', label: 'Sídlo' },
  { key: 'ico', label: 'IČO' },
  { key: 'dic', label: 'DIČ' },
  { key: 'rejstrik', label: 'Spisová značka (rejstřík)' },
  { key: 'bankovni_spojeni', label: 'Bankovní spojení' },
  { key: 'zastoupen', label: 'Zastoupen (jméno, funkce)' },
  { key: 'podpis_jmeno', label: 'Podepisuje — jméno' },
  { key: 'podpis_funkce', label: 'Podepisuje — funkce' },
  { key: 'dispecink_tel', label: 'Dispečink 24/7 — telefon', dispatch: true },
  { key: 'dispecink_email', label: 'Dispečink — e-mail', dispatch: true }
];

/** Údaje o straně smlouvy (zhotovitel, objednatel) s načtením z ARES podle IČO: název, sídlo, DIČ, spisová značka a osoby oprávněné jednat. */
export const PartyEditor: React.FC<{ value: ContractParty; onChange: (v: ContractParty) => void; disabled: boolean; withDispatch?: boolean; hint?: string }> = ({ value, onChange, disabled, withDispatch, hint }) => {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ text: string; type: MessageBarType } | undefined>(undefined);
  const [people, setPeople] = React.useState<AresRepresentative[]>([]);
  const patch = (p: Partial<ContractParty>): void => onChange({ ...value, ...p });

  const loadAres = (): void => {
    const ico = value.ico.trim();
    setBusy(true);
    setMessage(undefined);
    Promise.all([lookupCompanyByIco(ico), lookupRegisterByIco(ico)])
      .then(([company, register]) => {
        patch({ nazev: value.nazev || company.name, sidlo: company.address || value.sidlo, dic: company.dic || value.dic, rejstrik: register.registration || value.rejstrik });
        setPeople(register.representatives.filter((p) => !p.isLegalEntity));
        const rule = register.actingRule ? (register.actingRule.length > 260 ? `${register.actingRule.slice(0, 260)}…` : register.actingRule) : '';
        setMessage({
          text: `Načteno z ARES${register.registration ? `: ${register.registration}` : ''}. ${register.representatives.length > 0 ? 'Vyberte osobu, která podepisuje.' : 'Osoby oprávněné jednat v rejstříku nejsou, doplňte je ručně.'}${rule ? ` Způsob jednání: ${rule}` : ''}`,
          type: MessageBarType.success
        });
        setBusy(false);
      })
      .catch((e: unknown) => {
        setMessage({ text: e instanceof Error ? e.message : String(e), type: MessageBarType.error });
        setBusy(false);
      });
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontSize: 12, color: RES.gray, flex: '1 1 300px' }}>{hint ?? 'Název (když chybí), sídlo, DIČ, spisovou značku a jednatele lze načíst z ARES podle IČO. Bankovní účet doplňte ručně.'}</div>
        {!disabled && <DefaultButton iconProps={{ iconName: 'Download' }} text={busy ? 'Načítám…' : 'Načíst z ARES'} disabled={busy || !/^\d{8}$/.test(value.ico.trim())} onClick={loadAres} />}
      </div>
      {message && (
        <MessageBar messageBarType={message.type} isMultiline onDismiss={() => setMessage(undefined)}>
          {message.text}
        </MessageBar>
      )}
      {people.length > 0 && !disabled && (
        <Dropdown
          label="Osoba oprávněná jednat (z rejstříku)"
          placeholder="Vyberte podepisující osobu"
          options={people.map((p, i) => ({ key: i, text: `${p.name} — ${p.role}` }))}
          onChange={(_, o) => {
            const p = o ? people[Number(o.key)] : undefined;
            if (p) {
              patch({ zastoupen: `${p.name}, ${p.role.toLocaleLowerCase('cs-CZ')}`, podpis_jmeno: p.name, podpis_funkce: p.role.toLocaleLowerCase('cs-CZ') });
            }
          }}
          styles={{ root: { maxWidth: 480 } }}
        />
      )}
      <div style={gridStyle}>
        {PARTY_FIELDS.filter((f) => !f.dispatch || withDispatch).map((f) => (
          <TextField key={f.key} label={f.label} disabled={disabled} value={value[f.key] ?? ''} onChange={(_, v) => patch({ [f.key]: v ?? '' } as Partial<ContractParty>)} />
        ))}
      </div>
    </div>
  );
};

export const ContractSettingsEditor: React.FC<{ value: ContractSettings; onChange: (v: ContractSettings) => void; disabled: boolean }> = ({ value, onChange, disabled }) => {
  const patch = (p: Partial<ContractSettings>): void => onChange({ ...value, ...p });

  return (
    <div>
      <div style={boxStyle}>
        <div style={boxTitle}>Zhotovitel (Revoltum Engineering & Services)</div>
        <PartyEditor value={value.zhotovitel} onChange={(zhotovitel) => patch({ zhotovitel })} disabled={disabled} withDispatch />
      </div>

      <div style={boxStyle}>
        <div style={boxTitle}>Asset manager a místo podpisu</div>
        <div style={{ fontSize: 12, color: RES.gray, marginBottom: 4 }}>Asset manager zastupuje objednatele (dává pokyny); objednatelem a plátcem je zákazník lokality (partner).</div>
        <div style={gridStyle}>
          <TextField label="Asset manager — název" disabled={disabled} value={value.assetManager.nazev} onChange={(_, v) => patch({ assetManager: { ...value.assetManager, nazev: v ?? '' } })} />
          <TextField label="IČO" disabled={disabled} value={value.assetManager.ico} onChange={(_, v) => patch({ assetManager: { ...value.assetManager, ico: v ?? '' } })} />
          <TextField label="Sídlo" disabled={disabled} value={value.assetManager.sidlo} onChange={(_, v) => patch({ assetManager: { ...value.assetManager, sidlo: v ?? '' } })} />
          <TextField label="Místo podpisu (v 6. pádě: „v …“)" disabled={disabled} value={value.mistoPodpisu} onChange={(_, v) => patch({ mistoPodpisu: v ?? '' })} />
        </div>
      </div>

      <div style={boxStyle}>
        <div style={boxTitle}>Šablony Wordu</div>
        <div style={{ fontSize: 12, color: RES.gray, marginBottom: 4 }}>Šablony rámcové smlouvy a přílohy lokality (docxtpl) se čtou ze složky v knihovně dokumentů; výsledek se ukládá do složky lokality (01-Smlouva a podmínky). Šablonu lze kdykoli nahradit novou verzí souboru.</div>
        <div style={gridStyle}>
          <TextField label="Složka se šablonami (od kořene knihovny)" disabled={disabled} value={value.templateFolder} onChange={(_, v) => patch({ templateFolder: v ?? '' })} />
          <TextField label="Soubor šablony rámcové smlouvy" disabled={disabled} value={value.frameworkTemplate} onChange={(_, v) => patch({ frameworkTemplate: v ?? '' })} />
          <TextField label="Soubor šablony přílohy lokality" disabled={disabled} value={value.annexTemplate} onChange={(_, v) => patch({ annexTemplate: v ?? '' })} />
          <TextField label="Soubor šablony přílohy souboru" disabled={disabled} value={value.assetAnnexTemplate} onChange={(_, v) => patch({ assetAnnexTemplate: v ?? '' })} />
        </div>
      </div>

      <div style={boxStyle}>
        <div style={boxTitle}>Výchozí parametry smlouvy</div>
        <div style={{ fontSize: 12, color: RES.gray, marginBottom: 4 }}>Převezmou se do nové smlouvy a půjdou tam upravit. Hodnoty jsou návrh podle ukázkové smlouvy.</div>
        <div style={gridStyle}>
          {CONTRACT_PARAM_FIELDS.map((p) => {
            const v = value.parametry[p.key];
            return (
              <TextField
                key={p.key}
                label={p.label}
                disabled={disabled}
                value={p.text ? String(v) : numText(v as number)}
                onChange={(_, val) => patch({ parametry: { ...value.parametry, [p.key]: p.text ? val ?? '' : parseNum(val ?? '') } })}
              />
            );
          })}
        </div>
      </div>

      <RowsEditor
        heading="Sazebník"
        hint="Položky a ceny pro přílohu smlouvy (hodinové sazby, příplatky, výjezd, doprava…). Ceny nejsou předvyplněné — ukázka ve vzoru je jen ilustrativní."
        rows={value.sazebnik}
        columns={[
          { key: 'polozka', label: 'Položka' },
          { key: 'jednotka', label: 'Jednotka', width: 90 },
          { key: 'cena', label: 'Cena', width: 100, number: true },
          { key: 'poznamka', label: 'Poznámka' }
        ]}
        blank={{ polozka: '', jednotka: 'hod', cena: 0, poznamka: '' }}
        disabled={disabled}
        onChange={(sazebnik) => patch({ sazebnik })}
      />

      <RowsEditor
        heading="Registr autorizací OEM"
        hint="Autorizace výrobce zařízení (u BESS ji vyžadují banky). Smlouva s BESS bez autorizace pro výrobce nejde dát k podpisu."
        rows={value.autorizaceOem}
        columns={[
          { key: 'vyrobce', label: 'Výrobce' },
          { key: 'rozsah', label: 'Rozsah' },
          { key: 'doklad', label: 'Doklad (č. smlouvy / certifikátu)' },
          { key: 'platnost_do', label: 'Platnost do', width: 120 }
        ]}
        blank={{ vyrobce: '', rozsah: '', doklad: '', platnost_do: '' }}
        disabled={disabled}
        onChange={(autorizaceOem) => patch({ autorizaceOem })}
      />

      <RowsEditor
        heading="Výchozí kontakty"
        rows={value.kontakty}
        columns={[
          { key: 'strana', label: 'Strana', width: 110 },
          { key: 'role', label: 'Role' },
          { key: 'jmeno', label: 'Jméno' },
          { key: 'telefon', label: 'Telefon', width: 140 },
          { key: 'email', label: 'E-mail' }
        ]}
        blank={{ strana: 'Zhotovitel', role: '', jmeno: '', telefon: '', email: '' }}
        disabled={disabled}
        onChange={(kontakty) => patch({ kontakty })}
      />

      <RowsEditor
        heading="Eskalace"
        rows={value.eskalace}
        columns={[
          { key: 'uroven', label: 'Úroveň', width: 70 },
          { key: 'spoustec', label: 'Spouštěč' },
          { key: 'res', label: 'Za zhotovitele' },
          { key: 'objednatel', label: 'Za objednatele' }
        ]}
        blank={{ uroven: '', spoustec: '', res: '', objednatel: '' }}
        disabled={disabled}
        onChange={(eskalace) => patch({ eskalace })}
      />
    </div>
  );
};
