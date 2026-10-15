import { createMockRepositories } from './mockRepositories';
import { CurrentUser, Role } from '../../core/types';
import { JobStatus, RequestStatus } from '../../core/serviceJobs';
import { RepositorySet } from '../repositories';
import { MOCK_USER } from './mockData';

jest.setTimeout(30000);

function uzivatel(login: string, name: string, roles: Role[]): CurrentUser {
  return { ...MOCK_USER, id: Math.floor(Math.random() * 1000) + 100, loginName: `i:0#.f|membership|${login}@revoltum.cz`, displayName: name, roles };
}

const spravce = uzivatel('spravce', 'Sára Správce', [Role.SpravceServisu]);
const dispecer = uzivatel('dispecer', 'David Dispečer', [Role.Dispecer]);
const pm = uzivatel('pm', 'Běžný PM', [Role.ProjektovyManazer]);
const vedeni = uzivatel('vedeni', 'Vendelín Vedení', [Role.Vedeni]);

describe('MockServiceRepository — práva', () => {
  it('lokalitu a zařízení zakládá správce servisu, ne dispečer ani běžný PM', async () => {
    const r = createMockRepositories();
    await expect(r.service.saveSite({ number: '10520', name: 'Nová', isActive: true }, dispecer)).rejects.toThrow(/správce servisu/);
    await expect(r.service.saveSite({ number: '10520', name: 'Nová', isActive: true }, pm)).rejects.toThrow(/správce servisu/);
    const site = await r.service.saveSite({ number: '10520', name: 'Nová', isActive: true }, spravce);
    expect(site.number).toBe('10520');
    await expect(r.service.saveDevice({ number: '10521', siteNumber: '10520', name: 'FVE Nová 1', kind: 'FVE', isActive: true }, dispecer)).rejects.toThrow(/správce servisu/);
  });

  it('číslo lokality musí být po desítkách a unikátní; číslo zařízení v rozsahu lokality jen s upozorněním, duplicita je chyba', async () => {
    const r = createMockRepositories();
    await expect(r.service.saveSite({ number: '10515', name: 'Špatná', isActive: true }, spravce)).rejects.toThrow(/dělitelné deseti/);
    await expect(r.service.saveSite({ number: '10500', name: 'Duplicita', isActive: true }, spravce)).rejects.toThrow(/už existuje/);
    await expect(r.service.saveDevice({ number: '10501', siteNumber: '10500', name: 'Duplicitní zařízení', kind: 'FVE', isActive: true }, spravce)).rejects.toThrow(/už existuje/);
  });

  it('požadavek a servisní list zapíše správce i dispečer, běžný PM ne', async () => {
    const r = createMockRepositories();
    await expect(r.service.saveRequest({ siteNumber: '10500', title: 'Porucha', priority: 'Běžná', kind: 'Porucha' }, pm)).rejects.toThrow(/správce servisu, dispečer/);
    const req = await r.service.saveRequest({ siteNumber: '10500', deviceNumber: '10501', title: 'Porucha', priority: 'Běžná', kind: 'Porucha' }, dispecer);
    expect(req.number).toMatch(/^SPO-\d{4}-\d{4}$/);
    expect(req.status).toBe(RequestStatus.Prijato);
    await expect(r.service.createJob({ siteNumber: '10500', deviceNumber: '10501', title: 'Oprava' }, pm)).rejects.toThrow(/správce servisu, dispečer/);
  });
});

describe('MockServiceRepository — skrytý servisní projekt zařízení', () => {
  it('nové zařízení založí servisní projekt, který není v přehledu projektů, ale jde najít výslovně', async () => {
    const r = createMockRepositories();
    await r.service.saveSite({ number: '10520', name: 'Nová', isActive: true }, spravce);
    await r.service.saveDevice({ number: '10521', siteNumber: '10520', name: 'FVE Nová 1', kind: 'FVE', isActive: true }, spravce);
    const bezServisu = await r.projects.list({ includeOverhead: true });
    expect(bezServisu.some((p) => p.projectNumber === '10521')).toBe(false);
    const sServisem = await r.projects.list({ includeOverhead: true, includeService: true });
    expect(sServisem.filter((p) => p.projectNumber === '10521').map((p) => p.projectType)).toEqual(['Servis']);
    expect((await r.projects.getByNumber('10521'))?.projectNumber).toBe('10521');
  });
});

