/**
 * Vyhledání firmy v ARES (Administrativní registr ekonomických subjektů) podle IČO.
 *
 * Veřejné REST API Ministerstva financí ČR, bez přihlášení, dokumentace na
 * https://ares.gov.cz/swagger-ui/. Ověřeno 21. 9. 2026, že odpověď obsahuje
 * `Access-Control-Allow-Origin: *` — jde tedy volat přímo z prohlížeče,
 * žádný proxy server není potřeba.
 *
 * Není součástí `RepositorySet` — chování je stejné bez ohledu na zvolený
 * zdroj dat aplikace (mock/SharePoint), jde o nezávislou veřejnou službu.
 */

const ARES_URL = 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty';

/** To, co z odpovědi ARES aplikace skutečně používá — kontaktní osobu ARES nezná. */
export interface AresCompany {
  name: string;
  address?: string;
  dic?: string;
  isVatPayer: boolean;
}

interface AresErrorResponse {
  kod?: string;
  popis?: string;
}

interface AresSubjectResponse {
  obchodniJmeno?: string;
  dic?: string;
  sidlo?: { textovaAdresa?: string };
  /** Stav zdrojových registrů — `stavZdrojeDph` „AKTIVNI" = aktivní plátce DPH. */
  seznamRegistraci?: { stavZdrojeDph?: string };
}

/**
 * Najde firmu podle IČO. Při chybě vyhodí česky srozumitelnou zprávu —
 * volající (formulář partnera) ji může rovnou zobrazit uživateli.
 */
export async function lookupCompanyByIco(ico: string): Promise<AresCompany> {
  let response: Response;
  try {
    response = await fetch(`${ARES_URL}/${encodeURIComponent(ico)}`);
  } catch {
    throw new Error(
      'Nepodařilo se spojit s registrem ARES. Zkontrolujte připojení k internetu, nebo údaje doplňte ručně.'
    );
  }

  if (response.status === 404) {
    throw new Error(`Firma s IČO ${ico} nebyla v ARES nalezena. Zkontrolujte IČO, nebo údaje doplňte ručně.`);
  }
  if (!response.ok) {
    let detail = '';
    try {
      const body: AresErrorResponse = await response.json();
      detail = body.popis ? ` (${body.popis})` : '';
    } catch {
      // tělo chyby nemuselo přijít jako JSON — hláška bez detailu je pořád srozumitelná
    }
    throw new Error(
      `ARES vrátil neočekávanou chybu${detail}. Zkuste to prosím znovu, nebo údaje doplňte ručně.`
    );
  }

  const data: AresSubjectResponse = await response.json();
  return mapAresResponse(data);
}

/** Vytaženo ven ze `lookupCompanyByIco` kvůli testovatelnosti — samotné síťové volání testovat nejde. */
export function mapAresResponse(data: AresSubjectResponse): AresCompany {
  return {
    name: data.obchodniJmeno ?? '',
    address: data.sidlo?.textovaAdresa,
    dic: data.dic,
    isVatPayer: data.seznamRegistraci?.stavZdrojeDph === 'AKTIVNI'
  };
}

// --- obchodní rejstřík (spisová značka a osoby oprávněné jednat) ---------------------------------------------------

const ARES_VR_URL = 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty-vr';

/** Osoba z obchodního rejstříku oprávněná jednat za společnost. */
export interface AresRepresentative {
  /** Jméno včetně titulů („Ing. Jan Novák, Ph.D.“); u právnické osoby její název. */
  name: string;
  /** Funkce („Jednatel“, „Předseda představenstva“). */
  role: string;
  /** Právnická osoba (její zástupce se z rejstříku nepřebírá a doplní se ručně). */
  isLegalEntity: boolean;
}

export interface AresRegister {
  /** Spisová značka s názvem soudu, např. „C 57052 vedená u Krajského soudu v Hradci Králové“. */
  registration?: string;
  representatives: AresRepresentative[];
  /** Způsob jednání podle rejstříku (kdo a v jakých věcech zastupuje společnost). */
  actingRule?: string;
}

interface AresVrResponse {
  zaznamy?: {
    primarniZaznam?: boolean;
    spisovaZnacka?: { soud?: string; oddil?: string; vlozka?: number | string }[];
    statutarniOrgany?: {
      clenoveOrganu?: {
        datumVymazu?: string;
        clenstvi?: { funkce?: { nazev?: string; zanikFunkce?: string } };
        nazevAngazma?: string;
        fyzickaOsoba?: { jmeno?: string; prijmeni?: string; titulPredJmenem?: string; titulZaJmenem?: string };
        pravnickaOsoba?: { obchodniJmeno?: string };
      }[];
      zpusobJednani?: { hodnota?: string }[];
    }[];
  }[];
}

