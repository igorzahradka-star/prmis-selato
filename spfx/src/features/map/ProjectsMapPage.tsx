/**
 * Mapa projektů — přehled, kde firma právě pracuje.
 *
 * Špendlík má barvu podle typu projektu; po najetí ukáže bublinu (název, typ,
 * semafor rozpočtu, semafor termínů, projektový manažer), po kliknutí otevře detail.
 * Na mapě jsou jen projekty, kterým někdo zadal polohu; ostatní se vypíšou
 * pod mapou, aby bylo vidět, co chybí.
 */

import * as React from 'react';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { Link } from '@fluentui/react/lib/Link';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { PageHeading } from '../../ui/components/PageHeading';
import { buildHash, navigate, RouteName } from '../../ui/router';
import { Project } from '../../core/types';
import {
  buildLegend,
  buildPinInfo,
  pinTooltipHtml,
  projectCoordinates,
  splitByLocation,
  statusStyle
} from '../../core/geo';
import { DEFAULT_CENTER, DEFAULT_ZOOM, LeafletLib, MAP_ATTRIBUTION, TILE_URL, loadLeaflet, pinIcon } from './leaflet';
import type * as LeafletTypes from 'leaflet';

export const ProjectsMapPage: React.FC = () => {
  const { repos } = useApp();

  const [projects, setProjects] = React.useState<Project[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [mapError, setMapError] = React.useState<string | undefined>(undefined);
  const [hiddenStatuses, setHiddenStatuses] = React.useState<string[]>([]);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<LeafletTypes.Map | undefined>(undefined);
  const layerRef = React.useRef<LeafletTypes.LayerGroup | undefined>(undefined);
  const libRef = React.useRef<LeafletLib | undefined>(undefined);
  const fittedRef = React.useRef(false);
  const [mapReady, setMapReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    repos.projects
      .list({})
      .then((list) => {
        if (!cancelled) {
          setProjects(list);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repos]);

  const visible = React.useMemo(() => (projects ?? []).filter((p) => !p.isOverhead), [projects]);
  const { located, missing } = React.useMemo(() => splitByLocation(visible), [visible]);
  const legend = React.useMemo(() => buildLegend(located), [located]);
  const shown = React.useMemo(
    () => located.filter((p) => hiddenStatuses.indexOf(p.status) === -1),
    [located, hiddenStatuses]
  );

  // Založení mapy — jednou, až je co zobrazovat a je kam.
  React.useEffect(() => {
    if (!projects || !containerRef.current || mapRef.current) {
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
        L.tileLayer(TILE_URL, { maxZoom: 19, attribution: MAP_ATTRIBUTION }).addTo(map);
        layerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setMapReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setMapError('Mapu se nepodařilo načíst. Zkontrolujte připojení k internetu a obnovte stránku.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projects]);

  // Úklid při odchodu ze stránky.
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

  // Špendlíky — překreslí se při změně filtrů.
  React.useEffect(() => {
    const L = libRef.current;
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!mapReady || !L || !layer || !map) {
      return;
    }
    layer.clearLayers();
    const points: [number, number][] = [];
    shown.forEach((p) => {
      const c = projectCoordinates(p);
      if (!c) {
        return;
      }
      const marker = L.marker([c.latitude, c.longitude], {
        icon: pinIcon(L, statusStyle(p.status).fill, statusStyle(p.status).stroke, statusStyle(p.status).text),
        title: p.projectNumber,
        keyboard: true
      });
      marker.bindTooltip(pinTooltipHtml(buildPinInfo(p)), {
        className: 'prm-tooltip',
        direction: 'top',
        opacity: 1
      });
      marker.on('click', () => navigate(RouteName.ProjectDetail, p.projectNumber));
      marker.addTo(layer);
      points.push([c.latitude, c.longitude]);
    });
    // Přiblížení na špendlíky jen poprvé — pozdější přepnutí filtru nesmí mapu člověku „ukrást".
    if (!fittedRef.current && points.length > 0) {
      map.fitBounds(L.latLngBounds(points).pad(0.25), { maxZoom: 11 });
      fittedRef.current = true;
    }
  }, [mapReady, shown]);

  const toggleStatus = (status: string): void =>
    setHiddenStatuses((cur) => (cur.indexOf(status) === -1 ? [...cur, status] : cur.filter((t) => t !== status)));

  return (
    <>
      <PageHeading
        title="Mapa projektů"
        subtitle="Barva špendlíku ukazuje stav projektu (legenda v rohu mapy). Po najetí se ukáže shrnutí, po kliknutí se otevře projekt."
      />

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {mapError && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {mapError}
        </MessageBar>
      )}
      {!projects && !error && <Spinner size={SpinnerSize.large} label="Načítám projekty…" />}

      {projects && (
        <>
          <div style={{ position: 'relative', marginTop: 8 }}>
            <div
              ref={containerRef}
              style={{
                height: '62vh',
                minHeight: 360,
                border: `1px solid ${RES.grayBlue}`,
                borderRadius: 4,
                background: RES.background
              }}
              aria-label="Mapa projektů"
            />
            <div
              style={{
                position: 'absolute',
                left: 10,
                bottom: 28,
                zIndex: 1000,
                background: 'rgba(255,255,255,0.94)',
                border: `1px solid ${RES.grayBlue}`,
                borderRadius: 4,
                padding: '6px 10px',
                fontSize: 12,
                boxShadow: '0 1px 6px rgba(0,0,0,.2)'
              }}
              role="group"
              aria-label="Legenda: stav projektu"
            >
              <div style={{ fontWeight: 600, marginBottom: 4, color: RES.navy }}>Stav projektu</div>
              {legend.map((entry) => {
                const off = hiddenStatuses.indexOf(entry.status) !== -1;
                return (
                  <button
                    key={entry.status}
                    type="button"
                    onClick={() => toggleStatus(entry.status)}
                    title={off ? 'Klikem znovu zobrazíte' : 'Klikem skryjete tyto projekty'}
                    aria-pressed={!off}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '2px 0',
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      font: 'inherit',
                      textAlign: 'left',
                      opacity: off ? 0.4 : 1,
                      textDecoration: off ? 'line-through' : 'none'
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: entry.style.fill,
                        border: `1.5px solid ${entry.style.stroke}`,
                        display: 'inline-block',
                        flex: '0 0 auto'
                      }}
                    />
                    <span style={{ flex: '1 1 auto' }}>{entry.status}</span>
                    <span style={{ color: RES.gray }}>{entry.count}</span>
                  </button>
                );
              })}
              <div style={{ color: RES.gray, marginTop: 4 }}>Klik = skrýt / zobrazit</div>
            </div>
          </div>

          {located.length === 0 && (
            <MessageBar messageBarType={MessageBarType.info} isMultiline styles={{ root: { marginTop: 12 } }}>
              Zatím žádný projekt nemá zadanou polohu. Polohu nastavíte v úpravě projektu: u pole Lokalita
              klikněte na „Najít na mapě“ a potvrďte místo.
            </MessageBar>
          )}

          {missing.length > 0 && (
            <MessageBar messageBarType={MessageBarType.warning} isMultiline styles={{ root: { marginTop: 12 } }}>
              <strong>{missing.length} z {visible.length} projektů nemá polohu, proto nejsou na mapě:</strong>{' '}
              {missing.map((p, i) => (
                <React.Fragment key={p.projectNumber}>
                  {i > 0 && ', '}
                  <Link href={buildHash(RouteName.ProjectDetail, p.projectNumber)}>{p.projectNumber}</Link>
                </React.Fragment>
              ))}
              . Otevřete projekt, zvolte Upravit projekt a u Lokality klikněte na „Najít na mapě“.
            </MessageBar>
          )}
        </>
      )}
    </>
  );
};
