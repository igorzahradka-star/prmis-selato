/**
 * Import účetního deníku z XML (Kontroly projektů → Import z Abry) — most do doby, než poběží denní stahování z Abry.
 * Postup: vybrat XML export evidence Účetní deník → náhled (co se přidá, změní, přesune) → Importovat.
 * Import nikdy nemaže: řádky se podle klíče (`AbraId`) přidají nebo aktualizují, ostatní zůstanou.
 */

import * as React from 'react';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { formatMoney } from '../../core/format';
import { JournalImportPlan, JournalParseResult, JournalRow, parseJournalXml, planJournalImport } from '../../core/abraJournalImport';

const TH: React.CSSProperties = { textAlign: 'left', fontWeight: 600, fontSize: 12, color: RES.gray, padding: '6px 8px', whiteSpace: 'nowrap', borderBottom: `1px solid ${RES.grayBlue}` };
const TD: React.CSSProperties = { padding: '5px 8px', fontSize: 13 };

const SKIP_LABELS: Record<string, string> = {
  'bez-zakazky': 'zápisy bez zakázky (režie, banka… — běžné)',
  'zakazka-neodpovida': 'zakázka nemá tvar čísla projektu (5 číslic)',
  'bez-id': 'zápisy bez ID',
  'bez-castky': 'zápisy bez čitelné částky'
};

interface Preview {
  fileName: string;
  parsed: JournalParseResult;
  plan: JournalImportPlan;
  titles: Record<string, string>;
}

