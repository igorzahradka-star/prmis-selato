/**
 * Import účetního deníku z XML (ruční export z ABRA Flexi) — čistá logika bez SharePointu, Reactu a prohlížeče.
 *
 * Zrcadlí mapování prostředníka (`integrations/abra-sync/src/journal.js`, `journalMapping.js`), aby ruční import a denní stahování
 * dávaly stejné řádky se stejným `AbraId` (`ucetni-denik:<id>` a u zápisu s více příspěvky `#1`, `#2`). Import nikdy nemaže:
 * řádek se při shodě klíče aktualizuje, nový se přidá, ostatní zůstanou. Mapování při změně udržujte v obou místech stejné.
 */

import { AbraDoc } from './abraDocs';

export const JOURNAL_EVIDENCE = 'ucetni-denik';
export const PROJECT_NUMBER_PATTERN = /^\d{5}$/;
const NATIVE_CURRENCIES = ['CZK', 'EUR', 'USD'];
const COST_ACCOUNT_PREFIXES = ['501', '512', '518'];
const REVENUE_ACCOUNT_PREFIXES = ['60'];

// ---------------------------------------------------------------- jednoduchá čtečka XML

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  text: string;
  children: XmlNode[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e: string) => {
    if (e.charAt(0) === '#') {
      const code = e.charAt(1) === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : m;
    }
    return ENTITIES[e];
  });
}

/** Strom prvků z textu XML (komentáře, deklarace a CDATA se zpracují, jmenné prostory se neřeší). Chybný XML = výjimka. */
export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: '#root', attrs: {}, text: '', children: [] };
  const stack: XmlNode[] = [root];
  const tag = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!DOCTYPE[^>]*>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(xml)) !== null) {
    const top = stack[stack.length - 1];
    if (m.index > last) {
      top.text += decode(xml.slice(last, m.index));
    }
    last = tag.lastIndex;
    if (m[1] !== undefined) {
      top.text += m[1];
    } else if (m[3] !== undefined) {
      if (m[2] === '/') {
        if (stack.length < 2 || top.name !== m[3]) {
          throw new Error(`Chybné XML: neočekávaná koncová značka </${m[3]}>.`);
        }
        stack.pop();
      } else {
        const node: XmlNode = { name: m[3], attrs: {}, text: '', children: [] };
        const attr = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
        let a: RegExpExecArray | null;
        while ((a = attr.exec(m[4])) !== null) {
          node.attrs[a[1]] = decode(a[2] !== undefined ? a[2] : a[3]);
        }
        top.children.push(node);
        if (m[5] !== '/') {
          stack.push(node);
        }
      }
    }
  }
  if (stack.length !== 1) {
    throw new Error('Chybné XML: soubor je useknutý (chybí koncová značka).');
  }
  return root;
}

// ---------------------------------------------------------------- hodnoty

const child = (node: XmlNode, name: string): XmlNode | undefined => node.children.filter((c) => c.name === name)[0];
const textOf = (node: XmlNode, name: string): string => {
  const c = child(node, name);
  return c ? c.text.trim() : '';
};

/** Kód odkazu: „code:26001“, „26001“ nebo vnořený objekt s prvkem <kod>. */
export function refCodeOf(node: XmlNode | undefined): string {
  if (!node) {
    return '';
  }
  if (node.children.length > 0) {
    const kod = child(node, 'kod');
    if (kod) {
      return kod.text.trim();
    }
    return refCodeOf(node.children[0]);
  }
  return node.text.trim().replace(/^(code|ext):/i, '').trim();
}

/** Zobrazovaný název odkazu (atribut showAs) bez úvodního „kód: “. */
function refLabel(node: XmlNode | undefined): string {
  if (!node) {
    return '';
  }
  const code = refCodeOf(node);
  const shown = (node.attrs.showAs || '').trim();
  if (shown === '') {
    return code;
  }
  return code !== '' && shown.indexOf(`${code}: `) === 0 ? shown.slice(code.length + 2).trim() : shown;
}

