/**
 * Přiřazování rolí uživatelům — čistá logika.
 *
 * Součást vrstvy `core` — bez SharePointu a Reactu.
 *
 * **Role = členství ve skupině SharePointu.** Aplikace si vlastní seznam
 * uživatelů nevede; kdyby si ho vedla, rozešel by se s tím, co SharePoint
 * skutečně povolí, a lidé by koukali na prázdné obrazovky. Tahle vrstva jen
 * převádí členství ve skupinách na srozumitelný přehled a hlídá, co nedává smysl.
 */

import { Role, ROLE_LABELS } from './types';
import { RoleGroupMapping } from './roles';

/** Člověk, jak ho vrací SharePoint. */
export interface Person {
  /** ID uživatele v rámci webu. */
  id: number;
  /** Přihlašovací jméno, např. `i:0#.f|membership|jan.novak@revoltum.cz`. */
  loginName: string;
  displayName: string;
  email?: string;
}

/** Jedna role a kdo v ní je. */
export interface RoleMembership {
  role: Role;
  /** Název skupiny SharePointu podle Nastavení. */
  groupName: string;
  /** `false` = skupina na webu neexistuje, role nikomu nefunguje. */
  groupExists: boolean;
  members: Person[];
}

/** Člověk a všechny role, které má. */
export interface PersonRoles {
  person: Person;
  roles: Role[];
}

/** Varování k nastavení rolí. `severity` rozhoduje o barvě v UI. */
export interface RoleSetupIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
}

/**
 * Převrátí pohled: místo „role → lidé" vrátí „člověk → jeho role".
 *
 * Řadí se podle jména česky. Člověk se pozná podle přihlašovacího jména,
 * ne podle ID — to je jedinečné jen v rámci jednoho webu, a role se čtou
 * i z webu PRM-Finance.
 */
export function peopleWithRoles(memberships: RoleMembership[]): PersonRoles[] {
  const byLogin = new Map<string, PersonRoles>();

  memberships.forEach((m) => {
    m.members.forEach((person) => {
      const key = normalizeLoginKey(person.loginName);
      const existing = byLogin.get(key);
      if (existing) {
        if (existing.roles.indexOf(m.role) === -1) {
          existing.roles.push(m.role);
        }
      } else {
        byLogin.set(key, { person, roles: [m.role] });
      }
    });
  });

  const result: PersonRoles[] = [];
  byLogin.forEach((v) => result.push(v));
  result.sort((a, b) => a.person.displayName.localeCompare(b.person.displayName, 'cs-CZ'));
  return result;
}

/**
 * Co je na nastavení rolí špatně nebo podezřelé.
 *
 * Záměrně rozlišuje **chybu** (něco nefunguje) od **upozornění** (funguje,
 * ale nejspíš to tak nechcete). Kdyby bylo všechno „chyba", přestal by si
 * toho člověk všímat.
 */
export function roleSetupIssues(memberships: RoleMembership[]): RoleSetupIssue[] {
  const issues: RoleSetupIssue[] = [];

  memberships.forEach((m) => {
    if (!m.groupExists) {
      issues.push({
        severity: 'error',
        message: `Skupina „${m.groupName}" na webu neexistuje, takže roli ${ROLE_LABELS[m.role]} nemá kdo dostat. Založte ji tlačítkem výše.`
      });
    }
  });

  const admin = memberships.filter((m) => m.role === Role.Administrator)[0];
  if (admin && admin.groupExists && admin.members.length === 0) {
    issues.push({
      severity: 'error',
      message:
        'Nikdo nemá roli Administrátor PRM. Nastavení a instalaci pak nemá kdo otevřít — přidejte aspoň jednoho člověka.'
    });
  }

  memberships.forEach((m) => {
    if (m.groupExists && m.members.length === 0 && m.role !== Role.Administrator) {
      issues.push({
        severity: 'info',
        message: `Roli ${ROLE_LABELS[m.role]} zatím nemá nikdo.`
      });
    }
  });

  if (admin && admin.members.length === 1) {
    issues.push({
      severity: 'warning',
      message: `Administrátor je jen jeden (${admin.members[0].displayName}). Když bude nedostupný, nemá kdo měnit nastavení — zvažte druhého.`
    });
  }

  // Asistent nemá schvalovat; když je někdo zároveň PM i asistentem,
  // dostane práva PM a role asistenta je zbytečná. Data to nepoškodí,
  // ale bývá to překlep při zadávání.
  peopleWithRoles(memberships)
    .filter((p) => p.roles.indexOf(Role.ProjektovyManazer) !== -1 && p.roles.indexOf(Role.AsistentPM) !== -1)
    .forEach((p) => {
      issues.push({
        severity: 'warning',
        message: `${p.person.displayName} je zároveň projektový manažer i asistent. Role asistenta je tím zbytečná — práva PM jsou širší.`
      });
    });

  return issues;
}

