/**
 * Ověření formátu a kontrolní číslice IČO (českého identifikačního čísla osoby).
 *
 * Kontrolní číslice: součet prvních 7 číslic s vahami 8..2, zbytek po dělení
 * 11 určuje 8. číslici (0 → 1, 1 → 0, jinak 11 − zbytek; výsledek 10 → 0).
 */

const ICO_WEIGHTS = [8, 7, 6, 5, 4, 3, 2];

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
