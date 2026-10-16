/**
 * Společné drobnosti obrazovek Servisu: štítky stavů, styly tabulek, formátování.
 */

import * as React from 'react';
import { RES } from '../../ui/theme';
import { JobStatus, RequestStatus, ServiceRequest } from '../../core/serviceJobs';
import { CONTRACT_STATE_LABELS, ContractState, ServiceDevice, ServiceScope, ServiceSite, SITE_WIDE_FILTER } from '../../core/service';
import { REQUEST_PRIORITIES } from '../../core/serviceJobs';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';
import { SlaPart, SlaProgress, formatHours } from '../../core/serviceSla';
import type { ContractCoverage } from '../../core/serviceContract';

export const TH: React.CSSProperties = { textAlign: 'left', fontWeight: 600, fontSize: 12, color: RES.gray, padding: '6px 8px', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: RES.white, zIndex: 1, boxShadow: `0 1px 0 ${RES.grayBlue}` };
export const TD: React.CSSProperties = { padding: '6px 8px', fontSize: 13, verticalAlign: 'top' };

const PILL: React.CSSProperties = { display: 'inline-block', borderRadius: 10, padding: '1px 9px', fontSize: 12, whiteSpace: 'nowrap' };

const JOB_COLORS: Record<JobStatus, { bg: string; fg: string }> = {
  [JobStatus.Naplanovano]: { bg: '#E8EEF4', fg: '#34506B' },
  [JobStatus.Objednano]: { bg: '#DDEBFA', fg: '#1F5C99' },
  [JobStatus.Provedeno]: { bg: '#FFF1CC', fg: '#7A5A00' },
  [JobStatus.KFakturaci]: { bg: '#E4F6EC', fg: '#1D7A4B' },
  [JobStatus.Vyfakturovano]: { bg: '#D3EFE0', fg: '#14613A' },
  [JobStatus.Uzavreno]: { bg: '#EEEEEE', fg: '#555555' },
  [JobStatus.Zruseno]: { bg: '#F6DADA', fg: '#8A2A2A' }
};

export const JobStatusBadge: React.FC<{ status: JobStatus }> = ({ status }) => (
  <span style={{ ...PILL, background: JOB_COLORS[status].bg, color: JOB_COLORS[status].fg }}>{status}</span>
);

const REQUEST_COLORS: Record<RequestStatus, { bg: string; fg: string }> = {
  [RequestStatus.Prijato]: { bg: '#FFF1CC', fg: '#7A5A00' },
  [RequestStatus.Zpracovava]: { bg: '#DDEBFA', fg: '#1F5C99' },
  [RequestStatus.Vyreseno]: { bg: '#E4F6EC', fg: '#1D7A4B' },
  [RequestStatus.Zamitnuto]: { bg: '#F6DADA', fg: '#8A2A2A' }
};

export const RequestStatusBadge: React.FC<{ status: RequestStatus }> = ({ status }) => (
  <span style={{ ...PILL, background: REQUEST_COLORS[status].bg, color: REQUEST_COLORS[status].fg }}>{status}</span>
);

export const PriorityBadge: React.FC<{ priority: string }> = ({ priority }) => {
  const c = priority === 'Havárie' ? { bg: '#F6DADA', fg: '#8A2A2A' } : priority === 'Vysoká' ? { bg: '#FDE4CF', fg: '#8A4B12' } : priority === 'Nízká' ? { bg: '#EEEEEE', fg: '#555555' } : { bg: '#E8EEF4', fg: '#34506B' };
  return <span style={{ ...PILL, background: c.bg, color: c.fg }}>{priority}</span>;
};

/** Druh listu: plánovaná práce je v paušálu, nahodilá mimo něj. */
export const JobKindBadge: React.FC<{ kind?: string }> = ({ kind }) => {
  const planned = kind === 'Plánovaná';
  return (
    <span style={{ ...PILL, background: planned ? '#E4F6EC' : '#FDE4CF', color: planned ? '#1D7A4B' : '#8A4B12' }} title={planned ? 'Plánovaná práce — v paušálu' : 'Nahodilá práce — mimo paušál'}>
      {planned ? 'Plánovaná (paušál)' : 'Nahodilá'}
    </span>
  );
};

const SLA_COLORS = { running: '#34506B', warning: '#8A4B12', breached: '#8A2A2A', met: '#1D7A4B', metLate: '#8A4B12', none: '#9AA3AD' } as const;

const slaText = (name: string, p: SlaPart): string => {
  switch (p.state) {
    case 'none':
      return '';
    case 'met':
      return `${name} splněna (${formatHours(p.elapsedHours)} z ${formatHours(p.limitHours as number)})`;
    case 'metLate':
      return `${name} po lhůtě (${formatHours(p.elapsedHours)} z ${formatHours(p.limitHours as number)})`;
    case 'breached':
      return `${name}: lhůta překročena (${formatHours(p.elapsedHours)} z ${formatHours(p.limitHours as number)})`;
    default:
      return `${name}: ${formatHours(p.elapsedHours)} z ${formatHours(p.limitHours as number)}`;
  }
};

/** Indikace SLA požadavku (jen informace, bez sankcí): reakce a vyřešení. */
export const SlaIndicator: React.FC<{ progress: SlaProgress }> = ({ progress }) => {
  const parts: [string, SlaPart][] = [['Reakce', progress.reaction], ['Vyřešení', progress.resolve]];
  const shown = parts.filter(([, p]) => p.state !== 'none');
  if (shown.length === 0) {
    return <span style={{ color: RES.gray }}>—</span>;
  }
  return (
    <div style={{ fontSize: 12 }}>
      {shown.map(([name, p]) => (
        <div key={name} style={{ color: SLA_COLORS[p.state], fontWeight: p.state === 'breached' ? 600 : 400 }}>
          {slaText(name, p)}
        </div>
      ))}
    </div>
  );
};

