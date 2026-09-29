/**
 * Společné pomůcky pro oprávnění SharePointu.
 *
 * Úrovně se hledají podle jazykově nezávislého typu (`RoleTypeKind`), ne podle
 * názvu ("Úpravy", "Čtení") — ten se liší podle jazyka webu.
 */

import { SPFI } from '@pnp/sp';
import { PermissionLevel } from '../../core/userAdmin';

/** Typy úrovní oprávnění v SharePointu (`SP.RoleType`): 2 = Čtení, 5 = Úplné řízení, 6 = Úpravy. */
export const ROLE_TYPE_KIND: Record<PermissionLevel, 2 | 5 | 6> = {
  Reader: 2,
  Editor: 6,
  Administrator: 5
};

/** ID úrovně oprávnění na daném webu. */
export async function roleDefinitionId(sp: SPFI, level: PermissionLevel): Promise<number> {
  const definition: { Id: number } = await sp.web.roleDefinitions.getByType(ROLE_TYPE_KIND[level])();
  return definition.Id;
}
