/**
 * Měření rychlosti načítání — pro případ, že se některá obrazovka načítá pomalu. Spustí po jednom hlavní dotazy aplikace
 * na SharePoint (nastavení, projekty, objednávky, podklady, partneři, kurzy, zápisy), každý dvakrát, a ukáže, jak dlouho trvaly
 * a kolik položek vrátily. Nic nemění. Výsledek jde opsat nebo poslat vývojáři: ukáže, jestli je pomalý SharePoint, konkrétní
 * seznam, nebo aplikace.
 */

import * as React from 'react';
import { DefaultButton } from '@fluentui/react/lib/Button';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';

interface Result {
  label: string;
  first?: number;
  second?: number;
  count?: number;
  error?: string;
}

/** Za jak dlouho je dotaz „pomalý“ (v milisekundách). */
const SLOW_MS = 3000;

function countOf(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length;
  }
  return undefined;
}

export const SpeedCard: React.FC = () => {
  const { repos } = useApp();
  const [running, setRunning] = React.useState(false);
  const [results, setResults] = React.useState<Result[]>([]);

  const tests: { label: string; run: () => Promise<unknown> }[] = [
    { label: 'Nastavení aplikace', run: () => repos.settings.get() },
    { label: 'Projekty (i Režie)', run: () => repos.projects.list({ includeOverhead: true }) },
    { label: 'Objednávky', run: () => repos.orders.list() },
    { label: 'Podklady pro fakturaci', run: () => repos.invoices.list() },
    { label: 'Partneři', run: () => repos.partners.list({}) },
    { label: 'Kurzy', run: () => repos.rates.getLatest() },
    { label: 'Zápisy ze stavby', run: () => repos.diary.listEntries({}) }
  ];

  const start = (): void => {
    setRunning(true);
    setResults([]);
    (async (): Promise<void> => {
      for (const t of tests) {
        const r: Result = { label: t.label };
        try {
          const t0 = Date.now();
          const value = await t.run();
          r.first = Date.now() - t0;
          r.count = countOf(value);
          const t1 = Date.now();
          await t.run();
          r.second = Date.now() - t1;
        } catch (e) {
          r.error = e instanceof Error ? e.message : String(e);
        }
        setResults((cur) => [...cur, r]);
      }
    })()
      .catch(() => undefined)
      .then(() => setRunning(false))
      .catch(() => undefined);
  };

  const fmt = (ms: number | undefined): string => (ms === undefined ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1).replace('.', ',')} s` : `${ms} ms`);
  const summary = results
    .map((r) => `${r.label}: ${r.error ? `CHYBA ${r.error}` : `1. běh ${fmt(r.first)}, 2. běh ${fmt(r.second)}, položek ${r.count ?? '?'}`}`)
    .join('\n');

  return (
    <section style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '12px 16px', marginTop: 16 }}>
      <h2 style={{ margin: '0 0 6px', fontSize: 15, color: RES.navy }}>Rychlost načítání</h2>
      <div style={{ fontSize: 13, color: RES.gray, marginBottom: 8 }}>
        Když se některá obrazovka načítá pomalu, spusťte měření. Postupně načte hlavní seznamy aplikace (každý dvakrát) a ukáže, který trvá. Nic nemění.
      </div>
      <DefaultButton iconProps={{ iconName: 'Timer' }} text={running ? 'Měřím…' : 'Změřit rychlost'} disabled={running} onClick={start} />
      {running && <Spinner size={SpinnerSize.small} label="Měřím…" labelPosition="right" styles={{ root: { display: 'inline-flex', marginLeft: 12 } }} />}
      {results.length > 0 && (
        <table style={{ borderCollapse: 'collapse', fontSize: 13, marginTop: 10, width: '100%', maxWidth: 640 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: RES.gray }}>
              <th style={{ padding: '4px 6px' }}>Co se načítá</th>
              <th style={{ padding: '4px 6px', textAlign: 'right' }}>1. běh</th>
              <th style={{ padding: '4px 6px', textAlign: 'right' }}>2. běh</th>
              <th style={{ padding: '4px 6px', textAlign: 'right' }}>Položek</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const slow = (r.first ?? 0) >= SLOW_MS;
              return (
                <tr key={r.label} style={{ borderTop: `1px solid ${RES.background}` }}>
                  <td style={{ padding: '4px 6px' }}>{r.label}</td>
                  {r.error ? (
                    <td colSpan={3} style={{ padding: '4px 6px', color: RES.red }}>
                      {r.error}
                    </td>
                  ) : (
                    <>
                      <td style={{ padding: '4px 6px', textAlign: 'right', color: slow ? RES.red : undefined, fontWeight: slow ? 700 : undefined }}>{fmt(r.first)}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right' }}>{fmt(r.second)}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right' }}>{r.count ?? '—'}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {!running && results.length > 0 && (
        <details style={{ marginTop: 8, fontSize: 12 }}>
          <summary style={{ cursor: 'pointer' }}>Text k odeslání</summary>
          <pre style={{ whiteSpace: 'pre-wrap', userSelect: 'all' }}>{summary}</pre>
        </details>
      )}
    </section>
  );
};
