import * as util from 'util';
import { buildEntryPdfDocument, closureNote, companyForEntry, entryWatermark, nonImageAttachments, signatureNote, taskDue } from './entryDocument';
import { renderEntryDocx } from './entryDocx';
import { extensionForType, fitSize, photoFileName, readBlob, uniqueFileName } from './imageUtils';
import { DiaryEntry, EntryStatus, emptyHeader } from '../../core/siteDiary';
import { DEFAULT_SETTINGS } from '../../core/settings';

const header = { ...emptyHeader(DEFAULT_SETTINGS.company), constructionName: 'FVE Mastířovice', place: 'Mastířovice', managerName: 'Petr Manažer', counterparty: 'BELTEC s.r.o.' };

// Nejmenší platný JPEG (1×1 bod), ať se dá vyzkoušet vložení obrázku.
const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

function zapis(extra: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id: 1,
    diaryId: 1,
    diaryTitle: 'Hlavní deník',
    projectNumber: '26001',
    entryNo: 7,
    date: new Date(2026, 9, 1),
    folderPath: 'Zápisy/Hlavní deník/Z007',
    header,
    participants: [
      { name: 'Jan Dodavatel', organization: 'BELTEC s.r.o.', role: 'stavbyvedoucí', present: true },
      { name: 'Eva Omluvená', organization: 'Investor', present: false }
    ],
    points: [
      { title: 'Kabeláž', text: 'Položeno 200 m kabelu.\nZbývá 50 m.', files: ['foto1.jpg', 'plan.pdf'] },
      { title: '', text: 'Bez nadpisu', files: [] }
    ],
    tasks: [{ description: 'Dodat revizní zprávu', responsible: 'Jan Dodavatel', due: '2026-10-15' }],
    conditions: 'Jasno, 12 °C',
    status: EntryStatus.Koncept,
    createdByName: 'Anna Asistentka',
    createdByLogin: 'anna',
    ...extra
  };
}

/** Všechen text z dokumentu na jednu hromadu — stačí na kontrolu, co v PDF je. */
function allText(node: unknown): string {
  if (node === null || node === undefined) {
    return '';
  }
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(allText).join(' ');
  }
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>;
    return ['text', 'stack', 'columns', 'table', 'body'].map((k) => (k in o ? allText(o[k]) : '')).join(' ');
  }
  return '';
}

describe('PDF zápisu', () => {
  const doc = buildEntryPdfDocument({
    entry: zapis(),
    projectTitle: 'MASTIROVICE 1',
    company: companyForEntry(zapis(), DEFAULT_SETTINGS.company),
    images: { 'foto1.jpg': { dataUrl: TINY_JPEG, width: 4000, height: 3000 } }
  });
  const text = allText(doc.content);

  it('má číslo zápisu, deník, stavbu, místo, datum a projektového manažera', () => {
    expect(text).toContain('ZÁPIS č. 7');
    expect(text).toContain('Stavební deník: Hlavní deník');
    expect(text).toContain('FVE Mastířovice');
    expect(text).toContain('Mastířovice');
    expect(text).toContain('1. 10. 2026');
    expect(text).toContain('Petr Manažer');
    expect(text).toContain('BELTEC s.r.o.');
  });

  it('obsahuje účastníky, body, úkoly a podpisové řádky přítomných', () => {
    expect(text).toContain('Jan Dodavatel');
    expect(text).toContain('omluven');
    expect(text).toContain('1. Kabeláž');
    expect(text).toContain('Položeno 200 m kabelu.');
    expect(text).toContain('Bod jednání');
    expect(text).toContain('Dodat revizní zprávu');
    expect(text).toContain('15. 10. 2026');
    expect(text).toContain('Podpisy');
    expect(text).toContain('Jasno, 12 °C');
  });

  it('obrázek se vloží a soubor, který není obrázek, se vypíše jako příloha', () => {
    expect(JSON.stringify(doc.content)).toContain('"image":"data:image/jpeg');
    expect(text).toContain('Přílohy: plan.pdf');
    expect(nonImageAttachments(zapis())).toEqual(['plan.pdf']);
  });

  it('koncept má vodoznak, uzavřený ne; storno ano', () => {
    expect(doc.watermark).toBeDefined();
    expect(entryWatermark(EntryStatus.Koncept)).toBe('KONCEPT');
    expect(entryWatermark(EntryStatus.Uzavreno)).toBeUndefined();
    expect(entryWatermark(EntryStatus.Podepsano)).toBeUndefined();
    expect(entryWatermark(EntryStatus.Storno)).toBe('STORNO');
  });

  it('uzavřený a podepsaný zápis nese kdo, kdy a otisk', () => {
    const z = zapis({
      status: EntryStatus.Podepsano,
      closedByName: 'Anna Asistentka',
      closedAt: new Date(2026, 9, 1, 15, 30),
      contentHash: 'abcdef1234',
      signatureKind: 'aplikace',
      signedByName: 'Petr Manažer',
      signedAt: new Date(2026, 9, 2, 8, 0)
    });
    const d = buildEntryPdfDocument({ entry: z, projectTitle: '', company: companyForEntry(z, DEFAULT_SETTINGS.company), images: {} });
    const t = allText(d.content);
    expect(t).toContain('uzavřen v aplikaci PRM: Anna Asistentka');
    expect(t).toContain('abcdef1234');
    expect(t).toContain('podepsán (podpis v aplikaci): Petr Manažer');
    expect(closureNote(zapis())).toBeUndefined();
    expect(signatureNote(zapis())).toBeUndefined();
  });

  it('firma v hlavičce se bere ze zápisu, takže jde upravit', () => {
    const z = zapis({ header: { ...header, company: { ...header.company, name: 'Jiná firma s.r.o.' } } });
    expect(companyForEntry(z, DEFAULT_SETTINGS.company).name).toBe('Jiná firma s.r.o.');
    expect(companyForEntry(z, DEFAULT_SETTINGS.company).claim).toBe(DEFAULT_SETTINGS.company.claim);
  });

  it('termín úkolu se zobrazí česky; neznámý tvar zůstane', () => {
    expect(taskDue('2026-10-15')).toBe('15. 10. 2026');
    expect(taskDue('brzy')).toBe('brzy');
    expect(taskDue(undefined)).toBe('—');
  });
});

