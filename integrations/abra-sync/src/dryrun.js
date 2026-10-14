/**
 * ZKUŠEBNÍ BĚH „NA SUCHO“ — JEN ČTENÍ. Stáhne z Flexi zápisy účetního deníku, převede je na řádky PRM_AbraDocs a vypíše součty po projektech.
 * Nic nezapisuje do Abry ani do SharePointu; řádky ukládá jen do složky vystupy/ (mimo git).
 *
 * Spuštění (v této složce):  node src/dryrun.js [--since=2026-01-01]
 * Pro kontrolu: součty po projektech porovnat s reportem Abry „Účetní analýza zakázky“.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ask, askHidden } from './credentials.js';
import { DEFAULT_BASE, assertAllowedBase, buildUrl, basicAuth, flexiGet } from './flexiClient.js';
import { DEFAULT_SINCE } from './config.js';
import { JOURNAL_EVIDENCE, mapJournalBatch } from './journalMapping.js';
import { buildTypeIndex, mapBatch } from './mapping.js';
import { EVIDENCES, FIELDS } from './config.js';
import { buildMessage, planSync } from './plan.js';

export const JOURNAL_FIELDS = ['idUcetniDenik', 'doklad', 'modul', 'datUcto', 'datVyst', 'datSplat', 'mdUcet', 'dalUcet', 'sumTuz', 'sumMen', 'mena', 'zakazka', 'popis', 'nazFirmy', 'firma'];

const arg = process.argv.find((a) => a.indexOf('--since=') === 0);
const since = arg ? arg.slice('--since='.length) : DEFAULT_SINCE;
if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
  throw new Error('Datum --since musí být ve tvaru RRRR-MM-DD.');
}

const base = assertAllowedBase(process.env.FLEXI_BASE || DEFAULT_BASE);
console.log(`Zkušební běh (jen čtení): ${base}\nZápisy deníku od ${since}`);
const user = await ask('Přihlašovací jméno do Abry: ');
const password = await askHidden('Heslo (nezobrazuje se): ');
const auth = basicAuth(user, password);

const url = buildUrl(base, `${JOURNAL_EVIDENCE}/(datUcto gte '${since}').json`, { limit: 0, detail: `custom:${JOURNAL_FIELDS.join(',')}` });
const response = await flexiGet(url, auth);
if (!response.ok || !response.body) {
  console.log(`CHYBA ${response.status}: ${response.text.slice(0, 300).replace(/\s+/g, ' ')}`);
  process.exit(1);
}
const records = response.body.winstrom?.[JOURNAL_EVIDENCE] ?? [];
console.log(`Staženo zápisů deníku: ${records.length}`);

const syncedAt = new Date().toISOString();
const mapped = mapJournalBatch(records, { syncedAt });

// Zálohové doklady (jen zobrazení, nezapočítávají se): jsou to faktury přijaté/vydané s typem dokladu „záloha“ (typDokladu.zalohFaktura / zdd).
const invoiceFields = ['id', 'kod', 'firma', 'popis', 'datVyst', 'datSplat', 'mena', 'sumZklCelkem', 'sumZklCelkemMen', 'zakazka', 'typDokl'];
for (const { evidence, docType } of EVIDENCES) {
  const typeEvidence = `typ-faktury-${docType === 'prijata' ? 'prijate' : 'vydane'}`;
  const types = await flexiGet(buildUrl(base, `${typeEvidence}.json`, { limit: 0, detail: 'custom:kod,typDoklK' }), auth);
  const invoices = await flexiGet(buildUrl(base, `${evidence}/(datVyst gte '${since}').json`, { limit: 0, detail: `custom:${invoiceFields.join(',')}` }), auth);
  if (!types.ok || !invoices.ok) {
    console.log(`Zálohy ${evidence}: nepodařilo se stáhnout (typy ${types.status}, doklady ${invoices.status})`);
    continue;
  }
  const typeIndex = buildTypeIndex(types.body.winstrom[typeEvidence] ?? []);
  const docs = invoices.body.winstrom[evidence] ?? [];
  const advance = mapBatch(docs.filter((d) => typeIndex.get(String(d[FIELDS.docKind] ?? '').replace(/^code:/, '')) === 'zaloha'), { evidence, docType, syncedAt, typeIndex });
  console.log(`Zálohy ${evidence}: dokladů celkem ${docs.length}, zálohových se zakázkou ${advance.rows.length}`);
  mapped.rows.push(...advance.rows);
}
const plan = planSync([], mapped.rows, { since });
console.log(`Řádků pro PRMIS: ${mapped.rows.length}`);
console.log(`Zpráva do PRM_AbraSync by byla: ${buildMessage(plan, mapped)}`);

const totals = {};
for (const r of mapped.rows) {
  const t = (totals[r.ProjectNumber] ??= { naklad: 0, vynos: 0, rows: 0 });
  if (r.DocType.indexOf('zaloha') === 0) {
    continue; // zálohy se do součtů nepočítají
  }
  t[r.DocType === 'prijata' ? 'naklad' : 'vynos'] += r.AmountNetCzk ?? r.AmountNet;
  t.rows += 1;
}
const fmt = (n) => n.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
console.log('\nProjekt   řádků        náklad [Kč]         výnos [Kč]');
for (const [k, v] of Object.entries(totals).sort()) {
  console.log(`${k.padEnd(8)} ${String(v.rows).padStart(6)} ${fmt(v.naklad).padStart(18)} ${fmt(v.vynos).padStart(18)}`);
}

const outDir = join(process.cwd(), 'vystupy', `dryrun-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'radky.json'), JSON.stringify(mapped.rows, null, 2), 'utf8');
writeFileSync(join(outDir, 'zapisy-denik.json'), JSON.stringify(records, null, 2), 'utf8');
console.log(`\nHotovo. Řádky a surové zápisy jsou ve složce: ${outDir}`);
