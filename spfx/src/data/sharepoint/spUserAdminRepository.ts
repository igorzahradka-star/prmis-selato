/**
 * Správa rolí = správa členství ve skupinách SharePointu.
 *
 * Aplikace si **nevede vlastní seznam uživatelů**. Kdyby si ho vedla,
 * rozešel by se s tím, co SharePoint skutečně povolí: člověk by byl
 * v aplikaci „projektový manažer", ale na seznam by ho SharePoint nepustil.
 * Jediná pravda je členství ve skupině webu.
 *
 * Měnit skupiny smí jen vlastník webu. Když uživatel právo nemá, SharePoint
 * vrátí 403 a chybová hláška to říká rovnou — není to chyba aplikace.
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { SPHttpClient } from '@microsoft/sp-http';
import { RoleGroupMapping } from '../../core/roles';
import { Person, RoleMembership, ROLE_ORDER } from '../../core/userAdmin';
import { IUserAdminRepository } from '../repositories';
import { getSp, describeSpError, extractStatus } from './spContext';
import { peoplePickerQuery, parsePeoplePickerResults } from './peoplePicker';

interface SiteUserItem {
  Id: number;
  LoginName: string;
  Title: string;
  Email?: string;
}

export class SpUserAdminRepository implements IUserAdminRepository {
  public constructor(private readonly context: WebPartContext) {}

  public async listRoleMembers(mapping: RoleGroupMapping): Promise<RoleMembership[]> {
    const sp = getSp(this.context);

    // Role se načítají paralelně — je jich šest a sériově by se čekání sčítalo.
    return Promise.all(
      ROLE_ORDER.map(async (role) => {
        const groupName = mapping[role];
        if (!groupName || !groupName.trim()) {
          return { role, groupName: groupName ?? '', groupExists: false, members: [] };
        }
        try {
          const users: SiteUserItem[] = await sp.web.siteGroups
            .getByName(groupName)
            .users.select('Id', 'LoginName', 'Title', 'Email')();
          return { role, groupName, groupExists: true, members: users.map(toPerson) };
        } catch (error) {
          // 404 = skupina neexistuje. Cokoli jiného je skutečná chyba a nemá
          // se tvářit jako „skupina chybí" — to by správce poslalo špatným směrem.
          if (extractStatus(error) === 404) {
            return { role, groupName, groupExists: false, members: [] };
          }
          throw new Error(describeSpError(error, `Nepodařilo se načíst členy skupiny „${groupName}"`));
        }
      })
    );
  }

  /**
   * Hledá v adresáři firmy, ne jen mezi lidmi, kteří na webu už byli.
   * Používá stejné rozhraní jako výběr osob v SharePointu
   * (`ClientPeoplePickerSearchUser`) — jiná cesta k Entra ID z prohlížeče
   * bez zvláštních oprávnění nevede.
   */
  public async searchPeople(query: string): Promise<Person[]> {
    const trimmed = (query || '').trim();
    if (trimmed.length < 3) {
      // Kratší dotaz vrací stovky lidí a nikomu nepomůže.
      return [];
    }

    const endpoint = `${this.context.pageContext.web.absoluteUrl}/_api/SP.UI.ApplicationPages.ClientPeoplePickerWebServiceInterface.ClientPeoplePickerSearchUser`;

    try {
      // Vlastní REST volání přes SPHttpClient, ne přes PnPjs: tohle rozhraní
      // PnPjs v4 nemá zabalené a jiná cesta k adresáři firmy z prohlížeče
      // bez zvláštních oprávnění nevede.
      const response = await this.context.spHttpClient.post(
        endpoint,
        SPHttpClient.configurations.v1,
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            // SPHttpClient posílá sám `OData-Version: 4.0`. Tenhle starý
            // endpoint na ni odpoví HTTP 400, takže ji musíme umlčet.
            'odata-version': ''
          },
          body: JSON.stringify(peoplePickerQuery(trimmed))
        }
      );

      if (!response.ok) {
        // Tělo odpovědi bývá jediné místo, kde SharePoint řekne, co mu vadí.
        // Bez něj je z 400 jen "nepodařilo se" a nedá se s tím nic dělat.
        const detail = await response.text().catch(() => '');
        throw new Error(
          `Hledání lidí selhalo (HTTP ${response.status}). ${shortenDetail(detail)}`
        );
      }
      return parsePeoplePickerResults(await response.json());
    } catch (error) {
      throw new Error(describeSpError(error, 'Hledání lidí se nepodařilo'));
    }
  }

  public async addToRole(groupName: string, loginName: string): Promise<void> {
    const sp = getSp(this.context);
    try {
      // SharePoint přidání už existujícího člena tiše přejde — nemusíme kontrolovat.
      await sp.web.siteGroups.getByName(groupName).users.add(loginName);
    } catch (error) {
      throw new Error(
        describeSpError(error, `Nepodařilo se přidat uživatele do skupiny „${groupName}". Měnit skupiny smí jen vlastník webu`)
      );
    }
  }

  public async removeFromRole(groupName: string, userId: number): Promise<void> {
    const sp = getSp(this.context);
    try {
      await sp.web.siteGroups.getByName(groupName).users.removeById(userId);
    } catch (error) {
      throw new Error(
        describeSpError(error, `Nepodařilo se odebrat uživatele ze skupiny „${groupName}". Měnit skupiny smí jen vlastník webu`)
      );
    }
  }

  /**
   * Založí chybějící skupiny. Nikdy nic nemaže ani nepřejmenovává —
   * stejné pravidlo jako u instalace seznamů (CLAUDE.md, kap. 4).
   *
   * Nové skupiny dostanou oprávnění **Číst**. Víc jim dávat automaticky
   * by znamenalo rozdat práva, o kterých správce neví; upravit se dají
   * v SharePointu.
   */
  public async ensureRoleGroups(mapping: RoleGroupMapping): Promise<string[]> {
    const sp = getSp(this.context);
    const vytvorene: string[] = [];

    for (const role of ROLE_ORDER) {
      const groupName = mapping[role];
      if (!groupName || !groupName.trim()) {
        continue;
      }
      try {
        await sp.web.siteGroups.getByName(groupName).select('Id')();
        continue; // skupina existuje, nech ji být
      } catch (error) {
        if (extractStatus(error) !== 404) {
          throw new Error(describeSpError(error, `Nepodařilo se ověřit skupinu „${groupName}"`));
        }
      }

      try {
        await sp.web.siteGroups.add({
          Title: groupName,
          Description: `Role PRM Revoltum — ${groupName}. Spravuje se přes stránku Uživatelé a role.`,
          AllowMembersEditMembership: false,
          OnlyAllowMembersViewMembership: false
        });
        vytvorene.push(groupName);
      } catch (error) {
        throw new Error(
          describeSpError(error, `Nepodařilo se založit skupinu „${groupName}". Zakládat skupiny smí jen vlastník webu`)
        );
      }
    }

    return vytvorene;
  }
}

/**
 * Zkrátí odpověď serveru na čitelnou větu. SharePoint vrací celý JSON
 * s obalem, do hlášky v UI se nevejde a uživateli nic neřekne — ale prvních
 * pár set znaků obvykle obsahuje skutečnou příčinu.
 */
function shortenDetail(raw: string): string {
  if (!raw) {
    return '';
  }
  try {
    const json = JSON.parse(raw);
    const message = json?.error?.message?.value ?? json?.error?.message ?? json?.['odata.error']?.message?.value;
    if (typeof message === 'string' && message) {
      return message;
    }
  } catch {
    // Není to JSON — použijeme text tak, jak přišel.
  }
  return raw.length > 300 ? `${raw.slice(0, 300)}…` : raw;
}

function toPerson(u: SiteUserItem): Person {
  return { id: u.Id, loginName: u.LoginName, displayName: u.Title, email: u.Email };
}
