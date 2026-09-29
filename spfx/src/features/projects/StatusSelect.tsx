/**
 * Stav projektu jako přepínač přímo v seznamu — stav se mění nejčastěji,
 * a otevírat kvůli tomu detail projektu je zbytečná cesta.
 *
 * Vypadá jako štítek stavu (stejné barvy), ale po kliknutí nabídne ostatní stavy.
 * Kdo projekt upravovat nesmí, vidí obyčejný štítek bez přepínače.
 */

import * as React from 'react';

import { StatusBadge } from '../../ui/components/StatusBadge';
import { ProjectStatus } from '../../core/types';
import { STATUS_ORDER, statusStyle } from '../../core/geo';
import { statusChoices } from '../../core/projectStatus';

export interface StatusSelectProps {
  status: ProjectStatus;
  projectNumber: string;
  /** Smí přihlášený uživatel stav měnit? Bez oprávnění se ukáže jen štítek. */
  canEdit: boolean;
  /** Probíhá uložení — přepínač se zamkne, aby se změny nepřebíjely. */
  busy: boolean;
  onChange: (status: ProjectStatus) => void;
}

export const StatusSelect: React.FC<StatusSelectProps> = ({ status, projectNumber, canEdit, busy, onChange }) => {
  if (!canEdit) {
    return <StatusBadge status={status} />;
  }
  const palette = statusStyle(status);
  return (
    <select
      value={status}
      disabled={busy}
      aria-label={`Stav projektu ${projectNumber}`}
      title="Kliknutím změníte stav projektu"
      onChange={(e) => onChange(e.target.value as ProjectStatus)}
      style={{
        // Stejné barvy jako štítek stavu; šipku výběru nechává prohlížeč.
        background: palette.fill,
        color: palette.text,
        border: `1px solid ${palette.stroke}`,
        borderRadius: 12,
        padding: '1px 6px',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: busy ? 'progress' : 'pointer',
        opacity: busy ? 0.6 : 1,
        maxWidth: '100%'
      }}
    >
      {statusChoices(status, STATUS_ORDER).map((s) => (
        <option key={s} value={s} style={{ background: '#ffffff', color: '#1B1F2A', fontWeight: 400 }}>
          {s}
        </option>
      ))}
    </select>
  );
};
