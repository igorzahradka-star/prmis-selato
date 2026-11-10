/**
 * Import partnerů z Excelu (Nastavení → Jednorázové akce). Uživatel nahraje .xlsx (čte se list „Import“, jinak první)
 * nebo vloží zkopírované buňky z Excelu. Okno ukáže náhled — u každého řádku, co se s ním stane (založí se / přeskočí
 * jako duplicita / chyba) — a po potvrzení zakládá partnery po jednom přes `repos.partners.create`, s průběhem.
 * Import se dá opakovat: náhled se staví proti aktuálním partnerům, takže už založení se přeskočí.
 * Rozhodování o řádcích je čistá logika v `core/partnerImport.ts`.
 */

import * as React from 'react';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { TextField } from '@fluentui/react/lib/TextField';
import { Checkbox } from '@fluentui/react/lib/Checkbox';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { ProgressIndicator } from '@fluentui/react/lib/ProgressIndicator';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { parseClipboardTable } from '../../core/budget';
import { countryName } from '../../core/countries';
import { buildPartnerImportPlan, PartnerImportAction, PartnerImportPlan, PartnerImportRow, partnerImportActionLabel } from '../../core/partnerImport';
import { readXlsxSheet } from './readXlsxSheet';

/** List sešitu, který se čte přednostně. */
const SHEET_NAME = 'Import';

interface Failure {
  line: number;
  name: string;
  message: string;
}

interface Props {
  isOpen: boolean;
  onDismiss: () => void;
}

