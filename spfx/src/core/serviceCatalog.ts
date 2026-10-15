/**
 * Katalog O&M činností a checklist lokality — čistá logika bez SharePointu a Reactu.
 *
 * Katalog (`serviceCatalog.data.ts`, 101 činností) určuje, co se na lokalitě dělá. Lokalita má **příznaky** (co na ní je: VN připojení, EZS,
 * kapalinové chlazení BESS…) a **moduly** (co zákazník koupil: korektivní údržba, náhradní díly…). Z nich plyne seznam činností;
 * jednotlivou činnost jde ručně vypnout (nebo zapnout) a u většiny změnit periodu. Výběr činností (`evaluateChecklist`) je převod
 * funkce `vyber_cinnosti` z referenčního generátoru smluv `render_smlouvy.py`; kontroly smlouvy a vykreslení Wordu přijdou v další etapě.
 */

export type ActivityInclusion = 'PAUSAL' | 'MODUL' | 'EXTRA';

export interface CatalogActivity {
  id: string;
  /** Typ zařízení, ke kterému činnost patří (LOK, BOP, FVE, BESS, MVE, VTE, ENC). */
  asset: string;
  podsystem: string;
  nazev: string;
  typ: string;
  perioda: string;
  perioda_nastavitelna: boolean;
  kvalifikace: string[];
  predpis: string;
  vystup: string;
  postup: string[];
  /** Příznaky lokality; položka „a|b“ = stačí jeden z nich. Prázdné = platí vždy. */
  aktivace: string[];
  modul: string;
  zahrnuti: ActivityInclusion;
  rozsah_oem: string;
  vychozi_zapnuto: boolean;
  kriticka_pro_banku: boolean;
  poznamka: string;
}

export interface CatalogModule {
  nazev: string;
  popis: string;
  povinny: boolean;
}

export interface SlaTimes {
  reakce: string;
  reakce_h: number | null;
  prijezd: string;
  prijezd_h: number | null;
  docasne: string;
  docasne_h: number | null;
  odstraneni: string;
  odstraneni_h: number | null;
}

export interface ServiceCatalog {
  meta: { nazev: string; verze: string; datum: string; vlastnik: string; stav: string; pravidla_aktivace?: string };
  typy_assetu: Record<string, string>;
  priznaky: Record<string, string>;
  moduly: Record<string, CatalogModule>;
  kvalifikace: Record<string, string>;
  periodicity: Record<string, { nazev: string; mesicu: number | null }>;
  typy_ukonu: Record<string, string>;
  zahrnuti: Record<string, string>;
  rozsah_oem: Record<string, string>;
  cinnosti: CatalogActivity[];
  sla: {
    priority: { kod: string; nazev: string; definice: string }[];
    profily: Record<string, { nazev: string; casy: Record<string, SlaTimes> }>;
    pravidla: string[];
  };
  validace: { kod: string; pravidlo: string; zavaznost: 'chyba' | 'varování' }[];
  dostupnost: { garance_vychozi: Record<string, number>; monitoring_dostupnost: number; metodika: string };
}

/** Checklist lokality: příznaky, moduly a ruční úpravy činností. Ukládá se u lokality (a při generování smlouvy se z něj pořídí snapshot). */
export interface SiteChecklist {
  /** Příznaky lokality (klíče `priznaky` z katalogu). */
  flags: string[];
  /** Zapnuté moduly kromě základního (ten je vždy). */
  modules: string[];
  /** Činnosti, které jsou podle příznaků a modulů platné, ale uživatel je vypnul. */
  disabled: string[];
  /** Činnosti vypnuté ve výchozím stavu, které uživatel zapnul. */
  enabled: string[];
  /** Změněné periody (id činnosti → klíč periodicity). Jen u činností s nastavitelnou periodou. */
  periods: Record<string, string>;
  /** Profil SLA (STANDARD, PREMIUM…); prázdné = STANDARD. */
  slaProfile?: string;
}

export const EMPTY_CHECKLIST: SiteChecklist = { flags: [], modules: [], disabled: [], enabled: [], periods: {} };

/** Typ zařízení v katalogu podle druhu souboru v aplikaci (Jiné nemá katalog činností). */
export function catalogAssetType(deviceKind: string): string | undefined {
  switch (deviceKind) {
    case 'FVE':
      return 'FVE';
    case 'BESS':
      return 'BESS';
    case 'MVE':
      return 'MVE';
    case 'Kogenerace':
      return 'ENC';
    default:
      return undefined;
  }
}

/** Typy zařízení lokality: společné LOK a BOP plus typy jejích souborů. */
export function siteAssetTypes(deviceKinds: string[]): string[] {
  const types = ['LOK', 'BOP'];
  deviceKinds.forEach((k) => {
    const t = catalogAssetType(k);
    if (t && types.indexOf(t) < 0) {
      types.push(t);
    }
  });
  return types;
}

