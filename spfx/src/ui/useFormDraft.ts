/**
 * Průběžné ukládání rozepsaného formuláře do prohlížeče (viz `core/drafts`). Hook si při otevření formuláře zapamatuje
 * jeho výchozí stav; každá změna se za chvilku uloží jako koncept. Když se uživatel vrátí a koncept existuje, nabídne se
 * „Obnovit / Zahodit“ (`pending`). Po úspěšném uložení formuláře se zavolá `clear()`.
 */

import * as React from 'react';

import { DraftStorage, clearDraft, differsFromBase, loadDraft, saveDraft, stringifyDraft } from '../core/drafts';

function browserStorage(): DraftStorage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

export interface FormDraft<T> {
  /** Nalezený koncept z dřívějška (čas uložení); dokud o něm uživatel nerozhodne, nic se nepřepisuje. */
  pending?: { savedAt: number };
  restore: () => void;
  discard: () => void;
  /** Smaže koncept (po úspěšném uložení). */
  clear: () => void;
  /** Čas posledního uložení konceptu (pro nenápadnou poznámku „koncept uložen“). */
  lastSaved?: number;
  _t?: T;
}

export function useFormDraft<T>(opts: { key: string | undefined; value: T; active: boolean; onRestore: (data: T) => void }): FormDraft<T> {
  const { key, value, active, onRestore } = opts;
  const [pending, setPending] = React.useState<{ savedAt: number; data: T } | undefined>(undefined);
  const [lastSaved, setLastSaved] = React.useState<number | undefined>(undefined);
  const baseline = React.useRef<string>('');
  const suppressed = React.useRef(false);
  const timer = React.useRef<number | undefined>(undefined);
  const latest = React.useRef<{ key?: string; value: T; active: boolean }>({ key, value, active });
  latest.current = { key, value, active };
  const valueText = stringifyDraft(value);

  // Otevření formuláře: zapamatovat výchozí stav a podívat se, jestli neexistuje koncept z dřívějška.
  React.useEffect(() => {
    suppressed.current = false;
    if (!active || !key) {
      setPending(undefined);
      return undefined;
    }
    baseline.current = stringifyDraft(latest.current.value);
    const d = loadDraft<T>(browserStorage(), key);
    setPending(d && differsFromBase(JSON.parse(baseline.current), d.data) ? d : undefined);
    return undefined;
  }, [active, key]);

  // Změna hodnoty: za chvilku uložit (bez ukládání, dokud uživatel nerozhodl o nalezeném konceptu).
  React.useEffect(() => {
    if (!active || !key || pending || suppressed.current) {
      return undefined;
    }
    const storage = browserStorage();
    window.clearTimeout(timer.current);
    if (valueText === baseline.current) {
      clearDraft(storage, key);
      timer.current = undefined;
      return undefined;
    }
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      saveDraft(storage, key, latest.current.value);
      setLastSaved(Date.now());
    }, 600);
    return () => window.clearTimeout(timer.current);
  }, [valueText, active, key, pending]);

  // Zavření/odchod uprostřed psaní: čekající uložení se provede hned.
  React.useEffect(
    () => () => {
      if (timer.current !== undefined) {
        window.clearTimeout(timer.current);
        timer.current = undefined;
        const l = latest.current;
        if (l.active && l.key && !suppressed.current) {
          saveDraft(browserStorage(), l.key, l.value);
        }
      }
    },
    []
  );

  return {
    pending: pending ? { savedAt: pending.savedAt } : undefined,
    lastSaved,
    restore: () => {
      if (pending) {
        onRestore(pending.data);
        setPending(undefined);
      }
    },
    discard: () => {
      if (key) {
        clearDraft(browserStorage(), key);
      }
      setPending(undefined);
    },
    clear: () => {
      suppressed.current = true;
      window.clearTimeout(timer.current);
      timer.current = undefined;
      if (key) {
        clearDraft(browserStorage(), key);
      }
      setPending(undefined);
    }
  };
}
