/**
 * Kořen aplikace: načte uživatele a nastavení, pak vykreslí rámec a obrazovku
 * podle adresy v hashi.
 */

import { ProfilePage } from '../../../features/profile/ProfilePage';
import * as React from 'react';
import { ThemeProvider } from '@fluentui/react/lib/Theme';
import { initializeIcons } from '@fluentui/react/lib/Icons';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';

import { resTheme } from '../../../ui/theme';
import { AppContext, AppContextValue } from '../../../ui/AppContext';
import { AppShell } from '../../../ui/layout/AppShell';
import { Route, RouteName, parseHash, subscribeToRoute } from '../../../ui/router';
import { RepositorySet } from '../../../data/repositories';
import { AppSettings } from '../../../core/settings';
import { CurrentUser } from '../../../core/types';

import { DashboardPage } from '../../../features/projects/DashboardPage';
import { ProjectDetailPage } from '../../../features/projects/ProjectDetailPage';
import { PartnersPage } from '../../../features/partners/PartnersPage';
import { ProjectsMapPage } from '../../../features/map/ProjectsMapPage';
import { OrdersPage } from '../../../features/orders/OrdersPage';
import { InvoicesPage } from '../../../features/invoicing/InvoicesPage';
import { DiaryPage } from '../../../features/diary/DiaryPage';
import { PhotosPage } from '../../../features/photos/PhotosPage';
import { WaitingForMePage } from '../../../features/orders/WaitingForMePage';
import { InstallPage } from '../../../features/admin/InstallPage';
import { SettingsPage } from '../../../features/settings/SettingsPage';
import { UsersPage } from '../../../features/admin/UsersPage';
import { HelpPage } from '../../../features/help/HelpPage';
import { ComingSoonPage } from '../../../ui/components/ComingSoonPage';

// Ikony Fluent UI se musí zaregistrovat jednou za načtení stránky.
initializeIcons(undefined, { disableWarnings: true });

export interface IPrmAppProps {
  repos: RepositorySet;
  dataSource: 'sharepoint' | 'mock';
  financeSiteUrl: string;
}

export const PrmApp: React.FC<IPrmAppProps> = ({ repos, dataSource, financeSiteUrl }) => {
  const [user, setUser] = React.useState<CurrentUser | undefined>(undefined);
  const [settings, setSettings] = React.useState<AppSettings | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [route, setRoute] = React.useState<Route>(parseHash(window.location.hash));

  React.useEffect(() => subscribeToRoute(setRoute), []);

  const load = React.useCallback(async (): Promise<void> => {
    // Nastavení musí být první — jsou v něm názvy skupin, podle kterých
    // se určují role uživatele.
    const loaded = await repos.settings.get();
    const currentUser = await repos.users.getCurrentUser(loaded);
    setSettings(loaded);
    setUser(currentUser);
  }, [repos]);

  React.useEffect(() => {
    let cancelled = false;
    load().catch((e: Error) => {
      if (!cancelled) {
        setError(e.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const reloadSettings = React.useCallback(async (): Promise<void> => {
    const loaded = await repos.settings.get();
    setSettings(loaded);
  }, [repos]);

  if (error) {
    return (
      <ThemeProvider theme={resTheme}>
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          <strong>Aplikaci se nepodařilo spustit.</strong>
          <br />
          {error}
        </MessageBar>
      </ThemeProvider>
    );
  }

  if (!user || !settings) {
    return (
      <ThemeProvider theme={resTheme}>
        <div style={{ padding: 40 }}>
          <Spinner size={SpinnerSize.large} label="Spouštím PRM Revoltum…" />
        </div>
      </ThemeProvider>
    );
  }

  const value: AppContextValue = {
    user,
    settings,
    repos,
    dataSource,
    financeSiteUrl,
    reloadSettings
  };

  return (
    <ThemeProvider theme={resTheme}>
      <AppContext.Provider value={value}>
        <AppShell route={route}>{renderRoute(route)}</AppShell>
      </AppContext.Provider>
    </ThemeProvider>
  );
};

function renderRoute(route: Route): React.ReactNode {
  switch (route.name) {
    case RouteName.Dashboard:
      return <DashboardPage />;
    case RouteName.ProjectDetail:
      return <ProjectDetailPage projectNumber={route.param} />;
    case RouteName.Partners:
      return <PartnersPage />;
    case RouteName.Map:
      return <ProjectsMapPage />;
    case RouteName.Install:
      return <InstallPage />;
    case RouteName.Users:
      return <UsersPage />;
    case RouteName.Settings:
      return <SettingsPage />;
    case RouteName.Profile:
      return <ProfilePage />;
    case RouteName.Help:
      return <HelpPage />;
    case RouteName.WaitingForMe:
      return <WaitingForMePage orderId={orderIdFrom(route.param)} />;
    case RouteName.Orders:
      return <OrdersPage orderId={orderIdFrom(route.param)} />;
    case RouteName.Photos:
      return <PhotosPage />;
    case RouteName.Diary:
      return <DiaryPage entryId={orderIdFrom(route.param)} />;
    case RouteName.Invoicing:
      return <InvoicesPage invoiceId={orderIdFrom(route.param)} />;
    case RouteName.Benchmark:
      return (
        <ComingSoonPage
          title="Benchmark projektů"
          phase="Fáze 5"
          description="Porovnání dokončených projektů: marže, odchylky rozpočtu a termínů, náklady na kWp."
        />
      );
    case RouteName.Service:
      return (
        <ComingSoonPage
          title="Servis"
          phase="Připravujeme"
          description="Evidence servisních zásahů, revizí a smluv po předání projektu (složka 10-Servis). Upřesníme společně."
        />
      );
    case RouteName.Finance:
      return (
        <ComingSoonPage
          title="Firemní cashflow"
          phase="Fáze 5"
          description="Celofiremní cashflow včetně důvěrných položek a Excel report pro finančního ředitele holdingu."
        />
      );
    default:
      return <DashboardPage />;
  }
}

export default PrmApp;

/** Číslo objednávky z adresy (`#/objednavky/12`); cokoli jiného znamená „bez objednávky". */
function orderIdFrom(param: string | undefined): number | undefined {
  const n = param ? parseInt(param, 10) : NaN;
  return isNaN(n) ? undefined : n;
}
