import {
  peopleWithRoles,
  roleSetupIssues,
  sortMemberships,
  expectedGroupNames,
  isMember,
  normalizeLoginKey,
  ROLE_ORDER,
  ROLE_PURPOSE,
  ROLE_PERMISSION_LEVEL,
  PERMISSION_LEVEL_LABEL,
  Person,
  projectManagerCandidates,
  RoleMembership
} from './userAdmin';
import { DEFAULT_ROLE_GROUPS } from './roles';
import { Role, ROLE_LABELS } from './types';

/** Přihlašovací jména jsou ve firmě bez diakritiky — `Jan Novák` → `jan.novak`. */
function login(jmeno: string): string {
  const bezDiakritiky = jmeno
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '.');
  return `i:0#.f|membership|${bezDiakritiky}@revoltum.cz`;
}

function osoba(id: number, jmeno: string, loginName?: string): Person {
  return { id, displayName: jmeno, loginName: loginName ?? login(jmeno) };
}

const IGOR = osoba(1, 'Igor Zahrádka');
const JAN = osoba(2, 'Jan Novák');
const EVA = osoba(3, 'Eva Malá');

function clenstvi(role: Role, members: Person[], groupExists: boolean = true): RoleMembership {
  return { role, groupName: DEFAULT_ROLE_GROUPS[role], groupExists, members };
}

describe('normalizeLoginKey', () => {
  it('odstraní předponu SharePointu', () => {
    expect(normalizeLoginKey('i:0#.f|membership|jan.novak@revoltum.cz')).toBe('jan.novak@revoltum.cz');
  });

  it('nevadí mu velikost písmen ani mezery', () => {
    expect(normalizeLoginKey('  JAN.Novak@Revoltum.cz ')).toBe('jan.novak@revoltum.cz');
  });

  it('jméno bez předpony nechá být', () => {
    expect(normalizeLoginKey('jan.novak@revoltum.cz')).toBe('jan.novak@revoltum.cz');
  });

  it('prázdnou hodnotu zvládne', () => {
    expect(normalizeLoginKey('')).toBe('');
  });
});

describe('peopleWithRoles', () => {
  it('bez členství vrátí prázdný seznam', () => {
    expect(peopleWithRoles([])).toEqual([]);
  });

  it('sloučí role jednoho člověka do jednoho řádku', () => {
    const result = peopleWithRoles([
      clenstvi(Role.Administrator, [IGOR]),
      clenstvi(Role.ProjektovyManazer, [IGOR, JAN])
    ]);

    expect(result.length).toBe(2);
    const igor = result.filter((r) => r.person.displayName === 'Igor Zahrádka')[0];
    expect(igor.roles).toEqual([Role.Administrator, Role.ProjektovyManazer]);
  });

  it('pozná stejného člověka i při jiném tvaru přihlašovacího jména', () => {
    const jinak = osoba(9, 'Jan Novák', 'JAN.NOVAK@revoltum.cz');
    const result = peopleWithRoles([
      clenstvi(Role.ProjektovyManazer, [JAN]),
      clenstvi(Role.Vedeni, [jinak])
    ]);

    expect(result.length).toBe(1);
    expect(result[0].roles).toEqual([Role.ProjektovyManazer, Role.Vedeni]);
  });

  it('řadí podle jména česky', () => {
    const result = peopleWithRoles([clenstvi(Role.Ctenar, [JAN, EVA, IGOR])]);
    expect(result.map((r) => r.person.displayName)).toEqual(['Eva Malá', 'Igor Zahrádka', 'Jan Novák']);
  });

  it('stejnou roli dvakrát nepřidá', () => {
    const result = peopleWithRoles([clenstvi(Role.Ctenar, [IGOR]), clenstvi(Role.Ctenar, [IGOR])]);
    expect(result[0].roles).toEqual([Role.Ctenar]);
  });
});

