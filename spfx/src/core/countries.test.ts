import {
  ALL_COUNTRIES,
  EU_COUNTRIES,
  OTHER_COUNTRIES,
  countryName,
  findCountry,
  isDomestic,
  normalizeVatId,
  vatIdWarning
} from './countries';

describe('EU_COUNTRIES', () => {
  it('obsahuje všech 27 členských států, každý jednou', () => {
    expect(EU_COUNTRIES.length).toBe(27);
    const kody = EU_COUNTRIES.map((c) => c.code);
    expect(new Set(kody).size).toBe(27);
  });

  it('každá ukázka DIČ odpovídá vlastnímu vzoru', () => {
    EU_COUNTRIES.forEach((c) => {
      expect(c.vatPattern.test(c.vatExample)).toBe(true);
    });
  });

  it('Řecko má předponu EL, ne GR', () => {
    expect(findCountry('GR')?.vatPrefix).toBe('EL');
  });
});

describe('země mimo EU', () => {
  it('obsahuje Čínu, Tchaj-wan, USA, Kanadu a další; kódy jsou jedinečné a nekolidují s EU', () => {
    const kody = ALL_COUNTRIES.map((c) => c.code);
    expect(new Set(kody).size).toBe(kody.length);
    ['CN', 'TW', 'US', 'CA', 'GB', 'CH', 'JP', 'KR', 'TH'].forEach((k) => expect(findCountry(k)).toBeDefined());
    expect(countryName('tw')).toBe('Tchaj-wan');
    expect(countryName('US')).toBe('USA');
    OTHER_COUNTRIES.forEach((c) => expect(c.code).toMatch(/^[A-Z]{2}$/));
  });

  it('DIČ zahraničního dodavatele mimo EU se jen uklidí (bez předpony) a nikdy nevaruje', () => {
    expect(normalizeVatId(' 91-1144442 ', 'US')).toBe('911144442');
    expect(vatIdWarning('cokoli 123', 'CN')).toBeUndefined();
    expect(isDomestic('CN')).toBe(false);
  });
});

describe('findCountry / countryName / isDomestic', () => {
  it('prázdná země je Česko', () => {
    expect(findCountry(undefined)?.code).toBe('CZ');
    expect(findCountry('')?.code).toBe('CZ');
    expect(isDomestic(undefined)).toBe(true);
    expect(isDomestic('')).toBe(true);
  });

  it('kód se čte bez ohledu na velikost písmen a mezery', () => {
    expect(findCountry(' sk ')?.name).toBe('Slovensko');
    expect(isDomestic('cz')).toBe(true);
    expect(isDomestic('SK')).toBe(false);
  });

  it('neznámý kód zobrazí tak, jak je, ne prázdno', () => {
    expect(findCountry('ZZ')).toBeUndefined();
    expect(countryName('zz')).toBe('ZZ');
  });
});

describe('normalizeVatId', () => {
  it('uklidí mezery, tečky a pomlčky a zvětší písmena', () => {
    expect(normalizeVatId('sk 2020 317 068', 'SK')).toBe('SK2020317068');
    expect(normalizeVatId('DE-123.456.789', 'DE')).toBe('DE123456789');
  });

  it('doplní předponu země, když chybí', () => {
    expect(normalizeVatId('2020317068', 'SK')).toBe('SK2020317068');
  });

  it('předponu nezdvojí', () => {
    expect(normalizeVatId('SK2020317068', 'SK')).toBe('SK2020317068');
  });

  it('řecké DIČ dostane EL, ne GR', () => {
    expect(normalizeVatId('123456789', 'GR')).toBe('EL123456789');
  });

  it('prázdný vstup zůstane prázdný', () => {
    expect(normalizeVatId('  ', 'SK')).toBe('');
  });
});

describe('vatIdWarning', () => {
  it('správné DIČ nehlásí nic, i když je zapsané neuklizeně', () => {
    expect(vatIdWarning('sk 2020317068', 'SK')).toBeUndefined();
    expect(vatIdWarning('2020317068', 'SK')).toBeUndefined();
  });

  it('prázdné DIČ nehlásí nic — nevyplněné není chybné', () => {
    expect(vatIdWarning('', 'DE')).toBeUndefined();
    expect(vatIdWarning(undefined, 'DE')).toBeUndefined();
  });

  it('špatný tvar upozorní a řekne, jak má vypadat', () => {
    const w = vatIdWarning('DE12345', 'DE');
    expect(w).toContain('Německo');
    expect(w).toContain('DE123456789');
  });

  it('pro neznámou zemi nehlásí nic — není proti čemu kontrolovat', () => {
    expect(vatIdWarning('ZZ12345', 'ZZ')).toBeUndefined();
  });
});
