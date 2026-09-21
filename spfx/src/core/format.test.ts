import {
  formatMoney,
  formatMoneyExact,
  formatNumber,
  formatPercent,
  formatDate,
  toIsoDate,
  toDate,
  daysBetween,
  dueLabel,
  pluralDays,
  pluralProjects,
  normalizeSpaces
} from './format';

describe('formatMoney', () => {
  it('formátuje částku v korunách bez haléřů', () => {
    expect(normalizeSpaces(formatMoney(1234567))).toBe('1 234 567 Kč');
  });

  it('zaokrouhluje na celé koruny', () => {
    expect(normalizeSpaces(formatMoney(1234.6))).toBe('1 235 Kč');
  });

  it('zobrazí pomlčku místo prázdné hodnoty', () => {
    expect(formatMoney(undefined)).toBe('—');
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(NaN)).toBe('—');
  });

  it('zobrazí nulu jako nulu, ne jako pomlčku', () => {
    expect(normalizeSpaces(formatMoney(0))).toBe('0 Kč');
  });

  it('umí i eura', () => {
    expect(normalizeSpaces(formatMoney(1000, 'EUR'))).toBe('1 000 €');
  });
});

describe('formatMoneyExact', () => {
  it('zobrazí haléře — pro detail dokladu', () => {
    expect(normalizeSpaces(formatMoneyExact(1234.5))).toBe('1 234,50 Kč');
  });
});

describe('formatNumber', () => {
  it('formátuje celé číslo s oddělovačem tisíců', () => {
    expect(normalizeSpaces(formatNumber(1234567))).toBe('1 234 567');
  });

  it('respektuje počet desetinných míst', () => {
    expect(normalizeSpaces(formatNumber(1234.56, 1))).toBe('1 234,6');
  });
});

describe('formatPercent', () => {
  it('kladnou odchylku uvede se znaménkem plus', () => {
    expect(normalizeSpaces(formatPercent(0.0523))).toBe('+5,2 %');
  });

  it('zápornou odchylku uvede se znaménkem minus', () => {
    expect(normalizeSpaces(formatPercent(-0.01))).toBe('−1,0 %');
  });

  it('nulu uvede bez znaménka', () => {
    expect(normalizeSpaces(formatPercent(0))).toBe('0,0 %');
  });
});

describe('formatDate', () => {
  it('formátuje datum česky', () => {
    expect(normalizeSpaces(formatDate(new Date(2026, 8, 11)))).toBe('11. 9. 2026');
  });

  it('zobrazí pomlčku místo prázdného data', () => {
    expect(formatDate(undefined)).toBe('—');
  });
});

describe('toIsoDate', () => {
  it('vrací tvar rok-měsíc-den s doplněnými nulami', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('nepoužívá UTC — datum se nesmí posunout o den zpět', () => {
    // Půlnoc místního času; převod přes toISOString() by v CET/CEST posunul den zpět.
    expect(toIsoDate(new Date(2026, 8, 11, 0, 0, 0))).toBe('2026-09-11');
  });

  it('vrací prázdný řetězec místo prázdného data', () => {
    expect(toIsoDate(undefined)).toBe('');
  });
});

describe('toDate', () => {
  it('přijme řetězec ze SharePointu', () => {
    const d = toDate('2026-09-11T00:00:00Z');
    expect(d?.getUTCFullYear()).toBe(2026);
  });

  it('nesmyslný řetězec vrátí jako undefined, ne jako Invalid Date', () => {
    expect(toDate('nesmysl')).toBeUndefined();
  });

  it('prázdný řetězec vrátí jako undefined', () => {
    expect(toDate('')).toBeUndefined();
  });
});

describe('daysBetween', () => {
  it('spočítá dny dopředu', () => {
    expect(daysBetween(new Date(2026, 8, 11), new Date(2026, 8, 14))).toBe(3);
  });

  it('spočítá dny dozadu jako záporné číslo', () => {
    expect(daysBetween(new Date(2026, 8, 14), new Date(2026, 8, 11))).toBe(-3);
  });

  it('nezkreslí se přechodem na letní čas', () => {
    // V ČR 2026 se mění čas 29. 3. — mezi 28. 3. a 30. 3. jsou stále 2 dny.
    expect(daysBetween(new Date(2026, 2, 28), new Date(2026, 2, 30))).toBe(2);
  });

  it('nezkreslí se přechodem přes konec roku', () => {
    expect(daysBetween(new Date(2026, 11, 31), new Date(2027, 0, 1))).toBe(1);
  });
});

describe('dueLabel', () => {
  const dnes = new Date(2026, 8, 11);

  it('pojmenuje dnešek', () => {
    expect(dueLabel(new Date(2026, 8, 11), dnes)).toBe('dnes');
  });

  it('pojmenuje zítřek', () => {
    expect(dueLabel(new Date(2026, 8, 12), dnes)).toBe('zítra');
  });

  it('pojmenuje budoucí termín', () => {
    expect(dueLabel(new Date(2026, 8, 16), dnes)).toBe('za 5 dní');
  });

  it('upozorní na zmeškaný termín', () => {
    expect(dueLabel(new Date(2026, 8, 8), dnes)).toBe('po termínu o 3 dny');
  });

  it('prázdný termín zobrazí jako pomlčku', () => {
    expect(dueLabel(undefined, dnes)).toBe('—');
  });
});

describe('české skloňování', () => {
  it('skloňuje dny', () => {
    expect(pluralDays(1)).toBe('1 den');
    expect(pluralDays(2)).toBe('2 dny');
    expect(pluralDays(4)).toBe('4 dny');
    expect(pluralDays(5)).toBe('5 dní');
    expect(pluralDays(21)).toBe('21 dní');
  });

  it('skloňuje projekty', () => {
    expect(pluralProjects(0)).toBe('0 projektů');
    expect(pluralProjects(1)).toBe('1 projekt');
    expect(pluralProjects(3)).toBe('3 projekty');
    expect(pluralProjects(11)).toBe('11 projektů');
  });
});
