/**
 * Vyhledání knihovny dokumentů na webu.
 *
 * `getByTitle` sám nestačí: SharePoint zobrazuje výchozí knihovnu lokalizovaně
 * ("Dokumenty"), ale hledá podle názvu uloženého při založení webu ("Documents").
 * Na anglicky založeném webu prohlíženém česky tak `getByTitle('Dokumenty')`
 * vrací 404. Zjištěno na webu RES při prvním importu.
 *
 * Samotné porovnávání je v `documentQuery.ts` (bez SharePointu, otestované).
 */

import { SPFI } from '@pnp/sp';
import { describeSpError, extractStatus } from './spContext';
import { LibraryInfo, matchLibrary, libraryNotFoundMessage } from './documentQuery';

/** Nalezená knihovna: její Id pro další dotazy a cesta pro skládání adres složek. */
export interface ResolvedLibrary {
  id: string;
  title: string;
  serverRelativeUrl: string;
}

interface LibraryRow {
  Id: string;
  Title: string;
  RootFolder: { Name: string; ServerRelativeUrl: string };
}

/**
 * Najde knihovnu podle názvu zadaného v Nastavení. Přijme uložený název,
 * název v adrese i to, co člověk vidí ("Dokumenty").
 *
 * Když ji nenajde, vyhodí chybu **s výpisem knihoven, které na webu jsou** —
 * bez toho se nedá poznat, co do Nastavení zadat.
 */
export async function resolveLibrary(sp: SPFI, wanted: string): Promise<ResolvedLibrary> {
  let rows: LibraryRow[];
  try {
    rows = await sp.web.lists
      .filter('BaseTemplate eq 101')
      .select('Id', 'Title', 'RootFolder/Name', 'RootFolder/ServerRelativeUrl')
      .expand('RootFolder')();
  } catch (error) {
    if (extractStatus(error) === 404) {
      throw new Error('Web s knihovnou se nepodařilo najít. Zkontrolujte adresu webu v Nastavení → Složky projektů.');
    }
    throw new Error(describeSpError(error, 'Nepodařilo se načíst seznam knihoven webu'));
  }

  const libraries: LibraryInfo[] = rows.map((r) => ({
    title: r.Title,
    urlName: r.RootFolder.Name,
    serverRelativeUrl: r.RootFolder.ServerRelativeUrl
  }));

  const found = matchLibrary(libraries, wanted);
  if (!found) {
    throw new Error(libraryNotFoundMessage(wanted, libraries));
  }
  const row = rows.filter((r) => r.RootFolder.ServerRelativeUrl === found.serverRelativeUrl)[0];
  return { id: row.Id, title: found.title, serverRelativeUrl: found.serverRelativeUrl };
}
