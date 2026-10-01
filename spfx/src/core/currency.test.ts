import { FallbackRates, StoredRates, asCurrencyCode, convertAmount, describeRates, effectiveRates, isRateStale, sumInCzk, toCzk, validateRateEntry } from './currency';

const NOUZOVE: FallbackRates = { EUR: 25, USD: 23 };
const zapsane: StoredRates = {
  EUR: { currency: 'EUR', rate: 24.415, date: new Date(2026, 8, 29) },
  USD: { currency: 'USD', rate: 21.501, date: new Date(2026, 8, 29) }
};

describe('effectiveRates', () => {
  it('zapsané kurzy mají přednost před nouzovými', () => {
    const r = effectiveRates(zapsane, NOUZOVE);
    expect(r.EUR).toBe(24.415);
    expect(r.USD).toBe(21.501);
    expect(r.source).toEqual({ EUR: 'zapsaný', USD: 'zapsaný' });
    expect(r.date).toEqual(new Date(2026, 8, 29));
  });

  it('bez zapsaných kurzů se počítá nouzovými a je to vidět', () => {
    const r = effectiveRates(undefined, NOUZOVE);
    expect(r.EUR).toBe(25);
    expect(r.source.EUR).toBe('nouzový');
    expect(r.date).toBeUndefined();
  });

  it('chybějící měna se doplní nouzovým kurzem, ostatní zůstanou zapsané', () => {
    const r = effectiveRates({ EUR: zapsane.EUR }, NOUZOVE);
    expect(r.EUR).toBe(24.415);
    expect(r.USD).toBe(23);
    expect(r.source).toEqual({ EUR: 'zapsaný', USD: 'nouzový' });
  });

  it('nulový nebo záporný kurz se ignoruje — částky se nesmí vynulovat', () => {
    const r = effectiveRates({ EUR: { currency: 'EUR', rate: 0, date: new Date() } }, NOUZOVE);
    expect(r.EUR).toBe(25);
    expect(effectiveRates(undefined, { EUR: 0, USD: -1 }).EUR).toBe(1);
  });

  it('datem je nejstarší ze zapsaných kurzů — starší kurz je slabší článek', () => {
    const r = effectiveRates(
      {
        EUR: { currency: 'EUR', rate: 24, date: new Date(2026, 8, 29) },
        USD: { currency: 'USD', rate: 21, date: new Date(2026, 8, 20) }
      },
      NOUZOVE
    );
    expect(r.date).toEqual(new Date(2026, 8, 20));
  });
});

describe('toCzk / sumInCzk', () => {
  const r = effectiveRates(zapsane, NOUZOVE);

  it('koruny zůstanou, eura a dolary se přepočítají', () => {
    expect(toCzk(1000, 'CZK', r)).toBe(1000);
    expect(toCzk(1000, 'EUR', r)).toBe(24415);
    expect(toCzk(1000, 'USD', r)).toBe(21501);
  });

  it('neznámá měna a prázdná částka se nevynulují ani nespadnou', () => {
    expect(toCzk(500, 'GBP', r)).toBe(500);
    expect(toCzk(undefined, 'EUR', r)).toBe(0);
    expect(toCzk(null, undefined, r)).toBe(0);
  });

  it('součet napříč měnami je v korunách — 10 000 Kč + 1 000 EUR nejsou 11 000', () => {
    const celkem = sumInCzk(
      [
        { amount: 10000, currency: 'CZK' },
        { amount: 1000, currency: 'EUR' },
        { amount: 100, currency: 'USD' }
      ],
      r
    );
    expect(celkem).toBe(10000 + 24415 + 2150.1);
  });

  it('prázdný seznam dá nulu', () => {
    expect(sumInCzk([], r)).toBe(0);
  });
});

