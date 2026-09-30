/**
 * Editovatelný Word (.docx) zápisu ze stavby. Obsah je stejný jako v PDF; Word slouží, když je potřeba zápis upravit
 * mimo aplikaci nebo vložit do jiného dokumentu. Zdrojem pravdy zůstává zápis v aplikaci — úpravy Wordu se do ní nevracejí.
 *
 * Knihovna `docx` (MIT) se načte až při použití, stejně jako pdfmake.
 */

import { formatDate } from '../../core/format';
import { EntryStatus } from '../../core/siteDiary';
import { EntryDocData, closureNote, entryWatermark, signatureNote, taskDue } from './entryDocument';
import { dataUrlToBytes } from './imageUtils';

/** Text s odřádkováním: každý řádek je samostatný běh textu oddělený zalomením. */
function lines(text: string): string[] {
  return (text || '').split(/\r?\n/);
}

export async function renderEntryDocx(data: EntryDocData): Promise<Blob> {
  const docx = await import(/* webpackChunkName: 'docx' */ 'docx');
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ImageRun, AlignmentType, BorderStyle, Footer, PageNumber } = docx;
  const { entry, company } = data;

  const para = (text: string, opts: { bold?: boolean; size?: number; color?: string; after?: number; before?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}): InstanceType<typeof Paragraph> =>
    new Paragraph({
      alignment: opts.align,
      spacing: { after: opts.after ?? 80, before: opts.before ?? 0 },
      children: lines(text).map((l, i) => new TextRun({ text: l, break: i === 0 ? 0 : 1, bold: opts.bold, size: opts.size, color: opts.color, font: 'Calibri' }))
    });

  const thin = { style: BorderStyle.SINGLE, size: 4, color: 'C7D4DD' };
  const borders = { top: thin, bottom: thin, left: thin, right: thin };

  const cell = (text: string, opts: { bold?: boolean; fill?: string; color?: string; width?: number } = {}): InstanceType<typeof TableCell> =>
    new TableCell({
      borders,
      shading: opts.fill ? { fill: opts.fill } : undefined,
      width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [para(text || '', { bold: opts.bold, color: opts.color, size: 19, after: 0 })]
    });

  const head = (text: string, width?: number): InstanceType<typeof TableCell> => cell(text, { bold: true, fill: '0E2841', color: 'FFFFFF', width });

  const table = (rows: InstanceType<typeof TableRow>[]): InstanceType<typeof Table> =>
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];

  // Hlavička firmy
  children.push(para(company.name, { bold: true, size: 26, color: '0268A6', after: 0 }));
  const addr = [company.street, `${company.zip} ${company.city}`.trim(), [company.ico ? `IČO: ${company.ico}` : '', company.dic ? `DIČ: ${company.dic}` : ''].filter((x) => x).join('   ')]
    .filter((x) => x && x.trim() !== '')
    .join(' · ');
  if (addr) {
    children.push(para(addr, { size: 18, color: '5A6472', after: 200 }));
  }

  children.push(para(`ZÁPIS č. ${entry.entryNo}`, { bold: true, size: 36, color: '0E2841', after: 40 }));
  children.push(
    para(`${entry.diaryTitle ? `Stavební deník: ${entry.diaryTitle} · ` : ''}Projekt ${entry.projectNumber}${data.projectTitle ? ` · ${data.projectTitle}` : ''}`, {
      size: 20,
      color: '5A6472',
      after: 200
    })
  );
  const watermark = entryWatermark(entry.status);
  if (watermark) {
    children.push(para(`— ${watermark} —`, { bold: true, size: 22, color: 'C4314B', after: 160 }));
  }

  children.push(
    table([
      new TableRow({ children: [cell('Stavba', { bold: true, fill: 'EAF0F5', width: 22 }), cell(entry.header.constructionName, { width: 78 })] }),
      new TableRow({ children: [cell('Místo stavby', { bold: true, fill: 'EAF0F5' }), cell(entry.header.place)] }),
      new TableRow({ children: [cell('Datum', { bold: true, fill: 'EAF0F5' }), cell(formatDate(entry.date))] }),
      new TableRow({ children: [cell('Projektový manažer stavby', { bold: true, fill: 'EAF0F5' }), cell(entry.header.managerName)] }),
      new TableRow({ children: [cell('Jednání s', { bold: true, fill: 'EAF0F5' }), cell(entry.header.counterparty || '')] }),
      ...(entry.conditions && entry.conditions.trim() !== ''
        ? [new TableRow({ children: [cell('Počasí a podmínky', { bold: true, fill: 'EAF0F5' }), cell(entry.conditions)] })]
        : [])
    ])
  );

  if (entry.participants.length > 0) {
    children.push(para('Účastníci', { bold: true, size: 22, color: '0E2841', before: 240, after: 80 }));
    children.push(
      table([
        new TableRow({ tableHeader: true, children: [head('Jméno', 28), head('Firma / subjekt', 32), head('Funkce', 25), head('Přítomen', 15)] }),
        ...entry.participants.map(
          (p) => new TableRow({ children: [cell(p.name), cell(p.organization || ''), cell(p.role || ''), cell(p.present ? 'ano' : 'omluven')] })
        )
      ])
    );
  }

  entry.points.forEach((p, i) => {
    if (p.text.trim() === '' && p.files.length === 0 && !(p.title && p.title.trim() !== '')) {
      return;
    }
    children.push(para(`${i + 1}. ${p.title && p.title.trim() !== '' ? p.title : 'Bod jednání'}`, { bold: true, size: 23, color: '0E2841', before: 220, after: 60 }));
    if (p.text.trim() !== '') {
      children.push(para(p.text, { size: 21, after: 100 }));
    }
    p.files
      .filter((f) => data.images[f])
      .forEach((name) => {
        const img = data.images[name];
        // Šířka nejvýš 460 bodů, výška nejvýš 330, poměr stran zůstává.
        const ratio = img.width / img.height;
        const w = Math.min(460, 330 * ratio);
        children.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [new ImageRun({ type: 'jpg', data: dataUrlToBytes(img.dataUrl), transformation: { width: Math.round(w), height: Math.round(w / ratio) } })]
          })
        );
        children.push(para(name, { size: 14, color: '5A6472', after: 120 }));
      });
    const others = p.files.filter((f) => !data.images[f]);
    if (others.length > 0) {
      children.push(para(`Přílohy: ${others.join(', ')}`, { size: 18, color: '5A6472', after: 100 }));
    }
  });

  const tasks = entry.tasks.filter((t) => t.description.trim() !== '');
  if (tasks.length > 0) {
    children.push(para('Dohodnuté úkoly', { bold: true, size: 23, color: '0E2841', before: 240, after: 80 }));
    children.push(
      table([
        new TableRow({ tableHeader: true, children: [head('Úkol', 55), head('Odpovědný', 28), head('Termín', 17)] }),
        ...tasks.map((t) => new TableRow({ children: [cell(t.description), cell(t.responsible || ''), cell(taskDue(t.due))] }))
      ])
    );
  }

  // Podpisy: řádek pro podpis u každého přítomného účastníka a u zpracovatele.
  children.push(para('Podpisy', { bold: true, size: 23, color: '0E2841', before: 300, after: 160 }));
  const signers = [
    { name: entry.header.managerName || entry.createdByName, note: `za ${company.name || 'zhotovitele'}` },
    ...entry.participants.filter((p) => p.present && p.name.trim() !== '').map((p) => ({ name: p.name, note: p.organization || '' }))
  ];
  signers.forEach((s) => {
    children.push(
      new Paragraph({
        spacing: { before: 360, after: 0 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '333333', space: 1 } },
        tabStops: [],
        children: [new TextRun({ text: ' ', size: 4 })]
      })
    );
    children.push(para(`${s.name}${s.note ? ` — ${s.note}` : ''}`, { size: 18, after: 60 }));
  });

  const closure = closureNote(entry);
  const signature = signatureNote(entry);
  if (closure) {
    children.push(para(closure, { size: 15, color: '5A6472', before: 240, after: 40 }));
  }
  if (signature) {
    children.push(para(signature, { bold: true, size: 16, after: 40 }));
  }
  if (entry.status === EntryStatus.Storno && entry.cancelReason) {
    children.push(para(`Stornováno: ${entry.cancelReason}`, { size: 18, color: '7A1712', before: 160 }));
  }

  const doc = new Document({
    creator: company.name,
    title: `Zápis č. ${entry.entryNo} – ${entry.header.constructionName}`,
    description: `Projekt ${entry.projectNumber}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `${company.claim || company.name}   ·   Strana `, size: 16, color: '5A6472' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '5A6472' }),
                  new TextRun({ text: ' z ', size: 16, color: '5A6472' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '5A6472' })
                ]
              })
            ]
          })
        },
        children
      }
    ]
  });

  return Packer.toBlob(doc);
}

