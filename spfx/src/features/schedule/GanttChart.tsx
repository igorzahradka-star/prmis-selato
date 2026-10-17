/**
 * Ganttův diagram harmonogramu (SVG): vlevo čísla a názvy úkolů, vpravo časová osa s pruhy, šipkami závislostí, dneškem,
 * víkendy a svátky, kritickou cestou červeně a baseline pod pruhem. Rozložení počítá `core/ganttLayout.ts`.
 *
 * Při `editable` se diagram dá upravovat jako v MS Projectu (pravidla `core/ganttEdit.ts`):
 *  - pruh se chytí a přesune (zahájení), pravý okraj změní délku, značka v pruhu nastaví hotovo %,
 *  - z kuličky na konci pruhu se táhne vazba na jiný pruh (konec → začátek = FS, konec → konec = FF, začátek → začátek = SS, začátek → konec = SF),
 *  - kliknutí na šipku otevře úpravu vazby (typ, prodleva, smazání),
 *  - tažením v prázdném řádku dole vznikne nový úkol, řádky se přeskládají tažením za úchyt vlevo, název se píše přímo v levém sloupci.
 * Změny se během tažení jen ukazují (`onPreview`), do dat se zapíšou až při puštění (`onCommit`).
 */

import * as React from 'react';
import { DefaultButton } from '@fluentui/react/lib/Button';

import { RES } from '../../ui/theme';
import { StickyHScroll } from '../../ui/components/StickyHScroll';
import { BAR_HEIGHT, GanttBar, GanttItem, GanttLink, GanttScale, HEADER_HEIGHT, ROW_HEIGHT, ganttLayout } from '../../core/ganttLayout';
import { GanttOp, linkTypeFor } from '../../core/ganttEdit';
import { DependencyType, DEPENDENCY_TYPES } from '../../core/schedule';
import { addDays, dayOf } from '../../core/workCalendar';

const LEFT_WIDTH = 300;
const HANDLE_W = 6;
const SCALES: { key: GanttScale; label: string }[] = [
  { key: 'day', label: 'Dny' },
  { key: 'week', label: 'Týdny' },
  { key: 'month', label: 'Měsíce' }
];
const TYPE_LABELS: Record<DependencyType, string> = {
  FS: 'FS — začne po skončení předchůdce',
  SS: 'SS — začne společně s předchůdcem',
  FF: 'FF — skončí společně s předchůdcem',
  SF: 'SF — skončí, až předchůdce začne'
};

export interface GanttLinkEdit {
  fromTitle: string;
  toTitle: string;
  type: DependencyType;
  lagDays: number;
  onType: (t: DependencyType) => void;
  onLag: (days: number) => void;
  onDelete: () => void;
}

type Drag =
  | { kind: 'move' | 'resize' | 'percent'; key: string; x0: number; origStart: Date; origFinish: Date; bar: GanttBar; moved: boolean; op?: GanttOp }
  | { kind: 'link'; key: string; end: 'start' | 'finish'; x0: number; y0: number }
  | { kind: 'create'; x0: number };

const fmt = (d: Date): string => `${d.getDate()}. ${d.getMonth() + 1}.`;

export interface GanttChartProps {
  items: GanttItem[];
  links: GanttLink[];
  editable?: boolean;
  selectedLink?: { fromKey: string; toKey: string };
  linkEdit?: GanttLinkEdit;
  /** Řádek, jehož název se má po vzniku zvýraznit k psaní. */
  focusKey?: string;
  onFocused?: () => void;
  onSelectLink?: (l: { fromKey: string; toKey: string } | undefined) => void;
  onPreview?: (op: GanttOp | null) => void;
  onCommit?: (op: GanttOp) => void;
  onLink?: (fromKey: string, toKey: string, type: DependencyType) => void;
  onCreate?: (start: Date, finish: Date) => void;
  onReorder?: (from: number, to: number) => void;
  onTitle?: (key: string, title: string) => void;
  onDeleteRow?: (key: string) => void;
}

