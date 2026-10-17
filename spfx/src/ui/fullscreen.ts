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

import { ENTITY } from '../config/entity';

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

/**
 * Adresa tlačítka sesterské aplikace („SELCRM“): vlastní (z Nastavení), jinak výchozí `<web>/SitePages/<crmPageFile>` na webu, kde běží aplikace.
 * Běží-li aplikace přes celé okno (`env=WebView`), přenese se to i na cílovou stránku, ať člověk zůstane v „celém okně“.
 */
export function crmLinkUrl(customUrl: string, currentHref: string): string {
  const target = customUrl.trim() !== '' ? customUrl.trim() : `${siteHomeUrl(currentHref)}SitePages/${ENTITY.crmPageFile}`;
  if (!isWebViewMode(currentHref)) {
    return target;
  }
  try {
    const url = new URL(target);
    url.searchParams.set(PARAM, VALUE);
    return url.toString();
  } catch {
    return target;
  }
}

/**
 * Adresa úvodní stránky webu SharePointu, na kterém aplikace běží.
 * Stránka aplikace leží v `…/sites/Web/SitePages/PRM.aspx` — úvodní stránka je kořen toho webu.
 * Když adresa tvar `/SitePages/` nemá, vrátí se kořen celé domény.
 */
export function siteHomeUrl(href: string): string {
  try {
    const url = new URL(href);
    const at = url.pathname.toLowerCase().indexOf('/sitepages/');
    const base = at === -1 ? '' : url.pathname.slice(0, at);
    return `${url.origin}${base}/`;
  } catch {
    return href;
  }
}
