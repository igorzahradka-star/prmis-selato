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
import { Toggle } from '@fluentui/react/lib/Toggle';
import { Link } from '@fluentui/react/lib/Link';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { PageHeading } from '../../ui/components/PageHeading';
import { buildHash, navigate, RouteName } from '../../ui/router';
import { ACTIVE_PROJECT_STATUSES, Project } from '../../core/types';
import {
  buildLegend,
  buildPinInfo,
  pinTooltipHtml,
  projectCoordinates,
  projectTypeColor,
  splitByLocation
} from '../../core/geo';
import { DEFAULT_CENTER, DEFAULT_ZOOM, LeafletLib, MAP_ATTRIBUTION, TILE_URL, loadLeaflet, pinIcon } from './leaflet';
import type * as LeafletTypes from 'leaflet';

export const ProjectsMapPage: React.FC = () => {
  const { repos } = useApp();

  const [projects, setProjects] = React.useState<Project[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [mapError, setMapError] = React.useState<string | undefined>(undefined);
  const [includeFinished, setIncludeFinished] = React.useState(false);
  const [hiddenTypes, setHiddenTypes] = React.useState<string[]>([]);

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

  const visible = React.useMemo(
    () =>
      (projects ?? []).filter(
        (p) => !p.isOverhead && (includeFinished || ACTIVE_PROJECT_STATUSES.indexOf(p.status) !== -1)
      ),
    [projects, includeFinished]
  );
  const { located, missing } = React.useMemo(() => splitByLocation(visible), [visible]);
  const legend = React.useMemo(() => buildLegend(located), [located]);
  const shown = React.useMemo(
    () => located.filter((p) => hiddenTypes.indexOf(p.projectType || '') === -1),
    [located, hiddenTypes]
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
        icon: pinIcon(L, projectTypeColor(p.projectType)),
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

  const toggleType = (type: string): void =>
    setHiddenTypes((cur) => (cur.indexOf(type) === -1 ? [...cur, type] : cur.filter((t) => t !== type)));

  return (
    <>
      <PageHeading
        title="Mapa projektů"
        subtitle="Špendlík má barvu podle typu projektu. Po najetí se ukáže shrnutí, po kliknutí se otevře projekt."
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
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, margin: '8px 0 12px' }}>
            <Toggle
              label="Zobrazit i dokončené a uzavřené"
              inlineLabel
              checked={includeFinished}
              onChange={(_, c) => setIncludeFinished(!!c)}
              styles={{ root: { margin: 0 } }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {legend.map((entry) => {
                const off = hiddenTypes.indexOf(entry.type) !== -1;
                return (
                  <button
                    key={entry.type || 'bez-typu'}
                    type="button"
                    onClick={() => toggleType(entry.type)}
                    title={off ? 'Klikem znovu zobrazíte' : 'Klikem skryjete tento typ'}
                    aria-pressed={!off}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '3px 10px',
                      border: `1px solid ${RES.grayBlue}`,
                      borderRadius: 14,
                      background: RES.white,
                      cursor: 'pointer',
                      fontSize: 12,
                      opacity: off ? 0.45 : 1,
                      textDecoration: off ? 'line-through' : 'none'
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: entry.color,
                        display: 'inline-block'
                      }}
                    />
                    {entry.label} ({entry.count})
                  </button>
                );
              })}
            </div>
          </div>

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