/** Soudy z číselníku ARES (kód → název v 6. pádě pro větu „vedená u …“). */
const COURTS: Record<string, string> = {
  MSPH: 'Městského soudu v Praze',
  KSPH: 'Krajského soudu v Praze',
  KSCB: 'Krajského soudu v Českých Budějovicích',
  KSPL: 'Krajského soudu v Plzni',
  KSUL: 'Krajského soudu v Ústí nad Labem',
  KSHK: 'Krajského soudu v Hradci Králové',
  KSBR: 'Krajského soudu v Brně',
  KSOS: 'Krajského soudu v Ostravě'
};

/** „PŘEVRÁTIL“ → „Převrátil“, „JAN-KAREL“ → „Jan-Karel“ (ARES vrací jména velkými písmeny). */
export function capitalizeName(s: string): string {
  return s
    .toLocaleLowerCase('cs-CZ')
    .replace(/(^|[\s-])(\S)/g, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase('cs-CZ'));
}

/** Vytaženo ven kvůli testovatelnosti. */
export function mapAresRegister(data: AresVrResponse): AresRegister {
  const records = data.zaznamy ?? [];
  const rec = records.filter((r) => r.primarniZaznam)[0] ?? records[0];
  if (!rec) {
    return { representatives: [] };
  }
  const sz = (rec.spisovaZnacka ?? [])[0];
  const registration =
    sz && sz.oddil && sz.vlozka !== undefined
      ? `${sz.oddil} ${sz.vlozka}${sz.soud ? ` vedená u ${COURTS[sz.soud] ?? sz.soud}` : ''}`
      : undefined;
  const representatives: AresRepresentative[] = [];
  let actingRule: string | undefined;
  (rec.statutarniOrgany ?? []).forEach((organ) => {
    if (!actingRule && organ.zpusobJednani && organ.zpusobJednani[0] && organ.zpusobJednani[0].hodnota) {
      actingRule = organ.zpusobJednani[0].hodnota.replace(/\s+\n/g, '\n').trim();
    }
    (organ.clenoveOrganu ?? []).forEach((m) => {
      if (m.datumVymazu || (m.clenstvi && m.clenstvi.funkce && m.clenstvi.funkce.zanikFunkce)) {
        return; // už není členem
      }
      const role = (m.clenstvi && m.clenstvi.funkce && m.clenstvi.funkce.nazev) || m.nazevAngazma || 'Člen statutárního orgánu';
      if (m.fyzickaOsoba) {
        const f = m.fyzickaOsoba;
        const core = [f.jmeno ? capitalizeName(f.jmeno) : '', f.prijmeni ? capitalizeName(f.prijmeni) : ''].filter((x) => x !== '').join(' ');
        const name = [f.titulPredJmenem, core].filter((x) => !!x).join(' ') + (f.titulZaJmenem ? `, ${f.titulZaJmenem}` : '');
        representatives.push({ name, role, isLegalEntity: false });
      } else if (m.pravnickaOsoba && m.pravnickaOsoba.obchodniJmeno) {
        representatives.push({ name: m.pravnickaOsoba.obchodniJmeno, role, isLegalEntity: true });
      }
    });
  });
  return { registration, representatives, actingRule };
}

/** Spisová značka a osoby oprávněné jednat z obchodního rejstříku podle IČO. Společnost, která v rejstříku není (OSVČ…), vrací prázdný výsledek. */
export async function lookupRegisterByIco(ico: string): Promise<AresRegister> {
  let response: Response;
  try {
    response = await fetch(`${ARES_VR_URL}/${encodeURIComponent(ico)}`);
  } catch {
    throw new Error('Nepodařilo se spojit s registrem ARES. Zkontrolujte připojení k internetu, nebo údaje doplňte ručně.');
  }
  if (response.status === 404) {
    return { representatives: [] };
  }
  if (!response.ok) {
    throw new Error('ARES vrátil neočekávanou chybu při čtení obchodního rejstříku. Zkuste to znovu, nebo údaje doplňte ručně.');
  }
  return mapAresRegister((await response.json()) as AresVrResponse);
}
