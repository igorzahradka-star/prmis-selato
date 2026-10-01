/**
 * PDF objednávky v grafice RES.
 *
 * Skládání dokumentu (`buildOrderDocument`) je čisté a testovatelné; samotné vykreslení do PDF
 * (`renderOrderPdf`) načte knihovnu pdfmake (MIT) až při použití, stejně jako export do Excelu —
 * do startu aplikace se kvůli ní nic nepřidává.
 *
 * Neschválená objednávka dostane přes stránku vodoznak, takže koncept nejde omylem poslat dodavateli
 * jako hotový doklad.
 */

import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';

import { CompanySettings } from '../../core/settings';
import { formatDate, formatMoneyExact } from '../../core/format';
import {
  APPROVAL_LEVEL_LABELS,
  OrderLine,
  OrderStatus,
  PurchaseOrder,
  lineTotalNet,
  orderTotals
} from '../../core/orders';
import { GRAY, LINE, NAVY, companyLinesOf, documentFooter, documentHeader, pdfFileName, party, renderPdfDefinition, signatureGrid, td, th } from './pdfCommon';
import { SignatureMark } from '../../core/signatures';

export interface OrderPdfData {
  /** Číslo objednávky; u nezaložené objednávky „NÁVRH". */
  orderNumber: string;
  issueDate: Date;
  projectNumber: string;
  projectTitle: string;
  company: CompanySettings;
  supplier: { name: string; address?: string; ico?: string; dic?: string; email?: string };
  subject: string;
  lines: OrderLine[];
  vatRate: number;
  currency: string;
  deliveryDate?: Date;
  paymentTermDays?: number;
  note?: string;
  requestedByName: string;
  approvals: { label: string; name: string; at?: Date; auto?: boolean; login?: string; image?: string }[];
  /** Vystavitel — v ostrém dokladu podepsán (značka elektronického podpisu, případně obrázek podpisu z profilu). */
  issuer?: { name: string; login: string; at?: Date; image?: string };
  /** Text vodoznaku; prázdný = schválený doklad bez vodoznaku. */
  watermark?: string;
}

/** Vodoznak podle stavu: jen schválená a dále posunutá objednávka je „čistý" doklad. */
export function watermarkForStatus(status: OrderStatus | undefined): string | undefined {
  switch (status) {
    case OrderStatus.Schvaleno:
    case OrderStatus.Odeslano:
    case OrderStatus.Dodano:
    case OrderStatus.Uzavreno:
      return undefined;
    case OrderStatus.Storno:
      return 'STORNO';
    case OrderStatus.Zamitnuto:
      return 'ZAMÍTNUTO';
    default:
      return 'NÁHLED – NESCHVÁLENO';
  }
}

/** Údaje do PDF z objednávky — schvalovatelé podle řetězce, vystavitel podle objednávky. */
export function orderPdfData(
  order: PurchaseOrder,
  projectTitle: string,
  supplier: OrderPdfData['supplier'],
  company: CompanySettings,
  now: Date = new Date()
): OrderPdfData {
  return {
    orderNumber: order.orderNumber,
    issueDate: order.created ?? now,
    projectNumber: order.projectNumber,
    projectTitle,
    company,
    supplier,
    subject: order.subject,
    lines: order.lines,
    vatRate: order.vatRate,
    currency: order.currency,
    deliveryDate: order.deliveryDate,
    paymentTermDays: order.paymentTermDays,
    note: order.note,
    requestedByName: order.requestedByName,
    approvals: order.approvalChain
      .filter((s) => s.approved)
      .map((s) => ({
        label: APPROVAL_LEVEL_LABELS[s.level],
        name: s.auto ? `${order.requestedByName} (vystavitel, v rámci svého limitu)` : s.byName || '—',
        at: s.at,
        auto: s.auto,
        login: s.auto ? undefined : s.byLogin
      })),
    issuer: { name: order.requestedByName, login: order.requestedByLogin, at: order.created },
    watermark: watermarkForStatus(order.status)
  };
}

