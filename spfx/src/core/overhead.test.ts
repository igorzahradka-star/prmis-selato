import {
  overheadProjectNumber,
  overheadProjectTitle,
  isOverheadNumber,
  MAX_REGULAR_SEQUENCE,
  OVERHEAD_TITLE
} from './overhead';

describe('overheadProjectNumber', () => {
  it('složí číslo z dvojčíslí roku a devítek', () => {
    expect(overheadProjectNumber(2026)).toBe('26999');
  });

  it('každý rok má svou Režii', () => {
    expect(overheadProjectNumber(2027)).toBe('27999');
    expect(overheadProjectNumber(2030)).toBe('30999');
  });

  it('roky s jednociferným dvojčíslím doplní nulou', () => {
    expect(overheadProjectNumber(2005)).toBe('05999');
    expect(overheadProjectNumber(2100)).toBe('00999');
  });
});

describe('overheadProjectTitle', () => {
  it('obsahuje číslo, název i rok — ať jdou Režie po letech rozeznat', () => {
    expect(overheadProjectTitle(2026)).toBe(`26999 ${OVERHEAD_TITLE} 2026`);
    expect(overheadProjectTitle(2027)).toBe(`27999 ${OVERHEAD_TITLE} 2027`);
  });
});

describe('isOverheadNumber', () => {
  it('pozná číslo Režie', () => {
    expect(isOverheadNumber('26999')).toBe(true);
    expect(isOverheadNumber('27999')).toBe(true);
  });

  it('běžnou zakázku za Režii nepovažuje', () => {
    expect(isOverheadNumber('26001')).toBe(false);
    expect(isOverheadNumber('26099')).toBe(false);
    expect(isOverheadNumber('26998')).toBe(false);
  });

  it('nevadí mu mezery okolo', () => {
    expect(isOverheadNumber('  26999  ')).toBe(true);
  });

  it('samotné devítky za číslo Režie nepovažuje', () => {
    expect(isOverheadNumber('999')).toBe(false);
  });

  it('prázdnou hodnotu zvládne', () => {
    expect(isOverheadNumber(undefined)).toBe(false);
    expect(isOverheadNumber('')).toBe(false);
  });
});

describe('MAX_REGULAR_SEQUENCE', () => {
  it('končí těsně pod číslem Režie, aby na ni řada nenarazila', () => {
    expect(MAX_REGULAR_SEQUENCE).toBe(998);
    expect(isOverheadNumber(`26${MAX_REGULAR_SEQUENCE}`)).toBe(false);
    expect(isOverheadNumber(`26${MAX_REGULAR_SEQUENCE + 1}`)).toBe(true);
  });
});
