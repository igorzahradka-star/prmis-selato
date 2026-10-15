/**
 * Editor šablon ročního plánu servisu (Nastavení → Servis). Šablona = pojmenovaný seznam činností (měsíc nebo konkrétní den, druh) pro druh souboru
 * (FVE, BESS…) nebo pro společné činnosti lokality. Šablonu lze v plánu načíst do lokality nebo souboru a upravit.
 */

import * as React from 'react';
import { ActionButton, IconButton } from '@fluentui/react/lib/Button';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { TextField } from '@fluentui/react/lib/TextField';

import { RES } from '../../ui/theme';
import { MONTH_NAMES, PLAN_JOB_KINDS, PlanTemplate, PlanTemplateItem } from '../../core/servicePlan';

const KINDS = ['FVE', 'BESS', 'MVE', 'Kogenerace', 'Jiné', 'Lokalita'];

export const PlanTemplatesEditor: React.FC<{ templates: PlanTemplate[]; onChange: (t: PlanTemplate[]) => void }> = ({ templates, onChange }) => {
  const setTemplate = (i: number, patch: Partial<PlanTemplate>): void => onChange(templates.map((t, k) => (k === i ? { ...t, ...patch } : t)));
  const setItem = (i: number, j: number, patch: Partial<PlanTemplateItem>): void => setTemplate(i, { items: templates[i].items.map((it, k) => (k === j ? { ...it, ...patch } : it)) });
  return (
    <div>
      {templates.map((t, i) => (
        <div key={i} style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: 10, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <TextField label="Název šablony" value={t.name} onChange={(_, v) => setTemplate(i, { name: v ?? '' })} styles={{ root: { flex: '1 1 260px' } }} />
            <Dropdown label="Pro druh souboru" selectedKey={t.kind} options={KINDS.map((k) => ({ key: k, text: k }))} onChange={(_, o) => o && setTemplate(i, { kind: String(o.key) })} styles={{ root: { width: 160 } }} />
            <ActionButton iconProps={{ iconName: 'Delete' }} text="Smazat šablonu" onClick={() => onChange(templates.filter((_, k) => k !== i))} />
          </div>
          <table style={{ borderCollapse: 'collapse', marginTop: 6, width: '100%' }}>
            <thead>
              <tr>
                {['Činnost', 'Měsíc', 'Den (nepovinný)', 'Druh', ''].map((h) => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 12, color: RES.gray, fontWeight: 600, padding: '4px 6px' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.items.map((it, j) => (
                <tr key={j}>
                  <td style={{ padding: '2px 6px', width: '46%' }}>
                    <TextField ariaLabel="Činnost" value={it.title} onChange={(_, v) => setItem(i, j, { title: v ?? '' })} />
                  </td>
                  <td style={{ padding: '2px 6px' }}>
                    <Dropdown ariaLabel="Měsíc" selectedKey={it.month} options={MONTH_NAMES.map((n, m) => ({ key: m + 1, text: n }))} onChange={(_, o) => o && setItem(i, j, { month: Number(o.key) })} styles={{ root: { width: 120 } }} />
                  </td>
                  <td style={{ padding: '2px 6px' }}>
                    <TextField ariaLabel="Den" value={it.day ? String(it.day) : ''} placeholder="jen měsíc" onChange={(_, v) => setItem(i, j, { day: v && Number(v) >= 1 && Number(v) <= 31 ? Math.round(Number(v)) : undefined })} styles={{ root: { width: 90 } }} />
                  </td>
                  <td style={{ padding: '2px 6px' }}>
                    <Dropdown ariaLabel="Druh" selectedKey={it.jobKind} options={PLAN_JOB_KINDS.map((k) => ({ key: k, text: k === 'Plánovaná' ? 'Plánovaná (paušál)' : 'Nahodilá' }))} onChange={(_, o) => o && setItem(i, j, { jobKind: String(o.key) })} styles={{ root: { width: 170 } }} />
                  </td>
                  <td style={{ padding: '2px 6px' }}>
                    <IconButton iconProps={{ iconName: 'Delete' }} title="Odebrat činnost" ariaLabel="Odebrat činnost" onClick={() => setTemplate(i, { items: t.items.filter((_, k) => k !== j) })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ActionButton iconProps={{ iconName: 'Add' }} text="Přidat činnost" onClick={() => setTemplate(i, { items: [...t.items, { title: '', month: 1, jobKind: 'Plánovaná' }] })} />
        </div>
      ))}
      <ActionButton iconProps={{ iconName: 'Add' }} text="Přidat šablonu" onClick={() => onChange([...templates, { name: '', kind: 'FVE', items: [{ title: '', month: 1, jobKind: 'Plánovaná' }] }])} />
    </div>
  );
};
