/**
 * Kontroly projektů (Projekty → Kontroly projektů) — záložka Účetnictví: u každého projektu, kolik řádků z Abry zbývá přiřadit k rozpočtu,
 * kolik oprav je označených (čeká na odeslání účtárně) a kolik jich visí na účtárně. Pod tím seznam těchto oprav napříč projekty.
 * Další kontroly přibudou jako další záložky.
 */

import * as React from 'react';
import { Checkbox } from '@fluentui/react/lib/Checkbox';
import { Link } from '@fluentui/react/lib/Link';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Pivot, PivotItem } from '@fluentui/react/lib/Pivot';
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { buildHash, RouteName } from '../../ui/router';
import { PageHeading } from '../../ui/components/PageHeading';
import { formatDate, formatMoney } from '../../core/format';
import { AbraDoc } from '../../core/abraDocs';
import { AbraCorrection } from '../../core/abraCorrections';
import { checksTotals, projectChecks, ProjectCheck } from '../../core/accountingChecks';
import { DocAllocation } from '../../core/budget';

const TH: React.CSSProperties = { textAlign: 'left', fontWeight: 600, fontSize: 12, color: RES.gray, padding: '6px 8px', whiteSpace: 'nowrap', borderBottom: `1px solid ${RES.grayBlue}` };
const TD: React.CSSProperties = { padding: '6px 8px', fontSize: 13, verticalAlign: 'top' };

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const Tile: React.FC<{ label: string; value: string; hint: string; warn?: boolean }> = ({ label, value, hint, warn }) => (
  <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderLeft: `4px solid ${warn ? RES.amber : RES.grayBlue}`, borderRadius: 4, padding: '6px 12px', minWidth: 150, flex: '1 1 180px' }} title={hint}>
    <div style={{ fontSize: 12, color: RES.gray }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 600, color: warn ? RES.amber : RES.navy }}>{value}</div>
  </div>
);

