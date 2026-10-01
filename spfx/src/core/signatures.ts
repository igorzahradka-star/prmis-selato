/**
 * Podpis jako obrázek — čistá logika bez SharePointu a Reactu.
 *
 * Každý uživatel si ve svém profilu uloží obrázek svého podpisu (nahraje sken, nebo ho nakreslí myší či prstem). Do ostrých PDF
 * dokladů (objednávky, podklady pro fakturaci, zápisy) se vkládá pod jména těch, kdo doklad vystavili nebo schválili, spolu se
 * **značkou elektronického podpisu** (a jménem a časem). Není to kvalifikovaný (certifikátový) elektronický podpis — je to doložení,
 * že konkrétní uživatel doklad v aplikaci vystavil nebo schválil; skutečný podpis certifikátem je samostatná věc.
 */

import { normalizeLogin } from './roles';

/** Nejdelší povolený obrázek podpisu (délka textu data URL) — podpis má být drobný, ať se nezvětšují PDF ani seznam. */
export const SIGNATURE_MAX_CHARS = 200000;

/** Podpis uživatele uložený v profilu. */
export interface UserSignature {
  login: string;
  displayName: string;
  /** Obrázek jako `data:image/png;base64,…`. */
  imageDataUrl: string;
  updated?: Date;
}

/** Jeden podpis v dokumentu: kdo, v jaké roli, kdy a (když ho má v profilu) obrázek podpisu. */
export interface SignatureMark {
  /** Role: „Vystavil“, „Projektový manažer“, „Vedení“… */
  label: string;
  name: string;
  at?: Date;
  /** Obrázek podpisu (data URL); bez něj se vykreslí jen jméno se značkou. */
  image?: string;
  /** Schváleno automaticky (bez kliknutí člověka) — bez obrázku, s vysvětlením. */
  auto?: boolean;
}

/** Je to obrázek ve tvaru, který se dá vložit do PDF (PNG nebo JPEG jako data URL)? */
export function isSignatureImage(value: string | undefined | null): value is string {
  return !!value && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value);
}

/** Kontrola obrázku podpisu před uložením. Vrací větu pro člověka, nebo `undefined`, když je v pořádku. */
export function validateSignatureDataUrl(value: string): string | undefined {
  if (!isSignatureImage(value)) {
    return 'Podpis musí být obrázek PNG nebo JPEG.';
  }
  if (value.length > SIGNATURE_MAX_CHARS) {
    return 'Obrázek podpisu je příliš velký. Zmenšete ho, nebo podpis nakreslete znovu.';
  }
  return undefined;
}

/**
 * Průhlednost bodu při převodu skenu podpisu: bílý a téměř bílý papír zprůhlední, tmavý inkoust zůstane, světlé šedé přechody se
 * plynule zprůhlední. Vrací hodnotu 0–255.
 */
export function signatureAlpha(r: number, g: number, b: number): number {
  const brightness = (r + g + b) / 3;
  if (brightness >= 238) {
    return 0;
  }
  if (brightness <= 170) {
    return 255;
  }
  return Math.round((255 * (238 - brightness)) / (238 - 170));
}

/** Podpisy podle (normalizovaného) přihlašovacího jména — pro rychlé dohledání při skládání dokumentu. */
export function signatureKey(login: string | undefined): string {
  return normalizeLogin(login || '');
}

/** Najde podpis uživatele v mapě podle přihlašovacího jména (v libovolném tvaru). */
export function signatureOf(map: Record<string, UserSignature>, login: string | undefined): string | undefined {
  const found = map[signatureKey(login)];
  return found && isSignatureImage(found.imageDataUrl) ? found.imageDataUrl : undefined;
}
