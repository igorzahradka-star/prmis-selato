import { activeItemRoute, buildNavigation, flattenNavigation, groupKeyOf } from './navigation';
import { RouteName } from '../router';

const nic = { benchmark: false, finance: false, admin: false };

describe('buildNavigation', () => {
  it('běžný uživatel: skupina Projekty, Čeká na mě, Partneři a Nápověda; správu nevidí', () => {
    const e = buildNavigation(nic);
    const labels = e.map((x) => (x.kind === 'group' ? x.group.label : x.item.label));
    expect(labels).toEqual(['Projekty', 'Čeká na mě', 'Partneři', 'Nápověda']);
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
        RouteName.Diary,
        RouteName.Photos
      ]);
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
    expect(groupKeyOf(e, RouteName.Diary)).toBe('projekty');
    expect(groupKeyOf(e, RouteName.Users)).toBe('nastaveni');
    expect(groupKeyOf(e, RouteName.Partners)).toBeUndefined();
  });
  it('detail projektu patří do skupiny Projekty a zvýrazní Přehled projektů', () => {
    expect(activeItemRoute(RouteName.ProjectDetail)).toBe(RouteName.Dashboard);
    expect(groupKeyOf(e, RouteName.ProjectDetail)).toBe('projekty');
  });
});
