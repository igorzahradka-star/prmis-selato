import {
  Actor,
  WorkflowContext,
  WorkflowError,
  WorkflowProject,
  availableActions,
  buildApprovalChain,
  canIssueOrder,
  cancelOrder,
  closeOrder,
  decideOrder,
  deliverOrder,
  applyOrderChange,
  isWaitingFor,
  sendOrder,
  submitOrder
} from './orderWorkflow';
import { OrderStatus, PurchaseOrder } from './orders';
import { DEFAULT_SETTINGS } from './settings';
import { Role } from './types';

// Limity z výchozího nastavení: PM 100 000, vedení 500 000, jednatel 1 000 000; samoschvalování PM vypnuté.
const SETTINGS = { ...DEFAULT_SETTINGS.approvals };

const PM = 'i:0#.f|membership|pm@revoltum.cz';
const ASISTENT = 'i:0#.f|membership|asistent@revoltum.cz';
const VEDENI = 'i:0#.f|membership|vedeni@revoltum.cz';
const VEDENI2 = 'i:0#.f|membership|vedeni2@revoltum.cz';
const JEDNATEL = 'i:0#.f|membership|jednatel@revoltum.cz';
const ADMIN = 'i:0#.f|membership|admin@revoltum.cz';

const pm: Actor = { login: PM, displayName: 'Petr Manažer', roles: [Role.ProjektovyManazer] };
const asistent: Actor = { login: ASISTENT, displayName: 'Anna Asistentka', roles: [Role.AsistentPM] };
const vedeni: Actor = { login: VEDENI, displayName: 'Viktor Vedení', roles: [Role.Vedeni] };
const vedeni2: Actor = { login: VEDENI2, displayName: 'Vera Vedení', roles: [Role.Vedeni] };
const jednatel: Actor = { login: JEDNATEL, displayName: 'Jaroslav Jednatel', roles: [Role.Jednatel] };
const admin: Actor = { login: ADMIN, displayName: 'Adam Admin', roles: [Role.Administrator] };

const projekt: WorkflowProject = { projectNumber: '26001', projectManagerLogin: PM, assistantLogins: [ASISTENT], isOverhead: false };
const rezie: WorkflowProject = { projectNumber: '26999', projectManagerLogin: ADMIN, isOverhead: true };

const NOW = new Date(2026, 9, 1, 10, 0);

function ctx(actor: Actor, project: WorkflowProject = projekt, settings = SETTINGS): WorkflowContext {
  return { project, settings, actor, now: NOW };
}

function objednavka(extra: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 1,
    orderNumber: 'OBJ-2026-0001',
    projectNumber: '26001',
    supplierId: 5,
    supplierName: 'FVE Komponenty s.r.o.',
    subject: 'Kabely a konektory',
    lines: [{ description: 'Kabel 6 mm²', quantity: 1, unitPriceNet: 50000 }],
    amountNet: 50000,
    vatRate: 21,
    currency: 'CZK',
    status: OrderStatus.Koncept,
    requestedByName: asistent.displayName,
    requestedByLogin: ASISTENT,
    approvalChain: [],
    ...extra
  };
}

function castka(amountNet: number): Partial<PurchaseOrder> {
  return { lines: [{ description: 'Položka', quantity: 1, unitPriceNet: amountNet }], amountNet };
}

