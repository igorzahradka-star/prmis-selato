/**
 * Práce s obrázky v prohlížeči: zmenšení fotky před nahráním (mobilní fotka má 4–12 MB, do zápisu ani do složky
 * nemá smysl ukládat víc než cca 2 000 bodů na delší straně), načtení rozměrů a převod na datovou adresu pro PDF a Word.
 *
 * Běží jen v prohlížeči (canvas), proto není v jednotkových testech; čistá logika výpočtu rozměrů je v `fitSize`.
 */

import { SIGNATURE_MAX_CHARS, signatureAlpha } from '../../core/signatures';

/** Rozměry po zmenšení tak, aby delší strana nepřekročila `maxSide`; menší obrázek se nezvětšuje. */
export function fitSize(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!(longest > maxSide) || !(width > 0) || !(height > 0)) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }
  const k = maxSide / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** Načte obrázek ze souboru. Prohlížeč sám otočí fotku podle údaje o natočení z foťáku. */
export function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Soubor se nepodařilo přečíst jako obrázek.'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Obrázek se nepodařilo zmenšit.'))), type, quality);
  });
}

/**
 * Zmenší obrázek a uloží ho jako JPEG. PNG (náčrty, snímky obrazovky) a GIF se nechávají, jak jsou, pokud jsou
 * menší než `keepBelowBytes` — kreslený náčrt by JPEG zbytečně rozmazal.
 */
export async function resizeImage(
  file: Blob,
  options: { maxSide?: number; quality?: number; keepBelowBytes?: number } = {}
): Promise<Blob> {
  const maxSide = options.maxSide ?? 2000;
  const quality = options.quality ?? 0.85;
  const keepBelow = options.keepBelowBytes ?? 1.5 * 1024 * 1024;
  if ((file.type === 'image/png' || file.type === 'image/gif') && file.size <= keepBelow) {
    return file;
  }
  const img = await loadImage(file);
  const size = fitSize(img.naturalWidth, img.naturalHeight, maxSide);
  if (file.type === 'image/jpeg' && size.width === img.naturalWidth && size.height === img.naturalHeight && file.size <= keepBelow) {
    return file;
  }
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return file;
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.drawImage(img, 0, 0, size.width, size.height);
  return canvasToBlob(canvas, 'image/jpeg', quality);
}

export interface PreparedImage {
  dataUrl: string;
  width: number;
  height: number;
}

/** Obrázek jako datová adresa pro vložení do PDF nebo Wordu, zmenšený na rozumnou velikost. */
export async function toDataUrl(blob: Blob, maxSide: number = 1400, quality: number = 0.8): Promise<PreparedImage> {
  const img = await loadImage(blob);
  const size = fitSize(img.naturalWidth, img.naturalHeight, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Prohlížeč neumí obrázek zpracovat.');
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.drawImage(img, 0, 0, size.width, size.height);
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), width: size.width, height: size.height };
}

/** Datová adresa (`data:image/jpeg;base64,…`) jako bajty. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Soubor jako ArrayBuffer (pro výpočet otisku). */
export function readBlob(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Soubor se nepodařilo přečíst.'));
    reader.readAsArrayBuffer(blob);
  });
}

function two(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Název nové fotky z okamžiku pořízení: `Foto_20261001_142530.jpg`. Když už takový název existuje (víc fotek
 * za vteřinu), přidá se pořadí.
 */
export function photoFileName(taken: Date, existing: string[], extension: string = '.jpg', prefix: string = 'Foto'): string {
  const stamp = `${taken.getFullYear()}${two(taken.getMonth() + 1)}${two(taken.getDate())}_${two(taken.getHours())}${two(taken.getMinutes())}${two(taken.getSeconds())}`;
  const lower = existing.map((e) => e.toLowerCase());
  let name = `${prefix}_${stamp}${extension}`;
  let n = 2;
  while (lower.indexOf(name.toLowerCase()) !== -1) {
    name = `${prefix}_${stamp}_${n}${extension}`;
    n++;
  }
  return name;
}

/**
 * Název souboru, který ve složce ještě není: při shodě (bez ohledu na velikost písmen) se před příponu přidá pořadí
 * (`foto.jpg` → `foto_2.jpg`). Jiný obsah se tak nikdy nepřepíše.
 */
export function uniqueFileName(name: string, existing: string[]): string {
  const lower = existing.map((e) => e.toLowerCase());
  if (lower.indexOf(name.toLowerCase()) === -1) {
    return name;
  }
  const dot = name.lastIndexOf('.');
  const base = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? '' : name.slice(dot);
  let n = 2;
  while (lower.indexOf(`${base}_${n}${ext}`.toLowerCase()) !== -1) {
    n++;
  }
  return `${base}_${n}${ext}`;
}

/** Přípona podle typu obsahu (`image/jpeg` → `.jpg`); neznámý typ vrátí prázdný text. */
export function extensionForType(type: string): string {
  switch ((type || '').toLowerCase()) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/gif':
      return '.gif';
    case 'image/webp':
      return '.webp';
    case 'application/pdf':
      return '.pdf';
    default:
      return '';
  }
}

/**
 * Obrázek podpisu: naskenovaný nebo nafocený podpis se zmenší (nejvýš 600 × 220 bodů) a uloží jako PNG. S `removeBackground` se
 * bílý papír zprůhlední (viz `signatureAlpha`), takže podpis v dokumentu nemá bílý obdélník. Když je výsledek příliš velký,
 * zmenší se ještě víc.
 */
export async function prepareSignatureImage(blob: Blob, removeBackground: boolean): Promise<string> {
  const img = await loadImage(blob);
  for (const maxWidth of [600, 450, 320]) {
    const maxHeight = Math.round(maxWidth * 0.37);
    const k = Math.min(1, maxWidth / img.naturalWidth, maxHeight / img.naturalHeight);
    const width = Math.max(1, Math.round(img.naturalWidth * k));
    const height = Math.max(1, Math.round(img.naturalHeight * k));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Prohlížeč neumí obrázek zpracovat.');
    }
    ctx.drawImage(img, 0, 0, width, height);
    if (removeBackground) {
      const data = ctx.getImageData(0, 0, width, height);
      for (let i = 0; i < data.data.length; i += 4) {
        const a = signatureAlpha(data.data[i], data.data[i + 1], data.data[i + 2]);
        data.data[i + 3] = Math.round((data.data[i + 3] * a) / 255);
      }
      ctx.putImageData(data, 0, 0);
    }
    const url = canvas.toDataURL('image/png');
    if (url.length <= SIGNATURE_MAX_CHARS) {
      return url;
    }
  }
  throw new Error('Obrázek podpisu je příliš velký. Použijte menší nebo jednodušší obrázek, nebo podpis nakreslete.');
}
