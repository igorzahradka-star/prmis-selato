/**
 * Široká tabulka s **vodorovným posuvníkem, který je vždy vidět** u dolního okraje obrazovky.
 *
 * Běžný posuvník je až na konci tabulky, takže u dlouhé tabulky (nebo při zvětšeném písmu a nižší šířce okna) se musí sjet
 * dolů, posunout doprava a vrátit se. Tady je nad/pod tabulkou „zrcadlový“ posuvník, který se lepí na dolní okraj okna,
 * dokud je tabulka vidět, a je propojený s tabulkou (posun jedním posune druhý). Funguje myší i dotykem; původní
 * posuvník tabulky se skryje.
 *
 * Bez \`scrollSelector\` se obalí \`children\` vlastním rolovacím elementem (pro běžné \`<table>\`). S \`scrollSelector\`
 * (např. \`.ms-DetailsList\` u seznamů Fluent UI) se propojí s rolovacím elementem uvnitř \`children\`.
 */

import * as React from 'react';

import { RES } from '../theme';

const STYLE_ID = 'prm-hscroll-style';

function ensureStyle(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    '.prm-hscroll-own::-webkit-scrollbar:horizontal,.prm-hscroll-host .ms-DetailsList::-webkit-scrollbar:horizontal{height:0}' +
    '.prm-hscroll-host .ms-DetailsList{scrollbar-width:thin}' +
    '.prm-hscroll-bar{scrollbar-width:auto}';
  document.head.appendChild(style);
}

export const StickyHScroll: React.FC<{
  children: React.ReactNode;
  /** Selektor rolovacího elementu uvnitř `children` (např. `.ms-DetailsList`); bez něj se `children` obalí. */
  scrollSelector?: string;
  /** Styl vnějšího rámečku (výchozí: bílý s ohraničením). */
  frameStyle?: React.CSSProperties;
  /** Nejvyšší výška rolované oblasti (jen bez `scrollSelector`); tabulka se pak roluje i svisle. */
  maxHeight?: number | string;
}> = ({ children, scrollSelector, frameStyle, maxHeight }) => {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const ownRef = React.useRef<HTMLDivElement>(null);
  const barRef = React.useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = React.useState({ scroll: 0, client: 0 });

  const scroller = React.useCallback((): HTMLElement | null => {
    if (!scrollSelector) {
      return ownRef.current;
    }
    return hostRef.current ? (hostRef.current.querySelector(scrollSelector) as HTMLElement | null) : null;
  }, [scrollSelector]);

  React.useEffect(() => {
    ensureStyle();
    let target: HTMLElement | null = null;
    let syncing = false;
    const bar = barRef.current;

    const measure = (): void => {
      const t = scroller();
      if (!t) {
        return;
      }
      setSizes((cur) => (cur.scroll === t.scrollWidth && cur.client === t.clientWidth ? cur : { scroll: t.scrollWidth, client: t.clientWidth }));
    };
    const fromTarget = (): void => {
      if (syncing || !target || !bar) {
        return;
      }
      syncing = true;
      bar.scrollLeft = target.scrollLeft;
      window.requestAnimationFrame(() => (syncing = false));
    };
    const fromBar = (): void => {
      if (syncing || !target || !bar) {
        return;
      }
      syncing = true;
      target.scrollLeft = bar.scrollLeft;
      window.requestAnimationFrame(() => (syncing = false));
    };
    const attach = (): void => {
      const t = scroller();
      if (t === target) {
        return;
      }
      if (target) {
        target.removeEventListener('scroll', fromTarget);
      }
      target = t;
      if (target) {
        target.addEventListener('scroll', fromTarget, { passive: true });
      }
      measure();
    };

    attach();
    if (bar) {
      bar.addEventListener('scroll', fromBar, { passive: true });
    }
    // Obsah tabulky se mění (načtení dat, rozbalení skupin, změna okna) — rozměry se průběžně přeměřují.
    const timer = window.setInterval(() => {
      attach();
      measure();
    }, 400);
    const onResize = (): void => measure();
    window.addEventListener('resize', onResize);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', onResize);
      if (bar) {
        bar.removeEventListener('scroll', fromBar);
      }
      if (target) {
        target.removeEventListener('scroll', fromTarget);
      }
    };
  }, [scroller]);

  const overflowing = sizes.scroll > sizes.client + 1;
  const frame: React.CSSProperties = { background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, ...frameStyle };

  return (
    <div ref={hostRef} className="prm-hscroll-host" style={frame}>
      {scrollSelector ? (
        children
      ) : (
        <div ref={ownRef} className="prm-hscroll-own" style={{ overflow: 'auto', maxHeight }}>
          {children}
        </div>
      )}
      <div
        ref={barRef}
        className="prm-hscroll-bar"
        aria-hidden="true"
        title="Posun tabulky doprava a doleva"
        style={{
          position: 'sticky',
          bottom: 0,
          zIndex: 6,
          overflowX: 'scroll',
          overflowY: 'hidden',
          height: overflowing ? 18 : 0,
          visibility: overflowing ? 'visible' : 'hidden',
          background: RES.white,
          borderTop: overflowing ? `1px solid ${RES.grayBlue}` : 'none'
        }}
      >
        <div style={{ width: sizes.scroll, height: 1 }} />
      </div>
    </div>
  );
};