describe('buildApprovalChain', () => {
  const vstup = (amountNetCzk: number, issuerLogin: string, extra: Record<string, unknown> = {}): Parameters<typeof buildApprovalChain>[0] => ({
    amountNetCzk,
    issuerLogin,
    projectManagerLogin: PM,
    isOverhead: false,
    settings: SETTINGS,
    ...extra
  });

  it('objednávku asistenta do limitu PM schvaluje PM', () => {
    const r = buildApprovalChain(vstup(50000, ASISTENT));
    expect(r.steps.map((s) => s.level)).toEqual(['pm']);
    expect(r.outsideApp).toBe(false);
  });

  it('hranice limitu patří ještě do nižšího pásma (přesně 100 000 schvaluje jen PM)', () => {
    expect(buildApprovalChain(vstup(100000, ASISTENT)).steps.map((s) => s.level)).toEqual(['pm']);
    expect(buildApprovalChain(vstup(100000.01, ASISTENT)).steps.map((s) => s.level)).toEqual(['pm', 'vedeni']);
  });

  it('nad limit PM navíc vedení, nad limit vedení navíc jednatel', () => {
    expect(buildApprovalChain(vstup(300000, ASISTENT)).steps.map((s) => s.level)).toEqual(['pm', 'vedeni']);
    expect(buildApprovalChain(vstup(800000, ASISTENT)).steps.map((s) => s.level)).toEqual(['pm', 'vedeni', 'jednatel']);
  });

  it('nad limit jednatele se schvaluje mimo aplikaci', () => {
    const r = buildApprovalChain(vstup(1000001, ASISTENT));
    expect(r.outsideApp).toBe(true);
    expect(r.steps).toEqual([]);
  });

  it('objednávku PM schvaluje vedení, když je samoschvalování vypnuté (výchozí rozhodnutí)', () => {
    const r = buildApprovalChain(vstup(50000, PM));
    expect(r.steps.map((s) => [s.level, s.approved])).toEqual([['vedeni', false]]);
  });

  it('u vyšších částek vlastní objednávky PM zbývá vedení (a jednatel), krok PM vypadne', () => {
    expect(buildApprovalChain(vstup(800000, PM)).steps.map((s) => s.level)).toEqual(['vedeni', 'jednatel']);
  });

  it('se zapnutým samoschvalováním je krok PM vyřízený automaticky; malá objednávka je rovnou schválená', () => {
    const nastaveni = { ...SETTINGS, pmSelfApprovalEnabled: true };
    const mala = buildApprovalChain(vstup(50000, PM, { settings: nastaveni }));
    expect(mala.steps).toEqual([{ level: 'pm', approved: true, auto: true }]);
    const velka = buildApprovalChain(vstup(300000, PM, { settings: nastaveni }));
    expect(velka.steps.map((s) => [s.level, s.approved])).toEqual([
      ['pm', true],
      ['vedeni', false]
    ]);
  });

  it('Režii schvaluje vždy vedení, bez ohledu na částku', () => {
    expect(buildApprovalChain(vstup(1000, ASISTENT, { isOverhead: true })).steps.map((s) => s.level)).toEqual(['vedeni']);
    expect(buildApprovalChain(vstup(800000, ASISTENT, { isOverhead: true })).steps.map((s) => s.level)).toEqual([
      'vedeni',
      'jednatel'
    ]);
  });

  it('když se přepínač „Režie schvaluje vedení" vypne, řídí se Režie běžnými pásmy', () => {
    const nastaveni = { ...SETTINGS, overheadRequiresVedeni: false };
    expect(buildApprovalChain(vstup(1000, ASISTENT, { isOverhead: true, settings: nastaveni })).steps.map((s) => s.level)).toEqual([
      'pm'
    ]);
  });
});

