/**
 * Šířky sloupců tabulky, které si uživatel mění tažením za pravý okraj záhlaví (dvojklik vrátí výchozí šířku).
 * Šířky se pamatují v prohlížeči (localStorage), takže se po otevření rozpočtu drží.
 */

import * as React from 'react';

function load(key: string, defaults: number[]): number[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    if (Array.isArray(parsed) && parsed.length === defaults.length && parsed.every((n) => typeof n === 'number' && n >= 20 && n <= 1200)) {
      return parsed as number[];
    }
  } catch {
    /* úložiště nemusí být dostupné */
  }
  return defaults;
}

function save(key: string, widths: number[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(widths));
  } catch {
    /* úložiště nemusí být dostupné */
  }
}

const MIN_WIDTH = 50;

export interface ColumnWidths {
  /** Součet šířek — šířka celé tabulky. */
  total: number;
  /** `<colgroup>` pro tabulku s `table-layout: fixed`. */
  cols: JSX.Element;
  /** Úchyt na pravém okraji záhlaví sloupce `index`; záhlaví musí mít `position` (sticky stačí). */
  grip: (index: number) => JSX.Element;
}

export function useColumnWidths(storageKey: string, defaults: number[], fixed: number[] = []): ColumnWidths {
  const key = `prm.colw.${storageKey}`;
  const [widths, setWidths] = React.useState<number[]>(() => load(key, defaults));
  const drag = React.useRef<{ index: number; startX: number; startW: number } | undefined>(undefined);
  const latest = React.useRef(widths);
  latest.current = widths;

  const grip = (index: number): JSX.Element => {
    if (fixed.indexOf(index) !== -1) {
      return <></>;
    }
    return (
      <span
        role="separator"
        aria-label="Změnit šířku sloupce"
        title="Tažením změníte šířku sloupce, dvojklikem se vrátí výchozí"
        onPointerDown={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { index, startX: e.clientX, startW: latest.current[index] };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) {
            return;
          }
          const next = latest.current.slice();
          next[d.index] = Math.min(1200, Math.max(MIN_WIDTH, Math.round(d.startW + e.clientX - d.startX)));
          setWidths(next);
        }}
        onPointerUp={() => {
          if (drag.current) {
            drag.current = undefined;
            save(key, latest.current);
          }
        }}
        onDoubleClick={() => {
          const next = latest.current.slice();
          next[index] = defaults[index];
          setWidths(next);
          save(key, next);
        }}
        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 7, cursor: 'col-resize', userSelect: 'none', touchAction: 'none', borderRight: '2px solid transparent' }}
        onMouseEnter={(e) => (e.currentTarget.style.borderRightColor = '#9bb3c9')}
        onMouseLeave={(e) => (e.currentTarget.style.borderRightColor = 'transparent')}
      />
    );
  };

  return {
    total: widths.reduce((s, w) => s + w, 0),
    cols: (
      <colgroup>
        {widths.map((w, i) => (
          <col key={i} style={{ width: w }} />
        ))}
      </colgroup>
    ),
    grip
  };
}
