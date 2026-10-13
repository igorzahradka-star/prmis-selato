// Testy na VYMYŠLENÝCH ukázkách (tvar odpovědi Flexi je odhad podle dokumentace, ne výpis z instance Revoltum).
import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateProportionally, mapFlexiDoc, mapBatch, refCode, toIsoDate, toNumber } from '../src/mapping.js';
import { planSync, buildMessage } from '../src/plan.js';

const SYNCED = '2026-10-14T05:00:00.000Z';
const base = (over = {}) => ({
  id: '101',
  kod: 'FP2026/0101',
  firma: 'code:ACME',
  'firma@showAs': 'ACME: ACME s.r.o.',
  popis: 'Dodávka střídačů',
  datVyst: '2026-03-15+01:00',
  datSplat: '2026-04-14+02:00',
  mena: 'code:CZK',
  sumZklCelkem: '125000.00',
  sumZklCelkemMen: '0.0',
  zakazka: 'code:26001',
  typDokl: 'code:FAKTURA',
  ...over
});
const opts = { evidence: 'faktura-prijata', docType: 'prijata', syncedAt: SYNCED };

test('refCode zvládne všechny tvary odkazu', () => {
  assert.equal(refCode('code:26001'), '26001');
  assert.equal(refCode('ext:abc'), 'abc');
  assert.equal(refCode([{ kod: '26001' }]), '26001');
  assert.equal(refCode({ kod: '26001' }), '26001');
  assert.equal(refCode(undefined), '');
  assert.equal(refCode(''), '');
});

test('toIsoDate a toNumber', () => {
  assert.equal(toIsoDate('2026-03-15+01:00'), '2026-03-15T12:00:00.000Z');
  assert.equal(toIsoDate('2026-02-30'), undefined);
  assert.equal(toIsoDate(undefined), undefined);
  assert.equal(toNumber('12 345,50'), 12345.5);
  assert.equal(toNumber('abc'), undefined);
});

test('faktura přijatá v korunách', () => {
  const r = mapFlexiDoc(base(), { ...opts, accounts: ['518', '501', '518'] });
  assert.ok(r.ok);
  assert.deepEqual(r.row, {
    Title: 'FP2026/0101',
    AbraId: 'faktura-prijata:101',
    DocType: 'prijata',
    ProjectNumber: '26001',
    Partner: 'ACME s.r.o.',
    Description: 'Dodávka střídačů',
    IssueDate: '2026-03-15T12:00:00.000Z',
    DueDate: '2026-04-14T12:00:00.000Z',
    Currency: 'CZK',
    AmountNet: 125000,
    AmountNetCzk: null,
    Accounts: '501, 518',
    SyncedAt: SYNCED
  });
});

test('dobropis je záporný, ať je v Abře zadaný kladně i záporně', () => {
  for (const sum of ['8000.00', '-8000.00']) {
    const r = mapFlexiDoc(base({ typDokl: 'code:DOBROPIS', sumZklCelkem: sum }), opts);
    assert.equal(r.row.AmountNet, -8000);
  }
});

test('cizí měna EUR/USD: částka v měně dokladu', () => {
  const r = mapFlexiDoc(base({ mena: 'code:EUR', sumZklCelkem: '25300.00', sumZklCelkemMen: '1000.00' }), opts);
  assert.equal(r.row.Currency, 'EUR');
  assert.equal(r.row.AmountNet, 1000);
  assert.equal(r.row.AmountNetCzk, 25300);
  assert.equal(r.row.Description, 'Dodávka střídačů');
});

test('jiná měna (PLN): přepočtená částka v CZK a poznámka', () => {
  const r = mapFlexiDoc(base({ mena: 'code:PLN', sumZklCelkem: '5600.50', sumZklCelkemMen: '1000.00' }), opts);
  assert.equal(r.row.Currency, 'CZK');
  assert.equal(r.row.AmountNet, 5600.5);
  assert.match(r.row.Description, /původně PLN/);
});

test('zálohová faktura dostane druh podle volajícího', () => {
  const r = mapFlexiDoc(base(), { ...opts, evidence: 'nejaka-evidence', docType: 'zaloha-vydana' });
  assert.equal(r.row.DocType, 'zaloha-vydana');
  assert.equal(r.row.AbraId, 'nejaka-evidence:101');
});

test('doklad bez zakázky, s cizí zakázkou, bez id a bez částky se přeskočí', () => {
  assert.deepEqual(mapFlexiDoc(base({ zakazka: '' }), opts), { ok: false, reason: 'bez-zakazky' });
  assert.deepEqual(mapFlexiDoc(base({ zakazka: 'code:SERVIS-A' }), opts), { ok: false, reason: 'zakazka-neodpovida', detail: 'SERVIS-A' });
  assert.equal(mapFlexiDoc(base({ id: '' }), opts).reason, 'bez-id');
  assert.equal(mapFlexiDoc(base({ sumZklCelkem: undefined }), opts).reason, 'bez-castky');
});

