import {
  viewXml,
  serverRelativePath,
  folderRelativeTo,
  formatFileSize,
  matchLibrary,
  libraryNotFoundMessage,
  LibraryInfo
} from './documentQuery';
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

describe('matchLibrary', () => {
  // Přesně to, co bylo zjištěno na webu RES: anglicky založený web, český zobrazovaný název.
  const web: LibraryInfo[] = [
    { title: 'Documents', urlName: 'Shared Documents', serverRelativeUrl: '/sites/RES/Shared Documents' },
    { title: 'Site Assets', urlName: 'SiteAssets', serverRelativeUrl: '/sites/RES/SiteAssets' },
    { title: 'Prostředky webu', urlName: 'SiteAssets2', serverRelativeUrl: '/sites/RES/SiteAssets2' }
  ];

  it('najde knihovnu podle českého názvu, i když je uložená anglicky', () => {
    expect(matchLibrary(web, 'Dokumenty')?.urlName).toBe('Shared Documents');
  });

  it('najde ji podle uloženého názvu', () => {
    expect(matchLibrary(web, 'Documents')?.urlName).toBe('Shared Documents');
  });

  it('najde ji podle názvu v adrese', () => {
    expect(matchLibrary(web, 'Shared Documents')?.urlName).toBe('Shared Documents');
  });

  it('nevadí velikost písmen ani okolní mezery', () => {
    expect(matchLibrary(web, '  dokumenty ')?.urlName).toBe('Shared Documents');
  });

  it('jinou knihovnu najde podle jejího názvu', () => {
    expect(matchLibrary(web, 'Site Assets')?.urlName).toBe('SiteAssets');
  });

  it('přesná shoda názvu má přednost před zástupným jménem výchozí knihovny', () => {
    const uprava: LibraryInfo[] = [
      { title: 'Dokumenty', urlName: 'Projektove', serverRelativeUrl: '/sites/RES/Projektove' },
      ...web
    ];
    expect(matchLibrary(uprava, 'Dokumenty')?.urlName).toBe('Projektove');
  });

  it('neexistující knihovnu nevymyslí', () => {
    expect(matchLibrary(web, 'Smlouvy')).toBeUndefined();
  });

  it('prázdný název nenajde nic', () => {
    expect(matchLibrary(web, '')).toBeUndefined();
    expect(matchLibrary(web, '   ')).toBeUndefined();
  });

  it('zástupné jméno bez výchozí knihovny nenajde nic', () => {
    expect(matchLibrary([web[1]], 'Dokumenty')).toBeUndefined();
  });
});

describe('libraryNotFoundMessage', () => {
  it('vypíše, co na webu opravdu je — jinak by se nedalo poznat, co zadat', () => {
    const msg = libraryNotFoundMessage('Smlouvy', [
      { title: 'Documents', urlName: 'Shared Documents', serverRelativeUrl: '/x' }
    ]);
    expect(msg).toContain('„Smlouvy"');
    expect(msg).toContain('Documents');
    expect(msg).toContain('Shared Documents');
  });

  it('zvládne web bez knihoven', () => {
    expect(libraryNotFoundMessage('X', [])).toContain('žádné knihovny');
  });
});
