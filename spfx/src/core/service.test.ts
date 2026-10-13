import { Role } from './types';
import { resolveRoles, DEFAULT_ROLE_GROUPS } from './roles';
import {
  canAdministerService,
  canViewService,
  canWorkInService,
  contractState,
  isDeviceNumber,
  hiddenServiceNumbers,
  isServiceProject,
  isSiteNumber,
  nextDeviceNumber,
  nextSiteNumber,
  serviceFolderPath,
  siteNumberOfDevice,
  validateDeviceNumber,
  validateSiteNumber
} from './service';

describe('číslování Servisu', () => {
  it('lokalita je pětimístné číslo dělitelné deseti, zařízení ne', () => {
    expect(['10500', '10510', '10520'].map(isSiteNumber)).toEqual([true, true, true]);
    expect(['10501', '1050', '105000', 'abcde', '10515'].map(isSiteNumber)).toEqual([false, false, false, false, false]);
    expect(['10501', '10509', '10513'].map(isDeviceNumber)).toEqual([true, true, true]);
    expect(['10500', '10510', '1051'].map(isDeviceNumber)).toEqual([false, false, false]);
    expect(siteNumberOfDevice('10513')).toBe('10510');
    expect(siteNumberOfDevice('10501')).toBe('10500');
  });

  it('další lokalita po desítkách, první je 10500', () => {
    expect(nextSiteNumber([])).toBe('10500');
    expect(nextSiteNumber(['10500'])).toBe('10510');
    expect(nextSiteNumber(['10500', '10530', '10510'])).toBe('10540');
    expect(nextSiteNumber(['10501', 'xyz'])).toBe('10500'); // čísla zařízení se nepočítají
  });

  it('další zařízení v rozsahu lokality; plný rozsah vrátí undefined', () => {
    expect(nextDeviceNumber('10500', [])).toBe('10501');
    expect(nextDeviceNumber('10510', ['10511', '10512'])).toBe('10513');
    expect(nextDeviceNumber('10510', ['10511', '10513'])).toBe('10512'); // vyplní mezeru
    expect(nextDeviceNumber('10510', ['10511', '10512', '10513', '10514', '10515', '10516', '10517', '10518', '10519'])).toBeUndefined();
  });

  it('kontrola čísla lokality: formát a duplicita; vlastní číslo při úpravě projde', () => {
    expect(validateSiteNumber('10510', ['10500'])).toBe('');
    expect(validateSiteNumber('10515', [])).toMatch(/dělitelné deseti/);
    expect(validateSiteNumber('10500', ['10500'])).toMatch(/už existuje/);
    expect(validateSiteNumber('10500', ['10500'], '10500')).toBe('');
  });

  it('kontrola čísla zařízení: duplicita je chyba, mimo rozsah jen upozornění', () => {
    expect(validateDeviceNumber('10511', '10510', [])).toEqual({ error: '', warning: '' });
    expect(validateDeviceNumber('10511', '10510', ['10511']).error).toMatch(/už existuje/);
    expect(validateDeviceNumber('10520', '10510', []).error).toMatch(/nesmí být dělitelné deseti/);
    const out = validateDeviceNumber('10523', '10510', []);
    expect(out.error).toBe('');
    expect(out.warning).toMatch(/mimo rozsah lokality 10510/);
  });
});

describe('práva Servisu', () => {
  it('Servis vidí správce, dispečer, administrátor a vedení; běžný PM, asistent a čtenář ne', () => {
    expect([Role.SpravceServisu, Role.Dispecer, Role.Administrator, Role.Vedeni].map((r) => canViewService([r]))).toEqual([true, true, true, true]);
    expect([Role.ProjektovyManazer, Role.AsistentPM, Role.Ctenar, Role.Finance, Role.Jednatel].map((r) => canViewService([r]))).toEqual([false, false, false, false, false]);
  });
  it('pracovat smí správce, dispečer a administrátor; vedení jen čte', () => {
    expect([Role.SpravceServisu, Role.Dispecer, Role.Administrator].map((r) => canWorkInService([r]))).toEqual([true, true, true]);
    expect(canWorkInService([Role.Vedeni])).toBe(false);
  });
  it('lokality, zařízení, kontrolu a fakturaci spravuje jen správce servisu a administrátor, ne dispečer', () => {
    expect(canAdministerService([Role.SpravceServisu])).toBe(true);
    expect(canAdministerService([Role.Administrator])).toBe(true);
    expect(canAdministerService([Role.Dispecer])).toBe(false);
    expect(canAdministerService([Role.Vedeni])).toBe(false);
  });
  it('role se poznají podle SharePoint skupin', () => {
    const roles = resolveRoles(['PRM Správci servisu', 'PRM Dispečeři servisu'], DEFAULT_ROLE_GROUPS, false);
    expect(roles).toEqual(expect.arrayContaining([Role.SpravceServisu, Role.Dispecer]));
  });
  it('servisní projekt se pozná podle typu', () => {
    expect(isServiceProject({ projectType: 'Servis' })).toBe(true);
    expect(isServiceProject({ projectType: 'FVE' })).toBe(false);
    expect(isServiceProject({})).toBe(false);
  });
});

describe('skrytí servisních záznamů', () => {
  const projekty = [{ projectNumber: '26001', projectType: 'FVE' }, { projectNumber: '10501', projectType: 'Servis' }];
  it('uživatel bez práv Servisu servisní projekty nevidí, správce a administrátor ano', () => {
    expect(Array.from(hiddenServiceNumbers(projekty, [Role.ProjektovyManazer]))).toEqual(['10501']);
    expect(hiddenServiceNumbers(projekty, [Role.SpravceServisu]).size).toBe(0);
    expect(hiddenServiceNumbers(projekty, [Role.Administrator]).size).toBe(0);
  });
});

describe('složky Servisu', () => {
  it('lokalita a zařízení pod kořenem Servisu', () => {
    expect(serviceFolderPath('General/02_SERVIS', { number: '10500', name: 'Mastířovice' })).toBe('General/02_SERVIS/10500 - Mastířovice');
    expect(serviceFolderPath('General/02_SERVIS', { number: '10500', name: 'Mastířovice' }, { number: '10501', name: 'Mastířovice I. FVE' })).toBe('General/02_SERVIS/10500 - Mastířovice/10501 - Mastířovice I. FVE');
  });
});

describe('servisní smlouva zařízení', () => {
  const today = new Date(2026, 9, 14);
  it('bez údajů, platí, brzy končí, vypršela', () => {
    expect(contractState({}, today)).toBe('bez');
    expect(contractState({ contractUrl: 'https://x' }, today)).toBe('platna');
    expect(contractState({ contractFrom: new Date(2026, 0, 1), contractTo: new Date(2027, 11, 31) }, today)).toBe('platna');
    expect(contractState({ contractTo: new Date(2026, 10, 20) }, today)).toBe('konci');
    expect(contractState({ contractTo: new Date(2026, 9, 13) }, today)).toBe('vyprsela');
    expect(contractState({ contractTo: new Date(2026, 9, 14) }, today)).toBe('konci'); // platí do konce dne
  });
});
