import { createMockRepositories } from './mockRepositories';
import { CurrentUser, Role } from '../../core/types';
import { OrderStatus } from '../../core/orders';
import { OrderInput, RepositorySet } from '../repositories';
import { MOCK_PARTNERS, MOCK_USER } from './mockData';

// Při plné zátěži počítače (celý běh testů) trvá ukázkový repozitář déle než výchozích 5 s.
jest.setTimeout(30000);

function uzivatel(login: string, name: string, roles: Role[]): CurrentUser {
  return { ...MOCK_USER, id: Math.floor(Math.random() * 1000) + 100, loginName: `i:0#.f|membership|${login}@revoltum.cz`, displayName: name, roles };
}

const igor = { ...MOCK_USER } as CurrentUser; // administrátor, vedení, finance, PM
const jan = uzivatel('jan.novak', 'Jan Novák', [Role.ProjektovyManazer]);
const martin = uzivatel('martin.svoboda', 'Martin Svoboda', [Role.AsistentPM]);
const petr = uzivatel('petr.dvorak', 'Petr Dvořák', [Role.Vedeni]);
const cizi = uzivatel('cizi', 'Cizí PM', [Role.ProjektovyManazer]);

const vstup = (extra: Partial<OrderInput> = {}): OrderInput => ({
  projectNumber: '25001',
  supplierId: MOCK_PARTNERS[4].id,
  subject: 'Testovací objednávka',
  lines: [{ description: 'Kabel', quantity: 2, unitPriceNet: 10000 }],
  vatRate: 21,
  currency: 'CZK',
  ...extra
});

async function repos(): Promise<RepositorySet> {
  return createMockRepositories();
}

describe('MockOrderRepository — zakládání a čísla', () => {
  it('nová objednávka je koncept, dostane další číslo v řadě a spočítanou částku', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup(), igor);
    expect(o.status).toBe(OrderStatus.Koncept);
    expect(o.orderNumber).toBe('OBJ-2026-0005');
    expect(o.amountNet).toBe(20000);
    expect(o.requestedByLogin).toBe(igor.loginName);
  });

  it('čísla jdou po sobě bez duplicit', async () => {
    const r = await repos();
    const a = await r.orders.create(vstup(), igor);
    const b = await r.orders.create(vstup(), igor);
    expect(a.orderNumber).not.toBe(b.orderNumber);
  });

  it('neúplný koncept se neuloží a číslo se nespotřebuje', async () => {
    const r = await repos();
    await expect(r.orders.create(vstup({ subject: ' ' }), igor)).rejects.toThrow(/předmět/);
    const dalsi = await r.orders.create(vstup(), igor);
    expect(dalsi.orderNumber).toBe('OBJ-2026-0005');
  });

  it('cizí PM na cizí projekt objednávku vystavit nesmí', async () => {
    const r = await repos();
    await expect(r.orders.create(vstup(), cizi)).rejects.toThrow(/oprávnění/);
  });

  it('na neexistující projekt se nevystavuje', async () => {
    const r = await repos();
    await expect(r.orders.create(vstup({ projectNumber: '99999' }), igor)).rejects.toThrow(/nebyl nalezen/);
  });

  it('po uložení se doplní název dodavatele z partnera', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup(), igor);
    expect(o.supplierName).toBe(MOCK_PARTNERS[4].name);
  });
});

