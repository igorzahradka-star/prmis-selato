/**
 * Rozepsané formuláře: průběžné ukládání do prohlížeče, aby uživatel o zadané údaje nepřišel, když uprostřed práce
 * klikne jinam (třeba rychle vyřídit objednávku) a vrátí se. Čistá logika bez Reactu; úložiště se předává zvenku
 * (v aplikaci localStorage, v testech paměť).
 *
 * Koncept se ukládá jen v tomto prohlížeči a jen pro přihlášeného uživatele; po úspěšném uložení formuláře se smaže.
 * Starší než 14 dní se ignoruje.
 */

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Jak dlouho se koncept uchovává (dny). */
export const DRAFT_MAX_AGE_DAYS = 14;

const PREFIX = 'prm.draft.v1.';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Klíč konceptu: uživatel + druh formuláře + identifikace (číslo záznamu nebo „new“ s projektem). */
export function draftKey(login: string, kind: string, id: string | number): string {
  const who = (login || 'anonym').toLowerCase().replace(/[^a-z0-9@._-]+/g, '_');
  return PREFIX + who + '.' + kind + '.' + id;
}

/** JSON s daty (Date se uloží jako ISO text); čtení je vrací zpět na Date. */
export function stringifyDraft(value: unknown): string {
  return JSON.stringify(value);
}

export function parseDraft<T>(text: string): T {
  return JSON.parse(text, (_key, v) => (typeof v === 'string' && ISO.test(v) ? new Date(v) : v)) as T;
}

export interface StoredDraft<T> {
  savedAt: number;
  data: T;
}

export function saveDraft<T>(storage: DraftStorage | undefined, key: string, data: T, now: number = Date.now()): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(key, JSON.stringify({ savedAt: now, data: JSON.parse(stringifyDraft(data)) }));
  } catch {
    // Úložiště může být plné nebo zakázané — koncept se prostě neuloží, práci to nezastaví.
  }
}

/** Načte koncept; poškozený nebo příliš starý vrátí undefined (a starý smaže). */
export function loadDraft<T>(storage: DraftStorage | undefined, key: string, now: number = Date.now()): StoredDraft<T> | undefined {
  if (!storage) {
    return undefined;
  }
  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return undefined;
    }
    const parsed = parseDraft<StoredDraft<T>>(raw);
    if (typeof parsed.savedAt !== 'number' || now - parsed.savedAt > DRAFT_MAX_AGE_DAYS * 86400000) {
      storage.removeItem(key);
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export function clearDraft(storage: DraftStorage | undefined, key: string): void {
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(key);
  } catch {
    // Úložiště nemusí být dostupné.
  }
}

/** Je koncept jiný než výchozí stav formuláře? (Neotevřený nebo nezměněný formulář se nenabízí k obnovení.) */
export function differsFromBase(base: unknown, draft: unknown): boolean {
  return stringifyDraft(base) !== stringifyDraft(draft);
}
