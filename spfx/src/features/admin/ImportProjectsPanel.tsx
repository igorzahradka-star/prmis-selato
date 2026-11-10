/**
 * Import stávajících projektů ze složek v knihovně (zadání kap. 12, Fáze 1).
 *
 * RES vede projekty jako složky `26001-MASTIROVICE 1 GENERALNI OPRAVA`.
 * Tenhle panel je přečte, ukáže, co z nich udělá, a po potvrzení k nim
 * založí evidenční záznamy v aplikaci.
 *
 * **Nic nepřejmenovává ani nepřesouvá.** Složky jsou to jediné, co o těch
 * projektech dnes existuje — sáhnout na ně by znamenalo riskovat dokumenty.
 * Rozbor názvů je v `core/projectImport.ts`.
 */

import * as React from 'react';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { DetailsList, DetailsListLayoutMode, IColumn, SelectionMode } from '@fluentui/react/lib/DetailsList';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { TextField } from '@fluentui/react/lib/TextField';
import { ChoiceGroup, IChoiceGroupOption } from '@fluentui/react/lib/ChoiceGroup';
import { ProgressIndicator } from '@fluentui/react/lib/ProgressIndicator';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { buildImportPlan, ImportCandidate, ImportPlan } from '../../core/projectImport';
import { ImportResult } from '../../data/repositories';
import { ImportProgress, importOutcome, importProgressFraction, importProgressLabel } from '../../core/importProgress';

export interface ImportProjectsPanelProps {
  isOpen: boolean;
  onDismiss: () => void;
  onImported?: () => void;
}

