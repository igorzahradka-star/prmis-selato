/**
 * Výběr lokality projektu z mapy.
 *
 * Člověk napíše název místa, klikne na „Najít na mapě“ a mapa se otevře se
 * špendlíkem na nalezeném místě. Špendlík jde přesunout kliknutím do mapy
 * nebo přetažením. Uloží se text lokality i souřadnice.
 *
 * Mapa se ukazuje až na kliknutí — formulář zůstává rychlý a bez mapy,
 * když ji zrovna nikdo nepotřebuje.
 */

import * as React from 'react';
import { TextField } from '@fluentui/react/lib/TextField';
import { DefaultButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { Link } from '@fluentui/react/lib/Link';
import type * as LeafletTypes from 'leaflet';

import { RES } from '../../ui/theme';
import { isValidCoordinates, parseCoordinatePair } from '../../core/geo';
import { PlaceResult, searchPlaces } from '../../data/geocode';
import { DEFAULT_CENTER, DEFAULT_ZOOM, LeafletLib, addBaseLayers, enablePointerPan, loadLeaflet, pinIcon } from './leaflet';

export interface LocationValue {
  location: string;
  latitude?: number;
  longitude?: number;
}

export interface LocationPickerProps {
  /** Popisek textového pole (výchozí „Lokalita“). */
  label?: string;
  value: LocationValue;
  onChange: (value: LocationValue) => void;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({ value, onChange, label }) => {
  const [mapOpen, setMapOpen] = React.useState(false);
  const [searching, setSearching] = React.useState(false);
  const [message, setMessage] = React.useState<{ text: string; type: MessageBarType } | undefined>(undefined);
  const [results, setResults] = React.useState<PlaceResult[]>([]);

  const hasPosition = isValidCoordinates(value.latitude, value.longitude);
  const [manual, setManual] = React.useState('');
  const [manualError, setManualError] = React.useState<string | undefined>(undefined);

  const findOnMap = (): void => {
    setSearching(true);
    setMessage(undefined);
    setMapOpen(true);
    searchPlaces(value.location)
      .then((found) => {
        setSearching(false);
        setResults(found);
        if (found.length === 0) {
          setMessage({
            text: 'Místo se nenašlo. Zkuste upřesnit název (např. přidat obec), nebo klikněte přímo do mapy.',
            type: MessageBarType.warning
          });
          return;
        }
        onChange({ ...value, latitude: found[0].latitude, longitude: found[0].longitude });
      })
      .catch((e: Error) => {
        setSearching(false);
        setMessage({ text: e.message, type: MessageBarType.error });
      });
  };

  const pickResult = (place: PlaceResult): void =>
    onChange({ ...value, latitude: place.latitude, longitude: place.longitude });

  return (
    <div>
      <TextField
        label={label ?? 'Lokalita'}
        value={value.location}
        onChange={(_, v) => onChange({ ...value, location: v ?? '' })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.location.trim().length >= 2) {
            e.preventDefault();
            findOnMap();
          }
        }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <DefaultButton
          iconProps={{ iconName: 'MapPin' }}
          text={searching ? 'Hledám…' : 'Najít na mapě'}
          disabled={searching || value.location.trim().length < 2}
          onClick={findOnMap}
        />
        {hasPosition && !mapOpen && (
          <DefaultButton iconProps={{ iconName: 'Globe' }} text="Zobrazit mapu" onClick={() => setMapOpen(true)} />
        )}
        {mapOpen && (
          <DefaultButton text="Skrýt mapu" onClick={() => setMapOpen(false)} />
        )}
        <span style={{ fontSize: 12, color: hasPosition ? RES.greenDark : RES.gray }}>
          {hasPosition
            ? `Poloha nastavena (${(value.latitude as number).toFixed(4)}, ${(value.longitude as number).toFixed(4)})`
            : 'Poloha na mapě není nastavena'}
        </span>
        {hasPosition && (
          <Link onClick={() => onChange({ ...value, latitude: undefined, longitude: undefined })}>
            Odebrat polohu
          </Link>
        )}
      </div>

      <div style={{ marginTop: 8 }}>
        <TextField
          label="Nebo zadejte souřadnice ručně"
          description="Šířka a délka, např. 49.4063, 15.4333 (dají se zkopírovat z Map Google nebo mapy.cz — klik pravým tlačítkem na místo). Potvrďte Enterem."
          placeholder="49.4063, 15.4333"
          value={manual}
          errorMessage={manualError}
          onChange={(_, v) => {
            setManual(v ?? '');
            setManualError(undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const c = parseCoordinatePair(manual);
              if (!c) {
                setManualError('Souřadnice nejsou platné — zadejte šířku a délku, např. 49.4063, 15.4333.');
                return;
              }
              onChange({ ...value, latitude: c.latitude, longitude: c.longitude });
              setManual('');
              setMapOpen(true);
            }
          }}
        />
      </div>

      {message && (
        <MessageBar
          messageBarType={message.type}
          isMultiline
          onDismiss={() => setMessage(undefined)}
          styles={{ root: { marginTop: 8 } }}
        >
          {message.text}
        </MessageBar>
      )}

      {mapOpen && (
        <div style={{ marginTop: 8 }}>
          {searching && <Spinner size={SpinnerSize.small} label="Hledám místo…" labelPosition="right" />}
          <PickerMap
            latitude={value.latitude}
            longitude={value.longitude}
            onPick={(latitude, longitude) => onChange({ ...value, latitude, longitude })}
          />
          <div style={{ fontSize: 12, color: RES.gray, marginTop: 4 }}>
            Špendlík přesunete kliknutím do mapy nebo přetažením.
          </div>
          {results.length > 1 && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Další nalezená místa:</div>
              {results.map((r, i) => (
                <div key={`${r.latitude},${r.longitude},${i}`}>
                  <Link onClick={() => pickResult(r)}>{r.label}</Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** Malá mapa se špendlíkem, který jde přesunout. */
const PickerMap: React.FC<{
  latitude?: number;
  longitude?: number;
  onPick: (latitude: number, longitude: number) => void;
}> = ({ latitude, longitude, onPick }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<LeafletTypes.Map | undefined>(undefined);
  const markerRef = React.useRef<LeafletTypes.Marker | undefined>(undefined);
  const libRef = React.useRef<LeafletLib | undefined>(undefined);
  const panCleanupRef = React.useRef<(() => void) | undefined>(undefined);
  // Aktuální obsluha — mapa se zakládá jednou, ale `onPick` se mezi překresleními mění.
  const onPickRef = React.useRef(onPick);
  onPickRef.current = onPick;
  const [ready, setReady] = React.useState(false);
  const [loadError, setLoadError] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current) {
          return;
        }
        libRef.current = L;
        const map = L.map(containerRef.current);
        const start: [number, number] = isValidCoordinates(latitude, longitude)
          ? [latitude as number, longitude as number]
          : DEFAULT_CENTER;
        map.setView(start, isValidCoordinates(latitude, longitude) ? 13 : DEFAULT_ZOOM);
        addBaseLayers(L, map);
        map.on('click', (e: LeafletTypes.LeafletMouseEvent) => onPickRef.current(e.latlng.lat, e.latlng.lng));
        // Vlastní posouvání tažením (pointer události) — viz `enablePointerPan`; kliknutí bez tažení přesune špendlík.
        panCleanupRef.current = enablePointerPan(map, { onTap: (lat, lng) => onPickRef.current(lat, lng) });
        mapRef.current = map;
        setReady(true);
        // Panel se vysouvá animací — po jejím skončení se mapě přepočítá velikost (jinak může být posun a dlaždice nepřesné).
        window.setTimeout(() => map.invalidateSize(), 350);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
        }
      });
    return () => {
      cancelled = true;
      if (panCleanupRef.current) {
        panCleanupRef.current();
        panCleanupRef.current = undefined;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = undefined;
        markerRef.current = undefined;
      }
    };
    // Mapa se zakládá jen jednou; poloha se přenáší v efektu níž.
  }, []);

  // Špendlík a střed mapy sledují zadanou polohu.
  React.useEffect(() => {
    const L = libRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) {
      return;
    }
    if (!isValidCoordinates(latitude, longitude)) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = undefined;
      }
      return;
    }
    const point: [number, number] = [latitude as number, longitude as number];
    if (!markerRef.current) {
      const marker = L.marker(point, { icon: pinIcon(L, RES.blue, '#ffffff', '#ffffff'), draggable: true });
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        onPickRef.current(p.lat, p.lng);
      });
      marker.addTo(map);
      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng(point);
    }
    if (!map.getBounds().contains(point)) {
      map.setView(point, Math.max(map.getZoom(), 12));
    }
  }, [ready, latitude, longitude]);

  if (loadError) {
    return (
      <MessageBar messageBarType={MessageBarType.error}>
        Mapu se nepodařilo načíst. Zkontrolujte připojení k internetu.
      </MessageBar>
    );
  }
  return (
    <div
      ref={containerRef}
      style={{ height: 300, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, background: RES.background }}
      aria-label="Mapa pro výběr polohy"
    />
  );
};
