/**
 * Podklady pro fakturaci — typy, částky, kontrola zadání, filtr a řazení. Čistá logika bez SharePointu a Reactu.
 *
 * Podklad je interní dokument, kterým projekt předává účtárně, co a komu se má vyfakturovat.
 * Samotnou fakturu vystavuje účetnictví; aplikace drží číslo podkladu, stav a později číslo faktury a úhradu.
 * Workflow (kdo smí co) je v `invoiceWorkflow.ts`.
 */

import { OrderLine, orderTotals } from './orders';

/** Stavy podkladu (zadání kap. 8.6). Hodnoty odpovídají volbám ve sloupci Stav seznamu PRM_InvoiceBases. */
export enum InvoiceStatus {
  Koncept = 'Koncept',
  KeKontrole = 'Ke kontrole',
  Predano = 'Předáno účtárně',
  Vyfakturovano = 'Vyfakturováno',
  Uhrazeno = 'Uhrazeno',
  Storno = 'Storno'
}

/** Pořadí stavů v nabídkách — od konceptu po úhradu, pak storno. */
export const INVOICE_STATUS_ORDER: InvoiceStatus[] = [
  InvoiceStatus.Koncept,
  InvoiceStatus.KeKontrole,
  InvoiceStatus.Predano,
  InvoiceStatus.Vyfakturovano,
  InvoiceStatus.Uhrazeno,
  InvoiceStatus.Storno
];

/** Z těchto stavů už podklad nikam nejde. */
export const FINAL_INVOICE_STATUSES: InvoiceStatus[] = [InvoiceStatus.Uhrazeno, InvoiceStatus.Storno];

export interface InvoiceBasis {
  id: number;
  /** Číslo podkladu (řada FP, společná pro všechny projekty, reset každý rok). */
  number: string;
  projectNumber: string;
  projectTitle?: string;
  customerId?: number;
  customerName?: string;
  lines: OrderLine[];
  amountNet: number;
  vatRate: number;
  currency: string;
  issueDate?: Date;
  /** Datum uskutečnění zdanitelného plnění (DUZP). */
  taxableDate?: Date;
  dueDate?: Date;
  status: InvoiceStatus;
  requestedByName: string;
  requestedByLogin: string;
  note?: string;
  cancelReason?: string;
  /** Kdy byl podklad předán účtárně. */
  handoverDate?: Date;
  /** Číslo faktury z účetnictví — doplní se po vyfakturování. */
  accountingInvoiceNo?: string;
  paidDate?: Date;
  /** Odkaz na PDF uložené ve složce projektu (03-Rozpočet projektu/Fakturace). */
  pdfUrl?: string;
  created?: Date;
  modified?: Date;
}

/** Údaje z formuláře podkladu. */
export interface InvoiceDraft {
  projectNumber: string;
  customerId?: number;
  customerName?: string;
  lines: OrderLine[];
  vatRate: number;
  currency: string;
  issueDate?: Date;
  taxableDate?: Date;
  dueDate?: Date;
  note?: string;
}

export interface InvoiceIssue {
  field: string;
  message: string;
}

/** Součty podkladu — stejné zaokrouhlování jako u objednávek (řádek po řádku). */
export function invoiceTotals(lines: OrderLine[], vatRate: number): { net: number; vat: number; gross: number } {
  return orderTotals(lines, vatRate);
}

/** Splatnost jako datum: vystavení + počet dnů. */
export function dueDateFrom(issueDate: Date, days: number): Date {
  return new Date(issueDate.getFullYear(), issueDate.getMonth(), issueDate.getDate() + Math.round(days));
}

/** Počet dní mezi vystavením a splatností (pro zobrazení ve formuláři); `undefined`, když chybí datum. */
export function paymentDays(issueDate: Date | undefined, dueDate: Date | undefined): number | undefined {
  if (!issueDate || !dueDate) {
    return undefined;
  }
  const a = new Date(issueDate.getFullYear(), issueDate.getMonth(), issueDate.getDate()).getTime();
  const b = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}

const CURRENCIES = ['CZK', 'EUR', 'USD'];

/**
 * Kontrola zadání. Při ukládání konceptu stačí projekt; před předáním ke kontrole / účtárně (`strict`) musí být
 * vyplněné všechno, co účtárna potřebuje: zákazník, položky s cenou, rozumné datum splatnosti.
 */
export function validateInvoiceDraft(draft: InvoiceDraft, strict: boolean): InvoiceIssue[] {
  const issues: InvoiceIssue[] = [];
  if (!draft.projectNumber || draft.projectNumber.trim() === '') {
    issues.push({ field: 'projectNumber', message: 'Vyberte projekt.' });
  }
  if (CURRENCIES.indexOf(draft.currency) === -1) {
    issues.push({ field: 'currency', message: 'Měna musí být CZK, EUR nebo USD.' });
  }
  if (!(draft.vatRate >= 0 && draft.vatRate <= 100)) {
    issues.push({ field: 'vatRate', message: 'Sazba DPH musí být mezi 0 a 100 %.' });
  }
  draft.lines.forEach((l, i) => {
    if (strict || l.description.trim() !== '' || l.unitPriceNet !== 0) {
      if (l.description.trim() === '') {
        issues.push({ field: 'lines', message: `Položka ${i + 1}: doplňte popis.` });
      }
      if (!(l.quantity > 0)) {
        issues.push({ field: 'lines', message: `Položka ${i + 1}: množství musí být větší než nula.` });
      }
      if (!(l.unitPriceNet >= 0)) {
        issues.push({ field: 'lines', message: `Položka ${i + 1}: cena nesmí být záporná.` });
      }
    }
  });
  if (draft.issueDate && draft.dueDate) {
    const days = paymentDays(draft.issueDate, draft.dueDate);
    if (days !== undefined && days < 0) {
      issues.push({ field: 'dueDate', message: 'Splatnost nemůže být dřív než datum vystavení.' });
    }
  }
  if (strict) {
    if (!draft.customerName || draft.customerName.trim() === '') {
      issues.push({ field: 'customer', message: 'Projekt nemá zákazníka — doplňte ho v detailu projektu, podklad nemá komu adresovat.' });
    }
    if (draft.lines.length === 0) {
      issues.push({ field: 'lines', message: 'Přidejte aspoň jednu položku.' });
    } else if (invoiceTotals(draft.lines, draft.vatRate).net <= 0) {
      issues.push({ field: 'lines', message: 'Celková částka musí být větší než nula.' });
    }
    if (!draft.issueDate) {
      issues.push({ field: 'issueDate', message: 'Vyplňte datum vystavení.' });
    }
    if (!draft.dueDate) {
      issues.push({ field: 'dueDate', message: 'Vyplňte splatnost.' });
    }
  }
  return issues;
}

