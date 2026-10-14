/**
 * HLAVNÍ PŘÍKAZ prostředníka.   node src/sync.js [--since=2026-01-01] [--write]
 * Bez --write je to jen náhled (nic se do SharePointu nezapíše; SharePoint se použije jen ke čtení).
 *
 * Přihlašovací údaje (nikdy v kódu ani v repozitáři):
 *   Abra:       proměnné ABRA_USER a ABRA_PASSWORD, jinak se program zeptá (heslo skrytě)
 *   SharePoint: proměnná PRM_CLIENT_SECRET (tajný klíč registrace aplikace), jinak se program zeptá (skrytě)
 */

import { ask, askHidden } from './credentials.js';
import { DEFAULT_BASE, assertAllowedBase, basicAuth } from './flexiClient.js';
import { DEFAULT_SINCE } from './config.js';
import { createGraphClient } from './sharepoint.js';
import { fetchAbraRows } from './abraFetch.js';
import { runSync } from './syncRun.js';

const arg = (name) => process.argv.find((a) => a.indexOf(`--${name}=`) === 0)?.slice(name.length + 3);
const since = arg('since') ?? DEFAULT_SINCE;
const write = process.argv.includes('--write');
if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
  throw new Error('Datum --since musí být ve tvaru RRRR-MM-DD.');
}

const base = assertAllowedBase(process.env.FLEXI_BASE || DEFAULT_BASE);
console.log(`${write ? 'ZÁPIS DO SHAREPOINTU' : 'Náhled (nezapisuje se)'} · doklady od ${since}`);
const user = process.env.ABRA_USER || (await ask('Přihlašovací jméno do Abry: '));
const password = process.env.ABRA_PASSWORD || (await askHidden('Heslo do Abry (nezobrazuje se): '));
const secret = process.env.PRM_CLIENT_SECRET || (await askHidden('Tajný klíč aplikace PRM Abra (nezobrazuje se): '));

const auth = basicAuth(user, password);
const graph = createGraphClient({ clientSecret: secret });
const syncedAt = new Date().toISOString();

const result = await runSync({ fetchRows: () => fetchAbraRows({ base, auth, since, syncedAt }), graph, since, write });
console.log(`\nVýsledek: ${result.status}\n${result.message}`);
console.log(`Čekajících žádostí z aplikace: ${result.pendingRequests}${write ? ' (vyřízeno)' : ' (náhled je nevyřizuje)'}`);
if (!write) {
  console.log('Nic nebylo zapsáno. Pro skutečný zápis spusťte znovu s přepínačem --write.');
}
process.exit(result.status === 'Hotovo' ? 0 : 1);
