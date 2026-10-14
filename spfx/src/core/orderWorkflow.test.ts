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
  resendOrder,
  canDeleteOrder,
  canEditOrder,
  editResetsApproval,
  orderEditChange,
  applyOrderChange,
  approverCandidates,
  canAddAttachment,
  canRemoveAttachment,
  defaultApproverLogin,
  describeApprovalRoute,
  reassignApprover,
  isWaitingFor,
  sendOrder,
  submitOrder
} from './orderWorkflow';
import { OrderStatus, PurchaseOrder } from './orders';
import { effectiveRates } from './currency';
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

const KURZY = effectiveRates(undefined, { EUR: 25, USD: 23 });

function ctx(actor: Actor, project: WorkflowProject = projekt, settings = SETTINGS): WorkflowContext {
  return { project, settings, actor, now: NOW, rates: KURZY };
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
  });

  it('hranice limitu patří ještě do nižšího pásma (přesně 100 000 schvaluje jen PM)', () => {
    expect(buildApprovalChain(vstup(100000, ASISTENT)).steps.map((s) => s.level)).toEqual(['pm']);
    expect(buildApprovalChain(vstup(100000.01, ASISTENT)).steps.map((s) => s.level)).toEqual(['pm', 'vedeni']);
  });

  it('nad limit PM navíc vedení, nad limit vedení navíc jednatel', () => {
    expect(buildApprovalChain(vstup(300000, ASISTENT)).steps.map((s) => s.level)).toEqual(['pm', 'vedeni']);
    expect(buildApprovalChain(vstup(800000, ASISTENT)).steps.map((s) => s.level)).toEqual(['pm', 'vedeni', 'jednatel']);
  });

  it('nad limit jednatele se schvaluje v aplikaci stejně jako v pásmu jednatele', () => {
    const r = buildApprovalChain(vstup(1000001, ASISTENT));
    expect(r.steps.map((s) => s.level)).toEqual(['pm', 'vedeni', 'jednatel']);
    expect(buildApprovalChain(vstup(50000000, ASISTENT)).steps.map((s) => s.level)).toEqual(['pm', 'vedeni', 'jednatel']);
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

  it('objednávka nad limit jednatele jde ke schválení PM → vedení → jednatel', () => {
    const z = submitOrder(objednavka(castka(2000000)), ctx(asistent));
    expect(z.status).toBe(OrderStatus.KeSchvaleni);
    expect(z.approvalChain.map((s) => s.level)).toEqual(['pm', 'vedeni', 'jednatel']);
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
    // člen vedení si ji smí v kroku vedení schválit sám (výjimka jen pro vedení)…
    const sam = decideOrder(vlastniVedeni, 'approve', '', ctx(vedeni));
    expect(sam.status).toBe(OrderStatus.Schvaleno);
    expect(sam.auditAction).toMatch(/vlastní objednávku schválil člen vedení/);
    // …ale vrátit ani zamítnout si ji nesmí
    expect(() => decideOrder(vlastniVedeni, 'return', 'změnit', ctx(vedeni))).toThrow(/Vlastní objednávku/);
    expect(() => decideOrder(vlastniVedeni, 'reject', 'důvod', ctx(vedeni))).toThrow(/Vlastní objednávku/);
    // jiný člen vedení může také
    expect(decideOrder(vlastniVedeni, 'approve', '', ctx(vedeni2)).status).toBe(OrderStatus.Schvaleno);
  });

  it('výjimka platí jen pro vedení v kroku vedení a jednatele v kroku jednatele; člen vedení v kroku jednatele ani PM ne', () => {
    const vlastniVedeniJednatel = objednavka({
      requestedByLogin: VEDENI,
      requestedByName: vedeni.displayName,
      status: OrderStatus.KeSchvaleni,
      approvalChain: [{ level: 'vedeni', approved: true, auto: true }, { level: 'jednatel', approved: false }],
      currentApprovalLevel: 'jednatel'
    });
    expect(() => decideOrder(vlastniVedeniJednatel, 'approve', '', ctx(vedeni))).toThrow(WorkflowError);
    const vlastniJednatel = objednavka({
      requestedByLogin: JEDNATEL,
      requestedByName: jednatel.displayName,
      status: OrderStatus.KeSchvaleni,
      approvalChain: [{ level: 'jednatel', approved: false }],
      currentApprovalLevel: 'jednatel'
    });
    // jednatel si v kroku jednatele schválí vlastní objednávku sám, vrátit ani zamítnout ji nesmí
    expect(decideOrder(vlastniJednatel, 'approve', '', ctx(jednatel)).status).toBe(OrderStatus.Schvaleno);
    expect(() => decideOrder(vlastniJednatel, 'return', 'změnit', ctx(jednatel))).toThrow(/Vlastní objednávku/);
    expect(() => decideOrder(vlastniJednatel, 'reject', 'důvod', ctx(jednatel))).toThrow(/Vlastní objednávku/);
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

describe('Servis: objednávky servisních projektů', () => {
  const servis: WorkflowProject = { projectNumber: '10501', isOverhead: false, isService: true };
  const spravce: Actor = { login: 'i:0#.f|membership|spravce@revoltum.cz', displayName: 'Sára Správce', roles: [Role.SpravceServisu] };
  const dispecer: Actor = { login: 'i:0#.f|membership|dispecer@revoltum.cz', displayName: 'David Dispečer', roles: [Role.Dispecer] };
  const cizi: Actor = { login: 'i:0#.f|membership|cizipm@revoltum.cz', displayName: 'Běžný PM', roles: [Role.ProjektovyManazer] };
  it('objednávat smí správce, dispečer a administrátor; běžný PM a asistent ne', () => {
    expect([spravce, dispecer, admin].map((a) => canIssueOrder(servis, a))).toEqual([true, true, true]);
    expect([cizi, asistent].map((a) => canIssueOrder(servis, a))).toEqual([false, false]);
  });
  it('krok „PM“ u servisní objednávky schvaluje správce servisu, ne dispečer', () => {
    const o = objednavka({ requestedByLogin: dispecer.login, requestedByName: dispecer.displayName, status: OrderStatus.KeSchvaleni, approvalChain: [{ level: 'pm', approved: false }], currentApprovalLevel: 'pm' });
    expect(() => decideOrder(o, 'approve', '', ctx(dispecer, servis))).toThrow(WorkflowError);
    expect(() => decideOrder(o, 'approve', '', ctx(cizi, servis))).toThrow(WorkflowError);
    expect(decideOrder(o, 'approve', '', ctx(spravce, servis)).status).toBe(OrderStatus.Schvaleno);
  });
  it('kandidáty na schvalovatele kroku „PM“ jsou členové role Správce servisu', () => {
    const m = [
      { role: Role.SpravceServisu, members: [{ id: 1, loginName: spravce.login, displayName: spravce.displayName, email: 's@x.cz' }] },
      { role: Role.ProjektovyManazer, members: [{ id: 2, loginName: cizi.login, displayName: cizi.displayName, email: 'c@x.cz' }] }
    ] as never;
    expect(approverCandidates('pm', m, servis, dispecer.login).map((a) => a.name)).toEqual(['Sára Správce']);
  });
  it('správce servisu si vlastní objednávku do limitu PM schválí sám (krok „PM“ se vyřídí automaticky)', () => {
    const { steps } = buildApprovalChain({ amountNetCzk: 1000, issuerLogin: spravce.login, isOverhead: false, settings: { ...SETTINGS, pmSelfApprovalEnabled: true }, issuerIsServiceAdmin: true });
    expect(steps).toEqual([{ level: 'pm', approved: true, auto: true }]);
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

  it('schválená objednávka jde upravit (zruší se schválení) a odeslat, ale přímo ke schválení ne', () => {
    const a = availableActions(objednavka({ status: OrderStatus.Schvaleno }), projekt, asistent);
    expect(a).toEqual(['edit', 'send', 'cancel']);
  });

  it('zamítnutá objednávka jde upravit a znovu odeslat ke schválení přes koncept', () => {
    expect(availableActions(objednavka({ status: OrderStatus.Zamitnuto }), projekt, asistent)).toEqual(['edit', 'cancel']);
  });

  it('odeslaná objednávka nejde upravit, ale jde ji odeslat znovu, dodat a stornovat', () => {
    const a = availableActions(objednavka({ status: OrderStatus.Odeslano }), projekt, asistent);
    expect(a).toEqual(['resend', 'deliver', 'cancel']);
    expect(canEditOrder(objednavka({ status: OrderStatus.Odeslano }), projekt, asistent)).toBe(false);
  });

  it('ve schvalování: schvalovatel má tlačítka rozhodnutí, vystavitel jen storno', () => {
    expect(availableActions(kSchvaleni, projekt, pm)).toEqual(['approve', 'return', 'reject', 'reassign', 'cancel']);
    expect(availableActions(kSchvaleni, projekt, asistent)).toEqual(['reassign', 'cancel']);
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

describe('describeApprovalRoute', () => {
  it('složí cestu schvalování do věty', () => {
    expect(
      describeApprovalRoute([
        { level: 'pm', approved: false },
        { level: 'vedeni', approved: false }
      ])
    ).toBe('Projektový manažer → Vedení');
  });

  it('automaticky vyřízený krok označí', () => {
    expect(describeApprovalRoute([{ level: 'pm', approved: true, auto: true }])).toBe('Projektový manažer (automaticky)');
  });

  it('prázdná cesta je „bez schvalování"', () => {
    expect(describeApprovalRoute([])).toBe('bez schvalování');
  });
});

describe('přiřazený schvalovatel', () => {
  const VEDENI_JINY: Actor = vedeni2;

  it('při odeslání se schvalovatelé zapíšou do kroků', () => {
    const z = submitOrder(objednavka(castka(300000)), ctx(asistent), {
      pm: { login: PM, name: 'Petr Manažer' },
      vedeni: { login: VEDENI, name: 'Viktor Vedení' }
    });
    expect(z.approvalChain.map((s) => [s.level, s.assignedLogin])).toEqual([
      ['pm', PM],
      ['vedeni', VEDENI]
    ]);
  });

  it('krok s přiřazeným schvalovatelem smí schválit jen on, ne jiný člen téže role', () => {
    const z = submitOrder(objednavka(castka(300000)), ctx(asistent), {
      pm: { login: PM, name: 'Petr Manažer' },
      vedeni: { login: VEDENI, name: 'Viktor Vedení' }
    });
    const o = objednavka({ ...castka(300000), status: z.status, approvalChain: z.approvalChain, currentApprovalLevel: z.currentApprovalLevel });
    const poPm = applyOrderChange(o, decideOrder(o, 'approve', '', ctx(pm)), NOW);
    expect(() => decideOrder(poPm, 'approve', '', ctx(VEDENI_JINY))).toThrow(/Viktor Vedení/);
    expect(decideOrder(poPm, 'approve', '', ctx(vedeni)).status).toBe(OrderStatus.Schvaleno);
  });

  it('bez přiřazení smí krok schválit kdokoli z role', () => {
    const z = submitOrder(objednavka(castka(300000)), ctx(asistent));
    const o = objednavka({ ...castka(300000), status: z.status, approvalChain: z.approvalChain, currentApprovalLevel: z.currentApprovalLevel });
    const poPm = applyOrderChange(o, decideOrder(o, 'approve', '', ctx(pm)), NOW);
    expect(decideOrder(poPm, 'approve', '', ctx(vedeni2)).status).toBe(OrderStatus.Schvaleno);
  });

  it('žadatel může jako PM-schvalovatele určit i jiného člověka než PM projektu', () => {
    const jinyPm: Actor = { login: 'i:0#.f|membership|jiny@revoltum.cz', displayName: 'Jiný PM', roles: [Role.ProjektovyManazer] };
    const z = submitOrder(objednavka(), ctx(asistent), { pm: { login: jinyPm.login, name: jinyPm.displayName } });
    const o = objednavka({ status: z.status, approvalChain: z.approvalChain, currentApprovalLevel: z.currentApprovalLevel });
    expect(() => decideOrder(o, 'approve', '', ctx(pm))).toThrow(/Jiný PM/);
    expect(decideOrder(o, 'approve', '', ctx(jinyPm)).status).toBe(OrderStatus.Schvaleno);
  });

  it('přiřazený schvalovatel vedení musí mít stále roli vedení', () => {
    const bezRole: Actor = { login: VEDENI, displayName: 'Viktor', roles: [Role.ProjektovyManazer] };
    const o = objednavka({
      status: OrderStatus.KeSchvaleni,
      approvalChain: [{ level: 'vedeni', approved: false, assignedLogin: VEDENI, assignedName: 'Viktor' }],
      currentApprovalLevel: 'vedeni'
    });
    expect(() => decideOrder(o, 'approve', '', ctx(bezRole))).toThrow(WorkflowError);
  });

  it('vystavitel nemůže být schvalovatelem, ani když ho žadatel vybere', () => {
    expect(() =>
      submitOrder(objednavka(), ctx(asistent), { pm: { login: ASISTENT, name: 'Anna Asistentka' } })
    ).toThrow(/vystavitel/);
  });

  it('isWaitingFor respektuje přiřazení: čeká jen na určeného člověka', () => {
    const o = objednavka({
      status: OrderStatus.KeSchvaleni,
      approvalChain: [{ level: 'vedeni', approved: false, assignedLogin: VEDENI, assignedName: 'Viktor' }],
      currentApprovalLevel: 'vedeni'
    });
    expect(isWaitingFor(o, projekt, vedeni)).toBe(true);
    expect(isWaitingFor(o, projekt, vedeni2)).toBe(false);
  });
});

describe('defaultApproverLogin', () => {
  const kandidati = [
    { login: VEDENI, name: 'Viktor Vedení' },
    { login: VEDENI2, name: 'Vera Vedení' }
  ];
  const nastaveni = { vedeni: { login: VEDENI2, name: 'Vera Vedení' } };

  it('u PM je výchozí PM projektu', () => {
    expect(defaultApproverLogin('pm', [], projekt, nastaveni, ASISTENT)).toBe(PM);
  });

  it('u vedení je výchozí osoba z číselníku, když je mezi kandidáty', () => {
    expect(defaultApproverLogin('vedeni', kandidati, projekt, nastaveni, ASISTENT)).toBe(VEDENI2);
  });

  it('bez položky v číselníku zůstává „kdokoli z role"', () => {
    expect(defaultApproverLogin('jednatel', [], projekt, nastaveni, ASISTENT)).toBe('');
    expect(defaultApproverLogin('vedeni', kandidati, projekt, undefined, ASISTENT)).toBe('');
  });

  it('výchozí osoba, která není mezi kandidáty (odešla ze skupiny), se nepředvyplní', () => {
    expect(defaultApproverLogin('vedeni', [kandidati[0]], projekt, nastaveni, ASISTENT)).toBe('');
  });

  it('vystavitel se jako výchozí schvalovatel nikdy nepředvyplní', () => {
    expect(defaultApproverLogin('pm', [], projekt, nastaveni, PM)).toBe('');
    expect(defaultApproverLogin('vedeni', kandidati, projekt, nastaveni, VEDENI2)).toBe('');
  });
});

describe('reassignApprover', () => {
  const kSchvaleni = objednavka({
    ...castka(300000),
    status: OrderStatus.KeSchvaleni,
    approvalChain: [
      { level: 'pm', approved: true, byName: 'Petr Manažer', byLogin: PM },
      { level: 'vedeni', approved: false, assignedLogin: VEDENI, assignedName: 'Viktor Vedení' }
    ],
    currentApprovalLevel: 'vedeni'
  });

  it('vystavitel může změnit schvalovatele nevyřízeného kroku', () => {
    const z = reassignApprover(kSchvaleni, 'vedeni', { login: VEDENI2, name: 'Vera Vedení' }, ctx(asistent));
    expect(z.status).toBe(OrderStatus.KeSchvaleni);
    expect(z.approvalChain[1]).toMatchObject({ assignedLogin: VEDENI2, assignedName: 'Vera Vedení', approved: false });
    expect(z.approvalChain[0].approved).toBe(true);
    expect(z.auditAction).toContain('Vera Vedení');
  });

  it('nový schvalovatel pak schvaluje, původní už ne', () => {
    const z = reassignApprover(kSchvaleni, 'vedeni', { login: VEDENI2, name: 'Vera Vedení' }, ctx(asistent));
    const po = applyOrderChange(kSchvaleni, z, NOW);
    expect(() => decideOrder(po, 'approve', '', ctx(vedeni))).toThrow(WorkflowError);
    expect(decideOrder(po, 'approve', '', ctx(vedeni2)).status).toBe(OrderStatus.Schvaleno);
  });

  it('bez nového schvalovatele se krok vrátí na „kdokoli z role"', () => {
    const z = reassignApprover(kSchvaleni, 'vedeni', undefined, ctx(asistent));
    expect(z.approvalChain[1].assignedLogin).toBeUndefined();
  });

  it('vyřízený krok změnit nejde', () => {
    expect(() => reassignApprover(kSchvaleni, 'pm', { login: PM, name: 'x' }, ctx(asistent))).toThrow(/vyřízený/);
  });

  it('vystavitele jako nového schvalovatele odmítne', () => {
    expect(() => reassignApprover(kSchvaleni, 'vedeni', { login: ASISTENT, name: 'Anna' }, ctx(asistent))).toThrow(/vystavitel/);
  });

  it('změnit smí jen ten, kdo s objednávkou smí nakládat; u objednávky mimo schvalování to nejde', () => {
    const cizi: Actor = { login: 'i:0#.f|membership|cizi@revoltum.cz', displayName: 'Cizí', roles: [Role.ProjektovyManazer] };
    expect(() => reassignApprover(kSchvaleni, 'vedeni', undefined, ctx(cizi))).toThrow(/spravovat/);
    expect(() => reassignApprover(objednavka(), 'pm', undefined, ctx(asistent))).toThrow(WorkflowError);
  });

  it('tlačítko Změnit schvalovatele se nabízí jen ve schvalování a jen těm, kdo smějí', () => {
    expect(availableActions(kSchvaleni, projekt, asistent)).toContain('reassign');
    expect(availableActions(kSchvaleni, projekt, vedeni)).toContain('reassign');
    expect(availableActions(objednavka(), projekt, asistent)).not.toContain('reassign');
  });
});

describe('přílohy', () => {
  it('přidat smí, kdo smí objednávku spravovat, dokud není uzavřená ani stornovaná', () => {
    expect(canAddAttachment(objednavka(), projekt, asistent)).toBe(true);
    expect(canAddAttachment(objednavka({ status: OrderStatus.Odeslano }), projekt, asistent)).toBe(true);
    expect(canAddAttachment(objednavka({ status: OrderStatus.Uzavreno }), projekt, asistent)).toBe(false);
    expect(canAddAttachment(objednavka({ status: OrderStatus.Storno }), projekt, asistent)).toBe(false);
  });

  it('cizí člověk přílohu nepřidá', () => {
    const cizi: Actor = { login: 'i:0#.f|membership|cizi@revoltum.cz', displayName: 'Cizí', roles: [Role.ProjektovyManazer] };
    expect(canAddAttachment(objednavka(), projekt, cizi)).toBe(false);
  });

  it('odebrat jde jen u konceptu a vrácené objednávky, ne po schválení', () => {
    expect(canRemoveAttachment(objednavka(), projekt, asistent)).toBe(true);
    expect(canRemoveAttachment(objednavka({ status: OrderStatus.VracenoKUprave }), projekt, asistent)).toBe(true);
    expect(canRemoveAttachment(objednavka({ status: OrderStatus.Schvaleno }), projekt, asistent)).toBe(false);
    expect(canRemoveAttachment(objednavka({ status: OrderStatus.KeSchvaleni }), projekt, asistent)).toBe(false);
  });
});

describe('approverCandidates', () => {
  const osoba = (login: string, name: string): { id: number; loginName: string; displayName: string } => ({
    id: 1,
    loginName: login,
    displayName: name
  });
  const clenstvi = [
    { role: Role.Vedeni, groupName: 'V', groupExists: true, members: [osoba(VEDENI, 'Viktor Vedení'), osoba(VEDENI2, 'Vera Vedení')] },
    { role: Role.Jednatel, groupName: 'J', groupExists: true, members: [osoba(JEDNATEL, 'Jaroslav Jednatel')] },
    { role: Role.ProjektovyManazer, groupName: 'P', groupExists: true, members: [osoba(PM, 'Petr Manažer')] }
  ];
  const projektBezJmena = { ...projekt, projectManagerName: 'Petr Manažer' };

  it('u vedení nabídne členy role Vedení, česky seřazené', () => {
    expect(approverCandidates('vedeni', clenstvi, projektBezJmena, ASISTENT).map((c) => c.name)).toEqual([
      'Vera Vedení',
      'Viktor Vedení'
    ]);
  });

  it('u jednatele členy role Jednatel', () => {
    expect(approverCandidates('jednatel', clenstvi, projektBezJmena, ASISTENT).map((c) => c.login)).toEqual([JEDNATEL]);
  });

  it('vedení a jednatel se nabízí i sám sobě; vystavitel u kroku PM ne', () => {
    expect(approverCandidates('vedeni', clenstvi, projektBezJmena, VEDENI).map((c) => c.login)).toEqual([VEDENI2, VEDENI]);
    expect(approverCandidates('jednatel', clenstvi, projektBezJmena, JEDNATEL).map((c) => c.login)).toEqual([JEDNATEL]);
    expect(approverCandidates('pm', clenstvi, projektBezJmena, PM).map((c) => c.login)).toEqual([]);
  });

  it('u PM se přidá PM projektu, i když v roli není zapsaný, a bez duplicity', () => {
    const bezRole = [{ role: Role.ProjektovyManazer, groupName: 'P', groupExists: true, members: [] }];
    expect(approverCandidates('pm', bezRole, projektBezJmena, ASISTENT).map((c) => c.login)).toEqual([PM]);
    expect(approverCandidates('pm', clenstvi, projektBezJmena, ASISTENT).map((c) => c.login)).toEqual([PM]);
  });

  it('prázdná role nemá kandidáty', () => {
    expect(approverCandidates('jednatel', [], projektBezJmena, ASISTENT)).toEqual([]);
  });
});

describe('úprava schválené a zamítnuté objednávky', () => {
  it('úprava schválené nebo zamítnuté objednávky smaže schvalovací řetězec a vrátí ji na koncept', () => {
    const schvalena = objednavka({
      status: OrderStatus.Schvaleno,
      approvalChain: [{ level: 'pm', approved: true, byName: 'Petr Manažer', byLogin: PM }]
    });
    expect(editResetsApproval(schvalena)).toBe(true);
    const zmena = orderEditChange(schvalena);
    expect(zmena.status).toBe(OrderStatus.Koncept);
    expect(zmena.approvalChain).toEqual([]);
    expect(zmena.currentApprovalLevel).toBeUndefined();
    expect(zmena.auditAction).toMatch(/znovu odeslat/);

    const zamitnuta = objednavka({ status: OrderStatus.Zamitnuto, approvalChain: [{ level: 'pm', approved: false }] });
    const po = applyOrderChange(zamitnuta, orderEditChange(zamitnuta), NOW);
    expect(po.status).toBe(OrderStatus.Koncept);
    expect(po.approvalChain).toEqual([]);
  });

  it('úprava konceptu nebo vrácené objednávky stav nemění', () => {
    expect(editResetsApproval(objednavka())).toBe(false);
    expect(orderEditChange(objednavka()).status).toBe(OrderStatus.Koncept);
    expect(orderEditChange(objednavka({ status: OrderStatus.VracenoKUprave })).status).toBe(OrderStatus.VracenoKUprave);
  });

  it('po úpravě se schvaluje znovu od začátku', () => {
    const schvalena = objednavka({
      status: OrderStatus.Schvaleno,
      approvalChain: [{ level: 'pm', approved: true, byName: 'Petr Manažer', byLogin: PM }]
    });
    const koncept = applyOrderChange(schvalena, orderEditChange(schvalena), NOW);
    const znovu = submitOrder(koncept, ctx(asistent));
    expect(znovu.status).toBe(OrderStatus.KeSchvaleni);
    expect(znovu.approvalChain.every((s) => !s.approved)).toBe(true);
  });
});

describe('opakované odeslání dodavateli a mazání', () => {
  const odeslana = objednavka({ status: OrderStatus.Odeslano, sentDate: NOW });

  it('odeslanou objednávku jde odeslat znovu; stav i datum prvního odeslání zůstanou, adresát jde do auditu', () => {
    const z = resendOrder(odeslana, ctx(asistent), { sentTo: 'jiny@dodavatel.cz', pdfUrl: 'https://x/OBJ.pdf' });
    expect(z.status).toBe(OrderStatus.Odeslano);
    expect(z.sentDate).toBe(NOW);
    expect(z.auditAction).toBe('Odesláno dodavateli znovu (jiny@dodavatel.cz)');
  });

  it('neodeslanou ani cizí objednávku znovu odeslat nejde', () => {
    expect(() => resendOrder(objednavka({ status: OrderStatus.Schvaleno }), ctx(asistent))).toThrow(WorkflowError);
    const cizi: Actor = { login: 'i:0#.f|membership|cizi@revoltum.cz', displayName: 'Cizí', roles: [Role.ProjektovyManazer] };
    expect(() => resendOrder(odeslana, ctx(cizi))).toThrow(/spravovat/);
  });

  it('objednávku smaže jen administrátor', () => {
    expect(canDeleteOrder(admin)).toBe(true);
    expect(canDeleteOrder(pm)).toBe(false);
    expect(canDeleteOrder(vedeni)).toBe(false);
  });
});
