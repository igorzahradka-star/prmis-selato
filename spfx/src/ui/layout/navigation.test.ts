import { activeItemRoute, buildNavigation, flattenNavigation, groupKeyOf, isRouteAllowed } from './navigation';
import { RouteName } from '../router';

const nic = { benchmark: false, finance: false, admin: false };

describe('buildNavigation', () => {
  it('běžný uživatel: skupina Projekty, Čeká na mě, Partneři a Nápověda; Servis a správu nevidí', () => {
    const e = buildNavigation(nic);
    const labels = e.map((x) => (x.kind === 'group' ? x.group.label : x.item.label));
    expect(labels).toEqual(['Projekty', 'Čeká na mě', 'Partneři', 'Nápověda']);
  });

  it('Servis se v nabídce ukáže jen uživateli s právem na Servis', () => {
    const labels = buildNavigation({ ...nic, service: true }).map((x) => (x.kind === 'group' ? x.group.label : x.item.label));
    expect(labels).toEqual(['Projekty', 'Čeká na mě', 'Partneři', 'Servis', 'Nápověda']);
    expect(flattenNavigation(buildNavigation({ ...nic, service: true })).filter((i) => i.route === RouteName.Service).map((i) => i.comingSoon)).toEqual([undefined]);
  });

  it('skupina Projekty obsahuje projektové moduly', () => {
    const g = buildNavigation(nic)[0];
    expect(g.kind).toBe('group');
    if (g.kind === 'group') {
      expect(g.group.children.map((c) => c.route)).toEqual([
        RouteName.Dashboard,
        RouteName.Map,
        RouteName.Orders,
        RouteName.Invoicing,
        RouteName.Catalog
      ]);
      // Deník a fotky se otevírají z detailu projektu, ne z nabídky.
      const routes = flattenNavigation(buildNavigation(nic)).map((i) => i.route);
      expect(routes).not.toContain(RouteName.Diary);
      expect(routes).not.toContain(RouteName.Photos);
    }
  });

  it('administrátor má skupinu Nastavení s uživateli a instalací', () => {
    const e = buildNavigation({ ...nic, admin: true });
    const g = e.filter((x) => x.kind === 'group' && x.group.key === 'nastaveni')[0];
    expect(g && g.kind === 'group' && g.group.children.map((c) => c.route)).toEqual([RouteName.Settings, RouteName.Users, RouteName.Install]);
    expect(flattenNavigation(e).some((i) => i.route === RouteName.Users)).toBe(true);
    // Uživatelé a instalace už nejsou samostatně na nejvyšší úrovni.
    expect(e.filter((x) => x.kind === 'item' && (x.item.route === RouteName.Users || x.item.route === RouteName.Install))).toEqual([]);
  });

  it('benchmark a cashflow jen s oprávněním', () => {
    const r = flattenNavigation(buildNavigation({ benchmark: true, finance: true, admin: false })).map((i) => i.route);
    expect(r).toEqual(expect.arrayContaining([RouteName.Benchmark, RouteName.Finance]));
    expect(flattenNavigation(buildNavigation(nic)).map((i) => i.route)).not.toContain(RouteName.Benchmark);
  });
});

describe('skupiny a zvýraznění', () => {
  const e = buildNavigation({ benchmark: false, finance: false, admin: true });
  it('obrazovka najde svoji skupinu', () => {
    expect(groupKeyOf(e, RouteName.Orders)).toBe('projekty');
    // Zápis otevřený odkazem patří pod Projekty, i když nemá vlastní položku.
    expect(groupKeyOf(e, RouteName.Diary)).toBe('projekty');
    expect(groupKeyOf(e, RouteName.Users)).toBe('nastaveni');
    expect(groupKeyOf(e, RouteName.Partners)).toBeUndefined();
  });
  it('detail projektu patří do skupiny Projekty a zvýrazní Přehled projektů', () => {
    expect(activeItemRoute(RouteName.ProjectDetail)).toBe(RouteName.Dashboard);
    expect(groupKeyOf(e, RouteName.ProjectDetail)).toBe('projekty');
  });
});

describe('nabídka čtenáře', () => {
  it('čtenář vidí jen přehled projektů, mapu, kusovník, Čeká na mě, Partnery, Servis a Nápovědu', () => {
    const items = flattenNavigation(buildNavigation({ ...nic, service: true, reader: true })).map((i) => i.route);
    expect(items).toEqual([RouteName.Dashboard, RouteName.Map, RouteName.Catalog, RouteName.WaitingForMe, RouteName.Partners, RouteName.Service, RouteName.Help]);
  });

  it('čtenář nesmí otevřít objednávky, fakturaci ani nastavení; ostatní role beze změny', () => {
    expect([RouteName.Orders, RouteName.Invoicing, RouteName.Settings, RouteName.Diary].map((r) => isRouteAllowed(r, true))).toEqual([false, false, false, false]);
    expect([RouteName.Dashboard, RouteName.ProjectDetail, RouteName.Photos, RouteName.Service].map((r) => isRouteAllowed(r, true))).toEqual([true, true, true, true]);
    expect(isRouteAllowed(RouteName.Orders, false)).toBe(true);
  });
});
