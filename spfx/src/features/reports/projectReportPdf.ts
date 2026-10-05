/**
 * PDF „Report projektu“ ve stylu RES PowerPointové šablony (`brand/sablony/Revoltum ES_šablona prezentace_v02.pptx`):
 * stránky 16:9 (960 × 540 bodů), úvodní a závěrečná strana s diagonálním přechodem navy → modrá a světelným výbojem,
 * obsahové strany bílé s nadpisem vlevo nahoře a logem vpravo nahoře, zelená blesková odrážka.
 *
 * Model (co se ukazuje) je v `core/projectReport.ts`; tady je jen vzhled. Písmo Roboto (Aptos z šablony se do PDF vkládat nesmí).
 * Obrázky šablony (přechod, výboj, bílé logo) přicházejí zvenku (`ReportAssets`) — bez nich se použije jednobarevný podklad,
 * takže se dokument dá sestavit i v testech.
 */

import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

import { formatDate, formatMoney, formatDateTime } from '../../core/format';
import { ProjectReportModel, REPORT_LIMITS, reportHighlights } from '../../core/projectReport';
import { STATUS_STYLE } from '../../core/geo';
import { ProjectStatus } from '../../core/types';
import { InvoiceKind } from '../../core/invoiceBases';
import { PDF_LOGO_DATA_URL } from '../orders/pdfLogo';
import { GRAY, LINE, NAVY, renderPdfDefinition, td, th } from '../orders/pdfCommon';

export const PAGE_W = 960;
export const PAGE_H = 540;
const MX = 66;
const DARK = '#030422';
const BLUE = '#0268A6';
const PALE = '#C1E4F5';
const GREEN_BRAND = '#00C667';
const GREEN = '#00A857';
const RED = '#C4314B';
const AMBER = '#E8A200';

export interface ReportAssets {
  /** Diagonální přechod na celou stranu (data URL); bez něj jednobarevný podklad. */
  gradient?: string;
  /** Světelný výboj (průhledné pozadí). */
  streak?: string;
  /** Bílé logo pro tmavý podklad. */
  logoDark?: string;
}

const money = (m: ProjectReportModel, v: number | undefined, currency?: string): string => formatMoney(v, currency || m.currency);

/** Zelená blesková odrážka z šablony — vektorově. */
function bolt(height: number = 12, color: string = GREEN): Content {
  const w = height * 0.44;
  const pts: [number, number][] = [
    [0.777, 0],
    [0, 0.596],
    [0.457, 0.544],
    [0.193, 1],
    [1, 0.394],
    [0.519, 0.429]
  ];
  return {
    width: w + 4,
    canvas: [{ type: 'polyline', closePath: true, color, lineWidth: 0, points: pts.map(([x, y]) => ({ x: x * w, y: y * height })) }]
  } as unknown as Content;
}

/** Nadpis obsahové strany (jako v šabloně: velký tučný vlevo nahoře) s podtitulkem. */
function slideTitle(text: string, subtitle?: string, first: boolean = false): Content {
  return {
    stack: [
      { text: text, fontSize: 30, bold: true, color: NAVY },
      ...(subtitle ? [{ text: subtitle, fontSize: 12, color: GRAY, margin: [0, 2, 0, 0] }] : [])
    ],
    margin: [MX, 34, 220, 18],
    pageBreak: first ? undefined : 'before'
  } as Content;
}

const tableLayout = { hLineColor: () => LINE, vLineColor: () => 'white', hLineWidth: () => 0.5, vLineWidth: () => 0 };

/** Dlaždice s údajem: světlý podklad, zelený proužek vlevo (jako akcent značky). */
function tile(label: string, value: string, note?: string, extra?: Content): Content {
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              { text: label, fontSize: 9, color: GRAY },
              { text: value, fontSize: 20, bold: true, color: NAVY, margin: [0, 2, 0, 0] },
              ...(note ? [{ text: note, fontSize: 8, color: GRAY, margin: [0, 2, 0, 0] }] : []),
              ...(extra ? [extra] : [])
            ],
            margin: [10, 8, 10, 8],
            fillColor: '#F3F8FC'
          }
        ]
      ]
    },
    layout: {
      hLineWidth: () => 0.7,
      vLineWidth: (i: number) => (i === 0 ? 4 : 0.7),
      hLineColor: () => LINE,
      vLineColor: (i: number) => (i === 0 ? GREEN_BRAND : LINE)
    }
  } as Content;
}

