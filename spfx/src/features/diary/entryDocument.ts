/**
 * PDF zápisu ze stavby v grafice RES a údaje společné pro PDF i Word.
 *
 * Skládání dokumentu (`buildEntryPdfDocument`) je čisté a testovatelné; vykreslení přes pdfmake sdílí s objednávkami a podklady
 * (`pdfCommon`). Zápis, který není uzavřený, má přes stránku vodoznak KONCEPT; uzavřený a podepsaný zápis nese
 * údaje o uzavření a podpisu (kdo, kdy, otisk obsahu).
 */

import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';

import { CompanySettings } from '../../core/settings';
import { formatDate, formatDateTime } from '../../core/format';
import { DiaryEntry, EntryStatus, SIGNATURE_LABELS, isImageFile, parseIsoDay } from '../../core/siteDiary';
import { GRAY, LINE, NAVY, companyLinesOf, documentFooter, documentHeader, renderPdfDefinition, td, th } from '../orders/pdfCommon';

export interface EntryImage {
  dataUrl: string;
  width: number;
  height: number;
}

export interface EntryDocData {
  entry: DiaryEntry;
  projectTitle: string;
  /** Firma pro hlavičku: údaje ze zápisu (upravitelné) + claim z Nastavení. */
  company: CompanySettings;
  /** Obrázky použité v bodech (název souboru → obrázek). Ostatní soubory se v dokumentu jen vypíšou. */
  images: Record<string, EntryImage>;
}

/** Vodoznak podle stavu: jen uzavřený a podepsaný zápis je „čistý" doklad. */
export function entryWatermark(status: EntryStatus): string | undefined {
  switch (status) {
    case EntryStatus.Koncept:
      return 'KONCEPT';
    case EntryStatus.Storno:
      return 'STORNO';
    default:
      return undefined;
  }
}

/** Věta o uzavření zápisu, nebo `undefined`, když uzavřený není. */
export function closureNote(entry: DiaryEntry): string | undefined {
  if (!entry.closedAt || !entry.closedByName) {
    return undefined;
  }
  return `Zápis uzavřen v aplikaci PRM: ${entry.closedByName}, ${formatDateTime(entry.closedAt)}.${
    entry.contentHash ? ` Otisk obsahu (SHA-256): ${entry.contentHash}` : ''
  }`;
}

/** Věta o podpisu zápisu, nebo `undefined`, když není podepsaný. */
export function signatureNote(entry: DiaryEntry): string | undefined {
  if (entry.status !== EntryStatus.Podepsano || !entry.signedAt || !entry.signatureKind) {
    return undefined;
  }
  return `Zápis podepsán (${SIGNATURE_LABELS[entry.signatureKind]}): ${entry.signedByName || '—'}, ${formatDateTime(entry.signedAt)}.`;
}

/** Soubory použité v bodech, které nejsou obrázky (plány, tabulky…) — v dokumentu se vypisují jako přílohy. */
export function nonImageAttachments(entry: DiaryEntry): string[] {
  const out: string[] = [];
  entry.points.forEach((p) => p.files.forEach((f) => !isImageFile(f) && out.indexOf(f) === -1 && out.push(f)));
  return out;
}

/** Firma z hlavičky zápisu doplněná o claim z Nastavení (patička dokumentu). */
export function companyForEntry(entry: DiaryEntry, settingsCompany: CompanySettings): CompanySettings {
  return { ...settingsCompany, ...entry.header.company };
}

/** Termín úkolu jako text (datum `RRRR-MM-DD` → `1. 10. 2026`). */
export function taskDue(due: string | undefined): string {
  const d = parseIsoDay(due);
  return d ? formatDate(d) : due || '—';
}

const boxLayout = {
  hLineColor: (): string => LINE,
  vLineColor: (): string => LINE,
  hLineWidth: (): number => 0.5,
  vLineWidth: (): number => 0.5,
  paddingTop: (): number => 4,
  paddingBottom: (): number => 4
};

