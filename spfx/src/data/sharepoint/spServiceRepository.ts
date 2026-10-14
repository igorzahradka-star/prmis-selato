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
import { canAdministerService, canWorkInService, nextSiteNumber, serviceFolderPlan, siteDeletionProblem, requestDeletionProblem, validateDeviceNumber, validateSiteNumber, ServiceDevice, ServiceSite } from '../../core/service';
import { JobAction, JobActionInput, JobStatus, RequestStatus, ServiceFlowError, ServiceJob, ServiceRequest, applyJobAction, requestStatusFrom } from '../../core/serviceJobs';
import { INumberingRepository, IProjectRepository, ISettingsRepository, IServiceRepository, ServiceDeviceInput, ServiceJobInput, ServiceRequestInput, ServiceSiteInput } from '../repositories';
import { getSp, getSpForSite, describeSpError } from './spContext';
import { resolveFolderPath } from './spFolders';
import { resolveLibrary } from './spLibrary';

const SITES = 'PRM_ServiceSites';
const DEVICES = 'PRM_ServiceDevices';
const REQUESTS = 'PRM_ServiceRequests';
const JOBS = 'PRM_ServiceJobs';
const AUDIT = 'PRM_AuditLog';

type Item = Record<string, unknown> & { Id: number; Title?: string };

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);
const numOrUndef = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) ? v : undefined);
const iso = (d: Date | undefined): string | null => (d ? d.toISOString() : null);

