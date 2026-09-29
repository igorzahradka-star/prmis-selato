/**
 * Hledání míst podle názvu (geokódování) přes Nominatim — vyhledávání nad daty
 * OpenStreetMap.
 *
 * Veřejná služba bez přihlášení a bez klíče, volá se přímo z prohlížeče
 * (`Access-Control-Allow-Origin: *`). Podmínky užití chtějí nejvýš jeden dotaz
 * za sekundu a žádné automatické našeptávání při psaní — proto se hledá
 * až na kliknutí, ne po každém písmenu.
 *
 * Není součástí `RepositorySet`: nezávislá veřejná služba, stejně jako ARES.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

/** Nalezené místo. */
export interface PlaceResult {
  /** Celý název včetně obce, okresu a státu — tak, jak ho vrací služba. */
  label: string;
  latitude: number;
  longitude: number;
}

interface NominatimItem {
  display_name?: string;
  lat?: string;
  lon?: string;
}

/**
 * Převede odpověď služby na místa. Položky bez použitelných souřadnic se
 * zahodí; souřadnice služba vrací jako text, ne jako čísla.
 */
export function mapNominatimResults(items: NominatimItem[]): PlaceResult[] {
  const places: PlaceResult[] = [];
  items.forEach((item) => {
    const latitude = parseFloat(item.lat ?? '');
    const longitude = parseFloat(item.lon ?? '');
    if (isNaN(latitude) || isNaN(longitude) || !item.display_name) {
      return;
    }
    places.push({ label: item.display_name, latitude, longitude });
  });
  return places;
}

/** Adresa dotazu — samostatná funkce kvůli testu, aby šlo ověřit kódování diakritiky. */
export function buildSearchUrl(query: string, limit: number = 6): string {
  return (
    `${NOMINATIM_URL}?format=jsonv2&limit=${limit}&accept-language=cs` +
    `&q=${encodeURIComponent(query.trim())}`
  );
}

/**
 * Najde místa podle textu. Při chybě vyhodí česky srozumitelnou zprávu — volající
 * (výběr lokality) ji může rovnou ukázat. Prázdný výsledek není chyba, vrací se `[]`.
 */
export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const text = (query || '').trim();
  if (text.length < 2) {
    return [];
  }

  let response: Response;
  try {
    response = await fetch(buildSearchUrl(text), { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error(
      'Nepodařilo se spojit s mapovou službou. Zkontrolujte připojení k internetu, nebo polohu zadejte klikem do mapy.'
    );
  }
  if (!response.ok) {
    throw new Error(
      `Mapová služba vrátila chybu (${response.status}). Zkuste to za chvíli, nebo polohu zadejte klikem do mapy.`
    );
  }
  return mapNominatimResults((await response.json()) as NominatimItem[]);
}
