/**
 * Nákupní objednávky — typy, částky a kontrola zadání. Čistá logika bez SharePointu a Reactu.
 *
 * Workflow (kdo smí co, schvalovací řetěz) je v `orderWorkflow.ts`.
 */

import { RateTable, toCzk } from './currency';

/** Stavy objednávky (zadání kap. 8.5). Hodnoty odpovídají volbám ve sloupci Stav seznamu PRM_PurchaseOrders. */
export enum OrderStatus {
  Koncept = 'Koncept',
  KeSchvaleni = 'Ke schválení',
  Schvaleno = 'Schváleno',
  VracenoKUprave = 'Vráceno k úpravě',
  Zamitnuto = 'Zamítnuto',
  Odeslano = 'Odesláno dodavateli',
  Dodano = 'Dodáno',
  Uzavreno = 'Uzavřeno',
  Storno = 'Storno'
}

/** Pořadí stavů v nabídkách a legendách — od založení po uzavření, pak stavy „mimo běh". */
export const ORDER_STATUS_ORDER: OrderStatus[] = [
  OrderStatus.Koncept,
  OrderStatus.KeSchvaleni,
  OrderStatus.VracenoKUprave,
  OrderStatus.Schvaleno,
  OrderStatus.Odeslano,
  OrderStatus.Dodano,
  OrderStatus.Uzavreno,
  OrderStatus.Zamitnuto,
  OrderStatus.Storno
];

/** Z těchto stavů už objednávka nikam nejde. */
export const FINAL_ORDER_STATUSES: OrderStatus[] = [OrderStatus.Uzavreno, OrderStatus.Storno];

/** Kdo v řetězci schvaluje. */
export type ApprovalLevel = 'pm' | 'vedeni' | 'jednatel';

export const APPROVAL_LEVEL_LABELS: Record<ApprovalLevel, string> = {
  pm: 'Projektový manažer',
  vedeni: 'Vedení',
  jednatel: 'Jednatel'
};

/** Jeden krok schvalovacího řetězce. */
export interface ApprovalStep {
  level: ApprovalLevel;
  approved: boolean;
  /** Schváleno automaticky (vystavitel je sám PM a Nastavení mu to dovoluje) — bez člověka, který by klikl. */
  auto?: boolean;
  byName?: string;
  byLogin?: string;
  at?: Date;
}

/** Položka objednávky. */
export interface OrderLine {
  description: string;
  quantity: number;
  unit?: string;
  unitPriceNet: number;
}

export interface PurchaseOrder {
  id: number;
  orderNumber: string;
  projectNumber: string;
  projectTitle?: string;
  /** Projekt Režie — schvalování a oprávnění se řídí jinak. */
  isOverheadProject?: boolean;
  supplierId?: number;
  supplierName?: string;
  subject: string;
  lines: OrderLine[];
  amountNet: number;
  vatRate: number;
  currency: string;
  deliveryDate?: Date;
  paymentTermDays?: number;
  status: OrderStatus;
  requestedByName: string;
  requestedByLogin: string;
  /** Kdo právě schvaluje (první nevyřízený krok). Mimo stav Ke schválení prázdné. */
  currentApprovalLevel?: ApprovalLevel;
  approvalChain: ApprovalStep[];
  note?: string;
  cancelReason?: string;
  sentDate?: Date;
  created?: Date;
  modified?: Date;
}

// --- částky ---------------------------------------------------------------

/** Zaokrouhlení na haléře. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Cena řádku bez DPH. */
export function lineTotalNet(line: OrderLine): number {
  return round2((Number(line.quantity) || 0) * (Number(line.unitPriceNet) || 0));
}

export interface OrderTotals {
  net: number;
  vat: number;
  gross: number;
}

/**
 * Součty objednávky. Každý řádek se zaokrouhluje zvlášť (tak ho uvidí dodavatel
 * na své faktuře), DPH se počítá ze součtu bez DPH.
 */
export function orderTotals(lines: OrderLine[], vatRate: number): OrderTotals {
  const net = round2(lines.reduce((sum, l) => sum + lineTotalNet(l), 0));
  const vat = round2((net * (Number(vatRate) || 0)) / 100);
  return { net, vat, gross: round2(net + vat) };
}

/**
 * Částka bez DPH v korunách — podle ní se vybírá pásmo schvalování, limity jsou v Kč.
 * Cizí měna se přepočítá kurzem ČNB (jen pro určení pásma, na objednávce zůstává v původní měně).
 */
export function amountNetInCzk(amountNet: number, currency: string, rates: RateTable): number {
  return toCzk(amountNet, currency, rates);
}

// --- kontrola zadání -------------------------------------------------------

/** Údaje z formuláře objednávky. */
export interface OrderDraft {
  projectNumber?: string;
  supplierId?: number;
  supplierName?: string;
  subject: string;
  lines: OrderLine[];
  vatRate: number;
  currency: string;
  deliveryDate?: Date;
  paymentTermDays?: number;
  note?: string;
}

export interface OrderIssue {
  field: 'projectNumber' | 'supplier' | 'subject' | 'lines' | 'vatRate' | 'deliveryDate' | 'paymentTermDays';
  message: string;
}

/**
 * Zkontroluje objednávku.
 *
 * Uložit koncept jde, i když je rozpracovaný (stačí projekt a předmět) — člověk si ho
 * chce odložit. **Odeslat ke schválení** jde až s dodavatelem, položkami a nenulovou částkou:
 * schvalovatel jinak nemá co posuzovat.
 */