describe('MockServiceRepository — tok servisního listu', () => {
  async function pripraveno(): Promise<{ r: RepositorySet; jobId: number; requestId: number }> {
    const r = createMockRepositories();
    const req = await r.service.saveRequest({ siteNumber: '10500', deviceNumber: '10501', title: 'Výpadek střídače', priority: 'Vysoká', kind: 'Porucha' }, dispecer);
    const job = await r.service.createJob({ requestId: req.id, siteNumber: '10500', deviceNumber: '10501', title: 'Oprava střídače', supplierId: 7, supplierName: 'Servis s.r.o.' }, dispecer);
    return { r, jobId: job.id, requestId: req.id };
  }

  it('založení listu přepne požadavek na Zpracovává se a list dostane číslo SL', async () => {
    const { r, jobId, requestId } = await pripraveno();
    const job = (await r.service.listJobs()).filter((j) => j.id === jobId)[0];
    expect(job.number).toMatch(/^SL-\d{4}-\d{4}$/);
    expect(job.status).toBe(JobStatus.Naplanovano);
    expect((await r.service.listRequests()).filter((x) => x.id === requestId)[0].status).toBe(RequestStatus.Zpracovava);
  });

  it('celý tok až do uzavření; požadavek se po uzavření listu vyřeší; dispečer kontrolu nesmí', async () => {
    const { r, jobId, requestId } = await pripraveno();
    await r.service.actOnJob(jobId, 'order', { orderId: 5, orderNumber: 'OBJ-2026-0005' }, dispecer);
    await r.service.actOnJob(jobId, 'report', { workReport: 'Vyměněno, funguje', hours: 2 }, dispecer);
    await expect(r.service.actOnJob(jobId, 'check', {}, dispecer)).rejects.toThrow(/jen správce servisu/);
    await r.service.actOnJob(jobId, 'check', { comment: 'OK' }, spravce);
    await r.service.actOnJob(jobId, 'invoice', { invoiceId: 3, invoiceNumber: 'FP26003' }, spravce);
    await r.service.actOnJob(jobId, 'markInvoiced', {}, spravce);
    const closed = await r.service.actOnJob(jobId, 'close', {}, spravce);
    expect(closed.status).toBe(JobStatus.Uzavreno);
    expect((await r.service.listRequests()).filter((x) => x.id === requestId)[0].status).toBe(RequestStatus.Vyreseno);
  });

  it('akce v nesprávném stavu a bez povinných údajů se odmítne srozumitelnou chybou', async () => {
    const { r, jobId } = await pripraveno();
    await expect(r.service.actOnJob(jobId, 'check', {}, spravce)).rejects.toThrow(/ve stavu „Naplánováno“/);
    await expect(r.service.actOnJob(jobId, 'order', {}, dispecer)).rejects.toThrow(/objednávka/i);
    await expect(r.service.actOnJob(jobId, 'cancel', {}, dispecer)).rejects.toThrow(/důvod/);
  });

  it('zrušení jediného listu vrátí požadavek mezi přijaté; zamítnutí požadavku vyžaduje důvod', async () => {
    const { r, jobId, requestId } = await pripraveno();
    await r.service.actOnJob(jobId, 'cancel', { comment: 'Zákazník to vyřešil sám' }, dispecer);
    expect((await r.service.listRequests()).filter((x) => x.id === requestId)[0].status).toBe(RequestStatus.Prijato);
    await expect(r.service.rejectRequest(requestId, '  ', dispecer)).rejects.toThrow(/důvod/);
    expect((await r.service.rejectRequest(requestId, 'Mimo smlouvu', dispecer)).status).toBe(RequestStatus.Zamitnuto);
  });
});

describe('MockServiceRepository — složky', () => {
  it('nová lokalita i soubor dostanou odkaz na složku; složky lokality zakládá jen správce servisu', async () => {
    const r = createMockRepositories();
    const site = await r.service.saveSite({ number: '10520', name: 'Nová', isActive: true }, spravce);
    expect(site.folderUrl).toBeTruthy();
    const device = await r.service.saveDevice({ number: '10521', siteNumber: '10520', name: 'FVE Nová 1', kind: 'FVE', isActive: true }, spravce);
    expect(device.folderUrl).toBeTruthy();
    await expect(r.service.ensureFolders('10520', undefined, dispecer)).rejects.toThrow(/správce servisu/);
    expect(await r.service.ensureFolders('10520', '10521', spravce)).toBeTruthy();
    await expect(r.service.ensureFolders('99990', undefined, spravce)).rejects.toThrow(/nebyl nalezen/);
  });
});

describe('MockServiceRepository — servisní list na celou lokalitu', () => {
  it('list s číslem lokality jako souborem vznikne a založí skrytý servisní projekt lokality', async () => {
    const r = createMockRepositories();
    const req = await r.service.saveRequest({ siteNumber: '10500', title: 'Sečení trávy', priority: 'Nízká', kind: 'Ostatní' }, dispecer);
    const job = await r.service.createJob({ requestId: req.id, siteNumber: '10500', deviceNumber: '10500', title: 'Sečení trávy v areálu' }, dispecer);
    expect(job.number).toMatch(/^SL-\d{4}-\d{4}$/);
    const project = await r.projects.getByNumber('10500');
    expect(project?.projectType).toBe('Servis');
    await expect(r.service.createJob({ siteNumber: '10500', deviceNumber: '10599', title: 'x' }, dispecer)).rejects.toThrow(/neexistuje/);
    await expect(r.service.createJob({ siteNumber: '10590', deviceNumber: '10590', title: 'x' }, dispecer)).rejects.toThrow(/Lokalita 10590 neexistuje/);
  });
});