/** Sestaví definici dokumentu pro pdfmake. */
export function buildEntryPdfDocument(data: EntryDocData): TDocumentDefinitions {
  const { entry, company } = data;
  const small = (text: string): Content => ({ text, fontSize: 8, color: GRAY });
  const big = (text: string): Content => ({ text: text || '—', fontSize: 10, bold: true });

  const content: Content[] = [
    ...documentHeader(company),
    { text: `ZÁPIS č. ${entry.entryNo}`, fontSize: 18, bold: true, color: NAVY },
    {
      text: `${entry.diaryTitle ? `Stavební deník: ${entry.diaryTitle} · ` : ''}Projekt ${entry.projectNumber}${data.projectTitle ? ` · ${data.projectTitle}` : ''}`,
      fontSize: 10,
      color: GRAY,
      margin: [0, 2, 0, 12]
    },
    {
      table: {
        widths: ['*', '*', 90],
        body: [
          [small('Stavba'), small('Místo stavby'), small('Datum')],
          [big(entry.header.constructionName), big(entry.header.place), big(formatDate(entry.date))],
          [small('Projektový manažer stavby'), small('Jednání s'), small('Zápis č.')],
          [big(entry.header.managerName), big(entry.header.counterparty || ''), big(String(entry.entryNo))]
        ]
      },
      layout: boxLayout,
      margin: [0, 0, 0, 10]
    }
  ];

  if (entry.conditions && entry.conditions.trim() !== '') {
    content.push({ text: 'Počasí a podmínky na stavbě', fontSize: 8, color: GRAY, bold: true });
    content.push({ text: entry.conditions, fontSize: 10, margin: [0, 2, 0, 10] });
  }

  if (entry.participants.length > 0) {
    content.push({ text: 'Účastníci', fontSize: 8, color: GRAY, bold: true, margin: [0, 0, 0, 3] });
    content.push({
      table: {
        headerRows: 1,
        widths: ['*', '*', 110, 55],
        body: [
          [th('Jméno'), th('Firma / subjekt'), th('Funkce'), th('Přítomen', 'center')],
          ...entry.participants.map((p): TableCell[] => [td(p.name), td(p.organization || ''), td(p.role || ''), td(p.present ? 'ano' : 'omluven', 'center')])
        ]
      },
      layout: { hLineColor: () => LINE, vLineColor: () => LINE, hLineWidth: () => 0.5, vLineWidth: () => 0 },
      margin: [0, 0, 0, 12]
    });
  }

  entry.points.forEach((p, i) => {
    if (p.text.trim() === '' && p.files.length === 0 && !(p.title && p.title.trim() !== '')) {
      return;
    }
    content.push({ text: `${i + 1}. ${p.title && p.title.trim() !== '' ? p.title : 'Bod jednání'}`, fontSize: 11, bold: true, color: NAVY, margin: [0, 6, 0, 3] });
    if (p.text.trim() !== '') {
      content.push({ text: p.text, fontSize: 10, margin: [0, 0, 0, 6] });
    }
    const pics = p.files.filter((f) => data.images[f]);
    for (let k = 0; k < pics.length; k += 2) {
      const row = pics.slice(k, k + 2);
      content.push({
        columns: row.map((name) => {
          const img = data.images[name];
          // Obrázek se vejde do poloviny šířky stránky a do výšky 210 bodů, poměr stran zůstává.
          const ratio = img.width / img.height;
          const w = Math.min(250, 210 * ratio);
          return { stack: [{ image: img.dataUrl, width: w, height: w / ratio }, { text: name, fontSize: 7, color: GRAY, margin: [0, 2, 0, 0] as [number, number, number, number] }], width: '50%' } as Content;
        }),
        columnGap: 10,
        margin: [0, 0, 0, 8]
      });
    }
    const others = p.files.filter((f) => !data.images[f]);
    if (others.length > 0) {
      content.push({ text: `Přílohy: ${others.join(', ')}`, fontSize: 9, color: GRAY, margin: [0, 0, 0, 6] });
    }
  });

  if (entry.tasks.some((t) => t.description.trim() !== '')) {
    content.push({ text: 'Dohodnuté úkoly', fontSize: 11, bold: true, color: NAVY, margin: [0, 10, 0, 3] });
    content.push({
      table: {
        headerRows: 1,
        widths: ['*', 130, 70],
        body: [
          [th('Úkol'), th('Odpovědný'), th('Termín')],
          ...entry.tasks
            .filter((t) => t.description.trim() !== '')
            .map((t): TableCell[] => [td(t.description), td(t.responsible || ''), td(taskDue(t.due))])
        ]
      },
      layout: { hLineColor: () => LINE, vLineColor: () => LINE, hLineWidth: () => 0.5, vLineWidth: () => 0 },
      margin: [0, 0, 0, 12]
    });
  }

  // Podpisy: každý přítomný účastník a zpracovatel zápisu má řádek pro podpis.
  const signers = [
    { name: entry.header.managerName || entry.createdByName, note: `za ${companyLinesOf(company)[0] || 'zhotovitele'}` },
    ...entry.participants.filter((p) => p.present && p.name.trim() !== '').map((p) => ({ name: p.name, note: p.organization || '' }))
  ];
  content.push({ text: 'Podpisy', fontSize: 11, bold: true, color: NAVY, margin: [0, 14, 0, 6], unbreakable: true } as Content);
  for (let i = 0; i < signers.length; i += 2) {
    content.push({
      columns: signers.slice(i, i + 2).map((s) => ({
        stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 0.7, lineColor: '#333333' }], margin: [0, 26, 0, 2] },
          { text: s.name, fontSize: 9, bold: true },
          { text: s.note, fontSize: 8, color: GRAY }
        ],
        width: '50%'
      })),
      columnGap: 20,
      margin: [0, 0, 0, 6],
      unbreakable: true
    } as Content);
  }

  const closure = closureNote(entry);
  const signature = signatureNote(entry);
  if (closure || signature) {
    content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: LINE }], margin: [0, 12, 0, 6] } as Content);
    if (closure) {
      content.push({ text: closure, fontSize: 7.5, color: GRAY });
    }
    if (signature) {
      content.push({ text: signature, fontSize: 8, bold: true, margin: [0, 3, 0, 0] });
    }
  }
  if (entry.status === EntryStatus.Storno && entry.cancelReason) {
    content.push({ text: `Stornováno: ${entry.cancelReason}`, fontSize: 9, color: '#7A1712', margin: [0, 8, 0, 0] });
  }

  const watermark = entryWatermark(entry.status);
  return {
    pageSize: 'A4',
    pageMargins: [40, 36, 40, 50],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#1B1F2A' },
    info: {
      title: `Zápis č. ${entry.entryNo} – ${entry.header.constructionName}`,
      author: company.name,
      subject: `Projekt ${entry.projectNumber}`
    },
    watermark: watermark ? { text: watermark, color: '#8A94A0', opacity: 0.16, bold: true, angle: -30, fontSize: 60 } : undefined,
    content,
    footer: documentFooter(company)
  };
}

/** Vykreslí PDF zápisu. */
export function renderEntryPdf(data: EntryDocData): Promise<Blob> {
  return renderPdfDefinition(buildEntryPdfDocument(data));
}