describe('submitOrder', () => {
  it('odešle koncept ke schválení PM a zapíše řetěz', () => {
    const z = submitOrder(objednavka(), ctx(asistent));
    expect(z.status).toBe(OrderStatus.KeSchvaleni);
    expect(z.currentApprovalLevel).toBe('pm');
    expect(z.approvalChain.map((s) => s.level)).toEqual(['pm']);
  });

  it('nejde odeslat neúplnou objednávku (bez dodavatele, bez položek)', () => {
    expect(() => submitOrder(objednavka({ supplierId: undefined, supplierName: undefined }), ctx(asistent))).toThrow(/dodavatele/);
    expect(() => submitOrder(objednavka({ lines: [], amountNet: 0 }), ctx(asistent))).toThrow(/položku/);
  });

  it('nejde odeslat objednávku, která už je ve schvalování', () => {
    expect(() => submitOrder(objednavka({ status: OrderStatus.KeSchvaleni }), ctx(asistent))).toThrow(WorkflowError);
  });

  it('cizí objednávku v konceptu nesmí odeslat nikdo nepříslušný', () => {
    const cizi: Actor = { login: 'i:0#.f|membership|cizi@revoltum.cz', displayName: 'Cizí', roles: [Role.ProjektovyManazer] };
    expect(() => submitOrder(objednavka(), ctx(cizi))).toThrow(/spravovat/);
  });

  it('objednávka nad limit jednatele se odmítne s vysvětlením', () => {
    expect(() => submitOrder(objednavka(castka(2000000)), ctx(asistent))).toThrow(/mimo aplikaci/);
  });

  it('objednávka PM se samoschvalováním do limitu je hned schválená; bez něj jde na vedení', () => {
    const vlastni = objednavka({ requestedByLogin: PM, requestedByName: pm.displayName });
    const s = submitOrder(vlastni, ctx(pm, projekt, { ...SETTINGS, pmSelfApprovalEnabled: true }));
    expect(s.status).toBe(OrderStatus.Schvaleno);
    const bez = submitOrder(vlastni, ctx(pm));
    expect(bez.status).toBe(OrderStatus.KeSchvaleni);
    expect(bez.currentApprovalLevel).toBe('vedeni');
  });

  it('objednávka v eurech se pro určení pásma přepočte kurzem z Nastavení', () => {
    // 5 000 EUR × 25 = 125 000 Kč → nad limit PM, takže PM a vedení
    const z = submitOrder(objednavka({ ...castka(5000), currency: 'EUR' }), ctx(asistent));
    expect(z.approvalChain.map((s) => s.level)).toEqual(['pm', 'vedeni']);
  });
});

