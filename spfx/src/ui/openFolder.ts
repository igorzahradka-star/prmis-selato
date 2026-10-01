/**
 * Otevření složky projektu v SharePointu v nové kartě.
 *
 * Adresa složky se **zjistí v SharePointu** (tolerantně — i složka psaná jinak než v uložené cestě se najde), ne složí z textu; složený odkaz
 * končil u starších dokumentů chybou „404 NOT FOUND“. Prázdná karta se otevře hned po kliknutí (jinak by ji prohlížeč mohl zablokovat) a po
 * zjištění adresy se přesměruje; když složka neexistuje, zavře se a vrátí se věta pro uživatele.
 */

import { Project } from '../core/types';
import { IDocumentRepository } from '../data/repositories';

/** Vrací `undefined`, když se složka otevřela, jinak větu, proč ne. */
export async function openFolderInNewTab(documents: IDocumentRepository, project: Project, relativeFolder: string): Promise<string | undefined> {
  const win = window.open('about:blank', '_blank');
  if (win) {
    try {
      win.opener = null;
    } catch {
      // Odpojení karty od aplikace není podmínkou otevření.
    }
  }
  const fail = (message: string): string => {
    if (win) {
      win.close();
    }
    return message;
  };
  try {
    const url = await documents.resolveFolderUrl(project, relativeFolder);
    if (!url) {
      return fail(`Složka „${relativeFolder}“ v projektu ještě neexistuje — vznikne při prvním uložení dokumentu.`);
    }
    if (win) {
      win.location.href = url;
    } else {
      window.open(url, '_blank');
    }
    return undefined;
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
