/**
 * Kreslení: prázdný náčrt nebo poznámky přímo do fotky (šipka, zakroužkování, popis závady — podobně jako v aplikacích
 * pro stavby). Funguje prstem i myší; výsledek je obrázek, který se připojí k bodu zápisu.
 *
 * Nástroje: pero (volná čára), rovná čára, obdélník (s Shiftem čtverec), kolečko, text (písmo Arial, tři velikosti)
 * a guma (čtvercová, tři velikosti — maže jen to, co se přejede; u fotky se pod gumou vrací původní fotka).
 * Tvary se táhnou myší nebo prstem a při tažení je vidět náhled; poslední krok jde vrátit tlačítkem Zpět.
 */

import * as React from 'react';
import { Modal } from '@fluentui/react/lib/Modal';
import { PrimaryButton, DefaultButton, IconButton } from '@fluentui/react/lib/Button';
import { TextField } from '@fluentui/react/lib/TextField';

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

type Tool = 'pero' | 'cara' | 'obdelnik' | 'kolo' | 'text' | 'guma';

const TOOLS: { key: Tool; label: string; icon: string }[] = [
  { key: 'pero', label: 'Pero', icon: 'Edit' },
  { key: 'cara', label: 'Čára', icon: 'Remove' },
  { key: 'obdelnik', label: 'Obdélník', icon: 'RectangleShape' },
  { key: 'kolo', label: 'Kolečko', icon: 'CircleRing' },
  { key: 'text', label: 'Text', icon: 'Font' },
  { key: 'guma', label: 'Guma', icon: 'EraseTool' }
];

const COLORS = ['#D32F2F', '#0268A6', '#111111', '#2E7D32', '#F9A825', '#FFFFFF'];
const WIDTHS = [
  { label: 'Tenká', value: 3 },
  { label: 'Střední', value: 6 },
  { label: 'Silná', value: 12 }
];
/** Velikosti textu v bodech plátna (plátno je široké 1 200 až 1 600 bodů). */
const TEXT_SIZES = [
  { label: 'Malý', value: 28 },
  { label: 'Střední', value: 48 },
  { label: 'Velký', value: 84 }
];
/** Strana čtvercové gumy v bodech plátna. */
const ERASER_SIZES = [
  { label: 'Malá', value: 30 },
  { label: 'Střední', value: 80 },
  { label: 'Velká', value: 160 }
];
const TEXT_FONT = 'Arial, Helvetica, sans-serif';
const BLANK = { width: 1200, height: 800 };
const MAX_UNDO = 20;

interface Pt {
  x: number;
  y: number;
}

/** Vykreslí tvar od bodu `a` k bodu `b`; Shift dělá z obdélníku čtverec. */
function drawShape(ctx: CanvasRenderingContext2D, tool: Tool, a: Pt, b: Pt, color: string, width: number, square: boolean): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (tool === 'cara') {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  } else if (tool === 'obdelnik') {
    let w = b.x - a.x;
    let h = b.y - a.y;
    if (square) {
      const side = Math.max(Math.abs(w), Math.abs(h));
      w = w < 0 ? -side : side;
      h = h < 0 ? -side : side;
    }
    ctx.rect(a.x, a.y, w, h);
  } else if (tool === 'kolo') {
    // Kolečko se středem v místě stisknutí a poloměrem podle vzdálenosti, kam se dotáhlo.
    const r = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
    ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
  }
  ctx.stroke();
}

