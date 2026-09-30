import { createMockRepositories } from './mockRepositories';
import { CurrentUser, Role } from '../../core/types';
import { OrderStatus } from '../../core/orders';
import { OrderInput, RepositorySet } from '../repositories';
import { MOCK_PARTNERS, MOCK_USER } from './mockData';

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

  it('PM nemůže schválit vlastní objednávku (jako Igor v roli vedení)', async () => {
    const r = await repos();
    // Igor je PM projektu 25001 a zároveň vedení: vlastní objednávku schválit nesmí
    const o = await r.orders.create(vstup(), igor);
    await r.orders.submit(o.id, igor);
    await expect(r.orders.decide(o.id, 'approve', '', igor)).rejects.toThrow(/Vlastní objednávku/);
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
