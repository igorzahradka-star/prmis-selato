/**
 * Čistá logika: zápis účetního deníku -> příspěvek do nákladů nebo výnosů projektu.
 *
 * Zjištěno z reportů Účetní deník a Účetní analýza zakázky (13. 10. 2026): u zápisu je Zakázka, Účet MD, Účet DAL, Částka [Kč], Popis.
 * Do PRMIS patří jen zápisy, které se dotýkají nákladových nebo výnosových účtů; banka, závazky, DPH (343…) se přeskočí.
 * Storno a dobropis mají strany prohozené, proto se znaménko řídí tím, na které straně účtu je náklad/výnos.
 */

/** Nákladové účty, které se berou (rozhodnutí Igora: 501, 518, 512). Další (např. 568 bankovní poplatky) se zatím přeskakují. */
export const COST_ACCOUNT_PREFIXES = ['501', '512', '518'];

/** Výnosové účty. V datech jsou 602xxx a 604xxx (v zadání bylo 601 — k potvrzení), proto celá skupina 60. */
export const REVENUE_ACCOUNT_PREFIXES = ['60'];

const startsWithAny = (account, prefixes) => prefixes.some((p) => String(account ?? '').trim().indexOf(p) === 0);

/**
 * @param {{debitAccount:string, creditAccount:string, amount:number}} entry  částka v Kč, jak je v deníku (kladná; Abra strany prohazuje)
 * @returns {{kind:'naklad'|'vynos', account:string, amount:number}[]}  0 řádků = zápis se do PRMIS nepřenáší; náklad na MD = kladný, na DAL (storno) = záporný;
 *          výnos na DAL = kladný, na MD (dobropis, storno) = záporný
 */
export function classifyEntry(entry) {
  const out = [];
  const amount = entry.amount;
  if (startsWithAny(entry.debitAccount, COST_ACCOUNT_PREFIXES)) {
    out.push({ kind: 'naklad', account: entry.debitAccount, amount });
  }
  if (startsWithAny(entry.creditAccount, COST_ACCOUNT_PREFIXES)) {
    out.push({ kind: 'naklad', account: entry.creditAccount, amount: -amount });
  }
  if (startsWithAny(entry.creditAccount, REVENUE_ACCOUNT_PREFIXES)) {
    out.push({ kind: 'vynos', account: entry.creditAccount, amount });
  }
  if (startsWithAny(entry.debitAccount, REVENUE_ACCOUNT_PREFIXES)) {
    out.push({ kind: 'vynos', account: entry.debitAccount, amount: -amount });
  }
  return out;
}

/** Druh dokladu podle modulu v deníku (zjištěno: FAP = faktury přijaté, ZAV = závazky, BAN = banka). Ostatní zatím neznámé. */
export function docTypeFromModule(moduleCode, kind) {
  const m = String(moduleCode ?? '').trim().toUpperCase();
  if (m === 'FAP' || m === 'ZAV') {
    return kind === 'naklad' ? 'prijata' : undefined;
  }
  if (m === 'FAV') {
    return kind === 'vynos' ? 'vydana' : undefined;
  }
  return undefined;
}
