/**
 * PDF podkladu pro fakturaci v grafice RES.
 *
 * Skládání dokumentu (`buildInvoiceDocument`) je čisté a testovatelné; vykreslení přes pdfmake sdílí s objednávkami
 * (`pdfCommon`). Podklad, který ještě nebyl předán účtárně, dostane přes stránku vodoznak, aby nešel omylem
 * použít jako hotový doklad.
 */

import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';

import { CompanySettings } from '../../core/settings';
import { formatDate, formatMoneyExact } from '../../core/format';
import { lineTotalNet } from '../../core/orders';
import { InvoiceBasis, InvoiceKind, InvoiceStatus, invoiceDocumentTitle, invoiceKindOf, invoiceTotals } from '../../core/invoiceBases';
import { GRAY, LINE, NAVY, companyLinesOf, documentFooter, documentHeader, party, pdfFileName, renderPdfDefinition, signatureGrid, td, th } from '../orders/pdfCommon';
import { SignatureMark } from '../../core/signatures';

export interface InvoicePdfData {
  number: string;
  kind: InvoiceKind;
  projectNumber: string;
  projectTitle: string;
  company: CompanySettings;
  customer: { name: string; address?: string; ico?: string; dic?: string; email?: string };
  lines: InvoiceBasis['lines'];
  vatRate: number;
  currency: string;
  issueDate?: Date;
  taxableDate?: Date;
  dueDate?: Date;
  note?: string;
  requestedByName: string;
  accountingInvoiceNo?: string;
  paidDate?: Date;
  watermark?: string;
  /** Podpisy v ostrém dokladu (vystavitel) — se značkou elektronického podpisu. */
  signatures?: SignatureMark[];
}

/** Vodoznak podle stavu: jen předaný a dále posunutý podklad je „čistý" doklad. */
export function invoiceWatermark(status: InvoiceStatus | undefined): string | undefined {
  switch (status) {
    case InvoiceStatus.Predano:
    case InvoiceStatus.Vyfakturovano:
    case InvoiceStatus.Uhrazeno:
      return undefined;
    case InvoiceStatus.Storno:
      return 'STORNO';
    default:
      return 'NÁHLED – NEPŘEDÁNO';
  }
}

