/**
 * Soubory ve složce projektu.
 *
 * Čte knihovnu SharePointu přes CAML dotaz se `Scope="RecursiveAll"` —
 * jen tak se dostaneme na soubory ve všech podsložkách najednou. REST
 * `folder.files` vrací obsah jedné úrovně a pro strom `01_Smlouvy`,
 * `03_Nákup/Objednávky`… by znamenal desítky dotazů.
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { Project } from '../../core/types';
import { toDate } from '../../core/format';
import { IDocumentRepository, ISettingsRepository, ProjectFile } from '../repositories';
import { getSp, getSpForSite, describeSpError } from './spContext';
import { viewXml, serverRelativePath, folderRelativeTo } from './documentQuery';

interface FileItem {
  Id: number;
  FileLeafRef: string;
  FileRef: string;
  FileDirRef: string;
  Modified: string;
  Editor?: { Title: string }[] | { Title: string };
  File_x0020_Size?: string;
  FSObjType?: string;
}

export class SpDocumentRepository implements IDocumentRepository {
  public constructor(
    private readonly context: WebPartContext,
    private readonly settings: ISettingsRepository
  ) {}

  public async listRecentFiles(project: Project, limit: number = 10): Promise<ProjectFile[]> {
    if (!project.folderUrl) {
      return [];
    }

    const folders = (await this.settings.get()).folders;
    if (!folders.libraryTitle.trim()) {
      return [];
    }

    const sp = folders.siteUrl ? getSpForSite(this.context, folders.siteUrl) : getSp(this.context);
    // Z absolutní adresy složky potřebujeme server-relativní část — CAML
    // pracuje s cestami od kořene webu, ne s celým URL.
    const folderPath = serverRelativePath(project.folderUrl);

    try {
      const result = await sp.web.lists.getByTitle(folders.libraryTitle).renderListDataAsStream({
        ViewXml: viewXml(limit),
        FolderServerRelativeUrl: folderPath
      });

      const rows = ((result as { Row?: FileItem[] }).Row ?? []).filter((r) => r.FSObjType !== '1');
      return rows.map((row) => toProjectFile(row, folderPath, this.origin(folders.siteUrl)));
    } catch (error) {
      throw new Error(
        describeSpError(
          error,
          `Nepodařilo se načíst soubory ze složky projektu ${project.projectNumber}`
        )
      );
    }
  }

  private origin(siteUrl: string | undefined): string {
    const base = siteUrl || this.context.pageContext.web.absoluteUrl;
    return new URL(base).origin;
  }
}

function toProjectFile(row: FileItem, projectFolderPath: string, origin: string): ProjectFile {
  const editor = Array.isArray(row.Editor) ? row.Editor[0] : row.Editor;
  const size = row.File_x0020_Size ? parseInt(row.File_x0020_Size, 10) : undefined;
  return {
    name: row.FileLeafRef,
    relativeFolder: folderRelativeTo(row.FileDirRef, projectFolderPath),
    url: `${origin}${row.FileRef.indexOf('/') === 0 ? '' : '/'}${row.FileRef}`,
    sizeBytes: size !== undefined && !isNaN(size) ? size : undefined,
    modified: toDate(row.Modified),
    modifiedByName: editor?.Title
  };
}
