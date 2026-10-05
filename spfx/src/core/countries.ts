/**
 * Země partnerů a kontrola zahraničního DIČ — čistá logika.
 *
 * Členské státy EU (s kontrolou tvaru DIČ) a nejčastější země mimo EU (bez kontroly DIČ — tvary čísel se liší
 * a dodavatelé např. z Číny, USA nebo Tchaj-wanu mají vlastní systémy). Partner bez vyplněné země je český (tak vznikli
 * partneři před zavedením tohoto sloupce).
 *
 * Formát DIČ se kontroluje jen jako **upozornění**, ne jako zákaz uložení:
 * číselné řady států se mění a jedna nepřesná kontrola by zablokovala zápis
 * dodavatele, kterého firma opravdu potřebuje.
 */

export interface Country {
  /** Dvoupísmenný kód ISO 3166 — ukládá se do seznamu. */
  code: string;
  name: string;
  /** Předpona DIČ. Liší se od ISO jen u Řecka (`EL`); u zemí mimo EU je prázdná. */
  vatPrefix: string;
  /** Tvar DIČ **včetně** předpony (jen země EU — u ostatních se tvar nekontroluje). */
  vatPattern?: RegExp;
  /** Ukázka DIČ pro nápovědu ve formuláři (jen země EU). */
  vatExample?: string;
}

/** Země s kontrolou DIČ (členské státy EU). */
export interface EuCountry extends Country {
  vatPattern: RegExp;
  vatExample: string;
}

export const DEFAULT_COUNTRY = 'CZ';

/** Členské státy EU, česky seřazené podle názvu. */
export const EU_COUNTRIES: EuCountry[] = [
  { code: 'BE', name: 'Belgie', vatPrefix: 'BE', vatPattern: /^BE[01]\d{9}$/, vatExample: 'BE0123456789' },
  { code: 'BG', name: 'Bulharsko', vatPrefix: 'BG', vatPattern: /^BG\d{9,10}$/, vatExample: 'BG123456789' },
  { code: 'CY', name: 'Kypr', vatPrefix: 'CY', vatPattern: /^CY\d{8}[A-Z]$/, vatExample: 'CY12345678X' },
  { code: 'CZ', name: 'Česko', vatPrefix: 'CZ', vatPattern: /^CZ\d{8,10}$/, vatExample: 'CZ12345678' },
  { code: 'DK', name: 'Dánsko', vatPrefix: 'DK', vatPattern: /^DK\d{8}$/, vatExample: 'DK12345678' },
  { code: 'EE', name: 'Estonsko', vatPrefix: 'EE', vatPattern: /^EE\d{9}$/, vatExample: 'EE123456789' },
  { code: 'FI', name: 'Finsko', vatPrefix: 'FI', vatPattern: /^FI\d{8}$/, vatExample: 'FI12345678' },
  { code: 'FR', name: 'Francie', vatPrefix: 'FR', vatPattern: /^FR[A-Z0-9]{2}\d{9}$/, vatExample: 'FR12345678901' },
  { code: 'HR', name: 'Chorvatsko', vatPrefix: 'HR', vatPattern: /^HR\d{11}$/, vatExample: 'HR12345678901' },
  { code: 'IE', name: 'Irsko', vatPrefix: 'IE', vatPattern: /^IE\d[A-Z0-9+*]\d{5}[A-Z]{1,2}$/, vatExample: 'IE1234567T' },
  { code: 'IT', name: 'Itálie', vatPrefix: 'IT', vatPattern: /^IT\d{11}$/, vatExample: 'IT12345678901' },
  { code: 'LT', name: 'Litva', vatPrefix: 'LT', vatPattern: /^LT(\d{9}|\d{12})$/, vatExample: 'LT123456789' },
  { code: 'LV', name: 'Lotyšsko', vatPrefix: 'LV', vatPattern: /^LV\d{11}$/, vatExample: 'LV12345678901' },
  { code: 'LU', name: 'Lucembursko', vatPrefix: 'LU', vatPattern: /^LU\d{8}$/, vatExample: 'LU12345678' },
  { code: 'HU', name: 'Maďarsko', vatPrefix: 'HU', vatPattern: /^HU\d{8}$/, vatExample: 'HU12345678' },
  { code: 'MT', name: 'Malta', vatPrefix: 'MT', vatPattern: /^MT\d{8}$/, vatExample: 'MT12345678' },
  { code: 'DE', name: 'Německo', vatPrefix: 'DE', vatPattern: /^DE\d{9}$/, vatExample: 'DE123456789' },
  { code: 'NL', name: 'Nizozemsko', vatPrefix: 'NL', vatPattern: /^NL\d{9}B\d{2}$/, vatExample: 'NL123456789B01' },
  { code: 'PL', name: 'Polsko', vatPrefix: 'PL', vatPattern: /^PL\d{10}$/, vatExample: 'PL1234567890' },
  { code: 'PT', name: 'Portugalsko', vatPrefix: 'PT', vatPattern: /^PT\d{9}$/, vatExample: 'PT123456789' },
  { code: 'AT', name: 'Rakousko', vatPrefix: 'AT', vatPattern: /^ATU\d{8}$/, vatExample: 'ATU12345678' },
  { code: 'RO', name: 'Rumunsko', vatPrefix: 'RO', vatPattern: /^RO\d{2,10}$/, vatExample: 'RO1234567890' },
  { code: 'GR', name: 'Řecko', vatPrefix: 'EL', vatPattern: /^EL\d{9}$/, vatExample: 'EL123456789' },
  { code: 'SK', name: 'Slovensko', vatPrefix: 'SK', vatPattern: /^SK\d{10}$/, vatExample: 'SK2020317068' },
  { code: 'SI', name: 'Slovinsko', vatPrefix: 'SI', vatPattern: /^SI\d{8}$/, vatExample: 'SI12345678' },
  { code: 'ES', name: 'Španělsko', vatPrefix: 'ES', vatPattern: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/, vatExample: 'ESX1234567X' },
  { code: 'SE', name: 'Švédsko', vatPrefix: 'SE', vatPattern: /^SE\d{12}$/, vatExample: 'SE123456789012' }
];

