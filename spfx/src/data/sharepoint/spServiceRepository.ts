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
import { canDeleteAnyInService, canDeleteInService, canManageSites, canWorkInService, jobDeletionProblem, uniqueAttachmentName, nextSiteNumber, serviceFolderPlan, siteDeletionProblem, requestDeletionProblem, validateDeviceNumber, validateSiteNumber, ServiceDevice, ServiceSite } from '../../core/service';
import { JobAction, JobActionInput, JobStatus, RequestStatus, ServiceFlowError, ServiceJob, ServiceRequest, applyJobAction, requestCloseProblem, requestReopenProblem, requestStatusFrom } from '../../core/serviceJobs';
import { OrderAttachment, validateAttachment } from '../../core/orders';
import { parseChecklist, serializeChecklist, isEmptyChecklist, SiteChecklist } from '../../core/serviceCatalog';
import { PlanItem, planItemProblem, requestKindOf, requiredDateOf } from '../../core/servicePlan';
import { INumberingRepository, IProjectRepository, ISettingsRepository, PlanItemInput, ServiceAttachmentTarget, IServiceRepository, ServiceDeviceInput, ServiceJobInput, ServiceRequestInput, ServiceSiteInput } from '../repositories';
import { getSp, getSpForSite, describeSpError } from './spContext';
import { geoMismatch } from './spGeoCheck';
import { resolveFolderPath } from './spFolders';
import { resolveLibrary } from './spLibrary';

const SITES = 'PRM_ServiceSites';
const DEVICES = 'PRM_ServiceDevices';
const REQUESTS = 'PRM_ServiceRequests';
const JOBS = 'PRM_ServiceJobs';
const PLAN = 'PRM_ServicePlan';
const AUDIT = 'PRM_AuditLog';

type Item = Record<string, unknown> & { Id: number; Title?: string };

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);
const numOrUndef = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) ? v : undefined);
const iso = (d: Date | undefined): string | null => (d ? d.toISOString() : null);

/** Chyba SharePointu „vlastnost neexistuje“ = seznam ještě nemá sloupec z nové verze (chybí Instalace). */
function missingColumnHint(error: unknown): boolean {
  return /does not exist on type/i.test(error instanceof Error ? error.message : String(error));
}

/** Technické údaje lokality — do seznamu se zapisují jen když něco obsahují (nebo už obsahovaly), aby uložení fungovalo i před Instalací nového schématu. */
const SITE_TECH = ['cadastre', 'lvNumber', 'parcels', 'gridConnection', 'siteAccess', 'aggregator', 'financingBank'] as const;
const DEVICE_TECH = ['parameters', 'technology', 'warranty', 'oemVendor'] as const;

function hasAny<T extends object>(o: T | undefined, keys: readonly (keyof T)[]): boolean {
  return !!o && keys.some((k) => !!o[k]);
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
    isActive: i.IsActive !== false,
    cadastre: str(i.Cadastre),
    lvNumber: str(i.LvNumber),
    parcels: str(i.Parcels),
    gridConnection: str(i.GridConnection),
    siteAccess: str(i.SiteAccess),
    aggregator: str(i.Aggregator),
    financingBank: str(i.FinancingBank),
    checklist: parseChecklist(str(i.ChecklistJson))
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
    isActive: i.IsActive !== false,
    parameters: str(i.Parameters),
    technology: str(i.Technology),
    warranty: str(i.Warranty),
    oemVendor: str(i.OemVendor)
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
    requiredDate: toDate(str(i.RequiredDate)),
    status,
    note: str(i.Note),
    resolvedAt: toDate(str(i.ResolvedAt)),
    resolvedByName: str(i.ResolvedByName),
    resolution: str(i.Resolution)
  };
}

