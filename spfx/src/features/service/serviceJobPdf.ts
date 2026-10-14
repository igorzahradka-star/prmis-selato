/**
 * PDF servisního listu v grafice RES — pro případ, kdy se list posílá e-mailem (např. dodavatel nemá portál). Obsahuje zadání práce,
 * údaje o lokalitě a souboru, termín, podklady z požadavku a podpis vystavitele (značka elektronického podpisu, případně obrázek podpisu z profilu).
 */

import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

import { CompanySettings } from '../../core/settings';
import { SignatureMark } from '../../core/signatures';
import { formatDate } from '../../core/format';
import { GRAY, LINE, companyLinesOf, documentFooter, documentHeader, party, pdfFileName, renderPdfDefinition, signatureGrid } from '../orders/pdfCommon';

export interface ServiceJobPdfData {
  number: string;
  title: string;
  /** Lokalita (číslo a název) a soubor nebo „celá lokalita“. */
  siteName: string;
  deviceName: string;
  siteAddress?: string;
  siteContact?: string;
  requestNumber?: string;
  requestTitle?: string;
  requestDescription?: string;
  reportedBy?: string;
  priority?: string;
  kind: string;
  isInternal: boolean;
  supplier?: { name: string; address?: string; ico?: string; dic?: string; email?: string };
  plannedDate?: Date;
  description?: string;
  /** Názvy příloh (podklady k listu a k požadavku). */
  attachmentNames: string[];
  company: CompanySettings;
  /** Vystavitel listu; `image` je obrázek podpisu z profilu. */
  issuer: { name: string; at?: Date; image?: string };
  /** Text vodoznaku (např. zrušený list). */
  watermark?: string;
}

const fact = (label: string, value: string): Content => ({
  stack: [
    { text: label, fontSize: 8, color: GRAY },
    { text: value || '—', fontSize: 10, bold: true }
  ]
});

export function buildServiceJobDocument(data: ServiceJobPdfData): TDocumentDefinitions {
  const content: Content[] = [
    ...documentHeader(data.company),
    { text: 'SERVISNÍ LIST', fontSize: 9, color: GRAY, bold: true },
    { text: data.number, fontSize: 20, bold: true, margin: [0, 0, 0, 10] },
    {
      columns: [
        { width: '*', stack: [party('OBJEDNATEL', companyLinesOf(data.company))] },
        {
          width: '*',
          stack: [
            data.isInternal
              ? party('PROVEDE', ['Interní servis', 'bez dodavatele a objednávky'])
              : party('DODAVATEL', data.supplier ? [data.supplier.name, data.supplier.address || '', [data.supplier.ico ? `IČO: ${data.supplier.ico}` : '', data.supplier.dic ? `DIČ: ${data.supplier.dic}` : ''].filter((x) => x).join('   '), data.supplier.email || ''].filter((x) => x !== '') : ['—'])
          ]
        }
      ],
      columnGap: 20,
      margin: [0, 0, 0, 12]
    },
    {
      table: {
        widths: ['*', '*', '*', '*'],
        body: [
          [fact('Lokalita', data.siteName), fact('Soubor', data.deviceName), fact('Druh listu', data.kind), fact('Termín provedení', data.plannedDate ? formatDate(data.plannedDate) : 'dle dohody')]
        ]
      },
      layout: { hLineColor: () => LINE, vLineColor: () => LINE, hLineWidth: () => 0.5, vLineWidth: () => 0.5, paddingTop: () => 4, paddingBottom: () => 4 },
      margin: [0, 0, 0, 10]
    }
  ];

  if (data.siteAddress || data.siteContact) {
    content.push({ text: 'Místo a kontakt', fontSize: 8, color: GRAY, bold: true });
    content.push({ text: [data.siteAddress, data.siteContact].filter((x) => !!x).join('\n'), fontSize: 9, margin: [0, 2, 0, 10] });
  }

  content.push({ text: 'Předmět', fontSize: 8, color: GRAY, bold: true });
  content.push({ text: data.title, fontSize: 12, bold: true, margin: [0, 2, 0, 8] });
  content.push({ text: 'Zadání práce', fontSize: 8, color: GRAY, bold: true });
  content.push({ text: data.description && data.description.trim() !== '' ? data.description : '—', fontSize: 10, margin: [0, 2, 0, 10] });

  if (data.requestNumber) {
    content.push({ text: `Podklady z požadavku ${data.requestNumber}`, fontSize: 8, color: GRAY, bold: true });
    content.push({
      text: [data.requestTitle, data.requestDescription, data.reportedBy ? `Nahlásil: ${data.reportedBy}` : '', data.priority ? `Priorita: ${data.priority}` : ''].filter((x) => !!x && String(x).trim() !== '').join('\n'),
      fontSize: 9,
      margin: [0, 2, 0, 10]
    });
  }

  content.push({ text: 'Přílohy (podklady, fotky, nákresy)', fontSize: 8, color: GRAY, bold: true });
  content.push(
    data.attachmentNames.length === 0
      ? { text: 'Bez příloh.', fontSize: 9, italics: true, color: GRAY, margin: [0, 2, 0, 12] }
      : { ul: data.attachmentNames, fontSize: 9, margin: [0, 2, 0, 12] }
  );

  const marks: SignatureMark[] = [{ label: 'Vystavil', name: data.issuer.name, at: data.issuer.at, image: data.issuer.image }];
  content.push({ text: 'Podpis', fontSize: 8, color: GRAY, bold: true, margin: [0, 0, 0, 3] });
  content.push(signatureGrid(marks, 'podepsáno'));

  return {
    pageSize: 'A4',
    pageMargins: [40, 36, 40, 50],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#1B1F2A' },
    info: { title: `Servisní list ${data.number}`, author: data.company.name, subject: data.title },
    watermark: data.watermark ? { text: data.watermark, color: '#8A94A0', opacity: 0.16, bold: true, angle: -30, fontSize: 52 } : undefined,
    content,
    footer: documentFooter(data.company)
  };
}

export function renderServiceJobPdf(data: ServiceJobPdfData): Promise<Blob> {
  return renderPdfDefinition(buildServiceJobDocument(data));
}

export const serviceJobPdfFileName = (number: string): string => pdfFileName(number);