test('mapBatch: spočítá přeskočené a odstraní duplicity', () => {
  const batch = mapBatch([base(), base(), base({ id: '102', zakazka: '' }), base({ id: '103', zakazka: 'code:XY' })], opts);
  assert.equal(batch.rows.length, 1);
  assert.equal(batch.skipped['bez-zakazky'], 1);
  assert.equal(batch.skipped['zakazka-neodpovida'], 1);
});

const existing = (over) => ({ spId: 1, AbraId: 'faktura-prijata:101', Title: 'FP2026/0101', DocType: 'prijata', ProjectNumber: '26001', Partner: 'ACME s.r.o.', Description: 'Dodávka střídačů', IssueDate: '2026-03-15T12:00:00Z', DueDate: '2026-04-14T12:00:00Z', Currency: 'CZK', AmountNet: 125000, Accounts: '', ...over });
const fetchedRow = () => mapFlexiDoc(base(), opts).row;

test('planSync: nový, beze změny, upravený', () => {
  assert.equal(planSync([], [fetchedRow()], { since: '2026-01-01' }).add.length, 1);
  const same = planSync([existing()], [fetchedRow()], { since: '2026-01-01' });
  assert.equal(same.unchanged, 1);
  assert.equal(same.update.length + same.add.length, 0);
  const changed = planSync([existing({ AmountNet: 100000 })], [fetchedRow()], { since: '2026-01-01' });
  assert.equal(changed.update.length, 1);
  assert.equal(changed.update[0].spId, 1);
});

test('planSync: zmizelý doklad se jen označí, a jen jednou; starší než období se nechá', () => {
  const gone = existing({ spId: 2, AbraId: 'faktura-prijata:999' });
  const old = existing({ spId: 3, AbraId: 'faktura-prijata:888', IssueDate: '2025-12-01T12:00:00Z' });
  const p = planSync([existing(), gone, old], [fetchedRow()], { since: '2026-01-01' });
  assert.equal(p.vanish.length, 1);
  assert.equal(p.vanish[0].spId, 2);
  assert.match(p.vanish[0].Description, /^\[zmizel z Abry\] /);
  const again = planSync([existing(), { ...gone, Description: p.vanish[0].Description }, old], [fetchedRow()], { since: '2026-01-01' });
  assert.equal(again.vanish.length, 0);
});

test('planSync: doklad, který se vrátil, se opraví (označení zmizí)', () => {
  const marked = existing({ Description: '[zmizel z Abry] Dodávka střídačů' });
  const p = planSync([marked], [fetchedRow()], { since: '2026-01-01' });
  assert.equal(p.update.length, 1);
  assert.equal(p.update[0].row.Description, 'Dodávka střídačů');
});

test('planSync: pojistka proti hromadnému „zmizení“', () => {
  const many = Array.from({ length: 20 }, (_, i) => existing({ spId: i + 1, AbraId: `faktura-prijata:${i + 500}` }));
  const p = planSync(many, [], { since: '2026-01-01' });
  assert.equal(p.vanish.length, 0);
  assert.ok(p.warning);
});

test('buildMessage: česká zpráva', () => {
  const mapped = mapBatch([base(), base({ id: '2', zakazka: 'code:XY' })], opts);
  const msg = buildMessage(planSync([], mapped.rows, { since: '2026-01-01' }), mapped);
  assert.match(msg, /Nových 1, upravených 0, beze změny 0\./);
  assert.match(msg, /Přeskočeno 1 dokladů se zakázkou/);
});

test('dobropis v EUR: obě částky záporné; jiná měna a CZK nemají AmountNetCzk', () => {
  const r = mapFlexiDoc(base({ typDokl: 'code:DOBROPIS', mena: 'code:EUR', sumZklCelkem: '2530.00', sumZklCelkemMen: '100.00' }), opts);
  assert.equal(r.row.AmountNet, -100);
  assert.equal(r.row.AmountNetCzk, -2530);
  assert.equal(mapFlexiDoc(base({ mena: 'code:PLN' }), opts).row.AmountNetCzk, null);
  assert.equal(mapFlexiDoc(base(), opts).row.AmountNetCzk, null);
});

test('rozpad AmountNetCzk na řádky stejným poměrem, součet přesně sedí', () => {
  // doklad 100 EUR = 2 530,01 Kč, rozpad 33,33 / 33,33 / 33,34 EUR
  const parts = allocateProportionally(2530.01, [33.33, 33.33, 33.34]);
  assert.equal(Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100, 2530.01);
  assert.ok(Math.abs(parts[0] - 843.25) < 0.02);
  assert.deepEqual(allocateProportionally(-1000, [-1, -3]), [-250, -750]);
  assert.deepEqual(allocateProportionally(500, []), []);
  assert.deepEqual(allocateProportionally(500, [0, 0]), [500, 0]);
});

test('planSync: změna AmountNetCzk je změna řádku', () => {
  const row = mapFlexiDoc(base({ mena: 'code:EUR', sumZklCelkem: '25300', sumZklCelkemMen: '1000' }), opts).row;
  const cur = { spId: 1, ...row, AmountNetCzk: 25000 };
  assert.equal(planSync([cur], [row], { since: '2026-01-01' }).update.length, 1);
  assert.equal(planSync([{ spId: 1, ...row }], [row], { since: '2026-01-01' }).unchanged, 1);
});
