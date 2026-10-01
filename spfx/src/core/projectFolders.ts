/**
 * Kde má projekt své složky — „mapa složek“ projektu. Čistá logika bez SharePointu a Reactu.
 *
 * Aplikace do složky projektu ukládá čtyři druhy věcí: PDF objednávek, podklady pro fakturaci, zápisy ze stavby a fotky.
 * Každý druh (role) má **cestu uvnitř složky projektu**. Výchozí cesty jsou v Nastavení (Složky projektů), ale **každý projekt si nese
 * vlastní mapu**, která se uloží při založení projektu. Díky tomu:
 *   - změna šablony složek nebo přečíslování v Nastavení **nemění nic u už založených projektů** (šablona platí jen pro nové),
 *   - u projektu se starší nebo jinou strukturou jde v detailu projektu určit, kde která složka opravdu je.
 * Projekt bez uložené mapy (založený dřív) používá výchozí cesty z Nastavení; složka se při tom hledá tolerantně
 * (`findMatchingFolder` — číselná předpona, pomlčka/podtržítko, diakritika a velikost písmen nerozhodují).
 */

import { findMatchingFolder } from './folders';
import { FolderSettings } from './settings';

export type FolderRole = 'orders' | 'invoices' | 'diary' | 'photos';

export interface FolderRoleInfo {
  key: FolderRole;
  label: string;
  /** Co se do složky ukládá — pro vysvětlení v dialogu. */
  purpose: string;
  /** Klíč výchozí cesty v `FolderSettings`. */
  settingKey: 'orderFolder' | 'invoiceFolder' | 'diaryFolder' | 'photoFolder';
}

export const FOLDER_ROLES: FolderRoleInfo[] = [
  { key: 'orders', label: 'Objednávky', purpose: 'PDF objednávek (koncept i odeslané)', settingKey: 'orderFolder' },
  { key: 'invoices', label: 'Podklady pro fakturaci', purpose: 'PDF podkladů pro fakturaci a zálohových faktur', settingKey: 'invoiceFolder' },
  { key: 'diary', label: 'Zápisy ze stavby', purpose: 'zápisy a stavební deníky (PDF, Word, přílohy)', settingKey: 'diaryFolder' },
  { key: 'photos', label: 'Fotodokumentace', purpose: 'dávky fotek (složky rok-měsíc-den Název)', settingKey: 'photoFolder' }
];

/** Uložená mapa: jen role, které se u projektu liší od výchozích, nebo všechny (při založení). */
export type FolderMap = Partial<Record<FolderRole, string>>;

/** Znaky nepovolené v názvu složky SharePointu (a # %). */
const FORBIDDEN = /["*:<>?\\|#%]/g;

/**
 * Cesta uvnitř složky projektu v čisté podobě: části oddělené lomítkem, bez nepovolených znaků, bez prázdných částí a bez
 * `.`/`..` (cesta nesmí vylézt ze složky projektu).
 */
export function cleanRelativePath(text: string | undefined): string {
  return (text || '')
    .split('/')
    .map((part) =>
      part
        .replace(FORBIDDEN, '')
        .split('')
        .filter((ch) => ch.charCodeAt(0) >= 32)
        .join('')
        .trim()
    )
    .filter((part) => part !== '' && part !== '.' && part !== '..')
    .join('/');
}

/** Mapa z uloženého JSON; neplatný nebo prázdný text dá prázdnou mapu, neznámé role a prázdné cesty se vyhodí. */
export function folderMapFromJson(text: string | undefined | null): FolderMap {
  if (!text) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    const out: FolderMap = {};
    FOLDER_ROLES.forEach((r) => {
      const value = (parsed as Record<string, unknown>)[r.key];
      if (typeof value === 'string') {
        const clean = cleanRelativePath(value);
        if (clean !== '') {
          out[r.key] = clean;
        }
      }
    });
    return out;
  } catch {
    return {};
  }
}

export function folderMapToJson(map: FolderMap): string {
  const out: FolderMap = {};
  FOLDER_ROLES.forEach((r) => {
    const clean = cleanRelativePath(map[r.key]);
    if (clean !== '') {
      out[r.key] = clean;
    }
  });
  return JSON.stringify(out);
}

/** Cesta role u projektu: uložená v mapě projektu, jinak výchozí z Nastavení. */
export function folderFor(project: { folderMap?: FolderMap } | undefined, role: FolderRole, folders: FolderSettings): string {
  const info = FOLDER_ROLES.filter((r) => r.key === role)[0];
  const own = project && project.folderMap ? cleanRelativePath(project.folderMap[role]) : '';
  return own !== '' ? own : cleanRelativePath(folders[info.settingKey]);
}

/** Výchozí mapa podle Nastavení — ukládá se projektu při založení. */
export function defaultFolderMap(folders: FolderSettings): FolderMap {
  const out: FolderMap = {};
  FOLDER_ROLES.forEach((r) => {
    const clean = cleanRelativePath(folders[r.settingKey]);
    if (clean !== '') {
      out[r.key] = clean;
    }
  });
  return out;
}

/**
 * Návrh cesty podle skutečných složek projektu: první část cesty se nahradí existující složkou stejného jména (tolerantně — i s jiným
 * číslem na začátku), zbytek cesty zůstane. Když taková složka není, vrací se cesta beze změny a `found` je `false`.
 */
export function suggestPath(topLevelFolders: string[], wanted: string): { path: string; found: boolean } {
  const parts = cleanRelativePath(wanted).split('/').filter((p) => p !== '');
  if (parts.length === 0) {
    return { path: '', found: false };
  }
  const match = findMatchingFolder(topLevelFolders, parts[0]);
  if (match === undefined) {
    return { path: parts.join('/'), found: false };
  }
  return { path: [match, ...parts.slice(1)].join('/'), found: true };
}

/** První část cesty (složka přímo v projektu). */
export function firstSegment(path: string): string {
  return cleanRelativePath(path).split('/')[0] || '';
}

/** Číslo na začátku názvu složky (`03-Nákup` → `03`), jinak prázdný text. */
function numberPrefix(name: string): string {
  const m = /^(\d{1,3})\s*[-_ ]/.exec(name.trim());
  return m ? m[1] : '';
}

/**
 * Upozornění k nastavení složek (nejde o chyby, nic se kvůli nim neblokuje):
 *   - dvě složky šablony na nejvyšší úrovni mají stejné číslo (`03-Nákup` a `03-Rozpočet projektu`),
 *   - výchozí cesta role (objednávky, fakturace, zápisy, fotky) nepatří do žádné složky šablony.
 */
export function folderSettingsWarnings(folders: FolderSettings): string[] {
  const warnings: string[] = [];
  const top = folders.template.map((n) => n.name.trim()).filter((n) => n !== '');

  const byNumber: Record<string, string[]> = {};
  top.forEach((name) => {
    const n = numberPrefix(name);
    if (n !== '') {
      byNumber[n] = [...(byNumber[n] || []), name];
    }
  });
  Object.keys(byNumber)
    .filter((n) => byNumber[n].length > 1)
    .forEach((n) => warnings.push(`V šabloně mají stejné číslo ${n} tyto složky: ${byNumber[n].join(', ')}. Každá složka by měla mít své číslo.`));

  FOLDER_ROLES.forEach((r) => {
    const path = cleanRelativePath(folders[r.settingKey]);
    if (path !== '' && findMatchingFolder(top, firstSegment(path)) === undefined) {
      warnings.push(`Cesta „${path}“ (${r.label}) nepatří do žádné složky šablony — u nového projektu by vznikla složka „${firstSegment(path)}“ navíc.`);
    }
  });
  return warnings;
}
