import {
  BATCH_TITLE_MAX,
  batchFolderName,
  batchTitle,
  buildPhotoName,
  folderLink,
  isYearFolder,
  parentUrl,
  parseBatchFolder,
  photoFolderPath,
  photoThumbnailUrl,
  sortBatchFolders,
  uploadSummary
} from './photos';

describe('název dávky', () => {
  it('běžný text zůstane, včetně diakritiky a mezer', () => {
    expect(batchTitle('Mělký výkop')).toBe('Mělký výkop');
    expect(batchTitle('  Foto   problém  1 ')).toBe('Foto problém 1');
    expect(batchTitle('KD-1')).toBe('KD-1');
  });

  it('znaky nepovolené ve složce SharePointu se vyhodí', () => {
    expect(batchTitle('Panely/jih: #2 *test* <a>')).toBe('Panelyjih 2 test a');
    expect(batchTitle('a\\b|c?d"e%f')).toBe('abcdef');
  });

  it('tečky na okraji pryč a délka omezená', () => {
    expect(batchTitle('..skryto..')).toBe('skryto');
    expect(batchTitle('a'.repeat(100)).length).toBe(BATCH_TITLE_MAX);
    expect(batchTitle('ab '.repeat(40)).length).toBeLessThanOrEqual(BATCH_TITLE_MAX);
  });

  it('prázdný nebo samé nepovolené znaky dá prázdný název', () => {
    expect(batchTitle('')).toBe('');
    expect(batchTitle(undefined)).toBe('');
    expect(batchTitle(' / * ')).toBe('');
  });
});

describe('složky fotek', () => {
  it('název složky dávky: datum a volitelný název', () => {
    expect(batchFolderName(new Date(2026, 2, 1))).toBe('2026-03-01');
    expect(batchFolderName(new Date(2026, 2, 1), 'Mělký výkop')).toBe('2026-03-01 Mělký výkop');
    expect(batchFolderName(new Date(2026, 2, 1), ' / ')).toBe('2026-03-01');
  });

  it('cesta dávky v projektu: přímo ve složce FOTO, bez podsložky roku', () => {
    expect(photoFolderPath('07-Dokumentace a podklady/FOTO', new Date(2026, 2, 1), 'Foto problem 1')).toBe(
      '07-Dokumentace a podklady/FOTO/2026-03-01 Foto problem 1'
    );
    expect(photoFolderPath('/FOTO/', new Date(2026, 0, 5))).toBe('FOTO/2026-01-05');
    expect(photoFolderPath('', new Date(2026, 0, 5), 'x')).toBe('2026-01-05 x');
  });

  it('rozbor názvu složky: nový tvar, starší s podtržítkem, cizí název', () => {
    expect(parseBatchFolder('2026-03-01 Mělký výkop').title).toBe('Mělký výkop');
    expect(parseBatchFolder('2026-03-01 Mělký výkop').date).toEqual(new Date(2026, 2, 1));
    expect(parseBatchFolder('2026-10-01_KD')).toEqual({ date: new Date(2026, 9, 1), title: 'KD' });
    expect(parseBatchFolder('2026-10-01').title).toBe('');
    expect(parseBatchFolder('Staré fotky')).toEqual({ title: 'Staré fotky' });
    expect(parseBatchFolder('2026-13-45 nesmysl').date).toBeUndefined();
  });

  it('složka s rokem se pozná', () => {
    expect(isYearFolder('2026')).toBe(true);
    expect(isYearFolder('2026-03-01 x')).toBe(false);
    expect(isYearFolder('202')).toBe(false);
  });

  it('dávky od nejnovější, bez data na konec', () => {
    const r = sortBatchFolders([{ name: 'Staré' }, { name: '2026-03-01 B' }, { name: '2026-05-02 A' }, { name: '2026-03-01 A' }]);
    expect(r.map((x) => x.name)).toEqual(['2026-05-02 A', '2026-03-01 A', '2026-03-01 B', 'Staré']);
  });

  it('adresa miniatury obsahuje zakódovanou cestu k souboru', () => {
    const u = photoThumbnailUrl('https://x.sharepoint.com/', '/sites/a/Shared Documents/FOTO/Foto 1.jpg', 300);
    expect(u).toContain('https://x.sharepoint.com/_layouts/15/getpreview.ashx');
    expect(u).toContain('width=300');
    expect(u).toContain(encodeURIComponent('https://x.sharepoint.com/sites/a/Shared Documents/FOTO/Foto 1.jpg'));
  });

  it('odkaz na složku zakóduje jednotlivé části', () => {
    expect(folderLink('https://x.sharepoint.com/sites/a/Sdilene dokumenty/26001', '07-Dokumentace a podklady/FOTO')).toBe(
      'https://x.sharepoint.com/sites/a/Sdilene dokumenty/26001/07-Dokumentace%20a%20podklady/FOTO'
    );
    expect(folderLink('https://x/26001/', '')).toBe('https://x/26001');
  });

  it('adresa složky ze souboru', () => {
    expect(parentUrl('https://x/a/b/Foto_1.jpg')).toBe('https://x/a/b');
    expect(parentUrl('Foto.jpg')).toBe('Foto.jpg');
  });
});

describe('názvy fotek', () => {
  const t = new Date(2026, 9, 1, 14, 25, 30);

  it('název z času pořízení', () => {
    expect(buildPhotoName(t, [])).toBe('Foto_20261001_142530.jpg');
    expect(buildPhotoName(t, [], '.png')).toBe('Foto_20261001_142530.png');
  });

  it('při shodě se přidá pořadí, velikost písmen nerozhoduje', () => {
    expect(buildPhotoName(t, ['foto_20261001_142530.JPG'])).toBe('Foto_20261001_142530_2.jpg');
    expect(buildPhotoName(t, ['Foto_20261001_142530.jpg', 'Foto_20261001_142530_2.jpg'])).toBe('Foto_20261001_142530_3.jpg');
  });
});

describe('uploadSummary', () => {
  it('shrne frontu', () => {
    expect(uploadSummary([])).toBe('');
    expect(uploadSummary(['hotovo', 'hotovo'])).toBe('2 z 2 nahráno');
    expect(uploadSummary(['hotovo', 'nahrava', 'ceka', 'chyba'])).toBe('1 z 4 nahráno, 2 čeká, 1 se nepovedlo');
  });
});
