/**
 * Přečte jeden list souboru .xlsx jako tabulku textů. Rozbalení zipu dělá JSZip (už v projektu, načítá se až při
 * použití), samotné čtení XML je čistá logika v `core/xlsxSheet.ts`.
 */

import { listSheets, parseSharedStrings, parseSheetRows, pickSheet } from '../../core/xlsxSheet';

export interface XlsxSheetData {
  /** Název listu, který se opravdu přečetl. */
  sheetName: string;
  rows: string[][];
}

export async function readXlsxSheet(file: Blob, wantedSheet: string): Promise<XlsxSheetData> {
  const { default: JSZip } = await import(/* webpackChunkName: 'xlsx-read' */ 'jszip');
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new Error('Soubor se nepodařilo otevřít. Je to sešit Excelu ve formátu .xlsx? (Starší .xls ani .csv to není — uložte ho v Excelu jako .xlsx.)');
  }
  const text = async (path: string): Promise<string | undefined> => {
    const f = zip.file(path);
    return f ? f.async('string') : undefined;
  };
  const workbook = await text('xl/workbook.xml');
  const rels = await text('xl/_rels/workbook.xml.rels');
  if (!workbook || !rels) {
    throw new Error('V souboru chybí sešit Excelu (xl/workbook.xml). Uložte ho v Excelu jako .xlsx.');
  }
  const sheet = pickSheet(listSheets(workbook, rels), wantedSheet);
  if (!sheet) {
    throw new Error('Sešit nemá žádný list.');
  }
  const sheetXml = await text(sheet.path);
  if (!sheetXml) {
    throw new Error(`List „${sheet.name}“ se v souboru nenašel.`);
  }
  const shared = parseSharedStrings(await text('xl/sharedStrings.xml'));
  return { sheetName: sheet.name, rows: parseSheetRows(sheetXml, shared) };
}
