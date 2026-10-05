/**
 * Široká tabulka s **vodorovným posuvníkem, který je vždy vidět** u dolního okraje obrazovky.
 *
 * Běžný posuvník je až na konci tabulky, takže u dlouhé tabulky (nebo při zvětšeném písmu a nižší šířce okna) se musí sjet
 * dolů, posunout doprava a vrátit se. Tady je pod tabulkou jediný vodorovný posuvník, který se lepí na dolní okraj okna,
 * dokud je tabulka vidět. Vlastní vodorovný posuvník tabulky je vypnutý (`overflow-x: hidden`) — tabulka se dá posouvat
 * jen tímto posuvníkem, kolečkem se Shiftem a vodorovným gestem na touchpadu. Dvojice posuvníků se tak nemůže „hádat“.
 *
 * Bez `scrollSelector` se obalí `children` vlastním rolovacím elementem (pro běžné `<table>`). S `scrollSelector`
 * (např. `.ms-DetailsList` u seznamů Fluent UI) se propojí s rolovacím elementem uvnitř `children`.
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
  style.textContent = '.prm-hscroll-host .ms-DetailsList{overflow-x:hidden !important}.prm-hscroll-bar{scrollbar-width:auto}';
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
  const [sizes, setSizes] = React.useState({ scroll: 0, client: 0, vbar: 0 });

  const scroller = React.useCallback((): HTMLElement | null => {
    if (!scrollSelector) {
      return ownRef.current;
    }
    return hostRef.current ? (hostRef.current.querySelector(scrollSelector) as HTMLElement | null) : null;
  }, [scrollSelector]);

  React.useEffect(() => {
    ensureStyle();
    let target: HTMLElement | null = null;
    const bar = barRef.current;

    const measure = (): void => {
      const t = scroller();
      if (!t) {
        return;
      }
      const vbar = Math.max(0, t.offsetWidth - t.clientWidth);
      setSizes((cur) => (cur.scroll === t.scrollWidth && cur.client === t.clientWidth && cur.vbar === vbar ? cur : { scroll: t.scrollWidth, client: t.clientWidth, vbar }));
    };
    // Přenáší se jen skutečný rozdíl (víc než 1 px) — zaokrouhlování při zvětšeném písmu by jinak posuvníky přehazovalo sem a tam.
    const fromTarget = (): void => {
      if (target && bar && Math.abs(bar.scrollLeft - target.scrollLeft) > 1) {
        bar.scrollLeft = target.scrollLeft;
      }
    };
    const fromBar = (): void => {
      if (target && bar && Math.abs(bar.scrollLeft - target.scrollLeft) > 1) {
        target.scrollLeft = bar.scrollLeft;
      }
    };
    // Vlastní posuvník tabulky je vypnutý, proto se vodorovné gesto (touchpad, Shift + kolečko) předává ručně.
    const onWheel = (e: WheelEvent): void => {
      const t = target;
      if (!t || t.scrollWidth <= t.clientWidth) {
        return;
      }
      const dx = e.deltaX !== 0 ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (dx === 0 || (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX))) {
        return;
      }
      t.scrollLeft += dx;
      e.preventDefault();
    };
    const attach = (): void => {
      const t = scroller();
      if (t === target) {
        return;
      }
      if (target) {
        target.removeEventListener('scroll', fromTarget);
        target.removeEventListener('wheel', onWheel);
      }
      target = t;
      if (target) {
        target.addEventListener('scroll', fromTarget, { passive: true });
        target.addEventListener('wheel', onWheel, { passive: false });
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
        target.removeEventListener('wheel', onWheel);
      }
    };
  }, [scroller]);

  const overflowing = sizes.scroll > sizes.client + 1;

  // Když se posuvník objeví, nastaví se na stejné místo jako tabulka.
  React.useEffect(() => {
    const t = scroller();
    if (overflowing && t && barRef.current) {
      barRef.current.scrollLeft = t.scrollLeft;
    }
  }, [overflowing, scroller]);

  const frame: React.CSSProperties = { background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, ...frameStyle };

  return (
    <div ref={hostRef} className="prm-hscroll-host" style={frame}>
      {scrollSelector ? (
        children
      ) : (
        <div ref={ownRef} className="prm-hscroll-own" style={{ overflowX: 'hidden', overflowY: 'auto', maxHeight }}>
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
          // Svislý posuvník tabulky ubírá šířku — stejně se zkrátí i tento posuvník, aby měly oba stejný rozsah.
          marginRight: sizes.vbar,
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
