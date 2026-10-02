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
import { DiaryEntry, EntryStatus, HANDOVER_RESULT_LABELS, SIGNATURE_LABELS, entryTitle, isHandover, isImageFile, parseIsoDay, protocolNumber, warrantyEnd } from '../../core/siteDiary';
import { GRAY, LINE, NAVY, companyLinesOf, documentFooter, documentHeader, renderPdfDefinition, signatureGrid, td, th } from '../orders/pdfCommon';

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
  /** Obrázek podpisu toho, kdo zápis podepsal v aplikaci (z jeho profilu); bez něj je v poli jen jméno se značkou. */
  signature?: string;
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
  return `${isHandover(entry) ? 'Protokol' : 'Zápis'} uzavřen v aplikaci PRM: ${entry.closedByName}, ${formatDateTime(entry.closedAt)}.${
    entry.contentHash ? ` Otisk obsahu (SHA-256): ${entry.contentHash}` : ''
  }`;
}

/** Věta o podpisu zápisu, nebo `undefined`, když není podepsaný. */
export function signatureNote(entry: DiaryEntry): string | undefined {
  if (entry.status !== EntryStatus.Podepsano || !entry.signedAt || !entry.signatureKind) {
    return undefined;
  }
  return `${isHandover(entry) ? 'Protokol' : 'Zápis'} podepsán (${SIGNATURE_LABELS[entry.signatureKind]}): ${entry.signedByName || '—'}, ${formatDateTime(entry.signedAt)}.`;
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

/** Barva výsledku předání: zelená bez výhrad, oranžová s výhradami, červená nepřevzato. */
export function handoverResultColor(result: string | undefined): string {
  return result === 'bez-vyhrad' ? '#1E7B34' : result === 's-vyhradami' ? '#A15C00' : result === 'neprevzato' ? '#7A1712' : '#1B1F2A';
}

/** Věta o záruce („Záruční doba 60 měsíců od 1. 10. 2026, tj. do 1. 10. 2031.“) nebo `undefined`. */
export function warrantyNote(entry: DiaryEntry): string | undefined {
  const months = entry.handover ? entry.handover.warrantyMonths : undefined;
  if (months === undefined || months <= 0 || (entry.handover && entry.handover.result === 'neprevzato')) {
    return undefined;
  }
  return `Záruční doba ${months} měsíců od ${formatDate(entry.date)}, tj. do ${formatDate(warrantyEnd(entry.date, months))}.`;
}

/** Úvodní věta předávacího protokolu. */
export function handoverIntro(entry: DiaryEntry, company: CompanySettings): string {
  const who = company.name || 'Zhotovitel';
  const to = entry.header.counterparty && entry.header.counterparty.trim() !== '' ? entry.header.counterparty : 'objednatel';
  return `Dne ${formatDate(entry.date)} předal zhotovitel ${who} objednateli ${to} níže popsaný předmět předání (stavba: ${entry.header.constructionName || '—'}, ${entry.header.place || '—'}). Stav, předané doklady a zjištěné vady jsou uvedeny v tomto protokolu.`;
}

/** Sestaví definici dokumentu pro pdfmake. */
export function buildEntryPdfDocument(data: EntryDocData): TDocumentDefinitions {
  const { entry, company } = data;
  const handover = isHandover(entry);
  const small = (text: string): Content => ({ text, fontSize: 8, color: GRAY });
  const big = (text: string): Content => ({ text: text || '—', fontSize: 10, bold: true });

  const content: Content[] = [
    ...documentHeader(company),
    { text: handover ? 'PŘEDÁVACÍ PROTOKOL' : `ZÁPIS č. ${entry.entryNo}`, fontSize: 18, bold: true, color: NAVY },
    {
      text: handover
        ? `č. ${protocolNumber(entry.projectNumber, entry.entryNo)} · Projekt ${entry.projectNumber}${data.projectTitle ? ` · ${data.projectTitle}` : ''}`
        : `${entry.diaryTitle ? `Stavební deník: ${entry.diaryTitle} · ` : ''}Projekt ${entry.projectNumber}${data.projectTitle ? ` · ${data.projectTitle}` : ''}`,
      fontSize: 10,
      color: GRAY,
      margin: [0, 2, 0, 12]
    },
    {
      table: {
        widths: ['*', '*', 90],
        body: handover
          ? [
              [small('Stavba'), small('Místo stavby'), small('Datum předání')],
              [big(entry.header.constructionName), big(entry.header.place), big(formatDate(entry.date))],
              [small('Předává (zhotovitel)'), small('Přebírá (objednatel)'), small('Protokol č.')],
              [
                big(`${company.name}${entry.header.managerName ? ' · ' + entry.header.managerName : ''}`),
                big(entry.header.counterparty || ''),
                big(protocolNumber(entry.projectNumber, entry.entryNo))
              ]
            ]
          : [
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

  if (handover) {
    content.push({ text: handoverIntro(entry, company), fontSize: 10, margin: [0, 0, 0, 10] });
  }

  if (!handover && entry.conditions && entry.conditions.trim() !== '') {
    content.push({ text: 'Počasí a podmínky na stavbě', fontSize: 8, color: GRAY, bold: true });
    content.push({ text: entry.conditions, fontSize: 10, margin: [0, 2, 0, 10] });
  }

  if (entry.participants.length > 0) {
    content.push({ text: handover ? 'Účastníci předání' : 'Účastníci', fontSize: 8, color: GRAY, bold: true, margin: [0, 0, 0, 3] });
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
    content.push({ text: `${i + 1}. ${p.title && p.title.trim() !== '' ? p.title : handover ? 'Předmět předání' : 'Bod jednání'}`, fontSize: 11, bold: true, color: NAVY, margin: [0, 6, 0, 3] });
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
    content.push({ text: handover ? 'Zjištěné vady a nedodělky' : 'Dohodnuté úkoly', fontSize: 11, bold: true, color: NAVY, margin: [0, 10, 0, 3] });
    content.push({
      table: {
        headerRows: 1,
        widths: ['*', 130, 70],
        body: [
          [th(handover ? 'Vada / nedodělek' : 'Úkol'), th('Odpovědný'), th(handover ? 'Odstranit do' : 'Termín')],
          ...entry.tasks
            .filter((t) => t.description.trim() !== '')
            .map((t): TableCell[] => [td(t.description), td(t.responsible || ''), td(taskDue(t.due))])
        ]
      },
      layout: { hLineColor: () => LINE, vLineColor: () => LINE, hLineWidth: () => 0.5, vLineWidth: () => 0 },
      margin: [0, 0, 0, 12]
    });
  }

  // Závěr předávacího protokolu: výsledek předání a záruka v rámečku.
  if (handover) {
    const result = entry.handover ? entry.handover.result : undefined;
    const warranty = warrantyNote(entry);
    content.push({ text: 'Závěr', fontSize: 11, bold: true, color: NAVY, margin: [0, 10, 0, 3], unbreakable: true } as Content);
    content.push({
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [
                { text: result ? HANDOVER_RESULT_LABELS[result] : '—', fontSize: 11, bold: true, color: handoverResultColor(result) },
                ...(warranty ? [{ text: warranty, fontSize: 10, margin: [0, 3, 0, 0] as [number, number, number, number] }] : [])
              ],
              margin: [6, 4, 6, 4]
            }
          ]
        ]
      },
      layout: boxLayout,
      margin: [0, 0, 0, 10],
      unbreakable: true
    } as Content);
  }

  // Podpisy: každý přítomný účastník a zpracovatel zápisu má řádek pro podpis; u protokolu i strana přebírajícího.
  const counterpartySigner =
    handover && entry.header.counterparty && entry.header.counterparty.trim() !== ''
      ? [{ name: '', note: `za objednatele — ${entry.header.counterparty}` }]
      : [];
  const signers = [
    { name: entry.header.managerName || entry.createdByName, note: `za ${companyLinesOf(company)[0] || 'zhotovitele'}` },
    ...counterpartySigner,
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
  // Zápis podepsaný v aplikaci: podpisové pole se značkou elektronického podpisu (a obrázkem podpisu z profilu).
  if (entry.status === EntryStatus.Podepsano && entry.signatureKind === 'aplikace' && entry.signedAt) {
    content.push({ text: '', margin: [0, 6, 0, 0] } as Content);
    content.push(signatureGrid([{ label: 'Podepsal', name: entry.signedByName || '—', at: entry.signedAt, image: data.signature }], 'podepsáno'));
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
      title: `${entryTitle(entry)} – ${entry.header.constructionName}`,
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
