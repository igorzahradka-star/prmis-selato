/**
 * Doklady z účetnictví (ABRA Flexi) v projektu — čistá logika bez SharePointu a Reactu.
 *
 * Doklady do seznamu zapisuje prostředník (denní stahování z Abry); aplikace je jen čte. Projektový manažer je přiřazuje
 * k položkám nákupu (přijaté faktury) a k výnosům (vydané faktury); přiřazení se ukládá v rozpočtu (`BudgetDoc.allocations`).
 * Součet přiřazených dokladů je skutečnost položky (Nakoupeno) a Vyfakturováno výnosu — účetnictví je jediný zdroj pravdy.
 * Zálohové faktury se zobrazují, ale nepřiřazují se a do součtů se nezapočítávají.
 */

import { RateTable, convertAmount, CurrencyCode } from './currency';
import { BudgetDoc, DocAllocation, round2 } from './budget';

export type AbraDocType = 'prijata' | 'vydana' | 'zaloha-prijata' | 'zaloha-vydana';

export const ABRA_DOC_LABELS: Record<AbraDocType, string> = {
  prijata: 'Faktura přijatá',
  vydana: 'Faktura vydaná',
  'zaloha-prijata': 'Záloha přijatá',
  'zaloha-vydana': 'Záloha vydaná'
};

export interface AbraDoc {
  /** Řádek v seznamu PRM_AbraDocs (0 u ukázkových dat). */
  id: number;
  /** Stálý identifikátor dokladu v Abře — klíč přiřazení. */
  abraId: string;
  type: AbraDocType;
  /** Číslo dokladu (kód v Abře). */
  number: string;
  projectNumber: string;
  /** Dodavatel (přijaté) nebo odběratel (vydané). */
  partnerName?: string;
  description?: string;
  issueDate?: Date;
  dueDate?: Date;
  currency: CurrencyCode;
  /** Částka bez DPH v měně dokladu; dobropis je záporný. */
  amountNet: number;
  /** Účty z účetního deníku (501, 518, 512, 601…) — jen informativně. */
  accounts?: string[];
  syncedAt?: Date;
}

export const isAdvance = (d: AbraDoc): boolean => d.type === 'zaloha-prijata' || d.type === 'zaloha-vydana';
/** Přijatá faktura patří k nákupu (položky rozpočtu), vydaná k výnosům. */
export const targetKindOf = (d: AbraDoc): 'item' | 'revenue' | undefined => (d.type === 'prijata' ? 'item' : d.type === 'vydana' ? 'revenue' : undefined);

/** Kolik z dokladu je přiřazeno (v měně dokladu). */
export function allocatedOfDoc(allocations: DocAllocation[] | undefined, docId: string): number {
  return round2((allocations || []).filter((a) => a.docId === docId).reduce((s, a) => s + a.amount, 0));
}

/** Kolik z dokladu zbývá přiřadit (v měně dokladu; u dobropisu záporné). */
export const unallocatedOfDoc = (d: AbraDoc, allocations: DocAllocation[] | undefined): number => round2(d.amountNet - allocatedOfDoc(allocations, d.abraId));

/** Doklady, kterým zbývá něco přiřadit (bez záloh). Základ pro „Nezařazeno“. */
export function unallocatedDocs(docs: AbraDoc[], allocations: DocAllocation[] | undefined): AbraDoc[] {
  return docs.filter((d) => !isAdvance(d) && Math.abs(unallocatedOfDoc(d, allocations)) > 0.005);
}

/** Součet nepřiřazeného zbytku dokladů v jedné měně (nákup a výnosy zvlášť). */
export function unallocatedTotals(docs: AbraDoc[], allocations: DocAllocation[] | undefined, target: CurrencyCode, rates: RateTable): { cost: number; revenue: number; count: number } {
  let cost = 0;
  let revenue = 0;
  const open = unallocatedDocs(docs, allocations);
  open.forEach((d) => {
    const v = convertAmount(unallocatedOfDoc(d, allocations), d.currency, target, rates);
    if (d.type === 'prijata') {
      cost += v;
    } else {
      revenue += v;
    }
  });
  return { cost: round2(cost), revenue: round2(revenue), count: open.length };
}

/**
 * Přiřadí doklad cíli. Bez `amount` se přiřadí celý zbytek dokladu. Vrací nové přiřazení, nebo důvod, proč to nejde
 * (záloha, špatný směr, nesouhlasí znaménko, přes částku dokladu).
 */
