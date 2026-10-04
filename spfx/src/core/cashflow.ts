/**
 * Cashflow projektu — čistá logika bez SharePointu a Reactu.
 *
 * Výdaje: **plán plateb** (podle vzoru Excelu „Průběh plateb“) — platba má částku bez DPH, režim DPH, měnu, datum faktury
 * (náklad v čase), datum splatnosti (výdaj = kdy se platí), případně datum úhrady (skutečnost) a vazbu na položku rozpočtu.
 * Příjmy: **fakturační milníky** — plánované datum faktury, částka bez DPH, sazba DPH, splatnost ve dnech; skutečnost
 * z data úhrady (ručně, nebo z navázaného podkladu pro fakturaci).
 *
 * Výstup po týdnech nebo měsících: příjmy, výdaje, saldo, kumulace — plán proti skutečnosti. Částky se přepočítají kurzem ČNB
 * do zvolené měny; zobrazit jde bez DPH i s DPH (peníze skutečně jdou s DPH, podle režimu).
 */

import { CurrencyCode, RateTable, convertAmount } from './currency';
import { BudgetDoc, IncomeMilestone, PlannedPayment, VAT_REGIMES, calcItems, round2, OrderLike } from './budget';
import { InvoiceStatus } from './invoiceBases';

export type Granularity = 'tyden' | 'mesic';

/** Podklad pro fakturaci, jak ho potřebuje cashflow (vazba z milníku podle čísla). */
export interface InvoiceLike {
  number: string;
  status: InvoiceStatus;
  amountNet: number;
  vatRate: number;
  currency: string;
  dueDate?: Date;
  paidDate?: Date;
}

export interface CfBucket {
  key: string;
  label: string;
  from: Date;
  to: Date;
  /** Plán / skutečnost příjmů a výdajů v období (ve zvolené měně, s DPH nebo bez podle volby). */
  incomePlan: number;
  expensePlan: number;
  incomeActual: number;
  expenseActual: number;
  /** Náklad v čase: faktury dodavatelů podle data faktury. */
  accrual: number;
  netPlan: number;
  netActual: number;
  cumPlan: number;
  cumActual: number;
}

export interface CfCoverage {
  itemId: string;
  description: string;
  /** Prognóza nákladů položky (bez DPH) a už naplánované platby; zbývá naplánovat. */
  forecast: number;
  planned: number;
  unplanned: number;
}

export interface CashflowResult {
  buckets: CfBucket[];
  totals: { incomePlan: number; expensePlan: number; incomeActual: number; expenseActual: number };
  /** Položky rozpočtu, jejichž náklady ještě nejsou rozplánované do plateb (jen kladné). */
  coverage: CfCoverage[];
  unplannedTotal: number;
  warnings: string[];
}

// --- datumy ----------------------------------------------------------------------------

export function parseDay(text: string | undefined): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((text || '').trim());
  if (!m) {
    return undefined;
  }
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1 ? undefined : d;
}

export function dayText(d: Date): string {
  const p = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** Pondělí týdne, do kterého datum patří. */
export function weekStart(d: Date): Date {
  const wd = (d.getDay() + 6) % 7;
  return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -wd);
}

/** Číslo ISO týdne (1–53). */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

function bucketOf(d: Date, g: Granularity): { key: string; label: string; from: Date; to: Date } {
  if (g === 'mesic') {
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { key: `${from.getFullYear()}-${pad2(from.getMonth() + 1)}`, label: `${pad2(from.getMonth() + 1)}/${from.getFullYear()}`, from, to };
  }
  const from = weekStart(d);
  const to = addDays(from, 6);
  // Týden patří do roku svého čtvrtka (ISO) — klíč řadí správně i přes přelom roku.
  const thursday = addDays(from, 3);
  return {
    key: `${thursday.getFullYear()}-W${pad2(isoWeek(from))}`,
    label: `T${isoWeek(from)} ${pad2(from.getDate())}.${pad2(from.getMonth() + 1)}.`,
    from,
    to
  };
}

function nextBucketStart(from: Date, g: Granularity): Date {
  return g === 'mesic' ? new Date(from.getFullYear(), from.getMonth() + 1, 1) : addDays(from, 7);
}

// --- částky ---------------------------------------------------------------------------

/** Částka platby s DPH podle režimu (reverse charge a neplátce = bez DPH). */
export function paymentGross(p: PlannedPayment, amount: number = p.amount): number {
  return round2(amount * (1 + VAT_REGIMES[p.vat].rate / 100));
}

export function milestoneGross(m: IncomeMilestone): number {
  return round2(m.amount * (1 + m.vatRate / 100));
}

