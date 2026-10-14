/**
 * Modul Servis v ukázkovém režimu — vše v paměti prohlížeče (zmizí po zavření stránky), stejná pravidla jako ostrá verze.
 * Pár vymyšlených lokalit, zařízení, požadavků a servisních listů, aby šlo modul zkoušet.
 */

import { CurrentUser } from '../../core/types';
import { canAdministerService, canWorkInService, nextSiteNumber, validateDeviceNumber, validateSiteNumber, ServiceDevice, ServiceSite } from '../../core/service';
import { JobAction, JobActionInput, JobStatus, RequestStatus, ServiceFlowError, ServiceJob, ServiceRequest, applyJobAction, requestStatusFrom } from '../../core/serviceJobs';
import { INumberingRepository, IProjectRepository, IServiceRepository, ServiceDeviceInput, ServiceJobInput, ServiceRequestInput, ServiceSiteInput } from '../repositories';

const day = (y: number, m: number, d: number): Date => new Date(y, m - 1, d);

/** Ukázkový odkaz na složku (v ukázkovém režimu nic nevzniká). */
function mockFolderUrl(key: string, name: string): string {
  return `https://ukazka.sharepoint.com/General/02_SERVIS/${encodeURIComponent(key)}-${encodeURIComponent(name)}`;
}

export class MockServiceRepository implements IServiceRepository {
  private nextId = 100;
  private sites: ServiceSite[] = [
    { id: 1, number: '10500', name: 'Mastířovice', customerName: 'REVOLTUM Energy a.s.', address: 'Mastířovice 12, 675 31', latitude: 49.1713, longitude: 16.1167, contact: 'Ing. Karel Dvořák, +420 777 111 222', isActive: true },
    { id: 2, number: '10510', name: 'Boršov', customerName: 'REVOLTUM Energy a.s.', address: 'Boršov 3, 373 71', latitude: 48.9875, longitude: 14.4735, isActive: true }
  ];
  private devices: ServiceDevice[] = [
    { id: 1, number: '10501', siteNumber: '10500', name: 'Mastířovice I. FVE', kind: 'FVE', customerName: 'REVOLTUM Energy a.s.', contractFrom: day(2026, 1, 1), contractTo: day(2026, 12, 31), contractNote: 'Paušál 12 000 Kč / měsíc, reakce do 48 h', isActive: true },
    { id: 2, number: '10511', siteNumber: '10510', name: 'Boršov 1', kind: 'FVE', customerName: 'REVOLTUM Energy a.s.', contractFrom: day(2026, 3, 1), contractTo: day(2026, 11, 20), isActive: true },
    { id: 3, number: '10512', siteNumber: '10510', name: 'Boršov 2 – BESS', kind: 'BESS', latitude: 48.9884, longitude: 14.4752, customerName: 'REVOLTUM Energy a.s.', isActive: true }
  ];
  private requests: ServiceRequest[] = [
    { id: 1, number: 'SPO-2026-0001', siteNumber: '10500', deviceNumber: '10501', title: 'Výpadek střídače č. 3', description: 'Střídač hlásí chybu izolace, výroba klesla o třetinu.', priority: 'Vysoká', kind: 'Porucha', reportedBy: 'Karel Dvořák', receivedAt: day(2026, 10, 9), receivedByName: 'Dispečer servisu', status: RequestStatus.Zpracovava },
    { id: 2, number: 'SPO-2026-0002', siteNumber: '10510', deviceNumber: '10511', title: 'Roční prohlídka FVE', priority: 'Běžná', kind: 'Preventivní prohlídka', receivedAt: day(2026, 10, 12), receivedByName: 'Dispečer servisu', status: RequestStatus.Prijato }
  ];
  private jobs: ServiceJob[] = [
    { id: 1, number: 'SL-2026-0001', requestId: 1, requestNumber: 'SPO-2026-0001', siteNumber: '10500', deviceNumber: '10501', title: 'Oprava střídače č. 3', description: 'Diagnostika a oprava střídače, případně výměna.', status: JobStatus.Objednano, plannedDate: day(2026, 10, 20), supplierName: 'FVE Servis Morava s.r.o.', orderNumber: 'OBJ-2026-0007', jobKind: 'Nahodilá', createdByName: 'Dispečer servisu', createdAt: day(2026, 10, 9) }
  ];

  public constructor(
    private readonly numbering: INumberingRepository,
    private readonly projects: IProjectRepository
  ) {}

  public listSites(): Promise<ServiceSite[]> {
    return Promise.resolve(this.sites.map((s) => ({ ...s })).sort((a, b) => a.number.localeCompare(b.number)));
  }

