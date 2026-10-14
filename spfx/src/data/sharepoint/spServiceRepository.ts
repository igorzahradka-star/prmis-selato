/**
 * Modul Servis v SharePointu: lokality, zařízení, požadavky a servisní listy (seznamy PRM_Service*).
 *
 * Práva se ověřují tady (`core/service`), servisní list prochází jedinou cestou `actOnJob` (pravidla toku v `core/serviceJobs`).
 * Skutečná ochrana dat jsou oprávnění seznamů a servisních projektů v SharePointu — tato vrstva rozhoduje, co se kdo smí pokusit udělat.
 * Čtení nikdy nehází chybu při chybějícím seznamu (před Instalací) — vrací prázdný výsledek.
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { CurrentUser } from '../../core/types';
import { toDate } from '../../core/format';
import { canAdministerService, canWorkInService, nextSiteNumber, validateDeviceNumber, validateSiteNumber, ServiceDevice, ServiceSite } from '../../core/service';
import { JobAction, JobActionInput, JobStatus, RequestStatus, ServiceFlowError, ServiceJob, ServiceRequest, applyJobAction, requestStatusFrom } from '../../core/serviceJobs';
import { INumberingRepository, IProjectRepository, IServiceRepository, ServiceDeviceInput, ServiceJobInput, ServiceRequestInput, ServiceSiteInput } from '../repositories';
import { getSp, describeSpError } from './spContext';

const SITES = 'PRM_ServiceSites';
const DEVICES = 'PRM_ServiceDevices';
const REQUESTS = 'PRM_ServiceRequests';
const JOBS = 'PRM_ServiceJobs';
const AUDIT = 'PRM_AuditLog';

type Item = Record<string, unknown> & { Id: number; Title?: string };

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);
const numOrUndef = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) ? v : undefined);
const iso = (d: Date | undefined): string | null => (d ? d.toISOString() : null);

function mapSite(i: Item): ServiceSite {
  return {
    id: i.Id,
    number: str(i.SiteNumber) || '',
    name: i.Title || '',
    customerId: numOrUndef(i.CustomerId),
    customerName: str(i.CustomerName),
    address: str(i.Address),
    latitude: numOrUndef(i.Latitude),
    longitude: numOrUndef(i.Longitude),
    contact: str(i.Contact),
    note: str(i.Note),
    folderUrl: str(i.FolderUrl),
    isActive: i.IsActive !== false
  };
}

function mapDevice(i: Item): ServiceDevice {
  return {
    id: i.Id,
    number: str(i.DeviceNumber) || '',
    siteNumber: str(i.SiteNumber) || '',
    name: i.Title || '',
    kind: str(i.DeviceKind) || 'Jiné',
    latitude: numOrUndef(i.Latitude),
    longitude: numOrUndef(i.Longitude),
    customerName: str(i.CustomerName),
    contractFrom: toDate(str(i.ContractFrom)),
    contractTo: toDate(str(i.ContractTo)),
    contractNote: str(i.ContractNote),
    contractUrl: str(i.ContractUrl),
    folderUrl: str(i.FolderUrl),
    isActive: i.IsActive !== false
  };
}

function mapRequest(i: Item): ServiceRequest {
  const status = [RequestStatus.Prijato, RequestStatus.Zpracovava, RequestStatus.Vyreseno, RequestStatus.Zamitnuto].filter((s) => s === i.RequestStatus)[0] || RequestStatus.Prijato;
  return {
    id: i.Id,
    number: str(i.RequestNumber) || '',
    siteNumber: str(i.SiteNumber) || '',
    deviceNumber: str(i.DeviceNumber),
    title: i.Title || '',
    description: str(i.Description),
    priority: str(i.Priority) || 'Běžná',
    kind: str(i.RequestKind) || 'Porucha',
    reportedBy: str(i.ReportedBy),
    receivedAt: toDate(str(i.ReceivedAt)) || new Date(),
    receivedByName: str(i.ReceivedByName) || '',
    receivedByLogin: str(i.ReceivedByLogin),
    status,
    note: str(i.Note)
  };
}

function mapJob(i: Item): ServiceJob {
  const status = (Object.keys(JobStatus) as (keyof typeof JobStatus)[]).map((k) => JobStatus[k]).filter((s) => s === i.JobStatus)[0] || JobStatus.Naplanovano;
  return {
    id: i.Id,
    number: str(i.JobNumber) || '',
    requestId: numOrUndef(i.RequestId),
    requestNumber: str(i.RequestNumber),
    siteNumber: str(i.SiteNumber) || '',
    deviceNumber: str(i.DeviceNumber) || '',
    title: i.Title || '',
    description: str(i.Description),
    status,
    plannedDate: toDate(str(i.PlannedDate)),
    supplierId: numOrUndef(i.SupplierId),
    supplierName: str(i.SupplierName),
    orderId: numOrUndef(i.OrderId),
    orderNumber: str(i.OrderNumber),
    doneAt: toDate(str(i.DoneAt)),
    workReport: str(i.WorkReport),
    hours: numOrUndef(i.Hours),
    material: str(i.Material),
    photosUrl: str(i.PhotosUrl),
    checkedByName: str(i.CheckedByName),
    checkedAt: toDate(str(i.CheckedAt)),
    checkNote: str(i.CheckNote),
    invoiceId: numOrUndef(i.InvoiceId),
    invoiceNumber: str(i.InvoiceNumber),
    cancelReason: str(i.CancelReason),
    createdByName: str(i.CreatedByName)
  };
}

export class SpServiceRepository implements IServiceRepository {
  public constructor(
    private readonly context: WebPartContext,
    private readonly numbering: INumberingRepository,
    private readonly projects: IProjectRepository
  ) {}

  private async readAll(list: string): Promise<Item[]> {
    try {
      return (await getSp(this.context).web.lists.getByTitle(list).items.top(5000)()) as Item[];
    } catch {
      // Seznam ještě není (před Instalací) — Servis je prázdný.
      return [];
    }
  }

  private async add(list: string, fields: Record<string, unknown>, what: string): Promise<number> {
    try {
      const added = await getSp(this.context).web.lists.getByTitle(list).items.add(fields);
      const data = (added as { data?: { Id?: number }; Id?: number }).data ?? (added as { Id?: number });
      return (data as { Id?: number }).Id ?? 0;
    } catch (error) {
      throw new Error(describeSpError(error, what));
    }
  }

  private async update(list: string, id: number, fields: Record<string, unknown>, what: string): Promise<void> {
    try {
      await getSp(this.context).web.lists.getByTitle(list).items.getById(id).update(fields);
    } catch (error) {
      throw new Error(describeSpError(error, what));
    }
  }

  private async audit(entity: string, id: string, actor: CurrentUser, action: string, oldValue?: string, newValue?: string): Promise<void> {
    try {
      await getSp(this.context).web.lists.getByTitle(AUDIT).items.add({
        Title: `${entity} ${id}`,
        EntityType: entity,
        EntityId: id,
        Action: action.length > 250 ? `${action.slice(0, 247)}…` : action,
        PerformedById: actor.id,
        PerformedAt: new Date().toISOString(),
        OldValue: oldValue ?? '',
        NewValue: newValue ?? ''
      });
    } catch {
      // Audit nesmí shodit práci se servisním listem; chybu ukáže až diagnostika.
    }
  }

  // --- lokality ---

  public async listSites(): Promise<ServiceSite[]> {
    return (await this.readAll(SITES)).map(mapSite).sort((a, b) => a.number.localeCompare(b.number));
  }

  public async saveSite(input: ServiceSiteInput, actor: CurrentUser): Promise<ServiceSite> {
    if (!canAdministerService(actor.roles)) {
      throw new Error('Lokality smí spravovat jen správce servisu a administrátor.');
    }
    const sites = await this.listSites();
    const number = input.number || nextSiteNumber(sites.map((s) => s.number));
    const problem = validateSiteNumber(number, sites.map((s) => s.number), input.id ? sites.filter((s) => s.id === input.id)[0]?.number : undefined);
    if (problem) {
      throw new Error(problem);
    }
    if (input.name.trim() === '') {
      throw new Error('Vyplňte název lokality.');
    }
    const fields = {
      Title: input.name.trim(),
      SiteNumber: number,
      CustomerId: input.customerId ?? null,
      CustomerName: input.customerName ?? '',
      Address: input.address ?? '',
      Latitude: input.latitude ?? null,
      Longitude: input.longitude ?? null,
      Contact: input.contact ?? '',
      Note: input.note ?? '',
      FolderUrl: input.folderUrl ?? '',
      IsActive: input.isActive
    };
    let id = input.id;
    if (id) {
      await this.update(SITES, id, fields, 'Lokalitu se nepodařilo uložit');
      await this.audit('Servis – lokalita', number, actor, 'Upravena lokalita');
    } else {
      id = await this.add(SITES, fields, 'Lokalitu se nepodařilo založit');
      await this.audit('Servis – lokalita', number, actor, 'Založena lokalita');
    }
    return { ...input, id: id as number, number, name: input.name.trim() };
  }

  // --- zařízení ---

  public async listDevices(): Promise<ServiceDevice[]> {
    return (await this.readAll(DEVICES)).map(mapDevice).sort((a, b) => a.number.localeCompare(b.number));
  }

  public async saveDevice(input: ServiceDeviceInput, actor: CurrentUser): Promise<ServiceDevice> {
    if (!canAdministerService(actor.roles)) {
      throw new Error('Soubory smí spravovat jen správce servisu a administrátor.');
    }
    const [sites, devices] = await Promise.all([this.listSites(), this.listDevices()]);
    const site = sites.filter((s) => s.number === input.siteNumber)[0];
    if (!site) {
      throw new Error(`Lokalita ${input.siteNumber} neexistuje.`);
    }
    const self = input.id ? devices.filter((d) => d.id === input.id)[0] : undefined;
    const check = validateDeviceNumber(input.number, input.siteNumber, devices.map((d) => d.number), self?.number);
    if (check.error) {
      throw new Error(check.error);
    }
    if (input.name.trim() === '') {
      throw new Error('Vyplňte název souboru.');
    }
    const fields = {
      Title: input.name.trim(),
      DeviceNumber: input.number,
      SiteNumber: input.siteNumber,
      DeviceKind: input.kind,
      Latitude: input.latitude ?? null,
      Longitude: input.longitude ?? null,
      CustomerName: input.customerName ?? site.customerName ?? '',
      ContractFrom: iso(input.contractFrom),
      ContractTo: iso(input.contractTo),
      ContractNote: input.contractNote ?? '',
      ContractUrl: input.contractUrl ?? '',
      FolderUrl: input.folderUrl ?? '',
      IsActive: input.isActive
    };
    let id = input.id;
    if (id) {
      await this.update(DEVICES, id, fields, 'Soubor se nepodařilo uložit');
      await this.audit('Servis – soubor', input.number, actor, 'Upraven soubor');
    } else {
      // Zařízení je servisní zakázka: skrytý projekt typu Servis s omezeným přístupem.
      await this.projects.ensureServiceProject({
        projectNumber: input.number,
        title: `${input.number} ${site.name} – ${input.name.trim()}`,
        shortName: input.name.trim(),
        customerName: input.customerName ?? site.customerName,
        projectManagerName: actor.displayName,
        folderUrl: input.folderUrl
      });
      id = await this.add(DEVICES, fields, 'Soubor se nepodařilo založit');
      await this.audit('Servis – soubor', input.number, actor, 'Založen soubor (servisní projekt)');
    }
    return { ...input, id: id as number, name: input.name.trim() };
  }

  // --- požadavky ---

  public async listRequests(): Promise<ServiceRequest[]> {
    return (await this.readAll(REQUESTS)).map(mapRequest).sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
  }

  public async saveRequest(input: ServiceRequestInput, actor: CurrentUser): Promise<ServiceRequest> {
    if (!canWorkInService(actor.roles)) {
      throw new Error('Požadavky smí zapisovat jen správce servisu, dispečer a administrátor.');
    }
    if (input.title.trim() === '') {
      throw new Error('Vyplňte stručný popis požadavku.');
    }
    const base = {
      Title: input.title.trim(),
      SiteNumber: input.siteNumber,
      DeviceNumber: input.deviceNumber ?? '',
      Description: input.description ?? '',
      Priority: input.priority,
      RequestKind: input.kind,
      ReportedBy: input.reportedBy ?? '',
      Note: input.note ?? ''
    };
    if (input.id) {
      await this.update(REQUESTS, input.id, base, 'Požadavek se nepodařilo uložit');
      const found = (await this.listRequests()).filter((r) => r.id === input.id)[0];
      if (!found) {
        throw new Error('Požadavek nebyl nalezen.');
      }
      return found;
    }
    const number = await this.numbering.allocateNumber('SPO');
    const now = new Date();
    const id = await this.add(REQUESTS, { ...base, RequestNumber: number, RequestStatus: RequestStatus.Prijato, ReceivedAt: now.toISOString(), ReceivedByName: actor.displayName, ReceivedByLogin: actor.loginName }, 'Požadavek se nepodařilo zapsat');
    await this.audit('Servisní požadavek', number, actor, 'Přijat servisní požadavek');
    return { ...input, id, number, status: RequestStatus.Prijato, receivedAt: now, receivedByName: actor.displayName, receivedByLogin: actor.loginName, title: input.title.trim() };
  }

  public async rejectRequest(requestId: number, note: string, actor: CurrentUser): Promise<ServiceRequest> {
    if (!canWorkInService(actor.roles)) {
      throw new Error('Požadavek smí zamítnout jen správce servisu, dispečer a administrátor.');
    }
    if (note.trim() === '') {
      throw new Error('Napište důvod zamítnutí.');
    }
    const found = (await this.listRequests()).filter((r) => r.id === requestId)[0];
    if (!found) {
      throw new Error('Požadavek nebyl nalezen.');
    }
    await this.update(REQUESTS, requestId, { RequestStatus: RequestStatus.Zamitnuto, Note: note.trim() }, 'Požadavek se nepodařilo zamítnout');
    await this.audit('Servisní požadavek', found.number, actor, `Zamítnut: ${note.trim()}`, found.status, RequestStatus.Zamitnuto);
    return { ...found, status: RequestStatus.Zamitnuto, note: note.trim() };
  }

  // --- servisní listy ---

  public async listJobs(): Promise<ServiceJob[]> {
    return (await this.readAll(JOBS)).map(mapJob).sort((a, b) => b.number.localeCompare(a.number));
  }

  private async syncRequestStatus(requestId: number | undefined, actor: CurrentUser): Promise<void> {
    if (!requestId) {
      return;
    }
    const [requests, jobs] = await Promise.all([this.listRequests(), this.listJobs()]);
    const request = requests.filter((r) => r.id === requestId)[0];
    if (!request) {
      return;
    }
    const next = requestStatusFrom(request.status, jobs.filter((j) => j.requestId === requestId));
    if (next !== request.status) {
      await this.update(REQUESTS, requestId, { RequestStatus: next }, 'Stav požadavku se nepodařilo přepsat');
      await this.audit('Servisní požadavek', request.number, actor, `Stav požadavku: ${next}`, request.status, next);
    }
  }

  private jobFields(input: ServiceJobInput): Record<string, unknown> {
    return {
      Title: input.title.trim(),
      SiteNumber: input.siteNumber,
      DeviceNumber: input.deviceNumber,
      Description: input.description ?? '',
      PlannedDate: iso(input.plannedDate),
      SupplierId: input.supplierId ?? null,
      SupplierName: input.supplierName ?? ''
    };
  }

  public async createJob(input: ServiceJobInput, actor: CurrentUser): Promise<ServiceJob> {
    if (!canWorkInService(actor.roles)) {
      throw new Error('Servisní list smí založit jen správce servisu, dispečer a administrátor.');
    }
    if (input.title.trim() === '') {
      throw new Error('Vyplňte název servisního listu.');
    }
    const devices = await this.listDevices();
    if (!devices.some((d) => d.number === input.deviceNumber)) {
      throw new Error(`Soubor ${input.deviceNumber} neexistuje — servisní list se zakládá na souboru.`);
    }
    const request = input.requestId ? (await this.listRequests()).filter((r) => r.id === input.requestId)[0] : undefined;
    const number = await this.numbering.allocateNumber('SL');
    const now = new Date();
    const id = await this.add(
      JOBS,
      { ...this.jobFields(input), JobNumber: number, JobStatus: JobStatus.Naplanovano, RequestId: input.requestId ?? null, RequestNumber: request ? request.number : '', CreatedByName: actor.displayName },
      'Servisní list se nepodařilo založit'
    );
    await this.audit('Servisní list', number, actor, 'Založen servisní list', undefined, JobStatus.Naplanovano);
    await this.syncRequestStatus(input.requestId, actor);
    return { ...input, id, number, title: input.title.trim(), status: JobStatus.Naplanovano, requestNumber: request ? request.number : undefined, createdByName: actor.displayName, createdAt: now };
  }

  public async saveJob(input: ServiceJobInput & { id: number }, actor: CurrentUser): Promise<ServiceJob> {
    const job = (await this.listJobs()).filter((j) => j.id === input.id)[0];
    if (!job) {
      throw new Error('Servisní list nebyl nalezen.');
    }
    applyJobAction(job, 'edit', {}, actor);
    await this.update(JOBS, input.id, this.jobFields(input), 'Servisní list se nepodařilo uložit');
    await this.audit('Servisní list', job.number, actor, 'Upraven servisní list');
    return { ...job, ...input, title: input.title.trim() };
  }

  public async actOnJob(jobId: number, action: JobAction, input: JobActionInput, actor: CurrentUser): Promise<ServiceJob> {
    const job = (await this.listJobs()).filter((j) => j.id === jobId)[0];
    if (!job) {
      throw new Error('Servisní list nebyl nalezen.');
    }
    let change;
    try {
      change = applyJobAction(job, action, input, actor);
    } catch (error) {
      if (error instanceof ServiceFlowError) {
        throw new Error(error.message);
      }
      throw error;
    }
    const p = change.patch;
    const fields: Record<string, unknown> = { JobStatus: change.status };
    const map: [keyof ServiceJob, string, (v: never) => unknown][] = [
      ['orderId', 'OrderId', (v) => v],
      ['orderNumber', 'OrderNumber', (v) => v],
      ['doneAt', 'DoneAt', (v: Date) => v.toISOString()],
      ['workReport', 'WorkReport', (v) => v],
      ['hours', 'Hours', (v) => v],
      ['material', 'Material', (v) => v],
      ['photosUrl', 'PhotosUrl', (v) => v],
      ['checkedByName', 'CheckedByName', (v) => v],
      ['checkedAt', 'CheckedAt', (v: Date) => v.toISOString()],
      ['checkNote', 'CheckNote', (v) => v],
      ['invoiceId', 'InvoiceId', (v) => v],
      ['invoiceNumber', 'InvoiceNumber', (v) => v],
      ['cancelReason', 'CancelReason', (v) => v]
    ];
    map.forEach(([key, column, conv]) => {
      if (key in p && p[key] !== undefined) {
        fields[column] = conv(p[key] as never);
      }
    });
    await this.update(JOBS, jobId, fields, 'Servisní list se nepodařilo uložit');
    await this.audit('Servisní list', job.number, actor, change.audit, job.status, change.status);
    await this.syncRequestStatus(job.requestId, actor);
    return { ...job, ...p, status: change.status };
  }
}