/** Kdy se milník zaplatí podle plánu: splatnost navázaného podkladu, jinak plánované datum faktury + dny splatnosti. */
export function milestoneDueDate(m: IncomeMilestone, invoice?: InvoiceLike): Date | undefined {
  if (invoice && invoice.dueDate) {
    return invoice.dueDate;
  }
  const planned = parseDay(m.plannedDate);
  return planned ? addDays(planned, Math.max(0, m.dueDays)) : undefined;
}

/** Kdy platba odejde podle plánu: splatnost, jinak datum faktury. */
export function paymentDueDate(p: PlannedPayment): Date | undefined {
  return parseDay(p.dueDate) ?? parseDay(p.invoiceDate);
}

// --- výpočet ---------------------------------------------------------------------------

export interface CashflowInput {
  doc: BudgetDoc;
  invoices: InvoiceLike[];
  orders?: OrderLike[];
  rates: RateTable;
  currency: CurrencyCode;
  granularity: Granularity;
  /** S DPH (peníze) nebo bez DPH. */
  withVat: boolean;
}

/** Sestaví cashflow po obdobích. Prázdná období mezi prvním a posledním pohybem se doplní (kvůli plynulé kumulaci). */
export function buildCashflow(input: CashflowInput): CashflowResult {
  const { doc, rates, currency, granularity, withVat } = input;
  const warnings: string[] = [];
  const conv = (amount: number, from: string): number => convertAmount(amount, from, currency, rates);
  const invoiceByNumber = new Map(input.invoices.map((i) => [i.number, i] as [string, InvoiceLike]));
  const payments = doc.payments ?? [];
  const income = doc.income ?? [];

  interface Event {
    date: Date;
    kind: 'incomePlan' | 'expensePlan' | 'incomeActual' | 'expenseActual' | 'accrual';
    amount: number;
  }
  const events: Event[] = [];

  payments.forEach((p) => {
    const gross = withVat ? paymentGross(p) : p.amount;
    const due = paymentDueDate(p);
    if (!due) {
      warnings.push(`Platba „${p.description || 'bez popisu'}“ nemá datum faktury ani splatnosti — v cashflow chybí.`);
    } else {
      events.push({ date: due, kind: 'expensePlan', amount: conv(gross, p.currency) });
    }
    const invoiceDate = parseDay(p.invoiceDate);
    if (invoiceDate) {
      events.push({ date: invoiceDate, kind: 'accrual', amount: conv(gross, p.currency) });
    }
    const paid = parseDay(p.paidDate);
    if (paid) {
      const paidAmount = p.paidAmount !== undefined ? (withVat ? paymentGross(p, p.paidAmount) : p.paidAmount) : gross;
      events.push({ date: paid, kind: 'expenseActual', amount: conv(paidAmount, p.currency) });
    }
  });

  income.forEach((m) => {
    const inv = m.invoiceNumber ? invoiceByNumber.get(m.invoiceNumber) : undefined;
    const gross = withVat ? milestoneGross(m) : m.amount;
    const due = milestoneDueDate(m, inv);
    if (!due) {
      warnings.push(`Fakturační milník „${m.description || 'bez popisu'}“ nemá plánované datum faktury — v cashflow chybí.`);
    } else {
      events.push({ date: due, kind: 'incomePlan', amount: conv(gross, m.currency) });
    }
    // Skutečnost: ručně zadané datum úhrady, jinak úhrada navázaného podkladu.
    const manual = parseDay(m.paidDate);
    if (manual) {
      events.push({ date: manual, kind: 'incomeActual', amount: conv(gross, m.currency) });
    } else if (inv && inv.status === InvoiceStatus.Uhrazeno && inv.paidDate) {
      const invGross = withVat ? round2(inv.amountNet * (1 + inv.vatRate / 100)) : inv.amountNet;
      events.push({ date: inv.paidDate, kind: 'incomeActual', amount: conv(invGross, inv.currency) });
    }
  });

  // Rozplánování nákladů: prognóza položky proti naplánovaným platbám (v měně položky, bez DPH).
  const calcs = calcItems(doc, rates, input.orders ?? []);
  const coverage: CfCoverage[] = [];
  calcs.forEach((c) => {
    const planned = payments.filter((p) => p.itemId === c.item.id).reduce((s, p) => s + convertAmount(p.amount, p.currency, c.currency, rates), 0);
    const unplanned = round2(c.forecast - planned);
    if (c.forecast > 0 && unplanned > 0.5) {
      coverage.push({ itemId: c.item.id, description: c.item.description || (c.group ? c.group.name : ''), forecast: conv(c.forecast, c.currency), planned: conv(planned, c.currency), unplanned: conv(unplanned, c.currency) });
    }
  });

  const totals = { incomePlan: 0, expensePlan: 0, incomeActual: 0, expenseActual: 0 };
  const map = new Map<string, CfBucket>();
  const ensure = (d: Date): CfBucket => {
    const b = bucketOf(d, granularity);
    let cur = map.get(b.key);
    if (!cur) {
      cur = { ...b, incomePlan: 0, expensePlan: 0, incomeActual: 0, expenseActual: 0, accrual: 0, netPlan: 0, netActual: 0, cumPlan: 0, cumActual: 0 };
      map.set(b.key, cur);
    }
    return cur;
  };
  events.forEach((e) => {
    const b = ensure(e.date);
    if (e.kind === 'accrual') {
      b.accrual += e.amount;
      return;
    }
    b[e.kind] += e.amount;
    totals[e.kind] += e.amount;
  });

  const sorted = Array.from(map.values()).sort((a, b) => a.from.getTime() - b.from.getTime());
  // doplnění prázdných období
  const buckets: CfBucket[] = [];
  if (sorted.length > 0) {
    let cursor = sorted[0].from;
    const last = sorted[sorted.length - 1].from;
    while (cursor.getTime() <= last.getTime()) {
      const b = bucketOf(cursor, granularity);
      buckets.push(map.get(b.key) ?? { ...b, incomePlan: 0, expensePlan: 0, incomeActual: 0, expenseActual: 0, accrual: 0, netPlan: 0, netActual: 0, cumPlan: 0, cumActual: 0 });
      cursor = nextBucketStart(b.from, granularity);
    }
  }
  let cumPlan = 0;
  let cumActual = 0;
  buckets.forEach((b) => {
    b.incomePlan = round2(b.incomePlan);
    b.expensePlan = round2(b.expensePlan);
    b.incomeActual = round2(b.incomeActual);
    b.expenseActual = round2(b.expenseActual);
    b.accrual = round2(b.accrual);
    b.netPlan = round2(b.incomePlan - b.expensePlan);
    b.netActual = round2(b.incomeActual - b.expenseActual);
    cumPlan = round2(cumPlan + b.netPlan);
    cumActual = round2(cumActual + b.netActual);
    b.cumPlan = cumPlan;
    b.cumActual = cumActual;
  });

  return {
    buckets,
    totals: { incomePlan: round2(totals.incomePlan), expensePlan: round2(totals.expensePlan), incomeActual: round2(totals.incomeActual), expenseActual: round2(totals.expenseActual) },
    coverage,
    unplannedTotal: round2(coverage.reduce((s, c) => s + c.unplanned, 0)),
    warnings
  };
}