export const AccountingChecksPage: React.FC = () => {
  const { repos, user } = useApp();
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [checks, setChecks] = React.useState<ProjectCheck[]>([]);
  const [open, setOpen] = React.useState<AbraCorrection[]>([]);
  const [docs, setDocs] = React.useState<AbraDoc[]>([]);
  const [onlyProblems, setOnlyProblems] = React.useState(true);
  const [onlyMine, setOnlyMine] = React.useState(false);
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const [projects, allDocs, corrections] = await Promise.all([repos.projects.list(), repos.abraDocs.listAll(), repos.abraCorrections.listOpen()]);
      // Přiřazení jsou v rozpočtech projektů — čtou se jen u projektů, které mají řádky z Abry (po několika najednou).
      const numbers = projects.filter((p) => allDocs.some((d) => d.projectNumber === p.projectNumber)).map((p) => p.projectNumber);
      const allocations: Record<string, DocAllocation[] | undefined> = {};
      for (let i = 0; i < numbers.length; i += 5) {
        await Promise.all(
          numbers.slice(i, i + 5).map((n) =>
            repos.budgets
              .get(n)
              .then((b) => {
                allocations[n] = b ? b.doc.allocations : undefined;
              })
              .catch(() => {
                allocations[n] = undefined;
              })
          )
        );
      }
      if (!cancelled) {
        setChecks(projectChecks(projects.map((p) => ({ projectNumber: p.projectNumber, title: p.title, projectManagerName: p.projectManagerName, projectManagerLogin: p.projectManagerLogin })), allDocs, allocations, corrections));
        setOpen(corrections);
        setDocs(allDocs);
        setLoaded(true);
      }
    })().catch((e: unknown) => {
      if (!cancelled) {
        setError(e instanceof Error ? e.message : String(e));
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [repos]);

  const mine = (c: { projectManagerLogin?: string }): boolean => !!c.projectManagerLogin && c.projectManagerLogin.toLowerCase() === user.loginName.toLowerCase();
  const shown = checks.filter((c) => (!onlyProblems || c.hasProblem) && (!onlyMine || mine(c)) && (search.trim() === '' || norm(`${c.projectNumber} ${c.title} ${c.projectManagerName || ''}`).indexOf(norm(search.trim())) >= 0));
  const totals = checksTotals(shown);
  const shownNumbers = new Set(shown.map((c) => c.projectNumber));
  const fixes = open.filter((c) => shownNumbers.has(c.projectNumber)).sort((a, b) => (a.sentAt ? a.sentAt.getTime() : Infinity) - (b.sentAt ? b.sentAt.getTime() : Infinity));
  const titleOf = (n: string): string => (checks.filter((c) => c.projectNumber === n)[0] || { title: '' }).title;
  const docOf = (c: AbraCorrection): AbraDoc | undefined => docs.filter((d) => d.abraId === c.abraId)[0];
  const today = new Date();

  return (
    <>
      <PageHeading title="Kontroly projektů" subtitle="Co zbývá dořešit v projektech. Účetnictví: řádky z Abry bez přiřazení a opravy, které visí na účtárně." />
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {!loaded && <Spinner size={SpinnerSize.large} label="Načítám kontroly…" />}
      {loaded && (
        <Pivot aria-label="Kontroly projektů">
          <PivotItem headerText="Účetnictví" itemIcon="Financial">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '10px 0' }}>
              <Tile label="Projekty k řešení" value={String(totals.projects)} hint="projekty, které mají nepřiřazené řádky nebo otevřené opravy" warn={totals.projects > 0} />
              <Tile label="Nepřiřazené řádky" value={String(totals.unassigned)} hint="řádky z Abry (bez záloh), které ještě nejsou přiřazené k položce rozpočtu" warn={totals.unassigned > 0} />
              <Tile label="Opravy k odeslání účtárně" value={String(totals.fixToSend)} hint="řádky označené jako OPRAVA, které ještě nebyly odeslány účtárně" warn={totals.fixToSend > 0} />
              <Tile label="Čeká na účtárnu" value={totals.fixWaiting > 0 ? `${totals.fixWaiting}${totals.oldestWaitingDays !== undefined ? ` (nejdéle ${totals.oldestWaitingDays} d)` : ''}` : '0'} hint="odesláno účtárně, čeká na opravu v Abře" warn={totals.fixWaiting > 0} />
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              <Checkbox label="Jen s problémem" checked={onlyProblems} onChange={(_, v) => setOnlyProblems(!!v)} />
              <Checkbox label="Jen moje projekty" checked={onlyMine} onChange={(_, v) => setOnlyMine(!!v)} />
              <SearchBox placeholder="Hledat projekt nebo manažera…" value={search} onChange={(_, v) => setSearch(v ?? '')} onClear={() => setSearch('')} styles={{ root: { width: 280 } }} />
              <span style={{ fontSize: 12, color: RES.gray }}>Zobrazeno {shown.length} projektů</span>
            </div>
            {shown.length === 0 ? (
              <MessageBar messageBarType={MessageBarType.success} isMultiline>
                {checks.length === 0 ? 'Zatím nejsou z Abry stažené žádné řádky (nebo žádné opravy).' : 'Nic k řešení — žádný projekt neodpovídá filtru, nebo je všechno v pořádku.'}
              </MessageBar>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: RES.white, border: `1px solid ${RES.grayBlue}` }}>
                  <thead>
                    <tr>
                      <th style={TH}>Projekt</th>
                      <th style={TH}>Projektový manažer</th>
                      <th style={{ ...TH, textAlign: 'right' }}>Řádků z Abry</th>
                      <th style={{ ...TH, textAlign: 'right' }}>Nepřiřazeno</th>
                      <th style={{ ...TH, textAlign: 'right' }}>Opravy k odeslání</th>
                      <th style={{ ...TH, textAlign: 'right' }}>Čeká na účtárnu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((c) => (
                      <tr key={c.projectNumber} style={{ borderTop: `1px solid ${RES.background}` }}>
                        <td style={TD}>
                          <Link href={buildHash(RouteName.ProjectDetail, c.projectNumber)}>{c.projectNumber}</Link> {c.title}
                        </td>
                        <td style={TD}>{c.projectManagerName || '—'}</td>
                        <td style={{ ...TD, textAlign: 'right' }}>{c.lines}</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: c.unassigned > 0 ? 600 : 400, color: c.unassigned > 0 ? RES.amber : RES.text }}>{c.unassigned}</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: c.fixToSend > 0 ? 600 : 400, color: c.fixToSend > 0 ? RES.amber : RES.text }}>{c.fixToSend}</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: c.fixWaiting > 0 ? 600 : 400, color: c.fixWaiting > 0 ? RES.amber : RES.text }}>
                          {c.fixWaiting}
                          {c.oldestWaitingDays !== undefined && <span style={{ color: RES.gray, fontWeight: 400 }}> (nejdéle {c.oldestWaitingDays} d)</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {fixes.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontWeight: 600, color: RES.navy, marginBottom: 6 }}>Opravy čekající na účtárnu ({fixes.length})</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', background: RES.white, border: `1px solid ${RES.grayBlue}` }}>
                    <thead>
                      <tr>
                        <th style={TH}>Projekt</th>
                        <th style={TH}>Doklad</th>
                        <th style={TH}>Partner / popis řádku</th>
                        <th style={{ ...TH, textAlign: 'right' }}>Částka</th>
                        <th style={TH}>Popis opravy</th>
                        <th style={TH}>Stav</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fixes.map((c) => {
                        const d = docOf(c);
                        const days = c.sentAt ? Math.floor((today.getTime() - c.sentAt.getTime()) / (24 * 3600 * 1000)) : undefined;
                        return (
                          <tr key={c.id} style={{ borderTop: `1px solid ${RES.background}`, background: c.status === 'Odesláno' ? '#FFF6DD' : '#FDE4CF' }}>
                            <td style={TD}>
                              <Link href={buildHash(RouteName.ProjectDetail, c.projectNumber)}>{c.projectNumber}</Link> {titleOf(c.projectNumber)}
                            </td>
                            <td style={TD}>{c.docNumber}</td>
                            <td style={TD}>
                              {c.line.partnerName || '—'}
                              <div style={{ color: RES.gray, fontSize: 12 }}>{c.line.description || (d && d.description) || ''}</div>
                            </td>
                            <td style={{ ...TD, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatMoney(c.line.amountNet, c.line.currency)}</td>
                            <td style={{ ...TD, whiteSpace: 'pre-wrap' }}>{c.note}</td>
                            <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                              {c.status === 'Odesláno' ? `odesláno ${c.sentAt ? formatDate(c.sentAt) : ''}${days !== undefined ? ` (před ${days} d)` : ''}` : 'čeká na odeslání'}
                              <div style={{ color: RES.gray, fontSize: 12 }}>označil {c.markedByName}</div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </PivotItem>
        </Pivot>
      )}
    </>
  );
};
