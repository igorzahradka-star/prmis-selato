import test from 'node:test';
import assert from 'node:assert/strict';
import { runSync, toFields } from '../src/syncRun.js';
import { DOCS_LIST, SYNC_LIST } from '../src/sharepoint.js';

const row = (over = {}) => ({ Title: 'PF1', AbraId: 'ucetni-denik:1', DocType: 'prijata', ProjectNumber: '26001', Partner: 'X', Description: 'd', IssueDate: '2026-09-01T12:00:00.000Z', DueDate: null, Currency: 'CZK', AmountNet: 100, AmountNetCzk: null, Accounts: '518001', SyncedAt: '2026-10-14T05:00:00.000Z', ...over });

function fakeGraph({ docs = [], sync = [] } = {}) {
  const writes = [];
  return {
    writes,
    async listItems(name) {
      return name === DOCS_LIST ? docs : sync;
    },
    async createItem(name, fields) {
      writes.push(['create', name, fields]);
      return '99';
    },
    async updateItem(name, id, fields) {
      writes.push(['update', name, id, fields]);
    }
  };
}
const mapped = (rows) => ({ rows, skipped: { 'bez-zakazky': 0, 'zakazka-neodpovida': 0, 'bez-id': 0, 'bez-castky': 0 }, details: [] });
const NOW = () => new Date('2026-10-14T05:10:00Z');

test('náhled (bez write) nic nezapíše', async () => {
  const graph = fakeGraph({ sync: [{ id: '3', fields: { Kind: 'Žádost', Status: 'Čeká' } }] });
  const r = await runSync({ fetchRows: async () => mapped([row()]), graph, since: '2026-01-01', write: false, now: NOW });
  assert.equal(graph.writes.length, 0);
  assert.equal(r.plan.add.length, 1);
  assert.equal(r.pendingRequests, 1);
});

test('zápis: nový řádek se vytvoří bez prázdných polí, výsledek se zapíše a žádost se uzavře', async () => {
  const graph = fakeGraph({ sync: [{ id: '3', fields: { Kind: 'Žádost', Status: 'Čeká' } }, { id: '4', fields: { Kind: 'Stav', Status: 'Hotovo' } }] });
  const r = await runSync({ fetchRows: async () => mapped([row()]), graph, since: '2026-01-01', write: true, now: NOW });
  assert.equal(r.status, 'Hotovo');
  const created = graph.writes.filter((w) => w[0] === 'create');
  assert.equal(created[0][1], DOCS_LIST);
  assert.equal('DueDate' in created[0][2], false);
  assert.equal('AmountNetCzk' in created[0][2], false);
  assert.equal(created[1][1], SYNC_LIST);
  assert.equal(created[1][2].Kind, 'Stav');
  const closed = graph.writes.filter((w) => w[0] === 'update' && w[1] === SYNC_LIST);
  assert.equal(closed.length, 1);
  assert.equal(closed[0][2], '3');
  assert.equal(closed[0][3].Status, 'Hotovo');
});

test('beze změny se nic nezapisuje do PRM_AbraDocs; změněný řádek se upraví; zmizelý se označí', async () => {
  const same = { id: '10', fields: { ...row(), SyncedAt: 'x' } };
  const changed = { id: '11', fields: { ...row({ AbraId: 'ucetni-denik:2', AmountNet: 5 }) } };
  const gone = { id: '12', fields: { ...row({ AbraId: 'ucetni-denik:3', Description: 'stary' }) } };
  const graph = fakeGraph({ docs: [same, changed, gone] });
  const r = await runSync({ fetchRows: async () => mapped([row(), row({ AbraId: 'ucetni-denik:2', AmountNet: 100 })]), graph, since: '2026-01-01', write: true, now: NOW });
  const docWrites = graph.writes.filter((w) => w[1] === DOCS_LIST);
  assert.equal(docWrites.length, 2);
  assert.deepEqual(docWrites.map((w) => w[2]).sort(), ['11', '12']);
  assert.match(docWrites.find((w) => w[2] === '12')[3].Description, /^\[zmizel z Abry\] stary/);
  assert.equal(r.status, 'Hotovo');
});

test('chyba Abry: nic se neoznačí ani nezapíše do dokladů, zapíše se stav Chyba a žádost se uzavře jako Chyba', async () => {
  const graph = fakeGraph({ docs: [{ id: '10', fields: row() }], sync: [{ id: '3', fields: { Kind: 'Žádost', Status: 'Čeká' } }] });
  const r = await runSync({ fetchRows: async () => { throw new Error('Abra: nejde'); }, graph, since: '2026-01-01', write: true, now: NOW });
  assert.equal(r.status, 'Chyba');
  assert.equal(graph.writes.filter((w) => w[1] === DOCS_LIST).length, 0);
  assert.equal(graph.writes.find((w) => w[0] === 'create')[2].Status, 'Chyba');
  assert.equal(graph.writes.find((w) => w[0] === 'update')[3].Status, 'Chyba');
});

test('toFields: null se při úpravě pošle jen když položka hodnotu měla', () => {
  assert.deepEqual(toFields({ A: 1, B: null }), { A: 1 });
  assert.deepEqual(toFields({ A: 1, B: null }, { B: 5 }), { A: 1, B: null });
});