describe('decideOrder', () => {
  const kSchvaleni = (extra: Partial<PurchaseOrder> = {}): PurchaseOrder => {
    const z = submitOrder(objednavka(extra), ctx(asistent));
    return objednavka({ ...extra, status: z.status, approvalChain: z.approvalChain, currentApprovalLevel: z.currentApprovalLevel });
  };

  it('PM projektu schválí objednávku do svého limitu → Schváleno', () => {
    const z = decideOrder(kSchvaleni(), 'approve', '', ctx(pm));
    expect(z.status).toBe(OrderStatus.Schvaleno);
    expect(z.approvalChain[0]).toMatchObject({ approved: true, byName: pm.displayName, at: NOW });
    expect(z.approval).toEqual({ stepNo: 1, decision: 'Schváleno', comment: undefined });
  });

  it('vyšší objednávka jde krok za krokem: PM → vedení → jednatel', () => {
    let o = kSchvaleni(castka(800000));
    let z = decideOrder(o, 'approve', 'ok', ctx(pm));
    expect(z.status).toBe(OrderStatus.KeSchvaleni);
    expect(z.currentApprovalLevel).toBe('vedeni');

    o = { ...o, approvalChain: z.approvalChain, currentApprovalLevel: z.currentApprovalLevel };
    z = decideOrder(o, 'approve', '', ctx(vedeni));
    expect(z.currentApprovalLevel).toBe('jednatel');

    o = { ...o, approvalChain: z.approvalChain, currentApprovalLevel: z.currentApprovalLevel };
    z = decideOrder(o, 'approve', '', ctx(jednatel));
    expect(z.status).toBe(OrderStatus.Schvaleno);
    expect(z.currentApprovalLevel).toBeUndefined();
  });

  it('krok nejde přeskočit: vedení nesmí schválit, dokud nerozhodl PM', () => {
    expect(() => decideOrder(kSchvaleni(castka(300000)), 'approve', '', ctx(vedeni))).toThrow(/Projektový manažer/);
  });

  it('PM jiného projektu ani asistent schvalovat nesmí', () => {
    const jinyPm: Actor = { login: 'i:0#.f|membership|jiny@revoltum.cz', displayName: 'Jiný PM', roles: [Role.ProjektovyManazer] };
    expect(() => decideOrder(kSchvaleni(), 'approve', '', ctx(jinyPm))).toThrow(WorkflowError);
    expect(() => decideOrder(kSchvaleni(), 'approve', '', ctx(asistent))).toThrow(WorkflowError);
  });

  it('administrátor bez role schvalovatele neschvaluje — schvalování je oddělené od správy', () => {
    expect(() => decideOrder(kSchvaleni(), 'approve', '', ctx(admin))).toThrow(WorkflowError);
  });

  it('NIKDO neschválí vlastní objednávku, ani když má potřebnou roli', () => {
    // PM vystaví sám a samoschvalování je vypnuté → čeká na vedení; vedení ji vystavilo samo → nesmí ji schválit
    const vlastniVedeni = objednavka({
      requestedByLogin: VEDENI,
      requestedByName: vedeni.displayName,
      status: OrderStatus.KeSchvaleni,
      approvalChain: [{ level: 'vedeni', approved: false }],
      currentApprovalLevel: 'vedeni'
    });
    expect(() => decideOrder(vlastniVedeni, 'approve', '', ctx(vedeni))).toThrow(/Vlastní objednávku/);
    // jiný člen vedení ale ano
    expect(decideOrder(vlastniVedeni, 'approve', '', ctx(vedeni2)).status).toBe(OrderStatus.Schvaleno);
  });

  it('PM nesmí schválit objednávku, kterou sám vystavil, ani kdyby byl na řadě', () => {
    const vlastni = objednavka({
      requestedByLogin: PM,
      requestedByName: pm.displayName,
      status: OrderStatus.KeSchvaleni,
      approvalChain: [{ level: 'pm', approved: false }],
      currentApprovalLevel: 'pm'
    });
    expect(() => decideOrder(vlastni, 'approve', '', ctx(pm))).toThrow(/Vlastní objednávku/);
  });

  it('vrácení a zamítnutí vyžaduje komentář', () => {
    expect(() => decideOrder(kSchvaleni(), 'return', '  ', ctx(pm))).toThrow(/co se má změnit/);
    expect(() => decideOrder(kSchvaleni(), 'reject', '', ctx(pm))).toThrow(/důvod/);
  });

  it('vrácení k úpravě smaže řetěz, po úpravě se schvaluje znovu od začátku', () => {
    const z = decideOrder(kSchvaleni(), 'return', 'Chybí termín dodání', ctx(pm));
    expect(z.status).toBe(OrderStatus.VracenoKUprave);
    expect(z.approvalChain).toEqual([]);
    expect(z.approval).toMatchObject({ decision: 'Vráceno k úpravě', comment: 'Chybí termín dodání' });
    const znovu = submitOrder(objednavka({ status: OrderStatus.VracenoKUprave }), ctx(asistent));
    expect(znovu.status).toBe(OrderStatus.KeSchvaleni);
  });

  it('zamítnutí ukončí schvalování; objednávka už se dál neposouvá', () => {
    const z = decideOrder(kSchvaleni(), 'reject', 'Příliš drahé', ctx(pm));
    expect(z.status).toBe(OrderStatus.Zamitnuto);
    expect(() => sendOrder(objednavka({ status: OrderStatus.Zamitnuto }), ctx(asistent))).toThrow(WorkflowError);
  });

  it('nejde rozhodovat o objednávce, která není ve schvalování', () => {
    expect(() => decideOrder(objednavka(), 'approve', '', ctx(pm))).toThrow(/„Koncept“/);
  });

  it('Režii schvaluje vedení, projektový manažer ne', () => {
    const o = objednavka({ projectNumber: '26999', requestedByLogin: ASISTENT });
    const z = submitOrder(o, ctx(asistent, rezie));
    const k = { ...o, status: z.status, approvalChain: z.approvalChain, currentApprovalLevel: z.currentApprovalLevel };
    expect(() => decideOrder(k, 'approve', '', ctx(pm, rezie))).toThrow(WorkflowError);
    expect(decideOrder(k, 'approve', '', ctx(vedeni, rezie)).status).toBe(OrderStatus.Schvaleno);
  });
});

