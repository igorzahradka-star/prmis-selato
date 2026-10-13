// Vzory řádků jsou převzaty z tvaru reportu Účetní deník (účty a typy zápisů), částky jsou vymyšlené.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyEntry, docTypeFromModule } from '../src/journal.js';

test('faktura přijatá: náklad 518 na MD je kladný náklad', () => {
  assert.deepEqual(classifyEntry({ debitAccount: '518200', creditAccount: '321001', amount: 12900 }), [{ kind: 'naklad', account: '518200', amount: 12900 }]);
});

test('DPH, banka a závazky se nepřenášejí', () => {
  assert.deepEqual(classifyEntry({ debitAccount: '343100', creditAccount: '321001', amount: 94.34 }), []);
  assert.deepEqual(classifyEntry({ debitAccount: '321001', creditAccount: '221001', amount: 449.23 }), []);
  assert.deepEqual(classifyEntry({ debitAccount: '568001', creditAccount: '221001', amount: 10 }), []); // bankovní poplatek zatím mimo
});

test('storno nákladu (náklad na straně DAL) je záporné', () => {
  assert.deepEqual(classifyEntry({ debitAccount: '221002', creditAccount: '518001', amount: 400 }), [{ kind: 'naklad', account: '518001', amount: -400 }]);
});

test('výnos 602 na DAL je kladný, dobropis (MD) záporný, kurzový zisk 663 se nebere', () => {
  assert.deepEqual(classifyEntry({ debitAccount: '311001', creditAccount: '602001', amount: 61328 }), [{ kind: 'vynos', account: '602001', amount: 61328 }]);
  assert.deepEqual(classifyEntry({ debitAccount: '602001', creditAccount: '311001', amount: 500 }), [{ kind: 'vynos', account: '602001', amount: -500 }]);
  assert.deepEqual(classifyEntry({ debitAccount: '221002', creditAccount: '663001', amount: 1997.4 }), []);
});

test('přeúčtování mezi nákladovými účty dá dva příspěvky, které se vyruší', () => {
  const r = classifyEntry({ debitAccount: '518200', creditAccount: '501001', amount: 100 });
  assert.equal(r.reduce((a, b) => a + b.amount, 0), 0);
});

test('druh dokladu podle modulu', () => {
  assert.equal(docTypeFromModule('FAP', 'naklad'), 'prijata');
  assert.equal(docTypeFromModule('ZAV', 'naklad'), 'prijata');
  assert.equal(docTypeFromModule('FAV', 'vynos'), 'vydana');
  assert.equal(docTypeFromModule('BAN', 'naklad'), undefined);
});
