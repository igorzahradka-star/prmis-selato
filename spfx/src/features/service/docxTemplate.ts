/**
 * Vykreslení šablony Wordu (.docx) ve formátu docxtpl (Jinja2): `{{ hodnota }}`, `{{ hodnota | kc }}`, `{% if %}`, `{% for %}` a řádkové značky
 * `{%p … %}` (odstavec) a `{%tr … %}` (řádek tabulky), které se v dokumentu nahradí samotnou značkou. Šablony od RES se používají beze změny,
 * stejné jako v referenčním generátoru `render_smlouvy.py` (Python docxtpl). Vykresluje se v prohlížeči: JSZip + Nunjucks (Jinja-kompatibilní).
 * Knihovny se načítají až při prvním použití (samostatný balíček).
 */

import { formatKc } from '../../core/serviceContractRender';

/** Znak, kterým se při vykreslení nahrazují zalomení řádku v hodnotách (na konci se změní na zalomení řádku ve Wordu). */
const NEWLINE_MARK = '\u0001';

/** Řádkové značky docxtpl: tr (řádek tabulky), tc (buňka), p (odstavec), r (úsek textu) — celý prvek se nahradí samotnou značkou. */
const ROW_TAGS: RegExp[] = [
  /<w:tr[ >](?:(?!<w:tr[ >])[\s\S])*?(\{%|\{\{)tr ([^}%]*(?:%\}|\}\}))[\s\S]*?<\/w:tr>/g,
  /<w:tc[ >](?:(?!<w:tc[ >])[\s\S])*?(\{%|\{\{)tc ([^}%]*(?:%\}|\}\}))[\s\S]*?<\/w:tc>/g,
  /<w:p[ >](?:(?!<w:p[ >])[\s\S])*?(\{%|\{\{)p ([^}%]*(?:%\}|\}\}))[\s\S]*?<\/w:p>/g,
  /<w:r[ >](?:(?!<w:r[ >])[\s\S])*?(\{%|\{\{)r ([^}%]*(?:%\}|\}\}))[\s\S]*?<\/w:r>/g
];

const unescapeXml = (s: string): string => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/**
 * Připraví XML části dokumentu pro vykreslení (stejný postup jako `DocxTemplate.patch_xml`): Word často rozdělí značku na víc úseků textu,
 * ty se spojí; chytré uvozovky ve značkách se změní na rovné; řádkové značky `{%p` a `{%tr` nahradí celý odstavec, resp. řádek.
 */
export function patchTemplateXml(src: string): string {
  let xml = src;
  // značka { { … } } rozdělená XML elementy se spojí
  xml = xml.replace(/\{((?:<[^>]*>)*)([{%#])/g, '{$2').replace(/([%}#])((?:<[^>]*>)+)\}/g, '$1}');
  // uvnitř značek zahodit XML elementy, vrátit entity a chytré uvozovky
  xml = xml.replace(/\{([{%])([\s\S]*?)([}%])\}/g, (_m, open: string, inner: string, close: string) => {
    const clean = unescapeXml(inner.replace(/<[^>]*>/g, '')).replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
    return `{${open}${clean}${close}}`;
  });
  // řádkové značky
  ROW_TAGS.forEach((re) => {
    xml = xml.replace(re, '$1$2');
  });
  return xml;
}

/**
 * Příprava kontextu: zalomení řádku v hodnotách se označí (po vykreslení se změní na zalomení řádku ve Wordu) a prázdné seznamy se nahradí
 * „nic“, aby se v podmínkách `{% if seznam %}` chovaly jako v Jinja2 (prázdný seznam = nepravda; v JavaScriptu je pravda).
 */
function markNewlines<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(/\r?\n/g, NEWLINE_MARK) as unknown as T;
  }
  if (Array.isArray(value)) {
    return (value.length === 0 ? undefined : value.map((v) => markNewlines(v))) as unknown as T;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    Object.keys(value as Record<string, unknown>).forEach((k) => {
      out[k] = markNewlines((value as Record<string, unknown>)[k]);
    });
    return out as unknown as T;
  }
  return value;
}

const PARTS = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;

/** Vykreslí šablonu `.docx` s kontextem a vrátí bajty výsledného dokumentu. */
export async function renderDocxTemplate(template: ArrayBuffer | Uint8Array, context: Record<string, unknown>): Promise<Uint8Array> {
  const [{ default: JSZip }, nunjucks] = await Promise.all([import(/* webpackChunkName: 'docx-template' */ 'jszip'), import(/* webpackChunkName: 'docx-template' */ 'nunjucks')]);
  const zip = await JSZip.loadAsync(template);
  const env = new nunjucks.Environment(undefined, { autoescape: true, throwOnUndefined: false });
  env.addFilter('kc', (v: unknown) => formatKc(v));
  const ctx = markNewlines(context);
  const names = Object.keys(zip.files).filter((n) => PARTS.test(n));
  for (const name of names) {
    const xml = await (zip.file(name) as import('jszip').JSZipObject).async('string');
    if (xml.indexOf('{{') < 0 && xml.indexOf('{%') < 0) {
      continue;
    }
    let out: string;
    try {
      out = env.renderString(patchTemplateXml(xml), ctx);
    } catch (error) {
      throw new Error(`Šablonu se nepodařilo vykreslit (${name}): ${error instanceof Error ? error.message : String(error)}`);
    }
    zip.file(name, out.split(NEWLINE_MARK).join('</w:t><w:br/><w:t xml:space="preserve">'));
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/** Text dokumentu (odstavce oddělené zalomením) — pro kontrolu a porovnání výstupů. */
export async function docxPlainText(bytes: ArrayBuffer | Uint8Array): Promise<string[]> {
  const { default: JSZip } = await import(/* webpackChunkName: 'docx-template' */ 'jszip');
  const zip = await JSZip.loadAsync(bytes);
  const xml = await (zip.file('word/document.xml') as import('jszip').JSZipObject).async('string');
  return xml
    .split('</w:p>')
    .map((p) => unescapeXml(p.replace(/<w:br\/>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<[^>]*>/g, '')))
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p !== '');
}