/** Krátké vysvětlení, co která role smí — aby šlo role přiřazovat bez dohadování. */
export const ROLE_PURPOSE: Record<Role, string> = {
  [Role.Administrator]:
    'Nastavení, instalace, číselné řady, šablony složek, správa rolí. Jediný, kdo smí smazat projekt.',
  [Role.Vedeni]: 'Vidí všechny projekty, schvaluje objednávky nad limit PM a realizační rozpočty.',
  [Role.Jednatel]: 'Schvaluje objednávky nad limit vedení. Nevidí víc než vedení, jen má poslední slovo u velkých objednávek.',
  [Role.Finance]:
    'Firemní cashflow a důvěrné částky. Kromě role musí mít i přístup na web PRM-Finance — to se ověřuje zvlášť.',
  [Role.ProjektovyManazer]:
    'Zakládá a vede své projekty, schvaluje objednávky do svého limitu. Projekty mazat nesmí — má na to stav Storno.',
  [Role.AsistentPM]: 'Pracuje na přiřazených projektech, vystavuje objednávky, ale neschvaluje je.',
  [Role.Ctenar]: 'Jen čte projekty. Nic nemění.'
};

/**
 * Pořadí rolí v UI — od nejširších práv po nejužší, ne abecedně.
 * Abecedně by Administrátor skončil vedle Asistenta a přehled by zmizel.
 */
export const ROLE_ORDER: Role[] = [
  Role.Administrator,
  Role.Vedeni,
  Role.Jednatel,
  Role.Finance,
  Role.ProjektovyManazer,
  Role.AsistentPM,
  Role.Ctenar
];

/** Seřadí členství podle `ROLE_ORDER`; role mimo pořadí skončí na konci. */
export function sortMemberships(memberships: RoleMembership[]): RoleMembership[] {
  return memberships.slice().sort((a, b) => {
    const ia = ROLE_ORDER.indexOf(a.role);
    const ib = ROLE_ORDER.indexOf(b.role);
    return (ia === -1 ? ROLE_ORDER.length : ia) - (ib === -1 ? ROLE_ORDER.length : ib);
  });
}

/**
 * Jakou úroveň oprávnění na webu má skupina dané role.
 *
 * Jde o **výchozí** hodnoty, se kterými se skupina zakládá. Názvy úrovní jsou
 * v SharePointu lokalizované (česky "Úpravy", "Čtení"), proto se tu používají
 * jazykově nezávislé typy: `Administrator` = Úplné řízení, `Editor` = Úpravy,
 * `Reader` = Čtení.
 *
 * Finance a Čtenáři jen čtou: důvěrná data Finance leží na samostatném webu
 * s vlastními oprávněními a role na tomhle webu jim k nim nedá přístup.
 */
export type PermissionLevel = 'Administrator' | 'Editor' | 'Reader';

export const ROLE_PERMISSION_LEVEL: Record<Role, PermissionLevel> = {
  [Role.Administrator]: 'Administrator',
  [Role.Vedeni]: 'Editor',
  // Schválení zapisuje do objednávky, proto Úpravy (Čtení by nestačilo).
  [Role.Jednatel]: 'Editor',
  [Role.Finance]: 'Reader',
  [Role.ProjektovyManazer]: 'Editor',
  [Role.AsistentPM]: 'Editor',
  [Role.Ctenar]: 'Reader'
};

/** Česky pro hlášky v UI. */
export const PERMISSION_LEVEL_LABEL: Record<PermissionLevel, string> = {
  Administrator: 'Úplné řízení',
  Editor: 'Úpravy',
  Reader: 'Čtení'
};

/** Skupiny, které mají podle Nastavení existovat — vstup pro jejich založení. */
export function expectedGroupNames(mapping: RoleGroupMapping): string[] {
  return ROLE_ORDER.map((role) => mapping[role]).filter((name) => !!name && name.trim() !== '');
}

/**
 * Je člověk už v této roli? Porovnává podle přihlašovacího jména bez ohledu
 * na velikost písmen a na předponu `i:0#.f|membership|`.
 */
export function isMember(membership: RoleMembership, loginName: string): boolean {
  const key = normalizeLoginKey(loginName);
  return membership.members.some((m) => normalizeLoginKey(m.loginName) === key);
}

/**
 * Klíč pro porovnání uživatelů. SharePoint vrací totéž jméno v několika
 * tvarech (`i:0#.f|membership|jan@x.cz`, `jan@x.cz`, různá velikost písmen),
 * takže porovnávat celý řetězec by vyrobilo duplicity v přehledu.
 */
export function normalizeLoginKey(loginName: string): string {
  const lower = (loginName || '').trim().toLocaleLowerCase('cs-CZ');
  const pipe = lower.lastIndexOf('|');
  return pipe >= 0 ? lower.slice(pipe + 1) : lower;
}

/**
 * Kdo se může nabídnout jako projektový manažer: členové rolí Projektový manažer
 * a Administrátor (ti projekty zakládají — `canCreateProject`) plus všichni, kdo
 * už nějaký projekt vedou. Bez členů rolí by nabídka obsahovala jen lidi, kteří
 * už projekt mají, a nového manažera by nešlo zvolit vůbec.
 *
 * Jména se sloučí bez ohledu na velikost písmen a seřadí česky.
 */
export function projectManagerCandidates(
  memberships: RoleMembership[],
  existingNames: (string | undefined)[] = []
): string[] {
  const names: string[] = [];
  const seen: string[] = [];
  const add = (raw: string | undefined): void => {
    const name = (raw || '').trim();
    const key = name.toLocaleLowerCase('cs-CZ');
    if (name && seen.indexOf(key) === -1) {
      seen.push(key);
      names.push(name);
    }
  };

  memberships
    .filter((m) => m.role === Role.ProjektovyManazer || m.role === Role.Administrator)
    .forEach((m) => m.members.forEach((p) => add(p.displayName)));
  existingNames.forEach(add);

  return names.sort((a, b) => a.localeCompare(b, 'cs-CZ'));
}
