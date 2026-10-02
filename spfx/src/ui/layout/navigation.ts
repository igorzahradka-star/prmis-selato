/**
 * Struktura levé navigace: samostatné položky a skupiny, které se dají sbalit (Projekty, Nastavení; později Servis).
 * Čistá logika bez Reactu — co kdo uvidí a která skupina obsahuje kterou obrazovku.
 */

import { RouteName } from '../router';

export interface NavItem {
  route: RouteName;
  label: string;
  icon: string;
  /** Modul ještě není hotový — zobrazí se jako připravovaný. */
  comingSoon?: boolean;
}

export interface NavGroup {
  /** Pevný klíč skupiny (pamatuje se podle něj, jestli je sbalená). */
  key: string;
  label: string;
  icon: string;
  children: NavItem[];
}

export type NavEntry = { kind: 'item'; item: NavItem } | { kind: 'group'; group: NavGroup };

export interface NavFlags {
  benchmark: boolean;
  finance: boolean;
  admin: boolean;
}

const item = (route: RouteName, label: string, icon: string, comingSoon?: boolean): NavEntry => ({
  kind: 'item',
  item: { route, label, icon, comingSoon }
});

/**
 * Navigace podle oprávnění uživatele (co nesmí, nevidí). Ve skupině Projekty jsou jen přehledy napříč projekty (přehled, mapa,
 * objednávky, fakturace); stavební deník a fotodokumentace se otevírají až z detailu konkrétního projektu. Správa je ve skupině
 * Nastavení. Skupina Servis (složka 10-Servis) zatím obsahuje jen položku označenou jako připravovanou.
 */
export function buildNavigation(flags: NavFlags): NavEntry[] {
  const entries: NavEntry[] = [
    {
      kind: 'group',
      group: {
        key: 'projekty',
        label: 'Projekty',
        icon: 'ViewList',
        children: [
          { route: RouteName.Dashboard, label: 'Přehled projektů', icon: 'ViewList' },
          { route: RouteName.Map, label: 'Mapa projektů', icon: 'MapPin' },
          { route: RouteName.Orders, label: 'Objednávky', icon: 'ShoppingCart' },
          { route: RouteName.Invoicing, label: 'Fakturace', icon: 'M365InvoicingLogo' }
        ]
      }
    },
    item(RouteName.WaitingForMe, 'Čeká na mě', 'Inbox'),
    item(RouteName.Partners, 'Partneři', 'ContactCard'),
    {
      kind: 'group',
      group: {
        key: 'servis',
        label: 'Servis',
        icon: 'Repair',
        children: [{ route: RouteName.Service, label: 'Servis', icon: 'Repair', comingSoon: true }]
      }
    }
  ];

  if (flags.benchmark) {
    entries.push(item(RouteName.Benchmark, 'Benchmark', 'BarChartVertical', true));
  }
  if (flags.finance) {
    entries.push(item(RouteName.Finance, 'Firemní cashflow', 'Money', true));
  }
  if (flags.admin) {
    entries.push({
      kind: 'group',
      group: {
        key: 'nastaveni',
        label: 'Nastavení',
        icon: 'Settings',
        children: [
          { route: RouteName.Settings, label: 'Nastavení aplikace', icon: 'Settings' },
          { route: RouteName.Users, label: 'Uživatelé a role', icon: 'SecurityGroup' },
          { route: RouteName.Install, label: 'Instalace a diagnostika', icon: 'Health' }
        ]
      }
    });
  }
  entries.push(item(RouteName.Help, 'Nápověda', 'Help'));
  return entries;
}

/**
 * Detail projektu (`#/projekt/26001`) patří do skupiny Projekty, i když v nabídce nemá vlastní položku;
 * stejně tak by se měly chovat další obrazovky, které s položkou nabídky souvisejí.
 */
const ROUTE_ALIASES: Partial<Record<RouteName, RouteName>> = {
  [RouteName.ProjectDetail]: RouteName.Dashboard,
  [RouteName.Diary]: RouteName.Dashboard,
  [RouteName.Photos]: RouteName.Dashboard
};

/** Která položka nabídky odpovídá aktuální obrazovce (kvůli zvýraznění). */
export function activeItemRoute(route: RouteName): RouteName {
  return ROUTE_ALIASES[route] ?? route;
}

/** Klíč skupiny, ve které je daná obrazovka; `undefined`, když patří k samostatné položce. */
export function groupKeyOf(entries: NavEntry[], route: RouteName): string | undefined {
  const target = activeItemRoute(route);
  const found = entries.filter((e) => e.kind === 'group' && e.group.children.some((c) => c.route === target))[0];
  return found && found.kind === 'group' ? found.group.key : undefined;
}

/** Všechny položky nabídky popořadě (u sbalené navigace s ikonami se skupiny rozbalí do plochého seznamu). */
export function flattenNavigation(entries: NavEntry[]): NavItem[] {
  const out: NavItem[] = [];
  entries.forEach((e) => {
    if (e.kind === 'item') {
      out.push(e.item);
    } else {
      e.group.children.forEach((c) => out.push(c));
    }
  });
  return out;
}