describe('MockOrderRepository — schvalování krok za krokem', () => {
  it('objednávka PM jde na vedení; vedení ji schválí; jiný uživatel ne', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup({ projectNumber: '25003' }), jan);
    const odeslana = await r.orders.submit(o.id, jan);
    expect(odeslana.status).toBe(OrderStatus.KeSchvaleni);
    expect(odeslana.currentApprovalLevel).toBe('vedeni');

    await expect(r.orders.decide(o.id, 'approve', '', cizi)).rejects.toThrow();
    const schvalena = await r.orders.decide(o.id, 'approve', 'OK', petr);
    expect(schvalena.status).toBe(OrderStatus.Schvaleno);
  });

  it('člen vedení si vlastní objednávku smí schválit sám, ale nesmí ji vrátit ani zamítnout', async () => {
    const r = await repos();
    // Igor je PM projektu 25001 a zároveň vedení: v kroku vedení si vlastní objednávku schválí
    const o = await r.orders.create(vstup(), igor);
    await r.orders.submit(o.id, igor);
    await expect(r.orders.decide(o.id, 'return', 'změnit', igor)).rejects.toThrow(/Vlastní objednávku/);
    await expect(r.orders.decide(o.id, 'reject', 'důvod', igor)).rejects.toThrow(/Vlastní objednávku/);
    expect((await r.orders.decide(o.id, 'approve', '', igor)).status).toBe(OrderStatus.Schvaleno);
  });

  it('PM bez role vedení vlastní objednávku neschválí', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup({ projectNumber: '25003' }), jan);
    await r.orders.submit(o.id, jan);
    await expect(r.orders.decide(o.id, 'approve', '', jan)).rejects.toThrow();
  });

  it('historie schvalování se zapisuje: kdo, jak a s jakým komentářem', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup({ projectNumber: '25003' }), jan);
    await r.orders.submit(o.id, jan);
    await r.orders.decide(o.id, 'return', 'Doplňte termín', petr);
    const historie = await r.orders.listApprovals(o.id);
    expect(historie).toHaveLength(1);
    expect(historie[0]).toMatchObject({ approverName: 'Petr Dvořák', decision: 'Vráceno k úpravě', comment: 'Doplňte termín' });
  });

  it('vrácenou objednávku jde upravit a odeslat znovu', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup({ projectNumber: '25003' }), jan);
    await r.orders.submit(o.id, jan);
    await r.orders.decide(o.id, 'return', 'Doplňte termín', petr);
    const upravena = await r.orders.update(o.id, vstup({ projectNumber: '25003', subject: 'Opraveno' }), jan);
    expect(upravena.subject).toBe('Opraveno');
    expect((await r.orders.submit(o.id, jan)).status).toBe(OrderStatus.KeSchvaleni);
  });

  it('odeslanou ke schválení objednávku už upravovat nejde', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup({ projectNumber: '25003' }), jan);
    await r.orders.submit(o.id, jan);
    await expect(r.orders.update(o.id, vstup({ projectNumber: '25003' }), jan)).rejects.toThrow(/nejde upravovat/);
  });

  it('projekt na rozpracované objednávce se nemění', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup(), igor);
    await expect(r.orders.update(o.id, vstup({ projectNumber: '25002' }), igor)).rejects.toThrow(/Projekt/);
  });
});

describe('MockOrderRepository — Režie a životní cyklus', () => {
  it('objednávku na Režii schvaluje vedení; PM projektu ne', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup({ projectNumber: '26999' }), martin);
    const k = await r.orders.submit(o.id, martin);
    expect(k.currentApprovalLevel).toBe('vedeni');
    await expect(r.orders.decide(o.id, 'approve', '', jan)).rejects.toThrow();
    expect((await r.orders.decide(o.id, 'approve', '', petr)).status).toBe(OrderStatus.Schvaleno);
  });

  it('od schválení po uzavření: odeslat, dodat, uzavřít', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup({ projectNumber: '25003' }), jan);
    await r.orders.submit(o.id, jan);
    await r.orders.decide(o.id, 'approve', '', petr);
    const odeslana = await r.orders.send(o.id, jan);
    expect(odeslana.status).toBe(OrderStatus.Odeslano);
    expect(odeslana.sentDate).toBeDefined();
    expect((await r.orders.deliver(o.id, jan)).status).toBe(OrderStatus.Dodano);
    expect((await r.orders.close(o.id, jan)).status).toBe(OrderStatus.Uzavreno);
  });

  it('storno se vším, co k němu patří: důvod je povinný a objednávka zůstane v seznamu', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup(), igor);
    await expect(r.orders.cancel(o.id, '', igor)).rejects.toThrow(/důvod/);
    const s = await r.orders.cancel(o.id, 'Zrušeno zákazníkem', igor);
    expect(s.status).toBe(OrderStatus.Storno);
    expect((await r.orders.list()).some((x) => x.id === o.id)).toBe(true);
  });

  it('seznam jde filtrovat podle projektu a stavu a je řazený od nejnovější', async () => {
    const r = await repos();
    const vsechny = await r.orders.list();
    expect(vsechny[0].orderNumber > vsechny[vsechny.length - 1].orderNumber).toBe(true);
    const zProjektu = await r.orders.list({ projectNumber: '25003' });
    expect(zProjektu.every((x) => x.projectNumber === '25003')).toBe(true);
    const keSchvaleni = await r.orders.list({ statuses: [OrderStatus.KeSchvaleni] });
    expect(keSchvaleni.every((x) => x.status === OrderStatus.KeSchvaleni)).toBe(true);
  });
});