export const SketchDialog: React.FC<SketchDialogProps> = ({ background, title, onSave, onCancel }) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  // Okno se vykresluje do samostatné vrstvy až po prvním průchodu, takže plátno zpočátku neexistuje — proto stav, ne jen odkaz.
  const [canvasEl, setCanvasEl] = React.useState<HTMLCanvasElement | null>(null);
  const setCanvas = (el: HTMLCanvasElement | null): void => {
    canvasRef.current = el;
    setCanvasEl(el);
  };
  const drawing = React.useRef(false);
  const last = React.useRef<Pt | undefined>(undefined);
  const shapeStart = React.useRef<Pt | undefined>(undefined);
  const shapeBase = React.useRef<ImageData | undefined>(undefined);
  const undo = React.useRef<ImageData[]>([]);
  /** Podklad bez kresby (fotka nebo bílý list) — gumou se z něj obnovuje to, co se přejede. */
  const baseRef = React.useRef<HTMLCanvasElement | undefined>(undefined);
  const [tool, setTool] = React.useState<Tool>('pero');
  const [color, setColor] = React.useState(COLORS[0]);
  const [width, setWidth] = React.useState(WIDTHS[1].value);
  const [textSize, setTextSize] = React.useState(TEXT_SIZES[1].value);
  const [eraserSize, setEraserSize] = React.useState(ERASER_SIZES[1].value);
  const [eraserHover, setEraserHover] = React.useState<{ left: number; top: number; size: number } | undefined>(undefined);
  const [textBox, setTextBox] = React.useState<{ at: Pt; left: number; top: number; value: string } | undefined>(undefined);
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
      // Kopie podkladu pro gumu.
      const base = document.createElement('canvas');
      base.width = w;
      base.height = h;
      const bctx = base.getContext('2d');
      if (bctx) {
        bctx.drawImage(canvas, 0, 0);
        baseRef.current = base;
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

  const point = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * canvas.width, y: ((e.clientY - rect.top) / rect.height) * canvas.height };
  };

  const pushUndo = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void => {
    undo.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undo.current.length > MAX_UNDO) {
      undo.current.shift();
    }
    setCanUndo(true);
  };

  /** Vloží napsaný text do plátna (Arial, zvolená velikost a barva, s obrysem kvůli čitelnosti na fotce). */
  const commitText = (): void => {
    const canvas = canvasRef.current;
    const ctx = canvas ? canvas.getContext('2d') : null;
    const box = textBox;
    setTextBox(undefined);
    if (!canvas || !ctx || !box || box.value.trim() === '') {
      return;
    }
    pushUndo(ctx, canvas);
    ctx.font = `bold ${textSize}px ${TEXT_FONT}`;
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, textSize / 7);
    ctx.strokeStyle = color.toUpperCase() === '#FFFFFF' ? '#000000' : '#FFFFFF';
    ctx.fillStyle = color;
    box.value.split('\n').forEach((line, i) => {
      const y = box.at.y + i * textSize * 1.2;
      ctx.strokeText(line, box.at.x, y);
      ctx.fillText(line, box.at.x, y);
    });
  };

  /** Smaže čtverec kolem bodu: vrátí do něj podklad. Mezi dvěma body se maže po malých krocích, ať po rychlém tahu nezůstanou mezery. */
  const erase = (ctx: CanvasRenderingContext2D, from: Pt, to: Pt): void => {
    const base = baseRef.current;
    if (!base) {
      return;
    }
    const s = eraserSize;
    const dist = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    const steps = Math.max(1, Math.ceil(dist / (s / 3)));
    for (let i = 1; i <= steps; i++) {
      const x = Math.round(from.x + ((to.x - from.x) * i) / steps - s / 2);
      const y = Math.round(from.y + ((to.y - from.y) * i) / steps - s / 2);
      const sx = Math.max(0, x);
      const sy = Math.max(0, y);
      const ex = Math.min(base.width, x + s);
      const ey = Math.min(base.height, y + s);
      if (ex > sx && ey > sy) {
        ctx.drawImage(base, sx, sy, ex - sx, ey - sy, sx, sy, ex - sx, ey - sy);
      }
    }
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const canvas = e.currentTarget;
    const ctx = canvas.getContext('2d');
    if (!ctx || !ready) {
      return;
    }
    if (tool === 'text') {
      // Klik určí místo textu; napíše se do políčka nad plátnem a po Enteru se vloží.
      if (textBox) {
        commitText();
      }
      const parent = canvas.parentElement ? canvas.parentElement.getBoundingClientRect() : canvas.getBoundingClientRect();
      setTextBox({ at: point(e), left: e.clientX - parent.left, top: e.clientY - parent.top, value: '' });
      return;
    }
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Zachycení ukazatele není podmínkou kreslení (např. u některých pera a dotykových zařízení selže).
    }
    pushUndo(ctx, canvas);
    drawing.current = true;
    const p = point(e);
    last.current = p;
    if (tool === 'guma') {
      erase(ctx, p, p);
    } else if (tool === 'pero') {
      // Jediné kliknutí udělá tečku.
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      shapeStart.current = p;
      shapeBase.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (tool === 'guma') {
      // Čtvereček pod ukazatelem ukazuje, co guma smaže.
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const parent = canvas.parentElement ? canvas.parentElement.getBoundingClientRect() : rect;
      const size = (eraserSize / canvas.width) * rect.width;
      setEraserHover({ left: e.clientX - parent.left - size / 2, top: e.clientY - parent.top - size / 2, size });
    }
    if (!drawing.current || !last.current) {
      return;
    }
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) {
      return;
    }
    const p = point(e);
    if (tool === 'guma') {
      erase(ctx, last.current, p);
    } else if (tool === 'pero') {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else if (shapeStart.current && shapeBase.current) {
      // Náhled tvaru: vrátí se stav před tažením a tvar se nakreslí znovu do aktuálního bodu.
      ctx.putImageData(shapeBase.current, 0, 0);
      drawShape(ctx, tool, shapeStart.current, p, color, width, e.shiftKey);
    }
    last.current = p;
  };

  const onUp = (): void => {
    const canvas = canvasRef.current;
    const ctx = canvas ? canvas.getContext('2d') : null;
    // Tvar bez rozměru (jen klik) se zahodí i s krokem zpět.
    if (drawing.current && tool !== 'pero' && tool !== 'guma' && ctx && shapeStart.current && last.current && shapeBase.current) {
      const moved = Math.abs(last.current.x - shapeStart.current.x) + Math.abs(last.current.y - shapeStart.current.y);
      if (moved < 3) {
        ctx.putImageData(shapeBase.current, 0, 0);
        undo.current.pop();
        setCanUndo(undo.current.length > 0);
      }
    }
    drawing.current = false;
    last.current = undefined;
    shapeStart.current = undefined;
    shapeBase.current = undefined;
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
    // Rozepsaný, ještě nevložený text se vloží, ať nezmizí.
    if (textBox && textBox.value.trim() !== '') {
      commitText();
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {TOOLS.map((t) => (
            <DefaultButton
              key={t.key}
              text={t.label}
              iconProps={{ iconName: t.icon }}
              checked={tool === t.key}
              onClick={() => {
                if (textBox) {
                  commitText();
                }
                setTool(t.key);
              }}
              styles={{ root: { minWidth: 0, padding: '0 10px' } }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {tool !== 'guma' && COLORS.map((c) => (
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
          {tool === 'guma'
            ? ERASER_SIZES.map((s) => (
                <DefaultButton
                  key={s.value}
                  text={s.label}
                  title="Velikost gumy"
                  checked={eraserSize === s.value}
                  onClick={() => setEraserSize(s.value)}
                  styles={{ root: { minWidth: 0, padding: '0 10px' } }}
                />
              ))
            : tool === 'text'
            ? TEXT_SIZES.map((s) => (
                <DefaultButton
                  key={s.value}
                  text={s.label}
                  title="Velikost textu"
                  checked={textSize === s.value}
                  onClick={() => setTextSize(s.value)}
                  styles={{ root: { minWidth: 0, padding: '0 10px' } }}
                />
              ))
            : WIDTHS.map((w) => (
                <DefaultButton
                  key={w.value}
                  text={w.label}
                  title="Tloušťka čáry"
                  checked={width === w.value}
                  onClick={() => setWidth(w.value)}
                  styles={{ root: { minWidth: 0, padding: '0 10px' } }}
                />
              ))}
          <span style={{ flex: '1 1 auto' }} />
          <IconButton iconProps={{ iconName: 'Undo' }} title="Zpět" ariaLabel="Zpět" disabled={!canUndo} onClick={doUndo} />
          <DefaultButton text={background ? 'Smazat kresbu' : 'Smazat vše'} onClick={clear} />
        </div>

        {tool === 'text' && (
          <div style={{ fontSize: 12, color: RES.gray }}>Klikněte do obrázku, napište text a stiskněte Enter (nový řádek: Shift+Enter). Písmo Arial.</div>
        )}
        {tool === 'guma' && <div style={{ fontSize: 12, color: RES.gray }}>Táhněte přes to, co chcete smazat — maže se jen přejeté místo (čtvercová guma). Vrátit jde tlačítkem Zpět.</div>}
        {tool === 'obdelnik' && <div style={{ fontSize: 12, color: RES.gray }}>Táhněte myší nebo prstem; s klávesou Shift vznikne čtverec.</div>}
        {tool === 'kolo' && <div style={{ fontSize: 12, color: RES.gray }}>Klikněte doprostřed a táhněte — vzdálenost určí velikost kolečka.</div>}

        <div style={{ overflow: 'auto', maxHeight: '60vh', background: '#EEE', borderRadius: 4, textAlign: 'center' }}>
          <div style={{ position: 'relative', maxWidth: 940, margin: '0 auto' }}>
            <canvas
              ref={setCanvas}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              style={{ width: '100%', touchAction: 'none', background: '#fff', cursor: tool === 'text' ? 'text' : tool === 'guma' ? 'none' : 'crosshair', display: 'block' }}
              onPointerLeave={() => setEraserHover(undefined)}
            />
            {tool === 'guma' && eraserHover && (
              <div
                style={{
                  position: 'absolute',
                  left: eraserHover.left,
                  top: eraserHover.top,
                  width: eraserHover.size,
                  height: eraserHover.size,
                  border: '2px solid #D32F2F',
                  background: 'rgba(255,255,255,0.35)',
                  pointerEvents: 'none',
                  boxSizing: 'border-box'
                }}
              />
            )}
            {textBox && (
              <div style={{ position: 'absolute', left: Math.max(0, textBox.left), top: Math.max(0, textBox.top), zIndex: 2 }}>
                <TextField
                  autoFocus
                  multiline
                  rows={1}
                  autoAdjustHeight
                  placeholder="Text, např. výkop"
                  value={textBox.value}
                  onChange={(_, v) => setTextBox((cur) => (cur ? { ...cur, value: v ?? '' } : cur))}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' && !ev.shiftKey) {
                      ev.preventDefault();
                      commitText();
                    } else if (ev.key === 'Escape') {
                      ev.preventDefault();
                      ev.stopPropagation();
                      setTextBox(undefined);
                    }
                  }}
                  styles={{ root: { width: 220 }, field: { fontFamily: TEXT_FONT } }}
                />
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <PrimaryButton text="Uložit a vložit do zápisu" disabled={!ready} onClick={save} />
          <DefaultButton text="Zrušit" onClick={onCancel} />
        </div>
      </div>
    </Modal>
  );
};