describe('Word zápisu', () => {
  beforeAll(() => {
    // Testovací prostředí nezná TextEncoder, který knihovna docx potřebuje (prohlížeč ho má).
    Object.assign(globalThis, { TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder });
  });

  it('vznikne platný soubor .docx (zip) s obrázkem a českým textem', async () => {
    const blob = await renderEntryDocx({
      entry: zapis({ status: EntryStatus.Uzavreno }),
      projectTitle: 'MASTIROVICE 1',
      company: companyForEntry(zapis(), DEFAULT_SETTINGS.company),
      images: { 'foto1.jpg': { dataUrl: TINY_JPEG, width: 4000, height: 3000 } }
    });
    expect(blob.size).toBeGreaterThan(2000);
    const bytes = new Uint8Array(await readBlob(blob));
    // Soubor .docx je zip — začíná značkou PK.
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
  });
});

describe('obrázky', () => {
  it('fitSize zmenší jen větší obrázek a zachová poměr stran', () => {
    expect(fitSize(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitSize(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
    expect(fitSize(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });
  it('název fotky z okamžiku pořízení; při shodě se přidá pořadí', () => {
    const t = new Date(2026, 9, 1, 14, 25, 30);
    expect(photoFileName(t, [])).toBe('Foto_20261001_142530.jpg');
    expect(photoFileName(t, ['Foto_20261001_142530.jpg'])).toBe('Foto_20261001_142530_2.jpg');
    expect(photoFileName(t, ['foto_20261001_142530.JPG', 'Foto_20261001_142530_2.jpg'])).toBe('Foto_20261001_142530_3.jpg');
    expect(photoFileName(t, [], '.png', 'Nacrt')).toBe('Nacrt_20261001_142530.png');
  });
});

describe('názvy souborů', () => {
  it('uniqueFileName přidá pořadí jen při shodě', () => {
    expect(uniqueFileName('foto.jpg', [])).toBe('foto.jpg');
    expect(uniqueFileName('foto.jpg', ['Foto.JPG'])).toBe('foto_2.jpg');
    expect(uniqueFileName('foto.jpg', ['foto.jpg', 'foto_2.jpg'])).toBe('foto_3.jpg');
    expect(uniqueFileName('README', ['readme'])).toBe('README_2');
  });
  it('přípona podle typu', () => {
    expect(extensionForType('image/jpeg')).toBe('.jpg');
    expect(extensionForType('application/pdf')).toBe('.pdf');
    expect(extensionForType('text/x')).toBe('');
  });
});
