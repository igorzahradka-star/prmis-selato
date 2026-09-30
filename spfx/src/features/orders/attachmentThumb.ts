/**
 * Miniatura první strany PDF pro dlaždice příloh (pdf.js, Apache-2.0).
 *
 * Načítá se až při prvním použití (samostatný balíček) — kdo nemá přílohy, nestahuje ani bajt navíc.
 * Zpracovává se jedno PDF po druhém a hotové miniatury se pamatují, aby otevření objednávky nezatěžovalo prohlížeč.
 * Kdyby cokoli selhalo (poškozené PDF, heslo), dlaždice ukáže ikonu typu souboru.
 */

interface PdfPageLike {
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> };
}
interface PdfDocLike {
  getPage(n: number): Promise<PdfPageLike>;
  destroy(): Promise<void>;
}
interface PdfJsLike {
  getDocument(options: Record<string, unknown>): { promise: Promise<PdfDocLike> };
}

const cache = new Map<string, Promise<string | undefined>>();
let queue: Promise<unknown> = Promise.resolve();

/** Nejdelší strana miniatury v bodech (zobrazuje se menší, větší je kvůli ostrosti na displejích s vysokým rozlišením). */
const THUMB_SIZE = 240;

async function renderFirstPage(blob: Blob): Promise<string | undefined> {
  const [lib, worker] = await Promise.all([
    import(/* webpackChunkName: 'pdfjs' */ 'pdfjs-dist/legacy/build/pdf.min.js'),
    import(/* webpackChunkName: 'pdfjs' */ 'pdfjs-dist/legacy/build/pdf.worker.min.js')
  ]);
  // Bez samostatného souboru s workerem: pdf.js si vezme zpracování z tohoto objektu a běží v hlavním vlákně.
  (window as unknown as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
  const pdfjs = (lib.getDocument ? lib : lib.default) as PdfJsLike;
  const data = new Uint8Array(await blob.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = THUMB_SIZE / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return undefined;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    doc.destroy().catch(() => undefined);
  }
}

/**
 * Miniatura první strany PDF jako datová adresa obrázku; `undefined`, když se nepodařila.
 * `key` je stabilní adresa souboru (podle ní se výsledek pamatuje), `load` vrátí obsah souboru.
 */
export function pdfThumbnail(key: string, load: () => Promise<Blob>): Promise<string | undefined> {
  const known = cache.get(key);
  if (known) {
    return known;
  }
  const job = queue.then(() => load().then(renderFirstPage)).catch(() => undefined);
  queue = job;
  cache.set(key, job);
  return job;
}