const soubor = (name: string, size: number = 20): File => new File([new Uint8Array(size).fill(65)], name, { type: 'application/pdf' });

describe('MockOrderRepository — přílohy', () => {
  it('k objednávce jde připojit soubor a objeví se v seznamu příloh', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup(), igor);
    await r.orders.addAttachment(o.id, soubor('nabidka.pdf'), igor);
    const prilohy = await r.orders.listAttachments(o.id);
    expect(prilohy.map((p) => p.name)).toEqual(['nabidka.pdf']);
    expect(prilohy[0].sizeBytes).toBe(20);
  });

  it('soubor stejného názvu nahradí předchozí, nezdvojí se', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup(), igor);
    await r.orders.addAttachment(o.id, soubor('a.pdf', 10), igor);
    await r.orders.addAttachment(o.id, soubor('a.pdf', 30), igor);
    const prilohy = await r.orders.listAttachments(o.id);
    expect(prilohy).toHaveLength(1);
    expect(prilohy[0].sizeBytes).toBe(30);
  });

  it('spustitelný soubor a nepovolený název odmítne', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup(), igor);
    await expect(r.orders.addAttachment(o.id, soubor('virus.exe'), igor)).rejects.toThrow(/\.exe/);
    await expect(r.orders.addAttachment(o.id, soubor('a#b.pdf'), igor)).rejects.toThrow(/nepovoluje/);
  });

  it('cizí PM přílohu nepřidá, ani když zná číslo objednávky', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup(), igor);
    await expect(r.orders.addAttachment(o.id, soubor('a.pdf'), cizi)).rejects.toThrow();
  });

  it('u konceptu jde přílohu odebrat, po odeslání ke schválení už ne', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup({ projectNumber: '25003' }), jan);
    await r.orders.addAttachment(o.id, soubor('a.pdf'), jan);
    await r.orders.addAttachment(o.id, soubor('b.pdf'), jan);
    await r.orders.removeAttachment(o.id, 'a.pdf', jan);
    expect((await r.orders.listAttachments(o.id)).map((p) => p.name)).toEqual(['b.pdf']);

    await r.orders.submit(o.id, jan);
    await expect(r.orders.removeAttachment(o.id, 'b.pdf', jan)).rejects.toThrow(/jen u konceptu/);
    // přidat jde dál — schvalovatel třeba chce doplnit podklad
    await r.orders.addAttachment(o.id, soubor('c.pdf'), jan);
  });

  it('u stornované objednávky už přílohu přidat nejde', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup(), igor);
    await r.orders.cancel(o.id, 'Test', igor);
    await expect(r.orders.addAttachment(o.id, soubor('a.pdf'), igor)).rejects.toThrow();
  });

  it('obsah přílohy jde přečíst zpět (pro přiložení k e-mailu)', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup(), igor);
    await r.orders.addAttachment(o.id, soubor('a.pdf', 42), igor);
    expect((await r.orders.readAttachment(o.id, 'a.pdf')).size).toBe(42);
    await expect(r.orders.readAttachment(o.id, 'neni.pdf')).rejects.toThrow();
  });
});

