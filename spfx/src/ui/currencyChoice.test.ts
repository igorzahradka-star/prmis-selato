import { getCurrencyChoice, setCurrencyChoice, subscribeCurrencyChoice } from './currencyChoice';

describe('měna přehledů zvolená uživatelem', () => {
  afterEach(() => setCurrencyChoice(undefined));

  it('bez volby je prázdná (platí výchozí z Nastavení), po volbě se vrací', () => {
    expect(getCurrencyChoice()).toBeUndefined();
    setCurrencyChoice('EUR');
    expect(getCurrencyChoice()).toBe('EUR');
    setCurrencyChoice(undefined);
    expect(getCurrencyChoice()).toBeUndefined();
  });

  it('změna se oznámí všem odběratelům, odhlášený už nic nedostane', () => {
    let a = 0;
    let b = 0;
    const offA = subscribeCurrencyChoice(() => a++);
    const offB = subscribeCurrencyChoice(() => b++);
    setCurrencyChoice('USD');
    offA();
    setCurrencyChoice('CZK');
    offB();
    expect(a).toBe(1);
    expect(b).toBe(2);
  });
});
