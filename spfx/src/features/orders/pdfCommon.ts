/**
 * Společné části PDF dokumentů v grafice RES (objednávky, podklady pro fakturaci): barvy, buňky tabulek,
 * hlavička s logem a údaji firmy, patička a samotné vykreslení přes pdfmake (MIT, písmo Roboto — pokrývá češtinu).
 * Knihovna se načte až při použití, stejně jako export do Excelu — do startu aplikace se kvůli ní nic nepřidává.
 */

import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';

import { CompanySettings } from '../../core/settings';
import { PDF_LOGO_DATA_URL, PDF_LOGO_RATIO } from './pdfLogo';

/** Barvy značky RES (brand/BARVY.md). */
export const NAVY = '#0E2841';
export const BLUE = '#0268A6';
export const GRAY = '#5A6472';
export const LINE = '#C7D4DD';

export const th = (text: string, alignment: 'left' | 'right' | 'center' = 'left'): TableCell => ({
  text,
  bold: true,
  color: '#FFFFFF',
  fillColor: NAVY,
  fontSize: 9,
  alignment,
  margin: [4, 4, 4, 4]
});

export const td = (text: string, alignment: 'left' | 'right' | 'center' = 'left', bold = false): TableCell => ({
  text,
  alignment,
  bold,
  fontSize: 9,
  margin: [4, 3, 4, 3]
});

/** Řádky s údaji firmy (název, adresa, IČO a DIČ) bez prázdných. */
export function companyLinesOf(company: CompanySettings): string[] {
  return [
    company.name,
    company.street,
    `${company.zip} ${company.city}`.trim(),
    [company.ico ? `IČO: ${company.ico}` : '', company.dic ? `DIČ: ${company.dic}` : ''].filter((x) => x).join('   ')
  ].filter((x) => x && x.trim() !== '');
}

/** Blok strany dokumentu: popisek, název tučně, další řádky drobněji. */
export function party(title: string, lines: string[]): Content {
  return {
    stack: [
      { text: title, fontSize: 8, color: GRAY, bold: true, margin: [0, 0, 0, 3] },
      ...lines.map((l, i) => ({ text: l, fontSize: i === 0 ? 11 : 9, bold: i === 0, margin: [0, 0, 0, 1] as [number, number, number, number] }))
    ]
  };
}

/** Hlavička: logo vlevo, údaje firmy vpravo, pod tím modrá linka. */
export function documentHeader(company: CompanySettings): Content[] {
  return [
    {
      columns: [
        { image: PDF_LOGO_DATA_URL, width: 150, height: Math.round(150 / PDF_LOGO_RATIO) },
        { stack: companyLinesOf(company).map((l, i) => ({ text: l, fontSize: 9, bold: i === 0, alignment: 'right' as const })), width: '*' }
      ],
      margin: [0, 0, 0, 14]
    },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5, lineColor: BLUE }], margin: [0, 0, 0, 10] }
  ];
}

/** Patička: claim firmy vlevo, číslo strany vpravo. */
export function documentFooter(company: CompanySettings): (currentPage: number, pageCount: number) => Content {
  return (currentPage: number, pageCount: number): Content => ({
    columns: [
      { text: company.claim || company.name, fontSize: 8, color: GRAY, margin: [40, 0, 0, 0] },
      { text: `Strana ${currentPage} z ${pageCount}`, fontSize: 8, color: GRAY, alignment: 'right', margin: [0, 0, 40, 0] }
    ],
    margin: [0, 14, 0, 0]
  });
}

/** Vykreslí definici dokumentu do PDF. */
export async function renderPdfDefinition(definition: TDocumentDefinitions): Promise<Blob> {
  const [pdfMakeModule, fontsModule] = await Promise.all([
    import(/* webpackChunkName: 'pdfmake' */ 'pdfmake/build/pdfmake'),
    import(/* webpackChunkName: 'pdfmake' */ 'pdfmake/build/vfs_fonts')
  ]);
  const pdfMake = ((pdfMakeModule as unknown as { default?: unknown }).default ?? pdfMakeModule) as {
    vfs: unknown;
    createPdf: (def: TDocumentDefinitions) => { getBlob: (cb: (blob: Blob) => void) => void };
  };
  const fonts = fontsModule as unknown as {
    pdfMake?: { vfs: unknown };
    default?: { pdfMake?: { vfs: unknown } };
    vfs?: unknown;
  };
  pdfMake.vfs = (fonts.pdfMake && fonts.pdfMake.vfs) || (fonts.default && fonts.default.pdfMake && fonts.default.pdfMake.vfs) || fonts.vfs;

  return new Promise<Blob>((resolve, reject) => {
    try {
      pdfMake.createPdf(definition).getBlob(resolve);
    } catch (error) {
      reject(error);
    }
  });
}

/** Název souboru PDF z čísla dokladu: `OBJ-2026-0005.pdf`. Nepovolené znaky se nahradí. */
export function pdfFileName(documentNumber: string): string {
  return `${documentNumber.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;
}
