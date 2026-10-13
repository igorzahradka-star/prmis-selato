import { DEFAULT_NOTIFICATION_PREFS, budgetApprovalMail, budgetApprovalRecipients, budgetDecisionMail, budgetRequesterRecipient, prefsFromJson, prefsToJson, splitByPrefs } from './notifications';
import { Role } from './types';
import { RoleMembership } from './userAdmin';

const clen = (email: string, displayName: string): { loginName: string; displayName: string; email: string } => ({ loginName: `i:0#.f|membership|${email}`, displayName, email });
const M = (role: Role, ...members: ReturnType<typeof clen>[]): RoleMembership => ({ role, members } as unknown as RoleMembership);
const memberships: RoleMembership[] = [
  M(Role.Vedeni, clen('anna@revoltum.cz', 'Anna Vedení'), clen('igor@revoltum.cz', 'Igor Zahrádka')),
  M(Role.Administrator, clen('igor@revoltum.cz', 'Igor Zahrádka'), clen('adam@revoltum.cz', 'Adam Admin')),
  M(Role.ProjektovyManazer, clen('petr@revoltum.cz', 'Petr Manažer'))
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
      { email: 'Anna@Revoltum.cz', name: 'Anna' },
      { email: 'petr@revoltum.cz', name: 'Petr' },
      { email: 'neznamy@revoltum.cz', name: 'Neznámý' }
    ];
    const prefs = { 'anna@revoltum.cz': { approvals: false, results: true }, 'petr@revoltum.cz': { approvals: true, results: false } };
    expect(splitByPrefs(r, prefs, 'approvals').send.map((x) => x.name)).toEqual(['Petr', 'Neznámý']);
    expect(splitByPrefs(r, prefs, 'approvals').muted.map((x) => x.name)).toEqual(['Anna']);
    expect(splitByPrefs(r, prefs, 'results').send.map((x) => x.name)).toEqual(['Anna', 'Neznámý']);
  });
});

describe('upozornění k rozpočtu', () => {
  it('bez vybraného schvalovatele dostane e-mail vedení i administrátoři, žadatel ne, bez opakování', () => {
    const r = budgetApprovalRecipients(undefined, undefined, 'i:0#.f|membership|igor@revoltum.cz', memberships);
    expect(r.map((x) => x.email).sort()).toEqual(['adam@revoltum.cz', 'anna@revoltum.cz']);
  });
  it('s vybraným schvalovatelem dostane e-mail jen on', () => {
    const r = budgetApprovalRecipients('i:0#.f|membership|anna@revoltum.cz', 'Anna Vedení', 'i:0#.f|membership|petr@revoltum.cz', memberships);
    expect(r.map((x) => x.email)).toEqual(['anna@revoltum.cz']);
  });
  it('žadatele najde podle jména; jinak použije projektového manažera', () => {
    const byName = budgetRequesterRecipient('Petr Manažer', undefined, undefined, memberships);
    expect(byName && byName.email).toBe('petr@revoltum.cz');
    const byPm = budgetRequesterRecipient('Někdo cizí', 'i:0#.f|membership|petr@revoltum.cz', 'Petr Manažer', memberships);
    expect(byPm && byPm.email).toBe('petr@revoltum.cz');
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
