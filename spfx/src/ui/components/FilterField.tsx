/**
 * Prvek filtru s popiskem nad ovládacím prvkem. Všechny prvky ve filtru mají stejnou výšku (`CONTROL_HEIGHT`),
 * aby se políčka různých typů (hledání, nabídka, datum, přepínač, tlačítko) zarovnala na jednu linii.
 */

import * as React from 'react';

import { RES } from '../theme';

/** Výška ovládacích prvků ve filtru. */
export const CONTROL_HEIGHT = 32;

/** Prázdný popisek drží místo, aby tlačítka seděla na stejné linii jako ostatní prvky. */
export const FilterField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    <div style={{ fontSize: 14, fontWeight: 600, lineHeight: '22px', height: 22, color: RES.text }}>{label}</div>
    {children}
  </div>
);
