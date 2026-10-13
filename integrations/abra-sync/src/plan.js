/**
 * Čistá logika: co zapsat do SharePointu. Porovná stažené řádky s tím, co už v PRM_AbraDocs je.
 * Nikdy nic nemaže — doklad, který z Abry zmizel, jen označí v Popisu.
 */

import { VANISHED_MARK } from './config.js';

const COMPARED = ['Title', 'DocType', 'ProjectNumber', 'Partner', 'Description', 'IssueDate', 'DueDate', 'Currency', 'AmountNet', 'AmountNetCzk', 'Accounts'];

function day(value) {
  return value ? String(value).slice(0, 10) : '';
}

function same(field, a, b) {
  if (field === 'IssueDate' || field === 'DueDate') {
    return day(a) === day(b);
  }
  if (field === 'AmountNet' || field === 'AmountNetCzk') {
    return (a == null) === (b == null) && Math.abs(Number(a ?? 0) - Number(b ?? 0)) < 0.005;
  }
  return (a ?? '') === (b ?? '');
}

/**
 * @param {{spId:number,AbraId:string,Description?:string,IssueDate?:string}[]} existing  položky z PRM_AbraDocs
 * @param {object[]} fetched  řádky z mapBatch
 * @param {{since:string, mass?:{minCount:number,maxRatio:number}}} options  `since` = začátek stahovaného období (YYYY-MM-DD)
 */
export function planSync(existing, fetched, options) {
  const mass = options.mass ?? { minCount: 10, maxRatio: 0.5 };
  const byAbraId = new Map(existing.map((e) => [e.AbraId, e]));
  const fetchedIds = new Set(fetched.map((r) => r.AbraId));

  const add = [];
  const update = [];
  let unchanged = 0;
  for (const row of fetched) {
    const current = byAbraId.get(row.AbraId);
    if (!current) {
      add.push(row);
    } else if (COMPARED.some((f) => !same(f, current[f], row[f]))) {
      update.push({ spId: current.spId, row });
    } else {
      unchanged += 1;
    }
  }

  // Zmizelé: jen v období, které se stahovalo (o starších nevíme nic), a ještě neoznačené.
  const inScope = existing.filter((e) => day(e.IssueDate) !== '' && day(e.IssueDate) >= options.since);
  const candidates = inScope.filter((e) => !fetchedIds.has(e.AbraId) && (e.Description ?? '').indexOf(VANISHED_MARK) !== 0);

  let vanish = candidates.map((e) => ({ spId: e.spId, Description: VANISHED_MARK + (e.Description ?? '') }));
  let warning;
  // Pojistka: když by „zmizela“ většina dokladů (výpadek, špatný filtr, prázdná odpověď), neoznačuje se nic.
  if (candidates.length >= mass.minCount && candidates.length / Math.max(inScope.length, 1) > mass.maxRatio) {
    warning = `Z Abry zmizelo ${candidates.length} z ${inScope.length} dokladů najednou — nepravděpodobné, nic jsem neoznačil. Zkontrolujte připojení a filtr.`;
    vanish = [];
  } else if (fetched.length === 0 && inScope.length >= mass.minCount) {
    warning = 'Abra nevrátila žádné doklady, ačkoli v seznamu nějaké jsou — nic jsem neoznačil.';
    vanish = [];
  }
  return { add, update, vanish, unchanged, warning };
}

/** Česká zpráva do PRM_AbraSync (Kind = Stav). */
export function buildMessage(plan, mapped) {
  const parts = [`Nových ${plan.add.length}, upravených ${plan.update.length}, beze změny ${plan.unchanged}.`];
  if (plan.vanish.length > 0) {
    parts.push(`Zmizelo z Abry ${plan.vanish.length} (označeno).`);
  }
  const s = mapped.skipped;
  if (s['zakazka-neodpovida'] > 0) {
    parts.push(`Přeskočeno ${s['zakazka-neodpovida']} dokladů se zakázkou, která není číslem projektu.`);
  }
  if (s['bez-castky'] + s['bez-id'] > 0) {
    parts.push(`Přeskočeno ${s['bez-castky'] + s['bez-id']} nečitelných dokladů.`);
  }
  if (plan.warning) {
    parts.push(plan.warning);
  }
  return parts.join(' ');
}
