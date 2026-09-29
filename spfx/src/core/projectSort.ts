/**
 * Řazení seznamu projektů podle sloupce — čistá logika.
 *
 * Prázdné hodnoty (projekt bez ceny, bez termínu) jsou vždy **na konci**,
 * ať se řadí vzestupně, nebo sestupně: sestupné řazení podle termínu má
 * nahoře nejpozdější termín, ne desítky projektů bez termínu.
 */

import { Project } from './types';

export type ProjectSortKey =
  | 'number'
  | 'title'
  | 'pm'
  | 'price'
  | 'deadline'
  | 'start'
  | 'end'
  | 'status';

/** Výchozí řazení dashboardu: podle čísla vzestupně. */
export const DEFAULT_SORT: { key: ProjectSortKey; descending: boolean } = {
  key: 'number',
  descending: false
};

type SortValue = string | number | undefined;

function valueOf(p: Project, key: ProjectSortKey): SortValue {
  switch (key) {
    case 'number':
      return p.projectNumber;
    case 'title':
      return p.shortName || p.title;
    case 'pm':
      return p.projectManagerName;
    case 'price':
      return p.contractPriceNet;
    case 'deadline':
      return p.nextDeadline ? p.nextDeadline.getTime() : undefined;
    case 'start':
      return p.startDate ? p.startDate.getTime() : undefined;
    case 'end': {
      // Ve sloupci Ukončení se ukazuje skutečné, a když není, plánované.
      const d = p.endDateActual ?? p.endDatePlanned;
      return d ? d.getTime() : undefined;
    }
    case 'status':
      return p.status;
  }
}

function isEmpty(v: SortValue): boolean {
  return v === undefined || v === '' || (typeof v === 'number' && isNaN(v));
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  // `numeric` řadí čísla projektů podle hodnoty (26009 před 26010) i kdyby
  // měla různou délku.
  return String(a).localeCompare(String(b), 'cs-CZ', { numeric: true });
}

/** Seřadí kopii seznamu; původní pole se nemění. Při shodě zůstává původní pořadí. */
export function sortProjects(projects: Project[], key: ProjectSortKey, descending: boolean): Project[] {
  return projects
    .map((p, index) => ({ p, index, v: valueOf(p, key) }))
    .sort((x, y) => {
      const xe = isEmpty(x.v);
      const ye = isEmpty(y.v);
      if (xe || ye) {
        return xe && ye ? x.index - y.index : xe ? 1 : -1;
      }
      const c = compareValues(x.v as string | number, y.v as string | number);
      return c !== 0 ? (descending ? -c : c) : x.index - y.index;
    })
    .map((item) => item.p);
}