// --- filtr a řazení --------------------------------------------------------------

export interface InvoiceListFilter {
  projectNumber?: string;
  statuses?: string[];
  search?: string;
  issuedFrom?: Date;
  issuedTo?: Date;
}

function dayOf(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Fulltext přes číslo, zákazníka, projekt a číslo faktury; filtr stavů, projektu a data vystavení. Vrací kopii. */
export function filterInvoices(list: InvoiceBasis[], filter?: InvoiceListFilter): InvoiceBasis[] {
  const f = filter || {};
  const q = (f.search || '').trim().toLocaleLowerCase('cs-CZ');
  return list.filter((i) => {
    if (f.projectNumber && i.projectNumber !== f.projectNumber) {
      return false;
    }
    if (f.statuses && f.statuses.length > 0 && f.statuses.indexOf(i.status) === -1) {
      return false;
    }
    if ((f.issuedFrom || f.issuedTo) && !i.issueDate) {
      return false;
    }
    if (f.issuedFrom && i.issueDate && dayOf(i.issueDate) < dayOf(f.issuedFrom)) {
      return false;
    }
    if (f.issuedTo && i.issueDate && dayOf(i.issueDate) > dayOf(f.issuedTo)) {
      return false;
    }
    if (!q) {
      return true;
    }
    return [i.number, i.customerName, i.projectNumber, i.projectTitle, i.accountingInvoiceNo, i.note]
      .filter((v) => !!v)
      .some((v) => (v as string).toLocaleLowerCase('cs-CZ').indexOf(q) !== -1);
  });
}

/** Nejnovější číslo první (FP26012 před FP26011); čísla se řadí číselně. */
export function sortInvoicesNewestFirst(list: InvoiceBasis[]): InvoiceBasis[] {
  return list.slice().sort((a, b) => b.number.localeCompare(a.number, 'cs-CZ', { numeric: true }));
}

export type InvoiceSortKey = 'number' | 'project' | 'customer' | 'amount' | 'status' | 'by' | 'issued' | 'due';

function cmpText(a: string | undefined, b: string | undefined): number {
  return (a || '').localeCompare(b || '', 'cs-CZ', { numeric: true });
}

function cmpDate(a: Date | undefined, b: Date | undefined): number {
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

/** Seřadí podle sloupce (stabilně); částka v korunách přes `amountInCzk`. Vrací kopii. */
export function sortInvoices(
  list: InvoiceBasis[],
  key: InvoiceSortKey,
  descending: boolean,
  amountInCzk?: (i: InvoiceBasis) => number
): InvoiceBasis[] {
  const compare = (a: InvoiceBasis, b: InvoiceBasis): number => {
    switch (key) {
      case 'number':
        return cmpText(a.number, b.number);
      case 'project':
        return cmpText(a.projectNumber, b.projectNumber);
      case 'customer':
        return cmpText(a.customerName, b.customerName);
      case 'amount':
        return (amountInCzk ? amountInCzk(a) : a.amountNet) - (amountInCzk ? amountInCzk(b) : b.amountNet);
      case 'status':
        return INVOICE_STATUS_ORDER.indexOf(a.status) - INVOICE_STATUS_ORDER.indexOf(b.status);
      case 'by':
        return cmpText(a.requestedByName, b.requestedByName);
      case 'issued':
        return cmpDate(a.issueDate, b.issueDate);
      case 'due':
        return cmpDate(a.dueDate, b.dueDate);
    }
  };
  return list
    .map((x, i) => ({ x, i }))
    .sort((p, q) => {
      const c = compare(p.x, q.x);
      return c !== 0 ? (descending ? -c : c) : p.i - q.i;
    })
    .map((p) => p.x);
}

/** Je podklad po splatnosti a ještě neuhrazený? Podle toho se ve stavu zvýrazní. */
export function isOverdue(i: InvoiceBasis, today: Date = new Date()): boolean {
  if (!i.dueDate) {
    return false;
  }
  if (i.status !== InvoiceStatus.Predano && i.status !== InvoiceStatus.Vyfakturovano) {
    return false;
  }
  return dayOf(i.dueDate) < dayOf(today);
}

/** Nejvyšší pořadí podkladů daného roku (`FP26012` → 12 pro rok 2026); 0, když žádný není. Vychází z výchozího vzoru FP{RR}{N}. */
export function highestInvoiceSequence(numbers: string[], year: number): number {
  let max = 0;
  numbers.forEach((n) => {
    const m = /^FP(\d{2})(\d{3,})$/i.exec((n || '').trim());
    if (m && Number(m[1]) === year % 100) {
      max = Math.max(max, Number(m[2]));
    }
  });
  return max;
}
