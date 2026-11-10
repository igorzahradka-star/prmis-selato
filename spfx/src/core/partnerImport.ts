/**
 * Import partnerů z Excelu (Nastavení → Jednorázové akce → Import partnerů) — čistá logika.
 *
 * Vstup jsou řádky tabulky (z listu .xlsx nebo zkopírované z Excelu jako text oddělený tabulátory). Sloupce:
 * Název, Typ, Země, IČO, DIČ, Adresa, Email, Telefon. Když první řádek obsahuje nadpisy, sloupce se najdou podle nich
 * (v libovolném pořadí); bez nadpisů se čtou v tomto pořadí.
 *
 * U každého řádku se rozhodne, co se s ním stane:
 *  - **založí se** — v pořádku, takový partner ještě není,
 *  - **přeskočí se** — duplicita: stejné IČO ve stejné zemi už má partner v aplikaci nebo dřívější řádek souboru;
 *    u řádku bez IČO stejný název (bez právní formy a diakritiky) ve stejné zemi. Díky tomu jde import opakovat
 *    a už založení partneři se znovu nezaloží,
 *  - **chyba** — chybí název, neznámý typ nebo země, české IČO nemá 8 číslic nebo nesedí kontrolní číslice.
 *
 * Zahraniční IČ (registrační číslo) a DIČ se nekontrolují na kontrolní číslici — každý stát má jiný systém.
 * Bez SharePointu a Reactu.
 */

import { Partner, PartnerType } from './types';
import { ALL_COUNTRIES, DEFAULT_COUNTRY, isDomestic, normalizeVatId, vatIdWarning } from './countries';
import { isValidIco, normalizeIco } from './ico';
import { icoKey, simplifyName } from './partnerDuplicates';

/** Pole jednoho řádku importu, v pořadí sloupců bez nadpisů. */
export const PARTNER_IMPORT_FIELDS = ['name', 'type', 'country', 'ico', 'dic', 'address', 'email', 'phone'] as const;
export type PartnerImportField = (typeof PARTNER_IMPORT_FIELDS)[number];

/** Nadpisy sloupců, které se poznají (bez diakritiky, malými písmeny, jen písmena a číslice). */
const HEADER_ALIASES: Record<PartnerImportField, string[]> = {
  name: ['nazev', 'nazevpartnera', 'nazevfirmy', 'firma', 'partner', 'name'],
  type: ['typ', 'typpartnera', 'druh', 'type'],
  country: ['zeme', 'stat', 'country', 'kodzeme'],
  ico: ['ico', 'ic', 'icic', 'regcislo', 'registracnicislo', 'companyid'],
  dic: ['dic', 'vat', 'vatid', 'dph'],
  address: ['adresa', 'sidlo', 'address'],
  email: ['email', 'mail'],
  phone: ['telefon', 'tel', 'phone', 'mobil']
};

export type PartnerImportAction = 'create' | 'duplicate' | 'error';

export interface PartnerImportRow {
  /** Číslo řádku v tabulce, jak ho vidí člověk v Excelu (1 = první řádek, i když je to nadpis). */
  line: number;
  /** Hodnoty ze souboru (oříznuté), jak je uživatel zadal. */
  values: Record<PartnerImportField, string>;
  action: PartnerImportAction;
  /** Proč se přeskočí nebo čím je chybný; u zakládaného řádku případná upozornění. */
  message: string;
  /** Uklizené údaje partnera (u `create` k založení, u `duplicate` jen pro náhled; zakládají se jen řádky `create`). */
  partner?: Omit<Partner, 'id'>;
}

export interface PartnerImportPlan {
  rows: PartnerImportRow[];
  /** Byl první řádek nadpis? (jen pro informaci v okně) */
  hasHeader: boolean;
  toCreate: number;
  duplicates: number;
  errors: number;
}

