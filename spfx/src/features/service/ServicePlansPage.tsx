/**
 * Servisní plány — samostatná obrazovka (nabídka Servis → Servisní plány) se záložkami: Roční plány (kalendář činností lokalit a souborů)
 * a Šablony (předvolby ročních plánů podle druhu souboru). Další záložky přibudou podle potřeby.
 */

import * as React from 'react';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Pivot, PivotItem } from '@fluentui/react/lib/Pivot';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { PageHeading } from '../../ui/components/PageHeading';
import { canManageSites, canViewService, canWorkInService, ServiceDevice, ServiceSite } from '../../core/service';
import { PlanTemplatesPanel } from './PlanTemplatesPanel';
import { ServicePlanTab } from './ServicePlanTab';

export const ServicePlansPage: React.FC = () => {
  const { repos, user } = useApp();
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [sites, setSites] = React.useState<ServiceSite[]>([]);
  const [devices, setDevices] = React.useState<ServiceDevice[]>([]);
  const mayView = canViewService(user.roles);

  React.useEffect(() => {
    if (!mayView) {
      setLoaded(true);
      return undefined;
    }
    let cancelled = false;
    Promise.all([repos.service.listSites(), repos.service.listDevices()])
      .then(([s, d]) => {
        if (!cancelled) {
          setSites(s);
          setDevices(d);
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
        <PageHeading title="Servisní plány" />
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          Servisní plány jsou přístupné jen správci servisu, dispečerovi, vedení, čtenáři a administrátorovi.
        </MessageBar>
      </>
    );
  }

  return (
    <>
      <PageHeading title="Servisní plány" subtitle="Roční plány údržby lokalit a souborů a šablony, ze kterých se plány tvoří." />
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {!loaded && <Spinner size={SpinnerSize.large} label="Načítám…" />}
      {loaded && (
        <Pivot aria-label="Servisní plány">
          <PivotItem headerText="Roční plány" itemIcon="Calendar">
            <ServicePlanTab sites={sites} devices={devices} mayManage={canManageSites(user.roles)} mayWork={canWorkInService(user.roles)} onRequestCreated={() => undefined} />
          </PivotItem>
          <PivotItem headerText="Šablony" itemIcon="Library">
            <PlanTemplatesPanel />
          </PivotItem>
        </Pivot>
      )}
    </>
  );
};
