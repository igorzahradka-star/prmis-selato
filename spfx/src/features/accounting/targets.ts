/**
 * Cíle, ke kterým se přiřazují řádky z účetnictví: položky nákupu (seskupené podle skupin, bez vlastní práce) a výnosy.
 */

import { DropdownMenuItemType, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { BudgetDoc } from '../../core/budget';

export const UNASSIGNED_KEY = '';

/** Volby pro rozbalovátko: u nákupu skupiny jako nadpisy a pod nimi položky; u výnosů řádky výnosů. První volba je „nepřiřazeno“. */
export function targetOptions(doc: BudgetDoc, kind: 'item' | 'revenue'): IDropdownOption[] {
  const out: IDropdownOption[] = [{ key: UNASSIGNED_KEY, text: '— nepřiřazeno —' }];
  if (kind === 'revenue') {
    (doc.revenues || []).forEach((r) => out.push({ key: r.id, text: r.description || '(bez popisu)' }));
    return out;
  }
  doc.groups
    .filter((g) => g.kind !== 'prace')
    .forEach((g) => {
      const items = doc.items.filter((i) => i.groupId === g.id);
      if (items.length === 0) {
        return;
      }
      out.push({ key: `__g_${g.id}`, text: g.name, itemType: DropdownMenuItemType.Header });
      items.forEach((i) => out.push({ key: i.id, text: i.description || '(bez popisu)' }));
    });
  return out;
}

/** Popis cíle pro přehled („Střídače · Střídač 100 kW“). */
export function targetLabel(doc: BudgetDoc, kind: 'item' | 'revenue', id: string): string {
  if (kind === 'revenue') {
    const r = (doc.revenues || []).filter((x) => x.id === id)[0];
    return r ? r.description || '(bez popisu)' : '(smazaný výnos)';
  }
  const i = doc.items.filter((x) => x.id === id)[0];
  const g = i ? doc.groups.filter((x) => x.id === i.groupId)[0] : undefined;
  return i ? `${g ? g.name + ' · ' : ''}${i.description || '(bez popisu)'}` : '(smazaná položka)';
}
