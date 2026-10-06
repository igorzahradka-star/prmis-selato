import { createMockRepositories } from './mockRepositories';
import { PartnerType, Role } from '../../core/types';

jest.setTimeout(30000);

const base = { name: 'Nová firma s.r.o.', partnerType: PartnerType.Dodavatel, isVatPayer: false, isActive: true };

describe('Partneři — kontrola duplicit a mazání (mock)', () => {
  it('stejné IČO ve stejné zemi se neuloží (ani při úpravě jiného partnera); jiná země ano; podobné jméno repozitář nebrání', async () => {
    const r = createMockRepositories();
    const existing = (await r.partners.list({ includeInactive: true }))[0];
    expect(existing.ico).toBeTruthy();
    await expect(r.partners.create({ ...base, ico: existing.ico, country: existing.country })).rejects.toThrow(/stejným IČO/);
    const created = await r.partners.create({ ...base, ico: '12345678', country: 'CZ' });
    await expect(r.partners.update(created.id, { ...base, ico: existing.ico, country: existing.country })).rejects.toThrow(/stejným IČO/);
    await expect(r.partners.update(created.id, { ...base, ico: '12345678', country: 'CZ', phone: '123' })).resolves.toBeUndefined();
    await expect(r.partners.create({ ...base, name: 'Jiná firma', ico: '12345678', country: 'SK' })).resolves.toBeDefined();
    await expect(r.partners.create({ ...base, name: existing.name })).resolves.toBeDefined();
  });

  it('mazání: nepoužitý partner se smaže, použitý ne; smí jen vedení a administrátor', async () => {
    const r = createMockRepositories();
    const admin = await r.users.getCurrentUser(await r.settings.get());
    const pm = { ...admin, roles: [Role.ProjektovyManazer] };
    const fresh = await r.partners.create({ ...base, ico: '87654321' });
    expect(await r.partners.usage(fresh.id)).toEqual({ projects: 0, orders: 0, invoices: 0, cases: 0 });
    await expect(r.partners.remove(fresh.id, pm)).rejects.toThrow(/vedení a administrátor/);
    await r.partners.remove(fresh.id, admin);
    expect(await r.partners.getById(fresh.id)).toBeUndefined();

    const projects = await r.projects.list({ includeOverhead: true });
    const customer = (await r.partners.list({ includeInactive: true })).filter((p) => projects.some((x) => x.customerName === p.name))[0];
    expect(customer).toBeDefined();
    expect((await r.partners.usage(customer.id)).projects).toBeGreaterThan(0);
    await expect(r.partners.remove(customer.id, admin)).rejects.toThrow(/je použit/);
    expect(await r.partners.getById(customer.id)).toBeDefined();
  });
});
