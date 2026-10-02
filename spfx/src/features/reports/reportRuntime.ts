/**
 * Příprava reportu v prohlížeči: obrázky šablony (diagonální přechod nakreslený přes canvas, výboj a bílé logo načtené až při potřebě)
 * a sběr dat projektu z repozitářů (objednávky, podklady, termíny, zápisy, fotky).
 */

import { Project } from '../../core/types';
import { AppSettings } from '../../core/settings';
import { CurrentUser } from '../../core/types';
import { ProjectReportModel, REPORT_LIMITS, ReportPhoto, ReportSections, buildProjectReportModel } from '../../core/projectReport';
import { folderFor } from '../../core/projectFolders';
import { RepositorySet } from '../../data/repositories';
import { ReportCurrency } from '../../ui/useReportCurrency';
import { toDataUrl } from '../diary/imageUtils';
import { loadBatches, batchFolderOf } from '../photos/photoBatches';
import { ReportAssets } from './projectReportPdf';

/** Diagonální přechod jako v šabloně RES: tmavá → navy → modrá, z levého horního do pravého dolního rohu. */
function makeGradient(): string | undefined {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return undefined;
    }
    const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    g.addColorStop(0, '#030422');
    g.addColorStop(0.5, '#0E2841');
    g.addColorStop(1, '#0268A6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch {
    return undefined;
  }
}

/** Obrázky šablony; výboj a logo se načítají až teď (samostatný soubor), přechod se kreslí na místě. */
export async function loadReportAssets(): Promise<ReportAssets> {
  const assets = await import(/* webpackChunkName: 'report-assets' */ './reportAssets');
  return { gradient: makeGradient(), streak: assets.REPORT_STREAK_DATA_URL, logoDark: assets.REPORT_LOGO_DARK_DATA_URL };
}

/**
 * Fotky do reportu: z nejnovější dávky ve složce FOTO (a když v ní není dost, z další), nejvýš `REPORT_LIMITS.photos`.
 * Fotky se zmenší, ať report není obří. Nepodařená fotka se přeskočí — report se kvůli ní nezastaví.
 */
async function collectPhotos(repos: RepositorySet, project: Project, settings: AppSettings): Promise<ReportPhoto[]> {
  const base = folderFor(project, 'photos', settings.folders);
  const out: ReportPhoto[] = [];
  let batches;
  try {
    batches = await loadBatches(repos.documents, project, base);
  } catch {
    return out;
  }
  for (const b of batches) {
    if (out.length >= REPORT_LIMITS.photos) {
      break;
    }
    const folder = batchFolderOf(base, b);
    let photos;
    try {
      photos = await repos.documents.listPhotos(project, folder);
    } catch {
      continue;
    }
    for (const f of photos) {
      if (out.length >= REPORT_LIMITS.photos) {
        break;
      }
      try {
        const blob = await repos.documents.readProjectFile(project, folder, f.name);
        const image = await toDataUrl(blob, 900, 0.78);
        out.push({ dataUrl: image.dataUrl, caption: f.note || f.name, batch: b.name });
      } catch {
        // Fotku se nepodařilo načíst nebo zmenšit — přeskočí se.
      }
    }
  }
  return out;
}

/** Sebere data projektu a složí model reportu. `onProgress` hlásí, co se právě děje. */
export async function collectProjectReport(
  repos: RepositorySet,
  project: Project,
  settings: AppSettings,
  report: ReportCurrency,
  user: CurrentUser,
  sections: ReportSections,
  onProgress?: (text: string) => void
): Promise<ProjectReportModel> {
  const say = (t: string): void => {
    if (onProgress) {
      onProgress(t);
    }
  };
  say('Načítám objednávky, fakturaci, termíny a zápisy…');
  const [orders, invoices, tasks, entries] = await Promise.all([
    repos.orders.list({ projectNumber: project.projectNumber }),
    repos.invoices.list({ projectNumber: project.projectNumber }),
    repos.tasks.listByProject(project.projectNumber),
    repos.diary.listEntries({ projectNumber: project.projectNumber, kind: 'zapis' })
  ]);
  let photos: ReportPhoto[] = [];
  if (sections.photos) {
    say('Načítám fotky…');
    photos = await collectPhotos(repos, project, settings);
  }
  say('Skládám report…');
  return buildProjectReportModel({
    project,
    orders,
    invoices,
    tasks,
    entries,
    photos,
    sections,
    convert: (amount, currency) => report.convert(amount, currency),
    currency: report.currency,
    generatedBy: user.displayName,
    companyName: settings.company.name
  });
}
