/**
 * Role a oprávnění — čistá logika.
 *
 * DŮLEŽITÉ: tato vrstva rozhoduje jen o tom, co se uživateli **zobrazí**.
 * Skutečnou ochranu dat zajišťují oprávnění SharePointu (viz CLAUDE.md, kap. 4).
 * U kritických operací (schválení objednávky) se pravidla ověřují znovu
 * těsně před zápisem a zapisují do auditu.
 */

import { Role } from './types';

/**
 * Mapování rolí na názvy SharePoint skupin.
 * Názvy jsou konfigurovatelné v Nastavení — toto jsou výchozí hodnoty.
 */
export interface RoleGroupMapping {
  [Role.Administrator]: string;
  [Role.Vedeni]: string;
  [Role.Jednatel]: string;
  [Role.Finance]: string;
  [Role.ProjektovyManazer]: string;
  [Role.AsistentPM]: string;
  [Role.SpravceServisu]: string;
  [Role.Dispecer]: string;
  [Role.Ctenar]: string;
}

export const DEFAULT_ROLE_GROUPS: RoleGroupMapping = {
  [Role.Administrator]: 'PRM Administrátoři',
  [Role.Vedeni]: 'PRM Vedení',
  [Role.Jednatel]: 'PRM Jednatelé',
  [Role.Finance]: 'PRM Finance – důvěrné',
  [Role.ProjektovyManazer]: 'PRM Projektoví manažeři',
  [Role.AsistentPM]: 'PRM Asistenti',
  [Role.SpravceServisu]: 'PRM Správci servisu',
  [Role.Dispecer]: 'PRM Dispečeři servisu',
  [Role.Ctenar]: 'PRM Čtenáři'
};

/**
 * Z názvů skupin, ve kterých je uživatel členem, odvodí jeho role.
 *
 * Porovnává se bez ohledu na velikost písmen a okolní mezery — správci
 * SharePointu skupiny občas přejmenují s jiným zápisem.
 *
 * @param groupNames názvy skupin, ve kterých je uživatel členem
 * @param mapping    mapování rolí na názvy skupin (z Nastavení)
 * @param isSiteAdmin je-li uživatel vlastníkem webu, přidá se role Administrátor
 */
export function resolveRoles(
  groupNames: string[],
  mapping: RoleGroupMapping = DEFAULT_ROLE_GROUPS,
  isSiteAdmin: boolean = false
): Role[] {
  const normalized = new Set(groupNames.map((g) => g.trim().toLocaleLowerCase('cs-CZ')));
  const roles: Role[] = [];

  (Object.keys(mapping) as Role[]).forEach((role) => {
    const groupName = mapping[role];
    if (groupName && normalized.has(groupName.trim().toLocaleLowerCase('cs-CZ'))) {
      roles.push(role);
    }
  });

  if (isSiteAdmin && roles.indexOf(Role.Administrator) === -1) {
    roles.push(Role.Administrator);
  }

  return roles;
}

/** Má uživatel alespoň jednu z uvedených rolí? */
export function hasAnyRole(userRoles: Role[], ...required: Role[]): boolean {
  return required.some((r) => userRoles.indexOf(r) !== -1);
}

/**
 * Smí uživatel zakládat nové projekty?
 * PM a administrátor ano, asistent ne (asistent pracuje na už založených).
 */
export function canCreateProject(userRoles: Role[]): boolean {
  return hasAnyRole(userRoles, Role.Administrator, Role.ProjektovyManazer);
}

/**
 * Smí uživatel editovat konkrétní projekt?
 *
 * Výchozí pravidlo (konfigurovatelné): všichni PM vidí seznam všech projektů,
 * ale editovat mohou jen projekty, kde jsou PM nebo asistentem.
 * Administrátor a Vedení mohou vždy.
 */
export function canEditProject(
  userRoles: Role[],
  userLoginName: string,
  project: { projectManagerLogin?: string; assistantLogins?: string[] }
): boolean {
  if (hasAnyRole(userRoles, Role.Administrator, Role.Vedeni)) {
    return true;
  }
  if (!hasAnyRole(userRoles, Role.ProjektovyManazer, Role.AsistentPM)) {
    return false;
  }
  const me = normalizeLogin(userLoginName);
  if (project.projectManagerLogin && normalizeLogin(project.projectManagerLogin) === me) {
    return true;
  }
  return (project.assistantLogins ?? []).some((l) => normalizeLogin(l) === me);
}

/**
 * Smí uživatel smazat projekt?
 *
 * **Jen administrátor** — a to ani ne proto, že by PM nebyl důvěryhodný, ale
 * protože smazání projektu shodí i vazby dokladů, které na něj odkazují.
 * Projektový manažer má místo mazání stav „Storno".
 *
 * Záměrně nezávisí na tom, čí je to projekt: administrátor smí smazat každý,
 * projektový manažer žádný — ani vlastní.
 */
export function canDeleteProject(userRoles: Role[]): boolean {
  return hasAnyRole(userRoles, Role.Administrator);
}

/**
 * Smí uživatel zakládat a upravovat partnery (zákazníky, dodavatele)?
 * PM a asistent je zakládají za chodu při vystavování objednávek a zakázek.
 */
export function canManagePartners(userRoles: Role[]): boolean {
  return hasAnyRole(userRoles, Role.Administrator, Role.ProjektovyManazer, Role.AsistentPM);
}

/** Smí uživatel vidět stránku Nastavení a Instalaci? */
export function canOpenAdmin(userRoles: Role[]): boolean {
  return hasAnyRole(userRoles, Role.Administrator);
}

/**
 * Smí uživatel vidět finanční (důvěrné) moduly?
 *
 * Nestačí role — musí mít i skutečný přístup na web PRM-Finance.
 * Role bez přístupu = chyba v nastavení oprávnění; modul se nezobrazí.
 */
export function canOpenFinance(userRoles: Role[], hasFinanceSiteAccess: boolean): boolean {
  return hasFinanceSiteAccess && hasAnyRole(userRoles, Role.Finance, Role.Administrator);
}

/** Smí uživatel vidět benchmark projektů? */
export function canOpenBenchmark(userRoles: Role[]): boolean {
  return hasAnyRole(userRoles, Role.Administrator, Role.Vedeni);
}

/**
 * Nikdo nesmí schválit doklad, který sám vystavil — ani administrátor.
 * Toto pravidlo je tvrdé a ověřuje se znovu těsně před zápisem schválení.
 */
export function isSelfApproval(approverLogin: string, createdByLogin: string): boolean {
  return normalizeLogin(approverLogin) === normalizeLogin(createdByLogin);
}

/**
 * Sjednotí zápis přihlašovacího jména pro porovnání.
 * SharePoint vrací `i:0#.f|membership|jan.novak@revoltum.cz`, Graph jen e-mail.
 */
export function normalizeLogin(login: string | undefined): string {
  if (!login) {
    return '';
  }
  const parts = login.split('|');
  return parts[parts.length - 1].trim().toLocaleLowerCase('cs-CZ');
}