  public saveSite(input: ServiceSiteInput, actor: CurrentUser): Promise<ServiceSite> {
    if (!canAdministerService(actor.roles)) {
      return Promise.reject(new Error('Lokality smí spravovat jen správce servisu a administrátor.'));
    }
    const number = input.number || nextSiteNumber(this.sites.map((s) => s.number));
    const self = input.id ? this.sites.filter((s) => s.id === input.id)[0] : undefined;
    const problem = validateSiteNumber(number, this.sites.map((s) => s.number), self ? self.number : undefined);
    if (problem) {
      return Promise.reject(new Error(problem));
    }
    if (input.name.trim() === '') {
      return Promise.reject(new Error('Vyplňte název lokality.'));
    }
    const folderUrl = input.folderUrl || (self ? undefined : mockFolderUrl(number, input.name.trim()));
    const site: ServiceSite = { ...input, folderUrl, id: input.id ?? this.nextId++, number, name: input.name.trim() };
    this.sites = self ? this.sites.map((s) => (s.id === site.id ? site : s)) : [...this.sites, site];
    return Promise.resolve({ ...site });
  }

  public async ensureFolders(siteNumber: string, deviceNumber: string | undefined, actor: CurrentUser): Promise<string | undefined> {
    if (!canAdministerService(actor.roles)) {
      throw new Error('Složky Servisu smí zakládat jen správce servisu a administrátor.');
    }
    if (deviceNumber) {
      const device = this.devices.filter((d) => d.number === deviceNumber)[0];
      if (!device) {
        throw new Error('Lokalita nebo soubor nebyl nalezen.');
      }
      const url = mockFolderUrl(siteNumber + '/' + deviceNumber, device.name);
      this.devices = this.devices.map((d) => (d.number === deviceNumber ? { ...d, folderUrl: url } : d));
      return url;
    }
    const site = this.sites.filter((s) => s.number === siteNumber)[0];
    if (!site) {
      throw new Error('Lokalita nebo soubor nebyl nalezen.');
    }
    const url = mockFolderUrl(siteNumber, site.name);
    this.sites = this.sites.map((s) => (s.number === siteNumber ? { ...s, folderUrl: url } : s));
    return url;
  }

  public listDevices(): Promise<ServiceDevice[]> {
    return Promise.resolve(this.devices.map((d) => ({ ...d })).sort((a, b) => a.number.localeCompare(b.number)));
  }

  public async saveDevice(input: ServiceDeviceInput, actor: CurrentUser): Promise<ServiceDevice> {
    if (!canAdministerService(actor.roles)) {
      throw new Error('Soubory smí spravovat jen správce servisu a administrátor.');
    }
    const site = this.sites.filter((s) => s.number === input.siteNumber)[0];
    if (!site) {
      throw new Error(`Lokalita ${input.siteNumber} neexistuje.`);
    }
    const self = input.id ? this.devices.filter((d) => d.id === input.id)[0] : undefined;
    const check = validateDeviceNumber(input.number, input.siteNumber, this.devices.map((d) => d.number), self ? self.number : undefined);
    if (check.error) {
      throw new Error(check.error);
    }
    if (input.name.trim() === '') {
      throw new Error('Vyplňte název souboru.');
    }
    if (!self) {
      await this.projects.ensureServiceProject({ projectNumber: input.number, title: `${input.number} ${site.name} – ${input.name.trim()}`, shortName: input.name.trim(), customerName: input.customerName ?? site.customerName, projectManagerName: actor.displayName, folderUrl: input.folderUrl });
    }
    const device: ServiceDevice = { ...input, folderUrl: input.folderUrl || (self ? undefined : mockFolderUrl(site.number + '/' + input.number, input.name.trim())), id: input.id ?? this.nextId++, name: input.name.trim() };
    this.devices = self ? this.devices.map((d) => (d.id === device.id ? device : d)) : [...this.devices, device];
    return { ...device };
  }

