import {
  SIGNATURE_MAX_CHARS,
  UserSignature,
  isSignatureImage,
  signatureAlpha,
  signatureKey,
  signatureOf,
  validateSignatureDataUrl
} from './signatures';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('obrázek podpisu', () => {
  it('PNG a JPEG jako data URL projde, cokoli jiného ne', () => {
    expect(isSignatureImage(PNG)).toBe(true);
    expect(isSignatureImage('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
    expect(isSignatureImage('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isSignatureImage('https://x/podpis.png')).toBe(false);
    expect(isSignatureImage('')).toBe(false);
    expect(isSignatureImage(undefined)).toBe(false);
  });

  it('kontrola před uložením: tvar a velikost', () => {
    expect(validateSignatureDataUrl(PNG)).toBeUndefined();
    expect(validateSignatureDataUrl('nesmysl')).toContain('PNG nebo JPEG');
    expect(validateSignatureDataUrl('data:image/png;base64,' + 'A'.repeat(SIGNATURE_MAX_CHARS))).toContain('příliš velký');
  });
});

describe('zprůhlednění skenu podpisu', () => {
  it('bílý papír je průhledný, inkoust plně viditelný, šedé přechody plynule', () => {
    expect(signatureAlpha(255, 255, 255)).toBe(0);
    expect(signatureAlpha(240, 240, 240)).toBe(0);
    expect(signatureAlpha(10, 20, 80)).toBe(255);
    const mid = signatureAlpha(205, 205, 205);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(255);
    // tmavší bod je méně průhledný než světlejší
    expect(signatureAlpha(190, 190, 190)).toBeGreaterThan(signatureAlpha(220, 220, 220));
  });
});

describe('dohledání podpisu podle přihlašovacího jména', () => {
  const map: Record<string, UserSignature> = {};
  map[signatureKey('i:0#.f|membership|igor.zahradka@revoltum.cz')] = { login: 'igor.zahradka@revoltum.cz', displayName: 'Igor', imageDataUrl: PNG };
  map[signatureKey('jan@revoltum.cz')] = { login: 'jan@revoltum.cz', displayName: 'Jan', imageDataUrl: 'neplatny' };

  it('jedno přihlašovací jméno v různém tvaru dá stejný klíč', () => {
    expect(signatureKey('i:0#.f|membership|Igor.Zahradka@revoltum.cz')).toBe(signatureKey('igor.zahradka@revoltum.cz'));
  });

  it('najde podpis i při jiném tvaru jména; neplatný nebo chybějící obrázek nevrátí', () => {
    expect(signatureOf(map, 'igor.zahradka@revoltum.cz')).toBe(PNG);
    expect(signatureOf(map, 'jan@revoltum.cz')).toBeUndefined();
    expect(signatureOf(map, 'nikdo@revoltum.cz')).toBeUndefined();
    expect(signatureOf(map, undefined)).toBeUndefined();
  });
});
