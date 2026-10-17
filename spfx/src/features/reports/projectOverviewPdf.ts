/**
 * PDF „Project overview“ — marketingový přehled realizovaného projektu pro zákazníky (1–3 strany 16:9 ve stylu RES šablony).
 *
 *  1. úvodní strana: tmavý přechod, předmět realizace, lokalita, rok, výkon, titulní fotka a mapa,
 *  2. o projektu: popis, údaje a technické parametry (mapa umístění je na první straně — pevné místo, nikdy nepřetéká),
 *  3. zadní strana: tmavý přechod, slogan a až dvě fotky, které se částečně překrývají a zabírají co nejvíc místa.
 *
 * Bez cen, nákladů a marže. Obrázky (fotky, mapa) přicházejí zvenku jako data URL; bez nich se strany sestaví bez nich,
 * takže se dokument dá sestavit i v testech.
 */

import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

import { OVERVIEW_LABELS, OverviewLang, ProjectOverview, customerLabel, formatCapacity, formatPower, paramLines } from '../../core/projectOverview';
import { Project } from '../../core/types';
import { PDF_LOGO_DATA_URL } from '../orders/pdfLogo';
import { GRAY, LINE, NAVY, renderPdfDefinition } from '../orders/pdfCommon';
import { PAGE_H, PAGE_W, REPORT_BOLT, ReportAssets } from './projectReportPdf';

const MX = 66;
const DARK = '#262626';
const PALE = '#DCE4F7';
const GREEN_BRAND = '#00a600';

/** Podklad pro PDF: vše, co přehled ukazuje, už načtené. */
export interface OverviewModel {
  lang: OverviewLang;
  project: Project;
  overview: ProjectOverview;
  company: string;
  /** Texty (po úpravě uživatelem, případně ze šablony). */
  text: string;
  /** Fotky jako data URL v pořadí výběru; první je titulní. */
  photos: { dataUrl: string; caption?: string }[];
  /** Mapa umístění jako data URL. */
  map?: string;
  /** Fotky, které se nepodařilo načíst (v PDF chybí). */
  failed?: string[];
}

const tableLayout = { hLineColor: () => LINE, vLineColor: () => 'white', hLineWidth: () => 0.5, vLineWidth: () => 0 };

function fact(label: string, value: string): Content[] {
  return [
    { text: label, fontSize: 9, color: GRAY, margin: [0, 3, 8, 3] } as Content,
    { text: value, fontSize: 10.5, bold: true, color: DARK, margin: [0, 2, 0, 2] } as Content
  ];
}

/** Velký údaj na úvodní straně (výkon, kapacita). */
function bigFact(label: string, value: string): Content {
  return {
    stack: [
      { text: label, fontSize: 10, color: PALE },
      { text: value, fontSize: 30, bold: true, color: 'white', margin: [0, 2, 0, 0] }
    ],
    margin: [0, 0, 28, 0]
  } as Content;
}

function slideTitle(text: string): Content {
  return { text, fontSize: 30, bold: true, color: NAVY, margin: [MX, 34, 220, 18], pageBreak: 'before' } as Content;
}

