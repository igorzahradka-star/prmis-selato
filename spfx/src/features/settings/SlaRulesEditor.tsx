/**
 * Editor lhůt SLA servisních požadavků (Nastavení → Servis). Každý řádek je pravidlo: druh a priorita požadavku → lhůta reakce
 * a vyřešení v hodinách. Prázdná lhůta = nesleduje se. Použije se nejpřesnější shodné pravidlo.
 */

import * as React from 'react';
import { ActionButton, IconButton } from '@fluentui/react/lib/Button';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { TextField } from '@fluentui/react/lib/TextField';

import { RES } from '../../ui/theme';
import { REQUEST_KINDS, REQUEST_PRIORITIES } from '../../core/serviceJobs';
import { SlaRule } from '../../core/serviceSla';

const ALL = '__all__';

const hoursText = (h: number | undefined): string => (h === undefined ? '' : String(h).replace('.', ','));
const parseHours = (s: string): number | undefined => {
  const t = s.trim().replace(',', '.');
  if (t === '') {
    return undefined;
  }
  const n = Number(t);
  return isFinite(n) ? n : NaN;
};

export const SlaRulesEditor: React.FC<{ rules: SlaRule[]; onChange: (rules: SlaRule[]) => void }> = ({ rules, onChange }) => {
  const set = (i: number, patch: Partial<SlaRule>): void => onChange(rules.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <div>
      <table style={{ borderCollapse: 'collapse', background: RES.white, border: `1px solid ${RES.grayBlue}` }}>
        <thead>
          <tr>
            {['Druh požadavku', 'Priorita', 'Reakce do (h)', 'Vyřešení do (h)', ''].map((h) => (
              <th key={h} style={{ textAlign: 'left', fontSize: 12, color: RES.gray, padding: '6px 8px', fontWeight: 600 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rules.map((r, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${RES.background}` }}>
              <td style={{ padding: '4px 8px' }}>
                <Dropdown
                  ariaLabel="Druh požadavku"
                  selectedKey={r.kind ?? ALL}
                  options={[{ key: ALL, text: 'Všechny druhy' }, ...REQUEST_KINDS.map((k) => ({ key: k, text: k }))]}
                  onChange={(_, o) => o && set(i, { kind: o.key === ALL ? undefined : String(o.key) })}
                  styles={{ root: { width: 200 } }}
                />
              </td>
              <td style={{ padding: '4px 8px' }}>
                <Dropdown
                  ariaLabel="Priorita"
                  selectedKey={r.priority ?? ALL}
                  options={[{ key: ALL, text: 'Všechny priority' }, ...REQUEST_PRIORITIES.map((k) => ({ key: k, text: k }))]}
                  onChange={(_, o) => o && set(i, { priority: o.key === ALL ? undefined : String(o.key) })}
                  styles={{ root: { width: 160 } }}
                />
              </td>
              <td style={{ padding: '4px 8px' }}>
                <TextField ariaLabel="Lhůta reakce v hodinách" value={hoursText(r.reactionHours)} placeholder="nesleduje se" onChange={(_, v) => set(i, { reactionHours: parseHours(v ?? '') })} styles={{ root: { width: 110 } }} />
              </td>
              <td style={{ padding: '4px 8px' }}>
                <TextField ariaLabel="Lhůta vyřešení v hodinách" value={hoursText(r.resolveHours)} placeholder="nesleduje se" onChange={(_, v) => set(i, { resolveHours: parseHours(v ?? '') })} styles={{ root: { width: 110 } }} />
              </td>
              <td style={{ padding: '4px 8px' }}>
                <IconButton iconProps={{ iconName: 'Delete' }} title="Odebrat pravidlo" ariaLabel="Odebrat pravidlo" onClick={() => onChange(rules.filter((_, k) => k !== i))} />
              </td>
            </tr>
          ))}
          {rules.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: 10, color: RES.gray, fontSize: 13 }}>
                Žádné pravidlo — SLA se nesleduje.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <ActionButton iconProps={{ iconName: 'Add' }} text="Přidat pravidlo" onClick={() => onChange([...rules, { reactionHours: 24, resolveHours: 120 }])} />
    </div>
  );
};
