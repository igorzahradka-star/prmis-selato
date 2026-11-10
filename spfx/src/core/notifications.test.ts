import { DEFAULT_NOTIFICATION_PREFS, roleRecipients, serviceJobToCheckMail, serviceRequestMail, budgetApprovalMail, budgetApprovalRecipients, budgetDecisionMail, budgetRequesterRecipient, prefsFromJson, prefsToJson, splitByPrefs } from './notifications';
import { Role } from './types';
import { RoleMembership } from './userAdmin';

const clen = (email: string, displayName: string): { loginName: string; displayName: string; email: string } => ({ loginName: `i:0#.f|membership|${email}`, displayName, email });
const M = (role: Role, ...members: ReturnType<typeof clen>[]): RoleMembership => ({ role, members } as unknown as RoleMembership);
const memberships: RoleMembership[] = [
  M(Role.Vedeni, clen('anna@selato.cz', 'Anna Vedení'), clen('igor@selato.cz', 'Igor Zahrádka')),
  M(Role.Administrator, clen('igor@selato.cz', 'Igor Zahrádka'), clen('adam@selato.cz', 'Adam Admin')),
  M(Role.ProjektovyManazer, clen('petr@selato.cz', 'Petr Manažer'))
];

describe('nastavení upozornění', () => {
  it('bez uloženého nebo nečitelného nastavení je vše zapnuto', () => {
    expect(prefsFromJson(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(prefsFromJson('')).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(prefsFromJson('{rozbité')).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(prefsFromJson('[]')).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });
  it('vypnutou skupinu si pamatuje, druhá zůstane zapnutá', () => {
    expect(prefsFromJson(prefsToJson({ approvals: false, results: true }))).toEqual({ approvals: false, results: true });
    expect(prefsFromJson('{"results":false}')).toEqual({ approvals: true, results: false });
  });
  it('e-mail dostane jen ten, kdo si danou skupinu nevypnul (podle e-mailu bez ohledu na velikost písmen)', () => {
    const r = [
      { email: 'Anna@Selato.cz', name: 'Anna' },
      { email: 'petr@selato.cz', name: 'Petr' },
      { email: 'neznamy@selato.cz', name: 'Neznámý' }
    ];
    const prefs = { 'anna@selato.cz': { approvals: false, results: true }, 'petr@selato.cz': { approvals: true, results: false } };
    expect(splitByPrefs(r, prefs, 'approvals').send.map((x) => x.name)).toEqual(['Petr', 'Neznámý']);
    expect(splitByPrefs(r, prefs, 'approvals').muted.map((x) => x.name)).toEqual(['Anna']);
    expect(splitByPrefs(r, prefs, 'results').send.map((x) => x.name)).toEqual(['Anna', 'Neznámý']);
  });
});

describe('upozornění v Servisu', () => {
  const m: RoleMembership[] = [M(Role.SpravceServisu, clen('sara@selato.cz', 'Sára Správce'), clen('karel@selato.cz', 'Karel Správce')), M(Role.Dispecer, clen('david@selato.cz', 'David Dispečer'))];
  it('příjemci z role bez toho, kdo akci provedl', () => {
    expect(roleRecipients(Role.SpravceServisu, m).map((x) => x.email)).toEqual(['sara@selato.cz', 'karel@selato.cz']);
    expect(roleRecipients(Role.SpravceServisu, m, 'i:0#.f|membership|sara@selato.cz').map((x) => x.email)).toEqual(['karel@selato.cz']);
    expect(roleRecipients(Role.Dispecer, m).map((x) => x.name)).toEqual(['David Dispečer']);
  });
  it('texty e-mailů: nový požadavek a servisní list ke kontrole', () => {
    const a = serviceRequestMail({ number: 'SPO-2026-0003', title: 'Výpadek střídače', siteName: '10500 Mastířovice', deviceName: '10501 FVE', priority: 'Vysoká', receivedBy: 'David', link: 'https://x/#/servis', companyName: 'RES' });
    expect(a.subject).toContain('SPO-2026-0003');
    expect(a.body).toContain('Vysoká');
    expect(a.body).toContain('Můj profil');
    const b = serviceJobToCheckMail({ number: 'SL-2026-0001', title: 'Oprava', deviceName: '10501 FVE', supplierName: 'Servis s.r.o.', reportedBy: 'David', link: 'https://x', companyName: 'RES' });
    expect(b.subject).toContain('Ke kontrole');
    expect(b.body).toContain('Servis s.r.o.');
  });
});

describe('upozornění k rozpočtu', () => {
  it('bez vybraného schvalovatele dostane e-mail vedení i administrátoři, žadatel ne, bez opakování', () => {
    const r = budgetApprovalRecipients(undefined, undefined, 'i:0#.f|membership|igor@selato.cz', memberships);
    expect(r.map((x) => x.email).sort()).toEqual(['adam@selato.cz', 'anna@selato.cz']);
  });
  it('s vybraným schvalovatelem dostane e-mail jen on', () => {
    const r = budgetApprovalRecipients('i:0#.f|membership|anna@selato.cz', 'Anna Vedení', 'i:0#.f|membership|petr@selato.cz', memberships);
    expect(r.map((x) => x.email)).toEqual(['anna@selato.cz']);
  });
  it('žadatele najde podle jména; jinak použije projektového manažera', () => {
    const byName = budgetRequesterRecipient('Petr Manažer', undefined, undefined, memberships);
    expect(byName && byName.email).toBe('petr@selato.cz');
    const byPm = budgetRequesterRecipient('Někdo cizí', 'i:0#.f|membership|petr@selato.cz', 'Petr Manažer', memberships);
    expect(byPm && byPm.email).toBe('petr@selato.cz');
    expect(budgetRequesterRecipient(undefined, undefined, undefined, memberships)).toBeUndefined();
  });
  it('texty e-mailů obsahují projekt, odkaz a zmínku o vypnutí', () => {
    const a = budgetApprovalMail({ projectNumber: '26005', projectName: 'Mastířovice', requesterName: 'Petr', summary: ['Plán nákupu: 1 Kč'], link: 'https://x/#/projekt/26005', companyName: 'RES' });
    expect(a.subject).toContain('26005');
    expect(a.body).toContain('https://x/#/projekt/26005');
    expect(a.body).toContain('Můj profil');
    const d = budgetDecisionMail({ projectNumber: '26005', outcome: 'vraceno', decidedBy: 'Anna', comment: 'Doplnit marži', link: 'https://x', companyName: 'RES' });
    expect(d.subject).toContain('vrácen');
    expect(d.body).toContain('Doplnit marži');
  });
});
