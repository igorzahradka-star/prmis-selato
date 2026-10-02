import { isValidIco, normalizeIco } from './ico';

describe('isValidIco', () => {
  it('uzná platná IČO (ověřeno proti skutečným firmám v ARES)', () => {
    expect(isValidIco('06859101')).toBe(true);
    expect(isValidIco('24729035')).toBe(true);
  });

  it('uzná platné IČO, kde zbytek po dělení 11 dá kontrolní číslici 0 (zbytek 1)', () => {
    // součet = 6*2 = 12; 12 % 11 = 1 → kontrolní číslice 0
    expect(isValidIco('00000060')).toBe(true);
  });

  it('odmítne špatnou kontrolní číslici', () => {
    expect(isValidIco('06859102')).toBe(false);
    expect(isValidIco('24729036')).toBe(false);
  });

  it('odmítne špatnou délku', () => {
    expect(isValidIco('123')).toBe(false);
    expect(isValidIco('123456789')).toBe(false);
    expect(isValidIco('')).toBe(false);
  });

  it('odmítne nečíselné znaky', () => {
    expect(isValidIco('2472903a')).toBe(false);
    expect(isValidIco('24 729035')).toBe(false);
  });
});

describe('normalizeIco', () => {
  it('vyčistí mezery a doplní nuly zleva', () => {
    expect(normalizeIco('452 746 49')).toBe('45274649');
    expect(normalizeIco('69797')).toBe('00069797');
    expect(normalizeIco(' 06859101 ')).toBe('06859101');
  });
  it('přebytečné nuly zleva zahodí', () => {
    expect(normalizeIco('000069797')).toBe('00069797');
    expect(normalizeIco('0045274649')).toBe('45274649');
  });
  it('prázdné a nesmyslné nechá očištěné', () => {
    expect(normalizeIco('')).toBe('');
    expect(normalizeIco(undefined)).toBe('');
    expect(normalizeIco('abc')).toBe('');
    expect(normalizeIco('123456789')).toBe('123456789');
  });
});
