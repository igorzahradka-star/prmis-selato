/** Výběr druhů partnera zaškrtávátky: zákazník, dodavatel, dodavatel servisu — lze i všechny tři. */

import * as React from 'react';
import { Checkbox } from '@fluentui/react/lib/Checkbox';

import { PartnerKinds } from '../../core/partnerKinds';

export const PartnerKindPicker: React.FC<{ value: PartnerKinds; onChange: (k: PartnerKinds) => void; error?: boolean }> = ({ value, onChange, error }) => (
  <div>
    <div style={{ fontWeight: 600, marginBottom: 4 }}>Druh partnera</div>
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
      <Checkbox label="Zákazník" checked={value.customer} onChange={(_, c) => onChange({ ...value, customer: !!c })} />
      <Checkbox label="Dodavatel" checked={value.supplier} onChange={(_, c) => onChange({ ...value, supplier: !!c })} />
      <Checkbox label="Dodavatel servisu" checked={value.serviceSupplier} onChange={(_, c) => onChange({ ...value, serviceSupplier: !!c })} />
    </div>
    <div style={{ fontSize: 12, color: error ? '#C4314B' : '#5A6472', marginTop: 4 }}>
      {error ? 'Zaškrtněte aspoň jeden druh.' : 'Dodavatelé servisu se nabízejí přednostně v servisních listech a v objednávkách servisu.'}
    </div>
  </div>
);
