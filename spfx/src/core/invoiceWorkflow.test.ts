import {
  InvoiceContext,
  applyInvoiceChange,
  availableInvoiceActions,
  canCheckInvoice,
  canDeleteInvoice,
  canEditInvoice,
  canIssueInvoice,
  cancelInvoice,
  handOverInvoice,
  isWaitingForCheck,
  markInvoiced,
  markPaid,
  resendInvoice,
  returnInvoice,
  submitInvoice
} from './invoiceWorkflow';
import { InvoiceBasis, InvoiceStatus } from './invoiceBases';
import { Actor, WorkflowError, WorkflowProject } from './orderWorkflow';
import { Role } from './types';

const PM = 'i:0#.f|membership|pm@revoltum.cz';
const ASISTENT = 'i:0#.f|membership|asistent@revoltum.cz';

const pm: Actor = { login: PM, displayName: 'Petr Manažer', roles: [Role.ProjektovyManazer] };
const asistent: Actor = { login: ASISTENT, displayName: 'Anna Asistentka', roles: [Role.AsistentPM] };
const vedeni: Actor = { login: 'i:0#.f|membership|vedeni@revoltum.cz', displayName: 'Viktor Vedení', roles: [Role.Vedeni] };
const admin: Actor = { login: 'i:0#.f|membership|admin@revoltum.cz', displayName: 'Adam Admin', roles: [Role.Administrator] };
const finance: Actor = { login: 'i:0#.f|membership|fin@revoltum.cz', displayName: 'Filip Finance', roles: [Role.Finance] };
const cizi: Actor = { login: 'i:0#.f|membership|cizi@revoltum.cz', displayName: 'Cizí', roles: [Role.ProjektovyManazer] };

const projekt: WorkflowProject = {
  projectNumber: '26001',
  projectManagerLogin: PM,
  projectManagerName: 'Petr Manažer',
  assistantLogins: [ASISTENT],
  isOverhead: false
};
const rezie: WorkflowProject = { projectNumber: '26999', isOverhead: true };

const NOW = new Date(2026, 9, 1, 10, 0);
const ctx = (actor: Actor, project: WorkflowProject = projekt): InvoiceContext => ({ project, actor, now: NOW });

function podklad(extra: Partial<InvoiceBasis> = {}): InvoiceBasis {
  return {
    id: 1,
    number: 'FP26001',
    projectNumber: '26001',
    customerName: 'ČEZ Distribuce',
    lines: [{ description: 'Dílčí plnění', quantity: 1, unitPriceNet: 100000 }],
    amountNet: 100000,
    vatRate: 21,
    currency: 'CZK',
    issueDate: new Date(2026, 8, 10),
    dueDate: new Date(2026, 9, 10),
    status: InvoiceStatus.Koncept,
    requestedByName: asistent.displayName,
    requestedByLogin: ASISTENT,
    ...extra
  };
}

describe('kdo smí co', () => {
  it('vystavit smí PM, asistent projektu a vedení; cizí PM ne; na Režii smí role, která objednává', () => {
    expect(canIssueInvoice(projekt, pm)).toBe(true);
    expect(canIssueInvoice(projekt, asistent)).toBe(true);
    expect(canIssueInvoice(projekt, vedeni)).toBe(true);
    expect(canIssueInvoice(projekt, cizi)).toBe(false);
    expect(canIssueInvoice(rezie, admin)).toBe(true);
    expect(canIssueInvoice(rezie, cizi)).toBe(true); // Režii hlídá SharePoint (přístup se přiděluje jednotlivě), role PM stačí
  });
  it('kontrolovat smí PM projektu, vedení a administrátor; asistent ne', () => {
    expect(canCheckInvoice(projekt, pm)).toBe(true);
    expect(canCheckInvoice(projekt, vedeni)).toBe(true);
    expect(canCheckInvoice(projekt, admin)).toBe(true);
    expect(canCheckInvoice(projekt, asistent)).toBe(false);
    expect(canCheckInvoice(projekt, cizi)).toBe(false);
  });
  it('smazat smí jen administrátor', () => {
    expect(canDeleteInvoice(admin)).toBe(true);
    expect(canDeleteInvoice(pm)).toBe(false);
  });
});

