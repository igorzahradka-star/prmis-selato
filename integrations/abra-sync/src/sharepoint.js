/**
 * Zápis do SharePointu přes Microsoft Graph (registrace aplikace s právem Sites.Selected, jen web PRM).
 *
 * Pravidla (viz docs/ABRA.md): zapisuje se JEN do seznamů PRM_AbraDocs a PRM_AbraSync, nic se nemaže (neexistuje tu žádná funkce mazání),
 * tajný klíč aplikace se předává jen za běhu (proměnná prostředí / skrytý vstup), nikdy se neukládá ani nevypisuje.
 */

export const TENANT_ID = '8579e1d3-b836-4335-af18-ce92b06f0620';
export const CLIENT_ID = 'b259e855-edcd-4d09-a0a3-d4c1e7c1e544';
export const SITE_HOST = 'revoltum.sharepoint.com';
export const SITE_PATH = '/sites/RevoltumEngineeringServices';

export const DOCS_LIST = 'PRM_AbraDocs';
export const SYNC_LIST = 'PRM_AbraSync';
const ALLOWED_LISTS = [DOCS_LIST, SYNC_LIST];

const GRAPH = 'https://graph.microsoft.com/v1.0';

function assertAllowedList(name) {
  if (ALLOWED_LISTS.indexOf(name) === -1) {
    throw new Error(`Do seznamu ${name} se zapisovat nesmí (povoleno: ${ALLOWED_LISTS.join(', ')}).`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {{tenantId?:string, clientId?:string, clientSecret:string, fetchImpl?:typeof fetch, retryDelayMs?:number}} options
 */
export function createGraphClient(options) {
  const tenantId = options.tenantId ?? TENANT_ID;
  const clientId = options.clientId ?? CLIENT_ID;
  const fetchImpl = options.fetchImpl ?? fetch;
  const retryDelayMs = options.retryDelayMs ?? 2000;
  let token;
  let siteId;
  const listIds = new Map();

  async function getToken() {
    if (token && token.expires > Date.now() + 60000) {
      return token.value;
    }
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: options.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    });
    const r = await fetchImpl(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.access_token) {
      // Do chyby se nikdy nedává tajný klíč ani celý text odpovědi.
      throw new Error(`Přihlášení aplikace k Microsoft 365 se nezdařilo (${r.status}${json.error ? `, ${json.error}` : ''}). Zkontrolujte tajný klíč a jeho platnost.`);
    }
    token = { value: json.access_token, expires: Date.now() + (json.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  async function call(method, url, body, attempt = 0) {
    const r = await fetchImpl(url.indexOf('http') === 0 ? url : `${GRAPH}${url}`, {
      method,
      headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if ((r.status === 429 || r.status === 503) && attempt < 4) {
      const wait = Number(r.headers?.get?.('retry-after')) * 1000 || retryDelayMs * (attempt + 1);
      await sleep(wait);
      return call(method, url, body, attempt + 1);
    }
    const text = await r.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (!r.ok) {
      throw new Error(`Microsoft Graph ${method} ${url.replace(GRAPH, '').split('?')[0]}: ${r.status} ${json.error?.code ?? ''} ${json.error?.message ?? ''}`.trim());
    }
    return json;
  }

  async function getSiteId() {
    if (!siteId) {
      siteId = (await call('GET', `/sites/${SITE_HOST}:${SITE_PATH}?$select=id`)).id;
    }
    return siteId;
  }

  /** Id seznamu podle jeho názvu v adrese (…/Lists/PRM_AbraDocs). */
  async function getListId(name) {
    assertAllowedList(name);
    if (!listIds.has(name)) {
      const site = await getSiteId();
      let url = `/sites/${site}/lists?$select=id,name,displayName&$top=200`;
      while (url) {
        const page = await call('GET', url);
        const hit = (page.value ?? []).find((l) => l.name === name || l.displayName === name);
        if (hit) {
          listIds.set(name, hit.id);
          break;
        }
        url = page['@odata.nextLink'];
      }
      if (!listIds.has(name)) {
        throw new Error(`Seznam ${name} na webu PRM nebyl nalezen. Spusťte v aplikaci Instalaci a diagnostiku.`);
      }
    }
    return listIds.get(name);
  }

  return {
    /** Všechny položky seznamu (jen vybraná pole), včetně dalších stránek. */
    async listItems(name, fields) {
      const site = await getSiteId();
      const list = await getListId(name);
      const out = [];
      let url = `/sites/${site}/lists/${list}/items?$expand=fields($select=${fields.join(',')})&$top=500`;
      while (url) {
        const page = await call('GET', url);
        for (const item of page.value ?? []) {
          out.push({ id: item.id, fields: item.fields ?? {} });
        }
        url = page['@odata.nextLink'];
      }
      return out;
    },
    async createItem(name, fields) {
      assertAllowedList(name);
      const r = await call('POST', `/sites/${await getSiteId()}/lists/${await getListId(name)}/items`, { fields });
      return r.id;
    },
    async updateItem(name, itemId, fields) {
      assertAllowedList(name);
      await call('PATCH', `/sites/${await getSiteId()}/lists/${await getListId(name)}/items/${encodeURIComponent(itemId)}/fields`, fields);
    }
  };
}
