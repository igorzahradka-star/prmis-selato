/**
 * Pravidelné a „po návratu do okna" obnovení dat — objednávku mezitím mohl změnit někdo jiný
 * (schválil, zamítl) a seznam by jinak ukazoval starý stav, dokud člověk sám nenačte stránku.
 */

import * as React from 'react';

/** Jak často se data obnovují, když je okno vidět. */
export const AUTO_REFRESH_MS = 30000;

/**
 * Zavolá `refresh` každých `intervalMs` (jen když je karta viditelná) a vždy, když se okno znovu zobrazí
 * nebo dostane zpět pozornost. Při `paused` nedělá nic (např. když člověk zrovna upravuje formulář).
 */
export function useAutoRefresh(refresh: () => void, paused: boolean = false, intervalMs: number = AUTO_REFRESH_MS): void {
  const latest = React.useRef(refresh);
  latest.current = refresh;

  React.useEffect(() => {
    if (paused) {
      return undefined;
    }
    const visible = (): boolean => typeof document === 'undefined' || document.visibilityState !== 'hidden';
    const tick = (): void => {
      if (visible()) {
        latest.current();
      }
    };
    const timer = window.setInterval(tick, intervalMs);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [paused, intervalMs]);
}
