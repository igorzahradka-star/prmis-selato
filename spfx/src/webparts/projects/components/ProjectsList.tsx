/**
 * Kompaktní seznam běžících projektů (Název, Projektový manažer, Lokalita, Celková cena, Stav) pro stránky webu.
 * Řídí se jen stavem projektu podle Nastavení v PRMIS. Název odkazuje na detail projektu v PRMIS.
 */

import * as React from 'react';
import { ThemeProvider } from '@fluentui/react/lib/Theme';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { RES, RES_FONT_FAMILY, resTheme } from '../../../ui/theme';
import { StatusBadge } from '../../../ui/components/StatusBadge';
import { formatMoney } from '../../../core/format';
import { Project } from '../../../core/types';
import { IWebProjectsRepository, WebProjectsData } from '../../../data/repositories';
import { projectDetailUrl, selectWebProjects, webPrice } from '../../../core/webProjects';

export interface IProjectsListProps {
  repo: IWebProjectsRepository;
  title: string;
  /** Adresa stránky s aplikací PRMIS — pro odkazy na detail projektu. */
  appPageUrl: string;
}

const TH: React.CSSProperties = { textAlign: 'left', padding: '6px 10px', fontSize: 12, fontWeight: 600, color: RES.gray, borderBottom: `1px solid ${RES.grayBlue}`, whiteSpace: 'nowrap' };
const TD: React.CSSProperties = { padding: '6px 10px', fontSize: 13, borderBottom: `1px solid ${RES.background}`, verticalAlign: 'middle' };

export const ProjectsList: React.FC<IProjectsListProps> = ({ repo, title, appPageUrl }) => {
  const [data, setData] = React.useState<WebProjectsData | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [showAll, setShowAll] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    repo
      .load()
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const projects: Project[] = data ? selectWebProjects(data.projects, data.settings) : [];
  const limit = data ? data.settings.maxRows : 0;
  const shown = showAll ? projects : projects.slice(0, limit);
  const showPrice = data ? data.settings.showPrice : true;

  return (
    <ThemeProvider theme={resTheme} style={{ background: 'transparent', fontFamily: RES_FONT_FAMILY }}>
      <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '10px 6px 8px' }}>
        {title && <h2 style={{ margin: '0 10px 6px', fontSize: 16, fontWeight: 600, color: RES.navyDark }}>{title}</h2>}
        {error && (
          <MessageBar messageBarType={MessageBarType.error} isMultiline>
            {error}
          </MessageBar>
        )}
        {!data && !error && <Spinner size={SpinnerSize.medium} label="Načítám projekty…" />}
        {data && projects.length === 0 && <div style={{ padding: '8px 10px', fontSize: 13, color: RES.gray }}>Teď tu nejsou žádné běžící projekty.</div>}
        {data && projects.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>Název</th>
                  <th style={TH}>Projektový manažer</th>
                  <th style={TH}>Lokalita</th>
                  {showPrice && <th style={{ ...TH, textAlign: 'right' }}>Celková cena</th>}
                  <th style={TH}>Stav</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const price = webPrice(p);
                  return (
                    <tr key={p.id}>
                      <td style={{ ...TD, fontWeight: 600 }}>
                        <a href={projectDetailUrl(appPageUrl, p.projectNumber)} style={{ color: RES.blue, textDecoration: 'none' }}>
                          {p.title}
                        </a>
                      </td>
                      <td style={TD}>{p.projectManagerName || '—'}</td>
                      <td style={TD}>{p.location || '—'}</td>
                      {showPrice && (
                        <td style={{ ...TD, textAlign: 'right', whiteSpace: 'nowrap', color: price && price.provisional ? RES.gray : RES.text, fontStyle: price && price.provisional ? 'italic' : 'normal' }}>
                          {price ? formatMoney(price.amount, price.currency) : '—'}
                          {price && price.provisional && <span style={{ marginLeft: 6, fontSize: 11 }}>(neschváleno)</span>}
                        </td>
                      )}
                      <td style={TD}>
                        <StatusBadge status={p.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && projects.length > limit && (
          <div style={{ padding: '6px 10px 0' }}>
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              style={{ border: 'none', background: 'none', color: RES.blue, cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: 'inherit' }}
            >
              {showAll ? 'Zobrazit méně' : `Zobrazit vše (${projects.length})`}
            </button>
          </div>
        )}
      </div>
    </ThemeProvider>
  );
};