export const GanttChart: React.FC<GanttChartProps> = (props) => {
  const { items, links, editable, selectedLink, linkEdit, focusKey } = props;
  const [scale, setScale] = React.useState<GanttScale>('week');
  const hostRef = React.useRef<HTMLDivElement>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const today = React.useMemo(() => new Date(), []);
  const [frozen, setFrozen] = React.useState<{ start: Date; end: Date } | undefined>(undefined);
  const layout = React.useMemo(() => ganttLayout(items, links, scale, today, undefined, frozen), [items, links, scale, today, frozen]);
  const [hover, setHover] = React.useState<string | undefined>(undefined);
  const dragRef = React.useRef<Drag | undefined>(undefined);
  const [dragKey, setDragKey] = React.useState<string | undefined>(undefined);
  const [rubber, setRubber] = React.useState<{ x1: number; y1: number; x2: number; y2: number; target?: { key: string; end: 'start' | 'finish' } } | undefined>(undefined);
  const [ghost, setGhost] = React.useState<{ x: number; w: number } | undefined>(undefined);
  const [rowDrag, setRowDrag] = React.useState<{ from: number; to: number } | undefined>(undefined);
  const inputs = React.useRef<Record<string, HTMLInputElement | null>>({});
  const rowDragStart = React.useRef<{ y0: number; from: number } | undefined>(undefined);

  const px = layout.pxPerDay;
  const extraRow = editable ? 1 : 0;
  const total = HEADER_HEIGHT + layout.height + extraRow * ROW_HEIGHT;
  const dateAtX = (x: number): Date => addDays(layout.rangeStart, Math.max(0, Math.floor(x / px)));

  const scrollToToday = React.useCallback((): void => {
    const own = hostRef.current ? (hostRef.current.querySelector('.prm-hscroll-own') as HTMLElement | null) : null;
    if (own && layout.todayX !== undefined) {
      own.scrollLeft = Math.max(0, layout.todayX - 120);
    }
  }, [layout.todayX]);

  // Při změně měřítka a po prvním zobrazení se diagram posune na dnešek.
  React.useEffect(() => {
    const t = window.setTimeout(scrollToToday, 50);
    return () => window.clearTimeout(t);
  }, [scale]);

  React.useEffect(() => {
    if (focusKey && inputs.current[focusKey]) {
      const el = inputs.current[focusKey] as HTMLInputElement;
      el.focus();
      el.select();
      if (props.onFocused) {
        props.onFocused();
      }
    }
  }, [focusKey, items.length]);

  // Esc během tažení tažení zruší.
  React.useEffect(() => {
    if (!dragKey && !rubber && !ghost) {
      return undefined;
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        cancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const point = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = (svgRef.current as SVGSVGElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top - HEADER_HEIGHT };
  };

  const finish = (): void => {
    dragRef.current = undefined;
    setDragKey(undefined);
    setRubber(undefined);
    setGhost(undefined);
    setFrozen(undefined);
    if (props.onPreview) {
      props.onPreview(null);
    }
  };
  const cancel = (): void => finish();

  const begin = (e: React.PointerEvent, drag: Drag): void => {
    if (!editable || e.button !== 0) {
      return;
    }
    e.stopPropagation();
    if (hostRef.current) {
      hostRef.current.focus();
    }
    (svgRef.current as SVGSVGElement).setPointerCapture(e.pointerId);
    dragRef.current = drag;
    setFrozen({ start: layout.rangeStart, end: layout.rangeEnd });
    if (drag.kind === 'move' || drag.kind === 'resize' || drag.kind === 'percent') {
      setDragKey(drag.key);
    }
  };

  const startBar = (e: React.PointerEvent, kind: 'move' | 'resize' | 'percent', bar: GanttBar): void => {
    const it = items.filter((i) => i.key === bar.key)[0];
    if (!it) {
      return;
    }
    const p = point(e);
    begin(e, { kind, key: bar.key, x0: p.x, origStart: it.start, origFinish: it.finish, bar, moved: false });
  };

  const targetAt = (p: { x: number; y: number }, exceptKey: string): { key: string; end: 'start' | 'finish' } | undefined => {
    const row = Math.floor(p.y / ROW_HEIGHT);
    const bar = layout.bars[row];
    if (!bar || bar.key === exceptKey || p.y < 0) {
      return undefined;
    }
    const mid = bar.milestone ? bar.x : bar.x + bar.width / 2;
    return { key: bar.key, end: p.x < mid ? 'start' : 'finish' };
  };

  const onMove = (e: React.PointerEvent): void => {
    const d = dragRef.current;
    if (!d) {
      return;
    }
    const p = point(e);
    if (d.kind === 'move' || d.kind === 'resize') {
      const delta = Math.round((p.x - d.x0) / px);
      if (Math.abs(p.x - d.x0) > 3) {
        d.moved = true;
      }
      if (!d.moved) {
        return;
      }
      const op: GanttOp = d.kind === 'move' ? { type: 'move', key: d.key, start: addDays(d.origStart, delta) } : { type: 'resize', key: d.key, finish: addDays(d.origFinish, delta) };
      d.op = op;
      if (props.onPreview) {
        props.onPreview(op);
      }
    } else if (d.kind === 'percent') {
      const pct = Math.round((((p.x - d.bar.x) / Math.max(1, d.bar.width)) * 100) / 5) * 5;
      const op: GanttOp = { type: 'percent', key: d.key, percent: Math.max(0, Math.min(100, pct)) };
      d.moved = true;
      d.op = op;
      if (props.onPreview) {
        props.onPreview(op);
      }
    } else if (d.kind === 'link') {
      setRubber({ x1: d.x0, y1: d.y0, x2: p.x, y2: p.y, target: targetAt(p, d.key) });
    } else if (d.kind === 'create') {
      setGhost({ x: Math.min(d.x0, p.x), w: Math.abs(p.x - d.x0) });
    }
  };

  const onUp = (e: React.PointerEvent): void => {
    const d = dragRef.current;
    if (!d) {
      return;
    }
    const p = point(e);
    if ((d.kind === 'move' || d.kind === 'resize' || d.kind === 'percent') && d.moved && d.op && props.onCommit) {
      props.onCommit(d.op);
    } else if (d.kind === 'link' && props.onLink) {
      const t = targetAt(p, d.key);
      if (t) {
        props.onLink(d.key, t.key, linkTypeFor(d.end, t.end));
      }
    } else if (d.kind === 'create' && props.onCreate) {
      const a = dateAtX(Math.min(d.x0, p.x));
      const b = dateAtX(Math.max(d.x0, p.x));
      props.onCreate(a, b);
    }
    finish();
  };

  // --- přeskládání řádků za úchyt vlevo
  const rowDown = (e: React.PointerEvent, index: number): void => {
    if (!editable) {
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    rowDragStart.current = { y0: e.clientY, from: index };
    setRowDrag({ from: index, to: index });
  };
  const rowMove = (e: React.PointerEvent): void => {
    const s = rowDragStart.current;
    if (!s) {
      return;
    }
    const to = Math.max(0, Math.min(items.length - 1, s.from + Math.round((e.clientY - s.y0) / ROW_HEIGHT)));
    setRowDrag({ from: s.from, to });
  };
  const rowUp = (): void => {
    const s = rowDragStart.current;
    const cur = rowDrag;
    rowDragStart.current = undefined;
    setRowDrag(undefined);
    if (s && cur && cur.to !== cur.from && props.onReorder) {
      props.onReorder(cur.from, cur.to);
    }
  };

  const dragged = dragKey ? items.filter((i) => i.key === dragKey)[0] : undefined;
  const draggedBar = dragKey ? layout.bars.filter((b) => b.key === dragKey)[0] : undefined;

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 16, color: RES.navy }}>Ganttův diagram</h2>
        {editable && (
          <span style={{ fontSize: 12, color: RES.gray }}>
            Pruh chyťte a přesuňte, pravý okraj natáhne délku. Z kuličky na konci pruhu se táhne vazba na jiný pruh. Nový úkol vznikne tažením v prázdném řádku dole.
          </span>
        )}
        <span style={{ flex: '1 1 auto' }} />
        {SCALES.map((s) => (
          <DefaultButton
            key={s.key}
            text={s.label}
            onClick={() => setScale(s.key)}
            styles={{ root: { minWidth: 70, background: scale === s.key ? RES.blue : undefined, color: scale === s.key ? '#fff' : undefined, borderColor: scale === s.key ? RES.blue : undefined }, rootHovered: scale === s.key ? { background: RES.blueMid, color: '#fff' } : undefined }}
            ariaLabel={`Měřítko: ${s.label}`}
          />
        ))}
        <DefaultButton text="Dnes" iconProps={{ iconName: 'GotoToday' }} onClick={scrollToToday} disabled={layout.todayX === undefined} />
      </div>

      {linkEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#EAF3FB', border: `1px solid ${RES.blue}`, borderRadius: 4, padding: '6px 10px', marginBottom: 6, fontSize: 13 }}>
          <strong>Vazba:</strong>
          <span>
            „{linkEdit.fromTitle}“ → „{linkEdit.toTitle}“
          </span>
          <select aria-label="Typ vazby" value={linkEdit.type} disabled={!editable} onChange={(e) => linkEdit.onType(e.target.value as DependencyType)} style={{ height: 28, fontSize: 13 }}>
            {DEPENDENCY_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            prodleva
            <input
              type="number"
              aria-label="Prodleva vazby ve dnech"
              defaultValue={linkEdit.lagDays}
              key={`${linkEdit.fromTitle}-${linkEdit.toTitle}-${linkEdit.lagDays}`}
              disabled={!editable}
              onBlur={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v !== linkEdit.lagDays) {
                  linkEdit.onLag(v);
                }
              }}
              style={{ width: 64, height: 26, fontSize: 13 }}
            />
            prac. dnů (záporná = předstih)
          </label>
          {editable && <DefaultButton text="Smazat vazbu" iconProps={{ iconName: 'Delete' }} onClick={linkEdit.onDelete} />}
          <DefaultButton text="Zavřít" onClick={() => props.onSelectLink && props.onSelectLink(undefined)} />
        </div>
      )}

      <div style={{ display: 'flex', background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, outline: 'none' }} ref={hostRef} tabIndex={-1}>
        <div style={{ flex: `0 0 ${LEFT_WIDTH}px`, width: LEFT_WIDTH, borderRight: `1px solid ${RES.grayBlue}`, minWidth: 0 }}>
          <div style={{ height: HEADER_HEIGHT, boxSizing: 'border-box', padding: '0 8px', display: 'flex', alignItems: 'flex-end', paddingBottom: 6, fontSize: 12, fontWeight: 600, color: RES.gray, borderBottom: `1px solid ${RES.grayBlue}` }}>Úkol</div>
          {items.map((it, i) => {
            const isFrom = rowDrag && rowDrag.from === i;
            const dropLine = rowDrag && rowDrag.to === i && rowDrag.from !== i;
            return (
              <div
                key={it.key}
                title={it.title}
                style={{
                  height: ROW_HEIGHT,
                  boxSizing: 'border-box',
                  padding: '0 4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 13,
                  borderBottom: `1px solid ${RES.background}`,
                  background: isFrom ? '#DCE4F7' : i % 2 ? '#FAFAFA' : RES.white,
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  boxShadow: dropLine ? `inset 0 ${rowDrag && rowDrag.to < rowDrag.from ? 3 : -3}px 0 ${RES.blue}` : undefined
                }}
              >
                {editable && (
                  <span
                    role="button"
                    aria-label={`Přesunout řádek ${it.wbs}`}
                    title="Chytit a přesunout řádek výš nebo níž (vazby se zachovají)"
                    onPointerDown={(e) => rowDown(e, i)}
                    onPointerMove={rowMove}
                    onPointerUp={rowUp}
                    onPointerCancel={() => {
                      rowDragStart.current = undefined;
                      setRowDrag(undefined);
                    }}
                    style={{ flex: '0 0 14px', cursor: 'grab', color: RES.gray, userSelect: 'none', touchAction: 'none', textAlign: 'center', fontSize: 14 }}
                  >
                    ⋮⋮
                  </span>
                )}
                <span style={{ width: 30, flex: '0 0 auto', color: RES.gray, fontSize: 12 }}>{it.wbs}</span>
                {editable ? (
                  <input
                    ref={(el) => {
                      inputs.current[it.key] = el;
                    }}
                    aria-label={`Název úkolu ${it.wbs}`}
                    value={it.title}
                    onChange={(e) => props.onTitle && props.onTitle(it.key, e.target.value)}
                    style={{ flex: '1 1 auto', minWidth: 0, height: 24, border: '1px solid transparent', background: 'transparent', fontSize: 13, fontFamily: 'inherit', fontWeight: it.milestone ? 600 : 400, color: it.critical ? RES.red : RES.text, padding: '0 3px' }}
                    onFocus={(e) => (e.currentTarget.style.border = `1px solid ${RES.grayBlue}`)}
                    onBlur={(e) => (e.currentTarget.style.border = '1px solid transparent')}
                  />
                ) : (
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: '1 1 auto', fontWeight: it.milestone ? 600 : 400, color: it.critical ? RES.red : RES.text }}>{it.title || '(bez názvu)'}</span>
                )}
                {editable && (
                  <span role="button" aria-label={`Smazat úkol ${it.wbs}`} title="Smazat úkol" onClick={() => props.onDeleteRow && props.onDeleteRow(it.key)} style={{ flex: '0 0 16px', cursor: 'pointer', color: RES.gray, textAlign: 'center' }}>
                    ×
                  </span>
                )}
              </div>
            );
          })}
          {editable && (
            <div style={{ height: ROW_HEIGHT, boxSizing: 'border-box', padding: '0 8px', display: 'flex', alignItems: 'center', fontSize: 12, color: RES.gray, fontStyle: 'italic' }}>
              ＋ tažením v diagramu vpravo vznikne nový úkol
            </div>
          )}
        </div>

        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <StickyHScroll frameStyle={{ border: 'none', borderRadius: 0 }}>
            <svg
              ref={svgRef}
              width={layout.width}
              height={total}
              role="img"
              aria-label="Ganttův diagram harmonogramu"
              style={{ display: 'block', touchAction: 'none', userSelect: 'none' }}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={cancel}
              onClick={() => props.onSelectLink && selectedLink && props.onSelectLink(undefined)}
            >
              <defs>
                <marker id="gantt-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M0,0 L8,4 L0,8 Z" fill="#6B7785" />
                </marker>
                <marker id="gantt-arrow-crit" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M0,0 L8,4 L0,8 Z" fill={RES.red} />
                </marker>
                <marker id="gantt-arrow-sel" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M0,0 L8,4 L0,8 Z" fill={RES.blue} />
                </marker>
              </defs>

              {/* zebra řádky */}
              {items.map((it, i) => (
                <rect key={`z${it.key}`} x={0} y={HEADER_HEIGHT + i * ROW_HEIGHT} width={layout.width} height={ROW_HEIGHT} fill={i % 2 ? '#FAFAFA' : '#FFFFFF'} />
              ))}
              {editable && <rect x={0} y={HEADER_HEIGHT + items.length * ROW_HEIGHT} width={layout.width} height={ROW_HEIGHT} fill="#F5F9FC" />}
              {/* víkendy a svátky */}
              {layout.offDays.map((o, i) => (
                <rect key={`o${i}`} x={o.x} y={HEADER_HEIGHT} width={o.width} height={layout.height + extraRow * ROW_HEIGHT} fill="#EEF2F6" opacity={0.85} />
              ))}

              {/* prázdný řádek dole: tažením vzniká nový úkol */}
              {editable && (
                <rect
                  x={0}
                  y={HEADER_HEIGHT + items.length * ROW_HEIGHT}
                  width={layout.width}
                  height={ROW_HEIGHT}
                  fill="transparent"
                  style={{ cursor: 'crosshair' }}
                  onPointerDown={(e) => begin(e, { kind: 'create', x0: point(e).x })}
                />
              )}

              {/* záhlaví */}
              {layout.top.map((c, i) => (
                <g key={`t${i}`}>
                  <rect x={c.x} y={0} width={c.width} height={HEADER_HEIGHT / 2} fill="#F3F8FC" stroke={RES.grayBlue} strokeWidth={0.5} />
                  <text x={c.x + 6} y={HEADER_HEIGHT / 2 - 7} fontSize={12} fontWeight={600} fill={RES.navy}>
                    {c.width > 50 ? c.label : ''}
                  </text>
                </g>
              ))}
              {layout.bottom.map((c, i) => (
                <g key={`b${i}`}>
                  <rect x={c.x} y={HEADER_HEIGHT / 2} width={c.width} height={HEADER_HEIGHT / 2} fill="#FFFFFF" stroke={RES.grayBlue} strokeWidth={0.5} />
                  <text x={c.x + c.width / 2} y={HEADER_HEIGHT - 7} fontSize={11} textAnchor="middle" fill={RES.gray}>
                    {c.width >= 18 ? c.label : ''}
                  </text>
                </g>
              ))}

              {/* dnešek */}
              {layout.todayX !== undefined && <line x1={layout.todayX} x2={layout.todayX} y1={HEADER_HEIGHT / 2} y2={total} stroke={RES.green} strokeWidth={2} strokeDasharray="4 3" />}

              {/* šipky závislostí */}
              <g transform={`translate(0,${HEADER_HEIGHT})`} fill="none" strokeWidth={1.3}>
                {layout.arrows.map((a, i) => {
                  const sel = !!selectedLink && selectedLink.fromKey === a.fromKey && selectedLink.toKey === a.toKey;
                  const pts = a.points.map((p) => `${p.x},${p.y}`).join(' ');
                  return (
                    <g key={`a${i}`}>
                      <polyline points={pts} stroke={sel ? RES.blue : a.critical ? RES.red : '#6B7785'} strokeWidth={sel ? 2.6 : 1.3} markerEnd={`url(#${sel ? 'gantt-arrow-sel' : a.critical ? 'gantt-arrow-crit' : 'gantt-arrow'})`} />
                      {editable && (
                        <polyline
                          points={pts}
                          stroke="transparent"
                          strokeWidth={10}
                          style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (hostRef.current) {
                              hostRef.current.focus();
                            }
                            if (props.onSelectLink) {
                              props.onSelectLink({ fromKey: a.fromKey, toKey: a.toKey });
                            }
                          }}
                        >
                          <title>Kliknutím upravíte nebo smažete vazbu</title>
                        </polyline>
                      )}
                    </g>
                  );
                })}
              </g>

              {/* pruhy */}
              <g transform={`translate(0,${HEADER_HEIGHT})`}>
                {layout.bars.map((b) => {
                  const color = b.critical ? RES.red : RES.blue;
                  const showHandles = !!editable && (hover === b.key || dragKey === b.key);
                  const wide = Math.max(b.width, 3);
                  return (
                    <g key={b.key} onPointerEnter={() => setHover(b.key)} onPointerLeave={() => setHover((h) => (h === b.key ? undefined : h))}>
                      <title>{b.tooltip}</title>
                      {b.baseline && <rect x={b.baseline.x} y={b.baseline.y} width={b.baseline.width} height={4} rx={1} fill="#9AA3AD" />}
                      {b.deadlineX !== undefined && (
                        <g>
                          <line x1={b.deadlineX} x2={b.deadlineX} y1={b.y - 4} y2={b.y + BAR_HEIGHT + 4} stroke={b.late ? RES.red : RES.amber} strokeWidth={2} />
                          <path d={`M${b.deadlineX},${b.y - 4} l7,3 l-7,3 z`} fill={b.late ? RES.red : RES.amber} />
                        </g>
                      )}
                      {b.milestone ? (
                        <path
                          d={`M${b.x},${b.y - 1} l9,${BAR_HEIGHT / 2 + 1} l-9,${BAR_HEIGHT / 2 + 1} l-9,-${BAR_HEIGHT / 2 + 1} z`}
                          fill={b.late ? RES.red : '#00227a'}
                          stroke={color}
                          strokeWidth={1.5}
                          style={{ cursor: editable ? 'grab' : 'default' }}
                          onPointerDown={(e) => startBar(e, 'move', b)}
                        />
                      ) : (
                        <>
                          <rect x={b.x} y={b.y} width={wide} height={BAR_HEIGHT} rx={3} fill={b.critical ? '#F4C9D1' : RES.bluePale} stroke={color} strokeWidth={1.2} style={{ cursor: editable ? 'grab' : 'default' }} onPointerDown={(e) => startBar(e, 'move', b)} />
                          {b.doneWidth > 0 && <rect x={b.x} y={b.y} width={b.doneWidth} height={BAR_HEIGHT} rx={3} fill={color} style={{ pointerEvents: 'none' }} />}
                          {editable && wide > 14 && <rect x={b.x + wide - HANDLE_W} y={b.y} width={HANDLE_W} height={BAR_HEIGHT} fill="transparent" style={{ cursor: 'ew-resize' }} onPointerDown={(e) => startBar(e, 'resize', b)} />}
                          {showHandles && wide > 30 && (
                            <path d={`M${b.x + b.doneWidth - 4},${b.y - 1} l8,0 l-4,5 z`} fill={RES.navy} style={{ cursor: 'col-resize' }} onPointerDown={(e) => startBar(e, 'percent', b)}>
                              <title>Táhnutím nastavíte hotovo %</title>
                            </path>
                          )}
                        </>
                      )}
                      {showHandles && (
                        <>
                          <circle cx={(b.milestone ? b.x - 12 : b.x - 7)} cy={b.y + BAR_HEIGHT / 2} r={4} fill="#fff" stroke={RES.blue} strokeWidth={1.5} style={{ cursor: 'crosshair' }} onPointerDown={(e) => begin(e, { kind: 'link', key: b.key, end: 'start', x0: b.x - 7, y0: layout.bars.indexOf(b) * ROW_HEIGHT + ROW_HEIGHT / 2 })}>
                            <title>Táhnutím na jiný pruh vznikne vazba od začátku tohoto úkolu</title>
                          </circle>
                          <circle cx={(b.milestone ? b.x + 12 : b.x + wide + 7)} cy={b.y + BAR_HEIGHT / 2} r={4} fill="#fff" stroke={RES.blue} strokeWidth={1.5} style={{ cursor: 'crosshair' }} onPointerDown={(e) => begin(e, { kind: 'link', key: b.key, end: 'finish', x0: b.x + wide + 7, y0: layout.bars.indexOf(b) * ROW_HEIGHT + ROW_HEIGHT / 2 })}>
                            <title>Táhnutím na jiný pruh vznikne vazba od konce tohoto úkolu</title>
                          </circle>
                        </>
                      )}
                    </g>
                  );
                })}

                {/* tažená vazba */}
                {rubber && (
                  <g style={{ pointerEvents: 'none' }}>
                    <line x1={rubber.x1} y1={rubber.y1} x2={rubber.x2} y2={rubber.y2} stroke={RES.blue} strokeWidth={1.8} strokeDasharray="5 3" />
                    {rubber.target && layout.bars.filter((b) => b.key === (rubber.target as { key: string }).key).map((b) => (
                      <circle key="t" cx={rubber.target && rubber.target.end === 'start' ? (b.milestone ? b.x : b.x) : b.x + b.width} cy={b.y + BAR_HEIGHT / 2} r={6} fill="none" stroke={RES.green} strokeWidth={2.5} />
                    ))}
                  </g>
                )}

                {/* nový úkol tažením */}
                {ghost && <rect x={ghost.x} y={items.length * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2} width={Math.max(ghost.w, px)} height={BAR_HEIGHT} rx={3} fill={RES.bluePale} stroke={RES.blue} strokeDasharray="4 2" style={{ pointerEvents: 'none' }} />}

                {/* bublina s daty při tažení */}
                {dragged && draggedBar && (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect x={draggedBar.x + Math.max(draggedBar.width, 3) + 14} y={draggedBar.y - 20} width={dragged.milestone ? 74 : 150} height={18} rx={3} fill={RES.navy} />
                    <text x={draggedBar.x + Math.max(draggedBar.width, 3) + 20} y={draggedBar.y - 7} fontSize={11} fill="#fff">
                      {dragged.milestone ? fmt(dayOf(dragged.finish)) : `${fmt(dayOf(dragged.start))} – ${fmt(dayOf(dragged.finish))}`}
                      {!dragged.milestone && dragged.percent > 0 ? ` · ${dragged.percent} %` : ''}
                    </text>
                  </g>
                )}
              </g>
            </svg>
          </StickyHScroll>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: RES.gray, marginTop: 6 }}>
        <span>
          <span style={{ display: 'inline-block', width: 16, height: 8, background: RES.bluePale, border: `1px solid ${RES.blue}`, marginRight: 4 }} />
          úkol (tmavě = hotová část)
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 16, height: 8, background: '#F4C9D1', border: `1px solid ${RES.red}`, marginRight: 4 }} />
          kritická cesta
        </span>
        <span>◆ milník</span>
        <span>
          <span style={{ display: 'inline-block', width: 16, height: 4, background: '#9AA3AD', marginRight: 4 }} />
          baseline
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 3, height: 10, background: RES.amber, marginRight: 4 }} />
          smluvní termín (červeně, když se nestíhá)
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 12, height: 0, borderTop: `2px dashed ${RES.green}`, marginRight: 4, verticalAlign: 'middle' }} />
          dnes
        </span>
      </div>
    </div>
  );
};
