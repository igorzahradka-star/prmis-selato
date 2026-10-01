import {
  FolderMap,
  analyzeFolderLink,
  cleanRelativePath,
  defaultFolderMap,
  firstSegment,
  folderFor,
  folderMapFromJson,
  folderMapToJson,
  folderSettingsWarnings,
  suggestPath
} from './projectFolders';
import { DEFAULT_SETTINGS, FolderSettings } from './settings';

const folders: FolderSettings = DEFAULT_SETTINGS.folders;

describe('cesta uvnitř složky projektu', () => {
  it('vyčistí nepovolené znaky, prázdné části i pokus vylézt ze složky', () => {
    expect(cleanRelativePath('03-Nákup/Objednávky')).toBe('03-Nákup/Objednávky');
    expect(cleanRelativePath('/03-Nákup//Objednávky/')).toBe('03-Nákup/Objednávky');
    expect(cleanRelativePath('../../jina/./slozka')).toBe('jina/slozka');
    expect(cleanRelativePath('a:b/c?d')).toBe('ab/cd');
    expect(cleanRelativePath(undefined)).toBe('');
  });
});

describe('mapa složek projektu', () => {
  it('JSON tam a zpět, neznámé role a prázdné cesty se vyhodí', () => {
    const map: FolderMap = { orders: '04-Nákup/Objednávky', diary: '05-Zápisy' };
    expect(folderMapFromJson(folderMapToJson(map))).toEqual(map);
    expect(folderMapFromJson('{"orders":"a/b","neznama":"x","diary":"  "}')).toEqual({ orders: 'a/b' });
  });

  it('neplatný nebo prázdný text dá prázdnou mapu', () => {
    expect(folderMapFromJson('nesmysl')).toEqual({});
    expect(folderMapFromJson('')).toEqual({});
    expect(folderMapFromJson(null)).toEqual({});
    expect(folderMapFromJson('[1,2]')).toEqual({});
  });

  it('cesta role: uložená u projektu má přednost před výchozí z Nastavení', () => {
    expect(folderFor({ folderMap: { orders: '04-Nákup/Objednávky' } }, 'orders', folders)).toBe('04-Nákup/Objednávky');
    expect(folderFor({ folderMap: { orders: '04-Nákup/Objednávky' } }, 'diary', folders)).toBe(folders.diaryFolder);
    expect(folderFor({}, 'photos', folders)).toBe(folders.photoFolder);
    expect(folderFor(undefined, 'invoices', folders)).toBe(folders.invoiceFolder);
  });

  it('výchozí mapa pro nový projekt obsahuje všechny čtyři role podle Nastavení', () => {
    const m = defaultFolderMap(folders);
    expect(Object.keys(m).sort()).toEqual(['diary', 'invoices', 'orders', 'photos']);
    expect(m.diary).toBe(folders.diaryFolder);
  });

  it('změna Nastavení se u projektu s uloženou mapou neprojeví', () => {
    const projekt = { folderMap: defaultFolderMap(folders) };
    const zmeneno: FolderSettings = { ...folders, orderFolder: '09-Jinam/Objednavky' };
    expect(folderFor(projekt, 'orders', zmeneno)).toBe(folders.orderFolder);
  });
});

describe('návrh podle skutečných složek', () => {
  const existujici = ['01-Nabídky', '03-Rozpočet projektu', '04-Nákup', '05-Zápisy', '06-Dodavatelé'];

  it('první část cesty se nahradí existující složkou i s jiným číslem', () => {
    expect(suggestPath(existujici, '03-Nákup/Objednávky')).toEqual({ path: '04-Nákup/Objednávky', found: true });
    expect(suggestPath(existujici, '04-Zápisy')).toEqual({ path: '05-Zápisy', found: true });
  });

  it('když složka není, cesta zůstane a řekne se to', () => {
    expect(suggestPath(existujici, '07-Dokumentace a podklady/FOTO')).toEqual({ path: '07-Dokumentace a podklady/FOTO', found: false });
    expect(suggestPath(existujici, '')).toEqual({ path: '', found: false });
  });

  it('první část cesty', () => {
    expect(firstSegment('03-Nákup/Objednávky')).toBe('03-Nákup');
    expect(firstSegment('')).toBe('');
  });
});

