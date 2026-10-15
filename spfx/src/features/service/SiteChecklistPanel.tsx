/**
 * Checklist lokality servisu — boční panel: příznaky lokality (co na ní je), moduly (co zákazník koupil) a z nich plynoucí seznam činností
 * z katalogu O&M. Každou činnost jde ručně zapnout či vypnout a u většiny změnit periodu. Seznam je podklad pro přílohu lokality ve smlouvě
 * a později pro roční plán. Ukládá správce servisu, vedení a administrátor; ostatní role vidí checklist jen ke čtení.
 */

import * as React from 'react';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Checkbox } from '@fluentui/react/lib/Checkbox';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { Link } from '@fluentui/react/lib/Link';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { Toggle } from '@fluentui/react/lib/Toggle';

import { RES } from '../../ui/theme';
import { ServiceDevice, ServiceSite } from '../../core/service';
import {
  activeModules,
  cleanChecklist,
  evaluateChecklist,
  flagGroups,
  setActivityActive,
  setActivityPeriod,
  SiteChecklist,
  summarizeChecklist,
  toggleFlag,
  toggleModule
} from '../../core/serviceCatalog';
import { SERVICE_CATALOG as CATALOG } from '../../core/serviceCatalog.data';
import { TD, TH } from './serviceUi';

const INCLUSION_TEXT: Record<string, string> = { PAUSAL: 'Paušál', MODUL: 'V modulu', EXTRA: 'Zvlášť' };
const ASSET_ORDER = ['LOK', 'BOP', 'FVE', 'BESS', 'MVE', 'VTE', 'ENC'];

const sectionTitle: React.CSSProperties = { fontWeight: 600, color: RES.navy, margin: '14px 0 4px', fontSize: 15 };

