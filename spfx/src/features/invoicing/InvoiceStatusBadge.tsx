/**
 * Štítek stavu podkladu pro fakturaci. Barva nikdy nestojí sama — vždy je s ní i text stavu
 * (barvoslepost, černobílý tisk). Po splatnosti se ke stavu přidá výstraha.
 */

import * as React from 'react';

import { InvoiceStatus } from '../../core/invoiceBases';

const STYLE: Record<InvoiceStatus, { color: string; background: string }> = {
  [InvoiceStatus.Koncept]: { color: '#3F4A57', background: '#ECEFF2' },
  [InvoiceStatus.KeKontrole]: { color: '#7A5200', background: '#FDF0CC' },
  [InvoiceStatus.Predano]: { color: '#0B4F80', background: '#D6EAF8' },
  [InvoiceStatus.Vyfakturovano]: { color: '#0B5D2E', background: '#D9F3E3' },
  [InvoiceStatus.Uhrazeno]: { color: '#FFFFFF', background: '#1B5E3A' },
  [InvoiceStatus.Storno]: { color: '#FFFFFF', background: '#7A1712' }
};

export const InvoiceStatusBadge: React.FC<{ status: InvoiceStatus; overdue?: boolean }> = ({ status, overdue }) => {
  const s = STYLE[status] || STYLE[InvoiceStatus.Koncept];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          display: 'inline-block',
          padding: '2px 10px',
          borderRadius: 12,
          background: s.background,
          color: s.color,
          fontWeight: 600,
          fontSize: 12,
          whiteSpace: 'nowrap'
        }}
      >
        {status}
      </span>
      {overdue && <span style={{ color: '#C4314B', fontWeight: 600, fontSize: 12 }}>po splatnosti</span>}
    </span>
  );
};
