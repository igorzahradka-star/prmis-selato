/**
 * Čistá logika: zápis účetního deníku Flexi (evidence `ucetni-denik`) -> řádky PRM_AbraDocs.
 * Názvy polí potvrzené z ručního exportu XML (13. 10. 2026): idUcetniDenik, doklad, modul, datUcto, datVyst, datSplat, mdUcet, dalUcet,
 * sumTuz (Kč), sumMen (měna dokladu), mena, zakazka, popis, nazFirmy, firma. Tvar JSON z API (odkazy jako "code:518001") zatím neviděn.
 */

import { PROJECT_NUMBER_PATTERN, NATIVE_CURRENCIES } from './config.js';
import { classifyEntry } from './journal.js';
import { refCode, toNumber, toIsoDate } from './mapping.js';

export const JOURNAL_EVIDENCE = 'ucetni-denik';

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Druh dokladu podle toho, co zápis je: náklad -> přijatý doklad, výnos -> vydaný (záporný náklad na vydané faktuře je pořád náklad). */
function docTypeOf(kind) {
  return kind === 'naklad' ? 'prijata' : 'vydana';
}

function partnerOf(record) {
  const name = typeof record.nazFirmy === 'string' ? record.nazFirmy.trim() : '';
  if (name !== '') {
    return name;
  }
  const shown = record['firma@showAs'];
  if (typeof shown === 'string' && shown.trim() !== '') {
    const code = refCode(record.firma);
    return code !== '' && shown.indexOf(`${code}: `) === 0 ? shown.slice(code.length + 2).trim() : shown.trim();
  }
  return refCode(record.firma);
}

/**
 * @param {object} record  zápis deníku z Flexi
 * @param {{syncedAt:string}} options
 * @returns {{rows:object[], skipped?:'bez-zakazky'|'zakazka-neodpovida'|'bez-id'|'bez-castky', detail?:string}}
 *   `rows` je prázdné, když se zápis do PRMIS nepřenáší (banka, DPH, závazky…); `skipped` jen když by se přenášel, ale nejde to.
 */
export function mapJournalEntry(record, options) {
  const id = refCode(record.idUcetniDenik);
  const debit = refCode(record.mdUcet);
  const credit = refCode(record.dalUcet);
  const tuz = toNumber(record.sumTuz);
  if (tuz === undefined) {
    return { rows: [], skipped: id === '' ? 'bez-id' : 'bez-castky', detail: id };
  }
  const contributions = classifyEntry({ debitAccount: debit, creditAccount: credit, amount: round2(tuz) });
  if (contributions.length === 0) {
    return { rows: [] };
  }
  if (id === '') {
    return { rows: [], skipped: 'bez-id' };
  }
  const project = refCode(record.zakazka);
  if (project === '') {
    return { rows: [], skipped: 'bez-zakazky' };
  }
  if (!PROJECT_NUMBER_PATTERN.test(project)) {
    return { rows: [], skipped: 'zakazka-neodpovida', detail: project };
  }

  const currencyRaw = refCode(record.mena).toUpperCase() || 'CZK';
  const foreign = NATIVE_CURRENCIES.indexOf(currencyRaw) !== -1 && currencyRaw !== 'CZK';
  const men = toNumber(record.sumMen);
  const issue = toIsoDate(record.datVyst) ?? toIsoDate(record.datUcto) ?? null;

  const rows = [];
  for (const [i, c] of contributions.entries()) {
    const czk = round2(c.amount);
    if (czk === 0 && (!foreign || !men)) {
      continue;
    }
    const factor = tuz === 0 ? 1 : czk / round2(tuz); // +1 / -1: znaménko příspěvku proti zápisu
    rows.push({
      Title: refCode(record.doklad) || id,
      AbraId: contributions.length > 1 ? `${JOURNAL_EVIDENCE}:${id}#${i + 1}` : `${JOURNAL_EVIDENCE}:${id}`,
      DocType: docTypeOf(c.kind),
      ProjectNumber: project,
      Partner: partnerOf(record),
      Description: typeof record.popis === 'string' ? record.popis.trim() : '',
      IssueDate: issue,
      DueDate: toIsoDate(record.datSplat) ?? null,
      Currency: foreign ? currencyRaw : 'CZK',
      AmountNet: foreign && men !== undefined ? round2(Math.abs(men) * Math.sign(czk || factor)) : czk,
      AmountNetCzk: foreign ? czk : null,
      Accounts: c.account,
      SyncedAt: options.syncedAt
    });
  }
  return { rows };
}

/** Dávka zápisů deníku -> řádky + počty přeskočených (stejný tvar jako mapBatch, použitelné v buildMessage). */
export function mapJournalBatch(records, options) {
  const rows = [];
  const skipped = { 'bez-zakazky': 0, 'zakazka-neodpovida': 0, 'bez-id': 0, 'bez-castky': 0 };
  const details = [];
  const seen = new Set();
  for (const record of records) {
    const r = mapJournalEntry(record, options);
    if (r.skipped) {
      skipped[r.skipped] += 1;
      if (r.skipped !== 'bez-zakazky' && details.length < 10) {
        details.push(r.skipped + (r.detail ? `: ${r.detail}` : ''));
      }
    }
    for (const row of r.rows) {
      if (!seen.has(row.AbraId)) {
        seen.add(row.AbraId);
        rows.push(row);
      }
    }
  }
  return { rows, skipped, details };
}
