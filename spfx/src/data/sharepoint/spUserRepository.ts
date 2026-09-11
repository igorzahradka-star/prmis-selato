/**
 * Zjištění přihlášeného uživatele, jeho rolí a přístupu k důvěrným datům.
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { PermissionKind } from '@pnp/sp/security/index.js';
import { CurrentUser, Role } from '../../core/types';
import { AppSettings } from '../../core/settings';
import { resolveRoles } from '../../core/roles';
import { IUserRepository } from '../repositories';
import { getSp, getSpForSite } from './spContext';

export class SpUserRepository implements IUserRepository {
  public constructor(
    private readonly context: WebPartContext,
    /** URL webu PRM-Finance. Prázdné = finanční moduly se nezobrazí nikomu. */
    private readonly financeSiteUrl: string
  ) {}

  public async getCurrentUser(settings: AppSettings): Promise<CurrentUser> {
    const sp = getSp(this.context);

    const user = await sp.web.currentUser.select('Id', 'LoginName', 'Title', 'Email', 'IsSiteAdmin')();

    let groupNames: string[] = [];
    try {
      const groups = await sp.web.currentUser.groups.select('Title')();
      groupNames = groups.map((g: { Title: string }) => g.Title);
    } catch {
      // Někteří uživatelé nemají právo číst vlastní členství ve skupinách.
      // Není to důvod aplikaci neotevřít — jen nedostanou role nad rámec čtení.
      groupNames = [];
    }

    const isSiteAdmin = user.IsSiteAdmin === true || (await this.canManageWeb(sp));
    const roles = resolveRoles(groupNames, settings.roles, isSiteAdmin);
    const hasFinanceAccess = await this.checkFinanceAccess(roles);

    return {
      id: user.Id,
      loginName: user.LoginName,
      displayName: user.Title,
      email: user.Email,
      roles,
      isSiteAdmin,
      hasFinanceAccess
    };
  }

  /** Smí uživatel spravovat seznamy? Kdo to smí, je fakticky administrátor aplikace. */
  private async canManageWeb(sp: ReturnType<typeof getSp>): Promise<boolean> {
    try {
      return await sp.web.currentUserHasPermissions(PermissionKind.ManageLists);
    } catch {
      return false;
    }
  }

  /**
   * Ověří **skutečný** přístup na web PRM-Finance jedním dotazem.
   *
   * Proč ne jen podle skupiny: skupina je jen štítek v Nastavení. Kdyby někdo
   * uživatele přidal do skupiny, ale oprávnění na webu mu nedal, aplikace by
   * mu ukázala prázdné obrazovky a chybové hlášky. Takhle ví, na čem je.
   * A naopak — i kdyby modul někdo vyvolal ručně, SharePoint data nevydá.
   */
  private async checkFinanceAccess(roles: Role[]): Promise<boolean> {
    if (!this.financeSiteUrl) {
      return false;
    }
    if (roles.indexOf(Role.Finance) === -1 && roles.indexOf(Role.Administrator) === -1) {
      // Bez role se na web nedotazujeme — ušetří to jedno volání při každém načtení.
      return false;
    }
    try {
      const finSp = getSpForSite(this.context, this.financeSiteUrl);
      await finSp.web.select('Title')();
      return true;
    } catch {
      return false;
    }
  }
}
