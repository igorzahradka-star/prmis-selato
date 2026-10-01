/**
 * Kreslení: prázdný náčrt nebo poznámky přímo do fotky (šipka, zakroužkování, popis závady — podobně jako v aplikacích
 * pro stavby). Funguje prstem i myší; výsledek je obrázek, který se připojí k bodu zápisu.
 */

import * as React from 'react';
import { Modal } from '@fluentui/react/lib/Modal';
import { PrimaryButton, DefaultButton, IconButton } from '@fluentui/react/lib/Button';

import { RES } from '../../ui/theme';
import { fitSize, loadImage } from './imageUtils';

export interface SketchDialogProps {
  /** Fotka, do které se kreslí. Bez ní je podklad prázdný bílý list. */
  background?: Blob;
  title: string;
  /** Hotový obrázek: PNG u náčrtu, JPEG u kresby do fotky. */
  onSave: (image: Blob, annotated: boolean) => void;
  onCancel: () => void;
}

const COLORS = ['#D32F2F', '#0268A6', '#111111', '#2E7D32', '#F9A825', '#FFFFFF'];
const WIDTHS = [
  { label: 'Tenká', value: 3 },
  { label: 'Střední', value: 6 },
  { label: 'Silná', value: 12 }
];
const BLANK = { width: 1200, height: 800 };
const MAX_UNDO = 20;

export const SketchDialog: React.FC<SketchDialogProps> = ({ background, title, onSave, onCancel }) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  // Okno se vykresluje do samostatné vrstvy až po prvním průchodu, takže plátno zpočátku neexistuje — proto stav, ne jen odkaz.
  const [canvasEl, setCanvasEl] = React.useState<HTMLCanvasElement | null>(null);
  const setCanvas = (el: HTMLCanvasElement | null): void => {
    canvasRef.current = el;
    setCanvasEl(el);
  };
  const drawing = React.useRef(false);
  const last = React.useRef<{ x: number; y: number } | undefined>(undefined);
  const undo = React.useRef<ImageData[]>([]);
  const [color, setColor] = React.useState(COLORS[0]);
  const [width, setWidth] = React.useState(WIDTHS[1].value);
  const [ready, setReady] = React.useState(false);
  const [canUndo, setCanUndo] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  // Podklad: fotka (zmenšená) nebo bílý list.
  React.useEffect(() => {
    let cancelled = false;
    const canvas = canvasEl;
    if (!canvas) {
      return undefined;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Prohlížeč neumí kreslit.');
      return undefined;
    }
    const start = (w: number, h: number, draw?: (c: CanvasRenderingContext2D) => void): void => {
      canvas.width = w;
      canvas.height = h;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      if (draw) {
        draw(ctx);
      }
      undo.current = [];
      setCanUndo(false);
      setReady(true);
    };
    if (background) {
      loadImage(background)
        .then((img) => {
          if (!cancelled) {
            const size = fitSize(img.naturalWidth, img.naturalHeight, 1600);
            start(size.width, size.height, (c) => c.drawImage(img, 0, 0, size.width, size.height));
          }
        })
        .catch((e: Error) => !cancelled && setError(e.message));
    } else {
      start(BLANK.width, BLANK.height);
    }
    return () => {
      cancelled = true;
    };
  }, [background, canvasEl]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * canvas.width, y: ((e.clientY - rect.top) / rect.height) * canvas.height };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const canvas = e.currentTarget;
    const ctx = canvas.getContext('2d');
    if (!ctx || !ready) {
      return;
    }
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Zachycení ukazatele není podmínkou kreslení (např. u některých pera a dotykových zařízení selže).
    }
    undo.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undo.current.length > MAX_UNDO) {
      undo.current.shift();
    }
    setCanUndo(true);
    drawing.current = true;
    last.current = point(e);
    // Jediné kliknutí udělá tečku.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, width / 2, 0, Math.PI * 2);
    ctx.fill();
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
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
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

  const doUndo = (): void => {
    const canvas = canvasRef.current;
    const ctx = canvas ? canvas.getContext('2d') : null;
    const snap = undo.current.pop();
    if (canvas && ctx && snap) {
      ctx.putImageData(snap, 0, 0);
    }
    setCanUndo(undo.current.length > 0);
  };

  const clear = (): void => {
    const canvas = canvasRef.current;
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (!canvas || !ctx) {
      return;
    }
    undo.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    setCanUndo(true);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (background) {
      // U fotky se maže jen kresba — podklad se vrací.
      loadImage(background)
        .then((img) => ctx.drawImage(img, 0, 0, canvas.width, canvas.height))
        .catch(() => undefined);
    }
  };

  const save = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const annotated = !!background;
    canvas.toBlob(
      (blob) => {
        if (blob) {
          onSave(blob, annotated);
        } else {
          setError('Obrázek se nepodařilo uložit.');
        }
      },
      annotated ? 'image/jpeg' : 'image/png',
      0.88
    );
  };

  return (
    <Modal isOpen onDismiss={onCancel} isBlocking styles={{ main: { width: 'min(980px, 96vw)', maxHeight: '96vh' } }}>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontWeight: 600, color: RES.navy, fontSize: 16 }}>{title}</div>
        {error && <div style={{ color: RES.red, fontSize: 13 }}>{error}</div>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Barva ${c}`}
              onClick={() => setColor(c)}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                background: c,
                border: color === c ? `3px solid ${RES.navy}` : '1px solid #999',
                cursor: 'pointer',
                padding: 0
              }}
            />
          ))}
          <span style={{ width: 8 }} />
          {WIDTHS.map((w) => (
            <DefaultButton
              key={w.value}
              text={w.label}
              checked={width === w.value}
              onClick={() => setWidth(w.value)}
              styles={{ root: { minWidth: 0, padding: '0 10px' } }}
            />
          ))}
          <span style={{ flex: '1 1 auto' }} />
          <IconButton iconProps={{ iconName: 'Undo' }} title="Zpět" ariaLabel="Zpět" disabled={!canUndo} onClick={doUndo} />
          <DefaultButton text={background ? 'Smazat kresbu' : 'Smazat vše'} onClick={clear} />
        </div>

        <div style={{ overflow: 'auto', maxHeight: '65vh', background: '#EEE', borderRadius: 4, textAlign: 'center' }}>
          <canvas
            ref={setCanvas}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            style={{ width: '100%', maxWidth: 940, touchAction: 'none', background: '#fff', cursor: 'crosshair', display: 'block', margin: '0 auto' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <PrimaryButton text="Uložit a vložit do zápisu" disabled={!ready} onClick={save} />
          <DefaultButton text="Zrušit" onClick={onCancel} />
        </div>
      </div>
    </Modal>
  );
};
