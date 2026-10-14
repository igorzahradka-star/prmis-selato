import { Role } from './types';
import { JobStatus, RequestStatus, ServiceFlowError, ServiceJob, applyJobAction, availableJobActions, isJobOverdue, requestStatusFrom } from './serviceJobs';

const dispecer = { displayName: 'David Dispečer', roles: [Role.Dispecer] };
const spravce = { displayName: 'Sára Správce', roles: [Role.SpravceServisu] };
const pm = { displayName: 'Běžný PM', roles: [Role.ProjektovyManazer] };

const job = (extra: Partial<ServiceJob> = {}): ServiceJob => ({
  id: 1,
  number: 'SL-2026-0001',
  siteNumber: '10500',
  deviceNumber: '10501',
  title: 'Výměna střídače',
  status: JobStatus.Naplanovano,
  supplierId: 7,
  supplierName: 'Servis s.r.o.',
  ...extra
});

describe('tok servisního listu', () => {
  it('celý životní cyklus: objednání → provedení → kontrola → podklad → vyfakturováno → uzavřeno', () => {
    let j = job();
    const step = (action: Parameters<typeof applyJobAction>[1], input: Parameters<typeof applyJobAction>[2], actor = spravce): void => {
      const ch = applyJobAction(j, action, input, actor);
      j = { ...j, ...ch.patch, status: ch.status };
    };
    step('order', { orderId: 5, orderNumber: 'OBJ-2026-0005' }, dispecer);
    expect(j.status).toBe(JobStatus.Objednano);
    step('report', { workReport: 'Vyměněn střídač, otestováno', hours: 3.5, material: 'Střídač 50 kW' }, dispecer);
    expect(j.status).toBe(JobStatus.Provedeno);
    expect([j.hours, j.workReport]).toEqual([3.5, 'Vyměněn střídač, otestováno']);
    step('check', { comment: 'OK' });
    expect(j.status).toBe(JobStatus.KFakturaci);
    expect([j.checkedByName, j.checkNote]).toEqual(['Sára Správce', 'OK']);
    step('invoice', { invoiceId: 9, invoiceNumber: 'FP26009' });
    expect(j.status).toBe(JobStatus.KFakturaci);
    step('markInvoiced', {});
    expect(j.status).toBe(JobStatus.Vyfakturovano);
    step('close', {});
    expect(j.status).toBe(JobStatus.Uzavreno);
  });

  it('akci v nesprávném stavu nejde provést', () => {
    expect(() => applyJobAction(job(), 'check', {}, spravce)).toThrow(/ve stavu „Naplánováno“/);
    expect(() => applyJobAction(job({ status: JobStatus.Uzavreno }), 'cancel', { comment: 'x' }, spravce)).toThrow(ServiceFlowError);
  });

  it('dispečer kontroluje a odemyká fakturaci nesmí, běžný PM nic', () => {
    const provedeno = job({ status: JobStatus.Provedeno });
    expect(() => applyJobAction(provedeno, 'check', {}, dispecer)).toThrow(/jen správce servisu/);
    expect(() => applyJobAction(job(), 'order', { orderId: 1 }, pm)).toThrow(/nemáte oprávnění/);
  });

  it('povinné údaje: dodavatel a objednávka při objednání, zpráva o provedení, důvod vrácení a zrušení', () => {
    expect(() => applyJobAction(job({ supplierId: undefined, supplierName: undefined }), 'order', { orderId: 1 }, dispecer)).toThrow(/vyberte dodavatele/);
    expect(() => applyJobAction(job(), 'order', {}, dispecer)).toThrow(/objednávka/i);
    expect(() => applyJobAction(job({ status: JobStatus.Objednano }), 'report', { workReport: '  ' }, dispecer)).toThrow(/Popište/);
    expect(() => applyJobAction(job({ status: JobStatus.Provedeno }), 'returnToSupplier', {}, spravce)).toThrow(/Napište/);
    expect(() => applyJobAction(job(), 'cancel', {}, dispecer)).toThrow(/důvod/);
    const back = applyJobAction(job({ status: JobStatus.Provedeno }), 'returnToSupplier', { comment: 'Chybí fotky' }, spravce);
    expect([back.status, back.patch.checkNote]).toEqual([JobStatus.Objednano, 'Chybí fotky']);
  });

  it('vyfakturováno až po založení podkladu pro fakturaci', () => {
    expect(() => applyJobAction(job({ status: JobStatus.KFakturaci }), 'markInvoiced', {}, spravce)).toThrow(/podklad/);
  });

  it('nabízené akce podle stavu a role', () => {
    expect(availableJobActions(job(), dispecer.roles)).toEqual(['edit', 'order', 'cancel']);
    expect(availableJobActions(job({ status: JobStatus.Provedeno }), dispecer.roles)).toEqual([]);
    expect(availableJobActions(job({ status: JobStatus.Provedeno }), spravce.roles)).toEqual(['returnToSupplier', 'check']);
    expect(availableJobActions(job({ status: JobStatus.KFakturaci }), spravce.roles)).toEqual(['invoice']);
    expect(availableJobActions(job({ status: JobStatus.KFakturaci, invoiceId: 3 }), spravce.roles)).toEqual(['markInvoiced']);
    expect(availableJobActions(job({ status: JobStatus.Vyfakturovano }), spravce.roles)).toEqual(['close']);
    expect(availableJobActions(job(), pm.roles)).toEqual([]);
  });
});

