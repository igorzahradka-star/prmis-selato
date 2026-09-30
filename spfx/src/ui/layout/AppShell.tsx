/**
 * Rámec aplikace: hlavička s logem a uživatelem, levá navigace, obsah, patička.
 *
 * Navigace se skládá podle rolí přihlášeného uživatele — co nesmí, nevidí.
 * (Skutečnou ochranu dat ale dělá SharePoint, ne tahle komponenta.)
 */

import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { Persona, PersonaSize } from '@fluentui/react/lib/Persona';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { useApp } from '../AppContext';
import { RES, LAYOUT, RES_FONT_FAMILY } from '../theme';
import { Route, RouteName, buildHash } from '../router';
import { ROLE_LABELS } from '../../core/types';
import { canOpenAdmin, canOpenBenchmark, canOpenFinance } from '../../core/roles';
import { isWebViewMode, toggleWebViewUrl } from '../fullscreen';

import logoUrl from '../../webparts/prm/assets/res-logo-header.svg';

interface NavItem {
  route: RouteName;
  label: string;
  icon: string;
  /** Modul ještě není hotový — zobrazí se jako připravovaný. */
  comingSoon?: boolean;
}

export interface AppShellProps {
  route: Route;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ route, children }) => {
  const { user, dataSource } = useApp();
  const [navOpen, setNavOpen] = React.useState<boolean>(window.innerWidth >= LAYOUT.breakpointNarrow);

  const items = useNavItems();

  return (
    <div style={{ fontFamily: RES_FONT_FAMILY, background: RES.background, minHeight: 600 }}>
      <Header onToggleNav={() => setNavOpen((v) => !v)} />

      {dataSource === 'mock' && (
        <MessageBar messageBarType={MessageBarType.warning} isMultiline={false}>
          <strong>Ukázkový režim.</strong> Zobrazená data jsou smyšlená a nikam se neukládají.
          Přepnout na ostrá data lze ve vlastnostech web partu (Upravit stránku → ozubené kolo).
        </MessageBar>
      )}

      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <nav
          aria-label="Hlavní navigace"
          style={{
            width: navOpen ? LAYOUT.navWidth : LAYOUT.navWidthCollapsed,
            flex: '0 0 auto',
            background: RES.white,
            borderRight: `1px solid ${RES.grayBlue}`,
            paddingTop: 8,
            transition: 'width .15s ease'
          }}
        >
          {items.map((item) => (
            <NavLink key={item.route} item={item} active={route.name === item.route} collapsed={!navOpen} />
          ))}
        </nav>

        <main
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            padding: `${LAYOUT.contentPaddingTop}px ${LAYOUT.contentPaddingX}px ${LAYOUT.contentPaddingBottom}px`,
            maxWidth: LAYOUT.contentMaxWidth
          }}
        >
          {children}
        </main>
      </div>

      <Footer userRoles={user.roles.map((r) => ROLE_LABELS[r]).join(', ')} />
    </div>
  );
};

/** Které položky navigace uživatel uvidí. */
function useNavItems(): NavItem[] {
  const { user, financeSiteUrl } = useApp();
  const items: NavItem[] = [
    { route: RouteName.Dashboard, label: 'Projekty', icon: 'ViewList' },
    { route: RouteName.Map, label: 'Mapa projektů', icon: 'MapPin' },
    { route: RouteName.Partners, label: 'Partneři', icon: 'ContactCard' },
    { route: RouteName.WaitingForMe, label: 'Čeká na mě', icon: 'Inbox', comingSoon: true },
    { route: RouteName.Orders, label: 'Objednávky', icon: 'ShoppingCart', comingSoon: true },
    { route: RouteName.Invoicing, label: 'Fakturace', icon: 'M365InvoicingLogo', comingSoon: true }
  ];

  if (canOpenBenchmark(user.roles)) {
    items.push({ route: RouteName.Benchmark, label: 'Benchmark', icon: 'BarChartVertical', comingSoon: true });
  }
  if (canOpenFinance(user.roles, user.hasFinanceAccess && !!financeSiteUrl)) {
    items.push({ route: RouteName.Finance, label: 'Firemní cashflow', icon: 'Money', comingSoon: true });
  }
  if (canOpenAdmin(user.roles)) {
    items.push({ route: RouteName.Users, label: 'Uživatelé a role', icon: 'SecurityGroup' });
    items.push({ route: RouteName.Settings, label: 'Nastavení', icon: 'Settings' });
    items.push({ route: RouteName.Install, label: 'Instalace a diagnostika', icon: 'Health' });
  }
  items.push({ route: RouteName.Help, label: 'Nápověda', icon: 'Help' });

  return items;
}

