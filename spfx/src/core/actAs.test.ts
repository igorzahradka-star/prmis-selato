import { Role } from './types';
import { actingUser, canActAs } from './roles';

const admin = { roles: [Role.Administrator], isSiteAdmin: true, hasFinanceAccess: true };
const pm = { roles: [Role.ProjektovyManazer], isSiteAdmin: false, hasFinanceAccess: false };

describe('zobrazit jako (zkoušení rolí)', () => {
  it('smí jen administrátor', () => {
    expect(canActAs(admin)).toBe(true);
    expect(canActAs(pm)).toBe(false);
  });

  it('administrátor se přepne na zvolenou roli a ztratí práva správce webu', () => {
    const u = actingUser(admin, [Role.Dispecer]);
    expect(u.roles).toEqual([Role.Dispecer]);
    expect(u.isSiteAdmin).toBe(false);
    expect(u.hasFinanceAccess).toBe(false);
  });

  it('přístup k financím zůstane jen při zkoušení role Finance', () => {
    expect(actingUser(admin, [Role.Finance]).hasFinanceAccess).toBe(true);
  });

  it('bez volby se vrací skutečný uživatel; neadministrátor se přepnout nedá', () => {
    expect(actingUser(admin, undefined)).toBe(admin);
    expect(actingUser(admin, [])).toBe(admin);
    expect(actingUser(pm, [Role.Administrator])).toBe(pm);
  });
});
