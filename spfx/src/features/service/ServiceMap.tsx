/**
 * Mapa Servisu: lokality jako špendlíky, po oddálení slučované do skupin; po přiblížení se skupina rozdělí
 * a u lokality se ukážou její soubory (FVE, BESS…). Barva špendlíku ukazuje stav (viz `serviceSignal`).
 *
 * Využívá stejnou mapovou knihovnu a podklad jako Mapa projektů (`features/map/leaflet.ts`).
 */

import * as React from 'react';
import type * as LeafletTypes from 'leaflet';
import { ActionButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';

import { RES } from '../../ui/theme';
import { clusterPoints, escapeHtml, sameLocation } from '../../core/geo';
import { ServiceDevice, ServiceSite, contractState } from '../../core/service';
import { JobStatus, RequestStatus, ServiceJob, ServiceRequest } from '../../core/serviceJobs';
import {
  SERVICE_DEVICE_ZOOM,
  SERVICE_SIGNAL_LABELS,
  ServiceSignal,
  deviceCoordinates,
  deviceOffsetsPx,
  missingLocations,
  serviceSignal,
  siteCoordinates
} from '../../core/serviceMap';
import { DEFAULT_CENTER, DEFAULT_ZOOM, LeafletLib, addBaseLayers, clusterIcon, loadLeaflet, pinIcon } from '../map/leaflet';

const SIGNAL_STYLE: Record<ServiceSignal, { fill: string; stroke: string }> = {
  green: { fill: '#2E9E5B', stroke: '#1B6B3A' },
  amber: { fill: '#F2A900', stroke: '#9A6B00' },
  red: { fill: '#C4314B', stroke: '#7E1C2E' }
};

export interface ServiceMapProps {
  sites: ServiceSite[];
  devices: ServiceDevice[];
  requests: ServiceRequest[];
  jobs: ServiceJob[];
  /** Smí uživatel upravovat lokality a soubory? */
  mayAdmin: boolean;
  mayWork: boolean;
  onNewRequest: (siteNumber: string) => void;
  onEditSite: (site: ServiceSite) => void;
  onEditDevice: (site: ServiceSite, device: ServiceDevice) => void;
}

interface Selection {
  siteNumber: string;
  deviceNumber?: string;
}

export const ServiceMap: React.FC<ServiceMapProps> = ({ sites, devices, requests, jobs, mayAdmin, mayWork, onNewRequest, onEditSite, onEditDevice }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<LeafletTypes.Map | undefined>(undefined);
  const layerRef = React.useRef<LeafletTypes.LayerGroup | undefined>(undefined);
  const libRef = React.useRef<LeafletLib | undefined>(undefined);
  const fittedRef = React.useRef(false);
  const [mapReady, setMapReady] = React.useState(false);
  const [mapError, setMapError] = React.useState<string | undefined>(undefined);
  const [selected, setSelected] = React.useState<Selection | undefined>(undefined);

  const activeSites = React.useMemo(() => sites.filter((s) => s.isActive), [sites]);
  const missing = React.useMemo(() => missingLocations(sites, devices), [sites, devices]);

  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return undefined;
    }
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current) {
          return;
        }
        libRef.current = L;
        const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
        addBaseLayers(L, map);
        layerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setMapReady(true);
        window.setTimeout(() => map.invalidateSize(), 350);
      })
      .catch(() => {
        if (!cancelled) {
          setMapError('Mapu se nepodařilo načíst. Zkontrolujte připojení k internetu a obnovte stránku.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(
    () => () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = undefined;
        layerRef.current = undefined;
      }
    },
    []
  );

  // Špendlíky — překreslí se při změně dat i při každém přiblížení.
  React.useEffect(() => {
    const L = libRef.current;
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!mapReady || !L || !layer || !map) {
      return undefined;
    }
    const today = new Date();
    const siteByNumber: Record<string, ServiceSite> = {};
    activeSites.forEach((s) => {
      siteByNumber[s.number] = s;
    });

    const siteTooltip = (s: ServiceSite): string => {
      const openReq = requests.filter((r) => r.siteNumber === s.number && (r.status === RequestStatus.Prijato || r.status === RequestStatus.Zpracovava)).length;
      const openJobs = jobs.filter((j) => j.siteNumber === s.number && j.status !== JobStatus.Uzavreno && j.status !== JobStatus.Zruseno).length;
      const count = devices.filter((d) => d.siteNumber === s.number && d.isActive).length;
      return `<div style="font-size:13px"><strong>${escapeHtml(`${s.number} ${s.name}`)}</strong><br/>${escapeHtml(s.customerName || '')}<br/>Soubory: ${count} · otevřené požadavky: ${openReq} · otevřené listy: ${openJobs}</div>`;
    };
    const deviceTooltip = (d: ServiceDevice, s: ServiceSite): string => {
      const cs = contractState(d, today);
      const contract = cs === 'platna' ? 'smlouva platí' : cs === 'konci' ? 'smlouva brzy končí' : cs === 'vyprsela' ? 'smlouva vypršela' : 'bez smlouvy';
      return `<div style="font-size:13px"><strong>${escapeHtml(`${d.number} ${d.name}`)}</strong><br/>${escapeHtml(`${d.kind} · ${s.number} ${s.name}`)}<br/>${escapeHtml(contract)}</div>`;
    };

    const render = (): void => {
      layer.clearLayers();
      const zoom = map.getZoom();
      const showDevices = zoom >= SERVICE_DEVICE_ZOOM;

      if (showDevices) {
        activeSites.forEach((s) => {
          const siteDevices = devices.filter((d) => d.siteNumber === s.number && d.isActive);
          const shared = siteDevices.filter((d) => !deviceCoordinates(d, { latitude: undefined, longitude: undefined }));
          const offsets = deviceOffsetsPx(shared.length);
          if (siteDevices.length === 0) {
            const c = siteCoordinates(s);
            if (c) {
              const st = SIGNAL_STYLE[serviceSignal(s.number, devices, requests, jobs, undefined, today)];
              const m = L.marker([c.latitude, c.longitude], { icon: pinIcon(L, st.fill, st.stroke, '#fff'), title: s.number, keyboard: true });
              m.bindTooltip(siteTooltip(s), { className: 'prm-tooltip', direction: 'top', opacity: 1 });
              m.on('click', () => setSelected({ siteNumber: s.number }));
              m.addTo(layer);
            }
            return;
          }
          siteDevices.forEach((d) => {
            const c = deviceCoordinates(d, s);
            if (!c) {
              return;
            }
            const ownPosition = !!deviceCoordinates(d, { latitude: undefined, longitude: undefined });
            const idx = shared.indexOf(d);
            const st = SIGNAL_STYLE[serviceSignal(s.number, devices, requests, jobs, d.number, today)];
            const m = L.marker([c.latitude, c.longitude], { icon: pinIcon(L, st.fill, st.stroke, '#fff', ownPosition ? 0 : offsets[idx]), title: d.number, keyboard: true });
            m.bindTooltip(deviceTooltip(d, s), { className: 'prm-tooltip', direction: 'top', opacity: 1 });
            m.on('click', () => setSelected({ siteNumber: s.number, deviceNumber: d.number }));
            m.addTo(layer);
          });
        });
        return;
      }

      const pixels = activeSites
        .map((s) => {
          const c = siteCoordinates(s);
          if (!c) {
            return undefined;
          }
          const px = map.project([c.latitude, c.longitude], zoom);
          return { id: s.number, x: px.x, y: px.y };
        })
        .filter((x): x is { id: string; x: number; y: number } => !!x);

      clusterPoints(pixels, 44).forEach((cluster) => {
        const members = cluster.ids.map((n) => siteByNumber[n]);
        const coords = members.map((s) => siteCoordinates(s)).filter((c): c is NonNullable<typeof c> => !!c);
        if (coords.length === 0) {
          return;
        }
        if (members.length === 1) {
          const s = members[0];
          const c = coords[0];
          const st = SIGNAL_STYLE[serviceSignal(s.number, devices, requests, jobs, undefined, today)];
          const m = L.marker([c.latitude, c.longitude], { icon: pinIcon(L, st.fill, st.stroke, '#fff'), riseOnHover: true, title: s.number, keyboard: true });
          m.bindTooltip(siteTooltip(s), { className: 'prm-tooltip', direction: 'top', opacity: 1 });
          m.on('click', () => setSelected({ siteNumber: s.number }));
          m.addTo(layer);
          return;
        }
        const lat = coords.reduce((sum, c) => sum + c.latitude, 0) / coords.length;
        const lng = coords.reduce((sum, c) => sum + c.longitude, 0) / coords.length;
        const m = L.marker([lat, lng], { icon: clusterIcon(L, members.length), riseOnHover: true, title: `${members.length} lokalit`, keyboard: true });
        m.bindTooltip(`<div style="font-size:13px">${members.map((s) => escapeHtml(`${s.number} ${s.name}`)).join('<br/>')}</div>`, { className: 'prm-tooltip', direction: 'top', opacity: 1 });
        m.on('click', () => {
          const unsplittable = sameLocation(coords) || zoom >= (map.getMaxZoom() || 19);
          if (unsplittable) {
            map.setView([lat, lng], Math.min(SERVICE_DEVICE_ZOOM, map.getMaxZoom() || 19));
          } else {
            map.fitBounds(L.latLngBounds(coords.map((c): [number, number] => [c.latitude, c.longitude])).pad(0.3), { maxZoom: 18 });
          }
        });
        m.addTo(layer);
      });
    };

    render();
    map.on('zoomend', render);

    if (!fittedRef.current) {
      const points: [number, number][] = [];
      activeSites.forEach((s) => {
        const c = siteCoordinates(s);
        if (c) {
          points.push([c.latitude, c.longitude]);
        }
      });
      if (points.length > 0) {
        map.fitBounds(L.latLngBounds(points).pad(0.25), { maxZoom: 11, animate: false });
        fittedRef.current = true;
      }
    }
    return () => {
      map.off('zoomend', render);
    };
  }, [mapReady, activeSites, devices, requests, jobs]);

  const selSite = selected ? sites.filter((s) => s.number === selected.siteNumber)[0] : undefined;
  const selDevice = selected && selected.deviceNumber ? devices.filter((d) => d.number === selected.deviceNumber)[0] : undefined;
  const hasAnyLocation = activeSites.some((s) => !!siteCoordinates(s));

  return (
    <div style={{ marginTop: 10 }}>
      {mapError && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {mapError}
        </MessageBar>
      )}
      <div style={{ position: 'relative' }}>
        <div ref={containerRef} style={{ height: '58vh', minHeight: 340, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, background: RES.background }} aria-label="Mapa Servisu" />
        <div
          style={{ position: 'absolute', left: 10, bottom: 28, zIndex: 1000, background: 'rgba(255,255,255,0.94)', border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '6px 10px', fontSize: 12, boxShadow: '0 1px 6px rgba(0,0,0,.2)' }}
          role="group"
          aria-label="Legenda mapy Servisu"
        >
          {(['green', 'amber', 'red'] as ServiceSignal[]).map((k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '1px 0' }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: SIGNAL_STYLE[k].fill, border: `1.5px solid ${SIGNAL_STYLE[k].stroke}`, display: 'inline-block' }} />
              {SERVICE_SIGNAL_LABELS[k]}
            </div>
          ))}
          <div style={{ color: RES.gray, marginTop: 4 }}>Přiblížením se skupiny rozdělí a ukážou se soubory.</div>
        </div>
      </div>

      {!hasAnyLocation && (
        <MessageBar messageBarType={MessageBarType.info} isMultiline styles={{ root: { marginTop: 10 } }}>
          Žádná lokalita zatím nemá zadanou polohu. Polohu nastavíte v úpravě lokality (Adresa → „Najít na mapě“).
        </MessageBar>
      )}
      {missing.sites.length > 0 && hasAnyLocation && (
        <MessageBar messageBarType={MessageBarType.warning} isMultiline styles={{ root: { marginTop: 10 } }}>
          Bez polohy (na mapě nejsou): {missing.sites.map((s) => `${s.number} ${s.name}`).join(', ')}.
        </MessageBar>
      )}

      {selSite && (
        <div style={{ marginTop: 10, background: RES.white, border: `1px solid ${RES.grayBlue}`, borderLeft: `4px solid ${RES.blue}`, borderRadius: 4, padding: '8px 12px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong>{selDevice ? `${selDevice.number} ${selDevice.name} (${selDevice.kind})` : `${selSite.number} ${selSite.name}`}</strong>
            <span style={{ color: RES.gray, fontSize: 13 }}>{selDevice ? `lokalita ${selSite.number} ${selSite.name}` : [selSite.customerName, selSite.address].filter((x) => !!x).join(' · ')}</span>
            <span style={{ flex: '1 1 auto' }} />
            {mayWork && <ActionButton iconProps={{ iconName: 'Add' }} text="Nový požadavek" onClick={() => onNewRequest(selSite.number)} />}
            {mayAdmin && <ActionButton iconProps={{ iconName: 'Edit' }} text={selDevice ? 'Upravit soubor' : 'Upravit lokalitu'} onClick={() => (selDevice ? onEditDevice(selSite, selDevice) : onEditSite(selSite))} />}
            <ActionButton iconProps={{ iconName: 'Cancel' }} text="Zavřít" onClick={() => setSelected(undefined)} />
          </div>
          {selSite.contact && !selDevice && <div style={{ fontSize: 13, marginTop: 4 }}>Kontakt: {selSite.contact}</div>}
        </div>
      )}
    </div>
  );
};
