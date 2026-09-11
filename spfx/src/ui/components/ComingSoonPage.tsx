/**
 * Zástupná obrazovka pro moduly, které přijdou v pozdější fázi.
 *
 * Proč vůbec je: uživatel v navigaci vidí, kam aplikace směřuje, a při
 * kliknutí dostane jasnou odpověď místo prázdné stránky nebo chyby.
 */

import * as React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { RES } from '../theme';
import { PageHeading } from './PageHeading';

export interface ComingSoonPageProps {
  title: string;
  /** Ve které fázi vývoje modul vznikne, např. „Fáze 2". */
  phase: string;
  description: string;
}

export const ComingSoonPage: React.FC<ComingSoonPageProps> = ({ title, phase, description }) => (
  <>
    <PageHeading title={title} />
    <div
      style={{
        background: RES.white,
        border: `1px solid ${RES.grayBlue}`,
        borderLeft: `3px solid ${RES.blueLight}`,
        borderRadius: 4,
        padding: '20px 24px',
        maxWidth: 720
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: RES.blue, fontWeight: 600 }}>
        <Icon iconName="Clock" />
        Připravuje se — {phase}
      </div>
      <p style={{ margin: '10px 0 0', color: RES.text, lineHeight: 1.55 }}>{description}</p>
      <p style={{ margin: '10px 0 0', color: RES.gray, fontSize: 13 }}>
        Modul zatím neexistuje. Až bude hotový, objeví se tady rovnou — nic se
        nemusí doinstalovávat.
      </p>
    </div>
  </>
);
