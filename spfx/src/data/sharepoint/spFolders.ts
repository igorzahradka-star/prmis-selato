/**
 * Složka, která má existovat: založí se, jen když ještě není.
 *
 * `folders.addUsingPath` na existující složku končí chybou „Soubor nebo složka s názvem … již existuje“
 * (kód -2130575257), takže opakované ukládání do téže složky (např. druhé odeslání objednávky) padalo.
 */

import type { SPFI } from '@pnp/sp';

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