export function assignDoc(allocations: DocAllocation[] | undefined, doc: AbraDoc, kind: 'item' | 'revenue', targetId: string, amount?: number): { allocations: DocAllocation[] } | { error: string } {
  const list = allocations || [];
  if (isAdvance(doc)) {
    return { error: 'Zálohová faktura se k položkám nepřiřazuje a do součtů se nezapočítává.' };
  }
  if (targetKindOf(doc) !== kind) {
    return { error: kind === 'item' ? 'Vydanou fakturu nelze přiřadit k nákupu — patří k výnosům.' : 'Přijatou fakturu nelze přiřadit k výnosům — patří k nákupu.' };
  }
  const rest = unallocatedOfDoc(doc, list);
  const wanted = amount === undefined ? rest : round2(amount);
  if (wanted === 0) {
    return { error: 'Není co přiřadit — doklad je už celý přiřazený.' };
  }
  if (Math.sign(wanted) !== Math.sign(doc.amountNet)) {
    return { error: 'Částka musí mít stejné znaménko jako doklad.' };
  }
  if (Math.abs(wanted) > Math.abs(rest) + 0.005) {
    return { error: 'Přiřazujete víc, než z dokladu zbývá.' };
  }
  const same = list.filter((a) => a.docId === doc.abraId && a.kind === kind && a.targetId === targetId)[0];
  const next = same
    ? list.map((a) => (a === same ? { ...a, amount: round2(a.amount + wanted) } : a))
    : [...list, { docId: doc.abraId, kind, targetId, amount: wanted, currency: doc.currency }];
  return { allocations: next };
}

/** Zruší přiřazení dokladu (celé, nebo jen k danému cíli). */
export function unassignDoc(allocations: DocAllocation[] | undefined, docId: string, kind?: 'item' | 'revenue', targetId?: string): DocAllocation[] {
  return (allocations || []).filter((a) => !(a.docId === docId && (kind === undefined || (a.kind === kind && a.targetId === targetId))));
}

/** Přesune přiřazenou část dokladu k jinému cíli (celou částku přiřazenou původnímu cíli). */
export function moveAllocation(allocations: DocAllocation[] | undefined, doc: AbraDoc, kind: 'item' | 'revenue', fromId: string, toId: string): { allocations: DocAllocation[] } | { error: string } {
  const list = allocations || [];
  const from = list.filter((a) => a.docId === doc.abraId && a.kind === kind && a.targetId === fromId)[0];
  if (!from) {
    return { error: 'Doklad k původní položce není přiřazený.' };
  }
  if (fromId === toId) {
    return { allocations: list };
  }
  return assignDoc(unassignDoc(list, doc.abraId, kind, fromId), doc, kind, toId, from.amount);
}

export interface TargetDoc {
  doc: AbraDoc;
  /** Kolik z dokladu je přiřazeno právě tomuto cíli (v měně dokladu). */
  amount: number;
  /** Doklad je rozdělený mezi víc cílů. */
  split: boolean;
}

/** Doklady přiřazené cíli (položce nebo výnosu) včetně přiřazené části, od nejstaršího. Doklad, který už v seznamu není, se vynechá. */
export function docsForTarget(docs: AbraDoc[], allocations: DocAllocation[] | undefined, kind: 'item' | 'revenue', targetId: string): TargetDoc[] {
  const list = allocations || [];
  return list
    .filter((a) => a.kind === kind && a.targetId === targetId)
    .map((a) => {
      const doc = docs.filter((d) => d.abraId === a.docId)[0];
      return doc ? { doc, amount: a.amount, split: list.filter((x) => x.docId === a.docId).length > 1 } : undefined;
    })
    .filter((x): x is TargetDoc => !!x)
    .sort((a, b) => (a.doc.issueDate ? a.doc.issueDate.getTime() : 0) - (b.doc.issueDate ? b.doc.issueDate.getTime() : 0));
}

/** Přiřazení k dokladům, které z Abry zmizely (smazaný nebo přečíslovaný doklad) — aby je PM mohl uklidit. */
export function orphanAllocations(docs: AbraDoc[], allocations: DocAllocation[] | undefined): DocAllocation[] {
  const known = new Set(docs.map((d) => d.abraId));
  return (allocations || []).filter((a) => !known.has(a.docId));
}

/** Zálohy projektu bokem: přijaté a vydané zvlášť, součty v jedné měně. Do rozpočtu se nezapočítávají. */
export function advanceSummary(docs: AbraDoc[], target: CurrencyCode, rates: RateTable): { received: number; issued: number; docs: AbraDoc[] } {
  const adv = docs.filter(isAdvance);
  const sum = (type: AbraDocType): number => round2(adv.filter((d) => d.type === type).reduce((s, d) => s + convertAmount(d.amountNet, d.currency, target, rates), 0));
  return { received: sum('zaloha-prijata'), issued: sum('zaloha-vydana'), docs: adv };
}
