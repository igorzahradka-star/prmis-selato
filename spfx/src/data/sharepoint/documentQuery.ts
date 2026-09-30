/**
 * Skládání dotazu na soubory ve složce projektu a práce s cestami.
 *
 * Schválně **bez importu SharePointu a PnPjs** — stejně jako `fieldXml.ts`.
 * Jen tak jde tahle část otestovat: testy běží v Jestu, který moduly PnPjs
 * (ESM) nepřeloží.
 */

/**
 * CAML dotaz: rekurzivně přes podsložky, seřazeno od poslední změny.
 *
 * `Scope="RecursiveAll"` je tu podstatný — bez něj se vrátí jen jedna úroveň
 * a strom `01_Smlouvy`, `03_Nákup/Objednávky`… by znamenal desítky dotazů.
 * `RowLimit` se uplatní až po seřazení, takže vrátí opravdu ty nejnovější.
 */
export function viewXml(limit: number): string {
  return `<View Scope="RecursiveAll">
  <Query>
    <OrderBy><FieldRef Name="Modified" Ascending="FALSE" /></OrderBy>
  </Query>
  <ViewFields>
    <FieldRef Name="FileLeafRef" />
    <FieldRef Name="FileRef" />
    <FieldRef Name="FileDirRef" />
    <FieldRef Name="Modified" />
    <FieldRef Name="Editor" />
    <FieldRef Name="File_x0020_Size" />
    <FieldRef Name="FSObjType" />
  </ViewFields>
  <RowLimit>${limit}</RowLimit>
</View>`;
}

/** Server-relativní cesta z absolutní adresy. `https://firma.sharepoint.com/sites/PRM/X` → `/sites/PRM/X` */
export function serverRelativePath(absoluteUrl: string): string {
  try {
    return decodeURIComponent(new URL(absoluteUrl).pathname);
  } catch {
    // Kdyby v seznamu byla uložená rovnou relativní cesta.
    return absoluteUrl;
  }
}

/**
 * Cesta souboru vůči složce projektu — `03_Nákup/Objednávky`.
 * Prázdný řetězec znamená, že leží přímo v kořeni složky projektu.
 */
export function folderRelativeTo(fileDirRef: string, projectFolderPath: string): string {
  const dir = decodeURIComponent(fileDirRef);
  if (dir === projectFolderPath) {
    return '';
  }
  const prefix = `${projectFolderPath}/`;
  return dir.indexOf(prefix) === 0 ? dir.slice(prefix.length) : dir;
}

/** Velikost souboru v jednotkách, které člověk čte — 1,4 MB místo 1468006 B. */
export function formatFileSize(bytes: number | undefined): string {
  if (bytes === undefined || isNaN(bytes)) {
    return '—';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${Math.round(kb)} kB`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(1).replace('.', ',')} MB`;
  }
  return `${(mb / 1024).toFixed(1).replace('.', ',')} GB`;
}

/** Knihovna dokumentů tak, jak ji vrací SharePoint. */
export interface LibraryInfo {
  /** Uložený název. Na webu založeném anglicky bývá "Documents", i když ho člověk vidí česky. */
  title: string;
  /** Poslední část adresy: "Shared Documents". Na rozdíl od názvu se nepřekládá. */
  urlName: string;
  serverRelativeUrl: string;
}

/**
 * Názvy, pod kterými se výchozí knihovna webu ukazuje lidem. Interně se ale
 * vždycky jmenuje `Shared Documents` (adresa) a uložený název bývá anglický.
 * Jazyk webu ovlivňuje jen to, co vidí člověk, ne to, co najde `getByTitle`.
 */
const DEFAULT_LIBRARY_ALIASES = ['dokumenty', 'documents', 'shared documents', 'sdílené dokumenty'];

const DEFAULT_LIBRARY_URL_NAME = 'shared documents';

/**
 * Najde v seznamu knihoven tu, kterou uživatel myslel.
 *
 * Proč to není jen `getByTitle`: SharePoint zobrazuje výchozí knihovnu
 * lokalizovaně ("Dokumenty"), ale hledání podle názvu pracuje s názvem
 * uloženým při založení webu. Na webu založeném anglicky a prohlíženém česky
 * tak `getByTitle('Dokumenty')` vrací 404, i když knihovna je přímo před očima.
 *
 * Pořadí shody, od nejpřesnější:
 *  1. uložený název (přesně, bez ohledu na velikost písmen),
 *  2. poslední část adresy ("Shared Documents"),
 *  3. je-li zadané jméno některé ze známých pojmenování výchozí knihovny,
 *     knihovna s adresou `Shared Documents`.
 */
