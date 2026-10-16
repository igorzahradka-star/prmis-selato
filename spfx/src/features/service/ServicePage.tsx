/**
 * Modul Servis: požadavky a servisní listy. Lokality se soubory jsou v nabídce Servis → Lokality (`ServiceSitesPage`), mapa v Servis → Mapa servisu.
 * Vidí a obsluhuje ho jen Správce servisu, Dispečer a administrátor (vedení jen čte).
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
import { canDeleteAnyInService, canDeleteInService, EMPTY_SCOPE, matchesScope, ServiceScope, canViewService, canWorkInService, contractState, jobDeletionProblem, requestDeletionProblem, ServiceDevice, ServiceSite } from '../../core/service';
import { JobStatus, RequestStatus, ServiceJob, ServiceRequest, isJobOverdue } from '../../core/serviceJobs';
import { CommentDialog, JobDialog, RequestDialog } from './ServiceDialogs';
import { notifyServiceManagers, serviceLink } from './serviceNotify';
import { serviceRequestMail } from '../../core/notifications';
import { JobPanel } from './JobPanel';
import { RequestPanel } from './RequestPanel';
import { Clamp, CoverageLabel, RequestTip, JobKindBadge, JobStatusBadge, PriorityBadge, RequestStatusBadge, ScopeFilters, SlaIndicator, TD, TH } from './serviceUi';
import { isSlaBreached, slaProgress } from '../../core/serviceSla';
import { ContractCoverage, ServiceContract, ServiceContractVersion, contractCoverage } from '../../core/serviceContract';

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
 * `param`: `pozadavek-<lokalita>` otevře nový požadavek, `detail-<číslo požadavku>` jeho detail (odkazy z Kalendáře a Přehledu požadavků).
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
  const [contracts, setContracts] = React.useState<ServiceContract[]>([]);
  const [contractVersions, setContractVersions] = React.useState<ServiceContractVersion[]>([]);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [requestFilter, setRequestFilter] = React.useState<RequestFilter>('open');
  const [jobFilter, setJobFilter] = React.useState<JobFilter>('open');
  const [search, setSearch] = React.useState('');

  const [requestDlg, setRequestDlg] = React.useState<{ request?: ServiceRequest; siteNumber?: string } | undefined>(undefined);
  const [jobDlg, setJobDlg] = React.useState<{ request?: ServiceRequest } | undefined>(undefined);
  const [rejectDlg, setRejectDlg] = React.useState<ServiceRequest | undefined>(undefined);
  const [resolveDlg, setResolveDlg] = React.useState<ServiceRequest | undefined>(undefined);
  const [deleteRequestDlg, setDeleteRequestDlg] = React.useState<ServiceRequest | undefined>(undefined);
  const [deleteJobDlg, setDeleteJobDlg] = React.useState<ServiceJob | undefined>(undefined);
  const [openRequestId, setOpenRequestId] = React.useState<number | undefined>(undefined);
  const [openJobId, setOpenJobId] = React.useState<number | undefined>(undefined);

  const mayView = canViewService(user.roles);
  const mayWork = canWorkInService(user.roles);
  const mayDelete = canDeleteInService(user.roles);
  const isAdminUser = canDeleteAnyInService(user.roles);
  const [reqScope, setReqScope] = React.useState<ServiceScope>(EMPTY_SCOPE);
  const [jobScope, setJobScope] = React.useState<ServiceScope>(EMPTY_SCOPE);

  React.useEffect(() => {
    if (!mayView) {
      setLoaded(true);
      return undefined;
    }
    let cancelled = false;
    Promise.all([repos.service.listSites(), repos.service.listDevices(), repos.service.listRequests(), repos.service.listJobs(), repos.partners.list({}).catch((): Partner[] => []), repos.service.listContracts().catch((): ServiceContract[] => []), repos.service.listContractVersions().catch((): ServiceContractVersion[] => [])])
      .then(([s, d, r, j, p, c, cv]) => {
        if (!cancelled) {
          setSites(s);
          setDevices(d);
          setRequests(r);
          setJobs(j);
          setPartners(p);
          setContracts(c);
          setContractVersions(cv);
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

  // Akce vyvolaná z Mapy servisu — provede se jednou po načtení dat a pak se vyčistí adresa.
  React.useEffect(() => {
    if (!loaded || !param || !canViewService(user.roles)) {
      return;
    }
    const [what, number] = [param.slice(0, param.indexOf('-')), param.slice(param.indexOf('-') + 1)];
    if (what === 'pozadavek' && canWorkInService(user.roles)) {
      setRequestDlg({ siteNumber: number });
    } else if (what === 'detail') {
      const found = requests.filter((r) => r.number === number)[0];
      if (found) {
        setOpenRequestId(found.id);
      }
    }
    window.location.hash = buildHash(RouteName.Service);
  }, [loaded, param]);
  const coverageOf = (siteNumber: string, deviceNumber?: string): ContractCoverage => contractCoverage(siteNumber, deviceNumber, contracts, contractVersions);
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

  const shownRequests = requests.filter((r) => (requestFilter === 'all' ? true : requestFilter === 'open' ? r.status === RequestStatus.Prijato || r.status === RequestStatus.Zpracovava : r.status === requestFilter)).filter((r) => matches(r.number, r.title, r.description, siteName(r.siteNumber), deviceName(r.deviceNumber), r.reportedBy))
    .filter((r) => matchesScope(reqScope, r));
  const shownJobs = jobs
    .filter((j) => (jobFilter === 'all' ? true : jobFilter === 'open' ? j.status !== JobStatus.Uzavreno && j.status !== JobStatus.Zruseno : j.status === jobFilter))
    .filter((j) => matches(j.number, j.title, j.supplierName, siteName(j.siteNumber), deviceName(j.deviceNumber), j.orderNumber, j.invoiceNumber))
    .filter((j) => matchesScope(jobScope, { siteNumber: j.siteNumber, deviceNumber: j.deviceNumber, priority: (requests.filter((q) => q.id === j.requestId)[0] || { priority: undefined }).priority }));
  const openRequest = openRequestId ? requests.filter((x) => x.id === openRequestId)[0] : undefined;
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
      <PageHeading title="Servis" subtitle="Servisní požadavky a servisní listy. Lokality a soubory jsou v nabídce Servis → Lokality; objednávky a faktury se vedou na servisních projektech souborů." />
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
            <ScopeFilters sites={sites} devices={devices} value={reqScope} onChange={setReqScope} />
            <SearchBox placeholder="Hledat číslo, popis, lokalitu…" value={search} onChange={(_, v) => setSearch(v ?? '')} onClear={() => setSearch('')} styles={{ root: { width: 280 } }} />
            <span style={{ flex: '1 1 auto' }} />
            {mayWork && <PrimaryButton iconProps={{ iconName: 'Add' }} text="Nový požadavek" disabled={sites.length === 0} onClick={() => setRequestDlg({})} title={sites.length === 0 ? 'Nejdřív založte lokalitu' : undefined} />}
          </div>
          <div style={{ overflowX: 'auto' }}>
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
                <tr key={r.id} style={{ borderTop: `1px solid ${RES.background}`, cursor: 'pointer' }} onClick={() => setOpenRequestId(r.id)}>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                    <Link>{r.number}</Link>
                  </td>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>{formatDate(r.receivedAt)}</td>
                  <td style={TD}>
                    <Clamp width={170}>{siteName(r.siteNumber)}</Clamp>
                    <Clamp width={170} style={{ color: RES.gray, fontSize: 12 }}>
                      {deviceName(r.deviceNumber)}
                    </Clamp>
                    <CoverageLabel coverage={coverageOf(r.siteNumber, r.deviceNumber)} />
                  </td>
                  <td style={TD}>
                    <Clamp width={340} tip={<RequestTip request={r} place={`${siteName(r.siteNumber)} · ${deviceName(r.deviceNumber)}`} />}>
                      <strong>{r.title}</strong>
                    </Clamp>
                    {r.description && (
                      <Clamp width={340} style={{ color: RES.gray, fontSize: 12 }}>
                        {r.description.replace(/\s+/g, ' ')}
                      </Clamp>
                    )}
                    {r.note && r.status === RequestStatus.Zamitnuto && (
                      <Clamp width={340} style={{ color: RES.red, fontSize: 12 }}>
                        Zamítnuto: {r.note}
                      </Clamp>
                    )}
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
                  <td style={TD} onClick={(e) => e.stopPropagation()}>
                    {jobsOfRequest(r.id).map((j) => (
                      <div key={j.id}>
                        <Link onClick={() => setOpenJobId(j.id)}>{j.number}</Link> <JobStatusBadge status={j.status} />
                      </div>
                    ))}
                    {jobsOfRequest(r.id).length === 0 && '—'}
                  </td>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    {mayWork && (r.status === RequestStatus.Prijato || r.status === RequestStatus.Zpracovava) && <ActionButton text="Založit servisní list" iconProps={{ iconName: 'Add' }} onClick={() => setJobDlg({ request: r })} styles={{ root: { height: 28 } }} />}
                    {mayDelete && requestDeletionProblem(r.id, jobs, isAdminUser) === '' && <ActionButton text="Smazat" iconProps={{ iconName: 'Delete' }} title="Smazat požadavek (i s jeho zrušenými a nezpracovanými listy)" onClick={() => setDeleteRequestDlg(r)} styles={{ root: { height: 28 } }} />}
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
          </div>
        </PivotItem>

        <PivotItem headerText={`Servisní listy (${jobs.filter((j) => j.status !== JobStatus.Uzavreno && j.status !== JobStatus.Zruseno).length})`} itemIcon="TaskList">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', margin: '12px 0 8px' }}>
            <Dropdown label="Stav" selectedKey={jobFilter} options={[{ key: 'open', text: 'Otevřené' }, { key: 'all', text: 'Všechny' }, ...Object.keys(JobStatus).map((k) => ({ key: JobStatus[k as keyof typeof JobStatus], text: JobStatus[k as keyof typeof JobStatus] }))]} onChange={(_, o) => o && setJobFilter(o.key as JobFilter)} styles={{ root: { width: 190 } }} />
            <ScopeFilters sites={sites} devices={devices} value={jobScope} onChange={setJobScope} />
            <SearchBox placeholder="Hledat číslo, dodavatele, soubor…" value={search} onChange={(_, v) => setSearch(v ?? '')} onClear={() => setSearch('')} styles={{ root: { width: 280 } }} />
            <span style={{ flex: '1 1 auto' }} />
            {mayWork && <PrimaryButton iconProps={{ iconName: 'Add' }} text="Nový servisní list" disabled={devices.length === 0} onClick={() => setJobDlg({})} title={devices.length === 0 ? 'Nejdřív založte soubor' : undefined} />}
          </div>
          <div style={{ overflowX: 'auto' }}>
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
                <th style={TH} />
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
                  <td style={TD}>{j.isInternal ? 'Interní servis' : j.supplierName || '—'}</td>
                  <td style={{ ...TD, whiteSpace: 'nowrap', color: isJobOverdue(j) ? RES.red : undefined }}>{j.plannedDate ? formatDate(j.plannedDate) : '—'}</td>
                  <td style={TD}>
                    <JobStatusBadge status={j.status} />
                  </td>
                  <td style={TD}>{j.orderNumber || '—'}</td>
                  <td style={TD}>{j.invoiceNumber || '—'}</td>
                  <td style={TD} onClick={(e) => e.stopPropagation()}>
                    {mayDelete && jobDeletionProblem(j, isAdminUser) === '' && <ActionButton text="Smazat" iconProps={{ iconName: 'Delete' }} title={isAdminUser ? 'Smazat servisní list (administrátor smí v jakémkoli stavu)' : 'Smazat zrušený nebo nezpracovaný servisní list'} onClick={() => setDeleteJobDlg(j)} styles={{ root: { height: 28 } }} />}
                  </td>
                </tr>
              ))}
              {shownJobs.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ ...TD, color: RES.gray, padding: 14 }}>
                    {jobs.length === 0 ? 'Zatím žádný servisní list. Zakládá se z požadavku, nebo tlačítkem Nový servisní list.' : 'Filtru neodpovídá žádný servisní list.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </PivotItem>
      </Pivot>

      {deleteJobDlg && (
        <CommentDialog
          title={`Smazat servisní list ${deleteJobDlg.number}?`}
          subText={isAdminUser && jobDeletionProblem(deleteJobDlg) !== '' ? `Pozor: list je ve stavu „${deleteJobDlg.status}“. Smaže se jen záznam servisního listu (do koše webu); navázaná objednávka ${deleteJobDlg.orderNumber || ''} a podklad faktury ${deleteJobDlg.invoiceNumber || ''} se nemažou, jen se odpojí od listu.` : 'Smazat jde zrušený nebo ještě nezpracovaný list (bez objednávky). Smaže se do koše webu.'}
          label="Poznámka (nepovinná)"
          required={false}
          confirm="Smazat servisní list"
          onConfirm={() => repos.service.deleteJob(deleteJobDlg.id, user)}
          onSaved={() => {
            setDeleteJobDlg(undefined);
            setNotice('Servisní list je smazaný.');
            reload();
          }}
          onClose={() => setDeleteJobDlg(undefined)}
        />
      )}
      {deleteRequestDlg && (
        <CommentDialog
          title={`Smazat požadavek ${deleteRequestDlg.number}?`}
          subText={`„${deleteRequestDlg.title}“ — smaže se do koše webu i se všemi svými servisními listy${isAdminUser && jobsOfRequest(deleteRequestDlg.id).some((j) => jobDeletionProblem(j) !== '') ? ' (včetně objednaných, provedených nebo vyfakturovaných — navázané objednávky a podklady faktur se nemažou, jen se odpojí)' : ' (zrušených nebo nezpracovaných)'}. Pokud je jen nepotřebný, můžete ho místo toho zamítnout.`}
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
      {requestDlg && <RequestDialog request={requestDlg.request} defaultSite={requestDlg.siteNumber} sites={sites} devices={devices} save={async (input, files) => {
        const saved = await repos.service.saveRequest(input, user);
        const failed: string[] = [];
        for (const f of files) {
          try {
            await repos.service.addAttachment({ kind: 'request', id: saved.id }, f, user);
          } catch (e) {
            failed.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (failed.length > 0) {
          setError(`Požadavek je uložený, ale některé přílohy se nenahrály: ${failed.join(' | ')}`);
        }
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
      {jobDlg && <JobDialog request={jobDlg.request} sites={sites} devices={devices} partners={partners} save={async (input, files) => {
        const created = await repos.service.createJob(input, user);
        const failed: string[] = [];
        for (const f of files) {
          try {
            await repos.service.addAttachment({ kind: 'job', id: created.id }, f, user);
          } catch (e) {
            failed.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (failed.length > 0) {
          setError(`Servisní list je založený, ale některé přílohy se nenahrály: ${failed.join(' | ')}`);
        }
        return created;
      }} onSaved={() => { setJobDlg(undefined); setNotice('Servisní list je založený.'); reload(); }} onClose={() => setJobDlg(undefined)} />}
      {resolveDlg && <CommentDialog title={`Uzavřít požadavek ${resolveDlg.number} bez servisního listu`} label="Krátký komentář — co jste udělal" required confirm="Uzavřít požadavek" onConfirm={(text) => repos.service.closeRequest(resolveDlg.id, text, user)} onSaved={() => { setResolveDlg(undefined); setNotice('Požadavek je uzavřený.'); reload(); }} onClose={() => setResolveDlg(undefined)} />}
      {rejectDlg && <CommentDialog title={`Zamítnout požadavek ${rejectDlg.number}`} label="Důvod zamítnutí" required confirm="Zamítnout" onConfirm={(text) => repos.service.rejectRequest(rejectDlg.id, text, user)} onSaved={() => { setRejectDlg(undefined); reload(); }} onClose={() => setRejectDlg(undefined)} />}
      {openRequest && (
        <RequestPanel
          request={openRequest}
          sites={sites}
          devices={devices}
          jobs={jobs}
          rules={settings.service.slaRules}
          coverage={coverageOf(openRequest.siteNumber, openRequest.deviceNumber)}
          mayWork={mayWork}
          mayDelete={mayDelete}
          isAdmin={isAdminUser}
          onClose={() => setOpenRequestId(undefined)}
          onEdit={() => setRequestDlg({ request: openRequest })}
          onReject={() => setRejectDlg(openRequest)}
          onResolve={() => setResolveDlg(openRequest)}
          onReopen={() =>
            repos.service
              .reopenRequest(openRequest.id, user)
              .then(() => {
                setNotice('Požadavek je znovu otevřený.');
                reload();
              })
              .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
          }
          onNewJob={() => setJobDlg({ request: openRequest })}
          onOpenJob={(id) => setOpenJobId(id)}
          onDelete={() => setDeleteRequestDlg(openRequest)}
        />
      )}
      {openJob && <JobPanel job={openJob} sites={sites} devices={devices} partners={partners} allJobs={jobs} onClose={() => setOpenJobId(undefined)} onChanged={reload} />}
    </>
  );
};
