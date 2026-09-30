import {
  approvalRecipients,
  approvalRequestMail,
  decisionMail,
  emailFromLogin,
  orderLink,
  requesterRecipient
} from './orderNotify';
import { OrderStatus, PurchaseOrder } from './orders';
import { WorkflowProject } from './orderWorkflow';
import { Role } from './types';
import { RoleMembership } from './userAdmin';

const PM = 'i:0#.f|membership|pm@revoltum.cz';
const ANNA = 'i:0#.f|membership|anna@revoltum.cz';
const VIKTOR = 'i:0#.f|membership|viktor@revoltum.cz';
const VERA = 'i:0#.f|membership|vera@revoltum.cz';

const projekt: WorkflowProject = {
  projectNumber: '25003',
  projectManagerLogin: PM,
  projectManagerName: 'Petr Manažer',
  isOverhead: false
};

const cleny: RoleMembership[] = [
  {
    role: Role.Vedeni,
    groupName: 'PRM Vedení',
    groupExists: true,
    members: [
      { id: 1, loginName: VIKTOR, displayName: 'Viktor Vedení', email: 'viktor@revoltum.cz' },
      { id: 2, loginName: VERA, displayName: 'Vera Vedení', email: 'vera@revoltum.cz' }
    ]
  },
  {
    role: Role.Jednatel,
    groupName: 'PRM Jednatelé',
    groupExists: true,
    members: [{ id: 3, loginName: 'i:0#.f|membership|jednatel@revoltum.cz', displayName: 'Jan Jednatel' }]
  }
];

function objednavka(extra: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 7,
    orderNumber: 'OBJ-2026-0007',
    projectNumber: '25003',
    subject: 'Střídače',
    lines: [],
    amountNet: 1000,
    vatRate: 21,
    currency: 'CZK',
    status: OrderStatus.KeSchvaleni,
    requestedByName: 'Anna Asistentka',
    requestedByLogin: ANNA,
    approvalChain: [{ level: 'vedeni', approved: false }],
    currentApprovalLevel: 'vedeni',
    ...extra
  };
}

describe('emailFromLogin', () => {
  it('vytáhne e-mail z přihlašovacího jména Microsoftu 365', () => {
    expect(emailFromLogin(PM)).toBe('pm@revoltum.cz');
  });
  it('u skupin a hostů vrátí undefined', () => {
    expect(emailFromLogin('c:0t.c|tenant|abc-def')).toBeUndefined();
    expect(emailFromLogin('i:0#.f|membership|host_firma.cz#ext#@revoltum.onmicrosoft.com')).toBeUndefined();
    expect(emailFromLogin(undefined)).toBeUndefined();
  });
});

describe('approvalRecipients', () => {
  it('bez přiřazeného schvalovatele dostanou upozornění všichni z role vedení', () => {
    const r = approvalRecipients(objednavka(), projekt, cleny);
    expect(r.map((x) => x.email)).toEqual(['viktor@revoltum.cz', 'vera@revoltum.cz']);
  });

  it('s přiřazeným schvalovatelem dostane upozornění jen on', () => {
    const o = objednavka({ approvalChain: [{ level: 'vedeni', approved: false, assignedLogin: VERA, assignedName: 'Vera Vedení' }] });
    expect(approvalRecipients(o, projekt, cleny).map((x) => x.email)).toEqual(['vera@revoltum.cz']);
  });

  it('krok PM jde projektovému manažerovi (e-mail z přihlašovacího jména)', () => {
    const o = objednavka({ approvalChain: [{ level: 'pm', approved: false }], currentApprovalLevel: 'pm' });
    const r = approvalRecipients(o, projekt, cleny);
    expect(r).toEqual([{ email: 'pm@revoltum.cz', name: 'Petr Manažer' }]);
  });

  it('u jednatele použije e-mail z přihlašovacího jména, když ho skupina nezná', () => {
    const o = objednavka({ approvalChain: [{ level: 'jednatel', approved: false }], currentApprovalLevel: 'jednatel' });
    expect(approvalRecipients(o, projekt, cleny).map((x) => x.email)).toEqual(['jednatel@revoltum.cz']);
  });

  it('bere první nevyřízený krok, ne už schválený', () => {
    const o = objednavka({
      approvalChain: [
        { level: 'pm', approved: true, byLogin: PM, byName: 'Petr Manažer' },
        { level: 'vedeni', approved: false, assignedLogin: VIKTOR, assignedName: 'Viktor Vedení' }
      ]
    });
    expect(approvalRecipients(o, projekt, cleny).map((x) => x.email)).toEqual(['viktor@revoltum.cz']);
  });

  it('vystavitele neupozorňuje na jeho vlastní objednávku', () => {
    const o = objednavka({ requestedByLogin: VIKTOR });
    expect(approvalRecipients(o, projekt, cleny).map((x) => x.email)).toEqual(['vera@revoltum.cz']);
  });

  it('mimo stav Ke schválení nikomu nic neposílá', () => {
    expect(approvalRecipients(objednavka({ status: OrderStatus.Schvaleno }), projekt, cleny)).toEqual([]);
  });
});

describe('requesterRecipient, orderLink a texty', () => {
  it('vystavitel dostane zprávu na e-mail z přihlašovacího jména', () => {
    expect(requesterRecipient(objednavka(), cleny)).toEqual({ email: 'anna@revoltum.cz', name: 'Anna Asistentka' });
  });

  it('odkaz míří přímo na objednávku a nahradí starý hash', () => {
    expect(orderLink('https://x.sharepoint.com/sites/a/SitePages/PRM.aspx#/projekty', 'ceka-na-me', 7)).toBe(
      'https://x.sharepoint.com/sites/a/SitePages/PRM.aspx#/ceka-na-me/7'
    );
  });

  it('e-mail schvalovateli obsahuje číslo, částku, vystavitele a odkaz', () => {
    const m = approvalRequestMail({
      orderNumber: 'OBJ-2026-0007',
      projectNumber: '25003',
      projectName: 'BESS',
      subject: 'Střídače',
      supplierName: 'Memodo',
      amountText: '66 030 €',
      requesterName: 'Anna Asistentka',
      level: 'vedeni',
      link: 'https://x/PRM.aspx#/ceka-na-me/7',
      companyName: 'RES a.s.'
    });
    expect(m.subject).toContain('OBJ-2026-0007');
    expect(m.body).toContain('66 030 €');
    expect(m.body).toContain('Anna Asistentka');
    expect(m.body).toContain('https://x/PRM.aspx#/ceka-na-me/7');
  });

  it('e-mail vystaviteli řekne výsledek a komentář', () => {
    const m = decisionMail({
      orderNumber: 'OBJ-2026-0007',
      subject: 'Střídače',
      outcome: 'vraceno',
      decidedBy: 'Viktor Vedení',
      comment: 'Chybí cena dopravy',
      link: 'https://x/#/objednavky/7',
      companyName: 'RES a.s.'
    });
    expect(m.subject).toBe('Objednávka OBJ-2026-0007 vrácena k úpravě');
    expect(m.body).toContain('Chybí cena dopravy');
  });
});
