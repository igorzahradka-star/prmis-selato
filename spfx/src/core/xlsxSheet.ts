/**
 * Čtení hodnot z listu sešitu .xlsx bez další knihovny — čistá logika nad texty XML uvnitř souboru.
 *
 * Soubor .xlsx je zip; rozbalení obstará volající (JSZip, který už v projektu je). Tady se jen z textů
 * `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `xl/sharedStrings.xml` a `xl/worksheets/sheetN.xml` vyrobí tabulka
 * řádků s textovými hodnotami buněk. Vzorce se nepočítají — bere se uložená poslední hodnota (Excel ji ukládá vždy).
 * Formátování (data, měna) se neřeší: čísla se vrací tak, jak jsou uložená (IČO 00012345 uložené jako číslo
 * přijde jako „12345“ — doplnění nul řeší `normalizeIco`).
 */

/** Převede entity XML (&amp; &lt; &#269; …) na znaky. */
export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
    if (e === 'amp') return '&';
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos') return "'";
    const code = e.charAt(1) === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return String.fromCodePoint(code);
  });
}

/** Text všech `<t>` uvnitř kusu XML (bez fonetických přepisů `<rPh>`). */
function textRuns(xml: string): string {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  const re = /<t(?:\s[^>]*)?\/>|<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    out += decodeXml(m[1] || '');
  }
  return out;
}

/** Sdílené texty sešitu (`xl/sharedStrings.xml`) v pořadí indexů. */
export function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) {
    return [];
  }
  const out: string[] = [];
  const re = /<si(?:\s[^>]*)?\/>|<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(textRuns(m[1] || ''));
  }
  return out;
}

/** Index sloupce (0 = A) z odkazu na buňku (`C12` → 2, `AA3` → 26). */
export function columnIndex(ref: string): number {
  const letters = (/^[A-Z]+/.exec(ref.toUpperCase()) || [''])[0];
  let n = 0;
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return n - 1;
}

function attr(attrs: string, name: string): string | undefined {
  const re = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrs)) !== null) {
    if (m[1] === name) {
      return decodeXml(m[2]);
    }
  }
  return undefined;
}

/**
 * Řádky listu jako tabulka textů. Prázdné buňky uprostřed řádku jsou `''`, chybějící řádky (mezera v číslování)
 * se vynechají — vrací se jen řádky, které v souboru jsou, v pořadí.
 */
export function parseSheetRows(sheetXml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row\b([^>]*)\/>|<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(sheetXml)) !== null) {
    const body = rm[3] || '';
    const row: string[] = [];
    const cellRe = /<c\b([^>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cm: RegExpExecArray | null;
    let next = 0;
    while ((cm = cellRe.exec(body)) !== null) {
      const attrs = cm[1] !== undefined ? cm[1] : cm[2];
      const inner = cm[3] || '';
      const ref = attr(attrs, 'r');
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      const type = attr(attrs, 't');
      let value = '';
      if (type === 'inlineStr') {
        value = textRuns(inner);
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
        const raw = v ? decodeXml(v[1]) : '';
        if (type === 's') {
          value = shared[parseInt(raw, 10)] ?? '';
        } else if (type === 'b') {
          value = raw === '1' ? 'TRUE' : raw === '0' ? 'FALSE' : raw;
        } else {
          value = raw;
        }
      }
      while (row.length < col) {
        row.push('');
      }
      row[col] = value;
    }
    rows.push(row);
  }
  return rows;
}

export interface WorkbookSheet {
  name: string;
  /** Cesta souboru listu uvnitř zipu, např. `xl/worksheets/sheet1.xml`. */
  path: string;
}

/** Seznam listů sešitu s cestami k jejich souborům (z `xl/workbook.xml` a `xl/_rels/workbook.xml.rels`). */
export function listSheets(workbookXml: string, relsXml: string): WorkbookSheet[] {
  const targets: Record<string, string> = {};
  const relRe = /<Relationship\b([^>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = relRe.exec(relsXml)) !== null) {
    const id = attr(m[1], 'Id');
    const target = attr(m[1], 'Target');
    if (id && target) {
      targets[id] = target.charAt(0) === '/' ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    }
  }
  const out: WorkbookSheet[] = [];
  const sheetRe = /<sheet\b([^>]*)\/?>/g;
  while ((m = sheetRe.exec(workbookXml)) !== null) {
    const name = attr(m[1], 'name');
    const rid = attr(m[1], 'r:id');
    if (name !== undefined && rid && targets[rid]) {
      out.push({ name, path: targets[rid] });
    }
  }
  return out;
}

/** Vybere list podle názvu (bez ohledu na velikost písmen), jinak první list. */
export function pickSheet(sheets: WorkbookSheet[], wanted: string): WorkbookSheet | undefined {
  const w = wanted.trim().toLowerCase();
  return sheets.filter((s) => s.name.trim().toLowerCase() === w)[0] || sheets[0];
}