export function invoicePdfData(
  invoice: InvoiceBasis,
  projectTitle: string,
  customer: InvoicePdfData['customer'],
  company: CompanySettings,
  signatures?: SignatureMark[]
): InvoicePdfData {
  return {
    number: invoice.number,
    kind: invoiceKindOf(invoice),
    projectNumber: invoice.projectNumber,
    projectTitle,
    company,
    customer,
    lines: invoice.lines,
    vatRate: invoice.vatRate,
    currency: invoice.currency,
    issueDate: invoice.issueDate,
    taxableDate: invoice.taxableDate,
    dueDate: invoice.dueDate,
    note: invoice.note,
    requestedByName: invoice.requestedByName,
    accountingInvoiceNo: invoice.accountingInvoiceNo,
    paidDate: invoice.paidDate,
    watermark: invoiceWatermark(invoice.status),
    signatures
  };
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
export function buildInvoiceDocument(data: InvoicePdfData): TDocumentDefinitions {
  const totals = invoiceTotals(data.lines, data.vatRate);
  const company = data.company;
  const money = (v: number): string => formatMoneyExact(v, data.currency);

  const customerLines = [
    data.customer.name,
    data.customer.address || '',
    [data.customer.ico ? `IČO: ${data.customer.ico}` : '', data.customer.dic ? `DIČ: ${data.customer.dic}` : ''].filter((x) => x).join('   '),
    data.customer.email || ''
  ].filter((x) => x && x.trim() !== '');

  const itemRows: TableCell[][] = data.lines.map((l, i) => [
    td(String(i + 1), 'center'),
    td(l.description),
    td(String(l.quantity).replace('.', ','), 'right'),
    td(l.unit || '', 'center'),
    td(money(l.unitPriceNet), 'right'),
    td(money(lineTotalNet(l)), 'right')
  ]);

  const small = (text: string): Content => ({ text, fontSize: 8, color: GRAY });
  const big = (text: string): Content => ({ text, fontSize: 10, bold: true });

  const content: Content[] = [
    ...documentHeader(company),
    { text: `${invoiceDocumentTitle(data.kind)} č. ${data.number}`, fontSize: 18, bold: true, color: NAVY },
    {
      text: `Projekt ${data.projectNumber}${data.projectTitle ? ` · ${data.projectTitle}` : ''}`,
      fontSize: 10,
      color: GRAY,
      margin: [0, 2, 0, 12]
    },
    {
      columns: [
        party('DODAVATEL (fakturuje)', [...companyLinesOf(company), `Vystavil: ${data.requestedByName}`]),
        party('ODBĚRATEL', customerLines.length > 0 ? customerLines : ['—'])
      ],
      columnGap: 24,
      margin: [0, 0, 0, 12]
    },
    {
      table: {
        // Záloha nemá datum uskutečnění zdanitelného plnění (DUZP) — to vzniká až u konečné faktury.
        widths: data.kind === InvoiceKind.Zaloha ? ['*', '*', '*'] : ['*', '*', '*', '*'],
        body:
          data.kind === InvoiceKind.Zaloha
            ? [
                [small('Datum vystavení'), small('Splatnost'), small('Měna')],
                [big(data.issueDate ? formatDate(data.issueDate) : '—'), big(data.dueDate ? formatDate(data.dueDate) : '—'), big(data.currency)]
              ]
            : [
                [small('Datum vystavení'), small('DUZP'), small('Splatnost'), small('Měna')],
                [
                  big(data.issueDate ? formatDate(data.issueDate) : '—'),
                  big(data.taxableDate ? formatDate(data.taxableDate) : '—'),
                  big(data.dueDate ? formatDate(data.dueDate) : '—'),
                  big(data.currency)
                ]
              ]
      },
      layout: boxLayout,
      margin: [0, 0, 0, 12]
    },
    {
      table: {
        headerRows: 1,
        widths: [22, '*', 50, 34, 76, 82],
        body: [
          [th('#', 'center'), th('Popis plnění'), th('Množství', 'right'), th('Jedn.', 'center'), th('Cena/jedn. bez DPH', 'right'), th('Celkem bez DPH', 'right')],
          ...itemRows
        ]
      },
      layout: { hLineColor: () => LINE, vLineColor: () => LINE, hLineWidth: () => 0.5, vLineWidth: () => 0 }
    },
    {
      columns: [
        { text: '', width: '*' },
        {
          width: 230,
          table: {
            widths: ['*', 'auto'],
            body: [
              [td('Celkem bez DPH', 'left'), td(money(totals.net), 'right')],
              [td(`DPH ${data.vatRate} %`, 'left'), td(money(totals.vat), 'right')],
              [
                { text: 'Celkem k fakturaci', bold: true, fontSize: 11, margin: [4, 4, 4, 4], fillColor: '#EAF0F5' },
                { text: money(totals.gross), bold: true, fontSize: 11, alignment: 'right', margin: [4, 4, 4, 4], fillColor: '#EAF0F5' }
              ]
            ]
          },
          layout: { hLineColor: () => LINE, vLineColor: () => 'white', hLineWidth: () => 0.5, vLineWidth: () => 0 }
        }
      ],
      margin: [0, 8, 0, 12]
    }
  ];

  if (data.note && data.note.trim() !== '') {
    content.push({ text: 'Poznámka pro účtárnu', fontSize: 8, color: GRAY, bold: true });
    content.push({ text: data.note, fontSize: 9, margin: [0, 2, 0, 12] });
  }

  if (data.signatures && data.signatures.length > 0 && !data.watermark) {
    content.push({ text: 'Podpis', fontSize: 8, color: GRAY, bold: true, margin: [0, 0, 0, 3] });
    content.push(signatureGrid(data.signatures, 'podepsáno'));
  }

  content.push({ text: 'Zpracování v účetnictví', fontSize: 8, color: GRAY, bold: true, margin: [0, 0, 0, 3] });
  content.push({
    table: {
      widths: [180, '*'],
      body: [
        [td('Číslo faktury'), td(data.accountingInvoiceNo || '', 'left', true)],
        [td('Uhrazeno dne'), td(data.paidDate ? formatDate(data.paidDate) : '')]
      ]
    },
    layout: boxLayout
  });

  return {
    pageSize: 'A4',
    pageMargins: [40, 36, 40, 50],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#1B1F2A' },
    info: { title: `${data.kind === InvoiceKind.Zaloha ? 'Podklad pro zálohovou fakturu' : 'Podklad pro fakturaci'} ${data.number}`, author: company.name, subject: `Projekt ${data.projectNumber}` },
    watermark: data.watermark ? { text: data.watermark, color: '#8A94A0', opacity: 0.16, bold: true, angle: -30, fontSize: 52 } : undefined,
    content,
    footer: documentFooter(company)
  };
}

/** Vykreslí PDF podkladu. */
export function renderInvoicePdf(data: InvoicePdfData): Promise<Blob> {
  return renderPdfDefinition(buildInvoiceDocument(data));
}

/** Název souboru: `FP26004.pdf`. */
export function invoicePdfFileName(number: string): string {
  return pdfFileName(number);
}