describe('roleSetupIssues', () => {
  function zdrave(): RoleMembership[] {
    return [
      clenstvi(Role.Administrator, [IGOR, JAN]),
      clenstvi(Role.Vedeni, [IGOR]),
      clenstvi(Role.Finance, [IGOR]),
      clenstvi(Role.ProjektovyManazer, [JAN]),
      clenstvi(Role.AsistentPM, [EVA]),
      clenstvi(Role.Ctenar, [EVA])
    ];
  }

  it('u zdravého nastavení nehlásí chyby', () => {
    expect(roleSetupIssues(zdrave()).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('chybějící skupina je chyba, ne upozornění', () => {
    const m = zdrave();
    m[3] = clenstvi(Role.ProjektovyManazer, [], false);
    const chyby = roleSetupIssues(m).filter((i) => i.severity === 'error');
    expect(chyby.length).toBe(1);
    expect(chyby[0].message).toContain(DEFAULT_ROLE_GROUPS[Role.ProjektovyManazer]);
  });

  it('žádný administrátor je chyba', () => {
    const m = zdrave();
    m[0] = clenstvi(Role.Administrator, []);
    expect(roleSetupIssues(m).some((i) => i.severity === 'error' && i.message.indexOf('Administrátor') !== -1)).toBe(
      true
    );
  });

  it('jediný administrátor je upozornění, ne chyba', () => {
    const m = zdrave();
    m[0] = clenstvi(Role.Administrator, [IGOR]);
    const issues = roleSetupIssues(m);
    expect(issues.some((i) => i.severity === 'warning' && i.message.indexOf('jen jeden') !== -1)).toBe(true);
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('prázdná role je jen informace', () => {
    const m = zdrave();
    m[5] = clenstvi(Role.Ctenar, []);
    const info = roleSetupIssues(m).filter((i) => i.severity === 'info');
    expect(info.some((i) => i.message.indexOf(ROLE_LABELS[Role.Ctenar]) !== -1)).toBe(true);
  });

  it('prázdná skupina administrátorů se nehlásí dvakrát', () => {
    const m = zdrave();
    m[0] = clenstvi(Role.Administrator, []);
    const zminky = roleSetupIssues(m).filter((i) => i.message.indexOf('Administrátor PRM') !== -1);
    expect(zminky.length).toBe(1);
  });

  it('upozorní, když je někdo zároveň PM i asistent', () => {
    const m = zdrave();
    m[4] = clenstvi(Role.AsistentPM, [JAN]);
    const w = roleSetupIssues(m).filter((i) => i.severity === 'warning');
    expect(w.some((i) => i.message.indexOf('Jan Novák') !== -1 && i.message.indexOf('asistent') !== -1)).toBe(true);
  });
});

describe('sortMemberships', () => {
  it('řadí od nejširších práv po nejužší, ne abecedně', () => {
    const zamichane = [
      clenstvi(Role.Ctenar, []),
      clenstvi(Role.Administrator, []),
      clenstvi(Role.AsistentPM, []),
      clenstvi(Role.Vedeni, [])
    ];
    expect(sortMemberships(zamichane).map((m) => m.role)).toEqual([
      Role.Administrator,
      Role.Vedeni,
      Role.AsistentPM,
      Role.Ctenar
    ]);
  });

  it('původní pole nemění', () => {
    const puvodni = [clenstvi(Role.Ctenar, []), clenstvi(Role.Administrator, [])];
    sortMemberships(puvodni);
    expect(puvodni[0].role).toBe(Role.Ctenar);
  });
});

describe('expectedGroupNames', () => {
  it('vrátí názvy všech skupin z nastavení', () => {
    expect(expectedGroupNames(DEFAULT_ROLE_GROUPS).length).toBe(ROLE_ORDER.length);
  });

  it('nevyplněný název skupiny vynechá', () => {
    const mapping = { ...DEFAULT_ROLE_GROUPS, [Role.Ctenar]: '  ' };
    expect(expectedGroupNames(mapping).length).toBe(ROLE_ORDER.length - 1);
  });
});

describe('isMember', () => {
  const m = clenstvi(Role.ProjektovyManazer, [JAN]);

  it('pozná člena', () => {
    expect(isMember(m, JAN.loginName)).toBe(true);
  });

  it('pozná člena i v jiném tvaru jména', () => {
    expect(isMember(m, 'JAN.NOVAK@revoltum.cz')).toBe(true);
  });

  it('cizího člověka za člena nepovažuje', () => {
    expect(isMember(m, EVA.loginName)).toBe(false);
  });
});

describe('ROLE_PURPOSE', () => {
  it('každá role má vysvětlení', () => {
    ROLE_ORDER.forEach((role) => {
      expect(ROLE_PURPOSE[role].length).toBeGreaterThan(20);
    });
  });
});

describe('ROLE_PERMISSION_LEVEL', () => {
  it('každá role má přidělenou úroveň oprávnění', () => {
    ROLE_ORDER.forEach((role) => {
      expect(ROLE_PERMISSION_LEVEL[role]).toBeDefined();
    });
  });

  it('jen administrátor má úplné řízení', () => {
    const uplne = ROLE_ORDER.filter((r) => ROLE_PERMISSION_LEVEL[r] === 'Administrator');
    expect(uplne).toEqual([Role.Administrator]);
  });

  it('kdo projekty zakládá nebo schvaluje, má právo zápisu', () => {
    [Role.ProjektovyManazer, Role.AsistentPM, Role.Vedeni].forEach((r) => {
      expect(ROLE_PERMISSION_LEVEL[r]).toBe('Editor');
    });
  });

  it('Finance a Čtenáři jen čtou — důvěrná data jsou na jiném webu', () => {
    expect(ROLE_PERMISSION_LEVEL[Role.Finance]).toBe('Reader');
    expect(ROLE_PERMISSION_LEVEL[Role.Ctenar]).toBe('Reader');
  });

  it('žádná role nedostane víc než úplné řízení ani nic mimo tři známé úrovně', () => {
    ROLE_ORDER.forEach((r) => {
      expect(['Administrator', 'Editor', 'Reader']).toContain(ROLE_PERMISSION_LEVEL[r]);
    });
  });

  it('každá úroveň má český popisek', () => {
    expect(PERMISSION_LEVEL_LABEL.Administrator).toBe('Úplné řízení');
    expect(PERMISSION_LEVEL_LABEL.Editor).toBe('Úpravy');
    expect(PERMISSION_LEVEL_LABEL.Reader).toBe('Čtení');
  });
});

describe('projectManagerCandidates', () => {
  const clovek = (id: number, displayName: string): Person => ({
    id,
    loginName: `i:0#.f|membership|${id}@revoltum.cz`,
    displayName
  });
  const skupina = (role: Role, members: Person[]): RoleMembership => ({
    role,
    groupName: `skupina ${role}`,
    groupExists: true,
    members
  });

  it('nabídne členy rolí PM a Administrátor, ne čtenáře ani vedení', () => {
    const jmena = projectManagerCandidates([
      skupina(Role.ProjektovyManazer, [clovek(1, 'Petr Novák')]),
      skupina(Role.Administrator, [clovek(2, 'Igor Zahrádka')]),
      skupina(Role.Ctenar, [clovek(3, 'Jana Čtenářová')]),
      skupina(Role.Vedeni, [clovek(4, 'Karel Vedoucí')])
    ]);
    expect(jmena).toEqual(['Igor Zahrádka', 'Petr Novák']);
  });

  it('přidá i lidi, kteří už projekt vedou, i když v roli nejsou', () => {
    const jmena = projectManagerCandidates(
      [skupina(Role.ProjektovyManazer, [clovek(1, 'Petr Novák')])],
      ['Bývalý Kolega', undefined, '']
    );
    expect(jmena).toEqual(['Bývalý Kolega', 'Petr Novák']);
  });

  it('člověk ve více rolích a ve vedených projektech je v nabídce jednou', () => {
    const jmena = projectManagerCandidates(
      [
        skupina(Role.ProjektovyManazer, [clovek(1, 'Igor Zahrádka')]),
        skupina(Role.Administrator, [clovek(1, 'Igor Zahrádka')])
      ],
      ['igor zahrádka']
    );
    expect(jmena).toEqual(['Igor Zahrádka']);
  });

  it('řadí česky — Čech až za Cyrilem', () => {
    const jmena = projectManagerCandidates([
      skupina(Role.ProjektovyManazer, [clovek(1, 'Čech'), clovek(2, 'Cyril'), clovek(3, 'Adam')])
    ]);
    expect(jmena).toEqual(['Adam', 'Cyril', 'Čech']);
  });

  it('bez členů a bez projektů vrátí prázdný seznam', () => {
    expect(projectManagerCandidates([])).toEqual([]);
  });
});
