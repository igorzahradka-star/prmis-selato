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

import { DEFAULT_PHOTO_SETTINGS, DEFAULT_SETTINGS, validateSettings, withDefaults } from './settings';

describe('nastavení fotek', () => {
  it('výchozí zmenšení 2000 bodů a kvalita 85 %; staré nastavení bez fotek se doplní', () => {
    expect(DEFAULT_PHOTO_SETTINGS).toEqual({ maxSide: 2000, quality: 85 });
    expect(withDefaults({}).photos).toEqual({ maxSide: 2000, quality: 85 });
    expect(withDefaults({ photos: { maxSide: 1600, quality: 80 } }).photos).toEqual({ maxSide: 1600, quality: 80 });
  });

  it('kontrola mezí', () => {
    expect(validateSettings({ ...DEFAULT_SETTINGS, photos: { maxSide: 100, quality: 85 } }).some((p) => /rozměr/.test(p))).toBe(true);
    expect(validateSettings({ ...DEFAULT_SETTINGS, photos: { maxSide: 2000, quality: 20 } }).some((p) => /Kvalita/.test(p))).toBe(true);
    expect(validateSettings(DEFAULT_SETTINGS).some((p) => /fotky/i.test(p))).toBe(false);
  });
});
