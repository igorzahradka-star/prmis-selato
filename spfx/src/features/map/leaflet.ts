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

/** Pod tímto klíčem si prohlížeč pamatuje zvolený podklad mapy. */
const BASE_LAYER_KEY = 'prm-map-base';

/**
 * Podkladová mapa: výchozí **šedá** (stejné dlaždice OpenStreetMap bez barev), aby barevné špendlíky — zelené zvlášť —
 * nesplývaly s lesy a poli; druhá volba je původní barevná. Volba se pamatuje v prohlížeči.
 */
export function addBaseLayers(L: LeafletLib, map: LeafletTypes.Map): void {
  const options = { maxZoom: 19, attribution: MAP_ATTRIBUTION };
  const gray = L.tileLayer(TILE_URL, { ...options, className: 'prm-tiles-gray' });
  const color = L.tileLayer(TILE_URL, options);
  let useColor = false;
  try {
    useColor = window.localStorage.getItem(BASE_LAYER_KEY) === 'color';
  } catch {
    // Úložiště nemusí být dostupné (soukromé okno) — platí výchozí šedá.
  }
  (useColor ? color : gray).addTo(map);
  L.control.layers({ 'Šedá (kontrastní)': gray, Barevná: color }, undefined, { collapsed: false, position: 'bottomright' }).addTo(map);
  map.on('baselayerchange', (e: LeafletTypes.LayersControlEvent) => {
    try {
      window.localStorage.setItem(BASE_LAYER_KEY, e.layer === color ? 'color' : 'gray');
    } catch {
      // Bez úložiště se volba jen nezapamatuje.
    }
  });
}

/**
 * Posouvání mapy tažením myší nebo prstem přes **pointer události** (s „zachycením“ ukazatele), místo staršího mechanismu Leafletu
 * (mousedown/mousemove na dokumentu), který na některých počítačích — notebooky s dotykovou obrazovkou, SharePoint v režimu
 * „celé okno“ — tažení nepřijímá. Kliknutí bez tažení zavolá `onTap` (přesun špendlíku); po tažení se následné kliknutí potlačí,
 * aby se špendlík nepřesunul. Vrací funkci, která vlastní posouvání zase odpojí.
 */
export function enablePointerPan(map: LeafletTypes.Map, options: { onTap?: (latitude: number, longitude: number) => void } = {}): () => void {
  const el = map.getContainer();
  map.dragging.disable();
  el.style.touchAction = 'none';
  el.style.cursor = 'grab';
  let gesture: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | undefined;
  let suppressClick = false;
  const onControl = (t: EventTarget | null): boolean => {
    const node = t as HTMLElement | null;
    return !!(node && node.closest && node.closest('.leaflet-control, .leaflet-marker-icon, .leaflet-popup'));
  };
  const onDown = (e: PointerEvent): void => {
    if (e.button !== 0 || !e.isPrimary || onControl(e.target)) {
      return;
    }
    gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Bez zachycení ukazatele se tažení mimo mapu nesleduje — posouvání dál funguje uvnitř mapy.
    }
  };
  const onMove = (e: PointerEvent): void => {
    if (!gesture || e.pointerId !== gesture.id) {
      return;
    }
    if (!gesture.moved && Math.abs(e.clientX - gesture.startX) + Math.abs(e.clientY - gesture.startY) < 4) {
      return;
    }
    gesture.moved = true;
    el.style.cursor = 'grabbing';
    map.panBy([gesture.x - e.clientX, gesture.y - e.clientY], { animate: false });
    gesture.x = e.clientX;
    gesture.y = e.clientY;
  };
  const onUp = (e: PointerEvent): void => {
    if (!gesture || e.pointerId !== gesture.id) {
      return;
    }
    const g = gesture;
    gesture = undefined;
    el.style.cursor = 'grab';
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      // Ukazatel už byl uvolněn.
    }
    if (g.moved) {
      suppressClick = true;
      window.setTimeout(() => {
        suppressClick = false;
      }, 0);
    } else if (options.onTap && e.type === 'pointerup') {
      const rect = el.getBoundingClientRect();
      const ll = map.containerPointToLatLng([e.clientX - rect.left, e.clientY - rect.top]);
      options.onTap(ll.lat, ll.lng);
    }
  };
  const onClick = (e: MouseEvent): void => {
    if (suppressClick) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('click', onClick, true);
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    el.removeEventListener('click', onClick, true);
  };
}

/** Střed a přiblížení, když ještě není žádný špendlík — Česko. */
export const DEFAULT_CENTER: [number, number] = [49.8, 15.5];
export const DEFAULT_ZOOM = 7;

const STYLE_ID = 'prm-leaflet-css';

/** Vlastní styl bublin — Leaflet ho má ve výchozím stavu příliš drobný. */
const EXTRA_CSS = `
.prm-tooltip { padding: 8px 10px; border-radius: 4px; box-shadow: 0 2px 10px rgba(0,0,0,.25); white-space: normal; }
.prm-pin { background: none; border: none; }
.prm-pin svg { display: block; filter: drop-shadow(0 1px 2px rgba(0,0,0,.35)); }
.prm-cluster { background: none; border: none; }
.prm-cluster div { width: 42px; height: 42px; border-radius: 50%; background: #0B3A6B; color: #fff; border: 3px solid rgba(255,255,255,.95); box-shadow: 0 1px 6px rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px; cursor: pointer; }
.prm-cluster:hover div { background: #0268A6; }
.leaflet-container { font-family: inherit; }
.prm-tiles-gray { filter: grayscale(1) contrast(0.88) brightness(1.1); }
.leaflet-control-layers-expanded { font-size: 12px; }
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

/** Ikona skupiny špendlíků: kruh s počtem projektů (klik = přiblížit, nebo seznam, když leží na jednom místě). */
export function clusterIcon(L: LeafletLib, count: number): LeafletTypes.DivIcon {
  return L.divIcon({
    className: 'prm-cluster',
    html: `<div>${count}</div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    tooltipAnchor: [0, -22]
  });
}

/** Ikona špendlíku: výplň, obrys a barva tečky uprostřed (světlé špendlíky potřebují tmavý obrys i tečku). */
export function pinIcon(
  L: LeafletLib,
  fill: string,
  stroke: string,
  dot: string,
  offsetX: number = 0
): LeafletTypes.DivIcon {
  const svg =
    `<svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M14 1C6.8 1 1 6.8 1 13.9 1 23.6 14 37 14 37s13-13.4 13-23.1C27 6.8 21.2 1 14 1z" ` +
    `fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>` +
    `<circle cx="14" cy="14" r="4.5" fill="${dot}"/></svg>`;
  return L.divIcon({
    className: 'prm-pin',
    html: svg,
    iconSize: [28, 38],
    // Vodorovný posun (v pixelech, při přiblížení se nemění) rozestupuje špendlíky na stejném místě.
    iconAnchor: [14 - offsetX, 38],
    tooltipAnchor: [offsetX, -34]
  });
}
