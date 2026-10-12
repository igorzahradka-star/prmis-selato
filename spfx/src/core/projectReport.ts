/**
 * Report ze stavu projektu — čistá logika bez SharePointu a Reactu: z dat projektu poskládá to, co report ukazuje
 * (finance, objednávky, fakturace, termíny, úkoly ze zápisů, zápisy ze stavby, fotky). PDF samotné je v `features/reports`.
 *
 * Částky v reportu jsou ve **výchozí měně přehledů** z Nastavení (přepočet kurzem ČNB); doklady zůstávají v měně dokladu.
 */

import { Project, ProjectTask } from './types';
import { OrderStatus, ORDER_STATUS_ORDER, PurchaseOrder, SPENT_ORDER_STATUSES, sortOrdersNewestFirst } from './orders';
import { InvoiceBasis, InvoiceStatus, INVOICE_STATUS_ORDER, invoiceKindOf, sortInvoicesNewestFirst } from './invoiceBases';
import { sortDeadlines } from './deadlines';
import { DiaryEntry, EntryStatus, parseIsoDay } from './siteDiary';
import { BudgetDoc, BudgetRecord, budgetTotals, lastApproval } from './budget';
import { DEFAULT_MARGIN_THRESHOLDS, MarginThresholds, approvedMargin, ensureRevenues, marginStatus } from './budgetMargin';
import { RateTable, asCurrencyCode } from './currency';

/** Které části report obsahuje (uživatel je v dialogu zapíná a vypíná). */
export interface ReportSections {
  /** Realizační rozpočet: nákup, tržby, marže, nakoupeno, semafor. */
  budget: boolean;
  finance: boolean;
  deadlines: boolean;
  diary: boolean;
  photos: boolean;
}

export const ALL_REPORT_SECTIONS: ReportSections = { budget: true, finance: true, deadlines: true, diary: true, photos: true };

/** Kolik řádků se vejde na jednu stránku reportu — víc se zkrátí a řekne se, kolik jich ještě je. */
export const REPORT_LIMITS = { orders: 8, invoices: 8, deadlines: 7, tasks: 7, entries: 6, photos: 6 };

export interface ReportOrderRow {
  number: string;
  supplier: string;
  subject: string;
  status: string;
  /** Částka bez DPH ve výchozí měně přehledů. */
  amount: number;
  /** Původní měna dokladu, když se liší od měny reportu (pro poznámku „≈“). */
  originalCurrency?: string;
}

export interface ReportStatusSum {
  status: string;
  count: number;
  amount: number;
}

export interface ReportInvoiceRow {
  number: string;
  kind: string;
  status: string;
  amount: number;
  dueDate?: Date;
  accountingInvoiceNo?: string;
  originalCurrency?: string;
}

export interface ReportDeadlineRow {
  title: string;
  type: string;
  dueDate?: Date;
  percent: number;
  contractual: boolean;
  responsible?: string;
  overdue: boolean;
}

export interface ReportTaskRow {
  description: string;
  responsible?: string;
  due?: Date;
  /** Číslo zápisu, ze kterého úkol je. */
  entryNo: number;
  overdue: boolean;
}

export interface ReportEntryRow {
  entryNo: number;
  date: Date;
  diary: string;
  counterparty: string;
  status: string;
  pointCount: number;
  summary: string;
}

export interface ReportPhoto {
  /** Fotka jako data URL (zmenšená). */
  dataUrl: string;
  caption: string;
  /** Název dávky (složky), ze které fotka je. */
  batch: string;
}

/** Jedna skupina rozpočtu v reportu (částky ve měně reportu, bez DPH). */
export interface ReportBudgetGroup {
  name: string;
  kind: string;
  cost: number;
  actual: number;
  remaining: number;
}