describe('MockOrderRepository — schvalovatel a odeslání dodavateli', () => {
  it('s určeným schvalovatelem schválí krok jen on; jiný člen téže role ne', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup({ projectNumber: '25003' }), jan);
    const vedeni2 = uzivatel('vedeni.druhy', 'Druhé Vedení', [Role.Vedeni]);
    await r.orders.submit(o.id, jan, { vedeni: { login: petr.loginName, name: petr.displayName } });
    await expect(r.orders.decide(o.id, 'approve', '', vedeni2)).rejects.toThrow(/Petr Dvořák/);
    expect((await r.orders.decide(o.id, 'approve', '', petr)).status).toBe(OrderStatus.Schvaleno);
  });

  it('žadatel může schvalovatele změnit, dokud objednávka čeká', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup({ projectNumber: '25003' }), jan);
    const vedeni2 = uzivatel('vedeni.druhy', 'Druhé Vedení', [Role.Vedeni]);
    await r.orders.submit(o.id, jan, { vedeni: { login: petr.loginName, name: petr.displayName } });
    const zmenena = await r.orders.reassign(o.id, 'vedeni', { login: vedeni2.loginName, name: vedeni2.displayName }, jan);
    expect(zmenena.approvalChain[0].assignedName).toBe('Druhé Vedení');
    await expect(r.orders.decide(o.id, 'approve', '', petr)).rejects.toThrow();
    expect((await r.orders.decide(o.id, 'approve', '', vedeni2)).status).toBe(OrderStatus.Schvaleno);
  });

  it('cizí PM schvalovatele změnit nesmí', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup({ projectNumber: '25003' }), jan);
    await r.orders.submit(o.id, jan);
    await expect(r.orders.reassign(o.id, 'vedeni', undefined, cizi)).rejects.toThrow();
  });

  it('odeslání dodavateli zapíše odkaz na PDF a datum; adresát jde do audit logu', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup({ projectNumber: '25003' }), jan);
    await r.orders.submit(o.id, jan);
    await r.orders.decide(o.id, 'approve', '', petr);
    const odeslana = await r.orders.send(o.id, jan, { sentTo: 'objednavky@dodavatel.cz', pdfUrl: 'https://x/OBJ.pdf' });
    expect(odeslana.status).toBe(OrderStatus.Odeslano);
    expect(odeslana.pdfUrl).toBe('https://x/OBJ.pdf');
    expect(odeslana.sentDate).toBeDefined();
  });
});

