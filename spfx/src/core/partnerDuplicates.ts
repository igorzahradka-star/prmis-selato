/**
 * Kontrola duplicit partnerů — pravidlo platí pro obě aplikace (RES CRM i PRMIS), protože sdílejí `PRM_Partners`
 * (viz `docs/REVCRM.md`, oddíl „Kontrola duplicit partnerů a mazání“, a deník R-011 / P-004):
 *
 *  1. **Stejné IČO (stejná země) = nelze uložit.** IČO je jednoznačný klíč partnera; prázdné IČO se nekontroluje.
 *  2. **Stejné nebo podobné jméno = upozornit** (partner může být zadaný bez IČO). Nebrání uložení — člověk potvrdí, že jde o jinou firmu.
 *
 * Podobnost jména: porovnává se zjednodušený název (bez diakritiky, velikosti písmen, interpunkce a právní formy s.r.o., a.s., spol. s r.o. …);
 * shoda = stejný zjednodušený název, jeden název obsahuje druhý (alespoň 5 znaků), nebo se liší nejvýše o 1 znak (názvy od 6 znaků) či 2 znaky (od 12 znaků).
 *
 * Odvozeno z referenční implementace RES CRM (`revcrm/spfx/src/core/partnerDuplicates.ts`). Jediný rozdíl: IČO zahraničního partnera
 * (registrační číslo typu „HRB 12345“) se porovnává jako písmena a číslice, ne jen jako číslice — jinak by se „HRB 123“ a „123“ slily.
 * Čistá logika bez SharePointu a Reactu.
 */

import { Partner } from './types';
import { isDomestic } from './countries';
import { normalizeIco } from './ico';

/** Země partnera pro porovnání IČO; prázdná = Česko. */
function countryOf(p: Pick<Partner, 'country'>): string {
  return (p.country || 'CZ').trim().toUpperCase();
}

/** Klíč pro porovnání IČO: české IČO jako osm číslic, zahraniční registrační číslo jako velká písmena a číslice. */
export function icoKey(ico: string | undefined, country: string | undefined): string {
  if (isDomestic(country)) {
    return normalizeIco(ico);
  }
  return (ico || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Najde jiného partnera se stejným IČO ve stejné zemi (včetně deaktivovaných). `excludeId` je upravovaný partner (sám se sebou se neporovnává).
 * Bez IČO vrací `undefined`.
 */
export function findIcoDuplicate(partners: Partner[], candidate: Pick<Partner, 'ico' | 'country'>, excludeId?: number): Partner | undefined {
  const country = countryOf(candidate);
  const key = icoKey(candidate.ico, country);
  if (key === '') {
    return undefined;
  }
  return partners.filter((p) => p.id !== excludeId && countryOf(p) === country && icoKey(p.ico, country) === key)[0];
}

const LEGAL_FORMS = [
  'spol s r o',
  'spolecnost s rucenim omezenym',
  's r o',
  'sro',
  'a s',
  'as',
  'k s',
  'v o s',
  'z s',
  'gmbh',
  'ltd',
  'llc',
  'inc',
  'se',
  'ag',
  'sp z o o',
  'zoo',
  'bv',
  'sa'
];

/** Zjednodušený název pro porovnání: bez diakritiky, interpunkce a právní formy. */
export function simplifyName(name: string): string {
  let text = (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  // Právní formu na konci (i víckrát, např. „… s r o a s“) odstraní, ale nikdy neponechá prázdný název.
  let changed = true;
  while (changed) {
    changed = false;
    for (const form of LEGAL_FORMS) {
      if (text.length > form.length && text.slice(-(form.length + 1)) === ` ${form}`) {
        text = text.slice(0, -(form.length + 1)).trim();
        changed = true;
      }
    }
  }
  return text;
}

/** Počet změn jednoho znaku (vložení, smazání, záměna) mezi dvěma texty, s předčasným ukončením nad `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) {
    return max + 1;
  }
  let prev: number[] = [];
  for (let j = 0; j <= b.length; j++) {
    prev.push(j);
  }
  for (let i = 1; i <= a.length; i++) {
    const row: number[] = [i];
    let best = row[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      const v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      row.push(v);
      best = Math.min(best, v);
    }
    if (best > max) {
      return max + 1;
    }
    prev = row;
  }
  return prev[b.length];
}

/** Jsou dva názvy stejné nebo podobné? Viz popis souboru. */
export function similarNames(a: string, b: string): boolean {
  const x = simplifyName(a);
  const y = simplifyName(b);
  if (x === '' || y === '') {
    return false;
  }
  if (x === y) {
    return true;
  }
  const shorter = x.length <= y.length ? x : y;
  const longer = x.length <= y.length ? y : x;
  if (shorter.length >= 5 && longer.indexOf(shorter) !== -1) {
    return true;
  }
  if (shorter.length >= 6) {
    const tolerance = shorter.length >= 12 ? 2 : 1;
    return editDistance(x, y, tolerance) <= tolerance;
  }
  return false;
}

/** Partneři se stejným nebo podobným jménem (včetně deaktivovaných), bez upravovaného partnera. */
export function findSimilarNames(partners: Partner[], name: string, excludeId?: number): Partner[] {
  return partners.filter((p) => p.id !== excludeId && similarNames(p.name, name));
}

export interface PartnerCheck {
  /** Věta, která brání uložení (stejné IČO). `undefined` = uložit jde. */
  blocking?: string;
  /** Partneři s podobným jménem — upozornění, uložení potvrzuje člověk. */
  similar: Partner[];
}

/** Společná kontrola před uložením partnera. */
export function checkPartner(partners: Partner[], candidate: Pick<Partner, 'name' | 'ico' | 'country'>, excludeId?: number): PartnerCheck {
  const byIco = findIcoDuplicate(partners, candidate, excludeId);
  if (byIco) {
    return {
      blocking: `Partner se stejným IČO (${candidate.ico}) už existuje: „${byIco.name}“${byIco.isActive ? '' : ' (deaktivovaný)'}. IČO je jednoznačné — použijte stávajícího partnera, nebo ho upravte.`,
      similar: []
    };
  }
  return { similar: findSimilarNames(partners, candidate.name, excludeId) };
}

/** Text upozornění na podobné partnery. */
export function similarWarning(similar: Partner[]): string {
  const names = similar.slice(0, 5).map((p) => `„${p.name}“${p.ico ? ` (IČO ${p.ico})` : ''}${p.isActive ? '' : ' – deaktivovaný'}`);
  return `Partner se stejným nebo podobným jménem už existuje: ${names.join(', ')}${similar.length > 5 ? ` a dalších ${similar.length - 5}` : ''}.`;
}
