/**
 * Úklid dat podle role na jednom místě: z repozitáře projektů vyřadí projekty Režie, když je uživatel nesmí vidět.
 *
 * Obrazovky tak nemusí hlídat Režii každá zvlášť — seznamy (přehled, mapa, objednávky, fakturace…) i otevření detailu
 * projektu Režie dostanou jen povolené projekty. (Skutečnou ochranu dat dělá SharePoint, viz CLAUDE.md, kap. 4.)
 */

import { Project } from '../core/types';
import { RepositorySet } from './repositories';

export interface RoleGuardOptions {
  /** Skrýt projekty Režie (uživatel není vedení, jednatel, finance ani administrátor). */
  hideOverhead: boolean;
}

/** Vrátí sadu repozitářů, jejíž `projects` vynechává to, co uživatel nesmí vidět. Bez omezení vrací původní sadu. */
export function withRoleGuards(repos: RepositorySet, options: RoleGuardOptions): RepositorySet {
  if (!options.hideOverhead) {
    return repos;
  }
  const target = repos.projects;
  const projects = new Proxy(target, {
    get(t, prop, receiver) {
      if (prop === 'list') {
        return async (...args: unknown[]): Promise<Project[]> => ((await (t.list as (...a: unknown[]) => Promise<Project[]>)(...args)) as Project[]).filter((p) => !p.isOverhead);
      }
      if (prop === 'getByNumber') {
        return async (...args: unknown[]): Promise<Project | undefined> => {
          const p = await (t.getByNumber as (...a: unknown[]) => Promise<Project | undefined>)(...args);
          return p && p.isOverhead ? undefined : p;
        };
      }
      const value = Reflect.get(t, prop, receiver);
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(t) : value;
    }
  });
  return { ...repos, projects };
}
