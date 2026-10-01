/**
 * Fotodokumentace — kam se fotky ukládají a jak se jmenují. Čistá logika bez SharePointu a Reactu.
 *
 * Fotky se nahrávají v **dávkách** (balících, které k sobě patří, např. jeden nafocený problém). Každá dávka má vlastní složku
 * přímo ve složce FOTO; název složky je datum a název dávky, jak ho napíše uživatel:
 *   07-Dokumentace a podklady / FOTO / 2026-03-01 Mělký výkop / Foto_20260301_142530.jpg
 * Složky vznikají samy při prvním uložení fotky. Do hotové dávky jde dodatečně přidat další fotky. Fotky, které někdo
 * vloží do složky FOTO mimo aplikaci, se v aplikaci objeví po obnovení seznamu (aplikace nic nekopíruje, čte složky).
 */

import { isoDay, parseIsoDay } from './siteDiary';

function two(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Nejdelší povolený název dávky (bez data). */
export const BATCH_TITLE_MAX = 60;

/** Znaky, které SharePoint v názvu složky nepovoluje (a # %, které dělají potíže v odkazech), a řídicí znaky. */
const FORBIDDEN_IN_FOLDER = /["*:<>?/\\|#%]/g;

/**
 * Název dávky: libovolný text, ve kterém se ale vyhodí znaky nepovolené v názvu složky; mezery se sjednotí a zkrátí na okraji,
 * tečky na začátku a na konci pryč, délka se omezí na `BATCH_TITLE_MAX`. Diakritika, mezery a pomlčky zůstávají
 * („Mělký výkop“, „Problém č. 1“).
 */
export function batchTitle(text: string | undefined): string {
  const withoutControl = (text || '')
    .split('')
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join('');
  const cleaned = withoutControl
    .replace(FORBIDDEN_IN_FOLDER, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .trim();
  return cleaned.length > BATCH_TITLE_MAX ? cleaned.slice(0, BATCH_TITLE_MAX).trim() : cleaned;
}

/** Název složky dávky: `2026-03-01 Mělký výkop` (bez názvu jen `2026-03-01`). */
export function batchFolderName(day: Date, title?: string): string {
  const t = batchTitle(title);
  return `${isoDay(day)}${t ? ' ' + t : ''}`;
}

/** Složka dávky v projektu: `07-Dokumentace a podklady/FOTO/2026-03-01 Mělký výkop`. */
export function photoFolderPath(photoFolder: string, day: Date, title?: string): string {
  const base = (photoFolder || '').replace(/^\/+|\/+$/g, '');
  return `${base ? base + '/' : ''}${batchFolderName(day, title)}`;
}

/** Rozbor názvu složky dávky: datum na začátku (oddělené mezerou, podtržítkem nebo pomlčkou) a zbytek jako název. */
export interface BatchFolderInfo {
  date?: Date;
  title: string;
}

export function parseBatchFolder(name: string): BatchFolderInfo {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[\s_-]+(.*))?$/.exec((name || '').trim());
  if (!m) {
    return { title: (name || '').trim() };
  }
  const date = parseIsoDay(m[1]);
  return date ? { date, title: (m[2] || '').trim() } : { title: (name || '').trim() };
}

/** Složka jen s rokem (`2026`) ze starší úpravy: dávky v ní jsou o úroveň níž. */
export function isYearFolder(name: string): boolean {
  return /^\d{4}$/.test((name || '').trim());
}

/** Dávky od nejnovější (podle data v názvu); složky bez data na konec podle abecedy. */
export function sortBatchFolders<T extends { name: string }>(list: T[]): T[] {
  const time = (n: string): number => {
    const d = parseBatchFolder(n).date;
    return d ? d.getTime() : -1;
  };
  return list.slice().sort((a, b) => {
    const ta = time(a.name);
    const tb = time(b.name);
    if (ta !== tb) {
      return tb - ta;
    }
    return a.name.localeCompare(b.name, 'cs-CZ', { numeric: true });
  });
}

/** Adresa miniatury souboru v SharePointu (náhled se vygeneruje na serveru; nenačte-li se, použije se původní fotka). */
export function photoThumbnailUrl(origin: string, serverRelativePath: string, width: number = 400): string {
  const o = origin.replace(/\/+$/, '');
  const absolute = `${o}${serverRelativePath.indexOf('/') === 0 ? '' : '/'}${serverRelativePath}`;
  return `${o}/_layouts/15/getpreview.ashx?resolution=0&width=${width}&path=${encodeURIComponent(absolute)}`;
}

/**
 * Název fotky z okamžiku pořízení: `Foto_20261001_142530.jpg`. Když už takový název ve složce je (víc fotek za vteřinu),
 * přidá se pořadí. Řadí se tak podle času.
 */
export function buildPhotoName(taken: Date, existing: string[], extension: string = '.jpg'): string {
  const stamp = `${taken.getFullYear()}${two(taken.getMonth() + 1)}${two(taken.getDate())}_${two(taken.getHours())}${two(taken.getMinutes())}${two(taken.getSeconds())}`;
  const lower = existing.map((e) => e.toLowerCase());
  const make = (n: number): string => `Foto_${stamp}${n > 1 ? '_' + n : ''}${extension}`;
  let n = 1;
  while (lower.indexOf(make(n).toLowerCase()) !== -1) {
    n++;
  }
  return make(n);
}

/** Odkaz na složku uvnitř složky projektu z adresy složky projektu (každá část se zakóduje, aby šla adresa otevřít). */
export function folderLink(projectFolderUrl: string, relativePath: string): string {
  const base = (projectFolderUrl || '').replace(/\/+$/, '');
  const parts = relativePath
    .split('/')
    .filter((p) => p.trim() !== '')
    .map((p) => encodeURIComponent(p));
  return parts.length > 0 ? `${base}/${parts.join('/')}` : base;
}

/** Adresa složky, ve které leží soubor (adresa souboru bez názvu). */
export function parentUrl(fileUrl: string): string {
  const i = (fileUrl || '').lastIndexOf('/');
  return i === -1 ? fileUrl : fileUrl.slice(0, i);
}

export type UploadState = 'ceka' | 'nahrava' | 'hotovo' | 'chyba';

/** Shrnutí fronty nahrávání jednou větou („3 z 5 nahráno, 1 se nepovedlo"). */
export function uploadSummary(states: UploadState[]): string {
  if (states.length === 0) {
    return '';
  }
  const done = states.filter((s) => s === 'hotovo').length;
  const failed = states.filter((s) => s === 'chyba').length;
  const pending = states.length - done - failed;
  const parts = [`${done} z ${states.length} nahráno`];
  if (pending > 0) {
    parts.push(`${pending} čeká`);
  }
  if (failed > 0) {
    parts.push(`${failed} se nepovedlo`);
  }
  return parts.join(', ');
}
