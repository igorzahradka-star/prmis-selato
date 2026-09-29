/**
 * Omezení přístupu k projektu — čistá logika.
 *
 * Součást vrstvy `core` — bez SharePointu a Reactu.
 *
 * Skutečná ochrana není v aplikaci, je v oprávněních SharePointu: záznam
 * projektu i jeho složka dostanou vlastní seznam oprávnění a kdo v něm není,
 * projekt nevidí ani v seznamu, ani ve vyhledávání, ani ve složce. Tahle vrstva
 * jen určuje, **komu** se přístup ponechá, a hlídá, aby nikdy nezůstal zamčený
 * i před správci.
 */

import { Role } from './types';
import { RoleGroupMapping } from './roles';
import { PermissionLevel, ROLE_PERMISSION_LEVEL } from './userAdmin';

/**
 * Kdo smí vidět Režii. Projektoví manažeři a asistenti ne — Režie nese
 * náklady firmy jako celku (nájmy, mzdy, software), které se jich netýkají.
 */
export const OVERHEAD_ACCESS_ROLES: Role[] = [Role.Administrator, Role.Vedeni, Role.Finance];

/** Jedna skupina, které se přístup ponechá, a s jakým oprávněním. */
export interface AccessGroup {
  role: Role;
  groupName: string;
  level: PermissionLevel;
}

/**
 * Skupiny, které mají mít přístup k omezenému projektu.
 *
 * **Administrátoři jsou vždy.** Kdyby se omezením zamkl projekt i před nimi,
 * nešlo by přístup vrátit jinak než přes správu SharePointu.
 * Prázdné názvy skupin a duplicity se přeskočí; administrátoři jsou první.
 */
export function accessGroupsForRoles(roles: Role[], mapping: RoleGroupMapping): AccessGroup[] {
  const ordered = [Role.Administrator, ...roles.filter((r) => r !== Role.Administrator)];

  const seen: string[] = [];
  const result: AccessGroup[] = [];
  ordered.forEach((role) => {
    const groupName = (mapping[role] || '').trim();
    const key = groupName.toLocaleLowerCase('cs-CZ');
    if (!groupName || seen.indexOf(key) !== -1) {
      return;
    }
    seen.push(key);
    result.push({ role, groupName, level: ROLE_PERMISSION_LEVEL[role] });
  });
  return result;
}

/** Omezovat přístup k projektům smí jen administrátor — ostatní na to nemají v SharePointu právo. */
export function canManageProjectAccess(userRoles: Role[]): boolean {
  return userRoles.indexOf(Role.Administrator) !== -1;
}

/** Skutečný stav oprávnění projektu, tak jak ho hlásí SharePoint. */
export interface ProjectAccessState {
  /** Záznam projektu má vlastní seznam oprávnění (nedědí je z webu). */
  recordRestricted: boolean;
  /** Složka projektu má vlastní seznam oprávnění. `undefined` = projekt složku nemá. */
  folderRestricted?: boolean;
  /** Kdo má k záznamu přístup (názvy skupin a lidí). Prázdné, dokud není omezený. */
  allowed: string[];
}

/** Je omezený záznam i složka (existuje-li)? Jen tehdy je projekt opravdu chráněný. */
export function isFullyRestricted(state: ProjectAccessState): boolean {
  return state.recordRestricted && state.folderRestricted !== false;
}

/**
 * Kdo má přístup **navíc** oproti tomu, co jsme chtěli — typicky člověk, který
 * omezení provedl, nebo někdo přidaný ručně v SharePointu. Není to chyba,
 * ale správce má vidět celou pravdu, ne jen to, co si přál.
 */
export function unexpectedAccess(state: ProjectAccessState, groups: AccessGroup[]): string[] {
  const expected = groups.map((g) => g.groupName.toLocaleLowerCase('cs-CZ'));
  return state.allowed.filter((name) => expected.indexOf(name.trim().toLocaleLowerCase('cs-CZ')) === -1);
}
