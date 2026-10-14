/**
 * Stažení dokladů z Flexi (JEN ČTENÍ) a převod na řádky PRM_AbraDocs: zápisy účetního deníku + zálohové doklady.
 */

import { buildUrl, flexiGet } from './flexiClient.js';
import { EVIDENCES, FIELDS } from './config.js';
import { JOURNAL_EVIDENCE, mapJournalBatch } from './journalMapping.js';
import { buildTypeIndex, mapBatch } from './mapping.js';

export const JOURNAL_FIELDS = ['idUcetniDenik', 'doklad', 'modul', 'datUcto', 'datVyst', 'datSplat', 'mdUcet', 'dalUcet', 'sumTuz', 'sumMen', 'mena', 'zakazka', 'popis', 'nazFirmy', 'firma'];
export const INVOICE_FIELDS = ['id', 'kod', 'firma', 'popis', 'datVyst', 'datSplat', 'mena', 'sumZklCelkem', 'sumZklCelkemMen', 'zakazka', 'typDokl'];

async function getOrThrow(url, auth, what, fetchImpl) {
  const r = await flexiGet(url, auth, fetchImpl);
  if (!r.ok || !r.body) {
    throw new Error(`Abra: ${what} se nepodařilo stáhnout (HTTP ${r.status}).`);
  }
  return r.body.winstrom ?? {};
}

/**
 * @returns {Promise<{rows:object[], skipped:object, details:string[], counts:{journal:number, advances:number}}>}
 */
export async function fetchAbraRows({ base, auth, since, syncedAt, fetchImpl }) {
  const journalUrl = buildUrl(base, `${JOURNAL_EVIDENCE}/(datUcto gte '${since}').json`, { limit: 0, detail: `custom:${JOURNAL_FIELDS.join(',')}` });
  const journal = (await getOrThrow(journalUrl, auth, 'účetní deník', fetchImpl))[JOURNAL_EVIDENCE] ?? [];
  const mapped = mapJournalBatch(journal, { syncedAt });
  const counts = { journal: journal.length, advances: 0 };

  // Zálohové doklady (jen zobrazení): faktury s typem dokladu záloha (typDokladu.zalohFaktura / zdd).
  for (const { evidence, docType } of EVIDENCES) {
    const typeEvidence = `typ-faktury-${docType === 'prijata' ? 'prijate' : 'vydane'}`;
    const typesUrl = buildUrl(base, `${typeEvidence}.json`, { limit: 0, detail: 'custom:kod,typDoklK' });
    const docsUrl = buildUrl(base, `${evidence}/(datVyst gte '${since}').json`, { limit: 0, detail: `custom:${INVOICE_FIELDS.join(',')}` });
    const types = (await getOrThrow(typesUrl, auth, `typy faktur (${typeEvidence})`, fetchImpl))[typeEvidence] ?? [];
    const docs = (await getOrThrow(docsUrl, auth, evidence, fetchImpl))[evidence] ?? [];
    const typeIndex = buildTypeIndex(types);
    const isAdvance = (d) => typeIndex.get(String(d[FIELDS.docKind] ?? '').replace(/^code:/, '')) === 'zaloha';
    const advances = mapBatch(docs.filter(isAdvance), { evidence, docType, syncedAt, typeIndex });
    counts.advances += advances.rows.length;
    mapped.rows.push(...advances.rows);
    for (const k of Object.keys(mapped.skipped)) {
      mapped.skipped[k] += advances.skipped[k];
    }
  }
  return { ...mapped, counts };
}
