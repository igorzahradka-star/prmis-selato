import { NO_USAGE, canDeletePartner, describeUsage, usageTotal } from './partnerDelete';
import { Role } from './types';

describe('mazání partnerů', () => {
  it('smí vedení a administrátor, ostatní ne', () => {
    expect(canDeletePartner([Role.Administrator])).toBe(true);
    expect(canDeletePartner([Role.Vedeni])).toBe(true);
    expect(canDeletePartner([Role.ProjektovyManazer, Role.Finance])).toBe(false);
  });

  it('použitý partner: součet a věta o tom, kde je použit (včetně případů RES CRM)', () => {
    expect(usageTotal(NO_USAGE)).toBe(0);
    expect(describeUsage(NO_USAGE)).toBe('');
    const u = { projects: 1, orders: 3, invoices: 5, cases: 2 };
    expect(usageTotal(u)).toBe(11);
    expect(describeUsage(u)).toBe('1 projekt (jako zákazník), 3 objednávky (jako dodavatel), 5 podkladů pro fakturaci, 2 obchodní případy v RES CRM');
  });
});
