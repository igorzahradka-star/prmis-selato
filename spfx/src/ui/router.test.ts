import { parseHash, buildHash, RouteName, DEFAULT_ROUTE } from './router';

describe('parseHash', () => {
  it('prázdný hash vede na dashboard', () => {
    expect(parseHash('')).toEqual(DEFAULT_ROUTE);
    expect(parseHash('#')).toEqual(DEFAULT_ROUTE);
    expect(parseHash('#/')).toEqual(DEFAULT_ROUTE);
  });

  it('přečte název obrazovky', () => {
    expect(parseHash('#/objednavky')).toEqual({ name: RouteName.Orders, param: undefined });
  });

  it('přečte parametr — číslo zakázky', () => {
    expect(parseHash('#/zakazka/26-014')).toEqual({
      name: RouteName.ProjectDetail,
      param: '26-014'
    });
  });

  it('zvládne hash bez úvodního lomítka', () => {
    expect(parseHash('#zakazky')).toEqual({ name: RouteName.Dashboard, param: undefined });
  });

  it('dekóduje parametr s diakritikou', () => {
    expect(parseHash('#/zakazka/26-014%20Hav%C3%AD%C5%99sk%C3%A1').param).toBe(
      '26-014 Havířská'
    );
  });

  it('neznámou cestu pošle na dashboard místo prázdné stránky', () => {
    expect(parseHash('#/neexistujici-stranka')).toEqual(DEFAULT_ROUTE);
  });

  it('ignoruje přebytečná lomítka', () => {
    expect(parseHash('#//zakazky//')).toEqual({ name: RouteName.Dashboard, param: undefined });
  });
});

describe('buildHash', () => {
  it('složí odkaz bez parametru', () => {
    expect(buildHash(RouteName.Settings)).toBe('#/nastaveni');
  });

  it('složí odkaz s parametrem', () => {
    expect(buildHash(RouteName.ProjectDetail, '26-014')).toBe('#/zakazka/26-014');
  });

  it('zakóduje znaky, které by rozbily URL', () => {
    expect(buildHash(RouteName.ProjectDetail, 'a b/c')).toBe('#/zakazka/a%20b%2Fc');
  });
});

describe('buildHash a parseHash jsou navzájem obrácené', () => {
  it('cokoli složím, to i přečtu zpět', () => {
    const cases: { name: RouteName; param?: string }[] = [
      { name: RouteName.Dashboard },
      { name: RouteName.ProjectDetail, param: '26-014' },
      { name: RouteName.ProjectDetail, param: 'Zakázka / test' },
      { name: RouteName.Install }
    ];
    cases.forEach((c) => {
      expect(parseHash(buildHash(c.name, c.param))).toEqual({ name: c.name, param: c.param });
    });
  });
});
