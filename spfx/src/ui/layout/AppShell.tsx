/**
 * Rámec aplikace: hlavička s logem a uživatelem, levá navigace, obsah, patička.
 *
 * Navigace se skládá podle rolí přihlášeného uživatele — co nesmí, nevidí.
 * (Skutečnou ochranu dat ale dělá SharePoint, ne tahle komponenta.)
 */

import { canManageSites, canViewService } from '../../core/service';
import { APP_VERSION } from '../../core/version';
import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { Persona, PersonaSize } from '@fluentui/react/lib/Persona';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { useApp } from '../AppContext';
import { RES, LAYOUT, RES_FONT_FAMILY } from '../theme';
import { Route, RouteName, buildHash } from '../router';
import { ROLE_LABELS, Role } from '../../core/types';
import { canActAs, canOpenAdmin, canOpenBenchmark, canOpenFinance, isReaderOnly } from '../../core/roles';
import { crmLinkUrl, isWebViewMode, siteHomeUrl, toggleWebViewUrl } from '../fullscreen';
import { NavEntry, NavGroup, NavItem, activeItemRoute, buildNavigation, flattenNavigation, groupKeyOf } from './navigation';

import logoUrl from '../../webparts/prm/assets/res-logo-header.svg';

export interface AppShellProps {
  route: Route;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ route, children }) => {
  const { user, dataSource } = useApp();
  const [navOpen, setNavOpen] = React.useState<boolean>(window.innerWidth >= LAYOUT.breakpointNarrow);

  const entries = useNavEntries();
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>(readExpandedGroups());
  const activeGroup = groupKeyOf(entries, route.name);

  // Přejde-li se na obrazovku ve sbalené skupině, skupina se sama rozbalí.
  React.useEffect(() => {
    if (activeGroup && expanded[activeGroup] === false) {
      setExpanded((cur) => ({ ...cur, [activeGroup]: true }));
    }
  }, [activeGroup, route.name]);

  const toggleGroup = (key: string): void => {
    setExpanded((cur) => {
      const open = cur[key] ?? key === activeGroup;
      const next = { ...cur, [key]: !open };
      saveExpandedGroups(next);
      return next;
    });
  };

  return (
    <div style={{ fontFamily: RES_FONT_FAMILY, background: RES.background, minHeight: 600 }}>
      <Header onToggleNav={() => setNavOpen((v) => !v)} />

      <ActAsBar />

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
          {navOpen
            ? entries.map((entry) =>
                entry.kind === 'item' ? (
                  <NavLink key={entry.item.route} item={entry.item} active={activeItemRoute(route.name) === entry.item.route} collapsed={false} />
                ) : (
                  <NavGroupView
                    key={entry.group.key}
                    group={entry.group}
                    open={expanded[entry.group.key] ?? entry.group.key === activeGroup}
                    activeRoute={activeItemRoute(route.name)}
                    onToggle={() => toggleGroup(entry.group.key)}
                  />
                )
              )
            : flattenNavigation(entries).map((item) => (
                <NavLink key={item.route} item={item} active={activeItemRoute(route.name) === item.route} collapsed />
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

/** Navigace podle oprávnění přihlášeného uživatele. */
function useNavEntries(): NavEntry[] {
  const { user, financeSiteUrl } = useApp();
  return buildNavigation({
    benchmark: canOpenBenchmark(user.roles),
    finance: canOpenFinance(user.roles, user.hasFinanceAccess && !!financeSiteUrl),
    admin: canOpenAdmin(user.roles),
    service: canViewService(user.roles),
    contracts: canManageSites(user.roles),
    reader: isReaderOnly(user.roles)
  });
}

const EXPANDED_KEY = 'prm-nav-groups';

/** Které skupiny nabídky si uživatel sbalil nebo rozbalil (pamatuje si to prohlížeč). */
function readExpandedGroups(): Record<string, boolean> {
  try {
    return JSON.parse(window.localStorage.getItem(EXPANDED_KEY) || '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

function saveExpandedGroups(value: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(EXPANDED_KEY, JSON.stringify(value));
  } catch {
    // Bez úložiště se volba jen nezapamatuje.
  }
}

/** Skupina položek nabídky, kterou jde sbalit a rozbalit. */
const NavGroupView: React.FC<{ group: NavGroup; open: boolean; activeRoute: RouteName; onToggle: () => void }> = ({ group, open, activeRoute, onToggle }) => {
  const containsActive = group.children.some((c) => c.route === activeRoute);
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '10px 14px',
          border: 'none',
          borderLeft: '3px solid transparent',
          background: 'transparent',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 14,
          fontWeight: containsActive && !open ? 600 : 500,
          color: containsActive && !open ? RES.blue : RES.text,
          textAlign: 'left'
        }}
      >
        <Icon iconName={group.icon} style={{ fontSize: 16, flex: '0 0 auto' }} />
        <span style={{ flex: '1 1 auto' }}>{group.label}</span>
        <Icon iconName={open ? 'ChevronUp' : 'ChevronDown'} style={{ fontSize: 10, color: RES.gray }} />
      </button>
      {open && group.children.map((item) => <NavLink key={item.route} item={item} active={activeRoute === item.route} collapsed={false} indent />)}
    </div>
  );
};

const NavLink: React.FC<{ item: NavItem; active: boolean; collapsed: boolean; indent?: boolean }> = ({
  item,
  active,
  collapsed,
  indent
}) => {
  const content = (
    <a
      href={buildHash(item.route)}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: collapsed ? '10px 0' : indent ? '8px 14px 8px 38px' : '10px 14px',
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
  const { user, dataSource, settings } = useApp();
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
        <ActAsPicker />
        <HeaderTools />
        {settings.links.showCrm && <CrmButton url={settings.links.crmUrl} />}
        <a href={buildHash(RouteName.Profile)} title="Můj profil a podpis" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Persona
            text={user.displayName}
            secondaryText={user.email}
            size={PersonaSize.size32}
            styles={{
              primaryText: { color: RES.white, cursor: 'pointer' },
              secondaryText: { color: RES.grayBlue, cursor: 'pointer' }
            }}
          />
        </a>
        {dataSource !== 'mock' && <HomeButton />}
        {dataSource !== 'mock' && <FullScreenButton />}
      </div>
    </header>
  );
};

/** Výběr role ke zkoušení — jen pro administrátora. Mění pouze to, co aplikace zobrazí a povolí; SharePoint dál vidí skutečného uživatele. */
const ActAsPicker: React.FC = () => {
  const { realUser, actAs, setActAs } = useApp();
  if (!canActAs(realUser)) {
    return null;
  }
  return (
    <TooltipHost content="Zkoušení aplikace v jiné roli (jen vzhled a pravidla aplikace, oprávnění SharePointu zůstávají vaše)">
      <select
        aria-label="Zobrazit jako"
        value={actAs && actAs.length === 1 ? actAs[0] : ''}
        onChange={(e) => {
          const v = e.target.value;
          setActAs(v ? [v as Role] : undefined);
          window.location.hash = buildHash(RouteName.Dashboard);
        }}
        style={{ fontFamily: 'inherit', fontSize: 13, padding: '4px 6px', borderRadius: 4, border: `1px solid ${RES.grayBlue}`, background: RES.navyDark, color: RES.white }}
      >
        <option value="">Zobrazit jako: moje role</option>
        {Object.keys(ROLE_LABELS).map((k) => (
          <option key={k} value={k}>
            {ROLE_LABELS[k as Role]}
          </option>
        ))}
      </select>
    </TooltipHost>
  );
};

/** Výrazný pruh, dokud administrátor zkouší jinou roli. */
const ActAsBar: React.FC = () => {
  const { actAs, setActAs } = useApp();
  if (!actAs || actAs.length === 0) {
    return null;
  }
  return (
    <MessageBar messageBarType={MessageBarType.severeWarning} isMultiline={false}>
      <strong>Zkoušíte roli: {actAs.map((r) => ROLE_LABELS[r]).join(', ')}.</strong> Aplikace se chová, jako byste měl jen tuto roli (oprávnění SharePointu zůstávají vaše).{' '}
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          setActAs(undefined);
          window.location.hash = buildHash(RouteName.Dashboard);
        }}
      >
        Vrátit se k administrátorovi
      </a>
    </MessageBar>
  );
};

/** Tlačítko „RES CRM“: odkaz na sesterskou aplikaci (adresa a zobrazení jsou v Nastavení → Odkazy v záhlaví). */
const CrmButton: React.FC<{ url: string }> = ({ url }) => (
  <TooltipHost content="Otevřít RES CRM (nabídky a obchodní případy)">
    <a
      href={crmLinkUrl(url, window.location.href)}
      aria-label="RES CRM"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color: RES.white,
        textDecoration: 'none',
        border: `1px solid ${RES.grayBlue}`,
        borderRadius: 4,
        padding: '4px 10px',
        fontSize: 13,
        fontWeight: 600,
        whiteSpace: 'nowrap'
      }}
    >
      <Icon iconName="ContactList" />
      RES CRM
    </a>
  </TooltipHost>
);

/**
 * Domeček: zpět na úvodní stránku webu SharePointu. V režimu „celé okno" není lišta SharePointu vidět,
 * takže jinak by se z aplikace nešlo dostat na zbytek webu.
 */
const HomeButton: React.FC = () => (
  <TooltipHost content="Úvodní stránka webu SharePoint">
    <button
      type="button"
      onClick={() => {
        window.location.href = siteHomeUrl(window.location.href);
      }}
      aria-label="Úvodní stránka webu SharePoint"
      style={{
        background: 'transparent',
        border: 'none',
        color: RES.white,
        cursor: 'pointer',
        fontSize: 16,
        padding: 6,
        borderRadius: 4
      }}
    >
      <Icon iconName="Home" />
    </button>
  </TooltipHost>
);

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
      <span>
        {userRoles ? `Vaše role: ${userRoles}` : 'Nemáte přiřazenou žádnou roli PRM.'} · verze {APP_VERSION}
      </span>
    </footer>
  );
};
