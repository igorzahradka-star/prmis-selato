/**
 * Fotodokumentace — kam se fotky ukládají a jak se jmenují. Čistá logika bez SharePointu a Reactu.
 *
 * Fotky se nahrávají v **dávkách**. Dávka má vlastní složku, jejíž název je datum (rok-měsíc-den) a volitelný
 * jednoslovný přídomek, např. `KD` (kontrolní den):
 *   07-Dokumentace a podklady / FOTO / 2026 / 2026-10-01_KD / Foto_20261001_142530.jpg
 * Složky vznikají samy při prvním uložení fotky. Datum složky je buď den vložení (výchozí), nebo den pořízení každé fotky.
 */

import { isoDay } from './siteDiary';

function two(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Nejdelší povolený přídomek dávky. */
export const BATCH_TAG_MAX = 12;

/**
 * Přídomek dávky: **jedno slovo**, nejvýš `BATCH_TAG_MAX` znaků; povolená jsou písmena (i s diakritikou), číslice
 * a pomlčka. Mezery a ostatní znaky se vyhodí (to by bylo v názvu složky na obtíž), takže „kontrolní den“ vyjde „kontrolníden“.
 * Prázdný vstup dá prázdný přídomek.
 */
export function batchTag(text: string | undefined): string {
  const cleaned = (text || '')
    .replace(/[^0-9A-Za-zÀ-ɏ-]/g, '')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return cleaned.length > BATCH_TAG_MAX ? cleaned.slice(0, BATCH_TAG_MAX).replace(/-+$/, '') : cleaned;
}

/** Název složky dávky: `2026-10-01` nebo `2026-10-01_KD`. */
export function batchFolderName(day: Date, tag?: string): string {
  const t = batchTag(tag);
  return `${isoDay(day)}${t ? '_' + t : ''}`;
}

/** Složka dávky v projektu: `07-Dokumentace a podklady/FOTO/2026/2026-10-01_KD`. */
export function photoFolderPath(photoFolder: string, day: Date, tag?: string): string {
  const base = (photoFolder || '').replace(/^\/+|\/+$/g, '');
  return `${base ? base + '/' : ''}${day.getFullYear()}/${batchFolderName(day, tag)}`;
}

/** Složka fotek pro celý rok. */
export function photoYearFolderPath(photoFolder: string, year: number): string {
  const base = (photoFolder || '').replace(/^\/+|\/+$/g, '');
  return `${base ? base + '/' : ''}${year}`;
}

/** Podle čeho se určí den ve složce: den vložení fotek (výchozí), nebo den pořízení každé fotky. */
export type PhotoDateMode = 'vlozeni' | 'porizeni';

/** Den, do jehož složky fotka patří. */
export function photoDay(mode: PhotoDateMode, taken: Date, batchDay: Date): Date {
  return mode === 'porizeni' ? taken : batchDay;
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