/** Sestaví definici dokumentu pro pdfmake. */
export function buildOrderDocument(data: OrderPdfData): TDocumentDefinitions {
  const totals = orderTotals(data.lines, data.vatRate);
  const company = data.company;
  const money = (v: number): string => formatMoneyExact(v, data.currency);

  const companyLines = companyLinesOf(company);

  const supplierLines: string[] = [
    data.supplier.name,
    data.supplier.address || '',
    [data.supplier.ico ? `IČO: ${data.supplier.ico}` : '', data.supplier.dic ? `DIČ: ${data.supplier.dic}` : '']
      .filter((x) => x)
      .join('   '),
    data.supplier.email || ''
  ].filter((x) => x && x.trim() !== '');

  const itemRows: TableCell[][] = data.lines.map((l, i) => [
    td(String(i + 1), 'center'),
    td(l.description),
    td(String(l.quantity).replace('.', ','), 'right'),
    td(l.unit || '', 'center'),
    td(money(l.unitPriceNet), 'right'),
    td(money(lineTotalNet(l)), 'right')
  ]);

  const content: Content[] = [
    ...documentHeader(company),
    { text: `OBJEDNÁVKA č. ${data.orderNumber}`, fontSize: 18, bold: true, color: NAVY },
    {
      text: `Projekt ${data.projectNumber}${data.projectTitle ? ` · ${data.projectTitle}` : ''}`,
      fontSize: 10,
      color: GRAY,
      margin: [0, 2, 0, 12]
    },
    {
      columns: [party('OBJEDNATEL', [...companyLines, `Vystavil: ${data.requestedByName}`]), party('DODAVATEL', supplierLines)],
      columnGap: 24,
      margin: [0, 0, 0, 12]
    },
    {
      table: {
        widths: ['*', '*', '*', '*'],
        body: [
          [
            { text: 'Datum vystavení', fontSize: 8, color: GRAY },
            { text: 'Termín dodání', fontSize: 8, color: GRAY },
            { text: 'Splatnost', fontSize: 8, color: GRAY },
            { text: 'Měna', fontSize: 8, color: GRAY }
          ],
          [
            { text: formatDate(data.issueDate), fontSize: 10, bold: true },
            { text: data.deliveryDate ? formatDate(data.deliveryDate) : 'dle dohody', fontSize: 10, bold: true },
            { text: data.paymentTermDays !== undefined ? `${data.paymentTermDays} dnů` : '—', fontSize: 10, bold: true },
            { text: data.currency, fontSize: 10, bold: true }
          ]
        ]
      },
      layout: { hLineColor: () => LINE, vLineColor: () => LINE, hLineWidth: () => 0.5, vLineWidth: () => 0.5, paddingTop: () => 4, paddingBottom: () => 4 },
      margin: [0, 0, 0, 12]
    },
    { text: 'Předmět objednávky', fontSize: 8, color: GRAY, bold: true },
    { text: data.subject, fontSize: 11, margin: [0, 2, 0, 10] },
    {
      table: {
        headerRows: 1,
        widths: [22, '*', 50, 34, 76, 82],
        body: [
          [th('#', 'center'), th('Popis'), th('Množství', 'right'), th('Jedn.', 'center'), th('Cena/jedn. bez DPH', 'right'), th('Celkem bez DPH', 'right')],
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
                { text: 'Celkem s DPH', bold: true, fontSize: 11, margin: [4, 4, 4, 4], fillColor: '#EAF0F5' },
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
    content.push({ text: 'Poznámka', fontSize: 8, color: GRAY, bold: true });
    content.push({ text: data.note, fontSize: 9, margin: [0, 2, 0, 12] });
  }

  content.push({ text: 'Schválení', fontSize: 8, color: GRAY, bold: true, margin: [0, 0, 0, 3] });
  if (data.approvals.length === 0) {
    content.push({ text: 'Objednávka zatím není schválená.', fontSize: 9, italics: true, color: GRAY });
  } else {
    // Podpisová pole: vystavitel (jen v ostrém dokladu) a schvalovatelé, každý se značkou elektronického podpisu.
    const marks: SignatureMark[] = [];
    if (data.issuer && !data.watermark) {
      marks.push({ label: 'Vystavil', name: data.issuer.name, at: data.issuer.at, image: data.issuer.image });
    }
    data.approvals.forEach((a) => marks.push({ label: a.label, name: a.name, at: a.at, auto: a.auto, image: a.image }));
    content.push(signatureGrid(marks, 'schváleno'));
  }

  return {
    pageSize: 'A4',
    pageMargins: [40, 36, 40, 50],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#1B1F2A' },
    info: { title: `Objednávka ${data.orderNumber}`, author: company.name, subject: data.subject },
    watermark: data.watermark
      ? { text: data.watermark, color: '#8A94A0', opacity: 0.16, bold: true, angle: -30, fontSize: 52 }
      : undefined,
    content,
    footer: documentFooter(company)
  };
}

/** Vykreslí PDF objednávky. */
export function renderOrderPdf(data: OrderPdfData): Promise<Blob> {
  return renderPdfDefinition(buildOrderDocument(data));
}

/** Název souboru PDF: `OBJ-2026-0005.pdf`. Nepovolené znaky se vynechají. */
export function orderPdfFileName(orderNumber: string): string {
  return pdfFileName(orderNumber);
}