/** Vodorovný pruh (postup): šedý podklad a barevná výplň do `percent` (přes 100 % červeně). */
function progressBar(width: number, percent: number): Content {
  const p = Math.max(0, percent);
  return {
    canvas: [
      { type: 'rect', x: 0, y: 0, w: width, h: 6, color: '#E3EAF0' },
      { type: 'rect', x: 0, y: 0, w: Math.min(width, (width * p) / 100), h: 6, color: p > 100 ? RED : p > 90 ? AMBER : GREEN }
    ],
    margin: [0, 5, 0, 0]
  } as Content;
}

function chip(text: string, fill: string, color: string): Content {
  return {
    table: { body: [[{ text, fontSize: 9, bold: true, color, fillColor: fill, margin: [7, 2, 7, 2] }]] },
    layout: 'noBorders'
  } as Content;
}

const note = (text: string): Content => ({ text, fontSize: 9, italics: true, color: GRAY, margin: [0, 4, 0, 0] } as Content);
const small = (text: string): Content => ({ text, fontSize: 9, color: GRAY, margin: [0, 8, 0, 3], bold: true } as Content);

function factRow(label: string, value: Content | string): Content[] {
  return [
    { text: label, fontSize: 9, color: GRAY, margin: [0, 4, 8, 4] } as Content,
    typeof value === 'string' ? ({ text: value, fontSize: 10.5, bold: true, margin: [0, 3, 0, 3] } as Content) : value
  ];
}

function statusChip(status: string): Content {
  const style = STATUS_STYLE[status as ProjectStatus];
  return style ? chip(status, style.fill, style.text) : chip(status, '#CFD6DD', '#3F4A57');
}

function budgetText(status: string): Content {
  const color = status === 'Zelená' ? GREEN : status === 'Žlutá' ? AMBER : status === 'Červená' ? RED : GRAY;
  // Roboto nemá znaky ✓ ✕ ani ●, proto je barevná tečka nakreslená vektorově.
  return {
    columns: [
      { width: 14, canvas: [{ type: 'ellipse', x: 5, y: 7, r1: 4.5, r2: 4.5, color }], margin: [0, 0, 0, 0] },
      { width: '*', text: status, bold: true, fontSize: 10.5 }
    ],
    margin: [0, 3, 0, 3]
  } as Content;
}

/** Blok „…a další N“ pod zkrácenou tabulkou. */
const more = (n: number, what: string): Content[] => (n > 0 ? [note(`…a další ${n} (${what}) — všechny jsou v aplikaci.`)] : []);

