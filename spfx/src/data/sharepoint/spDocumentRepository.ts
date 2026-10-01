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
import { getSp, getSpForSite, describeSpError, extractStatus } from './spContext';
import { resolveLibrary } from './spLibrary';
import { resolveFolderPath } from './spFolders';
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
      // Podsložky se hledají (i když jsou psané trochu jinak, např. 07_… a 07-…) a zakládají se jen ty, které chybí.
      const path = (await resolveFolderPath(sp, base, relativeFolder.split('/'), true)) as string;
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
   * Cesta podsložky projektu od kořene webu. Název se hledá tolerantně (viz `resolveFolderPath`); když složka ještě
   * neexistuje, je `path` prázdná. Chyba, když projekt nemá složku.
   */
  private async folderPathOf(
    project: Project,
    relativeFolder: string
  ): Promise<{ sp: ReturnType<typeof getSp>; path: string | undefined; origin: string }> {
    if (!project.folderUrl) {
      throw new Error(`Projekt ${project.projectNumber} nemá složku. Složku doplňte v detailu projektu.`);
    }
    const folders = (await this.settings.get()).folders;
    const sp = folders.siteUrl ? getSpForSite(this.context, folders.siteUrl) : getSp(this.context);
    const path = await resolveFolderPath(sp, serverRelativePath(project.folderUrl), relativeFolder.split('/'), false);
    return { sp, path, origin: this.origin(folders.siteUrl) };
  }

  public async listFolderFiles(project: Project, relativeFolder: string): Promise<ProjectFile[]> {
    const { sp, path, origin } = await this.folderPathOf(project, relativeFolder);
    if (path === undefined) {
      // Složka, která ještě nevznikla (nikdo do ní nic neuložil), není chyba — je prostě prázdná.
      return [];
    }
    try {
      const items: { Name: string; ServerRelativeUrl: string; Length: string; TimeLastModified: string }[] = await sp.web
        .getFolderByServerRelativePath(path)
        .files.select('Name', 'ServerRelativeUrl', 'Length', 'TimeLastModified')
        .orderBy('TimeCreated')();
      return items.map((f) => ({
        name: f.Name,
        relativeFolder,
        url: `${origin}${f.ServerRelativeUrl}`,
        sizeBytes: f.Length !== undefined ? parseInt(f.Length, 10) : undefined,
        modified: toDate(f.TimeLastModified)
      }));
    } catch (error) {
      // Složka, která ještě nevznikla (nikdo do ní nic neuložil), není chyba — je prostě prázdná.
      if (extractStatus(error) === 404) {
        return [];
      }
      throw new Error(describeSpError(error, `Nepodařilo se načíst soubory ze složky „${relativeFolder}“ projektu ${project.projectNumber}`));
    }
  }

  public async readProjectFile(project: Project, relativeFolder: string, fileName: string): Promise<Blob> {
    const { sp, path } = await this.folderPathOf(project, relativeFolder);
    if (path === undefined) {
      throw new Error(`Složka „${relativeFolder}“ projektu ${project.projectNumber} neexistuje, soubor „${fileName}“ nelze načíst.`);
    }
    try {
      return await sp.web.getFileByServerRelativePath(`${path}/${fileName}`).getBlob();
    } catch (error) {
      throw new Error(describeSpError(error, `Soubor „${fileName}“ se nepodařilo načíst`));
    }
  }

  public async deleteProjectFile(project: Project, relativeFolder: string, fileName: string): Promise<void> {
    const { sp, path } = await this.folderPathOf(project, relativeFolder);
    if (path === undefined) {
      return;
    }
    try {
      await sp.web.getFileByServerRelativePath(`${path}/${fileName}`).recycle();
    } catch (error) {
      throw new Error(describeSpError(error, `Soubor „${fileName}“ se nepodařilo smazat`));
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
