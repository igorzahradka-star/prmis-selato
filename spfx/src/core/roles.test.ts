import {
  resolveRoles,
  hasAnyRole,
  canCreateProject,
  canDeleteProject,
  canEditProject,
  canManagePartners,
  canOpenAdmin,
  canOpenFinance,
  canOpenBenchmark,
  isSelfApproval,
  normalizeLogin,
  DEFAULT_ROLE_GROUPS
} from './roles';
import { Role } from './types';

describe('resolveRoles', () => {
  it('odvodí role z názvů skupin', () => {
    const roles = resolveRoles(['PRM Projektoví manažeři', 'Nějaká jiná skupina']);
    expect(roles).toEqual([Role.ProjektovyManazer]);
  });

  it('umí přiřadit více rolí najednou', () => {
    const roles = resolveRoles(['PRM Vedení', 'PRM Finance – důvěrné']);
    expect(roles).toContain(Role.Vedeni);
    expect(roles).toContain(Role.Finance);
  });

  it('nevadí mu velikost písmen ani mezery okolo', () => {
    const roles = resolveRoles(['  prm administrátoři  ']);
    expect(roles).toEqual([Role.Administrator]);
  });

  it('bez členství nevrátí žádnou roli', () => {
    expect(resolveRoles([])).toEqual([]);
  });

  it('vlastník webu dostane roli administrátora i bez členství ve skupině', () => {
    const roles = resolveRoles([], DEFAULT_ROLE_GROUPS, true);
    expect(roles).toEqual([Role.Administrator]);
  });

  it('vlastníkovi webu nepřidá administrátora dvakrát', () => {
    const roles = resolveRoles(['PRM Administrátoři'], DEFAULT_ROLE_GROUPS, true);
    expect(roles.filter((r) => r === Role.Administrator).length).toBe(1);
  });

  it('respektuje přejmenované skupiny z Nastavení', () => {
    const vlastni = { ...DEFAULT_ROLE_GROUPS, [Role.Vedeni]: 'Management RES' };
    expect(resolveRoles(['Management RES'], vlastni)).toEqual([Role.Vedeni]);
    // Původní název už neplatí.
    expect(resolveRoles(['PRM Vedení'], vlastni)).toEqual([]);
  });
});

describe('hasAnyRole', () => {
  it('najde shodu alespoň v jedné roli', () => {
    expect(hasAnyRole([Role.AsistentPM], Role.Administrator, Role.AsistentPM)).toBe(true);
  });

  it('bez shody vrátí nepravdu', () => {
    expect(hasAnyRole([Role.Ctenar], Role.Administrator)).toBe(false);
  });
});

describe('canCreateProject', () => {
  it('projektový manažer smí založit projekt', () => {
    expect(canCreateProject([Role.ProjektovyManazer])).toBe(true);
  });

  it('asistent projekt zakládat nesmí', () => {
    expect(canCreateProject([Role.AsistentPM])).toBe(false);
  });

  it('čtenář projekt zakládat nesmí', () => {
    expect(canCreateProject([Role.Ctenar])).toBe(false);
  });
});

describe('canDeleteProject', () => {
  it('administrátor smí smazat projekt', () => {
    expect(canDeleteProject([Role.Administrator])).toBe(true);
  });

  it('projektový manažer projekt mazat nesmí — má na to stav Storno', () => {
    expect(canDeleteProject([Role.ProjektovyManazer])).toBe(false);
  });

  it('vedení projekt mazat nesmí, i když ho smí editovat', () => {
    expect(canDeleteProject([Role.Vedeni])).toBe(false);
  });

  it('asistent ani čtenář mazat nesmí', () => {
    expect(canDeleteProject([Role.AsistentPM])).toBe(false);
    expect(canDeleteProject([Role.Ctenar])).toBe(false);
  });

  it('administrátor v kombinaci s dalšími rolemi mazat smí', () => {
    expect(canDeleteProject([Role.ProjektovyManazer, Role.Administrator])).toBe(true);
  });

  it('bez rolí nikdo nemaže', () => {
    expect(canDeleteProject([])).toBe(false);
  });
});

