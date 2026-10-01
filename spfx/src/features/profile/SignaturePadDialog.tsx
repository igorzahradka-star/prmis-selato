/**
 * Nakreslení podpisu myší, prstem nebo perem. Plátno je průhledné (podpis v dokumentu nemá bílý obdélník); výsledek je PNG.
 */

import * as React from 'react';
import { Modal } from '@fluentui/react/lib/Modal';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';

import { RES } from '../../ui/theme';
import { SIGNATURE_MAX_CHARS } from '../../core/signatures';

const WIDTH = 600;
const HEIGHT = 220;
const INK = '#0A2A5E';

export const SignaturePadDialog: React.FC<{ onUse: (dataUrl: string) => void; onCancel: () => void }> = ({ onUse, onCancel }) => {
  const [canvasEl, setCanvasEl] = React.useState<HTMLCanvasElement | null>(null);
  const drawing = React.useRef(false);
  const last = React.useRef<{ x: number; y: number } | undefined>(undefined);
  const [drawn, setDrawn] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  const point = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * WIDTH, y: ((e.clientY - rect.top) / rect.height) * HEIGHT };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) {
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Zachycení ukazatele není podmínkou kreslení.
    }
    drawing.current = true;
    const p = point(e);
    last.current = p;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
    ctx.fill();
    setDrawn(true);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!drawing.current || !last.current) {
      return;
    }
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) {
      return;
    }
    const p = point(e);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  const onUp = (): void => {
    drawing.current = false;
    last.current = undefined;
  };

  const clear = (): void => {
    const ctx = canvasEl ? canvasEl.getContext('2d') : null;
    if (canvasEl && ctx) {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
    }
    setDrawn(false);
    setError(undefined);
  };

  const use = (): void => {
    if (!canvasEl) {
      return;
    }
    const url = canvasEl.toDataURL('image/png');
    if (url.length > SIGNATURE_MAX_CHARS) {
      setError('Podpis je příliš složitý a obrázek je velký. Nakreslete ho znovu, jednodušeji.');
      return;
    }
    onUse(url);
  };

  return (
    <Modal isOpen onDismiss={onCancel} isBlocking styles={{ main: { width: 'min(660px, 96vw)' } }}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontWeight: 600, color: RES.navy, fontSize: 16 }}>Nakreslete svůj podpis</div>
        <div style={{ fontSize: 13, color: RES.gray }}>Podepište se do rámečku myší, prstem nebo perem. Pozadí zůstane průhledné.</div>
        {error && <div style={{ color: RES.red, fontSize: 13 }}>{error}</div>}
        <div style={{ border: `1px dashed ${RES.grayBlue}`, borderRadius: 4, background: '#fff', lineHeight: 0 }}>
          <canvas
            ref={setCanvasEl}
            width={WIDTH}
            height={HEIGHT}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            style={{ width: '100%', touchAction: 'none', cursor: 'crosshair', display: 'block' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <DefaultButton text="Smazat a začít znovu" onClick={clear} disabled={!drawn} />
          <PrimaryButton text="Použít podpis" onClick={use} disabled={!drawn} />
          <DefaultButton text="Zrušit" onClick={onCancel} />
        </div>
      </div>
    </Modal>
  );
};
