/**
 * Ověření formátu a kontrolní číslice IČO (českého identifikačního čísla osoby).
 *
 * Kontrolní číslice: součet prvních 7 číslic s vahami 8..2, zbytek po dělení
 * 11 určuje 8. číslici (0 → 1, 1 → 0, jinak 11 − zbytek; výsledek 10 → 0).
 */

const ICO_WEIGHTS = [8, 7, 6, 5, 4, 3, 2];

/**
 * Uklidí IČO zapsané „po lidsku“: bez mezer a jiných znaků, kratší číslo doplní zleva nulami na osm číslic (`69797` → `00069797`),
 * přebytečné nuly zleva u delšího čísla zahodí (`000069797` → `00069797`). Co se tak na osm číslic dostat nedá, vrátí jen očištěné číslice.
 */
export function normalizeIco(text: string | undefined): string {
  let digits = (text || '').replace(/\D/g, '');
  while (digits.length > 8 && digits.charAt(0) === '0') {
    digits = digits.slice(1);
  }
  return digits.length > 0 && digits.length < 8 ? ('00000000' + digits).slice(-8) : digits;
}

export function isValidIco(ico: string): boolean {
  if (!/^\d{8}$/.test(ico)) {
    return false;
  }
  const digits = ico.split('').map(Number);
  const sum = ICO_WEIGHTS.reduce((acc, weight, i) => acc + weight * digits[i], 0);
  const remainder = sum % 11;

  let check: number;
  if (remainder === 0) {
    check = 1;
  } else if (remainder === 1) {
    check = 0;
  } else {
    check = 11 - remainder;
  }
  if (check === 10) {
    check = 0;
  }

  return check === digits[7];
}