export const ImportProjectsPanel: React.FC<ImportProjectsPanelProps> = ({
  isOpen,
  onDismiss,
  onImported
}) => {
  const { repos, settings, user } = useApp();

  const [plan, setPlan] = React.useState<ImportPlan | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [result, setResult] = React.useState<ImportResult | undefined>(undefined);
  const [importing, setImporting] = React.useState(false);
  const [pm, setPm] = React.useState(user.displayName);
  const [pmOptions, setPmOptions] = React.useState<string[]>([user.displayName]);
  // Zdroj: vložený seznam názvů (SELATO — zakázky leží na disku, ne v knihovně) nebo složky v knihovně.
  const [mode, setMode] = React.useState<'seznam' | 'knihovna'>('seznam');
  const [listText, setListText] = React.useState('');
  const [existingNumbers, setExistingNumbers] = React.useState<string[]>([]);
  const [progress, setProgress] = React.useState<ImportProgress | undefined>(undefined);
  const [folderFailures, setFolderFailures] = React.useState<{ projectNumber: string; message: string }[]>([]);
  // Režim, ve kterém doběhl poslední import (u importu z knihovny se složky nezakládají, výsledek je nepočítá).
  const [resultMode, setResultMode] = React.useState<'seznam' | 'knihovna'>('seznam');
  const topRef = React.useRef<HTMLDivElement>(null);

  // Během importu: varování prohlížeče při zavírání nebo obnovení záložky (import by se přerušil uprostřed).
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

  // Při spuštění importu (průběh) a po dokončení nebo chybě (výsledek) posunout panel nahoru — tlačítko je dole
  // a u dlouhého seznamu by průběh i výsledek zůstaly mimo dohled.
  React.useEffect(() => {
    if ((importing || result || error) && topRef.current && topRef.current.scrollIntoView) {
      topRef.current.scrollIntoView({ block: 'start' });
    }
  }, [importing, result, error]);

  React.useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    let cancelled = false;
    setPlan(undefined);
    setError(undefined);
    setResult(undefined);
    setPm(user.displayName);
    setProgress(undefined);
    setFolderFailures([]);

    // Plán se staví proti tomu, co v aplikaci už je — aby opakovaný import
    // nezaložil projekty podruhé.
    const folderNamesPromise: Promise<string[]> =
      mode === 'knihovna' ? repos.documents.listProjectFolderNames() : Promise.resolve([]);
    Promise.all([folderNamesPromise, repos.projects.list({ includeOverhead: true })])
      .then(([folderNames, existing]) => {
        if (cancelled) {
          return;
        }
        setExistingNumbers(existing.map((p) => p.projectNumber));
        setPlan(buildImportPlan(folderNames, existing.map((p) => p.projectNumber)));
        const names = Array.from(
          new Set(existing.map((p) => p.projectManagerName).filter((n): n is string => !!n))
        );
        if (names.indexOf(user.displayName) === -1) {
          names.push(user.displayName);
        }
        names.sort((a, b) => a.localeCompare(b, 'cs-CZ'));
        setPmOptions(names);
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, repos, user.displayName, mode]);

  // Seznam vložený ručně: plán se přepočítá při každé změně textu.
  React.useEffect(() => {
    if (mode !== 'seznam') {
      return;
    }
    const lines = listText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
    setPlan((old) => (old === undefined && lines.length === 0 ? old : buildImportPlan(lines, existingNumbers)));
  }, [mode, listText, existingNumbers]);

  const importuj = (): void => {
    if (!plan) {
      return;
    }
    setImporting(true);
    setError(undefined);
    setResultMode(mode);

    const inputs = plan.candidates
      .filter((c) => c.action === 'import' && c.projectNumber && c.title)
      .map((c) => ({
        projectNumber: c.projectNumber as string,
        title: c.title as string,
        isOverhead: c.isOverhead,
        // Ze seznamu složka ještě neexistuje — odkaz na ni vznikne až po jejím založení.
        folderName: mode === 'knihovna' ? c.folderName : undefined
      }));

    // Ze seznamu: složky v knihovně ještě nejsou, proto se po založení záznamu založí podle šablony z Nastavení.
    const createFolders = async (numbers: string[]): Promise<void> => {
      const failures: { projectNumber: string; message: string }[] = [];
      for (let i = 0; i < numbers.length; i++) {
        setProgress({ phase: 'folders', done: i, total: numbers.length, current: numbers[i] });
        try {
          await repos.projects.retryCreateFolders(numbers[i]);
        } catch (e) {
          failures.push({ projectNumber: numbers[i], message: e instanceof Error ? e.message : String(e) });
        }
      }
      setProgress({ phase: 'folders', done: numbers.length, total: numbers.length });
      setFolderFailures(failures);
    };

    setProgress({ phase: 'records', done: 0, total: inputs.length });
    repos.projects
      .importProjects(inputs, plan.counterByYear, pm)
      .then(async (r) => {
        if (mode === 'seznam') {
          await createFolders(r.imported);
        }
        setImporting(false);
        setProgress(undefined);
        setResult(r);
        onImported?.();
      })
      .catch((e: Error) => {
        setImporting(false);
        setProgress(undefined);
        setError(e.message);
      });
  };

  const outcome = result
    ? importOutcome(result.imported.length, result.failed.length, folderFailures.length, resultMode === 'seznam')
    : undefined;

  const columns: IColumn[] = [
    {
      key: 'folderName',
      name: 'Složka',
      minWidth: 240,
      isResizable: true,
      onRender: (c: ImportCandidate) => (
        <span style={{ color: c.action === 'import' ? RES.text : RES.gray }}>{c.folderName}</span>
      )
    },
    {
      key: 'projectNumber',
      name: 'Číslo',
      minWidth: 70,
      maxWidth: 80,
      onRender: (c: ImportCandidate) => c.projectNumber ?? '—'
    },
    {
      key: 'title',
      name: 'Název projektu',
      minWidth: 200,
      isResizable: true,
      onRender: (c: ImportCandidate) => c.title ?? '—'
    },
    {
      key: 'action',
      name: 'Co se stane',
      minWidth: 220,
      isResizable: true,
      onRender: (c: ImportCandidate) => <ActionBadge candidate={c} />
    }
  ];

  return (
    <Panel
      isOpen={isOpen}
      // Během importu panel nejde zavřít (křížek je skrytý, Esc ani kliknutí vedle nic neudělá) — přerušený import by nechal projekty bez složek.
      onDismiss={() => {
        if (!importing) {
          onDismiss();
        }
      }}
      hasCloseButton={!importing}
      isBlocking
      type={PanelType.large}
      headerText="Import stávajících projektů"
      closeButtonAriaLabel="Zavřít"
      isFooterAtBottom
      onRenderFooterContent={() => (
        <div style={{ display: 'flex', gap: 8 }}>
          {!result && (
            <PrimaryButton
              text={importing ? 'Importuji…' : `Naimportovat ${plan?.toImport ?? 0} projektů`}
              disabled={importing || !plan || plan.toImport === 0}
              onClick={importuj}
            />
          )}
          <DefaultButton text={result ? 'Zavřít' : 'Zrušit'} onClick={onDismiss} disabled={importing} />
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
              percentComplete={importProgressFraction(progress)}
              description={importProgressLabel(progress)}
              barHeight={6}
            />
          </div>
        )}

        {error && (
          <MessageBar messageBarType={MessageBarType.error} isMultiline>
            <strong>Import se nepodařil:</strong> {error}
          </MessageBar>
        )}

        {result && outcome && (
          <MessageBar
            messageBarType={
              outcome.kind === 'success' ? MessageBarType.success : outcome.kind === 'warning' ? MessageBarType.warning : MessageBarType.error
            }
            isMultiline
          >
            <div style={{ fontSize: 16, fontWeight: 700 }}>{outcome.headline}</div>
            {folderFailures.length > 0 && (
              <div style={{ marginTop: 6 }}>
                U {folderFailures.length} projektů se nepodařilo založit složky (v detailu projektu je v ozubeném kolečku „Doplnit chybějící složky podle šablony“):
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {folderFailures.map((f) => (
                    <li key={f.projectNumber}>
                      <strong>{f.projectNumber}</strong>: {f.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.failed.length > 0 && (
              <div style={{ marginTop: 6 }}>
                Nenaimportováno:
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {result.failed.map((f) => (
                    <li key={f.projectNumber}>
                      <strong>{f.projectNumber}</strong>: {f.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </MessageBar>
        )}

        <MessageBar messageBarType={MessageBarType.info} isMultiline>
          {mode === 'seznam' ? (
            <>
              Ze vloženého seznamu založí záznam každého projektu a pod <code>{settings.folders.rootFolder || 'kořenem knihovny'}</code>{' '}
              podle šablony z Nastavení i složky (členěné podle roku v čísle). Existující složky se nepřepisují.
              Import se dá pustit opakovaně, co už v aplikaci je, se přeskočí.
            </>
          ) : (
            <>
              Načte složky z <code>{settings.folders.rootFolder || 'kořene knihovny'}</code> a k těm, které
              vypadají jako projekt, založí záznam v aplikaci. <strong>Složky se nepřejmenovávají ani
              nepřesouvají</strong> — zůstanou přesně tak, jak jsou. Import se dá pustit opakovaně,
              co už je naimportované, se přeskočí.
            </>
          )}
        </MessageBar>

        {!result && (
          <ChoiceGroup
            label="Odkud projekty vzít"
            selectedKey={mode}
            options={[
              { key: 'seznam', text: 'Ze seznamu názvů (složky se založí podle šablony)' },
              { key: 'knihovna', text: 'Ze složek, které už v knihovně jsou' }
            ] as IChoiceGroupOption[]}
            onChange={(_, o) => o && setMode(o.key as 'seznam' | 'knihovna')}
            disabled={importing}
          />
        )}

        {mode === 'seznam' && !result && (
          <TextField
            label="Seznam názvů složek (jeden na řádek)"
            description="Např. 26ZA00005_EKOL_UL BM kotel 32 MWt Trmice. Vzorové složky s pořadím 00000 a řádky bez čísla se přeskočí."
            multiline
            rows={8}
            value={listText}
            onChange={(_, v) => setListText(v || '')}
            disabled={importing}
            styles={{ field: { fontFamily: 'Consolas, monospace', fontSize: 12 } }}
          />
        )}

        {!plan && !error && mode === 'knihovna' && <Spinner size={SpinnerSize.large} label="Čtu složky…" />}

        {plan && !result && (
          <>
            <Dropdown
              label="Projektový manažer importovaných projektů"
              options={pmOptions.map((n): IDropdownOption => ({ key: n, text: n }))}
              selectedKey={pm}
              onChange={(_, o) => o && setPm(String(o.key))}
              styles={{ root: { maxWidth: 320 } }}
            />

            {plan.counterByYear.length > 0 && (
              <div
                style={{
                  background: RES.bluePale,
                  border: `1px solid ${RES.grayBlue}`,
                  borderRadius: 4,
                  padding: '10px 14px',
                  fontSize: 13
                }}
              >
                Po importu bude čítač navazovat takto:{' '}
                {plan.counterByYear
                  .map((c) => `rok ${c.year} → další projekt ${dalsiCislo(c.year, c.lastValue)}`)
                  .join(', ')}
                .
              </div>
            )}
          </>
        )}

        {plan && (
          <DetailsList
            items={plan.candidates}
            columns={columns}
            selectionMode={SelectionMode.none}
            layoutMode={DetailsListLayoutMode.justified}
            compact
          />
        )}
      </div>
    </Panel>
  );
};

/** Ukáže, co se s řádkem stane, a u přeskočených proč. */
const ActionBadge: React.FC<{ candidate: ImportCandidate }> = ({ candidate }) => {
  if (candidate.action === 'import') {
    return (
      <span style={{ color: RES.greenDark, fontWeight: 600 }}>
        naimportuje se{candidate.isOverhead ? ' (jako Režie)' : ''}
      </span>
    );
  }
  return (
    <span style={{ color: RES.gray }}>
      <strong>{candidate.action === 'duplicate' ? 'přeskočí se' : 'není projekt'}</strong>
      {candidate.reason ? ` — ${candidate.reason}` : ''}
    </span>
  );
};

/** Jak bude vypadat číslo dalšího projektu po importu — `26ZA00060`. */
function dalsiCislo(year: number, lastValue: number): string {
  const yy = year % 100;
  const sequence = String(lastValue + 1);
  const padded = `${'0'.repeat(Math.max(0, 5 - sequence.length))}${sequence}`;
  return `${yy < 10 ? '0' : ''}${yy}ZA${padded}`;
}
