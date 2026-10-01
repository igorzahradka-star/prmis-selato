import {
  BATCH_TAG_MAX,
  batchFolderName,
  batchTag,
  buildPhotoName,
  folderLink,
  parentUrl,
  photoDay,
  photoFolderPath,
  photoYearFolderPath,
  uploadSummary
} from './photos';

describe('přídomek dávky', () => {
  it('jedno slovo: mezery a nepovolené znaky pryč, písmena s diakritikou a číslice zůstanou', () => {
    expect(batchTag('KD')).toBe('KD');
    expect(batchTag('  kontrolní den ')).toBe('kontrolníden');
    expect(batchTag('Panely/jih: #2')).toBe('Panelyjih2');
    expect(batchTag('Žluťoučký')).toBe('Žluťoučký');
    expect(batchTag('KD-1')).toBe('KD-1');
  });

  it('pomlčky jen uvnitř, bez opakování', () => {
    expect(batchTag('--KD--')).toBe('KD');
    expect(batchTag('a--b')).toBe('a-b');
  });

  it('zkrátí na nejvýš povolenou délku', () => {
    expect(batchTag('a'.repeat(40)).length).toBe(BATCH_TAG_MAX);
    expect(batchTag('abcdefghijk-lmn')).toBe('abcdefghijk');
  });

  it('prázdný nebo samé nepovolené znaky dá prázdný přídomek', () => {
    expect(batchTag('')).toBe('');
    expect(batchTag(undefined)).toBe('');
    expect(batchTag(' / * ')).toBe('');
  });
});

describe('složky fotek', () => {
  it('název složky dávky: datum a volitelný přídomek', () => {
    expect(batchFolderName(new Date(2026, 9, 1))).toBe('2026-10-01');
    expect(batchFolderName(new Date(2026, 9, 1), 'KD')).toBe('2026-10-01_KD');
    expect(batchFolderName(new Date(2026, 9, 1), 'kontrolní den')).toBe('2026-10-01_kontrolníden');
  });

  it('cesta dávky v projektu', () => {
    expect(photoFolderPath('07-Dokumentace a podklady/FOTO', new Date(2026, 9, 1), 'KD')).toBe('07-Dokumentace a podklady/FOTO/2026/2026-10-01_KD');
    expect(photoFolderPath('/FOTO/', new Date(2026, 0, 5))).toBe('FOTO/2026/2026-01-05');
    expect(photoFolderPath('', new Date(2026, 0, 5), 'x')).toBe('2026/2026-01-05_x');
    expect(photoYearFolderPath('FOTO', 2026)).toBe('FOTO/2026');
  });

  it('den složky: výchozí den vložení, nebo den pořízení', () => {
    const vlozeni = new Date(2026, 9, 1);
    const porizeno = new Date(2026, 8, 20);
    expect(photoDay('vlozeni', porizeno, vlozeni)).toBe(vlozeni);
    expect(photoDay('porizeni', porizeno, vlozeni)).toBe(porizeno);
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
