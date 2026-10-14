/**
 * Klient pro čtení z ABRA Flexi. JEN ČTENÍ: jediná funkce, která volá síť, posílá výhradně GET (viz `flexiGet`).
 * Přihlašovací údaje se předávají jen jako parametr za běhu; nikde se neukládají ani nevypisují.
 */

export const DEFAULT_BASE = 'https://revoltum.flexibee.eu/c/revoltum_engineering___services_s_r_o_/';

/** Povolený server: přihlašovací údaje se nikdy nepošlou nikam jinam než na *.flexibee.eu přes https. */
export function assertAllowedBase(base) {
  let url;
  try {
    url = new URL(base);
  } catch {
    throw new Error('Adresa Flexi není platná.');
  }
  if (url.protocol !== 'https:' || !/(^|\.)flexibee\.eu$/i.test(url.hostname)) {
    throw new Error(`Z bezpečnostních důvodů se přihlášení posílá jen na https://*.flexibee.eu (zadáno: ${url.hostname}).`);
  }
  return url.toString().endsWith('/') ? url.toString() : `${url}/`;
}

/** Složí adresu čtení: base + cesta + volitelné parametry. Cesta nesmí vést jinam (žádné „//“, „..“, dvojtečky). */
export function buildUrl(base, path, params = {}) {
  if (/(^|\/)\.\.(\/|$)|^\/|:\/\//.test(path)) {
    throw new Error(`Nepovolená cesta: ${path}`);
  }
  const url = new URL(path, assertAllowedBase(base));
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/** Hlavička Basic přihlášení. */
export function basicAuth(user, password) {
  return `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;
}

/**
 * Jediné místo, které volá síť. Metoda je napevno GET.
 * @returns {{status:number, ok:boolean, contentType:string, body:any, text:string}}
 */
export async function flexiGet(url, auth, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { Authorization: auth, Accept: 'application/json' }
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  return { status: response.status, ok: response.ok, contentType: response.headers.get('content-type') ?? '', body, text };
}

/** Z výpisu evidencí (evidence-list) vybere ty, které by mohly být zálohové doklady nebo účetní deník (jen odhad podle názvu). */
export function pickCandidateEvidences(list) {
  const names = [];
  const walk = (value) => {
    if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === 'object') {
      for (const key of ['evidencePath', 'evidenceType', 'name']) {
        if (typeof value[key] === 'string') {
          names.push(value[key]);
        }
      }
      Object.values(value).forEach((v) => typeof v === 'object' && walk(v));
    }
  };
  walk(list);
  const unique = Array.from(new Set(names));
  return unique.filter((n) => /zaloh|denik|obrat|ucetn|uctov|polozk.*faktur|faktur.*polozk/i.test(n));
}