describe('canEditProject', () => {
  const projekt = {
    projectManagerLogin: 'i:0#.f|membership|jan.novak@revoltum.cz',
    assistantLogins: ['i:0#.f|membership|eva.mala@revoltum.cz']
  };

  it('PM smí editovat svůj projekt', () => {
    expect(canEditProject([Role.ProjektovyManazer], 'jan.novak@revoltum.cz', projekt)).toBe(true);
  });

  it('PM nesmí editovat cizí projekt', () => {
    expect(canEditProject([Role.ProjektovyManazer], 'petr.cizi@revoltum.cz', projekt)).toBe(false);
  });

  it('asistent přiřazený k projektu ho editovat smí', () => {
    expect(canEditProject([Role.AsistentPM], 'eva.mala@revoltum.cz', projekt)).toBe(true);
  });

  it('asistent nepřiřazený k projektu ho editovat nesmí', () => {
    expect(canEditProject([Role.AsistentPM], 'jiny.asistent@revoltum.cz', projekt)).toBe(false);
  });

  it('administrátor smí editovat jakýkoli projekt', () => {
    expect(canEditProject([Role.Administrator], 'kdokoli@revoltum.cz', projekt)).toBe(true);
  });

  it('vedení smí editovat jakýkoli projekt', () => {
    expect(canEditProject([Role.Vedeni], 'kdokoli@revoltum.cz', projekt)).toBe(true);
  });

  it('čtenář needituje nic', () => {
    expect(canEditProject([Role.Ctenar], 'jan.novak@revoltum.cz', projekt)).toBe(false);
  });

  it('projekt bez přiřazeného PM se needituje omylem', () => {
    expect(canEditProject([Role.ProjektovyManazer], 'jan.novak@revoltum.cz', {})).toBe(false);
  });
});

describe('canManagePartners', () => {
  it('PM a asistent partnery spravovat smí', () => {
    expect(canManagePartners([Role.ProjektovyManazer])).toBe(true);
    expect(canManagePartners([Role.AsistentPM])).toBe(true);
  });

  it('administrátor smí vždy', () => {
    expect(canManagePartners([Role.Administrator])).toBe(true);
  });

  it('čtenář a vedení bez dalších rolí partnery upravovat nesmí', () => {
    expect(canManagePartners([Role.Ctenar])).toBe(false);
    expect(canManagePartners([Role.Vedeni])).toBe(false);
  });
});

describe('canOpenFinance', () => {
  it('role Finance se skutečným přístupem na web PRM-Finance moduly vidí', () => {
    expect(canOpenFinance([Role.Finance], true)).toBe(true);
  });

  it('role Finance BEZ přístupu na web moduly nevidí — SharePoint je autorita', () => {
    expect(canOpenFinance([Role.Finance], false)).toBe(false);
  });

  it('přístup na web bez role Finance nestačí', () => {
    expect(canOpenFinance([Role.ProjektovyManazer], true)).toBe(false);
  });

  it('vedení samo o sobě důvěrná data nevidí', () => {
    expect(canOpenFinance([Role.Vedeni], true)).toBe(false);
  });
});

describe('canOpenAdmin a canOpenBenchmark', () => {
  it('Nastavení otevře jen administrátor', () => {
    expect(canOpenAdmin([Role.Administrator])).toBe(true);
    expect(canOpenAdmin([Role.Vedeni])).toBe(false);
  });

  it('benchmark vidí vedení i administrátor', () => {
    expect(canOpenBenchmark([Role.Vedeni])).toBe(true);
    expect(canOpenBenchmark([Role.Administrator])).toBe(true);
    expect(canOpenBenchmark([Role.ProjektovyManazer])).toBe(false);
  });
});

describe('isSelfApproval', () => {
  it('pozná, že schvalovatel je zároveň vystavitel — i při jiném zápisu jména', () => {
    expect(
      isSelfApproval('i:0#.f|membership|jan.novak@revoltum.cz', 'JAN.NOVAK@revoltum.cz')
    ).toBe(true);
  });

  it('dva různé lidi nezamění', () => {
    expect(isSelfApproval('jan.novak@revoltum.cz', 'eva.mala@revoltum.cz')).toBe(false);
  });
});

describe('normalizeLogin', () => {
  it('odstraní předponu SharePointu', () => {
    expect(normalizeLogin('i:0#.f|membership|jan.novak@revoltum.cz')).toBe('jan.novak@revoltum.cz');
  });

  it('prázdnou hodnotu zvládne', () => {
    expect(normalizeLogin(undefined)).toBe('');
  });
});
