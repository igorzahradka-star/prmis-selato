import { DraftStorage, DRAFT_MAX_AGE_DAYS, clearDraft, differsFromBase, draftKey, loadDraft, parseDraft, saveDraft, stringifyDraft } from './drafts';

function memory(): DraftStorage & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    }
  };
}

describe('rozepsané formuláře (koncepty)', () => {
  it('klíč je pro uživatele, druh formuláře a záznam; podivné znaky se očistí', () => {
    expect(draftKey('i:0#.f|membership|Igor@revoltum.cz', 'order', 12)).toBe('prm.draft.v1.i_0_.f_membership_igor@revoltum.cz.order.12');
    expect(draftKey('', 'entry', 'new-26001-zapis')).toBe('prm.draft.v1.anonym.entry.new-26001-zapis');
  });

  it('uloží a načte koncept včetně dat (Date se vrátí jako Date)', () => {
    const s = memory();
    const k = draftKey('igor', 'order', 'new');
    saveDraft(s, k, { subject: 'Kabel', delivery: new Date(2026, 9, 15, 10, 30), lines: [{ q: '2' }] }, 1000);
    const d = loadDraft<{ subject: string; delivery: Date; lines: { q: string }[] }>(s, k, 2000);
    expect(d?.savedAt).toBe(1000);
    expect(d?.data.subject).toBe('Kabel');
    expect(d?.data.delivery instanceof Date).toBe(true);
    expect(d?.data.delivery.getTime()).toBe(new Date(2026, 9, 15, 10, 30).getTime());
    expect(d?.data.lines).toEqual([{ q: '2' }]);
  });

  it('starší než 14 dní se zahodí i smaže; poškozený nebo chybějící koncept je prostě žádný', () => {
    const s = memory();
    saveDraft(s, 'k', { a: 1 }, 0);
    expect(loadDraft(s, 'k', (DRAFT_MAX_AGE_DAYS - 1) * 86400000)).toBeDefined();
    expect(loadDraft(s, 'k', (DRAFT_MAX_AGE_DAYS + 1) * 86400000)).toBeUndefined();
    expect('k' in s.data).toBe(false);
    s.data.rozbity = '{nejde';
    expect(loadDraft(s, 'rozbity')).toBeUndefined();
    expect(loadDraft(s, 'neni')).toBeUndefined();
  });

  it('smazání konceptu; bez úložiště nic nespadne', () => {
    const s = memory();
    saveDraft(s, 'k', { a: 1 });
    clearDraft(s, 'k');
    expect(loadDraft(s, 'k')).toBeUndefined();
    expect(() => {
      saveDraft(undefined, 'k', 1);
      clearDraft(undefined, 'k');
    }).not.toThrow();
    expect(loadDraft(undefined, 'k')).toBeUndefined();
  });

  it('plné nebo zakázané úložiště práci nezastaví', () => {
    const plne: DraftStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined
    };
    expect(() => saveDraft(plne, 'k', { a: 1 })).not.toThrow();
  });

  it('shoda s výchozím stavem: nezměněný formulář se nenabízí k obnovení', () => {
    const base = { a: 1, d: new Date(2026, 9, 1) };
    expect(differsFromBase(base, parseDraft(stringifyDraft(base)))).toBe(false);
    expect(differsFromBase(base, { ...base, a: 2 })).toBe(true);
  });
});
