/**
 * Koncept dokumentu (KO) ve složce projektu — uložení a odstranění. Pravidla názvů jsou v `core/conceptFiles.ts`.
 */

import { Project } from '../../core/types';
import { conceptFileName } from '../../core/conceptFiles';
import { IDocumentRepository } from '../../data/repositories';

/** Uloží (nebo přepíše) koncept `<název> (KO).<přípona>` do složky projektu. */
export async function saveConceptCopy(
  documents: IDocumentRepository,
  project: Project,
  folder: string,
  finalFileName: string,
  content: Blob
): Promise<string> {
  return documents.saveProjectFile(project, folder, conceptFileName(finalFileName), content);
}

/**
 * Odstraní koncept, když je dokument vystavený (nahradí ho ostrá verze). Smaže se do koše SharePointu. Když koncept nebyl
 * (dokument vznikl dřív, než se koncepty ukládaly) nebo se nepodaří smazat, nic se neděje — ostrá verze je důležitější.
 */
export async function removeConceptCopy(documents: IDocumentRepository, project: Project, folder: string, finalFileName: string): Promise<void> {
  try {
    await documents.deleteProjectFile(project, folder, conceptFileName(finalFileName));
  } catch {
    // Koncept nemusel existovat; ostrý dokument je uložený a to je to hlavní.
  }
}
