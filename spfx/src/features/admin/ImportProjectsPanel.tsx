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

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { buildImportPlan, ImportCandidate, ImportPlan } from '../../core/projectImport';
import { ImportResult } from '../../data/repositories';

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

  React.useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    let cancelled = false;
    setPlan(undefined);
    setError(undefined);
    setResult(undefined);
    setPm(user.displayName);

    // Plán se staví proti tomu, co v aplikaci už je — aby opakovaný import
    // nezaložil projekty podruhé.
    Promise.all([repos.documents.listProjectFolderNames(), repos.projects.list({ includeOverhead: true })])
      .then(([folderNames, existing]) => {
        if (cancelled) {
          return;
        }
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
  }, [isOpen, repos, user.displayName]);

  const importuj = (): void => {
    if (!plan) {
      return;
    }
    setImporting(true);
    setError(undefined);

    const inputs = plan.candidates
      .filter((c) => c.action === 'import' && c.projectNumber && c.title)
      .map((c) => ({
        projectNumber: c.projectNumber as string,
        title: c.title as string,
        isOverhead: c.isOverhead,
        folderName: c.folderName
      }));

    repos.projects
      .importProjects(inputs, plan.counterByYear, pm)
      .then((r) => {
        setImporting(false);
        setResult(r);
        onImported?.();
      })
      .catch((e: Error) => {
        setImporting(false);
        setError(e.message);
      });
  };

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
      onDismiss={onDismiss}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        <MessageBar messageBarType={MessageBarType.info} isMultiline>
          Načte složky z <code>{settings.folders.rootFolder || 'kořene knihovny'}</code> a k těm, které
          vypadají jako projekt, založí záznam v aplikaci. <strong>Složky se nepřejmenovávají ani
          nepřesouvají</strong> — zůstanou přesně tak, jak jsou. Import se dá pustit opakovaně,
          co už je naimportované, se přeskočí.
        </MessageBar>

        {error && (
          <MessageBar messageBarType={MessageBarType.error} isMultiline>
            {error}
          </MessageBar>
        )}

        {result && (
          <MessageBar
            messageBarType={result.failed.length === 0 ? MessageBarType.success : MessageBarType.warning}
            isMultiline
          >
            Naimportováno {result.imported.length} projektů.
            {result.failed.length > 0 && (
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {result.failed.map((f) => (
                  <li key={f.projectNumber}>
                    <strong>{f.projectNumber}</strong>: {f.message}
                  </li>
                ))}
              </ul>
            )}
          </MessageBar>
        )}

        {!plan && !error && <Spinner size={SpinnerSize.large} label="Čtu složky…" />}

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

/** Jak bude vypadat číslo dalšího projektu po importu — `26006`. */
function dalsiCislo(year: number, lastValue: number): string {
  const yy = year % 100;
  const sequence = String(lastValue + 1);
  const padded = `${'0'.repeat(Math.max(0, 3 - sequence.length))}${sequence}`;
  return `${yy < 10 ? '0' : ''}${yy}${padded}`;
}
