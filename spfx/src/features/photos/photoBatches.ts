/**
 * Dávky fotek projektu — složky ve složce FOTO. Čte se přímo SharePoint, takže se objeví i složky a fotky,
 * které někdo vložil mimo aplikaci. Složky s rokem (`FOTO/2026/…`) ze starší úpravy se projdou o úroveň níž.
 */

import { Project } from '../../core/types';
import { isYearFolder, parseBatchFolder, sortBatchFolders } from '../../core/photos';
import { IDocumentRepository, ProjectFolder } from '../../data/repositories';

export interface PhotoBatch {
  /** Cesta od složky FOTO (`2026-03-01 Mělký výkop`, u starších `2026/2026-10-01_KD`). */
  path: string;
  /** Název složky dávky. */
  name: string;
  /** Název dávky bez data (pro zobrazení). */
  title: string;
  date?: Date;
  itemCount: number;
  /** Odkaz na složku v SharePointu. */
  url: string;
  modified?: Date;
}

function toBatch(path: string, folder: ProjectFolder): PhotoBatch {
  const info = parseBatchFolder(folder.name);
  return {
    path,
    name: folder.name,
    title: info.title,
    date: info.date,
    itemCount: folder.itemCount,
    url: folder.url,
    modified: folder.modified
  };
}

/** Všechny dávky projektu od nejnovější. */
export async function loadBatches(documents: IDocumentRepository, project: Project, photoFolder: string): Promise<PhotoBatch[]> {
  const top = await documents.listSubfolders(project, photoFolder);
  const out: PhotoBatch[] = [];
  for (const f of top) {
    if (isYearFolder(f.name)) {
      const inner = await documents.listSubfolders(project, `${photoFolder}/${f.name}`);
      inner.forEach((i) => out.push(toBatch(`${f.name}/${i.name}`, i)));
    } else {
      out.push(toBatch(f.name, f));
    }
  }
  return sortBatchFolders(out);
}

/** Cesta složky dávky v projektu (od složky projektu). */
export function batchFolderOf(photoFolder: string, batch: PhotoBatch): string {
  const base = (photoFolder || '').replace(/^\/+|\/+$/g, '');
  return `${base ? base + '/' : ''}${batch.path}`;
}