/** Filtry přehledů Servisu: lokalita, soubor (nebo celá lokalita) a priorita. */
export const ScopeFilters: React.FC<{ sites: ServiceSite[]; devices: ServiceDevice[]; value: ServiceScope; onChange: (v: ServiceScope) => void }> = ({ sites, devices, value, onChange }) => {
  const devicesOfSite = devices.filter((d) => d.isActive && (!value.site || d.siteNumber === value.site));
  return (
    <>
      <Dropdown
        label="Lokalita"
        selectedKey={value.site}
        options={[{ key: '', text: 'Všechny lokality' }, ...sites.filter((s) => s.isActive).map((s) => ({ key: s.number, text: `${s.number} ${s.name}` }))]}
        onChange={(_, o) => o && onChange({ ...value, site: String(o.key), device: '' })}
        styles={{ root: { width: 220 } }}
      />
      <Dropdown
        label="Soubor"
        selectedKey={value.device}
        options={[{ key: '', text: 'Všechny soubory' }, { key: SITE_WIDE_FILTER, text: 'Celá lokalita (bez souboru)' }, ...devicesOfSite.map((d) => ({ key: d.number, text: `${d.number} ${d.name}` }))]}
        onChange={(_, o) => o && onChange({ ...value, device: String(o.key) })}
        styles={{ root: { width: 220 } }}
      />
      <Dropdown
        label="Priorita"
        selectedKey={value.priority}
        options={[{ key: '', text: 'Všechny priority' }, ...REQUEST_PRIORITIES.map((k) => ({ key: k, text: k }))]}
        onChange={(_, o) => o && onChange({ ...value, priority: String(o.key) })}
        styles={{ root: { width: 150 } }}
      />
    </>
  );
};

export const ContractBadge: React.FC<{ state: ContractState }> = ({ state }) => {
  const c = state === 'vyprsela' ? { bg: '#F6DADA', fg: '#8A2A2A' } : state === 'konci' ? { bg: '#FFF1CC', fg: '#7A5A00' } : state === 'platna' ? { bg: '#E4F6EC', fg: '#1D7A4B' } : { bg: '#EEEEEE', fg: '#555555' };
  return <span style={{ ...PILL, background: c.bg, color: c.fg }}>{CONTRACT_STATE_LABELS[state]}</span>;
};

/** Datum do pole `<input type="date">` (RRRR-MM-DD) a zpět. */
export function dateToInput(d: Date | undefined): string {
  if (!d) {
    return '';
  }
  const m = String(d.getMonth() + 1);
  const day = String(d.getDate());
  return `${d.getFullYear()}-${m.length < 2 ? '0' + m : m}-${day.length < 2 ? '0' + day : day}`;
}

export function inputToDate(s: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)) : undefined;
}

export const DATE_INPUT: React.CSSProperties = { height: 32, border: `1px solid ${RES.grayBlue}`, borderRadius: 2, padding: '0 6px', font: 'inherit' };

/** Popisek + hodnota v detailu. */
export const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginBottom: 8 }}>
    <div style={{ fontSize: 12, color: RES.gray }}>{label}</div>
    <div style={{ fontSize: 14 }}>{children || '—'}</div>
  </div>
);

/** Pokrytí servisu smlouvou: platná smlouva zeleně, jinak upozornění (bez smlouvy, soubor mimo přílohu, smlouva vypršela). */
export const CoverageLabel: React.FC<{ coverage: ContractCoverage }> = ({ coverage }) => (
  <span style={{ color: coverage.state === 'platna' ? '#1D7A4B' : '#8A4B12', fontSize: 12, whiteSpace: 'nowrap' }}>
    {coverage.state === 'platna' ? '✓ ' : '⚠ '}
    {coverage.text}
  </span>
);

/** Jednořádkový text oříznutý na danou šířku (…); celý text se ukáže v bublině po najetí myší. */
export const Clamp: React.FC<{ width: number; tip?: React.ReactElement | string; style?: React.CSSProperties; children: React.ReactNode }> = ({ width, tip, style, children }) => {
  const box = <div style={{ maxWidth: width, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...style }}>{children}</div>;
  return tip ? (
    <TooltipHost content={tip} styles={{ root: { display: 'block' } }}>
      {box}
    </TooltipHost>
  ) : (
    box
  );
};

/** Bublina s celým textem požadavku: číslo a název, popis, lokalita a soubor, poznámka a případné uzavření bez listu. */
export const RequestTip: React.FC<{ request: ServiceRequest; place: string }> = ({ request, place }) => (
  <div style={{ maxWidth: 460, whiteSpace: 'pre-wrap', fontSize: 13, padding: 4 }}>
    <div style={{ fontWeight: 600 }}>
      {request.number} · {request.title}
    </div>
    {request.description && <div style={{ marginTop: 4 }}>{request.description}</div>}
    <div style={{ marginTop: 4, color: RES.gray }}>{place}</div>
    {request.note && <div style={{ marginTop: 4 }}>Poznámka: {request.note}</div>}
    {request.resolution && <div style={{ marginTop: 4 }}>Uzavřeno: {request.resolution}</div>}
  </div>
);
