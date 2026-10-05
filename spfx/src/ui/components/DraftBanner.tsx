/**
 * Upozornění na rozepsaný koncept formuláře s volbou Obnovit / Zahodit (viz `ui/useFormDraft`).
 */

import * as React from 'react';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';

import { formatDateTime } from '../../core/format';

export const DraftBanner: React.FC<{ savedAt: number; onRestore: () => void; onDiscard: () => void; what?: string }> = ({ savedAt, onRestore, onDiscard, what = 'formulář' }) => (
  <MessageBar
    messageBarType={MessageBarType.warning}
    isMultiline
    actions={
      <div style={{ display: 'flex', gap: 6 }}>
        <PrimaryButton text="Obnovit" onClick={onRestore} />
        <DefaultButton text="Zahodit" onClick={onDiscard} />
      </div>
    }
  >
    <strong>Našli jsme rozepsaný {what}</strong> ({formatDateTime(new Date(savedAt))}) — nebyl uložený, protože jste ho opustili. Chcete ho obnovit?
  </MessageBar>
);
