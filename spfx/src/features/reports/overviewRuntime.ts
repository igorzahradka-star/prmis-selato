/**
 * Příprava Project overview v prohlížeči: načtení vybraných fotek (zmenšené) a složení mapy umístění z dlaždic OpenStreetMap.
 * Fotka nebo mapa, která se nenačte, se přeskočí — přehled se kvůli nim nezastaví.
 */

import { AppSettings } from '../../core/settings';
import { Project } from '../../core/types';
import { OverviewLang, ProjectOverview, templateText } from '../../core/projectOverview';
import { mapView, TILE_SIZE } from '../../core/mapTiles';
import { projectCoordinates } from '../../core/geo';
import { RepositorySet } from '../../data/repositories';
import { toDataUrl } from '../diary/imageUtils';
import { TILE_URL } from '../map/leaflet';
import { OverviewModel } from './projectOverviewPdf';

const MAP_W = 600;
const MAP_H = 360;
const MAP_ZOOM = 10;

/** Dlaždice mapy jako obrázek (canvas → JPEG data URL) se značkou projektu; `undefined`, když se mapa nepodaří složit. */
export async function renderMapImage(latitude: number, longitude: number): Promise<string | undefined> {
  try {
    const view = mapView(latitude, longitude, MAP_ZOOM, MAP_W, MAP_H);
    const canvas = document.createElement('canvas');
    canvas.width = MAP_W;
    canvas.height = MAP_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return undefined;
    }
    ctx.fillStyle = '#E3EAF0';
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    const loaded = await Promise.all(
      view.tiles.map(
        (t) =>
          new Promise<{ img: HTMLImageElement; left: number; top: number } | undefined>((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve({ img, left: t.left, top: t.top });
            img.onerror = () => resolve(undefined);
            img.src = TILE_URL.replace('{z}', String(view.zoom)).replace('{x}', String(t.tx)).replace('{y}', String(t.ty));
          })
      )
    );
    const ok = loaded.filter((x): x is { img: HTMLImageElement; left: number; top: number } => !!x);
    if (ok.length === 0) {
      return undefined;
    }
    ok.forEach((t) => ctx.drawImage(t.img, t.left, t.top, TILE_SIZE, TILE_SIZE));
    // Značka projektu: modrý kruh s bílým okrajem.
    ctx.beginPath();
    ctx.arc(view.marker.x, view.marker.y, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#0030ac';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(view.marker.x, view.marker.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    return canvas.toDataURL('image/jpeg', 0.88);
  } catch {
    // Zkažené plátno (blokované dlaždice, CORS) — přehled vznikne bez mapy.
    return undefined;
  }
}

/** Sebere vše, co přehled potřebuje, a složí model pro PDF. */
export async function collectOverviewModel(
  repos: RepositorySet,
  project: Project,
  overview: ProjectOverview,
  settings: AppSettings,
  lang: OverviewLang,
  onProgress?: (text: string) => void
): Promise<OverviewModel> {
  const say = (t: string): void => {
    if (onProgress) {
      onProgress(t);
    }
  };
  const photos: OverviewModel['photos'] = [];
  const failed: string[] = [];
  for (let i = 0; i < overview.photos.length; i++) {
    const ph = overview.photos[i];
    say(`Načítám fotky (${i + 1} z ${overview.photos.length})…`);
    try {
      const blob = await repos.documents.readProjectFile(project, ph.folder, ph.name);
      // Titulní fotka na celou výšku strany potřebuje větší rozlišení.
      const image = await toDataUrl(blob, i === 0 ? 1600 : 1000, 0.82);
      photos.push({ dataUrl: image.dataUrl, caption: ph.caption });
    } catch {
      // Fotku se nepodařilo načíst nebo zmenšit — vynechá se a v dialogu se to ohlásí (nevznikne tichá mezera).
      failed.push(ph.name);
    }
  }
  let map: string | undefined;
  const coords = projectCoordinates(project);
  if (overview.showMap && coords) {
    say('Skládám mapu…');
    map = await renderMapImage(coords.latitude, coords.longitude);
  }
  const text = overview.text[lang].trim() || templateText(overview, project, settings.company.name, lang);
  return { lang, project, overview, company: settings.company.name, text, photos, map, failed };
}
