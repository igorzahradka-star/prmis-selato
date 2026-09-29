/**
 * Nabídka jmen projektových manažerů pro filtry a formuláře.
 *
 * Bere se z členů rolí (viz `projectManagerCandidates`), ne jen z lidí, kteří
 * už nějaký projekt vedou — jinak by šel zvolit jen ten, kdo projekt má.
 * Když se členy rolí nepodaří načíst, nabídka spadne na jména z projektů.
 */

import { RepositorySet } from '../../data/repositories';
import { RoleGroupMapping } from '../../core/roles';
import { RoleMembership, projectManagerCandidates } from '../../core/userAdmin';

export async function loadProjectManagerNames(
  repos: RepositorySet,
  roles: RoleGroupMapping,
  alsoInclude: (string | undefined)[] = []
): Promise<string[]> {
  const [memberships, projects] = await Promise.all([
    repos.userAdmin.listRoleMembers(roles).catch((): RoleMembership[] => []),
    repos.projects.list({}).catch(() => [])
  ]);
  return projectManagerCandidates(memberships, [
    ...projects.map((p) => p.projectManagerName),
    ...alsoInclude
  ]);
}
