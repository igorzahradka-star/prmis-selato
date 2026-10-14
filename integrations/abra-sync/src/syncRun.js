/**
 * Jeden běh stahování: Abra -> porovnání s PRM_AbraDocs -> zápis změn -> výsledek do PRM_AbraSync -> vyřízení žádostí z aplikace.
 * Bez `write` se nic nezapisuje (ukáže jen, co by se stalo). Nic se nemaže, zapisuje se jen do PRM_AbraDocs a PRM_AbraSync.
 */

import { DOCS_LIST, SYNC_LIST } from './sharepoint.js';
import { buildMessage, planSync } from './plan.js';

const DOC_FIELDS = ['AbraId', 'Title', 'DocType', 'ProjectNumber', 'Partner', 'Description', 'IssueDate', 'DueDate', 'Currency', 'AmountNet', 'AmountNetCzk', 'Accounts', 'SyncedAt'];
const SYNC_FIELDS = ['Kind', 'Status', 'RequestedAt'];

/** Pole pro zápis: prázdné (null) hodnoty se při vytvoření vynechají; při úpravě se posílá null jen tam, kde položka už hodnotu měla. */
export function toFields(row, existingFields) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null && !(existingFields && existingFields[k] !== undefined)) {
      continue;
    }
    out[k] = v;
  }
  return out;
}

/**
 * @param {{fetchRows:()=>Promise<{rows:object[],skipped:object,details:string[]}>, graph:object, since:string, write:boolean, now?:()=>Date}} o
 */
export async function runSync({ fetchRows, graph, since, write, now = () => new Date() }) {
  const requests = await graph.listItems(SYNC_LIST, SYNC_FIELDS);
  const pending = requests.filter((i) => i.fields.Kind === 'Žádost' && i.fields.Status === 'Čeká');
  let status = 'Hotovo';
  let message;
  let plan;
  try {
    const mapped = await fetchRows();
    const existing = (await graph.listItems(DOCS_LIST, DOC_FIELDS)).map((i) => ({ ...i.fields, spId: i.id, fields: i.fields }));
    plan = planSync(existing, mapped.rows, { since });
    message = buildMessage(plan, mapped);
    if (write) {
      const byId = new Map(existing.map((e) => [e.spId, e]));
      for (const row of plan.add) {
        await graph.createItem(DOCS_LIST, toFields(row));
      }
      for (const u of plan.update) {
        await graph.updateItem(DOCS_LIST, u.spId, toFields(u.row, byId.get(u.spId)?.fields));
      }
      for (const v of plan.vanish) {
        await graph.updateItem(DOCS_LIST, v.spId, { Description: v.Description });
      }
    }
  } catch (error) {
    status = 'Chyba';
    message = `Stahování z Abry selhalo: ${error instanceof Error ? error.message : String(error)}`.slice(0, 1000);
  }

  if (write) {
    const finished = now().toISOString();
    await graph.createItem(SYNC_LIST, { Title: `Stav ${finished.slice(0, 16).replace('T', ' ')}`, Kind: 'Stav', Status: status, FinishedAt: finished, Message: message });
    for (const p of pending) {
      await graph.updateItem(SYNC_LIST, p.id, { Status: status, FinishedAt: finished, Message: message });
    }
  }
  return { status, message, plan, pendingRequests: pending.length, written: write };
}
