/**
 * Fotodokumentace — kam se fotky ukládají a jak se jmenují. Čistá logika bez SharePointu a Reactu.
 *
 * Struktura složek uvnitř složky projektu (název základní složky je v Nastavení → Složky):
 *   07_Dokumentace a podklady / FOTO / 2026 / 2026-10-01 / Foto_20261001_142530_panely-jih.jpg
 * Složky podle roku a dne vznikají samy při prvním uložení fotky.
 */

import { isoDay, safeName } from './siteDiary';

function two(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Složka fotek pro daný den: `07_Dokumentace a podklady/FOTO/2026/2026-10-01`. */
export function photoFolderPath(photoFolder: string, day: Date): string {
  const base = (photoFolder || '').replace(/^\/+|\/+$/g, '');
  return `${base ? base + '/' : ''}${day.getFullYear()}/${isoDay(day)}`;
}

/** Složka fotek pro celý rok (pro odkaz „otevřít složku FOTO"). */
export function photoYearFolderPath(photoFolder: string, year: number): string {
  const base = (photoFolder || '').replace(/^\/+|\/+$/g, '');
  return `${base ? base + '/' : ''}${year}`;
}

/** Popis fotky zkrácený a upravený na bezpečný tvar do názvu souboru (`Panely – jih` → `Panely-jih`). */
export function photoTag(text: string | undefined): string {
  const cleaned = safeName(text || '', '')
    .replace(/[\s–—]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned.length > 30 ? cleaned.slice(0, 30).replace(/-$/, '') : cleaned;
}

/**
 * Název fotky z okamžiku pořízení, volitelně s popisem: `Foto_20261001_142530_Panely-jih.jpg`.
 * Když už takový název ve složce je (víc fotek za vteřinu), přidá se pořadí. Řadí se tak podle času.
 */
export function buildPhotoName(taken: Date, tag: string | undefined, existing: string[], extension: string = '.jpg'): string {
  const stamp = `${taken.getFullYear()}${two(taken.getMonth() + 1)}${two(taken.getDate())}_${two(taken.getHours())}${two(taken.getMinutes())}${two(taken.getSeconds())}`;
  const suffix = photoTag(tag);
  const lower = existing.map((e) => e.toLowerCase());
  const make = (n: number): string => `Foto_${stamp}${suffix ? '_' + suffix : ''}${n > 1 ? '_' + n : ''}${extension}`;
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
