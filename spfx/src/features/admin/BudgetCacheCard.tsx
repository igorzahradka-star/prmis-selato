/**
 * Přepočet součtů rozpočtů ve všech projektech (správce). Přehled projektů ukazuje Celkovou cenu, Nákup, Marži a Prostavěnost
 * z rozpočtu; čísla se do projektu ukládají při otevření a uložení rozpočtu a po změně objednávky. Projekty, jejichž
 * rozpočet nikdo od nasazení této funkce neotevřel, je potřeba přepočítat — to dělá toto tlačítko (jednorázově).
 * Nic nemaže ani nemění v rozpočtech; zapisuje jen uložené součty do evidence projektů.
 */

import * as React from 'react';
import { DefaultButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { useReportCurrency } from '../../ui/useReportCurrency';
import { RefreshAllResult, refreshAllBudgetCaches } from '../budget/budgetCache';

export const BudgetCacheCard: React.FC = () => {
  const { repos, settings } = useApp();
  const report = useReportCurrency();
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState<string | undefined>(undefined);
  const [result, setResult] = React.useState<RefreshAllResult | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);

  const run = (): void => {
    setRunning(true);
    setError(undefined);
    setResult(undefined);
    refreshAllBudgetCaches(repos, settings, report.rates, (done, total) => setProgress(`Projekt ${done} z ${total}…`))
      .then((r) => {
        setResult(r);
        setRunning(false);
        setProgress(undefined);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setRunning(false);
        setProgress(undefined);
      });
  };

  return (
    <section style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '12px 16px', marginTop: 16 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, color: RES.navy }}>Součty rozpočtů v přehledu projektů</h3>
      <div style={{ fontSize: 13, color: RES.gray, marginBottom: 8 }}>
        Přepočítá Celkovou cenu, Nákup, Marži, Prostavěnost a semafor ze všech rozpočtů do evidence projektů, aby je přehled ukazoval u všech projektů. Stačí spustit jednou po nasazení; dál se čísla
        aktualizují sama. Nic nemaže ani nemění v rozpočtech.
      </div>
      <DefaultButton text={running ? 'Přepočítávám…' : 'Přepočítat všechny projekty'} iconProps={{ iconName: 'Sync' }} disabled={running} onClick={run} />
      {running && <Spinner size={SpinnerSize.small} label={progress || 'Pracuji…'} labelPosition="right" styles={{ root: { justifyContent: 'flex-start', marginTop: 8 } }} />}
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline styles={{ root: { marginTop: 8 } }}>
          {error}
        </MessageBar>
      )}
      {result && (
        <MessageBar messageBarType={result.failed.length > 0 ? MessageBarType.warning : MessageBarType.success} isMultiline styles={{ root: { marginTop: 8 } }}>
          Projektů {result.projects}, z toho s rozpočtem {result.withBudget}; přepočítáno {result.updated}.
          {result.failed.length > 0 && (
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {result.failed.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </MessageBar>
      )}
    </section>
  );
};
