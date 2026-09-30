import {
  renderDocumentNumber,
  nextSequence,
  counterScopeKey,
  renderProjectTitle,
  sanitizeFolderName,
  pickCounterRow
} from './numbering';

describe('renderDocumentNumber', () => {
  it('složí číslo projektu podle vzoru {YY}-{N}', () => {
    expect(renderDocumentNumber({ pattern: '{YY}-{N}', padding: 3 }, { year: 2026, sequence: 14 })).toBe(
      '26-014'
    );
  });

  it('doplní {N} nulami podle padding', () => {
    expect(
      renderDocumentNumber({ pattern: 'OBJ-{YYYY}-{N}', padding: 4 }, { year: 2026, sequence: 153 })
    ).toBe('OBJ-2026-0153');
  });

  it('kombinuje prefix a rok bez oddělovače', () => {
    expect(renderDocumentNumber({ pattern: 'FP{YY}{N}', padding: 2 }, { year: 2026, sequence: 42 })).toBe(
      'FP2642'
    );
  });

  it('dosadí číslo nadřazeného projektu do {PRJ}', () => {
    expect(
      renderDocumentNumber(
        { pattern: 'PP-{PRJ}-{N}', padding: 2 },
        { year: 2026, sequence: 2, projectNumber: '26-014' }
      )
    ).toBe('PP-26-014-02');
  });

  it('dosadí kód typu dokladu do {PREFIX}', () => {
    expect(
      renderDocumentNumber({ pattern: '{PREFIX}-{N}', padding: 3 }, { year: 2026, sequence: 1, prefix: 'PP' })
    ).toBe('PP-001');
  });
});

describe('nextSequence', () => {
  const rocniReset = { resetPeriod: 'Ročně' as const, startValue: 1 };

  it('bez existujícího čítače začne od počáteční hodnoty', () => {
    expect(nextSequence(undefined, rocniReset, 2026)).toBe(1);
  });

  it('respektuje nastavenou počáteční hodnotu (navázání na staré číslování)', () => {
    expect(nextSequence(undefined, { resetPeriod: 'Ročně', startValue: 19 }, 2026)).toBe(19);
  });

  it('ve stejném roce jen zvyšuje o jedna', () => {
    expect(nextSequence({ year: 2026, lastValue: 13 }, rocniReset, 2026)).toBe(14);
  });

  it('s ročním resetem v novém roce začne znovu od počáteční hodnoty', () => {
    expect(nextSequence({ year: 2025, lastValue: 22 }, rocniReset, 2026)).toBe(1);
  });

  it('bez resetu (Nikdy) pokračuje i v novém roce', () => {
    expect(nextSequence({ year: 2025, lastValue: 22 }, { resetPeriod: 'Nikdy', startValue: 1 }, 2026)).toBe(
      23
    );
  });
});

describe('counterScopeKey', () => {
  it('u globální řady je klíč prázdný', () => {
    expect(counterScopeKey('Globální')).toBe('');
  });

  it('u řady v rámci projektu je klíčem číslo projektu', () => {
    expect(counterScopeKey('Projekt', '26-014')).toBe('26-014');
  });
});

describe('renderProjectTitle', () => {
  const pattern = '{CISLO} {ZAKAZNIK} – {LOKALITA} – {TYP}';

  it('složí název se všemi údaji', () => {
    expect(
      renderProjectTitle(pattern, {
        cislo: '26-014',
        zakaznik: 'ČEZ Distribuce',
        lokalita: 'Havlíčkův Brod',
        typ: 'Připojení DS'
      })
    ).toBe('26-014 ČEZ Distribuce – Havlíčkův Brod – Připojení DS');
  });

  it('chybějící lokalitu vynechá i s okolní pomlčkou, ne prázdný úsek', () => {
    expect(
      renderProjectTitle(pattern, { cislo: '26-014', zakaznik: 'ČEZ Distribuce', typ: 'Připojení DS' })
    ).toBe('26-014 ČEZ Distribuce – Připojení DS');
  });

  it('funguje i s jiným vzorem obsahujícím {ROK}', () => {
    expect(renderProjectTitle('{ROK}/{CISLO} {ZAKAZNIK}', { cislo: '26-014', zakaznik: 'ČEZ', rok: 2026 })).toBe(
      '2026/26-014 ČEZ'
    );
  });
});

describe('sanitizeFolderName', () => {
  it('odstraní znaky, které SharePoint v názvu složky nepovoluje', () => {
    expect(sanitizeFolderName('ČEZ "Distribuce" * <test> ? / \\ |')).toBe('ČEZ Distribuce  test');
  });

  it('ořízne počáteční a koncové mezery a tečky', () => {
    expect(sanitizeFolderName('  .Havlíčkův Brod.  ')).toBe('Havlíčkův Brod');
  });

  it('omezí délku', () => {
    const dlouhy = 'A'.repeat(200);
    expect(sanitizeFolderName(dlouhy, 10).length).toBe(10);
  });
});

describe('pickCounterRow', () => {
  it('prázdný klíč rozsahu najde řádek, kde je klíč null, undefined i prázdný text', () => {
    expect(pickCounterRow([{ LastValue: 3, ScopeKey: null }], '')?.LastValue).toBe(3);
    expect(pickCounterRow([{ LastValue: 4 }], '')?.LastValue).toBe(4);
    expect(pickCounterRow([{ LastValue: 5, ScopeKey: '' }], '')?.LastValue).toBe(5);
  });
  it('řádek jiného rozsahu nevybere', () => {
    expect(pickCounterRow([{ LastValue: 3, ScopeKey: '26001' }], '')).toBeUndefined();
    expect(pickCounterRow([{ LastValue: 3, ScopeKey: '26001' }], '26001')?.LastValue).toBe(3);
  });
  it('při více řádcích téhož rozsahu vezme nejvyšší hodnotu', () => {
    const rows = [{ LastValue: 1, ScopeKey: null }, { LastValue: 7, ScopeKey: '' }, { LastValue: 2 }];
    expect(pickCounterRow(rows, '')?.LastValue).toBe(7);
  });
  it('bez řádků vrátí undefined', () => {
    expect(pickCounterRow([], '')).toBeUndefined();
  });
});
