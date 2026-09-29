import {
  OVERHEAD_ACCESS_ROLES,
  accessGroupsForRoles,
  canManageProjectAccess,
  isFullyRestricted,
  unexpectedAccess
} from './projectAccess';
import { DEFAULT_ROLE_GROUPS } from './roles';
import { Role } from './types';

describe('accessGroupsForRoles', () => {
  it('pro Režii vrátí administrátory, vedení a finance, ne projektové manažery', () => {
    const groups = accessGroupsForRoles(OVERHEAD_ACCESS_ROLES, DEFAULT_ROLE_GROUPS);
    expect(groups.map((g) => g.role)).toEqual([Role.Administrator, Role.Vedeni, Role.Finance]);
    expect(groups.some((g) => g.role === Role.ProjektovyManazer)).toBe(false);
  });

  it('administrátory přidá vždy, i když je nikdo nevyjmenoval', () => {
    const groups = accessGroupsForRoles([Role.Vedeni], DEFAULT_ROLE_GROUPS);
    expect(groups[0].role).toBe(Role.Administrator);
    expect(groups.length).toBe(2);
  });

  it('administrátory řadí první, i když byli vyjmenováni jako poslední', () => {
    const groups = accessGroupsForRoles([Role.Finance, Role.Administrator], DEFAULT_ROLE_GROUPS);
    expect(groups.map((g) => g.role)).toEqual([Role.Administrator, Role.Finance]);
  });

  it('přidělí úroveň podle role: administrátor řídí, vedení upravuje, finance čtou', () => {
    const groups = accessGroupsForRoles(OVERHEAD_ACCESS_ROLES, DEFAULT_ROLE_GROUPS);
    expect(groups.map((g) => g.level)).toEqual(['Administrator', 'Editor', 'Reader']);
  });

  it('přeskočí roli s prázdným názvem skupiny', () => {
    const mapping = { ...DEFAULT_ROLE_GROUPS, [Role.Finance]: '  ' };
    const groups = accessGroupsForRoles(OVERHEAD_ACCESS_ROLES, mapping);
    expect(groups.map((g) => g.role)).toEqual([Role.Administrator, Role.Vedeni]);
  });

  it('přeskočí duplicitu, když dvě role sdílejí jednu skupinu', () => {
    const mapping = { ...DEFAULT_ROLE_GROUPS, [Role.Vedeni]: 'PRM Finance – důvěrné' };
    const groups = accessGroupsForRoles(OVERHEAD_ACCESS_ROLES, mapping);
    expect(groups.map((g) => g.groupName)).toEqual(['PRM Administrátoři', 'PRM Finance – důvěrné']);
  });

  it('když je prázdná skupina administrátorů, ostatní role zůstanou', () => {
    const mapping = { ...DEFAULT_ROLE_GROUPS, [Role.Administrator]: '' };
    expect(accessGroupsForRoles([Role.Vedeni], mapping).map((g) => g.role)).toEqual([Role.Vedeni]);
  });
});

describe('canManageProjectAccess', () => {
  it('smí jen administrátor', () => {
    expect(canManageProjectAccess([Role.Administrator])).toBe(true);
    expect(canManageProjectAccess([Role.Vedeni, Role.ProjektovyManazer])).toBe(false);
    expect(canManageProjectAccess([])).toBe(false);
  });
});

describe('isFullyRestricted', () => {
  it('chráněný je projekt až tehdy, když je omezený záznam i složka', () => {
    expect(isFullyRestricted({ recordRestricted: true, folderRestricted: true, allowed: [] })).toBe(true);
    expect(isFullyRestricted({ recordRestricted: true, folderRestricted: false, allowed: [] })).toBe(false);
    expect(isFullyRestricted({ recordRestricted: false, folderRestricted: true, allowed: [] })).toBe(false);
  });

  it('projekt bez složky stačí omezit v záznamu', () => {
    expect(isFullyRestricted({ recordRestricted: true, allowed: [] })).toBe(true);
    expect(isFullyRestricted({ recordRestricted: false, allowed: [] })).toBe(false);
  });
});

describe('unexpectedAccess', () => {
  const groups = accessGroupsForRoles(OVERHEAD_ACCESS_ROLES, DEFAULT_ROLE_GROUPS);

  it('nehlásí nic, když má přístup přesně to, co se chtělo', () => {
    const state = {
      recordRestricted: true,
      allowed: ['PRM Administrátoři', 'PRM Vedení', 'PRM Finance – důvěrné']
    };
    expect(unexpectedAccess(state, groups)).toEqual([]);
  });

  it('nahlásí člověka nebo skupinu navíc, bez ohledu na velikost písmen', () => {
    const state = {
      recordRestricted: true,
      allowed: ['prm administrátoři', 'Igor Zahrádka', 'PRM Projektoví manažeři']
    };
    expect(unexpectedAccess(state, groups)).toEqual(['Igor Zahrádka', 'PRM Projektoví manažeři']);
  });
});
