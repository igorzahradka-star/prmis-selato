import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAllowedBase, buildUrl, basicAuth, flexiGet, pickCandidateEvidences, DEFAULT_BASE } from '../src/flexiClient.js';

test('přihlášení se pošle jen na https://*.flexibee.eu', () => {
  assert.equal(assertAllowedBase(DEFAULT_BASE), DEFAULT_BASE);
  assert.throws(() => assertAllowedBase('http://revoltum.flexibee.eu/flexi/x/'));
  assert.throws(() => assertAllowedBase('https://flexibee.eu.evil.example/flexi/x/'));
  assert.throws(() => assertAllowedBase('https://example.com/'));
});

test('buildUrl skládá adresu a hlídá cestu', () => {
  assert.equal(buildUrl(DEFAULT_BASE, 'faktura-prijata.json', { limit: 3, detail: 'full' }), `${DEFAULT_BASE}faktura-prijata.json?limit=3&detail=full`);
  assert.throws(() => buildUrl(DEFAULT_BASE, '../jina-firma/x.json'));
  assert.throws(() => buildUrl(DEFAULT_BASE, 'https://evil.example/x'));
  assert.throws(() => buildUrl(DEFAULT_BASE, '/flexi/jina/x.json'));
});

test('basicAuth', () => {
  assert.equal(basicAuth('a', 'b'), `Basic ${Buffer.from('a:b').toString('base64')}`);
});

test('flexiGet posílá jen GET a čte JSON i neJSON', async () => {
  let seen;
  const fake = async (url, init) => {
    seen = init;
    return { status: 200, ok: true, text: async () => '{"a":1}', headers: new Headers({ 'content-type': 'application/json' }) };
  };
  const r = await flexiGet('https://x.flexibee.eu/a.json', 'Basic xx', fake);
  assert.equal(seen.method, 'GET');
  assert.deepEqual(r.body, { a: 1 });
  const bad = await flexiGet('https://x.flexibee.eu/a.json', 'Basic xx', async () => ({ status: 401, ok: false, text: async () => '<html>', headers: new Headers() }));
  assert.equal(bad.body, undefined);
  assert.equal(bad.status, 401);
});

test('pickCandidateEvidences najde zálohy a deník podle názvu', () => {
  const list = { evidences: { evidence: [{ evidencePath: 'faktura-prijata' }, { evidencePath: 'zaloha-faktura-prijata' }, { evidencePath: 'ucetni-denik' }, { evidencePath: 'adresar' }] } };
  assert.deepEqual(pickCandidateEvidences(list).sort(), ['ucetni-denik', 'zaloha-faktura-prijata']);
});