/** Jsou splněné všechny podmínky aktivace („a|b“ = stačí jeden příznak)? */
export function activationMet(aktivace: string[], flags: string[]): boolean {
  return aktivace.every((a) => a.split('|').some((f) => flags.indexOf(f) >= 0));
}

/** Aktivní moduly lokality včetně základního. */
export function activeModules(checklist: SiteChecklist): string[] {
  return ['ZAKLAD'].concat(checklist.modules.filter((m) => m !== 'ZAKLAD'));
}

export interface ChecklistItem {
  activity: CatalogActivity;
  /** Činnost lze na lokalitě mít (typ zařízení, modul a příznaky vyhovují). */
  available: boolean;
  /** Proč není k dispozici (česká věta), když `available` není. */
  unavailableReason?: string;
  /** Činnost je v plánu lokality. */
  active: boolean;
  /** Platná perioda (klíč periodicity) — výchozí z katalogu, nebo upravená. */
  period: string;
  periodChanged: boolean;
}

/**
 * Projde katalog pro lokalitu s danými druhy souborů. Vrací činnosti, které patří k typům zařízení lokality (ostatní se vůbec nenabízejí);
 * každá je buď k dispozici, nebo má důvod, proč ne.
 */
export function evaluateChecklist(catalog: ServiceCatalog, checklist: SiteChecklist, deviceKinds: string[]): ChecklistItem[] {
  const types = siteAssetTypes(deviceKinds);
  const modules = activeModules(checklist);
  const out: ChecklistItem[] = [];
  catalog.cinnosti.forEach((a) => {
    if (types.indexOf(a.asset) < 0) {
      return;
    }
    let reason: string | undefined;
    if (modules.indexOf(a.modul) < 0) {
      reason = `Vyžaduje modul „${catalog.moduly[a.modul] ? catalog.moduly[a.modul].nazev : a.modul}“.`;
    } else if (!activationMet(a.aktivace, checklist.flags)) {
      const missing = a.aktivace
        .filter((x) => !x.split('|').some((f) => checklist.flags.indexOf(f) >= 0))
        .map((x) => x.split('|').map((f) => catalog.priznaky[f] || f).join(' nebo '));
      reason = `Vyžaduje příznak: ${missing.join('; ')}.`;
    }
    const available = reason === undefined;
    const isOn = checklist.disabled.indexOf(a.id) < 0 && (a.vychozi_zapnuto || checklist.enabled.indexOf(a.id) >= 0);
    const override = checklist.periods[a.id];
    const changed = a.perioda_nastavitelna && !!override && override !== a.perioda && !!catalog.periodicity[override];
    out.push({
      activity: a,
      available,
      unavailableReason: reason,
      active: available && isOn,
      period: changed ? override : a.perioda,
      periodChanged: changed
    });
  });
  return out;
}

/** Činnosti v plánu lokality (převod `vyber_cinnosti`). */
export function activeItems(catalog: ServiceCatalog, checklist: SiteChecklist, deviceKinds: string[]): ChecklistItem[] {
  return evaluateChecklist(catalog, checklist, deviceKinds).filter((i) => i.active);
}

/** Zapne nebo vypne činnost; vrací nový checklist. Respektuje výchozí stav činnosti v katalogu. */
export function setActivityActive(checklist: SiteChecklist, activity: CatalogActivity, on: boolean): SiteChecklist {
  const without = (list: string[]): string[] => list.filter((x) => x !== activity.id);
  let disabled = without(checklist.disabled);
  let enabled = without(checklist.enabled);
  if (activity.vychozi_zapnuto && !on) {
    disabled = disabled.concat(activity.id);
  }
  if (!activity.vychozi_zapnuto && on) {
    enabled = enabled.concat(activity.id);
  }
  return { ...checklist, disabled, enabled };
}

/** Změní periodu činnosti (jen když je nastavitelná); návrat na výchozí periodu override odstraní. */
export function setActivityPeriod(checklist: SiteChecklist, activity: CatalogActivity, period: string): SiteChecklist {
  if (!activity.perioda_nastavitelna) {
    return checklist;
  }
  const periods = { ...checklist.periods };
  if (period === activity.perioda) {
    delete periods[activity.id];
  } else {
    periods[activity.id] = period;
  }
  return { ...checklist, periods };
}

export function toggleFlag(checklist: SiteChecklist, flag: string, on: boolean): SiteChecklist {
  const rest = checklist.flags.filter((f) => f !== flag);
  return { ...checklist, flags: on ? rest.concat(flag) : rest };
}

export function toggleModule(checklist: SiteChecklist, module: string, on: boolean): SiteChecklist {
  const rest = checklist.modules.filter((m) => m !== module);
  return { ...checklist, modules: on ? rest.concat(module) : rest };
}

