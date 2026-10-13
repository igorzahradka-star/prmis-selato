/**
 * Servisní požadavky a servisní listy — životní cyklus a pravidla, čistá logika bez SharePointu a Reactu.
 *
 * Tok: **požadavek** (zapíše správce nebo dispečer) → **servisní list** v lokalitě/zařízení → objednávka dodavateli →
 * dodavatel zapíše provedení (externí web/mobilní aplikace) → správce zkontroluje a odemkne fakturaci → podklad pro fakturaci
 * zákazníkovi → vyfakturováno → uzavřeno. Přijaté faktury dodavatelů se k listu párují přes účetnictví.
 */

import { Role } from './types';
import { hasAnyRole } from './roles';

export const REQUEST_PRIORITIES = ['Nízká', 'Běžná', 'Vysoká', 'Havárie'] as const;
export const REQUEST_KINDS = ['Porucha', 'Preventivní prohlídka', 'Ostatní'] as const;

export enum RequestStatus {
  Prijato = 'Přijato',
  Zpracovava = 'Zpracovává se',
  Vyreseno = 'Vyřešeno',
  Zamitnuto = 'Zamítnuto'
}

export interface ServiceRequest {
  id: number;
  /** Číslo požadavku (SPO-2026-0001). */
  number: string;
  siteNumber: string;
  /** Zařízení, kterého se požadavek týká; bez něj platí lokalita celkově. */
  deviceNumber?: string;
  title: string;
  description?: string;
  priority: string;
  kind: string;
  /** Kdo požadavek nahlásil (kontakt u zákazníka). */
  reportedBy?: string;
  receivedAt: Date;
  receivedByName: string;
  receivedByLogin?: string;
  status: RequestStatus;
  note?: string;
}

export enum JobStatus {
  Naplanovano = 'Naplánováno',
  Objednano = 'Dodavatel objednán',
  Provedeno = 'Provedeno',
  KFakturaci = 'K fakturaci',
  Vyfakturovano = 'Vyfakturováno',
  Uzavreno = 'Uzavřeno',
  Zruseno = 'Zrušeno'
}

/** Pořadí stavů pro přehledy a postup. */
export const JOB_STATUS_ORDER: JobStatus[] = [JobStatus.Naplanovano, JobStatus.Objednano, JobStatus.Provedeno, JobStatus.KFakturaci, JobStatus.Vyfakturovano, JobStatus.Uzavreno, JobStatus.Zruseno];

export interface ServiceJob {
  id: number;
  /** Číslo servisního listu (SL-2026-0001). */
  number: string;
  requestId?: number;
  requestNumber?: string;
  siteNumber: string;
  /** Zařízení = servisní projekt, ke kterému se váže objednávka a fakturace. */
  deviceNumber: string;
  title: string;
  /** Zadání práce pro dodavatele. */
  description?: string;
  status: JobStatus;
  plannedDate?: Date;
  supplierId?: number;
  supplierName?: string;
  /** Objednávka dodavateli (PRM_PurchaseOrders). */
  orderId?: number;
  orderNumber?: string;
  /** Provedení zapisuje dodavatel (externí web) nebo za něj dispečer. */
  doneAt?: Date;
  workReport?: string;
  hours?: number;
  material?: string;
  /** Odkaz na složku s fotkami z provedení. */
  photosUrl?: string;
  /** Kontrola správcem a odemknutí fakturace. */
  checkedByName?: string;
  checkedAt?: Date;
  checkNote?: string;
  /** Podklad pro fakturaci zákazníkovi. */
  invoiceId?: number;
  invoiceNumber?: string;
  cancelReason?: string;
  createdByName?: string;
  createdAt?: Date;
}

export type JobAction = 'edit' | 'order' | 'report' | 'returnToSupplier' | 'check' | 'invoice' | 'markInvoiced' | 'close' | 'cancel';

const ORDER_BY_ACTION: Record<JobAction, JobStatus[]> = {
  edit: [JobStatus.Naplanovano, JobStatus.Objednano],
  order: [JobStatus.Naplanovano],
  report: [JobStatus.Objednano],
  returnToSupplier: [JobStatus.Provedeno],
  check: [JobStatus.Provedeno],
  invoice: [JobStatus.KFakturaci],
  markInvoiced: [JobStatus.KFakturaci],
  close: [JobStatus.Vyfakturovano],
  cancel: [JobStatus.Naplanovano, JobStatus.Objednano]
};

/** Kdo smí danou akci provést: správce servisu a administrátor kontrolují, odemykají fakturaci a uzavírají; dispečer zadává, objednává a hlásí provedení. */
function mayDo(action: JobAction, roles: Role[]): boolean {
  switch (action) {
    case 'edit':
    case 'order':
    case 'report':
    case 'cancel':
      return hasAnyRole(roles, Role.Administrator, Role.SpravceServisu, Role.Dispecer);
    case 'returnToSupplier':
    case 'check':
    case 'invoice':
    case 'markInvoiced':
    case 'close':
      return hasAnyRole(roles, Role.Administrator, Role.SpravceServisu);
  }
}

/** Akce, které se u listu nabízejí (tlačítka). Pravidla se znovu ověřují při zápisu. */
export function availableJobActions(job: Pick<ServiceJob, 'status' | 'invoiceId'>, roles: Role[]): JobAction[] {
  return (Object.keys(ORDER_BY_ACTION) as JobAction[]).filter((a) => {
    if (ORDER_BY_ACTION[a].indexOf(job.status) === -1 || !mayDo(a, roles)) {
      return false;
    }
    // Podklad pro fakturaci se zakládá jednou; „vyfakturováno“ jde až s podkladem.
    return a === 'invoice' ? !job.invoiceId : a === 'markInvoiced' ? !!job.invoiceId : true;
  });
}

