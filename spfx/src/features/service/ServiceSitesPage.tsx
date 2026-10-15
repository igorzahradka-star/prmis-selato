/**
 * Servis → Lokality: lokality zákazníků a jejich soubory (FVE, BESS…). Zakládání a úpravy (správce servisu, vedení, administrátor), checklist
 * činností, složky, smazání prázdné lokality (vedení a administrátor) a odkaz na servisní projekt souboru (objednávky a faktury).
 */

import * as React from 'react';
import { ActionButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Link } from '@fluentui/react/lib/Link';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { EXTERNAL_LINK_PROPS } from '../../ui/components/ExternalLink';
import { PageHeading } from '../../ui/components/PageHeading';
import { Partner } from '../../core/types';
import { formatDate } from '../../core/format';
import { canDeleteInService, canManageSites, canViewService, contractState, siteDeletionProblem, ServiceDevice, ServiceSite } from '../../core/service';
import { JobStatus, ServiceJob, ServiceRequest } from '../../core/serviceJobs';
import { CommentDialog, DeviceDialog, SiteDialog } from './ServiceDialogs';
import { SiteChecklistPanel } from './SiteChecklistPanel';
import { ContractBadge, TD } from './serviceUi';

export const ServiceSitesPage: React.FC = () => {
  const { repos, user } = useApp();
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [notice, setNotice] = React.useState<string | undefined>(undefined);
  const [sites, setSites] = React.useState<ServiceSite[]>([]);
  const [devices, setDevices] = React.useState<ServiceDevice[]>([]);
  const [requests, setRequests] = React.useState<ServiceRequest[]>([]);
  const [jobs, setJobs] = React.useState<ServiceJob[]>([]);
  const [partners, setPartners] = React.useState<Partner[]>([]);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [siteDlg, setSiteDlg] = React.useState<{ site?: ServiceSite } | undefined>(undefined);
  const [checklistSite, setChecklistSite] = React.useState<ServiceSite | undefined>(undefined);
  const [deviceDlg, setDeviceDlg] = React.useState<{ site: ServiceSite; device?: ServiceDevice } | undefined>(undefined);
  const [deleteSiteDlg, setDeleteSiteDlg] = React.useState<ServiceSite | undefined>(undefined);

  const mayView = canViewService(user.roles);
  const mayAdmin = canManageSites(user.roles);
  const mayDelete = canDeleteInService(user.roles);

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

  if (!mayView) {
    return (
      <>
        <PageHeading title="Lokality" />
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          Servis je přístupný jen správci servisu, dispečerovi, vedení, čtenáři a administrátorovi.
        </MessageBar>
      </>
    );
  }
  if (!loaded) {
    return <Spinner size={SpinnerSize.large} label="Načítám lokality…" />;
  }

  return (
    <>
      <PageHeading title="Lokality" subtitle="Lokality zákazníků a jejich soubory (FVE, BESS…): zakládání, úpravy, checklist činností a složky." />
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
                        <Link href={s.folderUrl} {...EXTERNAL_LINK_PROPS}>
                          Složka lokality
                        </Link>
                      )}
                      {mayAdmin && !s.folderUrl && <ActionButton text="Založit složky" iconProps={{ iconName: 'NewFolder' }} title="Založí složku lokality a její podsložky v 02_SERVIS (existující se nepřepisují)" onClick={() => createFolders(s.number)} styles={{ root: { height: 28 } }} />}
                      <ActionButton text="Checklist" iconProps={{ iconName: 'CheckList' }} title="Příznaky lokality, moduly a činnosti z katalogu O&M (podklad servisní smlouvy)" onClick={() => setChecklistSite(s)} styles={{ root: { height: 28 } }} />
                      {mayAdmin && <ActionButton text="Upravit" onClick={() => setSiteDlg({ site: s })} styles={{ root: { height: 28 } }} />}
                      {mayDelete && siteDeletionProblem(s.number, devices, requests, jobs) === '' && <ActionButton text="Smazat" iconProps={{ iconName: 'Delete' }} title="Smazat prázdnou lokalitu (bez souborů, požadavků a listů)" onClick={() => setDeleteSiteDlg(s)} styles={{ root: { height: 28 } }} />}
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
                                    <Link href={d.folderUrl} {...EXTERNAL_LINK_PROPS}>
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
                                    <Link href={d.contractUrl} {...EXTERNAL_LINK_PROPS}>
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
      {checklistSite && <SiteChecklistPanel site={checklistSite} devices={devices} mayEdit={canManageSites(user.roles)} save={(c) => repos.service.saveSiteChecklist(checklistSite.number, c, user)} onSaved={() => { setChecklistSite(undefined); setNotice('Checklist lokality je uložený.'); reload(); }} onClose={() => setChecklistSite(undefined)} />}
      {siteDlg && <SiteDialog site={siteDlg.site} sites={sites} partners={partners} save={(input) => repos.service.saveSite(input, user)} onSaved={() => { setSiteDlg(undefined); setNotice('Lokalita je uložená.'); reload(); }} onClose={() => setSiteDlg(undefined)} />}
      {deviceDlg && <DeviceDialog site={deviceDlg.site} device={deviceDlg.device} devices={devices} save={(input) => repos.service.saveDevice(input, user)} onSaved={() => { setDeviceDlg(undefined); setNotice('Soubor je uložený.'); reload(); }} onClose={() => setDeviceDlg(undefined)} />}
    </>
  );
};
