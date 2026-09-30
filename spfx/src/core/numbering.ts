/**
 * Číslování dokladů a generování názvu/složky projektu — zadání kap. 7.
 *
 * Čistá logika bez závislosti na SharePointu. Přidělení čísla (čtení a zápis
 * čítače s optimistickým zámkem) dělá repozitář — tady je jen výpočet.
 */

/** Nastavení jedné číselné řady (z PRM_DocTypes). */
export interface NumberFormat {
  /** Vzor s tokeny {PREFIX} {YYYY} {YY} {N} {PRJ}. */
  pattern: string;
  /** Na kolik míst doplnit {N} nulami zleva. */
  padding: number;
  resetPeriod: 'Ročně' | 'Nikdy';
  scope: 'Globální' | 'Projekt';
  /** Počáteční hodnota — pro navázání na dosavadní číslování. */
  startValue: number;
}

/** Hodnoty, které se dosadí do tokenů vzoru čísla dokladu. */
export interface NumberTokens {
  /** Kód typu dokladu (PRJ, OBJ, FP…) pro token {PREFIX}. */
  prefix?: string;
  year: number;
  /** Pořadové číslo v řadě — dosadí se do {N}. */
  sequence: number;
  /** Číslo nadřazeného projektu pro token {PRJ} (např. u protokolů). */
  projectNumber?: string;
}

const DOC_NUMBER_TOKENS = /\{PREFIX\}|\{YYYY\}|\{YY\}|\{N\}|\{PRJ\}/g;

/** Složí číslo dokladu podle vzoru. Např. `{YY}-{N}` + rok 2026, pořadí 14 → `26-014`. */
export function renderDocumentNumber(
  format: Pick<NumberFormat, 'pattern' | 'padding'>,
  tokens: NumberTokens
): string {
  return format.pattern.replace(DOC_NUMBER_TOKENS, (token) => {
    switch (token) {
      case '{PREFIX}':
        return tokens.prefix ?? '';
      case '{YYYY}':
        return String(tokens.year);
      case '{YY}':
        return String(tokens.year).slice(-2);
      case '{N}':
        return padWithZeros(tokens.sequence, format.padding);
      case '{PRJ}':
        return tokens.projectNumber ?? '';
      default:
        return token;
    }
  });
}

/** Doplní číslo nulami zleva na daný počet míst. (`padStart` není v cílové knihovně SPFx.) */
function padWithZeros(value: number, length: number): string {
  let result = String(value);
  while (result.length < length) {
    result = `0${result}`;
  }
  return result;
}

/** Poslední přidělená hodnota v řadě (jeden řádek PRM_Counters). */
export interface CounterState {
  year: number;
  lastValue: number;
}

/**
 * Spočítá další pořadové číslo v řadě. Jen výpočet — zápis a řešení
 * souběhu (ETag / HTTP 412 → načti znovu a opakuj) dělá repozitář.
 */
export function nextSequence(
  counter: CounterState | undefined,
  format: Pick<NumberFormat, 'resetPeriod' | 'startValue'>,
  currentYear: number
): number {
  if (!counter) {
    return format.startValue;
  }
  if (format.resetPeriod === 'Ročně' && counter.year !== currentYear) {
    return format.startValue;
  }
  return counter.lastValue + 1;
}

/** Klíč rozsahu pro PRM_Counters.ScopeKey — prázdný u globální řady. */
export function counterScopeKey(scope: 'Globální' | 'Projekt', projectNumber?: string): string {
  return scope === 'Projekt' ? projectNumber ?? '' : '';
}

// --- Název a složka projektu ----------------------------------------------

/** Hodnoty, které se dosadí do tokenů vzoru názvu projektu. */
export interface ProjectTitleTokens {
  cislo: string;
  zakaznik?: string;
  lokalita?: string;
  typ?: string;
  rok?: number;
}

const PROJECT_TITLE_TOKENS = /\{CISLO\}|\{ZAKAZNIK\}|\{LOKALITA\}|\{TYP\}|\{ROK\}/g;

/**
 * Vygeneruje název projektu podle vzoru z Nastavení, např.
 * `{CISLO} {ZAKAZNIK} – {LOKALITA} – {TYP}` → `26-014 ČEZ Distribuce – Havlíčkův Brod – Připojení DS`.
 * Chybějící volitelnou hodnotu (např. lokalitu) vynechá i s okolní pomlčkou,
 * aby název nekončil osamocenou pomlčkou.
 */
export function renderProjectTitle(pattern: string, tokens: ProjectTitleTokens): string {
  const raw = pattern.replace(PROJECT_TITLE_TOKENS, (token) => {
    switch (token) {
      case '{CISLO}':
        return tokens.cislo;
      case '{ZAKAZNIK}':
        return tokens.zakaznik ?? '';
      case '{LOKALITA}':
        return tokens.lokalita ?? '';
      case '{TYP}':
        return tokens.typ ?? '';
      case '{ROK}':
        return tokens.rok !== undefined ? String(tokens.rok) : '';
      default:
        return token;
    }
  });

  return raw
    .split('–')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' – ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SHAREPOINT_INVALID_CHARS = /["*:<>?/\\|]/g;

/**
 * Odvodí bezpečný název složky SharePointu z libovolného textu (zadání kap. 8.3):
 * odstraní znaky `" * : < > ? / \ |`, počáteční a koncové mezery a tečky, omezí délku.
 */
export function sanitizeFolderName(name: string, maxLength = 128): string {
  let result = name.replace(SHAREPOINT_INVALID_CHARS, '').trim();
  result = result.replace(/^\.+/, '').replace(/\.+$/, '').trim();
  return result.slice(0, maxLength).trim();
}

// --- Čítače v SharePointu -------------------------------------------------

/** Řádek čítače (PRM_Counters) v rozsahu potřebném pro výběr. */
export interface CounterRowLike {
  LastValue: number;
  /** Prázdný rozsah SharePoint ukládá jako prázdnou hodnotu (null), ne jako prázdný text. */
  ScopeKey?: string | null;
}

/**
 * Vybere řádek čítače pro daný rozsah. Řádky se porovnávají v aplikaci, ne filtrem na serveru:
 * prázdný klíč rozsahu je v SharePointu uložený jako „nic" a filtr `ScopeKey eq ''` ho nemusí najít,
 * takže by se pro každé číslo založil nový čítač a všechny doklady by dostaly stejné číslo.
 * Kdyby řádků bylo víc (po takové chybě), platí ten s nejvyšší hodnotou.
 */
export function pickCounterRow<T extends CounterRowLike>(rows: T[], scopeKey: string): T | undefined {
  let best: T | undefined;
  rows.forEach((r) => {
    if ((r.ScopeKey || '') !== scopeKey) {
      return;
    }
    if (!best || (r.LastValue || 0) > (best.LastValue || 0)) {
      best = r;
    }
  });
  return best;
}
