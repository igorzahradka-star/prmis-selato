/**
 * Automatické průběžné ukládání rozpočtu (a plánu plateb): nic se neztratí, když uživatel uprostřed zadávání odskočí jinam.
 *
 *  - po krátké pauze od poslední úpravy se rozpočet sám uloží (bez zápisu do podrobné historie);
 *  - při odchodu ze záložky se neuložené změny uloží hned;
 *  - nová záložka počká, až doběhne uložení z té předchozí (`whenFlushed`), ať nenačte starý stav;
 *  - při zavření stránky s neuloženými změnami prohlížeč upozorní.
 * Rozpočet je pracovní dokument (nezamyká se), takže průběžné ukládání nic nepodepisuje ani nenahrazuje schválení.
 */

import * as React from 'react';

const pending = new Map<string, Promise<void>>();

/** Počká na dokončení uložení rozpočtu projektu, které začalo při odchodu z některé záložky. */
export function whenFlushed(projectNumber: string): Promise<void> {
  return pending.get(projectNumber) || Promise.resolve();
}

export interface AutosaveOptions<T> {
  projectNumber: string;
  /** Lze ukládat (rozpočet existuje a uživatel ho smí upravovat). */
  enabled: boolean;
  dirty: boolean;
  value: T | undefined;
  /** Uloží hodnotu (čistě — bez změn stavu Reactu, může doběhnout i po odchodu ze záložky). Vrací nový otisk verze. */
  persist: (value: T) => Promise<string | undefined>;
  /** Uloženo — záložka si aktualizuje „uložený“ stav a otisk. */
  onSaved: (value: T, etag: string | undefined) => void;
  /** Nepovedlo se (neplatné údaje, souběh…) — záložka to ukáže; změny zůstávají v koncepti v prohlížeči. */
  onError: (message: string) => void;
  /** Je právě rozběhnuté jiné uložení (ruční)? Pak se tento tik přeskočí. */
  busy: () => boolean;
  delayMs?: number;
}

export function useAutosave<T>(o: AutosaveOptions<T>): { savedAt?: Date } {
  const [savedAt, setSavedAt] = React.useState<Date | undefined>(undefined);
  const latest = React.useRef(o);
  latest.current = o;
  const running = React.useRef(false);
  const valueText = o.value === undefined ? '' : JSON.stringify(o.value);

  React.useEffect(() => {
    if (!o.enabled || !o.dirty || o.value === undefined) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      const cur = latest.current;
      if (running.current || cur.busy() || !cur.enabled || !cur.dirty || cur.value === undefined) {
        return;
      }
      running.current = true;
      const snapshot = cur.value;
      cur
        .persist(snapshot)
        .then((etag) => {
          running.current = false;
          setSavedAt(new Date());
          latest.current.onSaved(snapshot, etag);
        })
        .catch((e: unknown) => {
          running.current = false;
          latest.current.onError(e instanceof Error ? e.message : String(e));
        });
    }, o.delayMs ?? 8000);
    return () => window.clearTimeout(timer);
  }, [valueText, o.enabled, o.dirty, o.delayMs]);

  // Odchod ze záložky / stránky: neuložené změny se uloží hned a nová záložka na to počká.
  React.useEffect(
    () => () => {
      const cur = latest.current;
      if (cur.enabled && cur.dirty && cur.value !== undefined && !running.current) {
        const p = cur
          .persist(cur.value)
          .then(() => undefined)
          .catch(() => undefined)
          .then(() => {
            pending.delete(cur.projectNumber);
          });
        pending.set(cur.projectNumber, p);
      }
    },
    []
  );

  // Zavření stránky s neuloženými změnami: prohlížeč se zeptá.
  React.useEffect(() => {
    if (!o.dirty || !o.enabled) {
      return undefined;
    }
    const handler = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [o.dirty, o.enabled]);

  return { savedAt };
}