describe('cesta podkladu', () => {
  it('asistent: koncept → ke kontrole; předat rovnou nesmí', () => {
    const k = podklad();
    expect(availableInvoiceActions(k, projekt, asistent)).toEqual(['edit', 'submit', 'cancel']);
    expect(submitInvoice(k, ctx(asistent)).status).toBe(InvoiceStatus.KeKontrole);
    expect(() => handOverInvoice(k, ctx(asistent))).toThrow(/zkontrolovat/);
  });

  it('PM nebo vedení vlastní koncept předá účtárně rovnou', () => {
    const k = podklad({ requestedByLogin: PM, requestedByName: pm.displayName });
    expect(availableInvoiceActions(k, projekt, pm)).toEqual(['edit', 'handover', 'cancel']);
    const z = handOverInvoice(k, ctx(pm), { sentTo: 'ucetni@res.cz', pdfUrl: 'https://x/FP.pdf' });
    expect(z.status).toBe(InvoiceStatus.Predano);
    expect(z.handoverDate).toBe(NOW);
    expect(z.auditAction).toBe('Předáno účtárně (ucetni@res.cz)');
  });

  it('po kontrole PM podklad asistenta předá; vrátit musí s komentářem', () => {
    const keKontrole = podklad({ status: InvoiceStatus.KeKontrole });
    expect(availableInvoiceActions(keKontrole, projekt, pm)).toEqual(['handover', 'return', 'cancel']);
    expect(isWaitingForCheck(keKontrole, projekt, pm)).toBe(true);
    expect(isWaitingForCheck(keKontrole, projekt, asistent)).toBe(false);
    expect(() => returnInvoice(keKontrole, '  ', ctx(pm))).toThrow(/co se má opravit/);
    expect(returnInvoice(keKontrole, 'Chybí DUZP', ctx(pm)).status).toBe(InvoiceStatus.Koncept);
    expect(handOverInvoice(keKontrole, ctx(pm)).status).toBe(InvoiceStatus.Predano);
  });

  it('vystavitel může podklad stáhnout zpět do konceptu i bez komentáře', () => {
    const keKontrole = podklad({ status: InvoiceStatus.KeKontrole });
    expect(availableInvoiceActions(keKontrole, projekt, asistent)).toEqual(['return', 'cancel']);
    expect(returnInvoice(keKontrole, '', ctx(asistent)).auditAction).toBe('Staženo zpět do konceptu');
  });

  it('neúplný podklad (bez zákazníka) se nepředá ke kontrole ani účtárně', () => {
    const bez = podklad({ customerName: '' });
    expect(() => submitInvoice(bez, ctx(asistent))).toThrow(/zákazníka/);
    expect(() => handOverInvoice(bez, ctx(pm))).toThrow(/zákazníka/);
  });

  it('číslo faktury a úhrada: vystavitel i finance; bez údaje nejde', () => {
    const predano = podklad({ status: InvoiceStatus.Predano });
    expect(availableInvoiceActions(predano, projekt, finance)).toEqual(['invoiced']);
    expect(() => markInvoiced(predano, ' ', ctx(finance))).toThrow(/číslo faktury/);
    const v = markInvoiced(predano, '2026123', ctx(finance));
    expect(v.status).toBe(InvoiceStatus.Vyfakturovano);
    expect(v.accountingInvoiceNo).toBe('2026123');

    const vyf = podklad({ status: InvoiceStatus.Vyfakturovano, accountingInvoiceNo: '2026123' });
    expect(() => markPaid(vyf, undefined, ctx(finance))).toThrow(/datum úhrady/);
    const u = markPaid(vyf, new Date(2026, 9, 20), ctx(asistent));
    expect(u.status).toBe(InvoiceStatus.Uhrazeno);
    expect(u.paidDate).toEqual(new Date(2026, 9, 20));
  });

  it('cizí člověk nic nezmění', () => {
    expect(availableInvoiceActions(podklad(), projekt, cizi)).toEqual([]);
    expect(() => markInvoiced(podklad({ status: InvoiceStatus.Predano }), '1', ctx(cizi))).toThrow(WorkflowError);
    expect(() => cancelInvoice(podklad(), 'x', ctx(cizi))).toThrow(/nakládat/);
  });

  it('uhrazený a stornovaný podklad se už nemění, jen uhrazený jde poslat znovu', () => {
    expect(availableInvoiceActions(podklad({ status: InvoiceStatus.Storno }), projekt, admin)).toEqual([]);
    expect(availableInvoiceActions(podklad({ status: InvoiceStatus.Uhrazeno }), projekt, admin)).toEqual(['resend']);
    expect(() => cancelInvoice(podklad({ status: InvoiceStatus.Uhrazeno }), 'x', ctx(admin))).toThrow(/už nejde/);
  });

  it('storno vyžaduje důvod; jde před úhradou i po vyfakturování', () => {
    expect(() => cancelInvoice(podklad(), ' ', ctx(asistent))).toThrow(/důvod/);
    expect(cancelInvoice(podklad({ status: InvoiceStatus.Vyfakturovano }), 'Chybná faktura', ctx(pm)).cancelReason).toBe('Chybná faktura');
  });

  it('opakované předání účtárně nemění stav; jen v předaných stavech', () => {
    const predano = podklad({ status: InvoiceStatus.Predano, handoverDate: NOW });
    const z = resendInvoice(predano, ctx(asistent), { sentTo: 'jina@res.cz' });
    expect(z.status).toBe(InvoiceStatus.Predano);
    expect(z.auditAction).toBe('Posláno účtárně znovu (jina@res.cz)');
    expect(() => resendInvoice(podklad(), ctx(asistent))).toThrow(WorkflowError);
  });

  it('editovat jde jen koncept', () => {
    expect(canEditInvoice(podklad(), projekt, asistent)).toBe(true);
    expect(canEditInvoice(podklad({ status: InvoiceStatus.KeKontrole }), projekt, asistent)).toBe(false);
  });

  it('applyInvoiceChange přenese změny a zachová ostatní údaje', () => {
    const predano = podklad({ status: InvoiceStatus.Predano });
    const po = applyInvoiceChange(predano, markInvoiced(predano, 'F1', ctx(pm)), NOW);
    expect(po.status).toBe(InvoiceStatus.Vyfakturovano);
    expect(po.accountingInvoiceNo).toBe('F1');
    expect(po.customerName).toBe('ČEZ Distribuce');
    expect(po.modified).toBe(NOW);
  });
});
