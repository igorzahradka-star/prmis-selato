/**
 * Načtení mapové knihovny Leaflet (BSD-2-Clause) a společné pomůcky pro mapy.
 *
 * Leaflet se načítá až při prvním zobrazení mapy (samostatný soubor), aby se
 * kvůli mapě nezpomalil start celé aplikace. Styl je vložený do aplikace, ne
 * stahovaný z internetu.
 *
 * Podkladové dlaždice: OpenStreetMap. Zdarma, bez klíče; podmínky vyžadují
 * uvedení zdroje (viz `MAP_ATTRIBUTION`) a nepředpokládají velký provoz —
 * na interní evidenci projektů firmy to stačí.
 */

import type * as LeafletTypes from 'leaflet';
import { LEAFLET_CSS } from './leafletCss';

export type LeafletLib = typeof LeafletTypes;

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const MAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';

/** Střed a přiblížení, když ještě není žádný špendlík — Česko. */
export const DEFAULT_CENTER: [number, number] = [49.8, 15.5];
export const DEFAULT_ZOOM = 7;

const STYLE_ID = 'prm-leaflet-css';

/** Vlastní styl bublin — Leaflet ho má ve výchozím stavu příliš drobný. */
const EXTRA_CSS = `
.prm-tooltip { padding: 8px 10px; border-radius: 4px; box-shadow: 0 2px 10px rgba(0,0,0,.25); white-space: normal; }
.prm-pin { background: none; border: none; }
.prm-pin svg { display: block; filter: drop-shadow(0 1px 2px rgba(0,0,0,.35)); }
.leaflet-container { font-family: inherit; }
`;

let loading: Promise<LeafletLib> | undefined;

/** Načte Leaflet (jednou) a vloží jeho styl do stránky. */
export function loadLeaflet(): Promise<LeafletLib> {
  if (!loading) {
    loading = import(/* webpackChunkName: 'leaflet' */ 'leaflet').then((mod) => {
      if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = LEAFLET_CSS + EXTRA_CSS;
        document.head.appendChild(style);
      }
      const lib = mod as unknown as LeafletLib & { default?: LeafletLib };
      return lib.default ?? lib;
    });
    // Neúspěch se nesmí zapamatovat — další otevření mapy to zkusí znovu.
    loading.catch(() => {
      loading = undefined;
    });
  }
  return loading;
}

/** Ikona špendlíku v dané barvě. */
export function pinIcon(L: LeafletLib, color: string): LeafletTypes.DivIcon {
  const svg =
    `<svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M14 1C6.8 1 1 6.8 1 13.9 1 23.6 14 37 14 37s13-13.4 13-23.1C27 6.8 21.2 1 14 1z" ` +
    `fill="${color}" stroke="#ffffff" stroke-width="2"/>` +
    `<circle cx="14" cy="14" r="4.5" fill="#ffffff"/></svg>`;
  return L.divIcon({
    className: 'prm-pin',
    html: svg,
    iconSize: [28, 38],
    iconAnchor: [14, 38],
    tooltipAnchor: [0, -34]
  });
}
