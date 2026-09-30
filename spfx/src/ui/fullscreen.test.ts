import { isWebViewMode, toggleWebViewUrl } from './fullscreen';

const STRANKA = 'https://revoltum.sharepoint.com/sites/RevoltumEngineeringServices/SitePages/PRM.aspx';

describe('isWebViewMode', () => {
  it('pozná adresu s env=WebView', () => {
    expect(isWebViewMode(`${STRANKA}?env=WebView#/projekty`)).toBe(true);
  });

  it('běžná adresa ani jiná hodnota parametru není zjednodušené zobrazení', () => {
    expect(isWebViewMode(`${STRANKA}#/projekty`)).toBe(false);
    expect(isWebViewMode(`${STRANKA}?env=Embedded`)).toBe(false);
  });

  it('neplatná adresa nevyhodí výjimku', () => {
    expect(isWebViewMode('')).toBe(false);
  });
});

describe('toggleWebViewUrl', () => {
  it('přidá env=WebView a zachová cestu uvnitř aplikace', () => {
    expect(toggleWebViewUrl(`${STRANKA}#/projekt/26001`)).toBe(`${STRANKA}?env=WebView#/projekt/26001`);
  });

  it('odebere env=WebView a zachová cestu uvnitř aplikace', () => {
    expect(toggleWebViewUrl(`${STRANKA}?env=WebView#/mapa`)).toBe(`${STRANKA}#/mapa`);
  });

  it('dvojí přepnutí vrátí původní adresu', () => {
    const puvodni = `${STRANKA}#/projekty`;
    expect(toggleWebViewUrl(toggleWebViewUrl(puvodni))).toBe(puvodni);
  });

  it('ostatní parametry adresy nechá být', () => {
    const r = toggleWebViewUrl(`${STRANKA}?a=1#/projekty`);
    expect(r).toContain('a=1');
    expect(r).toContain('env=WebView');
  });

  it('neplatnou adresu vrátí beze změny', () => {
    expect(toggleWebViewUrl('není adresa')).toBe('není adresa');
  });
});
