/**
 * Zobrazení aplikace přes celé okno prohlížeče.
 *
 * SharePoint umí při parametru `env=WebView` v adrese schovat svou horní lištu,
 * záhlaví webu i navigaci — zůstane jen stránka s aplikací. Odkaz z úvodní stránky
 * webu ten parametr ztrácí, proto ho aplikace umí přidat sama (tlačítko v hlavičce)
 * a stejným tlačítkem i odebrat.
 *
 * Bez SharePointu a Reactu, aby šlo otestovat.
 */

const PARAM = 'env';
const VALUE = 'WebView';

/** Běží stránka právě ve zjednodušeném zobrazení bez lišty SharePointu? */
export function isWebViewMode(href: string): boolean {
  try {
    return new URL(href).searchParams.get(PARAM) === VALUE;
  } catch {
    return false;
  }
}

/**
 * Adresa pro přepnutí zobrazení: bez `env=WebView` ho přidá, s ním ho odebere.
 * Zbytek adresy včetně části za `#` (cesta uvnitř aplikace) a dalších parametrů zůstane,
 * takže se člověk po přepnutí ocitne na stejné obrazovce.
 */
export function toggleWebViewUrl(href: string): string {
  try {
    const url = new URL(href);
    if (url.searchParams.get(PARAM) === VALUE) {
      url.searchParams.delete(PARAM);
    } else {
      url.searchParams.set(PARAM, VALUE);
    }
    return url.toString();
  } catch {
    return href;
  }
}