export function matchLibrary(libraries: LibraryInfo[], wanted: string): LibraryInfo | undefined {
  const w = (wanted || '').trim().toLocaleLowerCase('cs-CZ');
  if (!w) {
    return undefined;
  }
  const lower = (x: string): string => x.toLocaleLowerCase('cs-CZ');

  const podleNazvu = libraries.filter((l) => lower(l.title) === w)[0];
  if (podleNazvu) {
    return podleNazvu;
  }
  const podleAdresy = libraries.filter((l) => lower(l.urlName) === w)[0];
  if (podleAdresy) {
    return podleAdresy;
  }
  if (DEFAULT_LIBRARY_ALIASES.indexOf(w) !== -1) {
    return libraries.filter((l) => lower(l.urlName) === DEFAULT_LIBRARY_URL_NAME)[0];
  }
  return undefined;
}

/** Srozumitelná hláška, když knihovna nenajdeme — s výpisem toho, co na webu opravdu je. */
export function libraryNotFoundMessage(wanted: string, libraries: LibraryInfo[]): string {
  const dostupne = libraries.map((l) => `„${l.title}" (adresa ${l.urlName})`).join(', ');
  return (
    `Knihovna „${wanted}" na webu nebyla nalezena. ` +
    (dostupne
      ? `Dostupné knihovny: ${dostupne}. Název upravte v Nastavení → Složky projektů.`
      : 'Na webu nejsou žádné knihovny dokumentů.')
  );
}

// --- odkazy na složky projektů ---------------------------------------------

/** Zakóduje každý díl cesty zvlášť, lomítka mezi díly zůstanou. */
function encodePath(path: string): string {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

/**
 * Odkaz na složku projektu: adresa webu + **skutečná** adresa knihovny + kořenová složka + název složky.
 *
 * Knihovna se musí brát podle své adresy (`/Shared Documents`), ne podle názvu, který
 * lidé vidí (`Dokumenty`) — ten v adrese není a odkaz by skončil na „404 NOT FOUND".
 */
export function buildFolderUrl(
  origin: string,
  libraryServerRelativeUrl: string,
  rootFolder: string,
  folderName: string
): string {
  const parts = [
    libraryServerRelativeUrl.replace(/\/+$/, ''),
    rootFolder.replace(/^\/+|\/+$/g, ''),
    folderName
  ].filter((p) => p.length > 0);
  return `${origin.replace(/\/+$/, '')}${encodePath(parts.join('/'))}`;
}

/**
 * Opraví odkaz, který vznikl z názvu knihovny místo její adresy — např.
 * `…/RevoltumEngineeringServices/Dokumenty/General/…` místo `…/Shared Documents/General/…`.
 *
 * Vrací opravený odkaz, nebo `undefined`, když není co opravovat: odkaz je už správný,
 * nebo míří jinam, než kde knihovna leží (takový se nikdy nepřepisuje).
 */
export function repairFolderUrl(
  url: string,
  libraryServerRelativeUrl: string,
  libraryTitle: string
): string | undefined {
  let origin: string;
  let path: string;
  try {
    const parsed = new URL(url);
    origin = parsed.origin;
    path = decodeURIComponent(parsed.pathname);
  } catch {
    return undefined;
  }

  const libraryRoot = libraryServerRelativeUrl.replace(/\/+$/, '');
  const siteBase = libraryRoot.slice(0, libraryRoot.lastIndexOf('/'));
  const wrongRoot = `${siteBase}/${libraryTitle.trim()}`;
  const lower = path.toLowerCase();
  const startsWith = (prefix: string): boolean =>
    lower === prefix.toLowerCase() || lower.indexOf(`${prefix.toLowerCase()}/`) === 0;

  if (startsWith(libraryRoot) || !startsWith(wrongRoot)) {
    return undefined;
  }
  return `${origin}${encodePath(libraryRoot + path.slice(wrongRoot.length))}`;
}
