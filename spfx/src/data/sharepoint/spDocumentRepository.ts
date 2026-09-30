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
import { resolveLibrary } from './spLibrary';
import { ensureFolder } from './spFolders';
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
      const library = await resolveLibrary(sp, folders.libraryTitle);
      const result = await sp.web.lists.getById(library.id).renderListDataAsStream({
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

  public async saveProjectFile(project: Project, relativeFolder: string, fileName: string, content: Blob): Promise<string> {
    if (!project.folderUrl) {
      throw new Error(`Projekt ${project.projectNumber} nemá složku, kam by se soubor uložil. Složku doplňte v detailu projektu.`);
    }
    const folders = (await this.settings.get()).folders;
    const sp = folders.siteUrl ? getSpForSite(this.context, folders.siteUrl) : getSp(this.context);
    const base = serverRelativePath(project.folderUrl);

    try {
      // Podsložky se zakládají po jedné od shora — SharePoint nevytvoří celou cestu najednou.
      let path = base;
      for (const part of relativeFolder.split('/').filter((p) => p.trim() !== '')) {
        path = `${path}/${part}`;
        await ensureFolder(sp, path);
      }
      const added = (await sp.web
        .getFolderByServerRelativePath(path)
        .files.addUsingPath(fileName, content, { Overwrite: true })) as unknown as {
        data?: { ServerRelativeUrl?: string };
        ServerRelativeUrl?: string;
      };
      const relative = (added.data && added.data.ServerRelativeUrl) || added.ServerRelativeUrl || `${path}/${fileName}`;
      return `${this.origin(folders.siteUrl)}${relative.indexOf('/') === 0 ? '' : '/'}${relative}`;
    } catch (error) {
      throw new Error(describeSpError(error, `Soubor „${fileName}“ se nepodařilo uložit do složky projektu ${project.projectNumber}`));
    }
  }

  /**
   * Názvy podsložek v kořenové složce projektů. Čtou se **jen názvy** —
   * import se z nich rozhoduje, ale nic se nemění.
   */
  public async listProjectFolderNames(): Promise<string[]> {
    const folders = (await this.settings.get()).folders;
    if (!folders.libraryTitle.trim()) {
      return [];
    }

    const sp = folders.siteUrl ? getSpForSite(this.context, folders.siteUrl) : getSp(this.context);
    try {
      const libraryRoot = (await resolveLibrary(sp, folders.libraryTitle)).serverRelativeUrl;
      const root = folders.rootFolder.trim()
        ? `${libraryRoot}/${folders.rootFolder.replace(/^\/+|\/+$/g, '')}`
        : libraryRoot;

      const items: { Name: string }[] = await sp.web
        .getFolderByServerRelativePath(root)
        .folders.select('Name')
        .orderBy('Name')();
      // „Forms" je systémová složka každé knihovny, projekt to není nikdy.
      return items.map((f) => f.Name).filter((name) => name !== 'Forms');
    } catch (error) {
      throw new Error(
        describeSpError(
          error,
          `Nepodařilo se načíst složky projektů z knihovny „${folders.libraryTitle}"`
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