describe('isRateStale', () => {
  it('čerstvý kurz není starý, týden a víc ano', () => {
    const r = effectiveRates(zapsane, NOUZOVE);
    expect(isRateStale(r, new Date(2026, 9, 1))).toBe(false);
    expect(isRateStale(r, new Date(2026, 9, 6))).toBe(false);
    expect(isRateStale(r, new Date(2026, 9, 7))).toBe(true);
  });

  it('nouzové kurzy bez data se berou jako staré', () => {
    expect(isRateStale(effectiveRates(undefined, NOUZOVE))).toBe(true);
  });
});

describe('describeRates', () => {
  const r = effectiveRates(zapsane, NOUZOVE);

  it('bez cizí měny nic nevysvětluje', () => {
    expect(describeRates(r, ['CZK'])).toBe('');
  });

  it('popíše použitý kurz a den ČNB', () => {
    expect(describeRates(r, ['CZK', 'EUR'])).toBe('Přepočet: 1 EUR = 24,415 Kč, kurz ČNB k 29. 9. 2026.');
  });

  it('nouzový kurz označí', () => {
    expect(describeRates(effectiveRates(undefined, NOUZOVE), ['EUR'])).toContain('nouzový kurz z Nastavení');
  });
});

describe('validateRateEntry', () => {
  const dnes = new Date(2026, 8, 30);

  it('správný kurz projde', () => {
    expect(validateRateEntry({ currency: 'EUR', rate: 24.415, date: new Date(2026, 8, 29) }, dnes)).toEqual([]);
  });

  it('kurz musí být kladný a rozumně velký', () => {
    expect(validateRateEntry({ currency: 'EUR', rate: 0, date: dnes }, dnes)).toHaveLength(1);
    expect(validateRateEntry({ currency: 'EUR', rate: undefined, date: dnes }, dnes)).toHaveLength(1);
    expect(validateRateEntry({ currency: 'USD', rate: 21501, date: dnes }, dnes)[0]).toContain('nesmyslně');
  });

  it('zapisuje se jen EUR a USD; koruna kurz nemá', () => {
    expect(validateRateEntry({ currency: 'CZK', rate: 1, date: dnes }, dnes)[0]).toContain('EUR a USD');
  });

  it('datum je povinné a nesmí být v budoucnosti', () => {
    expect(validateRateEntry({ currency: 'EUR', rate: 24, date: undefined }, dnes)).toHaveLength(1);
    expect(validateRateEntry({ currency: 'EUR', rate: 24, date: new Date(2026, 9, 10) }, dnes)[0]).toContain('budoucí');
  });
});

describe('convertAmount (měna přehledů)', () => {
  const rates = effectiveRates(zapsane, NOUZOVE);

  it('do korun: totéž co toCzk', () => {
    expect(convertAmount(100, 'EUR', 'CZK', rates)).toBe(toCzk(100, 'EUR', rates));
    expect(convertAmount(1000, 'CZK', 'CZK', rates)).toBe(1000);
  });

  it('z korun do eur a dolarů přes kurz ČNB', () => {
    expect(convertAmount(24415, 'CZK', 'EUR', rates)).toBe(1000);
    expect(convertAmount(21501, 'CZK', 'USD', rates)).toBe(1000);
  });

  it('mezi cizími měnami přes koruny; stejná měna se nemění', () => {
    expect(convertAmount(1000, 'EUR', 'USD', rates)).toBeCloseTo((1000 * 24.415) / 21.501, 1);
    expect(convertAmount(1000, 'EUR', 'EUR', rates)).toBe(1000);
  });

  it('chybějící částka je nula, neznámá měna koruny', () => {
    expect(convertAmount(undefined, 'EUR', 'CZK', rates)).toBe(0);
    expect(convertAmount(500, 'XYZ', 'CZK', rates)).toBe(500);
    expect(asCurrencyCode('EUR')).toBe('EUR');
    expect(asCurrencyCode('xyz')).toBe('CZK');
    expect(asCurrencyCode(undefined)).toBe('CZK');
  });
});
