/**
 * Čistá logika: doklad z Flexi (JSON) -> řádek seznamu PRM_AbraDocs. Žádná síť, žádné přihlašování — jen data dovnitř a ven,
 * aby se dala testovat na ukázkách. Názvy polí Flexi jsou v config.js (nepotvrzené).
 *
 * Smlouva s aplikací: docs/ABRA.md a spfx/src/data/schema.ts (PRM_ABRA_DOCS).
 */

import { FIELDS, PROJECT_NUMBER_PATTERN, NATIVE_CURRENCIES, CREDIT_NOTE_PATTERN } from './config.js';

/** Hodnota odkazu ve Flexi: "code:ABC", "ext:xyz", "ABC", objekt s kódem nebo pole s jedním objektem -> kód. */
export function refCode(value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? refCode(value[0]) : '';
  }
  if (typeof value === 'object') {
    return refCode(value.kod ?? value.code ?? '');
  }
  return String(value).trim().replace(/^(code|ext):/i, '').trim();
}

/** Zobrazovaný název odkazu (`pole@showAs`), bez úvodního „kód: “. */
function refLabel(record, field) {
  const shown = record[`${field}@showAs`];
  const code = refCode(record[field]);
  if (typeof shown !== 'string' || shown.trim() === '') {
    return code;
  }
  const prefix = `${code}: `;
  return code !== '' && shown.indexOf(prefix) === 0 ? shown.slice(prefix.length).trim() : shown.trim();
}

/** Číslo z Flexi (často text "12345.00") -> number, jinak undefined. */
export function toNumber(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const n = typeof value === 'number' ? value : Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/** Datum z Flexi ("2026-03-15", "2026-03-15+01:00", …) -> ISO poledne UTC (aby se den neposunul), jinak undefined. */
export function toIsoDate(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) {
    return undefined;
  }
  const iso = `${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) || d.toISOString() !== iso ? undefined : iso;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function isCreditNote(record) {
  const kind = `${refCode(record[FIELDS.docKind])} ${record[`${FIELDS.docKind}@showAs`] ?? ''}`;
  return CREDIT_NOTE_PATTERN.test(kind);
}

/**
 * Převede jeden doklad.
 *
 * @param {object} record  doklad z Flexi (JSON)
 * @param {{evidence:string, docType:string, accounts?:string[], syncedAt:string}} options
 * @returns {{ok:true,row:object}|{ok:false,reason:'bez-zakazky'|'zakazka-neodpovida'|'bez-id'|'bez-castky',detail?:string}}
 */
export function mapFlexiDoc(record, options) {
  const id = refCode(record[FIELDS.id]);
  if (id === '') {
    return { ok: false, reason: 'bez-id' };
  }
  const project = refCode(record[FIELDS.project]);
  if (project === '') {
    return { ok: false, reason: 'bez-zakazky' };
  }
  if (!PROJECT_NUMBER_PATTERN.test(project)) {
    return { ok: false, reason: 'zakazka-neodpovida', detail: project };
  }

  const currencyRaw = refCode(record[FIELDS.currency]).toUpperCase() || 'CZK';
  const native = NATIVE_CURRENCIES.indexOf(currencyRaw) !== -1;
  const useForeign = native && currencyRaw !== 'CZK';
  const rawAmount = toNumber(record[useForeign ? FIELDS.netForeign : FIELDS.netCzk]);
  if (rawAmount === undefined) {
    return { ok: false, reason: 'bez-castky', detail: id };
  }
  const credit = isCreditNote(record);
  const sign = (n) => (credit ? -Math.abs(n) : n);
  const amount = sign(round2(rawAmount));
  // Cizí měna (EUR/USD): přenáší se i částka v Kč, jak ji zaúčtovala Abra (kurz dne zaúčtování) — žádný vlastní přepočet.
  const czk = useForeign ? toNumber(record[FIELDS.netCzk]) : undefined;

  const baseDescription = typeof record[FIELDS.description] === 'string' ? record[FIELDS.description].trim() : '';
  const convertedNote = native ? '' : `(původně ${currencyRaw}, částka přepočtená v Kč)`;
  const accounts = Array.from(new Set((options.accounts ?? []).map((a) => String(a).trim()).filter((a) => a !== ''))).sort();

  return {
    ok: true,
    row: {
      Title: refCode(record[FIELDS.code]) || id,
      AbraId: `${options.evidence}:${id}`,
      DocType: options.docType,
      ProjectNumber: project,
      Partner: refLabel(record, FIELDS.partner),
      Description: [baseDescription, convertedNote].filter((t) => t !== '').join(' '),
      IssueDate: toIsoDate(record[FIELDS.issueDate]) ?? null,
      DueDate: toIsoDate(record[FIELDS.dueDate]) ?? null,
      Currency: native ? currencyRaw : 'CZK',
      AmountNet: amount,
      AmountNetCzk: czk === undefined ? null : sign(round2(czk)),
      Accounts: accounts.join(', '),
      SyncedAt: options.syncedAt
    }
  };
}

/**
 * Převede dávku dokladů jedné evidence a spočítá, co se přeskočilo (pro zprávu do PRM_AbraSync).
 * @param {object[]} records
 * @param {{evidence:string,docType:string,syncedAt:string,accountsById?:Record<string,string[]>}} options
 */
export function mapBatch(records, options) {
  const rows = [];
  const skipped = { 'bez-zakazky': 0, 'zakazka-neodpovida': 0, 'bez-id': 0, 'bez-castky': 0 };
  const details = [];
  const seen = new Set();
  for (const record of records) {
    const id = refCode(record[FIELDS.id]);
    const result = mapFlexiDoc(record, { ...options, accounts: (options.accountsById ?? {})[id] });
    if (!result.ok) {
      skipped[result.reason] += 1;
      if (result.reason !== 'bez-zakazky' && details.length < 10) {
        details.push(result.reason + (result.detail ? `: ${result.detail}` : ''));
      }
      continue;
    }
    if (seen.has(result.row.AbraId)) {
      continue; // stejný doklad dvakrát (např. přesah stránek) — zapíše se jednou
    }
    seen.add(result.row.AbraId);
    rows.push(result.row);
  }
  return { rows, skipped, details };
}

/**
 * Rozdělí částku dokladu mezi řádky stejným poměrem jako `weights` (např. částky řádků v měně dokladu), na haléře, tak aby součet
 * přesně dal `total`. Zbytek po zaokrouhlení dostane největší řádek. Slouží k rozpadu AmountNetCzk na řádky (řádek = část dokladu).
 * @param {number} total   zaúčtovaná částka dokladu v Kč
 * @param {number[]} weights  částky řádků (v měně dokladu)
 */
export function allocateProportionally(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) {
    return [];
  }
  if (sum === 0) {
    const parts = weights.map(() => 0);
    parts[0] = round2(total);
    return parts;
  }
  const parts = weights.map((w) => round2((total * w) / sum));
  const diff = round2(total - parts.reduce((a, b) => a + b, 0));
  if (diff !== 0) {
    let big = 0;
    weights.forEach((w, i) => {
      if (Math.abs(w) > Math.abs(weights[big])) {
        big = i;
      }
    });
    parts[big] = round2(parts[big] + diff);
  }
  return parts;
}
