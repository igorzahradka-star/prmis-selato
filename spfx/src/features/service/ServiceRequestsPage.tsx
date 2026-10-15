/**
 * Přehled požadavků (Servis → Přehled požadavků) — jen přehled: servisní požadavky podle stavu (otevřené, zadané, probíhající, hotové)
 * a lokality. Detail požadavku, úpravy a servisní listy jsou v Servisu; číslo požadavku na ně odkazuje.
 */

import * as React from 'react';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Pivot, PivotItem } from '@fluentui/react/lib/Pivot';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { navigate, RouteName } from '../../ui/router';
import { PageHeading } from '../../ui/components/PageHeading';
import { formatDate } from '../../core/format';
import { canViewService, ServiceDevice, ServiceSite } from '../../core/service';
import { ServiceRequest } from '../../core/serviceJobs';
import { filterRequests, REQUEST_GROUPS, RequestGroup, requestGroupCounts } from '../../core/serviceOverview';
import { PriorityBadge, RequestStatusBadge, TD, TH } from './serviceUi';

export const ServiceRequestsPage: React.FC = () => {
  const { repos, user } = useApp();
  const mayView = canViewService(user.roles);
  const [sites, setSites] = React.useState<ServiceSite[]>([]);
  const [devices, setDevices] = React.useState<ServiceDevice[]>([]);
  const [requests, setRequests] = React.useState<ServiceRequest[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [chosen, setChosen] = React.useState<string[]>([]);
  const [group, setGroup] = React.useState<RequestGroup>('otevrene');

  React.useEffect(() => {
    if (!mayView) {
      setLoaded(true);
      return undefined;
    }
    let cancelled = false;
    Promise.all([repos.service.listSites(), repos.service.listDevices(), repos.service.listRequests()])
      .then(([s, d, r]) => {
        if (!cancelled) {
          setSites(s);
          setDevices(d);
          setRequests(r);
          setLoaded(true);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repos, mayView]);

  if (!mayView) {
    return (
      <>
        <PageHeading title="Přehled požadavků" />
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          Servis je přístupný jen správci servisu, dispečerovi, vedení, čtenáři a administrátorovi.
        </MessageBar>
      </>
    );
  }

  const counts = requestGroupCounts(requests, chosen);
  const shown = filterRequests(requests, group, chosen);
  const siteName = (n: string): string => {
    const s = sites.filter((x) => x.number === n)[0];
    return s ? `${s.number} ${s.name}` : n;
  };
  const deviceName = (n?: string): string => {
    const d = n ? devices.filter((x) => x.number === n)[0] : undefined;
    return d ? `${d.number} ${d.name}` : 'celá lokalita';
  };
  const now = new Date();

  return (
    <>
      <PageHeading title="Přehled požadavků" subtitle="Servisní požadavky podle stavu a lokality (jen přehled). Detail, úpravy a servisní listy najdete v Servisu — odkazem na číslo požadavku." />
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {!loaded && <Spinner size={SpinnerSize.large} label="Načítám…" />}
      {loaded && (
        <>
          <Dropdown
            label="Lokality"
            multiSelect
            placeholder="Všechny lokality"
            selectedKeys={chosen}
            options={sites.filter((s) => s.isActive).map((s) => ({ key: s.number, text: `${s.number} ${s.name}` }))}
            onChange={(_, o) => o && setChosen((cur) => (o.selected ? [...cur, String(o.key)] : cur.filter((k) => k !== String(o.key))))}
            styles={{ root: { width: 300, marginBottom: 8 } }}
          />
          <Pivot aria-label="Stav požadavků" selectedKey={group} onLinkClick={(item) => item && item.props.itemKey && setGroup(item.props.itemKey as RequestGroup)}>
            {REQUEST_GROUPS.map((g) => (
              <PivotItem key={g.key} itemKey={g.key} headerText={`${g.label} (${counts[g.key]})`} />
            ))}
          </Pivot>
          {shown.length === 0 ? (
            <MessageBar messageBarType={MessageBarType.info} styles={{ root: { marginTop: 10 } }}>
              Žádné požadavky v tomto stavu{chosen.length > 0 ? ' pro vybrané lokality' : ''}.
            </MessageBar>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', background: RES.white, border: `1px solid ${RES.grayBlue}` }}>
                <thead>
                  <tr>
                    <th style={TH}>Číslo</th>
                    <th style={TH}>Lokalita / soubor</th>
                    <th style={TH}>Požadavek</th>
                    <th style={TH}>Priorita</th>
                    <th style={TH}>Druh</th>
                    <th style={TH}>Stav</th>
                    <th style={TH}>Přijato</th>
                    <th style={TH}>Termín</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const late = !!r.requiredDate && r.requiredDate.getTime() < now.getTime() && (r.status === 'Přijato' || r.status === 'Zpracovává se');
                    return (
                      <tr key={r.id} style={{ borderTop: `1px solid ${RES.background}` }}>
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                          <a href="#" onClick={(e) => { e.preventDefault(); navigate(RouteName.Service, `detail-${r.number}`); }}>{r.number}</a>
                        </td>
                        <td style={TD}>
                          {siteName(r.siteNumber)}
                          <div style={{ color: RES.gray, fontSize: 12 }}>{deviceName(r.deviceNumber)}</div>
                        </td>
                        <td style={TD}>
                          <strong>{r.title}</strong>
                          {r.description && <div style={{ color: RES.gray, fontSize: 12 }}>{r.description.length > 140 ? `${r.description.slice(0, 140)}…` : r.description}</div>}
                        </td>
                        <td style={TD}>
                          <PriorityBadge priority={r.priority} />
                        </td>
                        <td style={TD}>{r.kind}</td>
                        <td style={TD}>
                          <RequestStatusBadge status={r.status} />
                        </td>
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>{formatDate(r.receivedAt)}</td>
                        <td style={{ ...TD, whiteSpace: 'nowrap', color: late ? '#C4314B' : undefined, fontWeight: late ? 600 : 400 }}>{r.requiredDate ? formatDate(r.requiredDate) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
};