export function buildOverviewDocument(m: OverviewModel, assets: ReportAssets = {}): TDocumentDefinitions {
  const L = OVERVIEW_LABELS[m.lang];
  const o = m.overview;
  const p = m.project;
  const customer = customerLabel(o, p, m.lang);
  const power = formatPower(o, m.lang);
  const capacity = formatCapacity(o, m.lang);
  const subject = o.subject[m.lang] || (m.lang === 'cs' ? 'Realizace energetického projektu' : 'Energy project');
  const params = paramLines(o, m.lang).slice(0, 8);
  const textSize = m.text.length > 1300 ? 10 : m.text.length > 900 ? 11 : 12.5;
  const meta = [p.location, o.year ? String(o.year) : undefined].filter((x) => !!x).join('  ·  ');

  const full = (image: string | undefined): Content =>
    image
      ? ({ image, width: PAGE_W, height: PAGE_H, absolutePosition: { x: 0, y: 0 } } as Content)
      : ({ canvas: [{ type: 'rect', x: 0, y: 0, w: PAGE_W, h: PAGE_H, color: NAVY }], absolutePosition: { x: 0, y: 0 } } as unknown as Content);

  const content: Content[] = [];

  // --- 1. úvodní strana
  const heroPhoto = m.photos[0];
  const textWidth = heroPhoto ? 470 : 780;
  content.push(full(assets.gradient));
  if (heroPhoto) {
    // Titulní fotka přes pravou část strany (ořezaná na výplň plochy).
    content.push({ image: heroPhoto.dataUrl, cover: { width: 380, height: PAGE_H }, absolutePosition: { x: PAGE_W - 380, y: 0 } } as unknown as Content);
  } else if (assets.streak) {
    content.push({ image: assets.streak, width: 915, absolutePosition: { x: -50, y: 314 } } as Content);
  }
  if (assets.logoDark) {
    content.push({ image: assets.logoDark, width: 80, absolutePosition: { x: 60, y: 44 } } as Content);
  }
  content.push({ text: L.kicker, fontSize: 14, bold: true, color: GREEN_BRAND, characterSpacing: 2, margin: [MX, 140, PAGE_W - MX - textWidth, 0] } as Content);
  content.push({ text: subject, fontSize: subject.length > 40 ? 32 : 40, bold: true, color: 'white', lineHeight: 0.95, margin: [MX, 8, PAGE_W - MX - textWidth, 0] } as Content);
  if (meta) {
    content.push({ text: meta, fontSize: 18, color: PALE, margin: [MX, 14, PAGE_W - MX - textWidth, 0] } as Content);
  }
  content.push({ text: customer, fontSize: 13, color: 'white', margin: [MX, 6, PAGE_W - MX - textWidth, 0] } as Content);
  const bigFacts: Content[] = [];
  if (power) {
    bigFacts.push(bigFact(L.power, power));
  }
  if (capacity) {
    bigFacts.push(bigFact(L.capacity, capacity));
  }
  if (o.showMap && m.map) {
    const MAP_W = 330;
    const MAP_H = 198;
    const mx = heroPhoto ? PAGE_W - 380 + 25 : PAGE_W - MX - MAP_W;
    const my = PAGE_H - MAP_H - 40;
    content.push({ canvas: [{ type: 'rect', x: 0, y: 0, w: MAP_W + 8, h: MAP_H + 8, color: 'white' }], absolutePosition: { x: mx - 4, y: my - 4 } } as unknown as Content);
    content.push({ image: m.map, width: MAP_W, height: MAP_H, absolutePosition: { x: mx, y: my } } as Content);
  }
  if (bigFacts.length > 0) {
    content.push({ columns: bigFacts.map((c) => ({ width: 'auto', stack: [c] })), margin: [MX, 40, 0, 0] } as Content);
  }

  // --- 2. o projektu
  const factRows: Content[][] = [fact(L.subject, subject), fact(L.customer, customer)];
  if (p.location) {
    factRows.push(fact(L.location, p.location));
  }
  if (o.year) {
    factRows.push(fact(L.year, String(o.year)));
  }
  if (power) {
    factRows.push(fact(L.power, power));
  }
  if (capacity) {
    factRows.push(fact(L.capacity, capacity));
  }
  const rightColumn: Content[] = [{ table: { widths: [120, '*'], body: factRows }, layout: tableLayout } as Content];
  if (params.length > 0) {
    rightColumn.push({ text: L.params, fontSize: 9, bold: true, color: GRAY, margin: [0, 12, 0, 3] } as Content);
    rightColumn.push({
      table: { widths: [120, '*'], body: params.map((x) => fact(x.label, x.value)) },
      layout: tableLayout
    } as Content);
  }
  const bolt = REPORT_BOLT(14, '#00A857');
  content.push(slideTitle(L.about));
  content.push({
    columns: [
      { width: 470, stack: [bolt, { text: m.text, fontSize: textSize, lineHeight: 1.3, color: DARK, margin: [0, 6, 0, 0] } as Content] },
      { width: 28, text: '' },
      { width: '*', stack: rightColumn }
    ],
    margin: [MX, 0, MX, 0]
  } as Content);

  // --- 3. zadní strana: slogan a až dvě fotky (druhá částečně překrývá první, ať se fotky maximálně využijí)
  const backPhotos = m.photos.slice(1, 3);
  content.push({ text: '', pageBreak: 'before' } as Content);
  content.push(full(assets.gradient));
  const frame = (x: number, y: number, w: number, h: number, img: string): void => {
    content.push({ canvas: [{ type: 'rect', x: 0, y: 0, w: w + 10, h: h + 10, color: 'white' }], absolutePosition: { x: x - 5, y: y - 5 } } as unknown as Content);
    content.push({ image: img, cover: { width: w, height: h }, absolutePosition: { x, y } } as unknown as Content);
  };
  if (backPhotos.length === 0 && assets.streak) {
    content.push({ image: assets.streak, width: 915, absolutePosition: { x: -50, y: 314 } } as Content, { image: assets.streak, width: 915, absolutePosition: { x: 106, y: -16 } } as Content);
  }
  if (backPhotos.length === 1) {
    frame(430, 45, 470, 450, backPhotos[0].dataUrl);
  } else if (backPhotos.length >= 2) {
    frame(500, 40, 400, 270, backPhotos[0].dataUrl);
    frame(320, 240, 400, 260, backPhotos[1].dataUrl);
  }
  const slogan = backPhotos.length > 0 ? 28 : 48;
  content.push({
    columns: [{ width: backPhotos.length > 0 ? 380 : 780, stack: [{ text: L.contact, fontSize: slogan, bold: true, color: 'white', lineHeight: 0.95 }, { text: L.contact2, fontSize: slogan, bold: true, color: 'white', lineHeight: 0.95, margin: [0, 4, 0, 0] }] }],
    absolutePosition: { x: backPhotos.length > 0 ? MX : MX + 40, y: backPhotos.length > 0 ? 70 : 120 }
  } as Content);
  content.push({ text: m.company, fontSize: 14, color: PALE, absolutePosition: { x: backPhotos.length > 0 ? MX : MX + 40, y: backPhotos.length > 0 ? 474 : 280 } } as Content);
  if (assets.logoDark) {
    content.push({ image: assets.logoDark, width: backPhotos.length > 0 ? 67 : 64, absolutePosition: backPhotos.length > 0 ? { x: MX, y: 420 } : { x: 876, y: 24 } } as Content);
  }

  return {
    pageSize: { width: PAGE_W, height: PAGE_H },
    pageMargins: [0, 0, 0, 30],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: DARK },
    info: { title: `Project overview ${p.projectNumber}`, author: m.company, subject: subject },
    background: (currentPage: number) => (currentPage === 1 ? null : ({ image: PDF_LOGO_DATA_URL, width: 60, absolutePosition: { x: 874, y: 21 } } as Content)),
    footer: (currentPage: number, pageCount: number) =>
      currentPage === 1 || currentPage === pageCount ? null : ({ text: `${m.company} · ${subject}${p.location ? ` · ${p.location}` : ''}`, fontSize: 8, color: GRAY, margin: [MX, 6, 0, 0] } as Content),
    content
  };
}

/** Vykreslí PDF přehledu. */
export function renderProjectOverviewPdf(model: OverviewModel, assets: ReportAssets): Promise<Blob> {
  return renderPdfDefinition(buildOverviewDocument(model, assets));
}