// --- rozplánování položky do plateb ------------------------------------------------------

/**
 * Rozloží částku do plateb podle podílů (např. 20/30/30/10/10 %): faktury v pravidelných odstupech od prvního data,
 * splatnost = faktura + dny splatnosti. Poslední platba dorovná zaokrouhlení, součet je vždy přesně `total`.
 */
export function splitPayments(args: {
  total: number;
  percents: number[];
  firstInvoice: Date;
  intervalDays: number;
  dueDays: number;
  description: string;
  itemId?: string;
  currency: CurrencyCode;
  vat: PlannedPayment['vat'];
  newId: () => string;
}): PlannedPayment[] {
  const sum = args.percents.reduce((s, p) => s + p, 0);
  if (!(sum > 0) || args.percents.some((p) => p < 0)) {
    return [];
  }
  let rest = round2(args.total);
  return args.percents.map((p, i) => {
    const amount = i === args.percents.length - 1 ? rest : round2((args.total * p) / sum);
    rest = round2(rest - amount);
    const invoice = addDays(args.firstInvoice, i * args.intervalDays);
    return {
      id: args.newId(),
      itemId: args.itemId,
      description: args.percents.length > 1 ? `${args.description} (${i + 1}/${args.percents.length})` : args.description,
      amount,
      currency: args.currency,
      vat: args.vat,
      invoiceDate: dayText(invoice),
      dueDate: dayText(addDays(invoice, args.dueDays))
    };
  });
}

/** Podíly z textu „20/30/30/10/10“ (oddělovač / ; mezera, desetinná čárka platí); nečitelné vrátí prázdný seznam. */
export function parsePercents(text: string): number[] {
  const parts = text
    .split(/[\s/;]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
  const nums = parts.map((s) => Number(s.replace(',', '.')));
  return nums.length > 0 && nums.every((n) => isFinite(n) && n >= 0) && nums.some((n) => n > 0) ? nums : [];
}
