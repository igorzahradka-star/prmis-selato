/**
 * Modul Servis v ukázkovém režimu — vše v paměti prohlížeče (zmizí po zavření stránky), stejná pravidla jako ostrá verze.
 * Pár vymyšlených lokalit, zařízení, požadavků a servisních listů, aby šlo modul zkoušet.
 */

import { CurrentUser } from '../../core/types';
import { canDeleteAnyInService, canDeleteInService, canManageSites, canWorkInService, jobDeletionProblem, uniqueAttachmentName, nextSiteNumber, siteDeletionProblem, requestDeletionProblem, validateDeviceNumber, validateSiteNumber, ServiceDevice, ServiceSite } from '../../core/service';
import { JobAction, JobActionInput, JobStatus, RequestStatus, ServiceFlowError, ServiceJob, ServiceRequest, applyJobAction, requestCloseProblem, requestReopenProblem, requestStatusFrom } from '../../core/serviceJobs';
import { OrderAttachment, validateAttachment } from '../../core/orders';
import type { SiteChecklist } from '../../core/serviceCatalog';
import { SERVICE_CATALOG } from '../../core/serviceCatalog.data';
import { ContractInput, ServiceContract, ServiceContractVersion, contractStatusChange, newVersionProblem, nextVersionNo, nextVersionSnapshot } from '../../core/serviceContract';
import { PlanItem, planItemProblem, requestKindOf, requiredDateOf } from '../../core/servicePlan';
import { INumberingRepository, IProjectRepository, IServiceRepository, PlanItemInput, ServiceAttachmentTarget, ServiceDeviceInput, ServiceJobInput, ServiceRequestInput, ServiceSiteInput } from '../repositories';

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
    if (!canManageSites(actor.roles)) {
      return Promise.reject(new Error('Lokality smí spravovat jen správce servisu, vedení a administrátor.'));
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
    const site: ServiceSite = { ...input, folderUrl, checklist: input.checklist ?? (self ? self.checklist : undefined), id: input.id ?? this.nextId++, number, name: input.name.trim() };
    this.sites = self ? this.sites.map((s) => (s.id === site.id ? site : s)) : [...this.sites, site];
    return Promise.resolve({ ...site });
  }

  public async saveSiteChecklist(siteNumber: string, checklist: SiteChecklist, actor: CurrentUser): Promise<ServiceSite> {
    if (!canManageSites(actor.roles)) {
      throw new Error('Checklist lokality smí upravovat jen správce servisu, vedení a administrátor.');
    }
    const site = this.sites.filter((s) => s.number === siteNumber)[0];
    if (!site) {
      throw new Error(`Lokalita ${siteNumber} neexistuje.`);
    }
    const updated: ServiceSite = { ...site, checklist };
    this.sites = this.sites.map((s) => (s.id === site.id ? updated : s));
    return { ...updated };
  }

  public async ensureFolders(siteNumber: string, deviceNumber: string | undefined, actor: CurrentUser): Promise<string | undefined> {
    if (!canManageSites(actor.roles)) {
      throw new Error('Složky Servisu smí zakládat jen správce servisu, vedení a administrátor.');
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

  public deleteSite(siteNumber: string, actor: CurrentUser): Promise<void> {
    if (!canDeleteInService(actor.roles)) {
      return Promise.reject(new Error('Lokalitu smí smazat jen vedení a administrátor.'));
    }
    const site = this.sites.filter((s) => s.number === siteNumber)[0];
    if (!site) {
      return Promise.reject(new Error('Lokalita nebyla nalezena.'));
    }
    const problem = siteDeletionProblem(siteNumber, this.devices, this.requests, this.jobs);
    if (problem) {
      return Promise.reject(new Error(problem));
    }
    this.sites = this.sites.filter((s) => s.number !== siteNumber);
    return Promise.resolve();
  }

  public listDevices(): Promise<ServiceDevice[]> {
    return Promise.resolve(this.devices.map((d) => ({ ...d })).sort((a, b) => a.number.localeCompare(b.number)));
  }

  public async saveDevice(input: ServiceDeviceInput, actor: CurrentUser): Promise<ServiceDevice> {
    if (!canManageSites(actor.roles)) {
      throw new Error('Soubory smí spravovat jen správce servisu, vedení a administrátor.');
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

  public closeRequest(requestId: number, comment: string, actor: CurrentUser): Promise<ServiceRequest> {
    if (!canWorkInService(actor.roles)) {
      return Promise.reject(new Error('Požadavek smí uzavřít jen správce servisu, dispečer a administrátor.'));
    }
    if (comment.trim() === '') {
      return Promise.reject(new Error('Napište krátký komentář, co jste udělal.'));
    }
    const found = this.requests.filter((r) => r.id === requestId)[0];
    if (!found) {
      return Promise.reject(new Error('Požadavek nebyl nalezen.'));
    }
    const problem = requestCloseProblem(found, this.jobs.filter((j) => j.requestId === requestId));
    if (problem) {
      return Promise.reject(new Error(problem));
    }
    const updated: ServiceRequest = { ...found, status: RequestStatus.Vyreseno, resolvedAt: new Date(), resolvedByName: actor.displayName, resolution: comment.trim() };
    this.requests = this.requests.map((r) => (r.id === requestId ? updated : r));
    return Promise.resolve({ ...updated });
  }

  public reopenRequest(requestId: number, actor: CurrentUser): Promise<ServiceRequest> {
    if (!canWorkInService(actor.roles)) {
      return Promise.reject(new Error('Požadavek smí znovu otevřít jen správce servisu, dispečer a administrátor.'));
    }
    const found = this.requests.filter((r) => r.id === requestId)[0];
    if (!found) {
      return Promise.reject(new Error('Požadavek nebyl nalezen.'));
    }
    const problem = requestReopenProblem(found, this.jobs.filter((j) => j.requestId === requestId));
    if (problem) {
      return Promise.reject(new Error(problem));
    }
    const updated: ServiceRequest = { ...found, status: RequestStatus.Prijato, resolvedAt: undefined, resolvedByName: undefined, resolution: undefined };
    this.requests = this.requests.map((r) => (r.id === requestId ? updated : r));
    return Promise.resolve({ ...updated });
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

  private plan: PlanItem[] = [
    { id: 1, year: new Date().getFullYear(), siteNumber: '10500', deviceNumber: '10501', title: 'Roční prohlídka a kontrola FVE', month: 4, jobKind: 'Plánovaná' },
    { id: 2, year: new Date().getFullYear(), siteNumber: '10500', deviceNumber: '10501', title: 'Revize elektrického zařízení', month: 9, dueDate: new Date(new Date().getFullYear(), 8, 15), jobKind: 'Plánovaná' },
    { id: 3, year: new Date().getFullYear(), siteNumber: '10500', title: 'Údržba zeleně — sečení trávy', month: 8, jobKind: 'Plánovaná' },
    { id: 4, year: new Date().getFullYear(), siteNumber: '10510', deviceNumber: '10511', title: 'Termovizní kontrola panelů', month: 7, jobKind: 'Nahodilá' }
  ];

  public listPlan(): Promise<PlanItem[]> {
    return Promise.resolve(this.plan.map((x) => ({ ...x })));
  }

  private checkPlan(input: PlanItemInput): string {
    const problem = planItemProblem(input);
    if (problem) {
      return problem;
    }
    if (!this.sites.some((s) => s.number === input.siteNumber)) {
      return `Lokalita ${input.siteNumber} neexistuje.`;
    }
    if (input.deviceNumber && !this.devices.some((d) => d.number === input.deviceNumber && d.siteNumber === input.siteNumber)) {
      return `Soubor ${input.deviceNumber} v lokalitě ${input.siteNumber} neexistuje.`;
    }
    return '';
  }

  public savePlanItem(input: PlanItemInput, actor: CurrentUser): Promise<PlanItem> {
    if (!canManageSites(actor.roles)) {
      return Promise.reject(new Error('Roční plán smí upravovat jen správce servisu, vedení a administrátor.'));
    }
    const problem = this.checkPlan(input);
    if (problem) {
      return Promise.reject(new Error(problem));
    }
    const existing = input.id ? this.plan.filter((x) => x.id === input.id)[0] : undefined;
    const item: PlanItem = { ...input, title: input.title.trim(), id: existing ? existing.id : this.nextId++, requestId: existing ? existing.requestId : undefined, requestNumber: existing ? existing.requestNumber : undefined };
    this.plan = existing ? this.plan.map((x) => (x.id === item.id ? item : x)) : [...this.plan, item];
    return Promise.resolve({ ...item });
  }

  public createPlanItems(items: PlanItemInput[], actor: CurrentUser): Promise<PlanItem[]> {
    if (!canManageSites(actor.roles)) {
      return Promise.reject(new Error('Roční plán smí upravovat jen správce servisu, vedení a administrátor.'));
    }
    for (const it of items) {
      const problem = this.checkPlan(it);
      if (problem) {
        return Promise.reject(new Error(problem));
      }
    }
    const created = items.map((it): PlanItem => ({ ...it, title: it.title.trim(), id: this.nextId++ }));
    this.plan = [...this.plan, ...created];
    return Promise.resolve(created.map((x) => ({ ...x })));
  }

  public deletePlanItems(ids: number[], actor: CurrentUser): Promise<number> {
    if (!canManageSites(actor.roles)) {
      return Promise.reject(new Error('Roční plán smí upravovat jen správce servisu, vedení a administrátor.'));
    }
    const before = this.plan.length;
    this.plan = this.plan.filter((x) => ids.indexOf(x.id) < 0);
    return Promise.resolve(before - this.plan.length);
  }

  public deletePlanItem(id: number, actor: CurrentUser): Promise<void> {
    if (!canManageSites(actor.roles)) {
      return Promise.reject(new Error('Roční plán smí upravovat jen správce servisu, vedení a administrátor.'));
    }
    if (!this.plan.some((x) => x.id === id)) {
      return Promise.reject(new Error('Položka plánu nebyla nalezena.'));
    }
    this.plan = this.plan.filter((x) => x.id !== id);
    return Promise.resolve();
  }

  public async createRequestFromPlan(id: number, actor: CurrentUser): Promise<ServiceRequest> {
    if (!canWorkInService(actor.roles)) {
      throw new Error('Požadavek smí vytvořit jen správce servisu, dispečer a administrátor.');
    }
    const item = this.plan.filter((x) => x.id === id)[0];
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
    this.plan = this.plan.map((x) => (x.id === id ? { ...x, requestId: request.id, requestNumber: request.number } : x));
    return request;
  }

  private attachments: Record<string, { name: string; blob: Blob }[]> = {};

  public listAttachments(target: ServiceAttachmentTarget): Promise<OrderAttachment[]> {
    return Promise.resolve((this.attachments[`${target.kind}:${target.id}`] ?? []).map((a) => ({ name: a.name, url: '#', sizeBytes: a.blob.size })));
  }

  public addAttachment(target: ServiceAttachmentTarget, file: File, actor: CurrentUser): Promise<OrderAttachment> {
    if (!canWorkInService(actor.roles)) {
      return Promise.reject(new Error('Přílohy smí přidávat jen správce servisu, dispečer a administrátor.'));
    }
    const problem = validateAttachment(file.name, file.size);
    if (problem) {
      return Promise.reject(new Error(problem));
    }
    const key = `${target.kind}:${target.id}`;
    const list = this.attachments[key] ?? [];
    const name = uniqueAttachmentName(file.name, list.map((a) => a.name));
    this.attachments[key] = [...list, { name, blob: file }];
    return Promise.resolve({ name, url: '#', sizeBytes: file.size });
  }

  public removeAttachment(target: ServiceAttachmentTarget, fileName: string, actor: CurrentUser): Promise<void> {
    if (!canWorkInService(actor.roles)) {
      return Promise.reject(new Error('Přílohy smí odebírat jen správce servisu, dispečer a administrátor.'));
    }
    const key = `${target.kind}:${target.id}`;
    this.attachments[key] = (this.attachments[key] ?? []).filter((a) => a.name !== fileName);
    return Promise.resolve();
  }

  public readAttachment(target: ServiceAttachmentTarget, fileName: string): Promise<Blob> {
    const found = (this.attachments[`${target.kind}:${target.id}`] ?? []).filter((a) => a.name === fileName)[0];
    return found ? Promise.resolve(found.blob) : Promise.reject(new Error('Příloha nebyla nalezena.'));
  }

  public deleteRequest(requestId: number, actor: CurrentUser): Promise<void> {
    if (!canDeleteInService(actor.roles)) {
      return Promise.reject(new Error('Požadavek smí smazat jen vedení a administrátor.'));
    }
    if (!this.requests.some((r) => r.id === requestId)) {
      return Promise.reject(new Error('Požadavek nebyl nalezen.'));
    }
    const problem = requestDeletionProblem(requestId, this.jobs, canDeleteAnyInService(actor.roles));
    if (problem) {
      return Promise.reject(new Error(problem));
    }
    this.jobs = this.jobs.filter((j) => j.requestId !== requestId);
    this.requests = this.requests.filter((r) => r.id !== requestId);
    return Promise.resolve();
  }

  public deleteJob(jobId: number, actor: CurrentUser): Promise<void> {
    if (!canDeleteInService(actor.roles)) {
      return Promise.reject(new Error('Servisní list smí smazat jen vedení a administrátor.'));
    }
    const job = this.jobs.filter((j) => j.id === jobId)[0];
    if (!job) {
      return Promise.reject(new Error('Servisní list nebyl nalezen.'));
    }
    const problem = jobDeletionProblem(job, canDeleteAnyInService(actor.roles));
    if (problem) {
      return Promise.reject(new Error(problem));
    }
    this.jobs = this.jobs.filter((j) => j.id !== jobId);
    this.syncRequest(job.requestId);
    return Promise.resolve();
  }

  private contracts: ServiceContract[] = [];
  private contractVersions: ServiceContractVersion[] = [];

  public listContracts(): Promise<ServiceContract[]> {
    return Promise.resolve(this.contracts.map((c) => ({ ...c })));
  }

  public listContractVersions(): Promise<ServiceContractVersion[]> {
    return Promise.resolve(JSON.parse(JSON.stringify(this.contractVersions), (k, v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && /(At|From|Date|Until)$/.test(k) ? new Date(v) : v)) as ServiceContractVersion[]);
  }

  public createContract(siteNumber: string, input: ContractInput, actor: CurrentUser): Promise<ServiceContractVersion> {
    if (!canManageSites(actor.roles)) {
      return Promise.reject(new Error('Smlouvy smí zakládat jen správce servisu, vedení a administrátor.'));
    }
    const site = this.sites.filter((s) => s.number === siteNumber)[0];
    if (!site) {
      return Promise.reject(new Error(`Lokalita ${siteNumber} neexistuje.`));
    }
    const number = input.smlouva.cislo;
    if (number.indexOf(`${siteNumber}-`) !== 0) {
      return Promise.reject(new Error(`Číslo smlouvy musí začínat číslem lokality (${siteNumber}-01).`));
    }
    if (this.contracts.some((c) => c.number === number)) {
      return Promise.reject(new Error(`Smlouva ${number} už existuje.`));
    }
    this.contracts = [...this.contracts, { id: this.nextId++, number, siteNumber, customerId: site.customerId, customerName: site.customerName, createdByName: actor.displayName, createdAt: new Date() }];
    const version: ServiceContractVersion = { id: this.nextId++, contractNumber: number, versionNo: 1, kind: 'Smlouva', status: 'Návrh', snapshot: JSON.parse(JSON.stringify(input)) as ContractInput, createdByName: actor.displayName, createdAt: new Date() };
    this.contractVersions = [...this.contractVersions, version];
    return Promise.resolve({ ...version });
  }

  public saveContractVersion(contractNumber: string, versionNo: number, snapshot: ContractInput, meta: { effectiveFrom?: Date; changeNote?: string }, actor: CurrentUser): Promise<ServiceContractVersion> {
    if (!canManageSites(actor.roles)) {
      return Promise.reject(new Error('Smlouvy smí upravovat jen správce servisu, vedení a administrátor.'));
    }
    const v = this.contractVersions.filter((x) => x.contractNumber === contractNumber && x.versionNo === versionNo)[0];
    if (!v) {
      return Promise.reject(new Error('Verze smlouvy nebyla nalezena.'));
    }
    if (v.status !== 'Návrh') {
      return Promise.reject(new Error('Upravit jde jen návrh. Podepsanou verzi změníte novou verzí (dodatkem).'));
    }
    const updated: ServiceContractVersion = { ...v, snapshot: JSON.parse(JSON.stringify(snapshot)) as ContractInput, effectiveFrom: meta.effectiveFrom, changeNote: meta.changeNote };
    this.contractVersions = this.contractVersions.map((x) => (x.id === v.id ? updated : x));
    return Promise.resolve({ ...updated });
  }

  public createContractVersion(contractNumber: string, changeNote: string, actor: CurrentUser): Promise<ServiceContractVersion> {
    if (!canManageSites(actor.roles)) {
      return Promise.reject(new Error('Smlouvy smí upravovat jen správce servisu, vedení a administrátor.'));
    }
    const versions = this.contractVersions.filter((x) => x.contractNumber === contractNumber);
    const problem = newVersionProblem(versions);
    if (problem) {
      return Promise.reject(new Error(problem));
    }
    const base = versions.filter((x) => x.status === 'Podepsaná').sort((a, b) => b.versionNo - a.versionNo)[0];
    const versionNo = nextVersionNo(versions);
    const v: ServiceContractVersion = { id: this.nextId++, contractNumber, versionNo, kind: 'Dodatek', status: 'Návrh', changeNote, snapshot: nextVersionSnapshot(base.snapshot, versionNo), createdByName: actor.displayName, createdAt: new Date() };
    this.contractVersions = [...this.contractVersions, v];
    return Promise.resolve({ ...v });
  }

  public changeContractStatus(contractNumber: string, versionNo: number, status: string, signedUrl: string | undefined, actor: CurrentUser): Promise<ServiceContractVersion[]> {
    if (!canManageSites(actor.roles)) {
      return Promise.reject(new Error('Stav smlouvy smí měnit jen správce servisu, vedení a administrátor.'));
    }
    const versions = this.contractVersions.filter((x) => x.contractNumber === contractNumber);
    const change = contractStatusChange(SERVICE_CATALOG, versions, versionNo, status);
    if (change.problem) {
      return Promise.reject(new Error(change.problem));
    }
    const now = new Date();
    this.contractVersions = this.contractVersions.map((x) => {
      if (x.contractNumber !== contractNumber || change.updates[x.versionNo] === undefined) {
        return x;
      }
      const signing = x.versionNo === versionNo && status === 'Podepsaná';
      return { ...x, status: change.updates[x.versionNo], ...(signing ? { signedAt: now, signedByName: actor.displayName, signedUrl } : {}) };
    });
    return this.listContractVersions().then((all) => all.filter((x) => x.contractNumber === contractNumber));
  }

  public deleteContractVersion(contractNumber: string, versionNo: number, actor: CurrentUser): Promise<void> {
    if (!canDeleteInService(actor.roles)) {
      return Promise.reject(new Error('Rozpracovanou verzi smlouvy smí smazat jen vedení a administrátor.'));
    }
    const versions = this.contractVersions.filter((x) => x.contractNumber === contractNumber);
    const v = versions.filter((x) => x.versionNo === versionNo)[0];
    if (!v) {
      return Promise.reject(new Error('Verze smlouvy nebyla nalezena.'));
    }
    if (v.status !== 'Návrh') {
      return Promise.reject(new Error('Smazat jde jen návrh. Verzi k podpisu nejdřív vraťte do návrhu; podepsané verze se nemažou.'));
    }
    this.contractVersions = this.contractVersions.filter((x) => x.id !== v.id);
    if (versions.length === 1) {
      this.contracts = this.contracts.filter((c) => c.number !== contractNumber);
    }
    return Promise.resolve();
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
    if (request && request.resolvedAt && request.status === RequestStatus.Vyreseno) {
      return Promise.reject(new Error('Požadavek byl uzavřen bez servisního listu. Nejdřív ho znovu otevřete.'));
    }
    const number = await this.numbering.allocateNumber('SL');
    const job: ServiceJob = { ...input, id: this.nextId++, number, title: input.title.trim(), status: JobStatus.Naplanovano, requestNumber: request ? request.number : undefined, createdByName: actor.displayName, createdByLogin: actor.loginName, createdAt: new Date() };
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
    const updated: ServiceJob = { ...job, siteNumber: input.siteNumber, deviceNumber: input.deviceNumber, title: input.title.trim(), description: input.description, plannedDate: input.plannedDate, jobKind: input.jobKind || job.jobKind, isInternal: input.isInternal ?? job.isInternal, supplierId: input.supplierId, supplierName: input.supplierName };
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
