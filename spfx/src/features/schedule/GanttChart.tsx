/**
 * Ganttův diagram harmonogramu (SVG): vlevo čísla a názvy úkolů, vpravo časová osa s pruhy, šipkami závislostí, dneškem,
 * víkendy a svátky, kritickou cestou červeně a baseline pod pruhem. Rozložení počítá `core/ganttLayout.ts`.
 */

import * as React from 'react';
import { DefaultButton } from '@fluentui/react/lib/Button';

import { RES } from '../../ui/theme';
import { StickyHScroll } from '../../ui/components/StickyHScroll';
import { BAR_HEIGHT, GanttItem, GanttLink, GanttScale, HEADER_HEIGHT, ROW_HEIGHT, ganttLayout } from '../../core/ganttLayout';

const LEFT_WIDTH = 270;
const SCALES: { key: GanttScale; label: string }[] = [
  { key: 'day', label: 'Dny' },
  { key: 'week', label: 'Týdny' },
  { key: 'month', label: 'Měsíce' }
];

export const GanttChart: React.FC<{ items: GanttItem[]; links: GanttLink[] }> = ({ items, links }) => {
  const [scale, setScale] = React.useState<GanttScale>('week');
  const hostRef = React.useRef<HTMLDivElement>(null);
  const today = React.useMemo(() => new Date(), []);
  const layout = React.useMemo(() => ganttLayout(items, links, scale, today), [items, links, scale, today]);

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
  }, [scale, scrollToToday]);

  const total = HEADER_HEIGHT + layout.height;

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 16, color: RES.navy }}>Ganttův diagram</h2>
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

      <div style={{ display: 'flex', background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4 }} ref={hostRef}>
        <div style={{ flex: `0 0 ${LEFT_WIDTH}px`, width: LEFT_WIDTH, borderRight: `1px solid ${RES.grayBlue}`, minWidth: 0 }}>
          <div style={{ height: HEADER_HEIGHT, boxSizing: 'border-box', padding: '0 8px', display: 'flex', alignItems: 'flex-end', paddingBottom: 6, fontSize: 12, fontWeight: 600, color: RES.gray, borderBottom: `1px solid ${RES.grayBlue}` }}>Úkol</div>
          {items.map((it, i) => (
            <div
              key={it.key}
              title={it.title}
              style={{ height: ROW_HEIGHT, boxSizing: 'border-box', padding: '0 8px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, borderBottom: `1px solid ${RES.background}`, background: i % 2 ? '#FAFBFC' : RES.white, overflow: 'hidden', whiteSpace: 'nowrap' }}
            >
              <span style={{ width: 34, flex: '0 0 auto', color: RES.gray, fontSize: 12 }}>{it.wbs}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: it.milestone ? 600 : 400, color: it.critical ? RES.red : RES.text }}>{it.title || '(bez názvu)'}</span>
            </div>
          ))}
        </div>

        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <StickyHScroll frameStyle={{ border: 'none', borderRadius: 0 }}>
            <svg width={layout.width} height={total} role="img" aria-label="Ganttův diagram harmonogramu" style={{ display: 'block' }}>
              <defs>
                <marker id="gantt-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M0,0 L8,4 L0,8 Z" fill="#6B7785" />
                </marker>
                <marker id="gantt-arrow-crit" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M0,0 L8,4 L0,8 Z" fill={RES.red} />
                </marker>
              </defs>

              {/* zebra řádky */}
              {items.map((it, i) => (
                <rect key={`z${it.key}`} x={0} y={HEADER_HEIGHT + i * ROW_HEIGHT} width={layout.width} height={ROW_HEIGHT} fill={i % 2 ? '#FAFBFC' : '#FFFFFF'} />
              ))}
              {/* víkendy a svátky */}
              {layout.offDays.map((o, i) => (
                <rect key={`o${i}`} x={o.x} y={HEADER_HEIGHT} width={o.width} height={layout.height} fill="#EEF2F6" opacity={0.85} />
              ))}

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
                {layout.arrows.map((a, i) => (
                  <polyline
                    key={`a${i}`}
                    points={a.points.map((p) => `${p.x},${p.y}`).join(' ')}
                    stroke={a.critical ? RES.red : '#6B7785'}
                    markerEnd={`url(#${a.critical ? 'gantt-arrow-crit' : 'gantt-arrow'})`}
                  />
                ))}
              </g>

              {/* pruhy */}
              <g transform={`translate(0,${HEADER_HEIGHT})`}>
                {layout.bars.map((b) => {
                  const color = b.critical ? RES.red : RES.blue;
                  return (
                    <g key={b.key}>
                      <title>{b.tooltip}</title>
                      {b.baseline && <rect x={b.baseline.x} y={b.baseline.y} width={b.baseline.width} height={4} rx={1} fill="#9AA3AD" />}
                      {b.deadlineX !== undefined && (
                        <g>
                          <line x1={b.deadlineX} x2={b.deadlineX} y1={b.y - 4} y2={b.y + BAR_HEIGHT + 4} stroke={b.late ? RES.red : RES.amber} strokeWidth={2} />
                          <path d={`M${b.deadlineX},${b.y - 4} l7,3 l-7,3 z`} fill={b.late ? RES.red : RES.amber} />
                        </g>
                      )}
                      {b.milestone ? (
                        <path d={`M${b.x},${b.y - 1} l9,${BAR_HEIGHT / 2 + 1} l-9,${BAR_HEIGHT / 2 + 1} l-9,-${BAR_HEIGHT / 2 + 1} z`} fill={b.late ? RES.red : '#153D64'} stroke={color} strokeWidth={1.5} />
                      ) : (
                        <>
                          <rect x={b.x} y={b.y} width={b.width} height={BAR_HEIGHT} rx={3} fill={b.critical ? '#F4C9D1' : RES.bluePale} stroke={color} strokeWidth={1.2} />
                          {b.doneWidth > 0 && <rect x={b.x} y={b.y} width={b.doneWidth} height={BAR_HEIGHT} rx={3} fill={color} />}
                        </>
                      )}
                    </g>
                  );
                })}
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
