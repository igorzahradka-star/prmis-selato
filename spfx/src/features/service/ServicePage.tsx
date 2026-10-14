/**
 * Modul Servis: požadavky, servisní listy a lokality se soubory. Vidí a obsluhuje ho jen Správce servisu, Dispečer a administrátor
 * (vedení jen čte). Servisní zakázky (soubory) se v přehledu projektů neukazují — žijí tady.
 */

import * as React from 'react';
import { ActionButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { Link } from '@fluentui/react/lib/Link';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Pivot, PivotItem } from '@fluentui/react/lib/Pivot';
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { buildHash, RouteName } from '../../ui/router';
import { PageHeading } from '../../ui/components/PageHeading';
import { Partner } from '../../core/types';
import { formatDate } from '../../core/format';
import { canAdministerService, canViewService, canWorkInService, contractState, requestDeletionProblem, siteDeletionProblem, ServiceDevice, ServiceSite } from '../../core/service';
import { JobStatus, RequestStatus, ServiceJob, ServiceRequest, isJobOverdue } from '../../core/serviceJobs';
import { CommentDialog, DeviceDialog, JobDialog, RequestDialog, SiteDialog } from './ServiceDialogs';
import { notifyServiceManagers, serviceLink } from './serviceNotify';
import { serviceRequestMail } from '../../core/notifications';
import { JobPanel } from './JobPanel';
import { ServiceMap } from './ServiceMap';
import { ContractBadge, JobKindBadge, JobStatusBadge, PriorityBadge, RequestStatusBadge, SlaIndicator, TD, TH } from './serviceUi';
import { isSlaBreached, slaProgress } from '../../core/serviceSla';

type JobFilter = 'open' | 'all' | JobStatus;
type RequestFilter = 'open' | 'all' | RequestStatus;

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const Tile: React.FC<{ label: string; value: number; hint: string; warn?: boolean }> = ({ label, value, hint, warn }) => (
  <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderLeft: `4px solid ${warn ? RES.amber : RES.grayBlue}`, borderRadius: 4, padding: '6px 12px', minWidth: 130, flex: '1 1 150px' }} title={hint}>
    <div style={{ fontSize: 12, color: RES.gray }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 600, color: warn ? RES.amber : RES.navy }}>{value}</div>
  </div>
);

/**
 * `param` přichází z Mapy servisu: `pozadavek-<lokalita>` otevře nový požadavek, `lokalita-<číslo>` a `soubor-<číslo>` úpravu.
 */