const NavLink: React.FC<{ item: NavItem; active: boolean; collapsed: boolean }> = ({
  item,
  active,
  collapsed
}) => {
  const content = (
    <a
      href={buildHash(item.route)}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: collapsed ? '10px 0' : '10px 14px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        textDecoration: 'none',
        color: active ? RES.blue : RES.text,
        background: active ? RES.bluePale : 'transparent',
        borderLeft: `3px solid ${active ? RES.blue : 'transparent'}`,
        fontWeight: active ? 600 : 400,
        fontSize: 14
      }}
    >
      <Icon iconName={item.icon} style={{ fontSize: 16, flex: '0 0 auto' }} />
      {!collapsed && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.label}
          </span>
          {item.comingSoon && (
            <span
              style={{
                fontSize: 10,
                color: RES.gray,
                border: `1px solid ${RES.grayBlue}`,
                borderRadius: 8,
                padding: '0 5px',
                flex: '0 0 auto'
              }}
            >
              brzy
            </span>
          )}
        </span>
      )}
    </a>
  );

  return collapsed ? <TooltipHost content={item.label}>{content}</TooltipHost> : content;
};

const Header: React.FC<{ onToggleNav: () => void }> = ({ onToggleNav }) => {
  const { user, dataSource } = useApp();
  return (
    <header
      style={{
        height: LAYOUT.headerHeight,
        background: RES.navyDark,
        color: RES.white,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '0 16px'
      }}
    >
      <button
        onClick={onToggleNav}
        aria-label="Zobrazit nebo skrýt navigaci"
        style={{
          background: 'transparent',
          border: 'none',
          color: RES.white,
          cursor: 'pointer',
          fontSize: 16,
          padding: 6
        }}
      >
        <Icon iconName="GlobalNavButton" />
      </button>

      <img src={logoUrl} alt="Revoltum Engineering & Services" style={{ height: 32 }} />

      <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: 0.2 }}>PRM Revoltum</span>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 18 }}>
        <HeaderTools />
        <Persona
          text={user.displayName}
          secondaryText={user.email}
          size={PersonaSize.size32}
          styles={{
            primaryText: { color: RES.white },
            secondaryText: { color: RES.grayBlue }
          }}
        />
        {dataSource !== 'mock' && <FullScreenButton />}
      </div>
    </header>
  );
};

/**
 * Přepínač „celé okno": schová lištu a záhlaví SharePointu, aby aplikace měla celé okno
 * prohlížeče. Stránku znovu otevře se zapnutým (nebo vypnutým) `env=WebView`; člověk zůstane
 * na stejné obrazovce aplikace, protože se zachová i část adresy za `#`.
 */
const FullScreenButton: React.FC = () => {
  const active = isWebViewMode(window.location.href);
  const label = active ? 'Zobrazit lištu SharePointu' : 'Aplikace na celé okno (skryje lištu SharePointu)';
  return (
    <TooltipHost content={label}>
      <button
        type="button"
        onClick={() => {
          window.location.href = toggleWebViewUrl(window.location.href);
        }}
        aria-label={label}
        style={{
          background: 'transparent',
          border: 'none',
          color: RES.white,
          cursor: 'pointer',
          fontSize: 16,
          padding: 6,
          marginRight: -8,
          borderRadius: 4
        }}
      >
        {/* Ikona se nemění podle stavu: šipky směřující ven nebo dovnitř lidi mátly. */}
        <Icon iconName="ChromeMaximize" />
      </button>
    </TooltipHost>
  );
};

/**
 * Místo pro ikonky propojení s dalšími nástroji (Outlook, Teams, …).
 * Zatím jen připravené — funkčnost přibude s konkrétním nástrojem.
 */
const HEADER_TOOLS: ReadonlyArray<{ icon: string; label: string }> = [
  { icon: 'OutlookLogo', label: 'Outlook' },
  { icon: 'Plug', label: 'Další propojení' }
];

const HeaderTools: React.FC = () => (
  <div aria-label="Nástroje a propojení" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
    {HEADER_TOOLS.map((tool) => (
      <TooltipHost key={tool.icon} content={`${tool.label} (připravujeme)`}>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            borderRadius: 4,
            color: RES.grayBlue,
            opacity: 0.65
          }}
        >
          <Icon iconName={tool.icon} style={{ fontSize: 16 }} />
        </span>
      </TooltipHost>
    ))}
  </div>
);

const Footer: React.FC<{ userRoles: string }> = ({ userRoles }) => {
  const { settings } = useApp();
  return (
    <footer
      style={{
        borderTop: `1px solid ${RES.grayBlue}`,
        padding: '12px 24px',
        color: RES.gray,
        fontSize: 12,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        justifyContent: 'space-between'
      }}
    >
      <span>{settings.company.claim}</span>
      <span>{userRoles ? `Vaše role: ${userRoles}` : 'Nemáte přiřazenou žádnou roli PRM.'}</span>
    </footer>
  );
};