function slideOverview(m: ProjectReportModel): Content[] {
  const f = m.finance;
  const p = m.project;
  const facts: Content = {
    table: {
      widths: [110, '*'],
      body: [
        factRow('Zákazník', p.customer),
        factRow('Lokalita', p.location),
        factRow('Typ projektu', p.type),
        factRow('Projektový manažer', p.manager),
        factRow('Stav', statusChip(p.status)),
        factRow('Rozpočet', budgetText(p.budgetStatus)),
        factRow('Zahájení', formatDate(p.start)),
        factRow('Ukončení plánované', formatDate(p.endPlanned)),
        ...(p.endActual ? [factRow('Ukončení skutečné', formatDate(p.endActual))] : [])
      ]
    },
    layout: tableLayout
  } as Content;

  const prov = f.provisional ? ' · NESCHVÁLENO (provizorní)' : '';
  const priceNote = f.fromBudget
    ? `prodej realizačního rozpočtu bez DPH${prov}`
    : f.originalPrice
    ? `smluvní cena bez DPH (původně ${formatMoney(f.originalPrice.amount, f.originalPrice.currency)})`
    : 'smluvní cena bez DPH';
  const spentNote = f.fromBudget
    ? f.spentPercent !== undefined
      ? `${String(f.spentPercent).replace('.', ',')} % nákladů rozpočtu — koupeno a odpracováno${prov}`
      : 'skutečnost z rozpočtu'
    : f.spentPercent !== undefined
    ? `${String(f.spentPercent).replace('.', ',')} % ceny — vystavené objednávky bez DPH`
    : 'vystavené objednávky bez DPH';
  const tiles: Content = {
    table: {
      widths: ['*', '*'],
      body: [
        [
          { ...(tile('Celková cena', money(m, f.price), priceNote) as object), margin: [0, 0, 8, 8] } as Content,
          { ...(tile('Vyčerpáno', money(m, f.spent), spentNote, f.spentPercent !== undefined ? progressBar(170, f.spentPercent) : undefined) as object), margin: [8, 0, 0, 8] } as Content
        ],
        [
          { ...(tile('Vyfakturováno', money(m, f.invoiced), 'podklady vyfakturované a uhrazené') as object), margin: [0, 0, 8, 0] } as Content,
          { ...(tile('Uhrazeno', money(m, f.paid), `objednávek ${f.ordersTotal}`) as object), margin: [8, 0, 0, 0] } as Content
        ]
      ]
    },
    layout: 'noBorders'
  } as Content;

  // „Na co dát pozor“ — odrážky jsou zelené blesky z šablony.
  const attention: Content = {
    stack: [
      small('Na co dát pozor'),
      ...reportHighlights(m).map(
        (text) => ({ columns: [bolt(12), { text, fontSize: 10, width: '*' }], columnGap: 4, margin: [0, 2, 0, 2] }) as Content
      )
    ],
    margin: [0, 8, 0, 0]
  } as Content;

  return [slideTitle('Přehled projektu', `${p.number} · ${p.title}`), { columns: [{ width: 360, stack: [facts, attention] }, { width: 24, text: '' }, { width: '*', stack: [tiles] }], margin: [MX, 0, MX, 0] } as Content];
}