export class ServiceFlowError extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, ServiceFlowError.prototype);
    this.name = 'ServiceFlowError';
  }
}

export interface JobChange {
  status: JobStatus;
  patch: Partial<ServiceJob>;
  /** Věta do auditního logu. */
  audit: string;
}

export interface JobActionInput {
  comment?: string;
  /** Provedení (`report`). */
  doneAt?: Date;
  workReport?: string;
  hours?: number;
  material?: string;
  photosUrl?: string;
  /** Objednávka (`order`). */
  orderId?: number;
  orderNumber?: string;
  /** Podklad pro fakturaci (`invoice`). */
  invoiceId?: number;
  invoiceNumber?: string;
}

/**
 * Provede přechod servisního listu. Kontroluje stav, roli a povinné údaje; vrací, co se má zapsat.
 * Nic nezapisuje — zápis dělá datová vrstva, která tuhle funkci volá znovu těsně před uložením.
 */
export function applyJobAction(job: ServiceJob, action: JobAction, input: JobActionInput, actor: { displayName: string; roles: Role[] }, now: Date = new Date()): JobChange {
  if (ORDER_BY_ACTION[action].indexOf(job.status) === -1) {
    throw new ServiceFlowError(`Servisní list ${job.number} je ve stavu „${job.status}“, tuto akci v něm nejde provést.`);
  }
  if (!mayDo(action, actor.roles)) {
    throw new ServiceFlowError(action === 'edit' || action === 'order' || action === 'report' || action === 'cancel' ? 'K této akci v Servisu nemáte oprávnění.' : 'Tuto akci smí provést jen správce servisu.');
  }
  const comment = (input.comment || '').trim();
  switch (action) {
    case 'edit':
      return { status: job.status, patch: {}, audit: 'Upraven servisní list' };
    case 'order': {
      if (!job.supplierId && !job.supplierName) {
        throw new ServiceFlowError('Nejdřív vyberte dodavatele servisního listu.');
      }
      if (!input.orderId) {
        throw new ServiceFlowError('Chybí objednávka dodavateli — nejdřív ji vystavte.');
      }
      return { status: JobStatus.Objednano, patch: { orderId: input.orderId, orderNumber: input.orderNumber }, audit: `Objednán dodavatel (${input.orderNumber || input.orderId})` };
    }
    case 'report': {
      const report = (input.workReport || '').trim();
      if (report === '') {
        throw new ServiceFlowError('Popište, co se provedlo (zpráva o provedení).');
      }
      return {
        status: JobStatus.Provedeno,
        patch: { doneAt: input.doneAt || now, workReport: report, hours: input.hours, material: (input.material || '').trim() || undefined, photosUrl: input.photosUrl || job.photosUrl },
        audit: 'Zapsáno provedení servisu'
      };
    }
    case 'returnToSupplier':
      if (comment === '') {
        throw new ServiceFlowError('Napište, co má dodavatel opravit nebo doplnit.');
      }
      return { status: JobStatus.Objednano, patch: { checkNote: comment }, audit: `Vráceno dodavateli: ${comment}` };
    case 'check':
      return {
        status: JobStatus.KFakturaci,
        patch: { checkedByName: actor.displayName, checkedAt: now, checkNote: comment || undefined },
        audit: 'Zkontrolováno správcem, fakturace odemčena'
      };
    case 'invoice':
      if (!input.invoiceId) {
        throw new ServiceFlowError('Chybí podklad pro fakturaci.');
      }
      return { status: JobStatus.KFakturaci, patch: { invoiceId: input.invoiceId, invoiceNumber: input.invoiceNumber }, audit: `Založen podklad pro fakturaci (${input.invoiceNumber || input.invoiceId})` };
    case 'markInvoiced':
      if (!job.invoiceId) {
        throw new ServiceFlowError('Nejdřív založte podklad pro fakturaci.');
      }
      return { status: JobStatus.Vyfakturovano, patch: {}, audit: 'Vyfakturováno zákazníkovi' };
    case 'close':
      return { status: JobStatus.Uzavreno, patch: {}, audit: 'Servisní list uzavřen' };
    case 'cancel':
      if (comment === '') {
        throw new ServiceFlowError('Napište důvod zrušení.');
      }
      return { status: JobStatus.Zruseno, patch: { cancelReason: comment }, audit: `Zrušeno: ${comment}` };
  }
}

/** Stav požadavku podle jeho servisních listů: bez listu Přijato, dokud je některý živý Zpracovává se, jinak Vyřešeno. Zamítnutí je ruční. */
export function requestStatusFrom(current: RequestStatus, jobs: Pick<ServiceJob, 'status'>[]): RequestStatus {
  if (current === RequestStatus.Zamitnuto) {
    return current;
  }
  if (jobs.length === 0) {
    return RequestStatus.Prijato;
  }
  const alive = jobs.some((j) => j.status !== JobStatus.Uzavreno && j.status !== JobStatus.Zruseno);
  return alive ? RequestStatus.Zpracovava : jobs.every((j) => j.status === JobStatus.Zruseno) ? RequestStatus.Prijato : RequestStatus.Vyreseno;
}

/** Je servisní list po termínu (naplánovaný/objednaný a plánované datum už minulo)? */
export function isJobOverdue(job: Pick<ServiceJob, 'status' | 'plannedDate'>, today: Date = new Date()): boolean {
  if (!job.plannedDate || (job.status !== JobStatus.Naplanovano && job.status !== JobStatus.Objednano)) {
    return false;
  }
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const p = new Date(job.plannedDate.getFullYear(), job.plannedDate.getMonth(), job.plannedDate.getDate()).getTime();
  return p < d;
}