function toNumber(value: string): number | undefined {
  if (value === '') {
    return undefined;
  }
  const n = Number(value.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/** Datum („2026-03-15“, „2026-03-15+01:00“) → ISO poledne UTC, aby se den neposunul. */
function toIsoDate(value: string): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) {
    return undefined;
  }
  const iso = `${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) || d.toISOString() !== iso ? undefined : iso;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const startsWithAny = (account: string, prefixes: string[]): boolean => prefixes.some((p) => account.trim().indexOf(p) === 0);

interface Contribution {
  kind: 'naklad' | 'vynos';
  account: string;
  amount: number;
}

/** Zápis → příspěvky do nákladů / výnosů (náklad na MD kladný, na DAL záporný; výnos na DAL kladný, na MD záporný). */
function classifyEntry(debit: string, credit: string, amount: number): Contribution[] {
  const out: Contribution[] = [];
  if (startsWithAny(debit, COST_ACCOUNT_PREFIXES)) {
    out.push({ kind: 'naklad', account: debit, amount });
  }
  if (startsWithAny(credit, COST_ACCOUNT_PREFIXES)) {
    out.push({ kind: 'naklad', account: credit, amount: -amount });
  }
  if (startsWithAny(credit, REVENUE_ACCOUNT_PREFIXES)) {
    out.push({ kind: 'vynos', account: credit, amount });
  }
  if (startsWithAny(debit, REVENUE_ACCOUNT_PREFIXES)) {
    out.push({ kind: 'vynos', account: debit, amount: -amount });
  }
  return out;
}

// ---------------------------------------------------------------- mapování na řádky

/** Řádek ve tvaru seznamu PRM_AbraDocs (AbraDoc bez řádku seznamu). */
export type JournalRow = Omit<AbraDoc, 'id' | 'syncedAt'> & { issueIso?: string; dueIso?: string };

export type SkipReason = 'bez-zakazky' | 'zakazka-neodpovida' | 'bez-id' | 'bez-castky';

export interface JournalParseResult {
  /** Zápisů v souboru celkem. */
  entries: number;
  rows: JournalRow[];
  skipped: Record<SkipReason, number>;
  /** Příklady přeskočených (kromě „bez zakázky“, která je běžná). */
  details: string[];
}

function mapEntry(rec: XmlNode): { rows: JournalRow[]; skipped?: SkipReason; detail?: string } {
  const id = textOf(rec, 'idUcetniDenik');
  const debit = refCodeOf(child(rec, 'mdUcet'));
  const credit = refCodeOf(child(rec, 'dalUcet'));
  const tuz = toNumber(textOf(rec, 'sumTuz'));
  if (tuz === undefined) {
    return { rows: [], skipped: id === '' ? 'bez-id' : 'bez-castky', detail: id };
  }
  const contributions = classifyEntry(debit, credit, round2(tuz));
  if (contributions.length === 0) {
    return { rows: [] };
  }
  if (id === '') {
    return { rows: [], skipped: 'bez-id' };
  }
  const project = refCodeOf(child(rec, 'zakazka'));
  if (project === '') {
    return { rows: [], skipped: 'bez-zakazky' };
  }
  if (!PROJECT_NUMBER_PATTERN.test(project)) {
    return { rows: [], skipped: 'zakazka-neodpovida', detail: project };
  }
  const currencyRaw = refCodeOf(child(rec, 'mena')).toUpperCase() || 'CZK';
  const foreign = NATIVE_CURRENCIES.indexOf(currencyRaw) !== -1 && currencyRaw !== 'CZK';
  const men = toNumber(textOf(rec, 'sumMen'));
  const issue = toIsoDate(textOf(rec, 'datVyst')) ?? toIsoDate(textOf(rec, 'datUcto'));
  const due = toIsoDate(textOf(rec, 'datSplat'));
  const partner = textOf(rec, 'nazFirmy') || refLabel(child(rec, 'firma'));
  const rows: JournalRow[] = [];
  contributions.forEach((c, i) => {
    const czk = round2(c.amount);
    if (czk === 0 && (!foreign || !men)) {
      return;
    }
    const factor = tuz === 0 ? 1 : czk / round2(tuz);
    rows.push({
      abraId: contributions.length > 1 ? `${JOURNAL_EVIDENCE}:${id}#${i + 1}` : `${JOURNAL_EVIDENCE}:${id}`,
      type: c.kind === 'naklad' ? 'prijata' : 'vydana',
      number: textOf(rec, 'doklad') || id,
      projectNumber: project,
      partnerName: partner || undefined,
      description: textOf(rec, 'popis') || undefined,
      issueDate: issue ? new Date(issue) : undefined,
      dueDate: due ? new Date(due) : undefined,
      issueIso: issue,
      dueIso: due,
      currency: foreign ? (currencyRaw as 'EUR' | 'USD') : 'CZK',
      amountNet: foreign && men !== undefined ? round2(Math.abs(men) * Math.sign(czk || factor)) : czk,
      amountNetCzk: foreign ? czk : undefined,
      accounts: [c.account]
    });
  });
  return { rows };
}

