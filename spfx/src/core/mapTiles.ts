/**
 * Výpočet dlaždic mapy (OpenStreetMap, „slippy map“) pro statický výřez s polohou — čistá matematika bez DOM.
 * Používá se pro mapu v Project overview: z dlaždic kolem bodu se na canvasu složí obrázek.
 */

export const TILE_SIZE = 256;

export interface TilePosition {
  /** Číslo dlaždice (celé) a poloha bodu uvnitř mřížky v pixelech. */
  x: number;
  y: number;
  px: number;
  py: number;
}

/** Souřadnice bodu na mapě zoomu `zoom` v pixelech od levého horního rohu celého světa. */
export function worldPixel(latitude: number, longitude: number, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const lat = Math.max(-85.0511, Math.min(85.0511, latitude));
  const x = ((longitude + 180) / 360) * scale;
  const rad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale;
  return { x, y };
}

export interface MapView {
  zoom: number;
  /** Dlaždice k načtení: souřadnice dlaždice a umístění v obrázku (pixely). */
  tiles: { tx: number; ty: number; left: number; top: number }[];
  /** Poloha bodu v obrázku (pixely). */
  marker: { x: number; y: number };
  width: number;
  height: number;
}

/**
 * Výřez mapy `width × height` pixelů se středem v bodě. Dlaždice mimo svět (přes okraj) se vynechají.
 */
export function mapView(latitude: number, longitude: number, zoom: number, width: number, height: number): MapView {
  const c = worldPixel(latitude, longitude, zoom);
  const left = c.x - width / 2;
  const top = c.y - height / 2;
  const n = Math.pow(2, zoom);
  const tiles: MapView['tiles'] = [];
  for (let ty = Math.floor(top / TILE_SIZE); ty <= Math.floor((top + height) / TILE_SIZE); ty++) {
    for (let tx = Math.floor(left / TILE_SIZE); tx <= Math.floor((left + width) / TILE_SIZE); tx++) {
      if (ty < 0 || ty >= n) {
        continue;
      }
      tiles.push({ tx: ((tx % n) + n) % n, ty, left: Math.round(tx * TILE_SIZE - left), top: Math.round(ty * TILE_SIZE - top) });
    }
  }
  return { zoom, tiles, marker: { x: width / 2, y: height / 2 }, width, height };
}