export interface ChecklistSummary {
  total: number;
  pausal: number;
  modul: number;
  extra: number;
  /** Počet činností označených v katalogu jako kritické pro banku. */
  bankCritical: number;
}

export function summarizeChecklist(items: ChecklistItem[]): ChecklistSummary {
  const active = items.filter((i) => i.active);
  return {
    total: active.length,
    pausal: active.filter((i) => i.activity.zahrnuti === 'PAUSAL').length,
    modul: active.filter((i) => i.activity.zahrnuti === 'MODUL').length,
    extra: active.filter((i) => i.activity.zahrnuti === 'EXTRA').length,
    bankCritical: active.filter((i) => i.activity.kriticka_pro_banku).length
  };
}

/** Skupiny příznaků pro formulář; `asset` = druh zařízení, bez kterého se skupina nenabízí (undefined = vždy). */
export interface FlagGroup {
  title: string;
  asset?: string;
  flags: string[];
}

export function flagGroups(catalog: ServiceCatalog, deviceKinds: string[]): FlagGroup[] {
  const types = siteAssetTypes(deviceKinds);
  const keys = Object.keys(catalog.priznaky);
  const assetOf = (f: string): string | undefined => {
    if (/^(fve_|stridace_|optimizery|string_boxy)/.test(f)) {
      return 'FVE';
    }
    if (/^bess_/.test(f)) {
      return 'BESS';
    }
    if (/^mve_/.test(f)) {
      return 'MVE';
    }
    if (/^vte_/.test(f)) {
      return 'VTE';
    }
    if (/^enc_/.test(f)) {
      return 'ENC';
    }
    return undefined;
  };
  const defs: { title: string; asset?: string }[] = [
    { title: 'Lokalita, připojení a bezpečnost' },
    { title: 'Fotovoltaická elektrárna', asset: 'FVE' },
    { title: 'Bateriové úložiště', asset: 'BESS' },
    { title: 'Malá vodní elektrárna', asset: 'MVE' },
    { title: 'Větrná elektrárna', asset: 'VTE' },
    { title: 'Energocentrum', asset: 'ENC' }
  ];
  return defs
    .filter((d) => !d.asset || types.indexOf(d.asset) >= 0)
    .map((d) => ({ ...d, flags: keys.filter((f) => assetOf(f) === d.asset) }))
    .filter((g) => g.flags.length > 0);
}

/** Zahodí z checklistu to, co katalog už nezná (po vydání nové verze katalogu). */
export function cleanChecklist(catalog: ServiceCatalog, checklist: SiteChecklist): SiteChecklist {
  const ids = new Set(catalog.cinnosti.map((c) => c.id));
  const periods: Record<string, string> = {};
  Object.keys(checklist.periods).forEach((id) => {
    if (ids.has(id) && catalog.periodicity[checklist.periods[id]]) {
      periods[id] = checklist.periods[id];
    }
  });
  return {
    flags: checklist.flags.filter((f) => !!catalog.priznaky[f]),
    modules: checklist.modules.filter((m) => !!catalog.moduly[m] && m !== 'ZAKLAD'),
    disabled: checklist.disabled.filter((id) => ids.has(id)),
    enabled: checklist.enabled.filter((id) => ids.has(id)),
    periods,
    slaProfile: checklist.slaProfile && catalog.sla.profily[checklist.slaProfile] ? checklist.slaProfile : undefined
  };
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Přečte checklist z textu uloženého u lokality; cokoli nečitelného dá prázdný checklist. */
export function parseChecklist(json: string | undefined): SiteChecklist {
  if (!json || json.trim() === '') {
    return { ...EMPTY_CHECKLIST, flags: [], modules: [], disabled: [], enabled: [], periods: {} };
  }
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const periods: Record<string, string> = {};
    if (raw.periods && typeof raw.periods === 'object') {
      Object.keys(raw.periods as Record<string, unknown>).forEach((k) => {
        const v = (raw.periods as Record<string, unknown>)[k];
        if (typeof v === 'string') {
          periods[k] = v;
        }
      });
    }
    return {
      flags: strings(raw.flags),
      modules: strings(raw.modules),
      disabled: strings(raw.disabled),
      enabled: strings(raw.enabled),
      periods,
      slaProfile: typeof raw.slaProfile === 'string' && raw.slaProfile !== '' ? raw.slaProfile : undefined
    };
  } catch {
    return { ...EMPTY_CHECKLIST, flags: [], modules: [], disabled: [], enabled: [], periods: {} };
  }
}

export function serializeChecklist(checklist: SiteChecklist): string {
  return JSON.stringify(checklist);
}

/** Je checklist beze změny oproti prázdnému (nic nezadáno)? */
export function isEmptyChecklist(c: SiteChecklist): boolean {
  return c.flags.length === 0 && c.modules.length === 0 && c.disabled.length === 0 && c.enabled.length === 0 && Object.keys(c.periods).length === 0 && !c.slaProfile;
}