/** Text XML exportu účetního deníku → řádky, které se přenášejí do PRMIS, a počty přeskočených zápisů. */
export function parseJournalXml(xml: string): JournalParseResult {
  const tree = parseXml(xml);
  const winstrom = tree.children.filter((c) => c.name === 'winstrom')[0];
  if (!winstrom) {
    throw new Error('Soubor nevypadá jako export z ABRA Flexi (chybí kořenový prvek winstrom).');
  }
  const records = winstrom.children.filter((c) => c.name === JOURNAL_EVIDENCE);
  const result: JournalParseResult = { entries: records.length, rows: [], skipped: { 'bez-zakazky': 0, 'zakazka-neodpovida': 0, 'bez-id': 0, 'bez-castky': 0 }, details: [] };
  const seen = new Set<string>();
  records.forEach((rec) => {
    const r = mapEntry(rec);
    if (r.skipped) {
      result.skipped[r.skipped] += 1;
      if (r.skipped !== 'bez-zakazky' && result.details.length < 10) {
        result.details.push(r.skipped + (r.detail ? `: ${r.detail}` : ''));
      }
    }
    r.rows.forEach((row) => {
      if (!seen.has(row.abraId)) {
        seen.add(row.abraId);
        result.rows.push(row);
      }
    });
  });
  if (records.length === 0) {
    throw new Error('V souboru nejsou žádné zápisy účetního deníku (prvek ucetni-denik). Exportujte evidenci Účetní deník.');
  }
  return result;
}

// ---------------------------------------------------------------- porovnání se stávajícími řádky

const sameDay = (a?: Date, b?: Date): boolean => (a ? a.toISOString().slice(0, 10) : '') === (b ? b.toISOString().slice(0, 10) : '');

/** Změnil se řádek proti tomu, co už v seznamu je? (Datum `syncedAt` se nesrovnává.) */
export function rowChanged(existing: AbraDoc, row: JournalRow): boolean {
  return (
    existing.type !== row.type ||
    existing.number !== row.number ||
    existing.projectNumber !== row.projectNumber ||
    (existing.partnerName || '') !== (row.partnerName || '') ||
    (existing.description || '') !== (row.description || '') ||
    !sameDay(existing.issueDate, row.issueDate) ||
    !sameDay(existing.dueDate, row.dueDate) ||
    existing.currency !== row.currency ||
    Math.abs(existing.amountNet - row.amountNet) > 0.005 ||
    Math.abs((existing.amountNetCzk ?? 0) - (row.amountNetCzk ?? 0)) > 0.005 ||
    (existing.accounts || []).join(' ') !== (row.accounts || []).join(' ')
  );
}

export interface ProjectTotals {
  projectNumber: string;
  lines: number;
  cost: number;
  revenue: number;
}

export interface JournalImportPlan {
  /** Řádky, které v seznamu ještě nejsou. */
  toAdd: JournalRow[];
  /** Řádky, které v seznamu jsou, ale změnily se (např. přesun do jiného projektu, oprava částky). */
  toUpdate: { existing: AbraDoc; row: JournalRow; movedFrom?: string }[];
  unchanged: number;
  /** Řádky v seznamu z deníku (`ucetni-denik:…`), které v tomto souboru nejsou. Import se jich nedotkne. */
  notInFile: number;
  /** Součty z nového stavu souboru po projektech (Kč; náklad bez dobropisů zvlášť neřešen — součet se znaménky). */
  totals: ProjectTotals[];
}

const czkOf = (r: JournalRow): number => (r.currency === 'CZK' ? r.amountNet : r.amountNetCzk ?? 0);

/** Co import udělá, když se spustí nad stávajícími řádky (jen pro náhled; nic nezapisuje). */
export function planJournalImport(rows: JournalRow[], existing: AbraDoc[]): JournalImportPlan {
  const byId = new Map<string, AbraDoc>();
  existing.forEach((d) => byId.set(d.abraId, d));
  const plan: JournalImportPlan = { toAdd: [], toUpdate: [], unchanged: 0, notInFile: 0, totals: [] };
  const inFile = new Set<string>();
  const totals = new Map<string, ProjectTotals>();
  rows.forEach((row) => {
    inFile.add(row.abraId);
    const old = byId.get(row.abraId);
    if (!old) {
      plan.toAdd.push(row);
    } else if (rowChanged(old, row)) {
      plan.toUpdate.push({ existing: old, row, movedFrom: old.projectNumber !== row.projectNumber ? old.projectNumber : undefined });
    } else {
      plan.unchanged += 1;
    }
    const t = totals.get(row.projectNumber) || { projectNumber: row.projectNumber, lines: 0, cost: 0, revenue: 0 };
    t.lines += 1;
    if (row.type === 'prijata') {
      t.cost = round2(t.cost + czkOf(row));
    } else {
      t.revenue = round2(t.revenue + czkOf(row));
    }
    totals.set(row.projectNumber, t);
  });
  plan.notInFile = existing.filter((d) => d.abraId.indexOf(`${JOURNAL_EVIDENCE}:`) === 0 && !inFile.has(d.abraId)).length;
  plan.totals = Array.from(totals.values()).sort((a, b) => a.projectNumber.localeCompare(b.projectNumber));
  return plan;
}
