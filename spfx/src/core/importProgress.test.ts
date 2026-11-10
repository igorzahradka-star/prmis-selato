import { importOutcome, importProgressFraction, importProgressLabel } from './importProgress';

describe('importProgressFraction', () => {
  test('záznamy = neurčitý ukazatel', () => {
    expect(importProgressFraction({ phase: 'records', done: 0, total: 20 })).toBeUndefined();
  });
  test('složky = podíl hotových', () => {
    expect(importProgressFraction({ phase: 'folders', done: 5, total: 20 })).toBe(0.25);
    expect(importProgressFraction({ phase: 'folders', done: 20, total: 20 })).toBe(1);
  });
  test('meze a nula projektů', () => {
    expect(importProgressFraction({ phase: 'folders', done: 25, total: 20 })).toBe(1);
    expect(importProgressFraction({ phase: 'folders', done: 0, total: 0 })).toBeUndefined();
  });
});

describe('importProgressLabel', () => {
  test('fáze záznamů', () => {
    expect(importProgressLabel({ phase: 'records', done: 0, total: 20 })).toBe('Zakládám záznamy projektů (20)…');
  });
  test('hotovo x z y a právě zpracovávaný projekt', () => {
    expect(importProgressLabel({ phase: 'folders', done: 4, total: 20, current: '25ZA00031' })).toBe(
      'Zakládám složky podle šablony: hotovo 4 z 20 · teď 25ZA00031'
    );
  });
  test('na konci bez „teď“', () => {
    expect(importProgressLabel({ phase: 'folders', done: 20, total: 20, current: '25ZA00040' })).toBe('Zakládám složky podle šablony: hotovo 20 z 20');
  });
});

describe('importOutcome', () => {
  test('vše v pořádku (ze seznamu)', () => {
    expect(importOutcome(20, 0, 0, true)).toEqual({ kind: 'success', headline: 'Import dokončen: naimportováno 20 projektů, složky založeny u 20.' });
  });
  test('z knihovny se složky nepočítají', () => {
    expect(importOutcome(3, 0, 0, false)).toEqual({ kind: 'success', headline: 'Import dokončen: naimportováno 3 projekty.' });
  });
  test('část složek selhala', () => {
    const o = importOutcome(20, 0, 2, true);
    expect(o.kind).toBe('warning');
    expect(o.headline).toBe('Import dokončen s chybami: naimportováno 20 projektů, složky založeny u 18, bez složek 2. Podrobnosti jsou níže.');
  });
  test('část záznamů selhala', () => {
    expect(importOutcome(1, 2, 0, true).headline).toBe('Import dokončen s chybami: naimportováno 1 projekt, složky založeny u 1, nenaimportováno 2. Podrobnosti jsou níže.');
  });
  test('nic se nenaimportovalo', () => {
    expect(importOutcome(0, 3, 0, true)).toEqual({ kind: 'error', headline: 'Import se nepodařil: naimportováno 0 projektů, nenaimportováno 3.' });
  });
});
