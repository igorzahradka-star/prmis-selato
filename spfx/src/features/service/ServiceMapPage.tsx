/**
 * Mapa servisu — samostatná obrazovka (položka nabídky Servis → Mapa servisu). Stejná mapa jako záložka Mapa na stránce Servis.
 * Akce z karty vybraného bodu (nový požadavek, úprava lokality nebo souboru) otevřou stránku Servis s příslušným dialogem.
 */

import * as React from 'react';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { PageHeading } from '../../ui/components/PageHeading';
import { navigate, RouteName } from '../../ui/router';
import { canManageSites, canViewService, canWorkInService, ServiceDevice, ServiceSite } from '../../core/service';
import { ServiceJob, ServiceRequest } from '../../core/serviceJobs';
import { ServiceMap } from './ServiceMap';

export const ServiceMapPage: React.FC = () => {
  const { repos, user } = useApp();
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [sites, setSites] = React.useState<ServiceSite[]>([]);
  const [devices, setDevices] = React.useState<ServiceDevice[]>([]);
  const [requests, setRequests] = React.useState<ServiceRequest[]>([]);
  const [jobs, setJobs] = React.useState<ServiceJob[]>([]);
  const mayView = canViewService(user.roles);

  React.useEffect(() => {
    if (!mayView) {
      setLoaded(true);
      return undefined;
    }
    let cancelled = false;
    Promise.all([repos.service.listSites(), repos.service.listDevices(), repos.service.listRequests(), repos.service.listJobs()])
      .then(([s, d, r, j]) => {
        if (!cancelled) {
          setSites(s);
          setDevices(d);
          setRequests(r);
          setJobs(j);
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
        <PageHeading title="Mapa servisu" />
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          Mapa servisu je přístupná jen správci servisu, dispečerovi, vedení, čtenáři a administrátorovi.
        </MessageBar>
      </>
    );
  }

  return (
    <>
      <PageHeading title="Mapa servisu" subtitle="Lokality a jejich soubory (FVE, BESS…). Přiblížením se skupiny rozdělí a ukážou se soubory; barva ukazuje stav (zelená v pořádku, oranžová otevřený požadavek nebo končící smlouva, červená servisní list po termínu)." />
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {!loaded && <Spinner size={SpinnerSize.large} label="Načítám mapu servisu…" />}
      {loaded && (
        <ServiceMap
          sites={sites}
          devices={devices}
          requests={requests}
          jobs={jobs}
          mayAdmin={canManageSites(user.roles)}
          mayWork={canWorkInService(user.roles)}
          onNewRequest={(siteNumber) => navigate(RouteName.Service, `pozadavek-${siteNumber}`)}
          onEditSite={(site) => navigate(RouteName.Service, `lokalita-${site.number}`)}
          onEditDevice={(_site, device) => navigate(RouteName.Service, `soubor-${device.number}`)}
        />
      )}
    </>
  );
};
