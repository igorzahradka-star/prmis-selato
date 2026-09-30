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
  /**
   * Konkrétní schvalovatel kroku. Předvyplní se z číselníku (u PM je to PM projektu) a žadatel ho může změnit.
   * Bez přiřazení smí krok schválit kdokoli z příslušné role.
   */
  assignedLogin?: string;
  assignedName?: string;
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
  /** Odkaz na PDF objednávky uložené ve složce projektu (vzniká při odeslání dodavateli). */
  pdfUrl?: string;
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
  assignedLogin?: string;
  assignedName?: string;
}

/** Řetězec do textu pro sloupec Note v SharePointu. */
export function chainToJson(chain: ApprovalStep[]): string {
  const stored: StoredStep[] = chain.map((s) => ({
    level: s.level,
    approved: s.approved,
    auto: s.auto || undefined,
    byName: s.byName,
    byLogin: s.byLogin,
    at: s.at ? s.at.toISOString() : undefined,
    assignedLogin: s.assignedLogin,
    assignedName: s.assignedName
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
        at: s.at ? new Date(s.at) : undefined,
        assignedLogin: s.assignedLogin || undefined,
        assignedName: s.assignedName || undefined
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
  /** Vystaveno od (včetně) a do (včetně) — podle data založení objednávky. */
  issuedFrom?: Date;
  issuedTo?: Date;
}

/** Den bez času — porovnání dat podle kalendářního dne, ne podle hodin. */
function dayOf(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
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
    if ((f.issuedFrom || f.issuedTo) && !o.created) {
      return false;
    }
    if (f.issuedFrom && o.created && dayOf(o.created) < dayOf(f.issuedFrom)) {
      return false;
    }
    if (f.issuedTo && o.created && dayOf(o.created) > dayOf(f.issuedTo)) {
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

// --- přílohy -----------------------------------------------------------------

/** Příloha objednávky (soubor uložený u položky v SharePointu). */
export interface OrderAttachment {
  name: string;
  url: string;
  sizeBytes?: number;
}

/** Nejvíc, co se smí připojit jako jedna příloha. SharePoint zvládne víc, ale e-mail dodavateli ne. */
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

/** Přípony spustitelných souborů — do objednávky nepatří a mohly by se dostat k dodavateli. */
const BLOCKED_EXTENSIONS = ['exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'js', 'vbs', 'ps1', 'jar', 'dll'];

/** Zkontroluje soubor před nahráním. Vrací větu pro člověka, nebo `undefined`, když je v pořádku. */
export function validateAttachment(fileName: string, sizeBytes: number): string | undefined {
  const name = (fileName || '').trim();
  if (name === '') {
    return 'Soubor nemá název.';
  }
  if (/["*:<>?/\\|#%]/.test(name)) {
    return `Název souboru „${name}“ obsahuje znak, který SharePoint nepovoluje (" * : < > ? / \\ | # %). Soubor přejmenujte.`;
  }
  const ext = name.indexOf('.') === -1 ? '' : name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (BLOCKED_EXTENSIONS.indexOf(ext) !== -1) {
    return `Soubory typu .${ext} se k objednávce připojit nesmí.`;
  }
  if (!(sizeBytes > 0)) {
    return `Soubor „${name}“ je prázdný.`;
  }
  if (sizeBytes > ATTACHMENT_MAX_BYTES) {
    return `Soubor „${name}“ je větší než ${Math.round(ATTACHMENT_MAX_BYTES / 1024 / 1024)} MB.`;
  }
  return undefined;
}

// --- náhled přílohy -----------------------------------------------------------

/** Jak se příloha zobrazí v dlaždici: obrázek přímo, PDF první stranou, ostatní ikonou podle typu. */
export type AttachmentKind = 'image' | 'pdf' | 'word' | 'excel' | 'powerpoint' | 'archive' | 'other';

const EXT_KIND: Record<string, AttachmentKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  bmp: 'image',
  pdf: 'pdf',
  doc: 'word',
  docx: 'word',
  odt: 'word',
  xls: 'excel',
  xlsx: 'excel',
  xlsm: 'excel',
  csv: 'excel',
  ods: 'excel',
  ppt: 'powerpoint',
  pptx: 'powerpoint',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive'
};

/** Druh přílohy podle přípony (bez ohledu na velikost písmen). */
export function attachmentKind(fileName: string): AttachmentKind {
  const name = (fileName || '').trim().toLowerCase();
  const dot = name.lastIndexOf('.');
  return (dot === -1 ? undefined : EXT_KIND[name.slice(dot + 1)]) ?? 'other';
}

// --- řazení podle sloupce ---------------------------------------------------------

export type OrderSortKey = 'number' | 'project' | 'supplier' | 'subject' | 'amount' | 'status' | 'by' | 'created' | 'delivery';

function compareText(a: string | undefined, b: string | undefined): number {
  return (a || '').localeCompare(b || '', 'cs-CZ', { numeric: true });
}

function compareDate(a: Date | undefined, b: Date | undefined): number {
  // Objednávky bez data jdou vždy na konec při vzestupném řazení.
  if (!a && !b) {
    return 0;
  }
  if (!a) {
    return 1;
  }
  if (!b) {
    return -1;
  }
  return a.getTime() - b.getTime();
}

/**
 * Seřadí objednávky podle sloupce. Stabilní: při shodě zůstane dosavadní pořadí. Vrací kopii.
 * Podle částky se řadí v korunách — `amountInCzk` přepočte objednávku (bez něj se porovnávají částky tak, jak jsou).
 */
export function sortOrders(
  orders: PurchaseOrder[],
  key: OrderSortKey,
  descending: boolean,
  amountInCzk?: (o: PurchaseOrder) => number
): PurchaseOrder[] {
  const compare = (a: PurchaseOrder, b: PurchaseOrder): number => {
    switch (key) {
      case 'number':
        return compareText(a.orderNumber, b.orderNumber);
      case 'project':
        return compareText(a.projectNumber, b.projectNumber);
      case 'supplier':
        return compareText(a.supplierName, b.supplierName);
      case 'subject':
        return compareText(a.subject, b.subject);
      case 'amount':
        return (amountInCzk ? amountInCzk(a) : a.amountNet) - (amountInCzk ? amountInCzk(b) : b.amountNet);
      case 'status':
        return ORDER_STATUS_ORDER.indexOf(a.status) - ORDER_STATUS_ORDER.indexOf(b.status);
      case 'by':
        return compareText(a.requestedByName, b.requestedByName);
      case 'created':
        return compareDate(a.created, b.created);
      case 'delivery':
        return compareDate(a.deliveryDate, b.deliveryDate);
    }
  };
  return orders
    .map((o, i) => ({ o, i }))
    .sort((x, y) => {
      const c = compare(x.o, y.o);
      return c !== 0 ? (descending ? -c : c) : x.i - y.i;
    })
    .map((x) => x.o);
}

// --- duplicitní čísla ---------------------------------------------------------------

/**
 * Objednávky, které mají číslo shodné s jinou objednávkou a je potřeba je přečíslovat: v každé skupině se shodným
 * číslem zůstane ta nejstarší (nejnižší ID), ostatní se vrátí. Číslo se neporovnává podle velikosti písmen ani mezer.
 */
export function ordersToRenumber(orders: PurchaseOrder[]): PurchaseOrder[] {
  const groups = new Map<string, PurchaseOrder[]>();
  orders.forEach((o) => {
    const key = (o.orderNumber || '').trim().toUpperCase();
    groups.set(key, [...(groups.get(key) || []), o]);
  });
  const result: PurchaseOrder[] = [];
  groups.forEach((group) => {
    if (group.length > 1) {
      group
        .slice()
        .sort((a, b) => a.id - b.id)
        .slice(1)
        .forEach((o) => result.push(o));
    }
  });
  return result.sort((a, b) => a.id - b.id);
}

/** Nejvyšší pořadové číslo objednávek daného roku (`OBJ-2026-0012` → 12); 0, když žádná není. */
export function highestOrderSequence(orderNumbers: string[], year: number): number {
  let max = 0;
  orderNumbers.forEach((n) => {
    const m = /^OBJ-(\d{4})-(\d+)$/i.exec((n || '').trim());
    if (m && Number(m[1]) === year) {
      max = Math.max(max, Number(m[2]));
    }
  });
  return max;
}
