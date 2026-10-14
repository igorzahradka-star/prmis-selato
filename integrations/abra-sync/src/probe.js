/**
 * SONDA do ABRA Flexi — zkouška připojení, JEN ČTENÍ. Nic nezapisuje do Abry ani do SharePointu.
 *
 * Spuštění (v této složce):  node src/probe.js
 * Zeptá se na přihlašovací jméno a heslo (heslo se při psaní nezobrazuje, nikam se neukládá) a uloží výpisy
 * do složky vystupy/ (ta není v gitu). Výpisy obsahují obchodní data firmy, ale žádné heslo.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { DEFAULT_BASE, assertAllowedBase, buildUrl, basicAuth, flexiGet, pickCandidateEvidences } from './flexiClient.js';

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

/** Načte heslo bez zobrazování znaků. */
function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      throw new Error('Heslo se zadává jen z klávesnice v okně příkazové řádky.');
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n' || c === '\u0004') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (c === '\u0003') {
          process.exit(1);
        }
        if (c === '\u007f' || c === '\b') {
          value = value.slice(0, -1);
        } else {
          value += c;
        }
      }
    };
    stdin.on('data', onData);
  });
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(process.cwd(), 'vystupy', stamp);
mkdirSync(outDir, { recursive: true });

function save(name, result) {
  const file = join(outDir, `${name}.json`);
  writeFileSync(file, result.body !== undefined ? JSON.stringify(result.body, null, 2) : result.text, 'utf8');
  return file;
}

async function fetchAndSave(label, base, path, params, auth) {
  const url = buildUrl(base, path, params);
  try {
    const r = await flexiGet(url, auth);
    const file = r.ok ? save(label, r) : undefined;
    console.log(`${r.ok ? 'OK ' : 'CHYBA'} ${r.status}  ${path}${r.ok ? `  -> ${file}` : `  ${r.text.slice(0, 200).replace(/\s+/g, ' ')}`}`);
    return r;
  } catch (error) {
    console.log(`CHYBA  ${path}  ${error instanceof Error ? error.message : error}`);
    return undefined;
  }
}

const base = assertAllowedBase(process.env.FLEXI_BASE || DEFAULT_BASE);
console.log(`Sonda do Flexi (jen čtení): ${base}`);
const user = await ask('Přihlašovací jméno do Abry: ');
const password = await askHidden('Heslo (nezobrazuje se): ');
const auth = basicAuth(user, password);

const first = await fetchAndSave('faktura-prijata-3', base, 'faktura-prijata.json', { limit: 3, detail: 'full' }, auth);
if (!first || first.status === 401) {
  console.log('\nPřihlášení se nepovedlo (nebo je v Abře zapnuté dvoufázové ověření). Nic dalšího se nezkouší.');
  process.exit(1);
}
await fetchAndSave('faktura-vydana-vlastnosti', base, 'faktura-vydana/properties.json', {}, auth);
await fetchAndSave('faktura-prijata-vlastnosti', base, 'faktura-prijata/properties.json', {}, auth);
await fetchAndSave('ucetni-denik-3', base, 'ucetni-denik.json', { limit: 3, detail: 'full' }, auth);
await fetchAndSave('ucetni-denik-vlastnosti', base, 'ucetni-denik/properties.json', {}, auth);
await fetchAndSave('zakazka-3', base, 'zakazka.json', { limit: 3 }, auth);
const list = await fetchAndSave('seznam-evidenci', base, 'evidence-list.json', {}, auth);

if (list && list.ok && list.body) {
  const candidates = pickCandidateEvidences(list.body).slice(0, 8);
  console.log(`\nMožné evidence zálohových dokladů / účetního deníku (odhad podle názvu): ${candidates.join(', ') || 'žádné nenalezeny'}`);
  for (const name of candidates) {
    await fetchAndSave(`${name}-vlastnosti`, base, `${name}/properties.json`, {}, auth);
    await fetchAndSave(`${name}-2`, base, `${name}.json`, { limit: 2, detail: 'full' }, auth);
  }
}
console.log(`\nHotovo. Výpisy jsou ve složce: ${outDir}`);
