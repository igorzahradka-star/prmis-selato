import { isValidIco } from './ico';

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