/** Realizační rozpočet: souhrn (plán, prodej, marže, skutečnost, zbývá, prognóza, semafor) a tabulka po skupinách. */
function slideBudget(m: ProjectReportModel): Content[] {
  const b = m.budget;
  if (!b) {
    return [];
  }
  const pctText = (v: number): string => `${String(v).replace('.', ',')} %`;
  const status = b.approved
    ? `Schváleno (záznam č. ${b.approvalNo}${b.approvedAt ? `, ${formatDate(b.approvedAt)}` : ''}${b.approvedBy ? `, ${b.approvedBy}` : ''})${b.changedSinceApproval ? ' · od té doby upraveno' : ''}`
    : 'NESCHVÁLENO — čísla jsou provizorní';
  const semColor = b.semaphore === 'Zelená' ? GREEN : b.semaphore === 'Žlutá' ? AMBER : b.semaphore === 'Červená' ? RED : GRAY;
  const kinds: Record<string, string> = { prace: 'práce', rezerva: 'rezerva', standard: '' };
  const rows = b.groups.map((g) => [
    td(g.kind !== 'standard' ? `${g.name} (${kinds[g.kind] || ''})` : g.name, 'left', true),
    td(money(m, g.cost), 'right'),
    td(money(m, g.sale), 'right'),
    td(money(m, g.actual), 'right'),
    td(money(m, g.remaining), 'right'),
    td(g.cost > 0 ? pctText(Math.round((g.actual / g.cost) * 1000) / 10) : '—', 'right')
  ]);
  rows.push([
    td('Celkem', 'left', true),
    td(money(m, b.cost), 'right', true),
    td(money(m, b.sale), 'right', true),
    td(money(m, b.actual), 'right', true),
    td(money(m, b.remaining), 'right', true),
    td(pctText(b.spentPercent), 'right', true)
  ]);
  const table: Content = { table: { headerRows: 1, widths: ['*', 90, 90, 90, 90, 60], body: [[th('Skupina'), th('Plán – nákup', 'right'), th('Plán – prodej', 'right'), th('Skutečnost', 'right'), th('Zbývá', 'right'), th('Čerpáno', 'right')], ...rows] }, layout: tableLayout } as Content;
  return [
    slideTitle('Realizační rozpočet', `${status} · částky bez DPH`),
    {
      stack: [
        {
          columns: [
            { width: '*', stack: [tile('Plán – nákup', money(m, b.cost), `prodej ${money(m, b.sale)}`)] },
            { width: 12, text: '' },
            { width: '*', stack: [tile('Marže z prodeje', pctText(b.marginPercent), 'podíl zisku na prodeji')] },
            { width: 12, text: '' },
            { width: '*', stack: [tile('Skutečnost', money(m, b.actual), `proinvestováno ${pctText(b.spentPercent)}`, progressBar(140, b.spentPercent))] },
            { width: 12, text: '' },
            { width: '*', stack: [tile('Prognóza nákladů', money(m, b.forecast), `objednáno ${money(m, b.ordered)}`)] }
          ],
          margin: [0, 0, 0, 10]
        } as Content,
        {
          columns: [
            { width: 14, canvas: [{ type: 'ellipse', x: 5, y: 7, r1: 4.5, r2: 4.5, color: semColor }] },
            { width: '*', text: `Semafor rozpočtu: ${b.semaphore}${b.deviationPercent !== undefined ? ` · prognóza ${b.deviationPercent > 0 ? '+' : ''}${String(b.deviationPercent).replace('.', ',')} % proti schválenému rozpočtu` : ''}`, fontSize: 10, bold: true }
          ],
          margin: [0, 0, 0, 8]
        } as Content,
        table
      ],
      margin: [MX, 0, MX, 0]
    } as Content
  ];
}

function slideOrders(m: ProjectReportModel): Content[] {
  const f = m.finance;
  const max = f.ordersByStatus.reduce((mx, s) => Math.max(mx, s.amount), 0) || 1;
  const bars: Content[] = f.ordersByStatus.length === 0 ? [note('Projekt zatím nemá žádné objednávky.')] : [];
  f.ordersByStatus.forEach((s) => {
    bars.push({
      columns: [
        { text: s.status, width: 120, fontSize: 9, margin: [0, 2, 0, 0] },
        { width: 110, canvas: [{ type: 'rect', x: 0, y: 3, w: Math.max(2, (110 * s.amount) / max), h: 8, color: BLUE }] },
        { text: `${money(m, s.amount)} (${s.count}×)`, width: '*', fontSize: 9, alignment: 'right' }
      ],
      margin: [0, 2, 0, 2]
    } as Content);
  });

  const rows = f.orders.map((o) => [
    td(o.number, 'left', true),
    td(o.supplier),
    td(o.subject),
    td(o.status),
    td(`${o.originalCurrency ? '≈ ' : ''}${money(m, o.amount)}`, 'right')
  ]);
  const table: Content =
    rows.length === 0
      ? note('Žádné objednávky.')
      : ({ table: { headerRows: 1, widths: [78, 80, '*', 78, 74], body: [[th('Číslo'), th('Dodavatel'), th('Předmět'), th('Stav'), th('Bez DPH', 'right')], ...rows] }, layout: tableLayout } as Content);

  return [
    slideTitle('Objednávky a vyčerpání', `Vyčerpáno ${money(m, f.spent)}${f.price !== undefined ? ` z ${money(m, f.price)}` : ''} · částky bez DPH`),
    {
      columns: [
        { width: 300, stack: [small('Podle stavu'), ...bars] },
        { width: 22, text: '' },
        { width: '*', stack: [small(`Poslední objednávky (${f.ordersTotal})`), table, ...more(f.ordersHidden, 'objednávek')] }
      ],
      margin: [MX, 0, MX, 0]
    } as Content
  ];
}