export const JournalImportPanel: React.FC<{ onImported: () => void }> = ({ onImported }) => {
  const { repos, user } = useApp();
  const [busy, setBusy] = React.useState<string | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [done, setDone] = React.useState<string | undefined>(undefined);
  const [preview, setPreview] = React.useState<Preview | undefined>(undefined);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const onFile = async (file: File): Promise<void> => {
    setError(undefined);
    setDone(undefined);
    setPreview(undefined);
    setBusy('Čtu soubor…');
    try {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Soubor se nepodařilo přečíst.'));
        reader.readAsText(file, 'utf-8');
      });
      const parsed = parseJournalXml(text);
      setBusy('Porovnávám se stávajícími řádky…');
      const [existing, projects] = await Promise.all([repos.abraDocs.listAll(), repos.projects.list()]);
      const titles: Record<string, string> = {};
      projects.forEach((p) => {
        titles[p.projectNumber] = p.title;
      });
      setPreview({ fileName: file.name, parsed, plan: planJournalImport(parsed.rows, existing), titles });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  };

  const runImport = async (): Promise<void> => {
    if (!preview) {
      return;
    }
    setError(undefined);
    setBusy('Zapisuji řádky do aplikace…');
    try {
      const rows: JournalRow[] = preview.plan.toAdd.concat(preview.plan.toUpdate.map((u) => u.row));
      const r = await repos.abraDocs.importRows(rows, user);
      setDone(`Hotovo: přidáno ${r.added}, změněno ${r.updated}, beze změny ${preview.plan.unchanged}. Nic nebylo smazáno.`);
      setPreview(undefined);
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  };

  const moved = preview ? preview.plan.toUpdate.filter((u) => u.movedFrom !== undefined) : [];
  const nothing = !!preview && preview.plan.toAdd.length === 0 && preview.plan.toUpdate.length === 0;

  return (
    <div style={{ maxWidth: 900, marginTop: 12 }}>
      <p style={{ marginTop: 0 }}>
        Nahrajte XML export evidence <strong>Účetní deník</strong> z ABRA Flexi (všechny projekty). Aplikace z něj vezme náklady (účty 501, 512, 518) a výnosy (účty 60…) po zakázkách a ukáže, co se změní. Teprve po vašem potvrzení se zapíše.
        Import <strong>nic nemaže</strong>: řádek, který už v aplikaci je, se podle klíče aktualizuje, nový se přidá. Starší export proto novější nezničí a opakovaný import téhož souboru nic nezmění.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".xml,text/xml,application/xml"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = (e.target.files || [])[0];
          e.target.value = '';
          if (f) {
            onFile(f).catch(() => undefined);
          }
        }}
      />
      <DefaultButton iconProps={{ iconName: 'OpenFile' }} text="Vybrat XML soubor…" disabled={!!busy} onClick={() => fileRef.current?.click()} />
      {busy && <Spinner size={SpinnerSize.medium} label={busy} labelPosition="right" styles={{ root: { justifyContent: 'flex-start', marginTop: 10 } }} />}
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)} styles={{ root: { marginTop: 10 } }}>
          {error}
        </MessageBar>
      )}
      {done && (
        <MessageBar messageBarType={MessageBarType.success} isMultiline onDismiss={() => setDone(undefined)} styles={{ root: { marginTop: 10 } }}>
          {done}
        </MessageBar>
      )}

      {preview && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 600, color: RES.navy, marginBottom: 6 }}>Náhled: {preview.fileName}</div>
          <ul style={{ margin: '0 0 8px 18px', padding: 0, fontSize: 13 }}>
            <li>Zápisů v souboru: {preview.parsed.entries}, z nich se přenáší {preview.parsed.rows.length} řádků.</li>
            <li>
              <strong>Nových řádků: {preview.plan.toAdd.length}</strong>, <strong>změněných: {preview.plan.toUpdate.length}</strong>, beze změny: {preview.plan.unchanged}.
            </li>
            {preview.plan.notInFile > 0 && <li>V aplikaci je {preview.plan.notInFile} řádků z deníku, které v tomto souboru nejsou — zůstanou beze změny (soubor může být částečný).</li>}
            {Object.keys(preview.parsed.skipped)
              .filter((k) => (preview.parsed.skipped as Record<string, number>)[k] > 0)
              .map((k) => (
                <li key={k} style={{ color: RES.gray }}>
                  Přeskočeno {(preview.parsed.skipped as Record<string, number>)[k]}×: {SKIP_LABELS[k]}
                </li>
              ))}
          </ul>
          {preview.parsed.details.length > 0 && <div style={{ fontSize: 12, color: RES.gray, marginBottom: 6 }}>Příklady přeskočených: {preview.parsed.details.join('; ')}</div>}
          {moved.length > 0 && (
            <MessageBar messageBarType={MessageBarType.warning} isMultiline styles={{ root: { marginBottom: 8 } }}>
              {moved.length} řádků se v účetnictví přesunulo do jiného projektu (např. {moved.slice(0, 3).map((m) => `${m.row.number}: ${m.movedFrom} → ${m.row.projectNumber}`).join(', ')}). Přiřazení těchto řádků v původním projektu zůstane jako „osiřelé“ — najdete je v Kontrolách projektů; nic se samo nemaže.
            </MessageBar>
          )}
          <div style={{ overflowX: 'auto', marginBottom: 10 }}>
            <table style={{ borderCollapse: 'collapse', background: RES.white, border: `1px solid ${RES.grayBlue}` }}>
              <thead>
                <tr>
                  <th style={TH}>Zakázka</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Řádků</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Náklady v souboru</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Výnosy v souboru</th>
                </tr>
              </thead>
              <tbody>
                {preview.plan.totals.map((t) => (
                  <tr key={t.projectNumber} style={{ borderTop: `1px solid ${RES.background}` }}>
                    <td style={TD}>
                      {t.projectNumber} <span style={{ color: RES.gray }}>{preview.titles[t.projectNumber] || '(není v aplikaci)'}</span>
                    </td>
                    <td style={{ ...TD, textAlign: 'right' }}>{t.lines}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{formatMoney(t.cost, 'CZK')}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{formatMoney(t.revenue, 'CZK')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {nothing ? (
            <MessageBar messageBarType={MessageBarType.info}>Všechno z tohoto souboru už v aplikaci je — není co importovat.</MessageBar>
          ) : (
            <PrimaryButton iconProps={{ iconName: 'Download' }} text={`Importovat (${preview.plan.toAdd.length} nových, ${preview.plan.toUpdate.length} změněných)`} disabled={!!busy} onClick={() => runImport().catch(() => undefined)} />
          )}
        </div>
      )}
    </div>
  );
};