describe('stav požadavku podle listů', () => {
  it('bez listu Přijato, s živým listem Zpracovává se, po uzavření Vyřešeno', () => {
    expect(requestStatusFrom(RequestStatus.Prijato, [])).toBe(RequestStatus.Prijato);
    expect(requestStatusFrom(RequestStatus.Prijato, [{ status: JobStatus.Objednano }])).toBe(RequestStatus.Zpracovava);
    expect(requestStatusFrom(RequestStatus.Zpracovava, [{ status: JobStatus.Uzavreno }, { status: JobStatus.Zruseno }])).toBe(RequestStatus.Vyreseno);
    expect(requestStatusFrom(RequestStatus.Zpracovava, [{ status: JobStatus.Uzavreno }, { status: JobStatus.Provedeno }])).toBe(RequestStatus.Zpracovava);
  });
  it('všechny listy zrušené = požadavek se vrací mezi přijaté; zamítnutý zůstane zamítnutý', () => {
    expect(requestStatusFrom(RequestStatus.Zpracovava, [{ status: JobStatus.Zruseno }])).toBe(RequestStatus.Prijato);
    expect(requestStatusFrom(RequestStatus.Zamitnuto, [{ status: JobStatus.Objednano }])).toBe(RequestStatus.Zamitnuto);
  });
});

describe('po termínu', () => {
  const today = new Date(2026, 9, 14);
  it('jen naplánovaný nebo objednaný list s prošlým datem', () => {
    expect(isJobOverdue({ status: JobStatus.Objednano, plannedDate: new Date(2026, 9, 13) }, today)).toBe(true);
    expect(isJobOverdue({ status: JobStatus.Objednano, plannedDate: new Date(2026, 9, 14) }, today)).toBe(false);
    expect(isJobOverdue({ status: JobStatus.Provedeno, plannedDate: new Date(2026, 8, 1) }, today)).toBe(false);
    expect(isJobOverdue({ status: JobStatus.Naplanovano }, today)).toBe(false);
  });
});

describe('doklad o provedení', () => {
  const objednano = (): ServiceJob => job({ status: JobStatus.Objednano });

  it('stačí popis, fotky, nebo ověření na dálku', () => {
    const popis = applyJobAction(objednano(), 'report', { workReport: 'Vyměněn konektor, komunikace obnovena', proofKind: 'Popis' }, dispecer);
    expect(popis.patch.proofKind).toBe('Popis');
    const foto = applyJobAction(objednano(), 'report', { proofKind: 'Fotka', photosUrl: 'https://x/foto' }, dispecer);
    expect([foto.patch.proofKind, foto.patch.photosUrl, foto.patch.workReport]).toEqual(['Fotka', 'https://x/foto', undefined]);
    const dalka = applyJobAction(objednano(), 'report', { proofKind: 'Vzdálené ověření', verifiedBy: 'David Dispečer' }, dispecer);
    expect([dalka.patch.proofKind, dalka.patch.verifiedByName]).toEqual(['Vzdálené ověření', 'David Dispečer']);
    expect(dalka.patch.verifiedAt).toBeInstanceOf(Date);
  });

  it('bez dokladu nebo s chybějící částí se provedení odmítne srozumitelně', () => {
    expect(() => applyJobAction(objednano(), 'report', {}, dispecer)).toThrow(/Popište/);
    expect(() => applyJobAction(objednano(), 'report', { proofKind: 'Fotka' }, dispecer)).toThrow(/fotky/);
    expect(() => applyJobAction(objednano(), 'report', { proofKind: 'Vzdálené ověření' }, dispecer)).toThrow(/ověřil na dálku/);
    expect(() => applyJobAction(objednano(), 'report', { proofKind: 'Popis', workReport: ' ' }, dispecer)).toThrow(/Popište/);
  });

  it('bez výslovné volby se doklad pozná podle vyplněného (popis, pak fotky)', () => {
    expect(applyJobAction(objednano(), 'report', { workReport: 'Hotovo' }, dispecer).patch.proofKind).toBe('Popis');
    expect(applyJobAction(objednano(), 'report', { photosUrl: 'https://x/f' }, dispecer).patch.proofKind).toBe('Fotka');
  });
});

describe('fotky z provedení a interní servis', () => {
  it('doklad Fotka stačí s nahranými fotkami, i bez odkazu na složku', () => {
    const objednano = job({ status: JobStatus.Objednano });
    expect(applyJobAction(objednano, 'report', { proofKind: 'Fotka', photoCount: 2 }, dispecer).patch.proofKind).toBe('Fotka');
    expect(() => applyJobAction(objednano, 'report', { proofKind: 'Fotka', photoCount: 0 }, dispecer)).toThrow(/fotky/);
  });

  it('interní servis se neobjednává a provedení se zapisuje rovnou z naplánovaného stavu', () => {
    const interni = job({ isInternal: true, supplierId: undefined, supplierName: undefined });
    expect(availableJobActions(interni, dispecer.roles)).toEqual(expect.arrayContaining(['report', 'edit', 'cancel']));
    expect(availableJobActions(interni, dispecer.roles)).not.toContain('order');
    expect(() => applyJobAction(interni, 'order', { orderId: 1 }, dispecer)).toThrow(/neobjednává/);
    expect(applyJobAction(interni, 'report', { workReport: 'Opraveno naším dispečerem' }, dispecer).status).toBe(JobStatus.Provedeno);
    // běžný list z naplánovaného stavu provedení zapsat nejde
    expect(() => applyJobAction(job(), 'report', { workReport: 'x' }, dispecer)).toThrow(/ve stavu „Naplánováno“/);
  });
});
