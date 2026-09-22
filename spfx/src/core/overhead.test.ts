import {
  overheadProjectNumber,
  overheadProjectTitle,
  isOverheadNumber,
  OVERHEAD_TITLE
} from './overhead';

describe('overheadProjectNumber', () => {
  it('složí číslo z dvojčíslí roku a nul', () => {
    expect(overheadProjectNumber(2026)).toBe('26-000');
  });

  it('roky s jednociferným dvojčíslím doplní nulou', () => {
    expect(overheadProjectNumber(2005)).toBe('05-000');
    expect(overheadProjectNumber(2100)).toBe('00-000');
  });
});

describe('overheadProjectTitle', () => {
  it('spojí číslo a název', () => {
    expect(overheadProjectTitle(2026)).toBe(`26-000 ${OVERHEAD_TITLE}`);
  });
});

describe('isOverheadNumber', () => {
  it('pozná číslo Režie', () => {
    expect(isOverheadNumber('26-000')).toBe(true);
  });

  it('běžný projekt za Režii nepovažuje', () => {
    expect(isOverheadNumber('26-001')).toBe(false);
    expect(isOverheadNumber('26-100')).toBe(false);
  });

  it('nevadí mu mezery okolo', () => {
    expect(isOverheadNumber('  26-000  ')).toBe(true);
  });

  it('samotnou příponu za číslo Režie nepovažuje', () => {
    expect(isOverheadNumber('-000')).toBe(false);
  });

  it('prázdnou hodnotu zvládne', () => {
    expect(isOverheadNumber(undefined)).toBe(false);
    expect(isOverheadNumber('')).toBe(false);
  });
});
