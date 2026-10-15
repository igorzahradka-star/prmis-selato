/**
 * Kontrola, že se poloha (zeměpisná šířka a délka) opravdu zapsala do SharePointu: po uložení se položka přečte zpět a porovná.
 * Když SharePoint hodnotu nepřijme (jiný typ sloupce, chybějící oprávnění…), uložení se nesmí tvářit jako úspěšné.
 */

import type { SPFI } from '@pnp/sp';

/** Do jaké míry se šířka a délka musí shodovat (6 desetinných míst = zhruba 0,1 m). */
const TOLERANCE = 0.00001;

/** Vrací větu o chybě, nebo `undefined`, když se poloha shoduje (nebo se žádná neukládala). */
export async function geoMismatch(sp: SPFI, listTitle: string, id: number, latitude: number | undefined, longitude: number | undefined): Promise<string | undefined> {
  if (latitude === undefined || longitude === undefined) {
    return undefined;
  }
  let item: { Latitude?: unknown; Longitude?: unknown };
  try {
    item = (await sp.web.lists.getByTitle(listTitle).items.getById(id).select('Latitude', 'Longitude')()) as { Latitude?: unknown; Longitude?: unknown };
  } catch {
    return undefined; // kontrola sama nesmí zastavit uložení
  }
  const lat = Number(item.Latitude);
  const lng = Number(item.Longitude);
  const ok = isFinite(lat) && isFinite(lng) && Math.abs(lat - latitude) <= TOLERANCE && Math.abs(lng - longitude) <= TOLERANCE;
  return ok
    ? undefined
    : `Poloha se do SharePointu nezapsala správně: odesláno ${latitude}, ${longitude}; v seznamu ${listTitle} je ${String(item.Latitude)}, ${String(item.Longitude)}. ` +
        'Zkontrolujte sloupce Latitude a Longitude (typ Číslo, 6 desetinných míst) a spusťte Instalaci a diagnostiku; pošlete mi prosím tuto hlášku.';
}