const other = (code: string, name: string): Country => ({ code, name, vatPrefix: '' });

/** Nejčastější země mimo EU, česky seřazené podle názvu. DIČ / VAT ID se u nich nekontroluje. */
export const OTHER_COUNTRIES: Country[] = [
  other('AL', 'Albánie'),
  other('AR', 'Argentina'),
  other('AM', 'Arménie'),
  other('AU', 'Austrálie'),
  other('AZ', 'Ázerbájdžán'),
  other('BD', 'Bangladéš'),
  other('BY', 'Bělorusko'),
  other('BA', 'Bosna a Hercegovina'),
  other('BR', 'Brazílie'),
  other('CL', 'Chile'),
  other('CN', 'Čína'),
  other('ME', 'Černá Hora'),
  other('PH', 'Filipíny'),
  other('GE', 'Gruzie'),
  other('HK', 'Hongkong'),
  other('ID', 'Indonésie'),
  other('IN', 'Indie'),
  other('IS', 'Island'),
  other('IL', 'Izrael'),
  other('JP', 'Japonsko'),
  other('ZA', 'Jižní Afrika'),
  other('KR', 'Jižní Korea'),
  other('CA', 'Kanada'),
  other('KZ', 'Kazachstán'),
  other('CO', 'Kolumbie'),
  other('QA', 'Katar'),
  other('LI', 'Lichtenštejnsko'),
  other('MY', 'Malajsie'),
  other('MA', 'Maroko'),
  other('MX', 'Mexiko'),
  other('MD', 'Moldavsko'),
  other('EG', 'Egypt'),
  other('NZ', 'Nový Zéland'),
  other('NO', 'Norsko'),
  other('PK', 'Pákistán'),
  other('RU', 'Rusko'),
  other('AE', 'Spojené arabské emiráty'),
  other('SA', 'Saúdská Arábie'),
  other('SG', 'Singapur'),
  other('MK', 'Severní Makedonie'),
  other('RS', 'Srbsko'),
  other('TW', 'Tchaj-wan'),
  other('TH', 'Thajsko'),
  other('TR', 'Turecko'),
  other('UA', 'Ukrajina'),
  other('US', 'USA'),
  other('GB', 'Velká Británie'),
  other('VN', 'Vietnam'),
  other('CH', 'Švýcarsko')
].sort((a, b) => a.name.localeCompare(b.name, 'cs-CZ'));

/** Všechny nabízené země: nejdřív EU, pak ostatní. */
export const ALL_COUNTRIES: Country[] = [...EU_COUNTRIES, ...OTHER_COUNTRIES];

/** Země podle kódu; prázdný kód znamená Česko. Neznámý kód vrátí `undefined`. */
export function findCountry(code: string | undefined): Country | undefined {
  const wanted = (code || DEFAULT_COUNTRY).trim().toUpperCase();
  return ALL_COUNTRIES.filter((c) => c.code === wanted)[0];
}

/** Název země pro zobrazení. Neznámý kód se ukáže tak, jak je — lepší než prázdno. */
export function countryName(code: string | undefined): string {
  const found = findCountry(code);
  return found ? found.name : (code || '').trim().toUpperCase();
}

/** Je partner z Česka? Prázdná země = ano (starší záznamy). */
export function isDomestic(code: string | undefined): boolean {
  return (code || DEFAULT_COUNTRY).trim().toUpperCase() === DEFAULT_COUNTRY;
}

/**
 * Uklidí zapsané DIČ: velká písmena, bez mezer, teček a pomlček, s předponou
 * země. Člověk napíše `sk 2020 317 068` nebo jen `2020317068` a v seznamu
 * má být stejné `SK2020317068`.
 */
export function normalizeVatId(raw: string, countryCode: string | undefined): string {
  const cleaned = (raw || '').replace(/[\s.\-/]/g, '').toUpperCase();
  const country = findCountry(countryCode);
  if (!cleaned || !country || !country.vatPrefix) {
    return cleaned;
  }
  return cleaned.indexOf(country.vatPrefix) === 0 ? cleaned : country.vatPrefix + cleaned;
}

/**
 * Upozornění k DIČ, nebo `undefined`, když vypadá v pořádku (nebo je prázdné).
 * Nikdy nebrání uložení — viz hlavička souboru.
 */
export function vatIdWarning(raw: string | undefined, countryCode: string | undefined): string | undefined {
  const country = findCountry(countryCode);
  if (!raw || !raw.trim() || !country || !country.vatPattern) {
    return undefined;
  }
  const normalized = normalizeVatId(raw, countryCode);
  if (country.vatPattern.test(normalized)) {
    return undefined;
  }
  return `DIČ pro ${country.name} má mít tvar jako ${country.vatExample}. Zkontrolujte ho, nebo ho nechte, pokud jste si jistí.`;
}