/** Chyba SharePointu „vlastnost neexistuje“ = seznam ještě nemá sloupec z nové verze (chybí Instalace). */
function missingColumnHint(error: unknown): boolean {
  return /does not exist on type/i.test(error instanceof Error ? error.message : String(error));
}

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
    jobKind: str(i.JobKind) || 'Nahodilá',
    supplierId: numOrUndef(i.SupplierId),
    supplierName: str(i.SupplierName),
    orderId: numOrUndef(i.OrderId),
    orderNumber: str(i.OrderNumber),
    doneAt: toDate(str(i.DoneAt)),
    workReport: str(i.WorkReport),
    hours: numOrUndef(i.Hours),
    material: str(i.Material),
    photosUrl: str(i.PhotosUrl),
    proofKind: str(i.ProofKind),
    verifiedByName: str(i.VerifiedByName),
    verifiedAt: toDate(str(i.VerifiedAt)),
    createdAt: toDate(str(i.Created)),
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
    private readonly projects: IProjectRepository,
    private readonly settings: ISettingsRepository
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
      throw new Error(missingColumnHint(error) ? what + ': v seznamu chybí nový sloupec. Po nahrání nové verze spusťte „Instalace a diagnostika“ (doplní chybějící sloupce) a zkuste to znovu.' : describeSpError(error, what));
    }
  }

  private async update(list: string, id: number, fields: Record<string, unknown>, what: string): Promise<void> {
    try {
      await getSp(this.context).web.lists.getByTitle(list).items.getById(id).update(fields);
    } catch (error) {
      throw new Error(missingColumnHint(error) ? what + ': v seznamu chybí nový sloupec. Po nahrání nové verze spusťte „Instalace a diagnostika“ (doplní chybějící sloupce) a zkuste to znovu.' : describeSpError(error, what));
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

  /**
   * Založí složky lokality (a souboru) podle struktury Servisu a vrátí odkaz na ně; `undefined`, když není v Nastavení knihovna.
   * Existující složky se najdou podle čísla na začátku a znovu se nezakládají. Nic nemaže ani nepřesouvá.
   */
  private async buildFolders(site: { number: string; name: string }, device?: { number: string; name: string }): Promise<string | undefined> {
    const settings = await this.settings.get();
    const folders = settings.folders;
    if (!folders.libraryTitle.trim()) {
      return undefined;
    }
    const sp = folders.siteUrl ? getSpForSite(this.context, folders.siteUrl) : getSp(this.context);
    const libraryRoot = (await resolveLibrary(sp, folders.libraryTitle)).serverRelativeUrl;
    const plan = serviceFolderPlan(settings.service.folderRoot, site, device);
    const rootPath = (await resolveFolderPath(sp, libraryRoot, plan.rootSegments, true)) as string;
    const sitePath = (await resolveFolderPath(sp, rootPath, [plan.siteFolder], true)) as string;
    for (const sub of plan.siteSubfolders) {
      await resolveFolderPath(sp, sitePath, [sub], true);
    }
    let target = sitePath;
    if (device && plan.deviceFolder) {
      target = (await resolveFolderPath(sp, sitePath, [plan.deviceFolder], true)) as string;
      for (const sub of plan.deviceSubfolders) {
        await resolveFolderPath(sp, target, [sub], true);
      }
    }
    return `${new URL(folders.siteUrl || this.context.pageContext.web.absoluteUrl).origin}${target}`;
  }

  public async ensureFolders(siteNumber: string, deviceNumber: string | undefined, actor: CurrentUser): Promise<string | undefined> {
    if (!canAdministerService(actor.roles)) {
      throw new Error('Složky Servisu smí zakládat jen správce servisu a administrátor.');
    }
    const [sites, devices] = await Promise.all([this.listSites(), this.listDevices()]);
    const site = sites.filter((s) => s.number === siteNumber)[0];
    const device = deviceNumber ? devices.filter((d) => d.number === deviceNumber)[0] : undefined;
    if (!site || (deviceNumber && !device)) {
      throw new Error('Lokalita nebo soubor nebyl nalezen.');
    }
    let url: string | undefined;
    try {
      url = await this.buildFolders(site, device);
    } catch (error) {
      throw new Error(describeSpError(error, 'Složky Servisu se nepodařilo založit'));
    }
    if (url && device) {
      await this.update(DEVICES, device.id, { FolderUrl: url }, 'Odkaz na složku souboru se nepodařilo uložit');
      await this.audit('Servis – soubor', device.number, actor, 'Založeny složky souboru');
    } else if (url) {
      await this.update(SITES, site.id, { FolderUrl: url }, 'Odkaz na složku lokality se nepodařilo uložit');
      await this.audit('Servis – lokalita', site.number, actor, 'Založeny složky lokality');
    }
    return url;
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
    let siteFolderUrl = input.folderUrl;
    if (!input.id && !siteFolderUrl) {
      try {
        siteFolderUrl = await this.buildFolders({ number, name: input.name.trim() });
      } catch {
        // Složky jde založit později tlačítkem „Založit složky“ u lokality.
      }
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
      FolderUrl: siteFolderUrl ?? '',
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
    return { ...input, folderUrl: siteFolderUrl, id: id as number, number, name: input.name.trim() };
  }

  public async deleteSite(siteNumber: string, actor: CurrentUser): Promise<void> {
    if (!canAdministerService(actor.roles)) {
      throw new Error('Lokalitu smí smazat jen správce servisu a administrátor.');
    }
    const [sites, devices, requests, jobs] = await Promise.all([this.listSites(), this.listDevices(), this.listRequests(), this.listJobs()]);
    const site = sites.filter((s) => s.number === siteNumber)[0];
    if (!site) {
      throw new Error('Lokalita nebyla nalezena.');
    }
    const problem = siteDeletionProblem(siteNumber, devices, requests, jobs);
    if (problem) {
      throw new Error(problem);
    }
    try {
      await getSp(this.context).web.lists.getByTitle(SITES).items.getById(site.id).recycle();
    } catch (error) {
      throw new Error(describeSpError(error, 'Lokalitu se nepodařilo smazat'));
    }
    await this.audit('Servis – lokalita', site.number, actor, `Smazána prázdná lokalita ${site.name} (do koše webu)`);
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
    let deviceFolderUrl = input.folderUrl;
    if (!input.id && !deviceFolderUrl) {
      try {
        deviceFolderUrl = await this.buildFolders(site, { number: input.number, name: input.name.trim() });
      } catch {
        // Složky jde založit později tlačítkem „Založit složky“ u souboru.
      }
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
      FolderUrl: deviceFolderUrl ?? '',
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
        folderUrl: deviceFolderUrl
      });
      id = await this.add(DEVICES, fields, 'Soubor se nepodařilo založit');
      await this.audit('Servis – soubor', input.number, actor, 'Založen soubor (servisní projekt)');
    }
    return { ...input, folderUrl: deviceFolderUrl, id: id as number, name: input.name.trim() };
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

  public async deleteRequest(requestId: number, actor: CurrentUser): Promise<void> {
    if (!canWorkInService(actor.roles)) {
      throw new Error('Požadavek smí smazat jen správce servisu, dispečer a administrátor.');
    }
    const [requests, jobs] = await Promise.all([this.listRequests(), this.listJobs()]);
    const found = requests.filter((r) => r.id === requestId)[0];
    if (!found) {
      throw new Error('Požadavek nebyl nalezen.');
    }
    const problem = requestDeletionProblem(requestId, jobs);
    if (problem) {
      throw new Error(problem);
    }
    try {
      await getSp(this.context).web.lists.getByTitle(REQUESTS).items.getById(requestId).recycle();
    } catch (error) {
      throw new Error(describeSpError(error, 'Požadavek se nepodařilo smazat'));
    }
    await this.audit('Servisní požadavek', found.number, actor, `Smazán požadavek ${found.title} (do koše webu)`, found.status);
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
      JobKind: input.jobKind || 'Nahodilá',
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
    const allSites = await this.listSites();
    const siteWide = input.deviceNumber === input.siteNumber;
    if (!siteWide && !devices.some((d) => d.number === input.deviceNumber)) {
      throw new Error(`Soubor ${input.deviceNumber} neexistuje — servisní list se zakládá na souboru nebo na celé lokalitě.`);
    }
    if (siteWide) {
      const site = allSites.filter((s) => s.number === input.siteNumber)[0];
      if (!site) {
        throw new Error(`Lokalita ${input.siteNumber} neexistuje.`);
      }
      // Skrytý servisní projekt lokality (společné zásahy) — na něm se vedou objednávky a fakturace.
      await this.projects.ensureServiceProject({ projectNumber: site.number, title: `${site.number} ${site.name} – společné zásahy`, shortName: 'Společné zásahy', customerName: site.customerName, projectManagerName: actor.displayName, folderUrl: site.folderUrl });
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
      ['proofKind', 'ProofKind', (v) => v],
      ['verifiedByName', 'VerifiedByName', (v) => v],
      ['verifiedAt', 'VerifiedAt', (v: Date) => v.toISOString()],
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
