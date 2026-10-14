import { createMockRepositories } from './mock/mockRepositories';
import { Role } from '../core/types';
import { canSeeOverhead, isReaderOnly } from '../core/roles';
import { withRoleGuards } from './roleGuards';

jest.setTimeout(30000);

describe('role: Režie a čtenář', () => {
  it('Režii smí vidět jen vedení, jednatel, finance a administrátor', () => {
    expect([Role.Administrator, Role.Vedeni, Role.Jednatel, Role.Finance].map((r) => canSeeOverhead([r]))).toEqual([true, true, true, true]);
    expect([Role.ProjektovyManazer, Role.AsistentPM, Role.Ctenar, Role.SpravceServisu, Role.Dispecer].map((r) => canSeeOverhead([r]))).toEqual([false, false, false, false, false]);
  });

  it('čtenář je jen ten, kdo nemá žádnou jinou roli', () => {
    expect(isReaderOnly([Role.Ctenar])).toBe(true);
    expect(isReaderOnly([Role.Ctenar, Role.ProjektovyManazer])).toBe(false);
    expect(isReaderOnly([])).toBe(false);
  });

  it('bez práva na Režii ji seznam projektů ani detail nevrátí', async () => {
    const repos = createMockRepositories();
    const all = await repos.projects.list({ includeOverhead: true });
    const overhead = all.filter((p) => p.isOverhead);
    expect(overhead.length).toBeGreaterThan(0);

    const guarded = withRoleGuards(repos, { hideOverhead: true });
    const listed = await guarded.projects.list({ includeOverhead: true });
    expect(listed.some((p) => p.isOverhead)).toBe(false);
    expect(listed.length).toBe(all.length - overhead.length);
    expect(await guarded.projects.getByNumber(overhead[0].projectNumber)).toBeUndefined();
    const normal = all.filter((p) => !p.isOverhead)[0];
    expect((await guarded.projects.getByNumber(normal.projectNumber))?.projectNumber).toBe(normal.projectNumber);
  });

  it('s právem na Režii se vrací původní sada', async () => {
    const repos = createMockRepositories();
    expect(withRoleGuards(repos, { hideOverhead: false })).toBe(repos);
  });
});