describe('upozornění k Nastavení složek', () => {
  it('výchozí nastavení je v pořádku (kromě známého čísla 03 u dvou složek šablony)', () => {
    const w = folderSettingsWarnings(folders);
    expect(w.filter((x) => x.indexOf('nepatří do žádné složky šablony') !== -1)).toEqual([]);
  });

  it('dvě složky šablony se stejným číslem se ohlásí', () => {
    const w = folderSettingsWarnings({ ...folders, template: [{ name: '03-Nákup' }, { name: '03-Rozpočet' }, { name: '04-Zápisy' }] });
    expect(w.some((x) => x.indexOf('stejné číslo 03') !== -1 && x.indexOf('03-Nákup') !== -1)).toBe(true);
  });

  it('cesta role mimo šablonu se ohlásí; shoda i s jiným číslem je v pořádku', () => {
    const t = [{ name: '04-Nákup' }, { name: '05-Zápisy' }, { name: '06-Dokumentace' }];
    const w = folderSettingsWarnings({ ...folders, template: t, orderFolder: '03-Nákup/Objednávky', diaryFolder: '99-Neznama', invoiceFolder: '04-Nákup/Fakturace', photoFolder: '06-Dokumentace/FOTO' });
    expect(w.some((x) => x.indexOf('99-Neznama') !== -1)).toBe(true);
    expect(w.some((x) => x.indexOf('03-Nákup/Objednávky') !== -1)).toBe(false);
  });
});

describe('Režie má vlastní strukturu složek', () => {
  it('objednávky Režie jdou do složky z šablony Režie, ne do složky běžných projektů', () => {
    expect(folderFor({ isOverhead: true }, 'orders', folders)).toBe(folders.overheadOrderFolder);
    expect(folderFor({ isOverhead: false }, 'orders', folders)).toBe(folders.orderFolder);
    // uložená mapa projektu má přednost i u Režie
    expect(folderFor({ isOverhead: true, folderMap: { orders: 'X/Obj' } }, 'orders', folders)).toBe('X/Obj');
  });

  it('výchozí mapa Režie obsahuje jen objednávky', () => {
    expect(defaultFolderMap(folders, true)).toEqual({ orders: folders.overheadOrderFolder });
    expect(Object.keys(defaultFolderMap(folders, false)).length).toBe(4);
  });

  it('šablona Režie je jiná než běžná a výchozí nastavení je v pořádku', () => {
    expect(folders.overheadTemplate.map((n) => n.name)).not.toEqual(folders.template.map((n) => n.name));
    expect(folderSettingsWarnings(folders).filter((w) => w.indexOf('Režie') !== -1)).toEqual([]);
  });

  it('cesta objednávek Režie mimo šablonu Režie se ohlásí', () => {
    const w = folderSettingsWarnings({ ...folders, overheadOrderFolder: '99-Neznama/Obj' });
    expect(w.some((x) => x.indexOf('objednávky Režie') !== -1 && x.indexOf('99-Neznama') !== -1)).toBe(true);
  });
});

describe('odkaz na složku projektu', () => {
  const LIB = '/sites/RES/Shared Documents';
  const ROOT = 'General/01_PROJEKTY';

  it('odkaz na složku projektu je v pořádku', () => {
    expect(analyzeFolderLink(`${LIB}/General/01_PROJEKTY/26001-X`, LIB, ROOT, false)).toEqual({ state: 'ok' });
  });

  it('odkaz do podsložky se zkrátí na složku projektu', () => {
    expect(analyzeFolderLink(`${LIB}/General/01_PROJEKTY/26001-X/10-Servis`, LIB, ROOT, false)).toEqual({
      state: 'deeper',
      rootPath: `${LIB}/General/01_PROJEKTY/26001-X`
    });
  });

  it('Režie: složka projektu je 99900-Režie/rok; odkaz do podsložky roku se zkrátí, odkaz jen na 99900-Režie je příliš vysoko', () => {
    expect(analyzeFolderLink(`${LIB}/General/01_PROJEKTY/99900-Režie/2026`, LIB, ROOT, true)).toEqual({ state: 'ok' });
    expect(analyzeFolderLink(`${LIB}/General/01_PROJEKTY/99900-Režie/2026/01-Objednávky`, LIB, ROOT, true)).toEqual({
      state: 'deeper',
      rootPath: `${LIB}/General/01_PROJEKTY/99900-Režie/2026`
    });
    expect(analyzeFolderLink(`${LIB}/General/01_PROJEKTY/99900-Režie`, LIB, ROOT, true).state).toBe('shallow');
  });

  it('mimo kořen projektů (chybně slepená složka) a prázdný odkaz se neopravují', () => {
    expect(analyzeFolderLink(`${LIB}/General01_PROJEKTY/26999 Režie RES 2026/08_Rozpočet`, LIB, ROOT, true).state).toBe('outside');
    expect(analyzeFolderLink(undefined, LIB, ROOT, false).state).toBe('missing');
    expect(analyzeFolderLink(`${LIB}/General/01_PROJEKTY`, LIB, ROOT, false).state).toBe('outside');
  });
});