function slideInvoices(m: ProjectReportModel): Content[] {
  const f = m.finance;
  const rows = f.invoices.map((i) => [
    td(i.number, 'left', true),
    td(i.kind === InvoiceKind.Zaloha ? 'Zálohová faktura' : 'Faktura'),
    td(i.status),
    td(i.dueDate ? formatDate(i.dueDate) : '—'),
    td(i.accountingInvoiceNo || '—'),
    td(`${i.originalCurrency ? '≈ ' : ''}${money(m, i.amount)}`, 'right')
  ]);
  const table: Content =
    rows.length === 0
      ? note('Projekt zatím nemá žádné podklady pro fakturaci.')
      : ({ table: { headerRows: 1, widths: [80, 100, 100, 80, '*', 90], body: [[th('Podklad'), th('Druh'), th('Stav'), th('Splatnost'), th('Číslo faktury'), th('Bez DPH', 'right')], ...rows] }, layout: tableLayout } as Content);

  const sums = f.invoicesByStatus.map((s) => `${s.status}: ${money(m, s.amount)} (${s.count}×)`).join('   ·   ');
  return [
    slideTitle('Fakturace', 'Podklady pro fakturaci a jejich stav · částky bez DPH'),
    {
      stack: [
        {
          columns: [
            { width: '*', stack: [tile('Vyfakturováno', money(m, f.invoiced), 'vyfakturované a uhrazené podklady')] },
            { width: 16, text: '' },
            { width: '*', stack: [tile('Uhrazeno', money(m, f.paid), 'uhrazené podklady')] },
            { width: 16, text: '' },
            { width: '*', stack: [tile('Podkladů celkem', String(f.invoicesByStatus.reduce((n, s) => n + s.count, 0)), 'bez stornovaných')] }
          ],
          margin: [0, 0, 0, 10]
        } as Content,
        table,
        ...more(f.invoicesHidden, 'podkladů'),
        ...(sums ? [{ text: sums, fontSize: 8.5, color: GRAY, margin: [0, 8, 0, 0] } as Content] : [])
      ],
      margin: [MX, 0, MX, 0]
    } as Content
  ];
}

function slideDeadlines(m: ProjectReportModel): Content[] {
  const dRows = m.deadlines.map((d) => [
    td(d.title, 'left', true),
    td(d.type),
    { ...(td(d.dueDate ? formatDate(d.dueDate) : '—') as object), color: d.overdue ? RED : undefined, bold: d.overdue } as Content,
    td(`${d.percent} %`, 'right'),
    td(d.responsible || '—')
  ]);
  const deadlines: Content =
    dRows.length === 0
      ? note('Projekt zatím nemá zadané termíny.')
      : ({ table: { headerRows: 1, widths: ['*', 90, 80, 50, 110], body: [[th('Termín'), th('Typ'), th('Datum'), th('Hotovo', 'right'), th('Odpovídá')], ...dRows] }, layout: tableLayout } as Content);
  const tRows = m.tasks.map((t) => [
    td(t.description),
    td(t.responsible || '—'),
    { ...(td(t.due ? formatDate(t.due) : '—') as object), color: t.overdue ? RED : undefined, bold: t.overdue } as Content,
    td(`č. ${t.entryNo}`, 'right')
  ]);
  const tasks: Content =
    tRows.length === 0
      ? note('V posledních zápisech ze stavby nejsou žádné úkoly.')
      : ({ table: { headerRows: 1, widths: ['*', 110, 80, 50], body: [[th('Úkol ze zápisu'), th('Odpovídá'), th('Do'), th('Zápis', 'right')], ...tRows] }, layout: tableLayout } as Content);

  return [
    slideTitle('Termíny a úkoly', 'Smluvní termíny projektu a úkoly z posledních zápisů ze stavby (červeně po termínu)'),
    {
      columns: [
        { width: '*', stack: [small('Termíny projektu'), deadlines, ...more(m.deadlinesHidden, 'termínů')] },
        { width: 22, text: '' },
        { width: '*', stack: [small('Úkoly ze zápisů'), tasks, ...more(m.tasksHidden, 'úkolů')] }
      ],
      margin: [MX, 0, MX, 0]
    } as Content
  ];
}

