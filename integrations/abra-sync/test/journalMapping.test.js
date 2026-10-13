// Tvar zápisů odpovídá ručnímu exportu XML (názvy polí), částky a texty jsou vymyšlené. Tvar JSON z API (odkazy "code:…") je odhad.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapJournalEntry, mapJournalBatch } from '../src/journalMapping.js';
import { buildMessage, planSync } from '../src/plan.js';

const SYNCED = '2026-10-14T05:00:00.000Z';
const entry = (over = {}) => ({
  idUcetniDenik: '2147483750',
  doklad: 'PF0033/2026',
  modul: 'FAP',
  datVyst: '2026-10-08',
  datUcto: '2026-10-08',
  datSplat: '2026-10-22',
  mdUcet: 'code:518001',
  dalUcet: 'code:321001',
  sumTuz: '17200.0',
  sumMen: '0.0',
  mena: 'code:CZK',
  zakazka: 'code:26005',
  popis: 'technický dozor',
  nazFirmy: 'Dodavatel s.r.o.',
  ...over
});
const o = { syncedAt: SYNCED };

test('faktura přijatá: řádek nákladu na zakázku', () => {
  const r = mapJournalEntry(entry(), o);
  assert.deepEqual(r.rows, [{
    Title: 'PF0033/2026', AbraId: 'ucetni-denik:2147483750', DocType: 'prijata', ProjectNumber: '26005', Partner: 'Dodavatel s.r.o.',
    Description: 'technický dozor', IssueDate: '2026-10-08T12:00:00.000Z', DueDate: '2026-10-22T12:00:00.000Z', Currency: 'CZK',
    AmountNet: 17200, AmountNetCzk: null, Accounts: '518001', SyncedAt: SYNCED
  }]);
});

test('jedna faktura rozpadnutá na víc zakázek: každý zápis je vlastní řádek, součet sedí', () => {
  const batch = mapJournalBatch([
    entry({ idUcetniDenik: '1', sumTuz: '8600.0', zakazka: 'code:26001' }),
    entry({ idUcetniDenik: '2', sumTuz: '12900.0', zakazka: 'code:26002' }),
    entry({ idUcetniDenik: '3', sumTuz: '17200.0', zakazka: 'code:26005' }),
    entry({ idUcetniDenik: '4', sumTuz: '4300.0', zakazka: '' })
  ], o);
  assert.equal(batch.rows.length, 3);
  assert.equal(batch.skipped['bez-zakazky'], 1);
  assert.equal(batch.rows.reduce((a, r) => a + r.AmountNet, 0), 38700);
});

test('nepřenáší se: DPH, závazky a banka (bez nákladového/výnosového účtu)', () => {
  assert.deepEqual(mapJournalEntry(entry({ mdUcet: 'code:343100', dalUcet: 'code:321001' }), o), { rows: [] });
  assert.deepEqual(mapJournalEntry(entry({ mdUcet: 'code:321001', dalUcet: 'code:221001', zakazka: '' }), o), { rows: [] });
});

test('výnos na vydané faktuře v EUR: AmountNet v EUR, AmountNetCzk zaúčtovaná částka v Kč', () => {
  const r = mapJournalEntry(entry({ idUcetniDenik: '9', doklad: 'VF1-0004/2026', modul: 'FAV', mdUcet: 'code:311001', dalUcet: 'code:602001', sumTuz: '1000000.0', sumMen: '40918.0', mena: 'code:EUR', zakazka: 'code:26001' }), o).rows[0];
  assert.equal(r.DocType, 'vydana');
  assert.equal(r.Currency, 'EUR');
  assert.equal(r.AmountNet, 40918);
  assert.equal(r.AmountNetCzk, 1000000);
});

test('záporné zaokrouhlení výnosu v EUR: obě částky záporné', () => {
  const r = mapJournalEntry(entry({ mdUcet: 'code:311001', dalUcet: 'code:602001', sumTuz: '-7.33', sumMen: '-0.3', mena: 'code:EUR', zakazka: 'code:26001', popis: 'Zaokrouhleno' }), o).rows[0];
  assert.equal(r.AmountNet, -0.3);
  assert.equal(r.AmountNetCzk, -7.33);
});

test('záporný náklad: výnosový doklad připisuje na nákladový účet (DAL 518) = DocType prijata, záporná částka', () => {
  const r = mapJournalEntry(entry({ modul: 'FAV', mdUcet: 'code:311001', dalUcet: 'code:518001', sumTuz: '500.0' }), o).rows[0];
  assert.equal(r.DocType, 'prijata');
  assert.equal(r.AmountNet, -500);
});

test('storno nákladu prohozenými účty je záporné', () => {
  const r = mapJournalEntry(entry({ mdUcet: 'code:321001', dalUcet: 'code:518001', sumTuz: '400.0' }), o).rows[0];
  assert.equal(r.AmountNet, -400);
});

test('přeúčtování mezi nákladovými účty: dva řádky s různými AbraId', () => {
  const rows = mapJournalEntry(entry({ mdUcet: 'code:518200', dalUcet: 'code:501001', sumTuz: '100.0' }), o).rows;
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].AbraId, rows[1].AbraId);
  assert.equal(rows[0].AmountNet + rows[1].AmountNet, 0);
});

test('zakázka, která není číslem projektu, a chybějící částka se hlásí', () => {
  assert.equal(mapJournalEntry(entry({ zakazka: 'code:SERVIS' }), o).skipped, 'zakazka-neodpovida');
  assert.equal(mapJournalEntry(entry({ sumTuz: undefined }), o).skipped, 'bez-castky');
  assert.equal(mapJournalEntry(entry({ idUcetniDenik: '' }), o).skipped, 'bez-id');
});

test('znovu stažený zápis beze změny se nezapisuje; změna částky ano', () => {
  const row = mapJournalEntry(entry(), o).rows[0];
  const existing = { spId: 7, ...row };
  assert.equal(planSync([existing], [row], { since: '2026-01-01' }).unchanged, 1);
  assert.equal(planSync([{ ...existing, AmountNet: 1 }], [row], { since: '2026-01-01' }).update.length, 1);
  const msg = buildMessage(planSync([], [row], { since: '2026-01-01' }), mapJournalBatch([entry({ zakazka: 'code:XY' })], o));
  assert.match(msg, /Přeskočeno 1 dokladů se zakázkou/);
});
