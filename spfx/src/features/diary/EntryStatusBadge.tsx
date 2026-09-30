/**
 * Štítek stavu zápisu. Barva nikdy nestojí sama — vždy je s ní i text stavu (barvoslepost, černobílý tisk).
 * U podepsaného zápisu se ukáže i způsob podpisu.
 */

import * as React from 'react';

import { EntryStatus, SIGNATURE_LABELS, SignatureKind } from '../../core/siteDiary';

const STYLE: Record<EntryStatus, { color: string; background: string }> = {
  [EntryStatus.Koncept]: { color: '#3F4A57', background: '#ECEFF2' },
  [EntryStatus.Uzavreno]: { color: '#7A5200', background: '#FDF0CC' },
  [EntryStatus.Podepsano]: { color: '#0B5D2E', background: '#D9F3E3' },
  [EntryStatus.Storno]: { color: '#FFFFFF', background: '#7A1712' }
};

export const EntryStatusBadge: React.FC<{ status: EntryStatus; signatureKind?: SignatureKind }> = ({ status, signatureKind }) => {
  const s = STYLE[status] || STYLE[EntryStatus.Koncept];
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
      {status === EntryStatus.Podepsano && signatureKind ? ` (${SIGNATURE_LABELS[signatureKind]})` : ''}
    </span>
  );
};
