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