export const SiteChecklistPanel: React.FC<{
  site: ServiceSite;
  devices: ServiceDevice[];
  mayEdit: boolean;
  save: (checklist: SiteChecklist) => Promise<unknown>;
  onSaved: () => void;
  onClose: () => void;
}> = ({ site, devices, mayEdit, save, onSaved, onClose }) => {
  const kinds = devices.filter((d) => d.siteNumber === site.number && d.isActive).map((d) => d.kind);
  const initial = React.useMemo(() => cleanChecklist(CATALOG, site.checklist ?? { flags: [], modules: [], disabled: [], enabled: [], periods: {} }), [site]);
  const [draft, setDraft] = React.useState<SiteChecklist>(initial);
  const [showUnavailable, setShowUnavailable] = React.useState(false);
  const [open, setOpen] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  const items = evaluateChecklist(CATALOG, draft, kinds);
  const summary = summarizeChecklist(items);
  const changed = JSON.stringify(draft) !== JSON.stringify(initial);
  const modules = activeModules(draft);
  const periodOptions = Object.keys(CATALOG.periodicity).map((k) => ({ key: k, text: CATALOG.periodicity[k].nazev }));

  const submit = (): void => {
    setBusy(true);
    setError(undefined);
    save(draft)
      .then(() => {
        setBusy(false);
        onSaved();
      })
      .catch((e: unknown) => {
        setBusy(false);
        setError(e instanceof Error ? e.message : String(e));
      });
  };

  const types = ASSET_ORDER.filter((t) => items.some((i) => i.activity.asset === t));

  return (
    <Panel
      isOpen
      onDismiss={busy ? undefined : onClose}
      headerText={`Checklist lokality ${site.number} ${site.name}`}
      closeButtonAriaLabel="Zavřít"
      customWidth="980px"
      type={PanelType.custom}
      isFooterAtBottom
      onRenderFooterContent={() => (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {mayEdit && <PrimaryButton text={busy ? 'Ukládám…' : 'Uložit checklist'} disabled={busy || !changed} onClick={submit} />}
          <DefaultButton text={mayEdit ? 'Zrušit' : 'Zavřít'} disabled={busy} onClick={onClose} />
          {mayEdit && changed && <span style={{ color: RES.gray, fontSize: 12 }}>Změny nejsou uložené.</span>}
        </div>
      )}
    >
      <p style={{ margin: '0 0 8px', color: RES.gray, fontSize: 13 }}>
        Checklist určuje, jaké činnosti se na lokalitě provádějí. Zaškrtněte, co na lokalitě je (příznaky) a jaké moduly zákazník má; činnosti z katalogu se podle toho
        nabídnou. Kteroukoli jde ručně vypnout a u většiny změnit periodu. {CATALOG.meta.nazev}, verze {CATALOG.meta.verze} ({CATALOG.meta.stav.toLocaleLowerCase('cs-CZ')}).
      </p>
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {kinds.length === 0 && (
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          Lokalita zatím nemá žádný soubor (FVE, BESS…). Nabízejí se jen společné činnosti lokality a vyvedení výkonu; činnosti zařízení se doplní po založení souborů.
        </MessageBar>
      )}

      <div style={sectionTitle}>1. Příznaky lokality</div>
      {flagGroups(CATALOG, kinds).map((g) => (
        <div key={g.title} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: RES.gray, fontWeight: 600, marginBottom: 2 }}>{g.title}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '2px 16px' }}>
            {g.flags.map((f) => (
              <Checkbox key={f} label={CATALOG.priznaky[f]} checked={draft.flags.indexOf(f) >= 0} disabled={!mayEdit} onChange={(_, v) => setDraft(toggleFlag(draft, f, !!v))} styles={{ label: { fontSize: 13 } }} />
            ))}
          </div>
        </div>
      ))}

      <div style={sectionTitle}>2. Moduly</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '4px 16px' }}>
        {Object.keys(CATALOG.moduly).map((m) => (
          <Checkbox
            key={m}
            label={`${CATALOG.moduly[m].nazev} — ${CATALOG.moduly[m].popis}`}
            checked={modules.indexOf(m) >= 0}
            disabled={!mayEdit || CATALOG.moduly[m].povinny}
            onChange={(_, v) => setDraft(toggleModule(draft, m, !!v))}
            styles={{ label: { fontSize: 13 } }}
          />
        ))}
      </div>

      <div style={sectionTitle}>3. Činnosti</div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 13 }}>
          V plánu <strong>{summary.total}</strong> činností: {summary.pausal} v paušálu, {summary.modul} v modulech, {summary.extra} účtovaných zvlášť; {summary.bankCritical} kritických pro banku.
        </span>
        <Toggle label="Ukázat i nedostupné činnosti" inlineLabel checked={showUnavailable} onChange={(_, v) => setShowUnavailable(!!v)} styles={{ root: { marginBottom: 0 } }} />
      </div>
      {types.map((t) => {
        const rows = items.filter((i) => i.activity.asset === t && (showUnavailable || i.available));
        if (rows.length === 0) {
          return null;
        }
        return (
          <div key={t} style={{ marginBottom: 12 }}>
            <div style={{ background: RES.bluePale, padding: '4px 8px', fontWeight: 600 }}>
              {CATALOG.typy_assetu[t]} <span style={{ color: RES.gray, fontWeight: 400 }}>· {rows.filter((r) => r.active).length} z {rows.length}</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>V plánu</th>
                  <th style={TH}>Činnost</th>
                  <th style={TH}>Perioda</th>
                  <th style={TH}>Zahrnutí</th>
                  <th style={TH}>Kvalifikace</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const a = r.activity;
                  const isOpen = open.indexOf(a.id) >= 0;
                  return (
                    <React.Fragment key={a.id}>
                      <tr style={{ borderTop: `1px solid ${RES.background}`, opacity: r.available ? 1 : 0.55 }}>
                        <td style={{ ...TD, width: 60 }}>
                          <Checkbox ariaLabel={`Zahrnout činnost ${a.id}`} checked={r.active} disabled={!mayEdit || !r.available} onChange={(_, v) => setDraft(setActivityActive(draft, a, !!v))} />
                        </td>
                        <td style={TD}>
                          <span style={{ color: RES.gray, fontSize: 12 }}>{a.id}</span> {a.nazev}
                          {a.kriticka_pro_banku && <span title="Činnost je označená jako kritická pro banku" style={{ marginLeft: 6, fontSize: 11, color: RES.navy, border: `1px solid ${RES.navy}`, borderRadius: 3, padding: '0 4px' }}>banka</span>}
                          <div style={{ fontSize: 12, color: RES.gray }}>
                            {a.podsystem}
                            {!r.available && <span> — {r.unavailableReason}</span>}{' '}
                            <Link onClick={() => setOpen(isOpen ? open.filter((x) => x !== a.id) : open.concat(a.id))}>{isOpen ? 'Skrýt podrobnosti' : 'Podrobnosti'}</Link>
                          </div>
                        </td>
                        <td style={{ ...TD, width: 190 }}>
                          {a.perioda_nastavitelna ? (
                            <Dropdown
                              ariaLabel={`Perioda činnosti ${a.id}`}
                              selectedKey={r.period}
                              options={periodOptions}
                              disabled={!mayEdit || !r.available}
                              onChange={(_, o) => o && setDraft(setActivityPeriod(draft, a, String(o.key)))}
                              styles={{ title: { fontWeight: r.periodChanged ? 600 : 400 } }}
                            />
                          ) : (
                            <span title="Perioda je dána předpisem nebo výrobcem a nemění se">{CATALOG.periodicity[a.perioda].nazev}</span>
                          )}
                        </td>
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>{INCLUSION_TEXT[a.zahrnuti]}</td>
                        <td style={{ ...TD, fontSize: 12 }}>{a.kvalifikace.join(', ')}</td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td />
                          <td colSpan={4} style={{ ...TD, fontSize: 12, background: RES.background }}>
                            <div>
                              <strong>Předpis:</strong> {a.predpis || '—'} · <strong>Výstup:</strong> {a.vystup} · <strong>Provádí:</strong> {CATALOG.rozsah_oem[a.rozsah_oem]}
                            </div>
                            <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                              {a.postup.map((p, k) => (
                                <li key={k}>{p}</li>
                              ))}
                            </ul>
                            {a.poznamka && <div style={{ marginTop: 4 }}>Poznámka: {a.poznamka}</div>}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </Panel>
  );
};
