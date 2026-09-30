/**
 * Štítek stavu objednávky. Barva nikdy nestojí sama — vždy je s ní i text stavu
 * (barvoslepost, černobílý tisk).
 */

import * as React from 'react';

import { OrderStatus } from '../../core/orders';

const STYLE: Record<OrderStatus, { color: string; background: string }> = {
  [OrderStatus.Koncept]: { color: '#3F4A57', background: '#ECEFF2' },
  [OrderStatus.KeSchvaleni]: { color: '#7A5200', background: '#FDF0CC' },
  [OrderStatus.VracenoKUprave]: { color: '#8A3B00', background: '#FDE3CF' },
  [OrderStatus.Schvaleno]: { color: '#0B5D2E', background: '#D9F3E3' },
  [OrderStatus.Odeslano]: { color: '#0B4F80', background: '#D6EAF8' },
  [OrderStatus.Dodano]: { color: '#FFFFFF', background: '#1B5E3A' },
  [OrderStatus.Uzavreno]: { color: '#3F4A57', background: '#DDE3E8' },
  [OrderStatus.Zamitnuto]: { color: '#FFFFFF', background: '#C4314B' },
  [OrderStatus.Storno]: { color: '#FFFFFF', background: '#7A1712' }
};

export const OrderStatusBadge: React.FC<{ status: OrderStatus }> = ({ status }) => {
  const s = STYLE[status] || STYLE[OrderStatus.Koncept];
  return (
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
  );
};
