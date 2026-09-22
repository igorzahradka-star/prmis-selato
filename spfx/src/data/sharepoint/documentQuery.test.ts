import { viewXml, serverRelativePath, folderRelativeTo, formatFileSize } from './documentQuery';
import { normalizeSpaces } from '../../core/format';

describe('viewXml', () => {
  it('prohledává i podsložky — jinak by seznam ukázal jen kořen složky projektu', () => {
    expect(viewXml(10)).toContain('Scope="RecursiveAll"');
  });

  it('řadí od poslední změny', () => {
    expect(viewXml(10)).toContain('<FieldRef Name="Modified" Ascending="FALSE" />');
  });

  it('respektuje zadaný počet řádků', () => {
    expect(viewXml(25)).toContain('<RowLimit>25</RowLimit>');
  });

  it('žádá si sloupce, které seznam zobrazuje', () => {
    const xml = viewXml(10);
    ['FileLeafRef', 'FileRef', 'FileDirRef', 'Modified', 'Editor', 'File_x0020_Size'].forEach((f) => {
      expect(xml).toContain(`<FieldRef Name="${f}" />`);
    });
  });
});

describe('serverRelativePath', () => {
  it('z absolutní adresy udělá cestu od kořene serveru', () => {
    expect(serverRelativePath('https://firma.sharepoint.com/sites/PRM/Projekty/2026/26-001')).toBe(
      '/sites/PRM/Projekty/2026/26-001'
    );
  });

  it('rozkóduje diakritiku v cestě', () => {
    expect(
      serverRelativePath('https://firma.sharepoint.com/sites/PRM/Hav%C3%AD%C5%99sk%C3%A1')
    ).toBe('/sites/PRM/Havířská');
  });

  it('už relativní cestu nechá být', () => {
    expect(serverRelativePath('/sites/PRM/Projekty/26-001')).toBe('/sites/PRM/Projekty/26-001');
  });
});

describe('folderRelativeTo', () => {
  const projekt = '/sites/PRM/Projekty/2026/26-001';

  it('soubor přímo ve složce projektu nemá podsložku', () => {
    expect(folderRelativeTo(projekt, projekt)).toBe('');
  });

  it('vrátí cestu podsložky bez cesty projektu', () => {
    expect(folderRelativeTo(`${projekt}/03_Nákup/Objednávky`, projekt)).toBe('03_Nákup/Objednávky');
  });

  it('rozkóduje diakritiku', () => {
    expect(folderRelativeTo(`${projekt}/06_P%C5%99ed%C3%A1n%C3%AD`, projekt)).toBe('06_Předání');
  });

  it('cestu mimo složku projektu vrátí celou — ať je vidět, že něco nesedí', () => {
    expect(folderRelativeTo('/sites/PRM/Jine/Slozka', projekt)).toBe('/sites/PRM/Jine/Slozka');
  });
});

describe('formatFileSize', () => {
  it('malé soubory v bajtech', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('kilobajty zaokrouhluje na celé', () => {
    expect(formatFileSize(96256)).toBe('94 kB');
  });

  it('megabajty na jedno desetinné místo s českou čárkou', () => {
    expect(normalizeSpaces(formatFileSize(1548288))).toBe('1,5 MB');
  });

  it('gigabajty zvládne také', () => {
    expect(normalizeSpaces(formatFileSize(3 * 1024 * 1024 * 1024))).toBe('3,0 GB');
  });

  it('neznámou velikost zobrazí jako pomlčku', () => {
    expect(formatFileSize(undefined)).toBe('—');
    expect(formatFileSize(NaN)).toBe('—');
  });

  it('prázdný soubor je 0 B, ne pomlčka', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });
});
