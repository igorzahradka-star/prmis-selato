/**
 * Smazání projektu — čistá logika: kterou složku smí aplikace smazat.
 *
 * Aplikace maže složku jen tehdy, když leží **přímo v kořenové složce projektů** (`General/01_PROJEKTY/26007-…`). Odkaz, který míří
 * jinam nebo do podsložky (např. po chybě starší verze), by znamenal smazat něco jiného, než co uživatel čeká — takovou složku
 * aplikace nechá být a řekne, ať ji uživatel smaže ručně.
 */

export interface FolderRemovalTarget {
  /** Cesta složky od kořene webu, kterou lze bezpečně smazat. */
  path?: string;
  /** Proč se složka nesmaže (česky). */
  warning?: string;
}

function segments(path: string): string[] {
  return (path || '')
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

export function projectFolderRemovalTarget(folderPath: string | undefined, libraryRoot: string, rootFolder: string): FolderRemovalTarget {
  if (!folderPath || segments(folderPath).length === 0) {
    return { warning: 'Projekt nemá odkaz na složku, žádná složka se nesmaže.' };
  }
  const base = [...segments(libraryRoot), ...segments(rootFolder)];
  const parts = segments(folderPath);
  const startsWithBase = base.length > 0 && parts.length > base.length && base.every((b, i) => parts[i].toLowerCase() === b.toLowerCase());
  if (!startsWithBase) {
    return {
      warning: `Složka projektu (${parts.join('/')}) neleží v kořenové složce projektů (${base.join('/')}), proto se nesmaže automaticky. Smažte ji ručně.`
    };
  }
  if (parts.length !== base.length + 1) {
    return {
      warning: `Odkaz na složku míří do podsložky (${parts.join('/')}), ne na složku projektu, proto se nesmaže automaticky. Smažte složku projektu ručně.`
    };
  }
  return { path: '/' + parts.join('/') };
}

/** Co se při smazání projektu smaže — pro náhled před potvrzením i pro výsledek. */
export interface RemovalCount {
  label: string;
  count: number;
}

export interface ProjectRemovalPreview {
  counts: RemovalCount[];
  /** Složka, která se přesune do koše SharePointu (odkaz na ni). */
  folderUrl?: string;
  /** Proč se složka nesmaže automaticky. */
  folderWarning?: string;
}

export interface ProjectRemovalResult {
  deleted: RemovalCount[];
  folderRecycled: boolean;
  folderWarning?: string;
}