/** Realizační rozpočet v reportu: nákup (plán, prognóza, nakoupeno, zbývá), tržby, marže, semafor a stav schválení. */
export interface ReportBudget {
  /** Rozpočet někdo aspoň jednou schválil; jinak jsou čísla provizorní. */
  approved: boolean;
  approvalNo?: number;
  approvedAt?: Date;
  approvedBy?: string;
  /** Čeká na schválení vedením. */
  pending: boolean;
  /** Součty se od posledního schválení změnily. */
  changedSinceApproval: boolean;
  /** Plán nákupu a smluvní cena (plán výnosů). */
  cost: number;
  sale: number;
  /** Prognóza tržeb. */
  revenueForecast: number;
  /** Marže: aktuální z prognózy a při posledním schválení (zadání), v %. */
  marginForecastPercent?: number;
  marginApprovedPercent?: number;
  ordered: number;
  forecast: number;
  actual: number;
  remaining: number;
  /** Prostavěnost: nakoupeno jako % plánu nákupu. */
  spentPercent: number;
  semaphore: string;
  groups: ReportBudgetGroup[];
}

export interface ProjectReportModel {
  generatedAt: Date;
  generatedBy: string;
  companyName: string;
  sections: ReportSections;
  /** Měna, ve které jsou částky v reportu (kód CZK / EUR / USD). */
  currency: string;
  project: {
    number: string;
    title: string;
    customer: string;
    location: string;
    type: string;
    manager: string;
    status: string;
    start?: Date;
    endPlanned?: Date;
    endActual?: Date;
    budgetStatus: string;
  };
  /** Rozpočet projektu; chybí, když ho projekt nemá (nebo ho report nemá obsahovat). */
  budget?: ReportBudget;
  finance: {
    /** Celková cena projektu (smluvní, bez DPH) ve měně reportu; má-li projekt rozpočet, je to prodej rozpočtu. */
    price?: number;
    /** Čísla (cena, nakoupeno) jsou z rozpočtu / rozpočet zatím není schválený. */
    fromBudget?: boolean;
    provisional?: boolean;
    originalPrice?: { amount: number; currency: string };
    /** Nakoupeno (z rozpočtu), jinak objednáno: součet vystavených objednávek bez DPH. */
    spent: number;
    spentPercent?: number;
    ordersByStatus: ReportStatusSum[];
    ordersTotal: number;
    orders: ReportOrderRow[];
    ordersHidden: number;
    invoices: ReportInvoiceRow[];
    invoicesHidden: number;
    invoicesByStatus: ReportStatusSum[];
    /** Vyfakturováno = podklady ve stavu Vyfakturováno a Uhrazeno. */
    invoiced: number;
    paid: number;
  };
  deadlines: ReportDeadlineRow[];
  deadlinesHidden: number;
  tasks: ReportTaskRow[];
  tasksHidden: number;
  entries: ReportEntryRow[];
  entriesHidden: number;
  photos: ReportPhoto[];
}

