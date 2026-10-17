import { crmLinkUrl, isWebViewMode, siteHomeUrl, toggleWebViewUrl } from './fullscreen';

const STRANKA = 'https://selatosro2025.sharepoint.com/sites/Test/SitePages/PRM.aspx';

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

describe('siteHomeUrl', () => {
  it('z adresy stránky aplikace udělá úvodní stránku webu', () => {
    expect(siteHomeUrl(`${STRANKA}?env=WebView#/projekt/26001`)).toBe(
      'https://selatosro2025.sharepoint.com/sites/Test/'
    );
  });

  it('velikost písmen v cestě nevadí', () => {
    expect(siteHomeUrl('https://x.sharepoint.com/sites/Web/sitepages/PRM.aspx')).toBe('https://x.sharepoint.com/sites/Web/');
  });

  it('bez SitePages v adrese vrátí kořen domény', () => {
    expect(siteHomeUrl('https://x.sharepoint.com/neco/jineho')).toBe('https://x.sharepoint.com/');
  });

  it('neplatnou adresu vrátí beze změny', () => {
    expect(siteHomeUrl('není adresa')).toBe('není adresa');
  });
});

describe('crmLinkUrl (tlačítko RES CRM)', () => {
  it('bez vlastní adresy vede na SELCRM.aspx na stejném webu', () => {
    expect(crmLinkUrl('', `${STRANKA}#/projekty`)).toBe('https://selatosro2025.sharepoint.com/sites/Test/SitePages/SELCRM.aspx');
  });
  it('vlastní adresa z Nastavení má přednost', () => {
    expect(crmLinkUrl(' https://example.com/crm.aspx ', STRANKA)).toBe('https://example.com/crm.aspx');
  });
  it('při zobrazení přes celé okno se env=WebView přenese i do RES CRM', () => {
    expect(crmLinkUrl('', `${STRANKA}?env=WebView#/projekty`)).toBe('https://selatosro2025.sharepoint.com/sites/Test/SitePages/SELCRM.aspx?env=WebView');
    expect(crmLinkUrl('https://example.com/crm.aspx?x=1', `${STRANKA}?env=WebView`)).toBe('https://example.com/crm.aspx?x=1&env=WebView');
  });
});