  public listRequests(): Promise<ServiceRequest[]> {
    return Promise.resolve(this.requests.map((r) => ({ ...r })).sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime()));
  }

  public async saveRequest(input: ServiceRequestInput, actor: CurrentUser): Promise<ServiceRequest> {
    if (!canWorkInService(actor.roles)) {
      throw new Error('Požadavky smí zapisovat jen správce servisu, dispečer a administrátor.');
    }
    if (input.title.trim() === '') {
      throw new Error('Vyplňte stručný popis požadavku.');
    }
    const found = input.id ? this.requests.filter((r) => r.id === input.id)[0] : undefined;
    if (found) {
      const updated: ServiceRequest = { ...found, ...input, id: found.id, number: found.number, status: found.status, receivedAt: found.receivedAt, receivedByName: found.receivedByName, receivedByLogin: found.receivedByLogin, title: input.title.trim() };
      this.requests = this.requests.map((r) => (r.id === found.id ? updated : r));
      return { ...updated };
    }
    const number = await this.numbering.allocateNumber('SPO');
    const created: ServiceRequest = { ...input, id: this.nextId++, number, status: RequestStatus.Prijato, receivedAt: new Date(), receivedByName: actor.displayName, receivedByLogin: actor.loginName, title: input.title.trim() };
    this.requests = [...this.requests, created];
    return { ...created };
  }

  public rejectRequest(requestId: number, note: string, actor: CurrentUser): Promise<ServiceRequest> {
    if (!canWorkInService(actor.roles)) {
      return Promise.reject(new Error('Požadavek smí zamítnout jen správce servisu, dispečer a administrátor.'));
    }
    if (note.trim() === '') {
      return Promise.reject(new Error('Napište důvod zamítnutí.'));
    }
    const found = this.requests.filter((r) => r.id === requestId)[0];
    if (!found) {
      return Promise.reject(new Error('Požadavek nebyl nalezen.'));
    }
    const updated = { ...found, status: RequestStatus.Zamitnuto, note: note.trim() };
    this.requests = this.requests.map((r) => (r.id === requestId ? updated : r));
    return Promise.resolve({ ...updated });
  }

  public listJobs(): Promise<ServiceJob[]> {
    return Promise.resolve(this.jobs.map((j) => ({ ...j })).sort((a, b) => b.number.localeCompare(a.number)));
  }

  private syncRequest(requestId: number | undefined): void {
    const request = requestId ? this.requests.filter((r) => r.id === requestId)[0] : undefined;
    if (!request) {
      return;
    }
    const next = requestStatusFrom(request.status, this.jobs.filter((j) => j.requestId === requestId));
    this.requests = this.requests.map((r) => (r.id === request.id ? { ...r, status: next } : r));
  }

  public async createJob(input: ServiceJobInput, actor: CurrentUser): Promise<ServiceJob> {
    if (!canWorkInService(actor.roles)) {
      throw new Error('Servisní list smí založit jen správce servisu, dispečer a administrátor.');
    }
    if (input.title.trim() === '') {
      throw new Error('Vyplňte název servisního listu.');
    }
    const siteWide = input.deviceNumber === input.siteNumber;
    if (!siteWide && !this.devices.some((d) => d.number === input.deviceNumber)) {
      throw new Error(`Soubor ${input.deviceNumber} neexistuje — servisní list se zakládá na souboru nebo na celé lokalitě.`);
    }
    if (siteWide) {
      const site = this.sites.filter((s) => s.number === input.siteNumber)[0];
      if (!site) {
        throw new Error(`Lokalita ${input.siteNumber} neexistuje.`);
      }
      // Skrytý servisní projekt lokality (společné zásahy) — na něm se vedou objednávky a fakturace.
      await this.projects.ensureServiceProject({ projectNumber: site.number, title: `${site.number} ${site.name} – společné zásahy`, shortName: 'Společné zásahy', customerName: site.customerName, projectManagerName: actor.displayName, folderUrl: site.folderUrl });
    }
    const request = input.requestId ? this.requests.filter((r) => r.id === input.requestId)[0] : undefined;
    const number = await this.numbering.allocateNumber('SL');
    const job: ServiceJob = { ...input, id: this.nextId++, number, title: input.title.trim(), status: JobStatus.Naplanovano, requestNumber: request ? request.number : undefined, createdByName: actor.displayName, createdAt: new Date() };
    this.jobs = [...this.jobs, job];
    this.syncRequest(input.requestId);
    return { ...job };
  }

  public saveJob(input: ServiceJobInput & { id: number }, actor: CurrentUser): Promise<ServiceJob> {
    const job = this.jobs.filter((j) => j.id === input.id)[0];
    if (!job) {
      return Promise.reject(new Error('Servisní list nebyl nalezen.'));
    }
    try {
      applyJobAction(job, 'edit', {}, actor);
    } catch (e) {
      return Promise.reject(new Error(e instanceof Error ? e.message : String(e)));
    }
    const updated: ServiceJob = { ...job, siteNumber: input.siteNumber, deviceNumber: input.deviceNumber, title: input.title.trim(), description: input.description, plannedDate: input.plannedDate, jobKind: input.jobKind || job.jobKind, supplierId: input.supplierId, supplierName: input.supplierName };
    this.jobs = this.jobs.map((j) => (j.id === job.id ? updated : j));
    return Promise.resolve({ ...updated });
  }

  public actOnJob(jobId: number, action: JobAction, input: JobActionInput, actor: CurrentUser): Promise<ServiceJob> {
    const job = this.jobs.filter((j) => j.id === jobId)[0];
    if (!job) {
      return Promise.reject(new Error('Servisní list nebyl nalezen.'));
    }
    try {
      const change = applyJobAction(job, action, input, actor);
      const updated: ServiceJob = { ...job, ...change.patch, status: change.status };
      this.jobs = this.jobs.map((j) => (j.id === jobId ? updated : j));
      this.syncRequest(job.requestId);
      return Promise.resolve({ ...updated });
    } catch (e) {
      return Promise.reject(new Error(e instanceof ServiceFlowError ? e.message : e instanceof Error ? e.message : String(e)));
    }
  }
}
