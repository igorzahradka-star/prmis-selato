import { buildPhotoName, folderLink, photoFolderPath, photoTag, photoYearFolderPath, uploadSummary } from './photos';

describe('složky fotek', () => {
  it('den a rok v cestě', () => {
    expect(photoFolderPath('07_Dokumentace a podklady/FOTO', new Date(2026, 9, 1))).toBe('07_Dokumentace a podklady/FOTO/2026/2026-10-01');
    expect(photoFolderPath('/FOTO/', new Date(2026, 0, 5))).toBe('FOTO/2026/2026-01-05');
    expect(photoFolderPath('', new Date(2026, 0, 5))).toBe('2026/2026-01-05');
    expect(photoYearFolderPath('FOTO', 2026)).toBe('FOTO/2026');
  });

  it('odkaz na složku zakóduje jednotlivé části', () => {
    expect(folderLink('https://x.sharepoint.com/sites/a/Sdilene dokumenty/26001', '07_Dokumentace a podklady/FOTO')).toBe(
      'https://x.sharepoint.com/sites/a/Sdilene dokumenty/26001/07_Dokumentace%20a%20podklady/FOTO'
    );
    expect(folderLink('https://x/26001/', '')).toBe('https://x/26001');
  });
});

describe('názvy fotek', () => {
  const t = new Date(2026, 9, 1, 14, 25, 30);

  it('popis se upraví na bezpečný tvar do názvu', () => {
    expect(photoTag('Panely – jih')).toBe('Panely-jih');
    expect(photoTag('  Kabel: trasa / sever  ')).toBe('Kabel-trasa-sever');
    expect(photoTag('')).toBe('');
    expect(photoTag(undefined)).toBe('');
    expect(photoTag('a'.repeat(50)).length).toBeLessThanOrEqual(30);
  });

  it('název z času pořízení, s popisem i bez', () => {
    expect(buildPhotoName(t, undefined, [])).toBe('Foto_20261001_142530.jpg');
    expect(buildPhotoName(t, 'Panely jih', [])).toBe('Foto_20261001_142530_Panely-jih.jpg');
    expect(buildPhotoName(t, undefined, [], '.png')).toBe('Foto_20261001_142530.png');
  });

  it('při shodě se přidá pořadí, velikost písmen nerozhoduje', () => {
    expect(buildPhotoName(t, undefined, ['foto_20261001_142530.JPG'])).toBe('Foto_20261001_142530_2.jpg');
    expect(buildPhotoName(t, 'x', ['Foto_20261001_142530_x.jpg', 'Foto_20261001_142530_x_2.jpg'])).toBe('Foto_20261001_142530_x_3.jpg');
  });
});

describe('uploadSummary', () => {
  it('shrne frontu', () => {
    expect(uploadSummary([])).toBe('');
    expect(uploadSummary(['hotovo', 'hotovo'])).toBe('2 z 2 nahráno');
    expect(uploadSummary(['hotovo', 'nahrava', 'ceka', 'chyba'])).toBe('1 z 4 nahráno, 2 čeká, 1 se nepovedlo');
  });
});