describe('po schválení', () => {
  const schvalena = objednavka({ status: OrderStatus.Schvaleno, approvalChain: [{ level: 'pm', approved: true }] });

  it('schválenou objednávku odešle dodavateli vystavitel; datum odeslání se zapíše', () => {
    const z = sendOrder(schvalena, ctx(asistent));
    expect(z.status).toBe(OrderStatus.Odeslano);
    expect(z.sentDate).toEqual(NOW);
  });

  it('běžný nepříslušný uživatel odeslat nesmí', () => {
    const cizi: Actor = { login: 'i:0#.f|membership|cizi@revoltum.cz', displayName: 'Cizí', roles: [Role.ProjektovyManazer] };
    expect(() => sendOrder(schvalena, ctx(cizi))).toThrow(/spravovat/);
  });

  it('nejde odeslat neschválenou objednávku', () => {
    expect(() => sendOrder(objednavka({ status: OrderStatus.KeSchvaleni }), ctx(asistent))).toThrow(WorkflowError);
  });

  it('odesláno → dodáno → uzavřeno, přeskočit jde těžko', () => {
    const odeslana = objednavka({ status: OrderStatus.Odeslano, sentDate: NOW });
    expect(() => closeOrder(odeslana, ctx(asistent))).toThrow(WorkflowError);
    const dodana = deliverOrder(odeslana, ctx(asistent));
    expect(dodana.status).toBe(OrderStatus.Dodano);
    expect(closeOrder(objednavka({ status: OrderStatus.Dodano }), ctx(asistent)).status).toBe(OrderStatus.Uzavreno);
  });
});

describe('cancelOrder', () => {
  it('storno vyžaduje důvod a zapíše ho', () => {
    expect(() => cancelOrder(objednavka(), ' ', ctx(asistent))).toThrow(/důvod/);
    const z = cancelOrder(objednavka(), 'Dodavatel zrušil nabídku', ctx(asistent));
    expect(z.status).toBe(OrderStatus.Storno);
    expect(z.cancelReason).toBe('Dodavatel zrušil nabídku');
  });

  it('jde stornovat schválenou i odeslanou, uzavřenou už ne', () => {
    expect(cancelOrder(objednavka({ status: OrderStatus.Odeslano }), 'Chyba', ctx(asistent)).status).toBe(OrderStatus.Storno);
    expect(() => cancelOrder(objednavka({ status: OrderStatus.Uzavreno }), 'Chyba', ctx(asistent))).toThrow(WorkflowError);
    expect(() => cancelOrder(objednavka({ status: OrderStatus.Storno }), 'Chyba', ctx(asistent))).toThrow(WorkflowError);
  });
});

describe('canIssueOrder', () => {
  it('na běžný projekt smí PM projektu, jeho asistent, vedení a administrátor; cizí PM ne', () => {
    expect(canIssueOrder(projekt, pm)).toBe(true);
    expect(canIssueOrder(projekt, asistent)).toBe(true);
    expect(canIssueOrder(projekt, vedeni)).toBe(true);
    expect(canIssueOrder(projekt, admin)).toBe(true);
    const cizi: Actor = { login: 'i:0#.f|membership|cizi@revoltum.cz', displayName: 'Cizí', roles: [Role.ProjektovyManazer] };
    expect(canIssueOrder(projekt, cizi)).toBe(false);
  });

  it('na Režii smí kdokoli s objednávající rolí (přístup k Režii hlídá SharePoint), čtenář ne', () => {
    const cizi: Actor = { login: 'i:0#.f|membership|cizi@revoltum.cz', displayName: 'Cizí', roles: [Role.ProjektovyManazer] };
    expect(canIssueOrder(rezie, cizi)).toBe(true);
    const ctenar: Actor = { login: 'i:0#.f|membership|ctenar@revoltum.cz', displayName: 'Čtenář', roles: [Role.Ctenar] };
    expect(canIssueOrder(rezie, ctenar)).toBe(false);
  });
});