function slideDiary(m: ProjectReportModel): Content[] {
  const rows = m.entries.map((e) => [
    td(`č. ${e.entryNo}`, 'left', true),
    td(formatDate(e.date)),
    td(e.diary),
    td(e.counterparty),
    td(e.status),
    td(String(e.pointCount), 'right'),
    td(e.summary)
  ]);
  const table: Content =
    rows.length === 0
      ? note('Projekt zatím nemá žádné zápisy ze stavby.')
      : ({
          table: { headerRows: 1, widths: [40, 62, 80, 90, 66, 34, '*'], body: [[th('Zápis'), th('Datum'), th('Deník'), th('Jednání s'), th('Stav'), th('Bodů', 'right'), th('Stručně')], ...rows] },
          layout: tableLayout
        } as Content);
  return [slideTitle('Stavební deník', 'Poslední zápisy ze stavby a z jednání'), { stack: [table, ...more(m.entriesHidden, 'zápisů')], margin: [MX, 0, MX, 0] } as Content];
}

function slidePhotos(m: ProjectReportModel): Content[] {
  if (m.photos.length === 0) {
    return [slideTitle('Fotodokumentace', 'Poslední fotky z projektu'), { stack: [note('Projekt zatím nemá žádné fotky ve složce FOTO.')], margin: [MX, 0, MX, 0] } as Content];
  }
  const cell = (i: number): Content => {
    const ph = m.photos[i];
    if (!ph) {
      return { text: '' } as Content;
    }
    return {
      stack: [
        { image: ph.dataUrl, fit: [262, 150], margin: [0, 0, 0, 3] },
        { text: ph.caption, fontSize: 8.5, bold: true, color: NAVY },
        { text: ph.batch, fontSize: 7.5, color: GRAY }
      ],
      margin: [0, 0, 12, 8]
    } as Content;
  };
  const rows: Content[][] = [];
  for (let r = 0; r * 3 < Math.min(m.photos.length, REPORT_LIMITS.photos); r++) {
    rows.push([cell(r * 3), cell(r * 3 + 1), cell(r * 3 + 2)]);
  }
  return [
    slideTitle('Fotodokumentace', 'Poslední fotky z projektu (z nejnovější dávky ve složce FOTO)'),
    { table: { widths: ['*', '*', '*'], body: rows }, layout: 'noBorders', margin: [MX, 0, MX - 12, 0] } as Content
  ];
}

