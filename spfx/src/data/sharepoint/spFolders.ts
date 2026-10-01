/**
 * Složka, která má existovat: založí se, jen když ještě není.
 *
 * `folders.addUsingPath` na existující složku končí chybou „Soubor nebo složka s názvem … již existuje“
 * (kód -2130575257), takže opakované ukládání do téže složky (např. druhé odeslání objednávky) padalo.
 */

import type { SPFI } from '@pnp/sp';

import { findMatchingFolder } from '../../core/folders';

async function folderExists(sp: SPFI, serverRelativePath: string): Promise<boolean> {
  try {
    const info: { Exists?: boolean } = await sp.web.getFolderByServerRelativePath(serverRelativePath).select('Exists')();
    return info.Exists === true;
  } catch {
    return false;
  }
}

export async function ensureFolder(sp: SPFI, serverRelativePath: string): Promise<void> {
  if (await folderExists(sp, serverRelativePath)) {
    return;
  }
  try {
    await sp.web.folders.addUsingPath(serverRelativePath);
  } catch (error) {
    // Mezitím ji mohl založit někdo jiný — pak je to v pořádku, jinak je chyba skutečná.
    if (await folderExists(sp, serverRelativePath)) {
      return;
    }
    throw error;
  }
}

// --- složky s tolerantním hledáním názvu --------------------------------------------

const CHILD_CACHE_MS = 20000;
const childCache = new Map<string, { at: number; names: string[] }>();

/** Názvy podsložek složky; prázdný seznam, když složka neexistuje. Krátce se pamatují, ať dávka souborů nevolá SharePoint pořád dokola. */
async function childFolderNames(sp: SPFI, parentPath: string): Promise<string[]> {
  const cached = childCache.get(parentPath);
  if (cached && Date.now() - cached.at < CHILD_CACHE_MS) {
    return cached.names;
  }
  let names: string[] = [];
  try {
    const items: { Name: string }[] = await sp.web.getFolderByServerRelativePath(parentPath).folders.select('Name')();
    names = items.map((f) => f.Name);
  } catch {
    names = [];
  }
  childCache.set(parentPath, { at: Date.now(), names });
  return names;
}

/**
 * Cesta k podsložce, ve které se **neplete psaní názvu**: `07_Dokumentace a podklady` se najde jako existující
 * `07-Dokumentace a podklady` (viz `findMatchingFolder`), takže vedle ní nevznikne druhá, téměř stejná složka.
 *
 * S `create` se chybějící složky zakládají (jen ty, které opravdu chybí); bez něj vrací `undefined`, když cesta neexistuje.
 */
export async function resolveFolderPath(sp: SPFI, basePath: string, segments: string[], create: boolean): Promise<string | undefined> {
  let path = basePath;
  for (const raw of segments.filter((s) => s.trim() !== '')) {
    const match = findMatchingFolder(await childFolderNames(sp, path), raw);
    if (match !== undefined) {
      path = `${path}/${match}`;
      continue;
    }
    if (!create) {
      return undefined;
    }
    const parent = path;
    path = `${path}/${raw}`;
    await ensureFolder(sp, path);
    childCache.delete(parent);
  }
  return path;
}