describe('availableActions / isWaitingFor', () => {
  const kSchvaleni = objednavka({
    status: OrderStatus.KeSchvaleni,
    approvalChain: [{ level: 'pm', approved: false }],
    currentApprovalLevel: 'pm'
  });

  it('koncept: vystavitel může upravit, odeslat a stornovat, ale ne schvalovat', () => {
    expect(availableActions(objednavka(), projekt, asistent)).toEqual(['edit', 'submit', 'cancel']);
  });

  it('ve schvalování: schvalovatel má tlačítka rozhodnutí, vystavitel jen storno', () => {
    expect(availableActions(kSchvaleni, projekt, pm)).toEqual(['approve', 'return', 'reject', 'cancel']);
    expect(availableActions(kSchvaleni, projekt, asistent)).toEqual(['cancel']);
  });

  it('nepříslušný uživatel nemá žádná tlačítka', () => {
    const cizi: Actor = { login: 'i:0#.f|membership|cizi@revoltum.cz', displayName: 'Cizí', roles: [Role.Ctenar] };
    expect(availableActions(kSchvaleni, projekt, cizi)).toEqual([]);
  });

  it('uzavřená a stornovaná objednávka nemá žádné akce', () => {
    expect(availableActions(objednavka({ status: OrderStatus.Uzavreno }), projekt, admin)).toEqual([]);
    expect(availableActions(objednavka({ status: OrderStatus.Storno }), projekt, admin)).toEqual([]);
  });

  it('isWaitingFor: čeká na PM, ne na vedení ani na vystavitele', () => {
    expect(isWaitingFor(kSchvaleni, projekt, pm)).toBe(true);
    expect(isWaitingFor(kSchvaleni, projekt, vedeni)).toBe(false);
    expect(isWaitingFor(kSchvaleni, projekt, asistent)).toBe(false);
  });
});

describe('applyOrderChange', () => {
  it('přenese nový stav, řetěz, kdo je na řadě a důvod storna; ostatní údaje nechá', () => {
    const puvodni = objednavka({ subject: 'Kabely' });
    const zmena = cancelOrder(puvodni, 'Chyba v zadání', ctx(asistent));
    const po = applyOrderChange(puvodni, zmena, NOW);
    expect(po.status).toBe(OrderStatus.Storno);
    expect(po.cancelReason).toBe('Chyba v zadání');
    expect(po.subject).toBe('Kabely');
    expect(po.modified).toEqual(NOW);
  });

  it('po vrácení k úpravě zůstane objednávka bez řetězce a bez schvalovatele', () => {
    const z = submitOrder(objednavka(), ctx(asistent));
    const kSchvaleni = applyOrderChange(objednavka(), z, NOW);
    const vracena = applyOrderChange(kSchvaleni, decideOrder(kSchvaleni, 'return', 'Doplnit', ctx(pm)), NOW);
    expect(vracena.approvalChain).toEqual([]);
    expect(vracena.currentApprovalLevel).toBeUndefined();
  });

  it('datum odeslání se po odeslání zapíše a při dalších změnách nezmizí', () => {
    const schvalena = objednavka({ status: OrderStatus.Schvaleno });
    const odeslana = applyOrderChange(schvalena, sendOrder(schvalena, ctx(asistent)), NOW);
    expect(odeslana.sentDate).toEqual(NOW);
    const dodana = applyOrderChange(odeslana, deliverOrder(odeslana, ctx(asistent)), new Date(2026, 9, 5));
    expect(dodana.sentDate).toEqual(NOW);
  });
});