/** Text pro porovnání nadpisů a názvů: bez diakritiky, malými písmeny, jen písmena a číslice. */
function key(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Typ partnera ze zápisu v Excelu. Pozná Zákazník / Odběratel, Dodavatel, Obojí a zápisy, kde jsou obě role
 * („Zákazník i dodavatel“, „Zákazník, Dodavatel“). Neznámý nebo prázdný text vrátí `undefined`.
 */
export function parsePartnerType(text: string): PartnerType | undefined {
  const k = key(text);
  if (!k) {
    return undefined;
  }
  if (k === 'oboji' || k === 'oboje' || k === 'oba' || k === 'both') {
    return PartnerType.Oboji;
  }
  const customer = /zakaznik|odberatel|customer|klient/.test(k);
  const supplier = /dodavatel|supplier|vendor/.test(k);
  if (customer && supplier) {
    return PartnerType.Oboji;
  }
  if (customer) {
    return PartnerType.Zakaznik;
  }
  if (supplier) {
    return PartnerType.Dodavatel;
  }
  return undefined;
}

const COUNTRY_ALIASES: Record<string, string> = {
  cr: 'CZ',
  ceskarepublika: 'CZ',
  czechrepublic: 'CZ',
  czechia: 'CZ',
  sr: 'SK',
  slovenskarepublika: 'SK',
  slovakia: 'SK',
  nemecko: 'DE',
  germany: 'DE',
  deutschland: 'DE',
  rakousko: 'AT',
  austria: 'AT',
  osterreich: 'AT',
  polsko: 'PL',
  poland: 'PL',
  usa: 'US',
  spojenestatyamericke: 'US',
  velkabritanie: 'GB',
  unitedkingdom: 'GB',
  uk: 'GB'
};

/**
 * Kód země ze zápisu v Excelu: prázdné = Česko, dvoupísmenný kód (CZ, DE…), český název země („Německo“) nebo běžný
 * jiný zápis („ČR“, „Česká republika“, „Germany“). Neznámou zemi vrátí `undefined`.
 */
export function parseCountry(text: string): string | undefined {
  const raw = (text || '').trim();
  if (!raw) {
    return DEFAULT_COUNTRY;
  }
  const upper = raw.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) {
    if (upper === 'EL') {
      return 'GR';
    }
    if (ALL_COUNTRIES.some((c) => c.code === upper)) {
      return upper;
    }
  }
  const k = key(raw);
  if (COUNTRY_ALIASES[k]) {
    return COUNTRY_ALIASES[k];
  }
  const byName = ALL_COUNTRIES.filter((c) => key(c.name) === k)[0];
  return byName ? byName.code : undefined;
}

/**
 * Ověření IČO podle země. České IČO se uklidí (`normalizeIco` — mezery pryč, krátké číslo z Excelu doplní nulami zleva)
 * a musí mít 8 číslic se správnou kontrolní číslicí. Zahraniční se jen ořízne a nekontroluje.
 * Vrací uklizené IČO, nebo chybu.
 */
export function checkImportIco(raw: string, country: string): { ico: string; error?: string } {
  const text = (raw || '').trim();
  if (!text) {
    return { ico: '' };
  }
  if (!isDomestic(country)) {
    return { ico: text };
  }
  if (/[^\d\s]/.test(text)) {
    return { ico: text, error: `IČO „${text}“ smí obsahovat jen číslice.` };
  }
  const ico = normalizeIco(text);
  if (ico.length !== 8) {
    return { ico, error: `IČO „${text}“ nemá 8 číslic.` };
  }
  if (!isValidIco(ico)) {
    return { ico, error: `IČO ${ico} má chybnou kontrolní číslici (překlep?).` };
  }
  return { ico };
}

/** Najde v prvním řádku nadpisy sloupců. Vrátí mapu pole → index sloupce, nebo `undefined`, když to nadpis není. */
export function detectHeader(row: string[]): Partial<Record<PartnerImportField, number>> | undefined {
  const map: Partial<Record<PartnerImportField, number>> = {};
  row.forEach((cell, i) => {
    const k = key(cell);
    PARTNER_IMPORT_FIELDS.forEach((f) => {
      if (map[f] === undefined && HEADER_ALIASES[f].indexOf(k) !== -1) {
        map[f] = i;
      }
    });
  });
  return map.name !== undefined ? map : undefined;
}

/** Klíč názvu pro duplicitu partnera bez IČO (země + zjednodušený název). */
function nameKey(name: string, country: string | undefined): string {
  const simple = simplifyName(name);
  return simple ? `${(country || DEFAULT_COUNTRY).toUpperCase()}|${simple}` : '';
}

/** Klíč IČO pro duplicitu (země + IČO). */
function icoDupKey(ico: string | undefined, country: string | undefined): string {
  const k = icoKey(ico, country);
  return k ? `${(country || DEFAULT_COUNTRY).trim().toUpperCase()}|${k}` : '';
}

/** Je e-mail aspoň zhruba v pořádku? (jen upozornění) */
function looksLikeEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

/**
 * Sestaví plán importu: projde řádky tabulky a u každého určí, co se s ním stane. `existing` jsou partneři, kteří už
 * v aplikaci jsou (včetně deaktivovaných) — proti nim se hledají duplicity.
 */