/** Sestaví dokument reportu. Dá se zavolat bez obrázků šablony (testy); pak je podklad jednobarevný. */
export function buildProjectReportDocument(m: ProjectReportModel, assets: ReportAssets = {}): TDocumentDefinitions {
  const full = (image: string | undefined): Content =>
    image
      ? ({ image, width: PAGE_W, height: PAGE_H, absolutePosition: { x: 0, y: 0 } } as Content)
      : ({ canvas: [{ type: 'rect', x: 0, y: 0, w: PAGE_W, h: PAGE_H, color: NAVY }], absolutePosition: { x: 0, y: 0 } } as unknown as Content);
  const streaks = (): Content[] =>
    assets.streak
      ? [
          { image: assets.streak, width: 915, absolutePosition: { x: -50, y: 314 } } as Content,
          { image: assets.streak, width: 915, absolutePosition: { x: 106, y: -16 } } as Content
        ]
      : [];

  const content: Content[] = [];

  // --- úvodní strana (jako úvodní snímek šablony: logo vlevo nahoře, nadpis vpravo, výboje)
  content.push(full(assets.gradient), ...streaks());
  if (assets.logoDark) {
    content.push({ image: assets.logoDark, width: 270, absolutePosition: { x: 60, y: 48 } } as Content);
  }
  content.push({ text: 'REPORT PROJEKTU', fontSize: 16, bold: true, color: GREEN_BRAND, margin: [450, 150, 60, 0], characterSpacing: 2 } as Content);
  content.push({ text: m.project.title, fontSize: m.project.title.length > 38 ? 30 : 40, bold: true, color: 'white', margin: [450, 8, 60, 0], lineHeight: 0.95 } as Content);
  content.push({ text: `Projekt ${m.project.number}`, fontSize: 20, color: PALE, margin: [450, 14, 60, 0] } as Content);
  content.push({
    stack: [
      { text: `Stav k ${formatDate(m.generatedAt)}`, fontSize: 16, color: 'white' },
      { text: `Projektový manažer: ${m.project.manager}`, fontSize: 12, color: PALE, margin: [0, 4, 0, 0] },
      { text: `Vytvořil ${m.generatedBy}, ${formatDateTime(m.generatedAt)}`, fontSize: 10, color: PALE, margin: [0, 2, 0, 0] }
    ],
    margin: [450, 40, 60, 0]
  } as Content);

  // --- obsahové strany
  const slides: Content[][] = [slideOverview(m)];
  if (m.sections.budget && m.budget) {
    slides.push(slideBudget(m));
  }
  if (m.sections.finance) {
    slides.push(slideOrders(m), slideInvoices(m));
  }
  if (m.sections.deadlines) {
    slides.push(slideDeadlines(m));
  }
  if (m.sections.diary) {
    slides.push(slideDiary(m));
  }
  if (m.sections.photos) {
    slides.push(slidePhotos(m));
  }
  slides.forEach((s) => content.push(...s));

  // --- závěrečná strana
  content.push({ text: '', pageBreak: 'before' } as Content);
  content.push(full(assets.gradient), ...streaks());
  if (assets.logoDark) {
    content.push({ image: assets.logoDark, width: 190, absolutePosition: { x: 750, y: 24 } } as Content);
  }
  content.push({ text: 'Revoltujte s námi', fontSize: 48, bold: true, color: 'white', margin: [MX + 40, 120, 60, 0] } as Content);
  content.push({ text: 'za moderní decentralizovanou energetiku', fontSize: 48, bold: true, color: 'white', margin: [MX + 40, 4, 60, 0], lineHeight: 0.95 } as Content);
  content.push({ text: `${m.companyName}`, fontSize: 14, color: PALE, margin: [MX + 40, 30, 60, 0] } as Content);

  return {
    pageSize: { width: PAGE_W, height: PAGE_H },
    pageMargins: [0, 0, 0, 30],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: DARK },
    info: { title: `Report projektu ${m.project.number}`, author: m.companyName, subject: `Stav projektu ${m.project.number} k ${formatDate(m.generatedAt)}` },
    // Logo vpravo nahoře na obsahových stranách (jako v šabloně); úvodní a závěrečná strana mají vlastní plochu přes celou stránku.
    background: (currentPage: number) => (currentPage === 1 ? null : ({ image: PDF_LOGO_DATA_URL, width: 180, absolutePosition: { x: 754, y: 21 } } as Content)),
    footer: (currentPage: number, pageCount: number) =>
      currentPage === 1 || currentPage === pageCount
        ? null
        : ({
            columns: [
              { text: [{ text: '' }, { text: `Report projektu ${m.project.number} · stav k ${formatDate(m.generatedAt)} · ${m.companyName}` }], fontSize: 8, color: GRAY, margin: [MX, 6, 0, 0] },
              { text: String(currentPage - 1), fontSize: 8, color: GRAY, alignment: 'right', margin: [0, 6, MX, 0] }
            ]
          } as Content),
    content
  };
}

/** Vykreslí PDF reportu. */
export function renderProjectReportPdf(model: ProjectReportModel, assets: ReportAssets): Promise<Blob> {
  return renderPdfDefinition(buildProjectReportDocument(model, assets));
}

/** Zelená blesková odrážka pro sdílení s dalšími strukturami (export kvůli testu tvaru). */
export const REPORT_BOLT = bolt;
