/**
 * Graf cashflow: sloupce příjmů (nahoru, zelené) a výdajů (dolů, modré) — plán světle, skutečnost tmavě — a čáry kumulace
 * (plán čárkovaně, skutečnost plně). Kreslí se jako SVG bez knihovny; široký graf se v obalu roluje vodorovně.
 */

import * as React from 'react';

import { RES } from '../../ui/theme';
import { CfBucket } from '../../core/cashflow';

const H = 260;
const PAD_T = 14;
const PAD_B = 34;
const PAD_L = 8;
const COL = 46;

const compact = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1_000_000) {
    return `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} M`;
  }
  if (a >= 1_000) {
    return `${(v / 1_000).toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} tis.`;
  }
  return v.toLocaleString('cs-CZ', { maximumFractionDigits: 0 });
};

export const CashflowChart: React.FC<{ buckets: CfBucket[]; currencyLabel: string; today: Date }> = ({ buckets, currencyLabel, today }) => {
  if (buckets.length === 0) {
    return null;
  }
  const width = PAD_L + buckets.length * COL + 70;
  const maxBar = Math.max(1, ...buckets.map((b) => Math.max(b.incomePlan, b.incomeActual, b.expensePlan, b.expenseActual)));
  const cums = buckets.flatMap((b) => [b.cumPlan, b.cumActual]);
  const top = Math.max(maxBar, ...cums, 1);
  const bottom = Math.min(-maxBar, ...cums, -1);
  const plotH = H - PAD_T - PAD_B;
  const y = (v: number): number => PAD_T + ((top - v) / (top - bottom)) * plotH;
  const x0 = (i: number): number => PAD_L + i * COL;
  const zero = y(0);
  const todayIdx = buckets.findIndex((b) => today.getTime() >= b.from.getTime() && today.getTime() <= b.to.getTime() + 86399999);
  const line = (pick: (b: CfBucket) => number): string => buckets.map((b, i) => `${i === 0 ? 'M' : 'L'}${x0(i) + COL / 2},${y(pick(b))}`).join(' ');
  // Skutečnost se kreslí jen do dneška (dál by byla plochá čára).
  const actualEnd = todayIdx === -1 ? (today.getTime() > buckets[buckets.length - 1].to.getTime() ? buckets.length - 1 : -1) : todayIdx;
  const actualBuckets = actualEnd >= 0 ? buckets.slice(0, actualEnd + 1) : [];
  const actualPath = actualBuckets.map((b, i) => `${i === 0 ? 'M' : 'L'}${x0(i) + COL / 2},${y(b.cumActual)}`).join(' ');

  return (
    <div style={{ overflowX: 'auto', background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '8px 0' }}>
      <svg role="img" aria-label="Graf cashflow projektu: příjmy, výdaje a kumulativní saldo, plán proti skutečnosti" width={width} height={H} viewBox={`0 0 ${width} ${H}`} style={{ display: 'block' }}>
        {todayIdx !== -1 && <rect x={x0(todayIdx)} y={PAD_T} width={COL} height={plotH} fill={RES.bluePale} opacity={0.7} />}
        <line x1={PAD_L} x2={width - 70} y1={zero} y2={zero} stroke={RES.gray} strokeWidth={1} />
        {buckets.map((b, i) => (
          <g key={b.key}>
            <title>{`${b.label}: příjmy plán ${compact(b.incomePlan)} / skutečnost ${compact(b.incomeActual)}, výdaje plán ${compact(b.expensePlan)} / skutečnost ${compact(b.expenseActual)} ${currencyLabel}`}</title>
            <rect x={x0(i) + 4} y={y(b.incomePlan)} width={16} height={Math.max(0, zero - y(b.incomePlan))} fill="#A8E3C4" />
            <rect x={x0(i) + 4} y={zero} width={16} height={Math.max(0, y(-b.expensePlan) - zero)} fill="#B7D4EE" />
            <rect x={x0(i) + 22} y={y(b.incomeActual)} width={14} height={Math.max(0, zero - y(b.incomeActual))} fill={RES.green} />
            <rect x={x0(i) + 22} y={zero} width={14} height={Math.max(0, y(-b.expenseActual) - zero)} fill={RES.blue} />
            <text x={x0(i) + COL / 2} y={H - 18} fontSize={9} textAnchor="middle" fill={RES.gray}>
              {b.label.split(' ')[0]}
            </text>
            <text x={x0(i) + COL / 2} y={H - 7} fontSize={8} textAnchor="middle" fill={RES.gray}>
              {b.label.split(' ')[1] ?? ''}
            </text>
          </g>
        ))}
        <path d={line((b) => b.cumPlan)} fill="none" stroke={RES.navy} strokeWidth={2} strokeDasharray="5 4" />
        {actualPath && <path d={actualPath} fill="none" stroke={RES.red} strokeWidth={2.2} />}
        <text x={width - 66} y={y(buckets[buckets.length - 1].cumPlan) + 4} fontSize={10} fill={RES.navy}>
          {compact(buckets[buckets.length - 1].cumPlan)} {currencyLabel}
        </text>
        <g fontSize={10} fill={RES.gray}>
          <text x={width - 66} y={PAD_T + 8}>
            {compact(top)}
          </text>
          <text x={width - 66} y={PAD_T + plotH}>
            {compact(bottom)}
          </text>
        </g>
      </svg>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: RES.gray, padding: '4px 12px' }}>
        <span>
          <i style={{ display: 'inline-block', width: 10, height: 10, background: '#A8E3C4', marginRight: 4 }} />
          příjmy – plán
        </span>
        <span>
          <i style={{ display: 'inline-block', width: 10, height: 10, background: RES.green, marginRight: 4 }} />
          příjmy – skutečnost
        </span>
        <span>
          <i style={{ display: 'inline-block', width: 10, height: 10, background: '#B7D4EE', marginRight: 4 }} />
          výdaje – plán
        </span>
        <span>
          <i style={{ display: 'inline-block', width: 10, height: 10, background: RES.blue, marginRight: 4 }} />
          výdaje – skutečnost
        </span>
        <span>
          <i style={{ display: 'inline-block', width: 18, height: 0, borderTop: `2px dashed ${RES.navy}`, marginRight: 4, verticalAlign: 'middle' }} />
          kumulace – plán
        </span>
        <span>
          <i style={{ display: 'inline-block', width: 18, height: 0, borderTop: `2px solid ${RES.red}`, marginRight: 4, verticalAlign: 'middle' }} />
          kumulace – skutečnost
        </span>
      </div>
    </div>
  );
};
