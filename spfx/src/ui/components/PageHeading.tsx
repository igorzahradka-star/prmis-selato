/** Nadpis stránky s podtitulkem a místem pro hlavní akci vpravo. */

import * as React from 'react';
import { RES } from '../theme';

export interface PageHeadingProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const PageHeading: React.FC<PageHeadingProps> = ({ title, subtitle, action }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 16,
      flexWrap: 'wrap',
      marginBottom: 16
    }}
  >
    <div style={{ flex: '1 1 auto', minWidth: 0 }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: RES.text }}>{title}</h1>
      {subtitle && (
        <p style={{ margin: '4px 0 0', color: RES.gray, fontSize: 13 }}>{subtitle}</p>
      )}
    </div>
    {action && <div style={{ flex: '0 0 auto' }}>{action}</div>}
  </div>
);