export const ImportPartnersPanel: React.FC<Props> = ({ isOpen, onDismiss }) => {
  const { repos } = useApp();

  const [table, setTable] = React.useState<string[][] | undefined>(undefined);
  const [source, setSource] = React.useState<string>('');
  const [pasted, setPasted] = React.useState('');
  const [plan, setPlan] = React.useState<PartnerImportPlan | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [onlyProblems, setOnlyProblems] = React.useState(false);

  const [importing, setImporting] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number; current: string } | undefined>(undefined);
  const [result, setResult] = React.useState<{ created: number; failures: Failure[] } | undefined>(undefined);

  const topRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Při zavření okna začít příště načisto.
  React.useEffect(() => {
    if (!isOpen) {
      setTable(undefined);
      setSource('');
      setPasted('');
      setPlan(undefined);
      setError(undefined);
      setResult(undefined);
      setProgress(undefined);
      setOnlyProblems(false);
    }
  }, [isOpen]);

  // Během importu varovat při zavírání nebo obnovení záložky (import by skončil uprostřed).
  React.useEffect(() => {
    if (!importing) {
      return undefined;
    }
    const warn = (e: BeforeUnloadEvent): string => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [importing]);

  React.useEffect(() => {
    if ((importing || result) && topRef.current && topRef.current.scrollIntoView) {
      topRef.current.scrollIntoView({ block: 'start' });
    }
  }, [importing, result]);

  /** Sestaví náhled proti aktuálním partnerům (včetně deaktivovaných). */
  const preview = (rows: string[][], from: string): Promise<void> => {
    setLoading(true);
    setError(undefined);
    return repos.partners
      .list({ includeInactive: true })
      .then((existing) => {
        setTable(rows);
        setSource(from);
        setPlan(buildPartnerImportPlan(rows, existing));
        setLoading(false);
      })
      .catch((e: Error) => {
        setLoading(false);
        setError(e.message);
      });
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) {
      return;
    }
    setResult(undefined);
    setLoading(true);
    setError(undefined);
    readXlsxSheet(file, SHEET_NAME)
      .then((data) => preview(data.rows, `soubor ${file.name}, list „${data.sheetName}“`))
      .catch((err: Error) => {
        setLoading(false);
        setError(err.message);
      });
  };

  const onPasted = (): void => {
    setResult(undefined);
    preview(parseClipboardTable(pasted), 'vložený text').catch(() => undefined);
  };

  const importuj = (): void => {
    if (!plan) {
      return;
    }
    const rows = plan.rows.filter((r) => r.action === 'create' && r.partner);
    setImporting(true);
    setResult(undefined);
    setError(undefined);
    const failures: Failure[] = [];
    let created = 0;
    const run = async (): Promise<void> => {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        setProgress({ done: i, total: rows.length, current: r.values.name });
        try {
          // `create` sám hlídá stejné IČO ve stejné zemi — kdyby mezitím partnera založil někdo jiný.
          await repos.partners.create(r.partner!);
          created++;
        } catch (e) {
          failures.push({ line: r.line, name: r.values.name, message: (e as Error).message });
        }
      }
    };
    run()
      .then(async () => {
        setProgress(undefined);
        setImporting(false);
        setResult({ created, failures });
        // Náhled znovu proti aktuálním partnerům — založení teď vyjdou jako duplicity, zbydou jen chyby.
        if (table) {
          await preview(table, source);
        }
      })
      .catch((e: Error) => {
        setProgress(undefined);
        setImporting(false);
        setError(e.message);
      });
  };

  const visibleRows = plan ? plan.rows.filter((r) => !onlyProblems || r.action !== 'create' || r.message) : [];

  return (
    <Panel
      isOpen={isOpen}
      // Během importu okno nejde zavřít (křížek je skrytý, Esc ani kliknutí vedle nic neudělá).
      onDismiss={() => {
        if (!importing) {
          onDismiss();
        }
      }}
      hasCloseButton={!importing}
      isBlocking
      type={PanelType.large}
      headerText="Import partnerů z Excelu"
      closeButtonAriaLabel="Zavřít"
      isFooterAtBottom
      onRenderFooterContent={() => (
        <div style={{ display: 'flex', gap: 8 }}>
          <PrimaryButton
            text={importing ? 'Zakládám…' : `Založit ${plan ? plan.toCreate : 0} partnerů`}
            disabled={importing || loading || !plan || plan.toCreate === 0}
            onClick={importuj}
          />
          <DefaultButton text="Zavřít" onClick={onDismiss} disabled={importing} />
        </div>
      )}
    >
      <div ref={topRef} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        {importing && progress && (
          <div
            role="status"
            aria-live="polite"
            style={{ border: `2px solid ${RES.blue}`, borderRadius: 4, padding: '14px 16px', background: RES.bluePale }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: RES.blue, marginBottom: 6 }}>
              Probíhá import, nezavírejte okno ani záložku
            </div>
            <ProgressIndicator
              percentComplete={progress.total > 0 ? progress.done / progress.total : 0}
              description={`Hotovo ${progress.done} z ${progress.total} · zakládám „${progress.current}“`}
              barHeight={6}
            />
          </div>
        )}

        {error && (
          <MessageBar messageBarType={MessageBarType.error} isMultiline>
            {error}
          </MessageBar>
        )}

        {result && (
          <MessageBar messageBarType={result.failures.length === 0 ? MessageBarType.success : MessageBarType.warning} isMultiline>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {result.failures.length === 0
                ? `Hotovo. Založeno ${result.created} partnerů.`
                : `Založeno ${result.created} partnerů, ${result.failures.length} se nepodařilo.`}
            </div>
            {result.failures.length > 0 && (
              <div style={{ marginTop: 6 }}>
                Nezaložené (import jde pustit znovu, už založení se přeskočí):
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {result.failures.map((f) => (
                    <li key={f.line}>
                      <strong>
                        řádek {f.line} · {f.name}
                      </strong>
                      : {f.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </MessageBar>
        )}

        {!importing && (
          <>
            <MessageBar messageBarType={MessageBarType.info} isMultiline>
              Sloupce <strong>Název, Typ, Země, IČO, DIČ, Adresa, Email, Telefon</strong> (s nadpisy v prvním řádku v libovolném
              pořadí, bez nadpisů v tomto pořadí). Typ: Zákazník, Dodavatel nebo Obojí. Prázdná země = Česko. U českého IČO se ověří
              8 číslic a kontrolní číslice, zahraniční IČ a DIČ se nekontrolují. Partner se stejným IČO ve stejné zemi (bez IČO: se
              stejným názvem) se přeskočí — import jde proto pustit opakovaně. Nic se nemaže ani nepřepisuje.
            </MessageBar>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={onFile} />
              <PrimaryButton text="Nahrát soubor .xlsx" iconProps={{ iconName: 'ExcelDocument' }} disabled={loading} onClick={() => fileRef.current && fileRef.current.click()} />
              <span style={{ fontSize: 12, color: RES.gray }}>čte se list „{SHEET_NAME}“, když v sešitu není, tak první list</span>
            </div>

            <TextField
              label="…nebo vložte buňky zkopírované z Excelu (Ctrl+C, Ctrl+V)"
              multiline
              rows={4}
              value={pasted}
              onChange={(_, v) => setPasted(v || '')}
              placeholder="Název	Typ	Země	IČO	DIČ	Adresa	Email	Telefon"
            />
            <div>
              <DefaultButton text="Zobrazit náhled vloženého textu" disabled={loading || !pasted.trim()} onClick={onPasted} />
            </div>
          </>
        )}

        {loading && <Spinner size={SpinnerSize.medium} label="Načítám…" />}

        {plan && !loading && (
          <>
            <div style={{ fontSize: 13 }}>
              <strong>Náhled</strong> ({source}, {plan.rows.length} řádků s daty{plan.hasHeader ? '' : ', bez řádku nadpisů — sloupce čtené v pořadí Název, Typ, Země, IČO…'}):{' '}
              <Count action="create" n={plan.toCreate} /> · <Count action="duplicate" n={plan.duplicates} /> · <Count action="error" n={plan.errors} />
            </div>
            {plan.errors > 0 && (
              <MessageBar messageBarType={MessageBarType.warning} isMultiline>
                Chybné řádky se nezaloží. Opravte je v Excelu a import pusťte znovu — už založení partneři se přeskočí.
              </MessageBar>
            )}
            <Checkbox label="Ukázat jen chyby, duplicity a upozornění" checked={onlyProblems} onChange={(_, c) => setOnlyProblems(!!c)} />
            <PreviewTable rows={visibleRows} />
          </>
        )}
      </div>
    </Panel>
  );
};

const ACTION_COLOR: Record<PartnerImportAction, string> = {
  create: RES.greenDark,
  duplicate: RES.gray,
  error: RES.red
};

const Count: React.FC<{ action: PartnerImportAction; n: number }> = ({ action, n }) => (
  <span style={{ color: ACTION_COLOR[action], fontWeight: 600 }}>
    {partnerImportActionLabel(action).toLowerCase()} {n}
  </span>
);

const cell: React.CSSProperties = { padding: '4px 6px', borderBottom: `1px solid ${RES.grayBlue}`, verticalAlign: 'top', textAlign: 'left' };

const PreviewTable: React.FC<{ rows: PartnerImportRow[] }> = ({ rows }) => (
  <div style={{ overflowX: 'auto' }}>
    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ color: RES.gray }}>
          <th style={cell}>Řádek</th>
          <th style={cell}>Název</th>
          <th style={cell}>Typ</th>
          <th style={cell}>Země</th>
          <th style={cell}>IČO</th>
          <th style={cell}>DIČ</th>
          <th style={cell}>Co se stane</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.line} style={{ color: r.action === 'duplicate' ? RES.gray : RES.text }}>
            <td style={cell}>{r.line}</td>
            <td style={cell}>{r.values.name || '—'}</td>
            <td style={cell}>{r.partner ? r.partner.partnerType : r.values.type || '—'}</td>
            <td style={cell}>{r.partner ? countryName(r.partner.country) : r.values.country || 'Česko'}</td>
            <td style={cell}>{r.partner ? r.partner.ico || '—' : r.values.ico || '—'}</td>
            <td style={cell}>{r.partner ? r.partner.dic || '—' : r.values.dic || '—'}</td>
            <td style={cell}>
              <span style={{ color: ACTION_COLOR[r.action], fontWeight: 600 }}>
                {r.action === 'create' ? '✓ ' : r.action === 'duplicate' ? '↷ ' : '✕ '}
                {partnerImportActionLabel(r.action)}
              </span>
              {r.message && <div style={{ color: r.action === 'create' ? '#8a5a00' : RES.text }}>{r.message}</div>}
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td style={cell} colSpan={7}>
              Nic k zobrazení.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);