export function validateOrderDraft(draft: OrderDraft, forSubmit: boolean): OrderIssue[] {
  const issues: OrderIssue[] = [];

  if (!draft.projectNumber || !draft.projectNumber.trim()) {
    issues.push({ field: 'projectNumber', message: 'Vyberte projekt, na který se objednávka vystavuje.' });
  }
  if (!draft.subject || !draft.subject.trim()) {
    issues.push({ field: 'subject', message: 'Napište předmět objednávky — stručně, co se objednává.' });
  }
  if (Number(draft.vatRate) < 0 || Number(draft.vatRate) > 100 || isNaN(Number(draft.vatRate))) {
    issues.push({ field: 'vatRate', message: 'Sazba DPH musí být mezi 0 a 100 %.' });
  }
  if (draft.paymentTermDays !== undefined && (draft.paymentTermDays < 0 || isNaN(draft.paymentTermDays))) {
    issues.push({ field: 'paymentTermDays', message: 'Splatnost nesmí být záporná.' });
  }

  draft.lines.forEach((l, i) => {
    const n = i + 1;
    if (!l.description || !l.description.trim()) {
      issues.push({ field: 'lines', message: `Položka ${n}: doplňte popis.` });
    }
    if (!(Number(l.quantity) > 0)) {
      issues.push({ field: 'lines', message: `Položka ${n}: množství musí být větší než nula.` });
    }
    if (!(Number(l.unitPriceNet) >= 0)) {
      issues.push({ field: 'lines', message: `Položka ${n}: cena nesmí být záporná.` });
    }
  });

  if (forSubmit) {
    if (!draft.supplierId && !(draft.supplierName && draft.supplierName.trim())) {
      issues.push({ field: 'supplier', message: 'Vyberte dodavatele — bez něj není komu objednávku poslat.' });
    }
    if (draft.lines.length === 0) {
      issues.push({ field: 'lines', message: 'Přidejte aspoň jednu položku objednávky.' });
    } else if (orderTotals(draft.lines, draft.vatRate).net <= 0) {
      issues.push({ field: 'lines', message: 'Celková částka objednávky je nulová — není co schvalovat.' });
    }
  }

  return issues;
}

// --- uložení řetězce schválení --------------------------------------------

interface StoredStep {
  level: ApprovalLevel;
  approved: boolean;
  auto?: boolean;
  byName?: string;
  byLogin?: string;
  at?: string;
}

/** Řetězec do textu pro sloupec Note v SharePointu. */
export function chainToJson(chain: ApprovalStep[]): string {
  const stored: StoredStep[] = chain.map((s) => ({
    level: s.level,
    approved: s.approved,
    auto: s.auto || undefined,
    byName: s.byName,
    byLogin: s.byLogin,
    at: s.at ? s.at.toISOString() : undefined
  }));
  return JSON.stringify(stored);
}

/** Text ze SharePointu zpět na řetězec; poškozený nebo prázdný text dá prázdný řetězec, ne chybu. */
export function chainFromJson(text: string | undefined): ApprovalStep[] {
  if (!text) {
    return [];
  }
  try {
    const parsed = JSON.parse(text) as StoredStep[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((s) => s && (s.level === 'pm' || s.level === 'vedeni' || s.level === 'jednatel'))
      .map((s) => ({
        level: s.level,
        approved: s.approved === true,
        auto: s.auto === true ? true : undefined,
        byName: s.byName,
        byLogin: s.byLogin,
        at: s.at ? new Date(s.at) : undefined
      }));
  } catch {
    return [];
  }
}

/** Položky objednávky do textu pro sloupec Položky (JSON). */
export function linesToJson(lines: OrderLine[]): string {
  return JSON.stringify(lines);
}

export function linesFromJson(text: string | undefined): OrderLine[] {
  if (!text) {
    return [];
  }
  try {
    const parsed = JSON.parse(text) as OrderLine[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((l) => ({
      description: String(l.description ?? ''),
      quantity: Number(l.quantity) || 0,
      unit: l.unit ? String(l.unit) : undefined,
      unitPriceNet: Number(l.unitPriceNet) || 0
    }));
  } catch {
    return [];
  }
}

// --- filtr a řazení seznamu --------------------------------------------------

export interface OrderListFilter {
  projectNumber?: string;
  statuses?: string[];
  search?: string;
}

/** Fulltext přes číslo, předmět, dodavatele a projekt; filtr stavů a projektu. Vrací kopii. */
export function filterOrders(orders: PurchaseOrder[], filter?: OrderListFilter): PurchaseOrder[] {
  const f = filter || {};
  const q = (f.search || '').trim().toLocaleLowerCase('cs-CZ');
  return orders.filter((o) => {
    if (f.projectNumber && o.projectNumber !== f.projectNumber) {
      return false;
    }
    if (f.statuses && f.statuses.length > 0 && f.statuses.indexOf(o.status) === -1) {
      return false;
    }
    if (!q) {
      return true;
    }
    return [o.orderNumber, o.subject, o.supplierName, o.projectNumber, o.projectTitle]
      .filter((v) => !!v)
      .some((v) => (v as string).toLocaleLowerCase('cs-CZ').indexOf(q) !== -1);
  });
}

/** Nejnovější číslo první; čísla s ročníkem a pořadím (OBJ-2026-0012) se řadí podle hodnoty. */
export function sortOrdersNewestFirst(orders: PurchaseOrder[]): PurchaseOrder[] {
  return orders
    .slice()
    .sort((a, b) => b.orderNumber.localeCompare(a.orderNumber, 'cs-CZ', { numeric: true }));
}
