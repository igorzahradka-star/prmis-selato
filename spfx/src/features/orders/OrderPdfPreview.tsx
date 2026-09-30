/**
 * Náhled PDF objednávky ve vlastním okně (vložený prohlížeč PDF). Kdyby ho prohlížeč nebo stránka
 * nechtěly ukázat, zůstává odkaz „Otevřít v nové záložce" a tlačítko Stáhnout.
 */

import * as React from 'react';
import { Modal } from '@fluentui/react/lib/Modal';
import { IconButton, DefaultButton } from '@fluentui/react/lib/Button';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { RES } from '../../ui/theme';

export interface OrderPdfPreviewProps {
  /** Vygenerované PDF; `undefined` = ještě se generuje. */
  blob: Blob | undefined;
  fileName: string;
  title: string;
  onDismiss: () => void;
}

export const OrderPdfPreview: React.FC<OrderPdfPreviewProps> = ({ blob, fileName, title, onDismiss }) => {
  const [url, setUrl] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return undefined;
    }
    const created = URL.createObjectURL(blob);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [blob]);

  return (
    <Modal
      isOpen
      onDismiss={onDismiss}
      isBlocking={false}
      styles={{ main: { width: 'min(900px, 94vw)', height: '90vh', overflow: 'hidden' } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${RES.grayBlue}` }}>
        <div style={{ flex: '1 1 auto', fontWeight: 600, color: RES.navy }}>{title}</div>
        {url && (
          <>
            <DefaultButton text="Stáhnout PDF" iconProps={{ iconName: 'Download' }} href={url} download={fileName} />
            <DefaultButton text="Otevřít v nové záložce" href={url} target="_blank" />
          </>
        )}
        <IconButton iconProps={{ iconName: 'Cancel' }} ariaLabel="Zavřít náhled" onClick={onDismiss} />
      </div>
      <div style={{ height: 'calc(90vh - 54px)', background: RES.background }}>
        {!url && <Spinner size={SpinnerSize.large} label="Připravuji náhled…" styles={{ root: { paddingTop: 80 } }} />}
        {url && <iframe title={title} src={url} style={{ width: '100%', height: '100%', border: 'none' }} />}
      </div>
    </Modal>
  );
};