export interface ReportInput {
  project: Project;
  /** Rozpočet projektu (obsah, záznam se schválením a kurzy); bez něj se použijí údaje z projektu a objednávky. */
  budget?: { doc: BudgetDoc; record?: BudgetRecord; rates: RateTable; marginThresholds?: MarginThresholds };
  orders: PurchaseOrder[];
  invoices: InvoiceBasis[];
  tasks: ProjectTask[];
  entries: DiaryEntry[];
  photos: ReportPhoto[];
  sections: ReportSections;
  /** Přepočet částky do měny reportu. */
  convert: (amount: number, currency: string) => number;
  currency: string;
  generatedBy: string;
  companyName: string;
  now?: Date;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Zkrátí text na `max` znaků (na hranici slova, když to jde) a přidá „…“. Řádky se spojí do jednoho. */
export function shorten(text: string | undefined, max: number): string {
  const flat = (text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) {
    return flat;
  }
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;.:-]+$/, '')}…`;
}

function groupByStatus<T>(items: T[], statusOf: (i: T) => string, amountOf: (i: T) => number, order: string[]): ReportStatusSum[] {
  const map: Record<string, ReportStatusSum> = {};
  items.forEach((i) => {
    const s = statusOf(i);
    const row = map[s] || (map[s] = { status: s, count: 0, amount: 0 });
    row.count++;
    row.amount += amountOf(i);
  });
  const known = order.filter((s) => map[s]).map((s) => map[s]);
  const other = Object.keys(map)
    .filter((s) => order.indexOf(s) === -1)
    .map((s) => map[s]);
  return [...known, ...other];
}

const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

/** Poskládá model reportu ze surových dat. Nic nečte ze SharePointu — jen počítá a řadí. */
export function buildProjectReportModel(input: ReportInput): ProjectReportModel {
  const now = input.now ?? new Date();
  const p = input.project;
  const conv = (amount: number, currency: string): number => round2(input.convert(amount, currency));

  // --- finance
  const spentOrders = input.orders.filter((o) => SPENT_ORDER_STATUSES.indexOf(o.status) !== -1);
  const spent = round2(spentOrders.reduce((sum, o) => sum + conv(o.amountNet, o.currency), 0));
  // --- rozpočet (je-li): cena = smluvní (plán výnosů), nakoupeno = skutečnost, prostavěnost = nakoupeno / plán nákupu
  let budget: ReportBudget | undefined;
  if (input.budget && input.sections.budget) {
    const b = input.budget;
    const cur = asCurrencyCode(input.currency);
    const doc = ensureRevenues(b.doc, p, b.rates);
    const totals = budgetTotals(doc, cur, b.rates, input.orders);
    const totalsCzk = budgetTotals(doc, 'CZK', b.rates, input.orders);
    const last = lastApproval(b.record);
    const approved = approvedMargin(last, totalsCzk.sale);
    const semaphore = marginStatus(totals.forecastMargin.percent, b.marginThresholds ?? DEFAULT_MARGIN_THRESHOLDS);
    budget = {
      approved: !!last,
      approvalNo: last ? last.no : undefined,
      approvedAt: last ? last.at : undefined,
      approvedBy: last ? last.byName : undefined,
      pending: !!b.record && b.record.status === 'Ke schválení',
      changedSinceApproval: !!approved && (Math.abs(approved.cost - totalsCzk.cost) > 0.5 || Math.abs(approved.revenue - totalsCzk.sale) > 0.5),
      cost: totals.cost,
      sale: totals.sale,
      revenueForecast: totals.revenueForecast,
      marginForecastPercent: totals.forecastMargin.percent,
      marginApprovedPercent: approved ? approved.percent : undefined,
      ordered: totals.ordered,
      forecast: totals.forecast,
      actual: totals.actual,
      remaining: totals.remaining,
      spentPercent: totals.spentPercent,
      semaphore,
      groups: totals.byGroup.map((g) => ({ name: g.name, kind: g.kind, cost: g.cost, actual: g.actual, remaining: g.remaining }))
    };
  }
  const price = budget ? budget.sale : p.contractPriceNet === undefined ? undefined : conv(p.contractPriceNet, p.currency);

  const ordersSorted = sortOrdersNewestFirst(input.orders);
  const orders: ReportOrderRow[] = ordersSorted.slice(0, REPORT_LIMITS.orders).map((o) => ({
    number: o.orderNumber,
    supplier: o.supplierName || '—',
    subject: shorten(o.subject, 60),
    status: o.status,
    amount: conv(o.amountNet, o.currency),
    originalCurrency: o.currency !== input.currency ? o.currency : undefined
  }));

  const invoicesSorted = sortInvoicesNewestFirst(input.invoices);
  const invoices: ReportInvoiceRow[] = invoicesSorted.slice(0, REPORT_LIMITS.invoices).map((i) => ({
    number: i.number,
    kind: invoiceKindOf(i),
    status: i.status,
    amount: conv(i.amountNet, i.currency),
    dueDate: i.dueDate,
    accountingInvoiceNo: i.accountingInvoiceNo,
    originalCurrency: i.currency !== input.currency ? i.currency : undefined
  }));
  const liveInvoices = input.invoices.filter((i) => i.status !== InvoiceStatus.Storno);
  const sumInvoices = (statuses: InvoiceStatus[]): number =>
    round2(input.invoices.filter((i) => statuses.indexOf(i.status) !== -1).reduce((sum, i) => sum + conv(i.amountNet, i.currency), 0));

  // --- termíny
  const today = startOfDay(now);
  const sortedDeadlines = sortDeadlines(input.tasks);
  const deadlines: ReportDeadlineRow[] = sortedDeadlines.slice(0, REPORT_LIMITS.deadlines).map((t) => ({
    title: t.title,
    type: t.taskType,
    dueDate: t.finishDate,
    percent: t.percentComplete,
    contractual: t.isContractualDeadline,
    responsible: t.responsibleName,
    overdue: !!t.finishDate && startOfDay(t.finishDate) < today && t.percentComplete < 100
  }));

  // --- zápisy a úkoly z nich
  const entriesLive = input.entries.filter((e) => e.status !== EntryStatus.Storno);
  const entriesSorted = entriesLive.slice().sort((a, b) => b.date.getTime() - a.date.getTime() || b.entryNo - a.entryNo);
  const entries: ReportEntryRow[] = entriesSorted.slice(0, REPORT_LIMITS.entries).map((e) => {
    const firstPoint = e.points.filter((pt) => pt.text.trim() !== '' || (pt.title || '').trim() !== '')[0];
    const firstTitle = firstPoint ? (firstPoint.title || '').trim() : '';
    const summary = firstPoint ? (firstTitle !== '' ? `${firstTitle}: ${firstPoint.text}` : firstPoint.text) : e.conditions || '';
    return {
      entryNo: e.entryNo,
      date: e.date,
      diary: e.diaryTitle || '',
      counterparty: e.header.counterparty || '—',
      status: e.status,
      pointCount: e.points.filter((pt) => pt.text.trim() !== '' || (pt.title || '').trim() !== '' || pt.files.length > 0).length,
      summary: shorten(summary, 150)
    };
  });
  // Úkoly z nejnovějších tří zápisů (zápis nemá „hotovo“, proto jen čerstvé), podle termínu.
  const taskRows: ReportTaskRow[] = [];
  entriesSorted.slice(0, 3).forEach((e) =>
    e.tasks
      .filter((t) => t.description.trim() !== '')
      .forEach((t) => {
        const due = parseIsoDay(t.due);
        taskRows.push({ description: shorten(t.description, 90), responsible: t.responsible, due, entryNo: e.entryNo, overdue: !!due && startOfDay(due) < today });
      })
  );
  taskRows.sort((a, b) => (a.due ? a.due.getTime() : Infinity) - (b.due ? b.due.getTime() : Infinity));

  return {
    generatedAt: now,
    generatedBy: input.generatedBy,
    companyName: input.companyName,
    sections: input.sections,
    currency: input.currency,
    project: {
      number: p.projectNumber,
      title: p.shortName || p.title,
      customer: p.customerName || '—',
      location: p.location || '—',
      type: p.projectType || '—',
      manager: p.projectManagerName || '—',
      status: p.status,
      start: p.startDate,
      endPlanned: p.endDatePlanned,
      endActual: p.endDateActual,
      budgetStatus: budget ? budget.semaphore : p.budgetStatus || 'Bez rozpočtu'
    },
    budget,
    finance: {
      price,
      fromBudget: !!budget,
      provisional: budget ? !budget.approved : false,
      originalPrice: !budget && p.contractPriceNet !== undefined && p.currency !== input.currency ? { amount: p.contractPriceNet, currency: p.currency } : undefined,
      spent: budget ? budget.actual : spent,
      spentPercent: budget ? budget.spentPercent : price !== undefined && price > 0 ? Math.round((spent / price) * 1000) / 10 : undefined,
      ordersByStatus: groupByStatus(input.orders, (o) => o.status, (o) => conv(o.amountNet, o.currency), ORDER_STATUS_ORDER as OrderStatus[]),
      ordersTotal: input.orders.length,
      orders,
      ordersHidden: Math.max(0, input.orders.length - orders.length),
      invoices,
      invoicesHidden: Math.max(0, input.invoices.length - invoices.length),
      invoicesByStatus: groupByStatus(liveInvoices, (i) => i.status, (i) => conv(i.amountNet, i.currency), INVOICE_STATUS_ORDER as InvoiceStatus[]),
      invoiced: sumInvoices([InvoiceStatus.Vyfakturovano, InvoiceStatus.Uhrazeno]),
      paid: sumInvoices([InvoiceStatus.Uhrazeno])
    },
    deadlines,
    deadlinesHidden: Math.max(0, input.tasks.length - deadlines.length),
    tasks: taskRows.slice(0, REPORT_LIMITS.tasks),
    tasksHidden: Math.max(0, taskRows.length - REPORT_LIMITS.tasks),
    entries,
    entriesHidden: Math.max(0, entriesLive.length - entries.length),
    photos: input.photos.slice(0, REPORT_LIMITS.photos)
  };
}

/** Název souboru reportu: `Report_26001_2026-10-01.pdf`. */
export function reportFileName(projectNumber: string, day: Date): string {
  const two = (n: number): string => (n < 10 ? `0${n}` : String(n));
  const safe = projectNumber.replace(/[^0-9A-Za-z-]+/g, '_');
  return `Report_${safe}_${day.getFullYear()}-${two(day.getMonth() + 1)}-${two(day.getDate())}.pdf`;
}

/**
 * „Na co dát pozor“ — krátký výčet věcí, které si v reportu zaslouží pozornost (plyne z dat, nic se nevymýšlí):
 * termíny po lhůtě, rozpočet, objednávky a podklady, které na někoho čekají, úkoly po termínu, plánované ukončení po termínu.
 * Bez problémů vrací jednu větu, že je vše v pořádku.
 */
export function reportHighlights(m: ProjectReportModel): string[] {
  const out: string[] = [];
  const plural = (n: number, one: string, few: string, many: string): string => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
  const overdueDeadlines = m.deadlines.filter((d) => d.overdue).length;
  if (overdueDeadlines > 0) {
    out.push(`${overdueDeadlines} ${plural(overdueDeadlines, 'termín je', 'termíny jsou', 'termínů je')} po lhůtě a není hotový.`);
  }
  const overdueTasks = m.tasks.filter((t) => t.overdue).length;
  if (overdueTasks > 0) {
    out.push(`${overdueTasks} ${plural(overdueTasks, 'úkol ze zápisu je', 'úkoly ze zápisů jsou', 'úkolů ze zápisů je')} po termínu.`);
  }
  const pct = m.finance.spentPercent;
  if (pct !== undefined && pct > 100) {
    out.push(m.finance.fromBudget ? `Prostavěnost ${String(pct).replace('.', ',')} % plánu nákupu — nakoupeno přesahuje plán.` : `Objednáno ${String(pct).replace('.', ',')} % celkové ceny — objednávky přesahují cenu projektu.`);
  } else if (pct !== undefined && pct >= 90) {
    out.push(m.finance.fromBudget ? `Prostavěnost už ${String(pct).replace('.', ',')} % plánu nákupu.` : `Objednáno už ${String(pct).replace('.', ',')} % celkové ceny.`);
  }
  if (m.budget && !m.budget.approved) {
    out.push('Rozpočet zatím nebyl schválen vedením — cena, nákup a prostavěnost v reportu jsou provizorní.');
  } else if (m.budget && m.budget.changedSinceApproval) {
    out.push('Rozpočet byl od posledního schválení upraven — čísla se liší od schválených.');
  }
  if (m.budget && m.budget.forecast > m.budget.cost) {
    out.push('Prognóza nákladů je vyšší než plán rozpočtu.');
  }
  if (m.project.budgetStatus === 'Červená') {
    out.push('Semafor rozpočtu je červený.');
  } else if (m.project.budgetStatus === 'Žlutá') {
    out.push('Semafor rozpočtu je žlutý.');
  }
  const waitingOrders = m.finance.ordersByStatus.filter((s) => s.status === OrderStatus.KeSchvaleni)[0];
  if (waitingOrders) {
    out.push(`${waitingOrders.count} ${plural(waitingOrders.count, 'objednávka čeká', 'objednávky čekají', 'objednávek čeká')} na schválení.`);
  }
  const toCheck = m.finance.invoicesByStatus.filter((s) => s.status === InvoiceStatus.KeKontrole)[0];
  if (toCheck) {
    out.push(`${toCheck.count} ${plural(toCheck.count, 'podklad pro fakturaci čeká', 'podklady pro fakturaci čekají', 'podkladů pro fakturaci čeká')} na kontrolu.`);
  }
  if (m.project.endPlanned && m.project.endPlanned.getTime() < m.generatedAt.getTime() && m.project.status !== 'Dokončeno' && m.project.status !== 'Storno') {
    out.push(`Plánované ukončení (${m.project.endPlanned.getDate()}. ${m.project.endPlanned.getMonth() + 1}. ${m.project.endPlanned.getFullYear()}) už uplynulo, projekt není dokončený.`);
  }
  return out.length > 0 ? out : ['Žádná upozornění — termíny, rozpočet i schvalování jsou v pořádku.'];
}