function mapPlan(i: Item): PlanItem {
  return {
    id: i.Id,
    year: numOrUndef(i.PlanYear) ?? new Date().getFullYear(),
    siteNumber: str(i.SiteNumber) || '',
    deviceNumber: str(i.DeviceNumber),
    title: i.Title || '',
    description: str(i.Description),
    month: numOrUndef(i.PlanMonth) ?? 1,
    dueDate: toDate(str(i.DueDate)),
    jobKind: str(i.JobKind) || 'Plánovaná',
    requestId: numOrUndef(i.RequestId),
    requestNumber: str(i.RequestNumber),
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
    isInternal: i.IsInternal === true,
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
    createdByName: str(i.CreatedByName),
    createdByLogin: str(i.CreatedByLogin)
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
    if (!canManageSites(actor.roles)) {
      throw new Error('Složky Servisu smí zakládat jen správce servisu, vedení a administrátor.');
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
    if (!canManageSites(actor.roles)) {
      throw new Error('Lokality smí spravovat jen správce servisu, vedení a administrátor.');
    }
    const sites = await this.listSites();
    const existingSite = input.id ? sites.filter((s) => s.id === input.id)[0] : undefined;
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
      IsActive: input.isActive,
      ...(hasAny(input, SITE_TECH) || hasAny(existingSite, SITE_TECH)
        ? { Cadastre: input.cadastre ?? '', LvNumber: input.lvNumber ?? '', Parcels: input.parcels ?? '', GridConnection: input.gridConnection ?? '', SiteAccess: input.siteAccess ?? '', Aggregator: input.aggregator ?? '', FinancingBank: input.financingBank ?? '' }
        : {})
    };
    let id = input.id;
    if (id) {
      await this.update(SITES, id, fields, 'Lokalitu se nepodařilo uložit');
      await this.audit('Servis – lokalita', number, actor, 'Upravena lokalita');
      const geoProblem = await geoMismatch(getSp(this.context), SITES, id, input.latitude, input.longitude);
      if (geoProblem) {
        throw new Error(geoProblem);
      }
    } else {
      id = await this.add(SITES, fields, 'Lokalitu se nepodařilo založit');
      await this.audit('Servis – lokalita', number, actor, 'Založena lokalita');
      const geoProblemNew = await geoMismatch(getSp(this.context), SITES, id, input.latitude, input.longitude);
      if (geoProblemNew) {
        throw new Error(geoProblemNew);
      }
    }
    return { ...input, folderUrl: siteFolderUrl, id: id as number, number, name: input.name.trim() };
  }

  public async deleteSite(siteNumber: string, actor: CurrentUser): Promise<void> {
    if (!canDeleteInService(actor.roles)) {
      throw new Error('Lokalitu smí smazat jen vedení a administrátor.');
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

  public async saveSiteChecklist(siteNumber: string, checklist: SiteChecklist, actor: CurrentUser): Promise<ServiceSite> {
    if (!canManageSites(actor.roles)) {
      throw new Error('Checklist lokality smí upravovat jen správce servisu, vedení a administrátor.');
    }
    const site = (await this.listSites()).filter((s) => s.number === siteNumber)[0];
    if (!site) {
      throw new Error(`Lokalita ${siteNumber} neexistuje.`);
    }
    await this.update(SITES, site.id, { ChecklistJson: isEmptyChecklist(checklist) ? '' : serializeChecklist(checklist) }, 'Checklist se nepodařilo uložit');
    await this.audit('Servis – lokalita', siteNumber, actor, 'Upraven checklist lokality');
    return { ...site, checklist };
  }

  public async saveDevice(input: ServiceDeviceInput, actor: CurrentUser): Promise<ServiceDevice> {
    if (!canManageSites(actor.roles)) {
      throw new Error('Soubory smí spravovat jen správce servisu, vedení a administrátor.');
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
      IsActive: input.isActive,
      ...(hasAny(input, DEVICE_TECH) || hasAny(self, DEVICE_TECH)
        ? { Parameters: input.parameters ?? '', Technology: input.technology ?? '', Warranty: input.warranty ?? '', OemVendor: input.oemVendor ?? '' }
        : {})
    };
    let id = input.id;
    if (id) {
      await this.update(DEVICES, id, fields, 'Soubor se nepodařilo uložit');
      const geoProblem = await geoMismatch(getSp(this.context), DEVICES, id, input.latitude, input.longitude);
      if (geoProblem) {
        throw new Error(geoProblem);
      }
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
      RequiredDate: iso(input.requiredDate),
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

  public async closeRequest(requestId: number, comment: string, actor: CurrentUser): Promise<ServiceRequest> {
    if (!canWorkInService(actor.roles)) {
      throw new Error('Požadavek smí uzavřít jen správce servisu, dispečer a administrátor.');
    }
    if (comment.trim() === '') {
      throw new Error('Napište krátký komentář, co jste udělal.');
    }
    const [requests, jobs] = await Promise.all([this.listRequests(), this.listJobs()]);
    const found = requests.filter((r) => r.id === requestId)[0];
    if (!found) {
      throw new Error('Požadavek nebyl nalezen.');
    }
    const problem = requestCloseProblem(found, jobs.filter((j) => j.requestId === requestId));
    if (problem) {
      throw new Error(problem);
    }
    const now = new Date();
    await this.update(REQUESTS, requestId, { RequestStatus: RequestStatus.Vyreseno, ResolvedAt: now.toISOString(), ResolvedByName: actor.displayName, Resolution: comment.trim() }, 'Požadavek se nepodařilo uzavřít');
    await this.audit('Servisní požadavek', found.number, actor, `Uzavřen bez servisního listu: ${comment.trim()}`, found.status, RequestStatus.Vyreseno);
    return { ...found, status: RequestStatus.Vyreseno, resolvedAt: now, resolvedByName: actor.displayName, resolution: comment.trim() };
  }

  public async reopenRequest(requestId: number, actor: CurrentUser): Promise<ServiceRequest> {
    if (!canWorkInService(actor.roles)) {
      throw new Error('Požadavek smí znovu otevřít jen správce servisu, dispečer a administrátor.');
    }
    const [requests, jobs] = await Promise.all([this.listRequests(), this.listJobs()]);
    const found = requests.filter((r) => r.id === requestId)[0];
    if (!found) {
      throw new Error('Požadavek nebyl nalezen.');
    }
    const problem = requestReopenProblem(found, jobs.filter((j) => j.requestId === requestId));
    if (problem) {
      throw new Error(problem);
    }
    await this.update(REQUESTS, requestId, { RequestStatus: RequestStatus.Prijato, ResolvedAt: null, ResolvedByName: '', Resolution: '' }, 'Požadavek se nepodařilo znovu otevřít');
    await this.audit('Servisní požadavek', found.number, actor, 'Znovu otevřen (byl uzavřen bez servisního listu)', found.status, RequestStatus.Prijato);
    return { ...found, status: RequestStatus.Prijato, resolvedAt: undefined, resolvedByName: undefined, resolution: undefined };
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
    if (!canDeleteInService(actor.roles)) {
      throw new Error('Požadavek smí smazat jen vedení a administrátor.');
    }
    const [requests, jobs] = await Promise.all([this.listRequests(), this.listJobs()]);
    const found = requests.filter((r) => r.id === requestId)[0];
    if (!found) {
      throw new Error('Požadavek nebyl nalezen.');
    }
    const problem = requestDeletionProblem(requestId, jobs, canDeleteAnyInService(actor.roles));
    if (problem) {
      throw new Error(problem);
    }
    const own = jobs.filter((j) => j.requestId === requestId);
    try {
      for (const j of own) {
        await getSp(this.context).web.lists.getByTitle(JOBS).items.getById(j.id).recycle();
        await this.audit('Servisní list', j.number, actor, `Smazán spolu s požadavkem ${found.number} (do koše webu)`, j.status);
      }
      await getSp(this.context).web.lists.getByTitle(REQUESTS).items.getById(requestId).recycle();
    } catch (error) {
      throw new Error(describeSpError(error, 'Požadavek se nepodařilo smazat'));
    }
    await this.audit('Servisní požadavek', found.number, actor, `Smazán požadavek ${found.title} (do koše webu)`, found.status);
  }

  public async deleteJob(jobId: number, actor: CurrentUser): Promise<void> {
    if (!canDeleteInService(actor.roles)) {
      throw new Error('Servisní list smí smazat jen vedení a administrátor.');
    }
    const job = (await this.listJobs()).filter((j) => j.id === jobId)[0];
    if (!job) {
      throw new Error('Servisní list nebyl nalezen.');
    }
    const problem = jobDeletionProblem(job, canDeleteAnyInService(actor.roles));
    if (problem) {
      throw new Error(problem);
    }
    try {
      await getSp(this.context).web.lists.getByTitle(JOBS).items.getById(jobId).recycle();
    } catch (error) {
      throw new Error(describeSpError(error, 'Servisní list se nepodařilo smazat'));
    }
    await this.audit('Servisní list', job.number, actor, 'Smazán servisní list (do koše webu)', job.status);
    await this.syncRequestStatus(job.requestId, actor);
  }

  // --- roční plán ---

  public async listPlan(): Promise<PlanItem[]> {
    return (await this.readAll(PLAN)).map(mapPlan);
  }

  private planFields(input: PlanItemInput): Record<string, unknown> {
    return {
      Title: input.title.trim(),
      PlanYear: input.year,
      SiteNumber: input.siteNumber,
      DeviceNumber: input.deviceNumber ?? '',
      Description: input.description ?? '',
      PlanMonth: input.month,
      DueDate: iso(input.dueDate),
      JobKind: input.jobKind,
      Note: input.note ?? ''
    };
  }

  private async checkPlanInput(input: PlanItemInput, sites: ServiceSite[], devices: ServiceDevice[]): Promise<void> {
    const problem = planItemProblem(input);
    if (problem) {
      throw new Error(problem);
    }
    if (!sites.some((s) => s.number === input.siteNumber)) {
      throw new Error(`Lokalita ${input.siteNumber} neexistuje.`);
    }
    if (input.deviceNumber && !devices.some((d) => d.number === input.deviceNumber && d.siteNumber === input.siteNumber)) {
      throw new Error(`Soubor ${input.deviceNumber} v lokalitě ${input.siteNumber} neexistuje.`);
    }
  }

  public async savePlanItem(input: PlanItemInput, actor: CurrentUser): Promise<PlanItem> {
    if (!canManageSites(actor.roles)) {
      throw new Error('Roční plán smí upravovat jen správce servisu, vedení a administrátor.');
    }
    const [sites, devices] = await Promise.all([this.listSites(), this.listDevices()]);
    await this.checkPlanInput(input, sites, devices);
    if (input.id) {
      await this.update(PLAN, input.id, this.planFields(input), 'Položku plánu se nepodařilo uložit');
      const found = (await this.listPlan()).filter((x) => x.id === input.id)[0];
      if (!found) {
        throw new Error('Položka plánu nebyla nalezena.');
      }
      return found;
    }
    const id = await this.add(PLAN, this.planFields(input), 'Položku plánu se nepodařilo založit');
    await this.audit('Servis – roční plán', `${input.siteNumber}/${input.year}`, actor, `Přidána položka plánu: ${input.title.trim()}`);
    return { ...input, id } as PlanItem;
  }

  public async createPlanItems(items: PlanItemInput[], actor: CurrentUser): Promise<PlanItem[]> {
    if (!canManageSites(actor.roles)) {
      throw new Error('Roční plán smí upravovat jen správce servisu, vedení a administrátor.');
    }
    const [sites, devices] = await Promise.all([this.listSites(), this.listDevices()]);
    for (const it of items) {
      await this.checkPlanInput(it, sites, devices);
    }
    const out: PlanItem[] = [];
    for (const it of items) {
      const id = await this.add(PLAN, this.planFields(it), 'Položku plánu se nepodařilo založit');
      out.push({ ...it, id } as PlanItem);
    }
    if (items.length > 0) {
      await this.audit('Servis – roční plán', `${items[0].siteNumber}/${items[0].year}`, actor, `Přidáno ${items.length} položek plánu (šablona nebo kopie)`);
    }
    return out;
  }

  public async deletePlanItems(ids: number[], actor: CurrentUser): Promise<number> {
    if (!canManageSites(actor.roles)) {
      throw new Error('Roční plán smí upravovat jen správce servisu, vedení a administrátor.');
    }
    const wanted = new Set(ids);
    const found = (await this.listPlan()).filter((x) => wanted.has(x.id));
    let deleted = 0;
    try {
      for (const item of found) {
        await getSp(this.context).web.lists.getByTitle(PLAN).items.getById(item.id).recycle();
        deleted++;
      }
    } catch (error) {
      await this.audit('Servis – roční plán', 'hromadně', actor, `Smazáno ${deleted} položek plánu (do koše webu), pak chyba`);
      throw new Error(describeSpError(error, `Smazalo se ${deleted} z ${found.length} položek plánu, pak se smazání zastavilo`));
    }
    await this.audit('Servis – roční plán', 'hromadně', actor, `Smazáno ${deleted} položek plánu (do koše webu)`);
    return deleted;
  }

  public async deletePlanItem(id: number, actor: CurrentUser): Promise<void> {
    if (!canManageSites(actor.roles)) {
      throw new Error('Roční plán smí upravovat jen správce servisu, vedení a administrátor.');
    }
    const found = (await this.listPlan()).filter((x) => x.id === id)[0];
    if (!found) {
      throw new Error('Položka plánu nebyla nalezena.');
    }
    try {
      await getSp(this.context).web.lists.getByTitle(PLAN).items.getById(id).recycle();
    } catch (error) {
      throw new Error(describeSpError(error, 'Položku plánu se nepodařilo smazat'));
    }
    await this.audit('Servis – roční plán', `${found.siteNumber}/${found.year}`, actor, `Smazána položka plánu: ${found.title} (do koše webu)`);
  }

  public async createRequestFromPlan(id: number, actor: CurrentUser): Promise<ServiceRequest> {
    if (!canWorkInService(actor.roles)) {
      throw new Error('Požadavek smí vytvořit jen správce servisu, dispečer a administrátor.');
    }
    const item = (await this.listPlan()).filter((x) => x.id === id)[0];
    if (!item) {
      throw new Error('Položka plánu nebyla nalezena.');
    }
    if (item.requestId) {
      throw new Error(`Z této položky už požadavek ${item.requestNumber || item.requestId} vznikl.`);
    }
    const request = await this.saveRequest(
      {
        siteNumber: item.siteNumber,
        deviceNumber: item.deviceNumber,
        title: item.title,
        description: [item.description, `Z ročního plánu ${item.year}, ${item.jobKind === 'Plánovaná' ? 'v paušálu' : 'mimo paušál'}.`].filter((x) => !!x).join('\n'),
        priority: 'Běžná',
        kind: requestKindOf(item),
        requiredDate: requiredDateOf(item)
      },
      actor
    );
    await this.update(PLAN, id, { RequestId: request.id, RequestNumber: request.number }, 'Položku plánu se nepodařilo propojit s požadavkem');
    return request;
  }

  // --- přílohy (přílohy položky seznamu) ---

  private itemOf(target: ServiceAttachmentTarget): ReturnType<ReturnType<ReturnType<typeof getSp>['web']['lists']['getByTitle']>['items']['getById']> {
    return getSp(this.context).web.lists.getByTitle(target.kind === 'request' ? REQUESTS : JOBS).items.getById(target.id);
  }

  public async listAttachments(target: ServiceAttachmentTarget): Promise<OrderAttachment[]> {
    try {
      const origin = new URL(this.context.pageContext.web.absoluteUrl).origin;
      const files: { FileName: string; ServerRelativeUrl: string }[] = await this.itemOf(target).attachmentFiles();
      return files.map((f) => ({ name: f.FileName, url: `${origin}${f.ServerRelativeUrl}` }));
    } catch (error) {
      throw new Error(describeSpError(error, 'Přílohy se nepodařilo načíst'));
    }
  }

  public async addAttachment(target: ServiceAttachmentTarget, file: File, actor: CurrentUser): Promise<OrderAttachment> {
    if (!canWorkInService(actor.roles)) {
      throw new Error('Přílohy smí přidávat jen správce servisu, dispečer a administrátor.');
    }
    const problem = validateAttachment(file.name, file.size);
    if (problem) {
      throw new Error(problem);
    }
    const existing = (await this.listAttachments(target)).map((a) => a.name);
    const name = uniqueAttachmentName(file.name, existing);
    try {
      await this.itemOf(target).attachmentFiles.add(name, file);
    } catch (error) {
      throw new Error(describeSpError(error, `Přílohu „${file.name}“ se nepodařilo nahrát`));
    }
    await this.audit(target.kind === 'request' ? 'Servisní požadavek' : 'Servisní list', String(target.id), actor, `Příloha přidána: ${name}`);
    const found = (await this.listAttachments(target)).filter((a) => a.name === name)[0];
    return found ?? { name, url: '' };
  }

  public async removeAttachment(target: ServiceAttachmentTarget, fileName: string, actor: CurrentUser): Promise<void> {
    if (!canWorkInService(actor.roles)) {
      throw new Error('Přílohy smí odebírat jen správce servisu, dispečer a administrátor.');
    }
    // Audit jde první: odebraný soubor je v koši SharePointu, ale bez záznamu by nebylo vidět, kdo ho odebral.
    await this.audit(target.kind === 'request' ? 'Servisní požadavek' : 'Servisní list', String(target.id), actor, `Příloha odebrána: ${fileName}`);
    try {
      await this.itemOf(target).attachmentFiles.getByName(fileName).delete();
    } catch (error) {
      throw new Error(describeSpError(error, `Přílohu „${fileName}“ se nepodařilo odebrat`));
    }
  }

  public async readAttachment(target: ServiceAttachmentTarget, fileName: string): Promise<Blob> {
    try {
      return await this.itemOf(target).attachmentFiles.getByName(fileName).getBlob();
    } catch (error) {
      throw new Error(describeSpError(error, `Přílohu „${fileName}“ se nepodařilo načíst`));
    }
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
      IsInternal: input.isInternal === true,
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
    if (request && request.resolvedAt && request.status === RequestStatus.Vyreseno) {
      throw new Error('Požadavek byl uzavřen bez servisního listu. Nejdřív ho znovu otevřete.');
    }
    const number = await this.numbering.allocateNumber('SL');
    const now = new Date();
    const id = await this.add(
      JOBS,
      { ...this.jobFields(input), JobNumber: number, JobStatus: JobStatus.Naplanovano, RequestId: input.requestId ?? null, RequestNumber: request ? request.number : '', CreatedByName: actor.displayName, CreatedByLogin: actor.loginName },
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