describe('MockOrderRepository — úprava po schválení, opakované odeslání, mazání, nadlimitní částky', () => {
  const jednatel = uzivatel('jednatel', 'Jana Jednatelka', [Role.Jednatel]);

  it('úprava schválené objednávky smaže schvalování a vrátí ji na koncept; po odeslání se schvaluje znovu', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup({ projectNumber: '25003' }), jan);
    await r.orders.submit(o.id, jan);
    const schvalena = await r.orders.decide(o.id, 'approve', '', petr);
    expect(schvalena.status).toBe(OrderStatus.Schvaleno);

    const upravena = await r.orders.update(o.id, vstup({ projectNumber: '25003', subject: 'Opravený předmět' }), jan);
    expect(upravena.status).toBe(OrderStatus.Koncept);
    expect(upravena.approvalChain).toEqual([]);
    expect(upravena.subject).toBe('Opravený předmět');

    const znovu = await r.orders.submit(o.id, jan);
    expect(znovu.status).toBe(OrderStatus.KeSchvaleni);
    expect(znovu.approvalChain.every((s) => !s.approved)).toBe(true);
  });

  it('zamítnutou objednávku jde upravit a odeslat znovu', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup({ projectNumber: '25003' }), jan);
    await r.orders.submit(o.id, jan);
    await r.orders.decide(o.id, 'reject', 'Moc drahé', petr);
    const upravena = await r.orders.update(o.id, vstup({ projectNumber: '25003', subject: 'Levnější' }), jan);
    expect(upravena.status).toBe(OrderStatus.Koncept);
    expect((await r.orders.submit(o.id, jan)).status).toBe(OrderStatus.KeSchvaleni);
  });

  it('odeslanou objednávku už upravit nejde', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup({ projectNumber: '25003' }), jan);
    await r.orders.submit(o.id, jan);
    await r.orders.decide(o.id, 'approve', '', petr);
    await r.orders.send(o.id, jan, { sentTo: 'a@b.cz' });
    await expect(r.orders.update(o.id, vstup({ projectNumber: '25003' }), jan)).rejects.toThrow(/nejde upravovat/);
  });

  it('odeslanou objednávku jde odeslat znovu na jinou adresu; stav zůstane, datum prvního odeslání také', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup({ projectNumber: '25003' }), jan);
    await r.orders.submit(o.id, jan);
    await r.orders.decide(o.id, 'approve', '', petr);
    const odeslana = await r.orders.send(o.id, jan, { sentTo: 'a@b.cz', pdfUrl: 'https://x/1.pdf' });
    const znovu = await r.orders.resend(o.id, jan, { sentTo: 'jiny@b.cz', pdfUrl: 'https://x/2.pdf' });
    expect(znovu.status).toBe(OrderStatus.Odeslano);
    expect(znovu.sentDate).toEqual(odeslana.sentDate);
    expect(znovu.pdfUrl).toBe('https://x/2.pdf');
    await expect(r.orders.resend(o.id, cizi)).rejects.toThrow();
  });

  it('neodeslanou objednávku znovu odeslat nejde', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup({ projectNumber: '25003' }), jan);
    await expect(r.orders.resend(o.id, jan)).rejects.toThrow(/to nejde/);
  });

  it('objednávku smaže jen administrátor; ostatní ne', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup({ projectNumber: '25003' }), jan);
    await expect(r.orders.delete(o.id, jan)).rejects.toThrow(/administrátor/);
    await expect(r.orders.delete(o.id, petr)).rejects.toThrow(/administrátor/);
    await r.orders.delete(o.id, igor);
    expect(await r.orders.getById(o.id)).toBeUndefined();
  });

  it('objednávka nad limit jednatele se schvaluje v aplikaci: PM → vedení → jednatel, až do schválení', async () => {
    const r = await repos();
    const o = await r.orders.create(
      vstup({ projectNumber: '25003', lines: [{ description: 'Velký nákup', quantity: 1, unitPriceNet: 2000000 }] }),
      jan
    );
    const odeslana = await r.orders.submit(o.id, jan);
    expect(odeslana.status).toBe(OrderStatus.KeSchvaleni);
    expect(odeslana.approvalChain.map((s) => s.level)).toEqual(['vedeni', 'jednatel']);
    await r.orders.decide(o.id, 'approve', '', petr);
    const hotovo = await r.orders.decide(o.id, 'approve', '', jednatel);
    expect(hotovo.status).toBe(OrderStatus.Schvaleno);
  });
});

describe('MockOrderRepository — navázání na položku rozpočtu', () => {
  it('objednávka si pamatuje položku rozpočtu (id a popis); změna se uloží i při úpravě konceptu', async () => {
    const r = await repos();
    const o = await r.orders.create(vstup({ budgetItemId: 'i-1', budgetItemName: 'Panely (NODA)' }), igor);
    expect([o.budgetItemId, o.budgetItemName]).toEqual(['i-1', 'Panely (NODA)']);
    const upr = await r.orders.update(o.id, vstup({ budgetItemId: undefined, budgetItemName: undefined }), igor);
    expect(upr.budgetItemId).toBeUndefined();
  });
});