describe('MockServiceRepository — smazání lokality', () => {
  it('prázdnou lokalitu smaže správce, dispečer ne; lokalitu se soubory nesmaže', async () => {
    const r = createMockRepositories();
    await r.service.saveSite({ number: '10530', name: 'Omylem', isActive: true }, spravce);
    await expect(r.service.deleteSite('10530', dispecer)).rejects.toThrow(/vedení a administrátor/);
    await expect(r.service.deleteSite('10530', spravce)).rejects.toThrow(/vedení a administrátor/);
    await r.service.deleteSite('10530', vedeni);
    expect((await r.service.listSites()).some((s) => s.number === '10530')).toBe(false);
    await expect(r.service.deleteSite('10500', vedeni)).rejects.toThrow(/nejde smazat/);
    await expect(r.service.deleteSite('10530', vedeni)).rejects.toThrow(/nebyla nalezena/);
  });
});

describe('MockServiceRepository — smazání požadavku', () => {
  it('požadavek bez listů smaže dispečer; požadavek s listem ani cizí role ne', async () => {
    const r = createMockRepositories();
    const req = await r.service.saveRequest({ siteNumber: '10500', title: 'Omylem', priority: 'Běžná', kind: 'Ostatní' }, dispecer);
    await expect(r.service.deleteRequest(req.id, dispecer)).rejects.toThrow(/vedení a administrátor/);
    await expect(r.service.deleteRequest(req.id, spravce)).rejects.toThrow(/vedení a administrátor/);
    await r.service.deleteRequest(req.id, vedeni);
    expect((await r.service.listRequests()).some((x) => x.id === req.id)).toBe(false);
    await expect(r.service.deleteRequest(req.id, vedeni)).rejects.toThrow(/nebyl nalezen/);
    await expect(r.service.deleteRequest(1, vedeni)).rejects.toThrow(/nejde smazat/);
  });
});

describe('MockServiceRepository — přílohy', () => {
  it('přílohy požadavku a listu: přidat, přečíst, odebrat; stejný název se nepřepíše; cizí role nesmí', async () => {
    const r = createMockRepositories();
    const t = { kind: 'request' as const, id: 1 };
    const file = new File(['abc'], 'foto.jpg', { type: 'image/jpeg' });
    await r.service.addAttachment(t, file, dispecer);
    const second = await r.service.addAttachment(t, new File(['def'], 'foto.jpg', { type: 'image/jpeg' }), dispecer);
    expect(second.name).toBe('foto_2.jpg');
    expect((await r.service.listAttachments(t)).map((a) => a.name)).toEqual(['foto.jpg', 'foto_2.jpg']);
    expect((await r.service.readAttachment(t, 'foto.jpg')).size).toBe(3);
    await expect(r.service.addAttachment(t, file, pm)).rejects.toThrow(/správce servisu, dispečer/);
    await expect(r.service.addAttachment(t, new File(['x'], 'virus.exe'), dispecer)).rejects.toThrow(/\.exe/);
    await r.service.removeAttachment(t, 'foto.jpg', dispecer);
    expect((await r.service.listAttachments(t)).map((a) => a.name)).toEqual(['foto_2.jpg']);
    expect(await r.service.listAttachments({ kind: 'job', id: 1 })).toEqual([]);
  });
});

describe('MockServiceRepository — administrátor maže cokoli', () => {
  const admin = uzivatel('admin', 'Adam Admin', [Role.Administrator]);

  it('list k fakturaci a požadavek s ním smaže jen administrátor, vedení ne', async () => {
    const r = createMockRepositories();
    const req = await r.service.saveRequest({ siteNumber: '10500', deviceNumber: '10501', title: 'Test', priority: 'Běžná', kind: 'Porucha' }, dispecer);
    const job = await r.service.createJob({ requestId: req.id, siteNumber: '10500', deviceNumber: '10501', title: 'Oprava', supplierId: 7, supplierName: 'Servis' }, dispecer);
    await r.service.actOnJob(job.id, 'order', { orderId: 5, orderNumber: 'OBJ-1' }, dispecer);
    await r.service.actOnJob(job.id, 'report', { workReport: 'hotovo' }, dispecer);
    await r.service.actOnJob(job.id, 'check', {}, spravce);
    await expect(r.service.deleteJob(job.id, vedeni)).rejects.toThrow(/jen administrátor/);
    await expect(r.service.deleteRequest(req.id, vedeni)).rejects.toThrow(/jen administrátor/);
    await r.service.deleteRequest(req.id, admin);
    expect((await r.service.listRequests()).some((x) => x.id === req.id)).toBe(false);
    expect((await r.service.listJobs()).some((x) => x.id === job.id)).toBe(false);
  });
});
