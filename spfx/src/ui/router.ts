/**
 * Jednoduchý hash router.
 *
 * Proč vlastní a ne react-router: aplikace je jeden web part na stránce
 * SharePointu. Plnohodnotný router by si přivlastnil URL celé stránky
 * a rozbil navigaci SharePointu. Hash (`#/projekt/26-014`) je bezpečný —
 * SharePoint ho ignoruje a uživatel si může odkaz poslat kolegovi.
 */

/** Obrazovky aplikace. */
export enum RouteName {
  Dashboard = 'projekty',
  ProjectDetail = 'projekt',
  Map = 'mapa',
  Partners = 'partneri',
  Orders = 'objednavky',
  WaitingForMe = 'ceka-na-me',
  Invoicing = 'fakturace',
  Catalog = 'kusovnik',
  Diary = 'denik',
  Photos = 'foto',
  Finance = 'firemni-cashflow',
  Benchmark = 'benchmark',
  Service = 'servis',
  ServiceMap = 'servis-mapa',
  ServicePlans = 'servis-plany',
  ServiceCalendar = 'servis-kalendar',
  ServiceRequests = 'servis-pozadavky',
  ServiceSites = 'servis-lokality',
  ServiceContracts = 'servis-smlouvy',
  Users = 'uzivatele',
  Settings = 'nastaveni',
  Install = 'instalace',
  Help = 'napoveda',
  Profile = 'profil'
}

export interface Route {
  name: RouteName;
  /** Další část cesty — např. číslo projektu u detailu. */
  param?: string;
}

export const DEFAULT_ROUTE: Route = { name: RouteName.Dashboard };

/**
 * Přečte cestu z hashe. Neznámou cestu pošle na dashboard —
 * uživateli se nesmí stát, že po kliknutí na starý odkaz uvidí prázdnou stránku.
 */
export function parseHash(hash: string): Route {
  const clean = (hash || '').replace(/^#\/?/, '').trim();
  if (!clean) {
    return DEFAULT_ROUTE;
  }
  const segments = clean.split('/').filter((s) => s.length > 0);
  const name = decodeURIComponent(segments[0]) as RouteName;

  const known = Object.keys(RouteName).map((k) => RouteName[k as keyof typeof RouteName]);
  if (known.indexOf(name) === -1) {
    return DEFAULT_ROUTE;
  }
  return {
    name,
    param: segments[1] ? decodeURIComponent(segments[1]) : undefined
  };
}

/** Složí hash pro odkaz. `buildHash(ProjectDetail, '26-014')` → `#/projekt/26-014` */
export function buildHash(name: RouteName, param?: string): string {
  return param ? `#/${name}/${encodeURIComponent(param)}` : `#/${name}`;
}

/** Přejde na jinou obrazovku. */
export function navigate(name: RouteName, param?: string): void {
  window.location.hash = buildHash(name, param);
}

/**
 * Přihlásí se k odběru změn cesty. Vrací funkci pro odhlášení —
 * bez ní by po odstranění web partu ze stránky zůstal viset posluchač.
 */
export function subscribeToRoute(handler: (route: Route) => void): () => void {
  const listener = (): void => handler(parseHash(window.location.hash));
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}
