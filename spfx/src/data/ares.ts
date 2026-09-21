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
