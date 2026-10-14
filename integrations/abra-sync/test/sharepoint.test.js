import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphClient, DOCS_LIST, SYNC_LIST } from '../src/sharepoint.js';

/** Falešný Graph: zaznamená volání a vrací předem připravené odpovědi podle adresy. */
function fakeGraph(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body });
    if (url.indexOf('login.microsoftonline.com') !== -1) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }), text: async () => '', headers: new Headers() };
    }
    for (const [match, res] of routes) {
      if (url.indexOf(match) !== -1) {
        const r = typeof res === 'function' ? res(init) : res;
        return { ok: r.status === undefined || r.status < 400, status: r.status ?? 200, text: async () => JSON.stringify(r.body ?? {}), headers: new Headers() };
      }
    }
    throw new Error(`neočekávané volání ${url}`);
  };
  return { fetchImpl, calls };
}

const routes = () => [
  ['/sites/revoltum.sharepoint.com:', { body: { id: 'site1' } }],
  ['/lists?$select', { body: { value: [{ id: 'L1', name: 'PRM_AbraDocs', displayName: 'PRM – Doklady z Abry' }, { id: 'L2', name: 'PRM_AbraSync', displayName: 'x' }, { id: 'L3', name: 'PRM_Projects', displayName: 'p' }] } }],
  ['/lists/L1/items?', { body: { value: [{ id: '5', fields: { AbraId: 'a:1' } }] } }]
];

test('klient se přihlásí, najde web i seznam a přečte položky', async () => {
  const { fetchImpl, calls } = fakeGraph(routes());
  const g = createGraphClient({ clientSecret: 'x', fetchImpl });
  const items = await g.listItems(DOCS_LIST, ['AbraId']);
  assert.deepEqual(items, [{ id: '5', fields: { AbraId: 'a:1' } }]);
  assert.ok(calls[0].url.includes('login.microsoftonline.com/8579e1d3'));
});

test('zapisovat lze jen do PRM_AbraDocs a PRM_AbraSync', async () => {
  const { fetchImpl } = fakeGraph(routes());
  const g = createGraphClient({ clientSecret: 'x', fetchImpl });
  await assert.rejects(() => g.createItem('PRM_Projects', { Title: 'x' }), /nesmí/);
  await assert.rejects(() => g.updateItem('PRM_Projects', '1', {}), /nesmí/);
  await assert.rejects(() => g.listItems('PRM_Projects', ['Title']), /nesmí/);
});

test('create a update posílají správné adresy a tělo', async () => {
  const { fetchImpl, calls } = fakeGraph([...routes(), ['/lists/L1/items', { body: { id: '9' } }], ['/lists/L2/items/7/fields', { body: {} }]]);
  const g = createGraphClient({ clientSecret: 'x', fetchImpl });
  assert.equal(await g.createItem(DOCS_LIST, { AbraId: 'a:2' }), '9');
  await g.updateItem(SYNC_LIST, '7', { Status: 'Hotovo' });
  const post = calls.find((c) => c.method === 'POST' && c.url.includes('/items'));
  assert.deepEqual(JSON.parse(post.body), { fields: { AbraId: 'a:2' } });
  const patch = calls.find((c) => c.method === 'PATCH');
  assert.ok(patch.url.endsWith('/lists/L2/items/7/fields'));
});

test('chyba přihlášení neobsahuje tajný klíč', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ error: 'invalid_client' }), text: async () => '', headers: new Headers() });
  const g = createGraphClient({ clientSecret: 'TAJNE-HESLO', fetchImpl });
  await assert.rejects(() => g.listItems(DOCS_LIST, ['AbraId']), (e) => /401/.test(e.message) && e.message.indexOf('TAJNE-HESLO') === -1);
});

test('při omezení (429) se zkusí znovu', async () => {
  let n = 0;
  const base = fakeGraph(routes());
  const fetchImpl = async (url, init) => {
    if (url.includes('/sites/revoltum.sharepoint.com:') && n++ === 0) {
      return { ok: false, status: 429, text: async () => '{}', headers: new Headers({ 'retry-after': '0' }) };
    }
    return base.fetchImpl(url, init);
  };
  const g = createGraphClient({ clientSecret: 'x', fetchImpl, retryDelayMs: 1 });
  assert.equal((await g.listItems(DOCS_LIST, ['AbraId'])).length, 1);
});