export const ServicePage: React.FC<{ param?: string }> = ({ param }) => {
  const { repos, user, settings } = useApp();
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [notice, setNotice] = React.useState<string | undefined>(undefined);
  const [sites, setSites] = React.useState<ServiceSite[]>([]);
  const [devices, setDevices] = React.useState<ServiceDevice[]>([]);
  const [requests, setRequests] = React.useState<ServiceRequest[]>([]);
  const [jobs, setJobs] = React.useState<ServiceJob[]>([]);
  const [partners, setPartners] = React.useState<Partner[]>([]);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [requestFilter, setRequestFilter] = React.useState<RequestFilter>('open');
  const [jobFilter, setJobFilter] = React.useState<JobFilter>('open');
  const [search, setSearch] = React.useState('');

  const [siteDlg, setSiteDlg] = React.useState<{ site?: ServiceSite } | undefined>(undefined);
  const [deviceDlg, setDeviceDlg] = React.useState<{ site: ServiceSite; device?: ServiceDevice } | undefined>(undefined);
  const [requestDlg, setRequestDlg] = React.useState<{ request?: ServiceRequest; siteNumber?: string } | undefined>(undefined);
  const [jobDlg, setJobDlg] = React.useState<{ request?: ServiceRequest } | undefined>(undefined);
  const [rejectDlg, setRejectDlg] = React.useState<ServiceRequest | undefined>(undefined);
  const [deleteSiteDlg, setDeleteSiteDlg] = React.useState<ServiceSite | undefined>(undefined);
  const [deleteRequestDlg, setDeleteRequestDlg] = React.useState<ServiceRequest | undefined>(undefined);
  const [openJobId, setOpenJobId] = React.useState<number | undefined>(undefined);

  const mayView = canViewService(user.roles);
  const mayWork = canWorkInService(user.roles);
  const mayAdmin = canAdministerService(user.roles);

  React.useEffect(() => {
    if (!mayView) {
      setLoaded(true);
      return undefined;
    }
    let cancelled = false;
    Promise.all([repos.service.listSites(), repos.service.listDevices(), repos.service.listRequests(), repos.service.listJobs(), repos.partners.list({}).catch((): Partner[] => [])])
      .then(([s, d, r, j, p]) => {
        if (!cancelled) {
          setSites(s);
          setDevices(d);
          setRequests(r);
          setJobs(j);
          setPartners(p);
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
  }, [repos, mayView, reloadKey]);

  const reload = (): void => setReloadKey((k) => k + 1);
  const createFolders = (siteNumber: string, deviceNumber?: string): void => {
    repos.service
      .ensureFolders(siteNumber, deviceNumber, user)
      .then((url) => {
        setNotice(url ? 'Složky jsou založené.' : 'Nejdřív vyplňte knihovnu pro složky v Nastavení → Složky projektů.');
        reload();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };

  // Akce vyvolaná z Mapy servisu — provede se jednou po načtení dat a pak se vyčistí adresa.
  React.useEffect(() => {
    if (!loaded || !param || !canViewService(user.roles)) {
      return;
    }
    const [what, number] = [param.slice(0, param.indexOf('-')), param.slice(param.indexOf('-') + 1)];
    if (what === 'pozadavek' && canWorkInService(user.roles)) {
      setRequestDlg({ siteNumber: number });
    } else if (what === 'lokalita' && canAdministerService(user.roles)) {
      const site = sites.filter((s) => s.number === number)[0];
      if (site) {
        setSiteDlg({ site });
      }
    } else if (what === 'soubor' && canAdministerService(user.roles)) {
      const device = devices.filter((d) => d.number === number)[0];
      const site = device ? sites.filter((s) => s.number === device.siteNumber)[0] : undefined;
      if (device && site) {
        setDeviceDlg({ site, device });
      }
    }
    window.location.hash = buildHash(RouteName.Service);
  }, [loaded, param]);
  const siteName = (n: string): string => {
    const s = sites.filter((x) => x.number === n)[0];
    return s ? `${s.number} ${s.name}` : n;
  };
  const deviceName = (n: string | undefined): string => {
    if (!n) {
      return 'celá lokalita';
    }
    const d = devices.filter((x) => x.number === n)[0];
    return d ? `${d.number} ${d.name}` : sites.some((s) => s.number === n) ? 'celá lokalita' : n;
  };
  const matches = (...parts: (string | undefined)[]): boolean => search.trim() === '' || norm(parts.filter((p) => !!p).join(' ')).indexOf(norm(search.trim())) !== -1;

  if (!mayView) {
    return (
      <>
        <PageHeading title="Servis" />
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          Servis je přístupný jen správci servisu, dispečerovi, vedení a administrátorovi.
        </MessageBar>
      </>
    );
  }
  if (!loaded) {
    return <Spinner size={SpinnerSize.large} label="Načítám Servis…" />;
  }

  const shownRequests = requests.filter((r) => (requestFilter === 'all' ? true : requestFilter === 'open' ? r.status === RequestStatus.Prijato || r.status === RequestStatus.Zpracovava : r.status === requestFilter)).filter((r) => matches(r.number, r.title, r.description, siteName(r.siteNumber), deviceName(r.deviceNumber), r.reportedBy));
  const shownJobs = jobs
    .filter((j) => (jobFilter === 'all' ? true : jobFilter === 'open' ? j.status !== JobStatus.Uzavreno && j.status !== JobStatus.Zruseno : j.status === jobFilter))
    .filter((j) => matches(j.number, j.title, j.supplierName, siteName(j.siteNumber), deviceName(j.deviceNumber), j.orderNumber, j.invoiceNumber));
  const openJob = openJobId ? jobs.filter((j) => j.id === openJobId)[0] : undefined;
  const jobsOfRequest = (id: number): ServiceJob[] => jobs.filter((j) => j.requestId === id);

  // Co čeká na pozornost — přehled nahoře.
  const waitingRequests = requests.filter((r) => r.status === RequestStatus.Prijato).length;
  const overdueJobs = jobs.filter((j) => isJobOverdue(j)).length;
  const toCheck = jobs.filter((j) => j.status === JobStatus.Provedeno).length;
  const toInvoice = jobs.filter((j) => j.status === JobStatus.KFakturaci).length;
  const slaBreached = requests.filter((r) => (r.status === RequestStatus.Prijato || r.status === RequestStatus.Zpracovava) && isSlaBreached(slaProgress(r, jobs, settings.service.slaRules))).length;
  const contractsEnding = devices.filter((d) => d.isActive && (contractState(d) === 'konci' || contractState(d) === 'vyprsela')).length;

  return (
    <>
      <PageHeading title="Servis" subtitle="Lokality a soubory, servisní požadavky a servisní listy. Objednávky a faktury se vedou na servisních projektech souborů." />
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>
          {error}
        </MessageBar>
      )}
      {notice && (
        <MessageBar messageBarType={MessageBarType.success} isMultiline onDismiss={() => setNotice(undefined)}>
          {notice}
        </MessageBar>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '0 0 10px' }}>
        <Tile label="Nové požadavky" value={waitingRequests} hint="požadavky ve stavu Přijato, ke kterým ještě není servisní list" warn={waitingRequests > 0} />
        <Tile label="Po termínu" value={overdueJobs} hint="servisní listy naplánované nebo objednané, jejichž termín už minul" warn={overdueJobs > 0} />
        <Tile label="Ke kontrole" value={toCheck} hint="provedené servisní listy, které čekají na kontrolu správcem" warn={toCheck > 0} />
        <Tile label="K fakturaci" value={toInvoice} hint="zkontrolované listy, ke kterým se má založit podklad pro fakturaci" />
        <Tile label="SLA po lhůtě" value={slaBreached} hint="otevřené požadavky, u kterých už uplynula lhůta reakce nebo vyřešení (jen indikace, bez sankcí; lhůty jsou v Nastavení → Servis)" warn={slaBreached > 0} />
        <Tile label="Smlouvy končí / vypršely" value={contractsEnding} hint="soubory, jejichž smlouva končí do 60 dnů nebo už vypršela" warn={contractsEnding > 0} />
      </div>
      {!mayWork && (
        <MessageBar messageBarType={MessageBarType.info} isMultiline>
          Servis máte jen ke čtení.
        </MessageBar>
      )}
      <Pivot aria-label="Servis" styles={{ root: { marginBottom: 8 } }}>
        <PivotItem headerText={`Požadavky (${requests.filter((r) => r.status === RequestStatus.Prijato || r.status === RequestStatus.Zpracovava).length})`} itemIcon="Inbox">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', margin: '12px 0 8px' }}>
            <Dropdown label="Stav" selectedKey={requestFilter} options={[{ key: 'open', text: 'Otevřené' }, { key: 'all', text: 'Všechny' }, ...[RequestStatus.Prijato, RequestStatus.Zpracovava, RequestStatus.Vyreseno, RequestStatus.Zamitnuto].map((s) => ({ key: s, text: s }))]} onChange={(_, o) => o && setRequestFilter(o.key as RequestFilter)} styles={{ root: { width: 170 } }} />
            <SearchBox placeholder="Hledat číslo, popis, lokalitu…" value={search} onChange={(_, v) => setSearch(v ?? '')} onClear={() => setSearch('')} styles={{ root: { width: 280 } }} />
            <span style={{ flex: '1 1 auto' }} />
            {mayWork && <PrimaryButton iconProps={{ iconName: 'Add' }} text="Nový požadavek" disabled={sites.length === 0} onClick={() => setRequestDlg({})} title={sites.length === 0 ? 'Nejdřív založte lokalitu' : undefined} />}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: RES.white, border: `1px solid ${RES.grayBlue}` }}>
            <thead>
              <tr>
                <th style={TH}>Číslo</th>
                <th style={TH}>Přijato</th>
                <th style={TH}>Lokalita / soubor</th>
                <th style={TH}>Požadavek</th>
                <th style={TH}>Priorita</th>
                <th style={TH}>Stav</th>
                <th style={TH} title="Čas reakce a vyřešení podle lhůt v Nastavení → Servis (jen indikace)">SLA</th>
                <th style={TH}>Servisní listy</th>
                <th style={TH} />
              </tr>
            </thead>
            <tbody>
              {shownRequests.map((r) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${RES.background}` }}>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                    <strong>{r.number}</strong>
                  </td>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>{formatDate(r.receivedAt)}</td>
                  <td style={TD}>
                    {siteName(r.siteNumber)}
                    <div style={{ color: RES.gray, fontSize: 12 }}>{deviceName(r.deviceNumber)}</div>
                  </td>
                  <td style={{ ...TD, maxWidth: 380 }}>
                    <strong>{r.title}</strong>
                    {r.description && <div style={{ color: RES.gray, fontSize: 12, whiteSpace: 'pre-wrap' }}>{r.description.length > 160 ? r.description.slice(0, 160) + '…' : r.description}</div>}
                    {r.note && r.status === RequestStatus.Zamitnuto && <div style={{ color: RES.red, fontSize: 12 }}>Zamítnuto: {r.note}</div>}
                  </td>
                  <td style={TD}>
                    <PriorityBadge priority={r.priority} />
                    <div style={{ color: RES.gray, fontSize: 12, marginTop: 2 }}>{r.kind}</div>
                  </td>
                  <td style={TD}>
                    <RequestStatusBadge status={r.status} />
                  </td>
                  <td style={TD}>
                    <SlaIndicator progress={slaProgress(r, jobs, settings.service.slaRules)} />
                  </td>
                  <td style={TD}>
                    {jobsOfRequest(r.id).map((j) => (
                      <div key={j.id}>
                        <Link onClick={() => setOpenJobId(j.id)}>{j.number}</Link> <JobStatusBadge status={j.status} />
                      </div>
                    ))}
                    {jobsOfRequest(r.id).length === 0 && '—'}
                  </td>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                    {mayWork && (r.status === RequestStatus.Prijato || r.status === RequestStatus.Zpracovava) && <ActionButton text="Založit servisní list" iconProps={{ iconName: 'Add' }} onClick={() => setJobDlg({ request: r })} styles={{ root: { height: 28 } }} />}
                    {mayWork && requestDeletionProblem(r.id, jobs) === '' && <ActionButton text="Smazat" iconProps={{ iconName: 'Delete' }} title="Smazat omylem zapsaný požadavek (jen bez servisních listů)" onClick={() => setDeleteRequestDlg(r)} styles={{ root: { height: 28 } }} />}
                    {mayWork && r.status === RequestStatus.Prijato && <ActionButton text="Zamítnout" onClick={() => setRejectDlg(r)} styles={{ root: { height: 28 } }} />}
                    {mayWork && <ActionButton text="Upravit" onClick={() => setRequestDlg({ request: r })} styles={{ root: { height: 28 } }} />}
                  </td>
                </tr>
              ))}
              {shownRequests.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ ...TD, color: RES.gray, padding: 14 }}>
                    {requests.length === 0 ? 'Zatím žádný požadavek.' : 'Filtru neodpovídá žádný požadavek.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </PivotItem>

        <PivotItem headerText={`Servisní listy (${jobs.filter((j) => j.status !== JobStatus.Uzavreno && j.status !== JobStatus.Zruseno).length})`} itemIcon="TaskList">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', margin: '12px 0 8px' }}>
            <Dropdown label="Stav" selectedKey={jobFilter} options={[{ key: 'open', text: 'Otevřené' }, { key: 'all', text: 'Všechny' }, ...Object.keys(JobStatus).map((k) => ({ key: JobStatus[k as keyof typeof JobStatus], text: JobStatus[k as keyof typeof JobStatus] }))]} onChange={(_, o) => o && setJobFilter(o.key as JobFilter)} styles={{ root: { width: 190 } }} />
            <SearchBox placeholder="Hledat číslo, dodavatele, soubor…" value={search} onChange={(_, v) => setSearch(v ?? '')} onClear={() => setSearch('')} styles={{ root: { width: 280 } }} />
            <span style={{ flex: '1 1 auto' }} />
            {mayWork && <PrimaryButton iconProps={{ iconName: 'Add' }} text="Nový servisní list" disabled={devices.length === 0} onClick={() => setJobDlg({})} title={devices.length === 0 ? 'Nejdřív založte soubor' : undefined} />}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: RES.white, border: `1px solid ${RES.grayBlue}` }}>
            <thead>
              <tr>
                <th style={TH}>Číslo</th>
                <th style={TH}>Soubor</th>
                <th style={TH}>Název</th>
                <th style={TH}>Druh</th>
                <th style={TH}>Dodavatel</th>
                <th style={TH}>Termín</th>
                <th style={TH}>Stav</th>
                <th style={TH}>Objednávka</th>
                <th style={TH}>Fakturace</th>
              </tr>
            </thead>
            <tbody>
              {shownJobs.map((j) => (
                <tr key={j.id} style={{ borderTop: `1px solid ${RES.background}`, cursor: 'pointer' }} onClick={() => setOpenJobId(j.id)}>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                    <Link>{j.number}</Link>
                  </td>
                  <td style={TD}>
                    {deviceName(j.deviceNumber)}
                    <div style={{ color: RES.gray, fontSize: 12 }}>{siteName(j.siteNumber)}</div>
                  </td>
                  <td style={TD}>{j.title}</td>
                  <td style={TD}>
                    <JobKindBadge kind={j.jobKind} />
                  </td>
                  <td style={TD}>{j.supplierName || '—'}</td>
                  <td style={{ ...TD, whiteSpace: 'nowrap', color: isJobOverdue(j) ? RES.red : undefined }}>{j.plannedDate ? formatDate(j.plannedDate) : '—'}</td>
                  <td style={TD}>
                    <JobStatusBadge status={j.status} />
                  </td>
                  <td style={TD}>{j.orderNumber || '—'}</td>
                  <td style={TD}>{j.invoiceNumber || '—'}</td>
                </tr>
              ))}
              {shownJobs.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ ...TD, color: RES.gray, padding: 14 }}>
                    {jobs.length === 0 ? 'Zatím žádný servisní list. Zakládá se z požadavku, nebo tlačítkem Nový servisní list.' : 'Filtru neodpovídá žádný servisní list.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </PivotItem>

        <PivotItem headerText={`Lokality a soubory (${sites.length})`} itemIcon="MapPin">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', margin: '12px 0 8px' }}>
            <span style={{ fontSize: 13, color: RES.gray }}>Lokalita je místo zákazníka (číslo po desítkách), soubor pod ní (FVE, BESS…) má vlastní číslo, smlouvu a fakturaci.</span>
            <span style={{ flex: '1 1 auto' }} />
            {mayAdmin && <PrimaryButton iconProps={{ iconName: 'Add' }} text="Nová lokalita" onClick={() => setSiteDlg({})} />}
          </div>
          {sites.map((s) => {
            const siteDevices = devices.filter((d) => d.siteNumber === s.number);
            return (
              <div key={s.id} style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', background: RES.bluePale }}>
                  <strong style={{ fontSize: 15 }}>
                    {s.number} {s.name}
                  </strong>
                  {!s.isActive && <span style={{ color: RES.gray }}>(neaktivní)</span>}
                  <span style={{ color: RES.gray, fontSize: 13 }}>{[s.customerName, s.address].filter((x) => !!x).join(' · ')}</span>
                  <span style={{ flex: '1 1 auto' }} />
                  {s.folderUrl && (
                    <Link href={s.folderUrl} target="_blank">
                      Složka lokality
                    </Link>
                  )}
                  {mayAdmin && !s.folderUrl && <ActionButton text="Založit složky" iconProps={{ iconName: 'NewFolder' }} title="Založí složku lokality a její podsložky v 02_SERVIS (existující se nepřepisují)" onClick={() => createFolders(s.number)} styles={{ root: { height: 28 } }} />}
                  {mayAdmin && <ActionButton text="Upravit" onClick={() => setSiteDlg({ site: s })} styles={{ root: { height: 28 } }} />}
                  {mayAdmin && siteDeletionProblem(s.number, devices, requests, jobs) === '' && <ActionButton text="Smazat" iconProps={{ iconName: 'Delete' }} title="Smazat prázdnou lokalitu (bez souborů, požadavků a listů)" onClick={() => setDeleteSiteDlg(s)} styles={{ root: { height: 28 } }} />}
                  {mayAdmin && <ActionButton text="Přidat soubor" iconProps={{ iconName: 'Add' }} onClick={() => setDeviceDlg({ site: s })} styles={{ root: { height: 28 } }} />}
                </div>
                {s.contact && <div style={{ padding: '4px 12px', fontSize: 12, color: RES.gray, whiteSpace: 'pre-wrap' }}>Kontakt: {s.contact}</div>}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {siteDevices.map((d) => {
                      const openCount = jobs.filter((j) => j.deviceNumber === d.number && j.status !== JobStatus.Uzavreno && j.status !== JobStatus.Zruseno).length;
                      return (
                        <tr key={d.id} style={{ borderTop: `1px solid ${RES.background}` }}>
                          <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                            <strong>{d.number}</strong>
                          </td>
                          <td style={TD}>
                            {d.name} <span style={{ color: RES.gray }}>· {d.kind}</span>
                            {!d.isActive && <span style={{ color: RES.gray }}> (neaktivní)</span>}
                          </td>
                          <td style={TD}>
                            <ContractBadge state={contractState(d)} />
                            <div style={{ color: RES.gray, fontSize: 12 }}>
                              {d.contractFrom || d.contractTo ? `${d.contractFrom ? formatDate(d.contractFrom) : '…'} – ${d.contractTo ? formatDate(d.contractTo) : '…'}` : ''}
                              {d.contractNote ? ` ${d.contractNote}` : ''}
                            </div>
                          </td>
                          <td style={TD}>{openCount > 0 ? `${openCount} otevřených listů` : ''}</td>
                          <td style={{ ...TD, whiteSpace: 'nowrap', textAlign: 'right' }}>
                            <Link href={`#/projekt/${d.number}`}>Servisní projekt</Link>
                            {d.folderUrl && (
                              <>
                                {' · '}
                                <Link href={d.folderUrl} target="_blank">
                                  Složka
                                </Link>
                              </>
                            )}
                            {mayAdmin && !d.folderUrl && (
                              <>
                                {' · '}
                                <Link onClick={() => createFolders(s.number, d.number)}>Založit složky</Link>
                              </>
                            )}
                            {d.contractUrl && (
                              <>
                                {' · '}
                                <Link href={d.contractUrl} target="_blank">
                                  Smlouva
                                </Link>
                              </>
                            )}
                            {mayAdmin && <ActionButton text="Upravit" onClick={() => setDeviceDlg({ site: s, device: d })} styles={{ root: { height: 28 } }} />}
                          </td>
                        </tr>
                      );
                    })}
                    {siteDevices.length === 0 && (
                      <tr>
                        <td style={{ ...TD, color: RES.gray }}>Lokalita zatím nemá soubory.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}
          {sites.length === 0 && <MessageBar messageBarType={MessageBarType.info}>Zatím není žádná lokalita. {mayAdmin ? 'Založte první tlačítkem Nová lokalita (např. 10500).' : 'Lokality zakládá správce servisu.'}</MessageBar>}
        </PivotItem>

        <PivotItem headerText="Mapa" itemIcon="Globe">
          <ServiceMap
            sites={sites}
            devices={devices}
            requests={requests}
            jobs={jobs}
            mayAdmin={mayAdmin}
            mayWork={mayWork}
            onNewRequest={(siteNumber) => setRequestDlg({ siteNumber })}
            onEditSite={(site) => setSiteDlg({ site })}
            onEditDevice={(site, device) => setDeviceDlg({ site, device })}
          />
        </PivotItem>
      </Pivot>

      {deleteRequestDlg && (
        <CommentDialog
          title={`Smazat požadavek ${deleteRequestDlg.number}?`}
          subText={`„${deleteRequestDlg.title}“ — požadavek nemá žádný servisní list. Smaže se do koše webu. Pokud je jen nepotřebný, můžete ho místo toho zamítnout.`}
          label="Poznámka (nepovinná)"
          required={false}
          confirm="Smazat požadavek"
          onConfirm={() => repos.service.deleteRequest(deleteRequestDlg.id, user)}
          onSaved={() => {
            setDeleteRequestDlg(undefined);
            setNotice('Požadavek je smazaný.');
            reload();
          }}
          onClose={() => setDeleteRequestDlg(undefined)}
        />
      )}
      {deleteSiteDlg && (
        <CommentDialog
          title={`Smazat lokalitu ${deleteSiteDlg.number} ${deleteSiteDlg.name}?`}
          subText="Lokalita je prázdná (bez souborů, požadavků a servisních listů). Smaže se do koše webu; složky v knihovně dokumentů zůstanou, smažte je případně ručně."
          label="Poznámka (nepovinná)"
          required={false}
          confirm="Smazat lokalitu"
          onConfirm={() => repos.service.deleteSite(deleteSiteDlg.number, user)}
          onSaved={() => {
            setDeleteSiteDlg(undefined);
            setNotice('Lokalita je smazaná.');
            reload();
          }}
          onClose={() => setDeleteSiteDlg(undefined)}
        />
      )}
      {siteDlg && <SiteDialog site={siteDlg.site} sites={sites} partners={partners} save={(input) => repos.service.saveSite(input, user)} onSaved={() => { setSiteDlg(undefined); setNotice('Lokalita je uložená.'); reload(); }} onClose={() => setSiteDlg(undefined)} />}
      {deviceDlg && <DeviceDialog site={deviceDlg.site} device={deviceDlg.device} devices={devices} save={(input) => repos.service.saveDevice(input, user)} onSaved={() => { setDeviceDlg(undefined); setNotice('Soubor je uložený.'); reload(); }} onClose={() => setDeviceDlg(undefined)} />}
      {requestDlg && <RequestDialog request={requestDlg.request} defaultSite={requestDlg.siteNumber} sites={sites} devices={devices} save={async (input) => {
        const saved = await repos.service.saveRequest(input, user);
        if (!input.id) {
          const site = sites.filter((s) => s.number === saved.siteNumber)[0];
          const device = devices.filter((d) => d.number === saved.deviceNumber)[0];
          const note = await notifyServiceManagers(repos, settings, user, serviceRequestMail({ number: saved.number, title: saved.title, siteName: site ? `${site.number} ${site.name}` : saved.siteNumber, deviceName: device ? `${device.number} ${device.name}` : undefined, priority: saved.priority, description: saved.description, receivedBy: user.displayName, link: serviceLink(), companyName: settings.company.name }));
          setNotice(`Požadavek ${saved.number} je zapsaný.${note}`);
        } else {
          setNotice('Požadavek je uložený.');
        }
        return saved;
      }} onSaved={() => { setRequestDlg(undefined); reload(); }} onClose={() => setRequestDlg(undefined)} />}
      {jobDlg && <JobDialog request={jobDlg.request} sites={sites} devices={devices} partners={partners} save={(input) => repos.service.createJob(input, user)} onSaved={() => { setJobDlg(undefined); setNotice('Servisní list je založený.'); reload(); }} onClose={() => setJobDlg(undefined)} />}
      {rejectDlg && <CommentDialog title={`Zamítnout požadavek ${rejectDlg.number}`} label="Důvod zamítnutí" required confirm="Zamítnout" onConfirm={(text) => repos.service.rejectRequest(rejectDlg.id, text, user)} onSaved={() => { setRejectDlg(undefined); reload(); }} onClose={() => setRejectDlg(undefined)} />}
      {openJob && <JobPanel job={openJob} sites={sites} devices={devices} partners={partners} allJobs={jobs} onClose={() => setOpenJobId(undefined)} onChanged={reload} />}
    </>
  );
};
