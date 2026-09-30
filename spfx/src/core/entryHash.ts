/**
 * Otisk (SHA-256) zápisu ze stavby. Počítá se z obsahu zápisu a z otisků jeho souborů (fotky, náčrty, přílohy)
 * v okamžiku uzavření; při podpisu se spočítá znovu a musí vyjít stejně. Kdyby někdo mezitím změnil text nebo
 * vyměnil fotku (třeba přímo v SharePointu), podpis se nepovolí.
 *
 * Otisk je důkaz, že se obsah nezměnil — sám o sobě to není kvalifikovaný elektronický podpis.
 */

import { EntryContent, pointFiles } from './siteDiary';

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

/** Text jako bajty UTF-8 (vlastní převod, aby nezáleželo na tom, jestli prostředí zná TextEncoder). */
function utf8Bytes(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    } else if (c < 0x10000) {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    } else {
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  return new Uint8Array(out);
}

/** SHA-256 v čisté JavaScriptu — záloha, když prohlížeč nemá `crypto.subtle` (např. stránka bez https). */
function sha256Fallback(data: Uint8Array): string {
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const length = data.length;
  const paddedLength = ((length + 9 + 63) >> 6) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(data);
  padded[length] = 0x80;
  const bits = length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bits / 0x100000000));
  view.setUint32(paddedLength - 4, bits >>> 0);
  const w: number[] = new Array<number>(64);
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + hh) | 0;
  }
  return h.map((x) => ('00000000' + (x >>> 0).toString(16)).slice(-8)).join('');
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => (b < 16 ? '0' : '') + b.toString(16))
    .join('');
}

/**
 * SHA-256 textu nebo souboru jako šestnáctkový řetězec. Používá rychlou funkci prohlížeče (`crypto.subtle`, jen na https);
 * bez ní se počítá záložní čistou JavaScriptovou implementací (u velkých souborů pomalejší, ale stejný výsledek).
 */
export async function sha256Hex(data: string | ArrayBuffer): Promise<string> {
  const bytes = typeof data === 'string' ? utf8Bytes(data) : new Uint8Array(data);
  const cryptoObject = typeof globalThis !== 'undefined' ? (globalThis as { crypto?: Crypto }).crypto : undefined;
  if (cryptoObject && cryptoObject.subtle) {
    return toHex(await cryptoObject.subtle.digest('SHA-256', bytes));
  }
  return sha256Fallback(bytes);
}

export interface EntryIdentity {
  projectNumber: string;
  diaryId: number;
  entryNo: number;
  date: Date;
}

/**
 * Text, ze kterého se otisk počítá: údaje zápisu, obsah a seznam souborů s jejich otisky — vždy ve stejném pořadí,
 * takže stejný zápis dá stejný otisk.
 */
export function entryHashInput(identity: EntryIdentity, content: EntryContent, fileHashes: Record<string, string>): string {
  const files = pointFiles(content.points)
    .slice()
    .sort()
    .map((name) => `${name}:${fileHashes[name] || '?'}`);
  const d = identity.date;
  const day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  return JSON.stringify({
    project: identity.projectNumber,
    diary: identity.diaryId,
    no: identity.entryNo,
    day,
    header: content.header,
    participants: content.participants,
    points: content.points,
    tasks: content.tasks,
    conditions: content.conditions ?? '',
    files
  });
}

/** Otisk zápisu; `fileHashes` = otisky souborů použitých v bodech (název → SHA-256). */
export async function computeEntryHash(identity: EntryIdentity, content: EntryContent, fileHashes: Record<string, string>): Promise<string> {
  return sha256Hex(entryHashInput(identity, content, fileHashes));
}
