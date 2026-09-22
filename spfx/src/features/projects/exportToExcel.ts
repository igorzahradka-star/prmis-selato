/**
 * Zápis tabulky projektů do souboru .xlsx a jeho stažení.
 *
 * Co se exportuje a v jakém tvaru, rozhoduje `core/projectExport.ts` — tady
 * je jen skládání sešitu a stažení. ExcelJS (MIT) se načítá **až při kliknutí**
 * dynamickým importem: je to velká knihovna a do úvodního načtení aplikace
 * nemá co dělat, když export většina lidí nepoužije.
 */

import { Project } from '../../core/types';
import {
  EXPORT_COLUMNS,
  exportRow,
  exportFileName,
  exportSubtitle
} from '../../core/projectExport';

/** Formát čísel v Excelu — české oddělovače řeší Excel sám podle nastavení systému. */
const MONEY_FORMAT = '# ##0';
const DATE_FORMAT = 'd. m. yyyy';
const PERCENT_FORMAT = '+0,0 %;-0,0 %;0,0 %';

/** Barvy RES pro hlavičku tabulky — ARGB bez mřížky, jak to chce ExcelJS. */
const HEADER_BG = 'FF0E2841';
const HEADER_FG = 'FFFFFFFF';

/**
 * Sestaví sešit a stáhne ho. `filtrovano` říká, jestli jsou v tabulce
 * všechny projekty, nebo jen ty vyfiltrované — poznámka v sešitu na to
 * upozorní, aby si nikdo nespletl výřez s celkem.
 */
export async function exportProjectsToExcel(
  projects: Project[],
  filtrovano: boolean,
  today: Date = new Date()
): Promise<void> {
  const ExcelJS = await import(/* webpackChunkName: 'exceljs' */ 'exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PRM Revoltum';
  workbook.created = today;

  const sheet = workbook.addWorksheet('Projekty', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  sheet.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, width: c.width }));

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: HEADER_FG } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
  header.alignment = { vertical: 'middle' };
  header.height = 20;

  projects.forEach((p) => sheet.addRow(exportRow(p)));

  // Formáty po sloupcích. Hlavička se přeskakuje, jinak by čísla řádku 1
  // převzala formát měny a zobrazila se jako 0.
  EXPORT_COLUMNS.forEach((col, i) => {
    const sloupec = sheet.getColumn(i + 1);
    if (col.kind === 'money') {
      sloupec.numFmt = MONEY_FORMAT;
    } else if (col.kind === 'date') {
      sloupec.numFmt = DATE_FORMAT;
    } else if (col.kind === 'number') {
      sloupec.numFmt = PERCENT_FORMAT;
    }
  });

  // Filtr nad hlavičkou, ať se dá v Excelu rovnou třídit a filtrovat.
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: EXPORT_COLUMNS.length }
  };

  const poznamka = sheet.addRow([]);
  poznamka.getCell(1).value = exportSubtitle(projects.length, filtrovano, today);
  poznamka.getCell(1).font = { italic: true, size: 9 };

  const buffer = await workbook.xlsx.writeBuffer();
  stahni(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }),
    exportFileName(today)
  );
}

/**
 * Stažení souboru z prohlížeče. Odkaz se po kliknutí hned uklidí —
 * objektová URL jinak drží soubor v paměti až do zavření stránky.
 */
function stahni(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