export function buildPartnerImportPlan(table: string[][], existing: Partner[]): PartnerImportPlan {
  const header = table.length > 0 ? detectHeader(table[0]) : undefined;
  const columns: Partial<Record<PartnerImportField, number>> =
    header || PARTNER_IMPORT_FIELDS.reduce((acc, f, i) => ({ ...acc, [f]: i }), {} as Partial<Record<PartnerImportField, number>>);
  const start = header ? 1 : 0;

  const seenIco: Record<string, string> = {};
  const seenName: Record<string, string> = {};
  existing.forEach((p) => {
    const ik = icoDupKey(p.ico, p.country);
    if (ik && !seenIco[ik]) {
      seenIco[ik] = `už je v aplikaci: „${p.name}“${p.isActive ? '' : ' (deaktivovaný)'}`;
    }
    const nk = nameKey(p.name, p.country);
    if (nk && !seenName[nk]) {
      seenName[nk] = `už je v aplikaci: „${p.name}“${p.isActive ? '' : ' (deaktivovaný)'}`;
    }
  });

  const rows: PartnerImportRow[] = [];
  for (let r = start; r < table.length; r++) {
    const cells = table[r];
    if (!cells || cells.every((c) => !(c || '').trim())) {
      continue;
    }
    const values = PARTNER_IMPORT_FIELDS.reduce(
      (acc, f) => {
        const i = columns[f];
        acc[f] = i === undefined ? '' : (cells[i] || '').replace(/\s+/g, ' ').trim();
        return acc;
      },
      {} as Record<PartnerImportField, string>
    );
    rows.push(planRow(r + 1, values, seenIco, seenName));
  }

  return {
    rows,
    hasHeader: !!header,
    toCreate: rows.filter((x) => x.action === 'create').length,
    duplicates: rows.filter((x) => x.action === 'duplicate').length,
    errors: rows.filter((x) => x.action === 'error').length
  };
}

function planRow(
  line: number,
  values: Record<PartnerImportField, string>,
  seenIco: Record<string, string>,
  seenName: Record<string, string>
): PartnerImportRow {
  const errors: string[] = [];
  if (!values.name) {
    errors.push('Chybí název.');
  }
  const partnerType = parsePartnerType(values.type);
  if (!partnerType) {
    errors.push(values.type ? `Neznámý typ „${values.type}“ (čeká se Zákazník, Dodavatel nebo Obojí).` : 'Chybí typ (Zákazník, Dodavatel nebo Obojí).');
  }
  const country = parseCountry(values.country);
  if (!country) {
    errors.push(`Neznámá země „${values.country}“ (zadejte kód, např. CZ, DE, nebo český název).`);
  }
  const icoCheck = checkImportIco(values.ico, country || DEFAULT_COUNTRY);
  if (country && icoCheck.error) {
    errors.push(icoCheck.error);
  }
  if (errors.length > 0) {
    return { line, values, action: 'error', message: errors.join(' ') };
  }

  const ico = icoCheck.ico;
  const dic = values.dic ? normalizeVatId(values.dic, country) : '';
  const partner: Omit<Partner, 'id'> = {
    name: values.name,
    partnerType: partnerType as PartnerType,
    country,
    ico: ico || undefined,
    dic: dic || undefined,
    isVatPayer: !!dic,
    address: values.address || undefined,
    email: values.email || undefined,
    phone: values.phone || undefined,
    isActive: true
  };

  const ik = icoDupKey(ico, country);
  const nk = nameKey(values.name, country);
  if (ik && seenIco[ik]) {
    return { line, values, action: 'duplicate', message: `Stejné IČO ${seenIco[ik]}.`, partner };
  }
  if (!ik && nk && seenName[nk]) {
    return { line, values, action: 'duplicate', message: `Bez IČO a stejný název ${seenName[nk]}.`, partner };
  }
  if (ik) {
    seenIco[ik] = `jako řádek ${line}`;
  }
  if (nk && !seenName[nk]) {
    seenName[nk] = `jako řádek ${line}`;
  }

  const warnings: string[] = [];
  if (vatIdWarning(dic, country)) {
    warnings.push(`DIČ ${dic} nemá obvyklý tvar.`);
  }
  if (values.email && !looksLikeEmail(values.email)) {
    warnings.push(`E-mail „${values.email}“ nevypadá správně.`);
  }
  return { line, values, action: 'create', message: warnings.join(' '), partner };
}

/** Popisek akce pro náhled. */
export function partnerImportActionLabel(action: PartnerImportAction): string {
  return action === 'create' ? 'Založí se' : action === 'duplicate' ? 'Přeskočí se' : 'Chyba';
}
