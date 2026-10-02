/**
 * Hlášky nad tlačítky v patě panelu (Uložit…): co chybí k uložení a co se nepovedlo.
 * Patu panelu je vidět pořád, takže uživatel hlášku nepřehlédne a netlačí na Uložit opakovaně.
 */

import * as React from 'react';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';

export const PanelMessages: React.FC<{
  /** Co chybí k uložení nebo uzavření (seznam vět). */
  issues?: string[];
  /** Chyba z posledního pokusu. */
  error?: string;
  onDismissError?: () => void;
}> = ({ issues, error, onDismissError }) => (
  <>
    {issues && issues.length > 0 && (
      <MessageBar messageBarType={MessageBarType.warning} isMultiline styles={{ root: { marginBottom: 8 } }}>
        <strong>Nejde uložit — něco chybí:</strong>
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {issues.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </MessageBar>
    )}
    {error && (
      <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={onDismissError} styles={{ root: { marginBottom: 8 } }}>
        {error}
      </MessageBar>
    )}
  </>
);
