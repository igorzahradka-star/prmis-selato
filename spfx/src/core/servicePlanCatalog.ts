/**
 * Roční plán servisu z katalogu O&M činností a checklistu lokality — čistá logika.
 *
 * Periodická činnost katalogu (měsíčně, čtvrtletně, ročně, jednou za několik let) se rozloží do měsíců roku; činnosti bez pevné periody
 * (monitoring 24/7, denně, týdně, sezónně, dle potřeby, při převzetí) se do ročního plánu nezařazují. Měsíce se mezi činnosti rozkládají
 * rovnoměrně, aby práce nebyla v jednom měsíci; plán jde dál ručně upravit.
 */

import { ChecklistItem, ServiceCatalog, siteAssetTypes } from './serviceCatalog';
import type { PlanItem, PlanTemplate, PlanTemplateItem } from './servicePlan';

/**
 * Měsíce (1–12), ve kterých se činnost s danou periodou provádí v roce s pořadím `yearIndex` od začátku smlouvy.
 * `position` rozkládá činnosti: první činnost začíná v lednu, další v dalších měsících (v rámci jejich periody).
 * Prázdné pole = periodu nejde plánovat po měsících, nebo v tomto roce činnost nepřipadá (periody delší než rok).
 */
export function occurrenceMonths(catalog: ServiceCatalog, period: string, position: number, yearIndex = 0): number[] {
  const p = catalog.periodicity[period];
  if (!p || p.mesicu === null || p.mesicu <= 0) {
    return [];
  }
  const months = p.mesicu;
  if (months > 12) {
    const years = Math.round(months / 12);
    return ((yearIndex % years) + years) % years === 0 ? [(((position % 12) + 12) % 12) + 1] : [];
  }
  const anchor = (position % months) + 1;
  const out: number[] = [];
  for (let m = anchor; m <= 12; m += months) {
    out.push(m);
  }
  return out;
}

const description = (i: { podsystem: string; vystup: string }): string => `${i.podsystem}${i.vystup ? ` · výstup: ${i.vystup}` : ''}`;
const jobKindOf = (zahrnuti: string): string => (zahrnuti === 'EXTRA' ? 'Nahodilá' : 'Plánovaná');

export interface PlanScope {
  siteNumber: string;
  year: number;
  /** První rok smlouvy; činnosti s periodou delší než rok se naplánují v prvním roce a pak po jejím uplynutí. Bez něj platí rok plánu jako první. */
  startYear?: number;
  /** Co z checklistu vzít: `site` = společné činnosti lokality a vyvedení výkonu, jinak číslo souboru. Bez výběru všechno. */
  only?: string[];
}

/** Klíč cíle položky plánu (společné činnosti lokality = `site`, jinak číslo souboru). */
export const planTargetKey = (deviceNumber: string | undefined): string => deviceNumber || 'site';

/**
 * Položky ročního plánu z činností checklistu lokality. Činnosti lokality a vyvedení výkonu se přiřadí lokalitě, činnosti zařízení každému
 * souboru daného typu (FVE, BESS…). Plánovaná = v paušálu nebo modulu, Nahodilá = účtovaná zvlášť.
 */
export function planFromChecklist(catalog: ServiceCatalog, items: ChecklistItem[], devices: { number: string; kind: string; isActive?: boolean }[], scope: PlanScope): Omit<PlanItem, 'id'>[] {
  const out: Omit<PlanItem, 'id'>[] = [];
  const yearIndex = scope.year - (scope.startYear ?? scope.year);
  const active = items.filter((i) => i.active);
  const positions: Record<string, number> = {};
  active.forEach((i) => {
    const a = i.activity;
    const key = `${a.asset}|${i.period}`;
    const position = positions[key] ?? 0;
    positions[key] = position + 1;
    const months = occurrenceMonths(catalog, i.period, position, yearIndex);
    if (months.length === 0) {
      return;
    }
    const targets: (string | undefined)[] =
      a.asset === 'LOK' || a.asset === 'BOP'
        ? [undefined]
        : devices.filter((d) => d.isActive !== false && siteAssetTypes([d.kind]).indexOf(a.asset) >= 0).map((d) => d.number);
    targets.forEach((deviceNumber) => {
      if (scope.only && scope.only.indexOf(planTargetKey(deviceNumber)) < 0) {
        return;
      }
      months.forEach((month) => {
        out.push({ year: scope.year, siteNumber: scope.siteNumber, deviceNumber, title: a.nazev, description: description(a), month, jobKind: jobKindOf(a.zahrnuti) });
      });
    });
  });
  return out;
}

/** Z položek, které se mají přidat, vynechá ty, které v plánu už jsou (stejné zařízení, měsíc a činnost). Nic nemaže ani nepřepisuje. */
export function newPlanItemsOnly(existing: PlanItem[], candidates: Omit<PlanItem, 'id'>[]): Omit<PlanItem, 'id'>[] {
  const key = (i: { year: number; siteNumber: string; deviceNumber?: string; month: number; title: string }): string => `${i.year}|${i.siteNumber}|${i.deviceNumber || ''}|${i.month}|${i.title.trim().toLocaleLowerCase('cs-CZ')}`;
  const have = new Set(existing.map(key));
  return candidates.filter((c) => !have.has(key(c)));
}

/** Šablony plánu z katalogu: pro každý druh souboru a pro lokalitu činnosti **základního servisu**, které platí vždy (bez podmínky na příznak). */
export function templatesFromCatalog(catalog: ServiceCatalog): PlanTemplate[] {
  const defs: { name: string; kind: string; assets: string[] }[] = [
    { name: 'Fotovoltaická elektrárna (FVE) — základní servis', kind: 'FVE', assets: ['FVE'] },
    { name: 'Bateriové úložiště (BESS) — základní servis', kind: 'BESS', assets: ['BESS'] },
    { name: 'Malá vodní elektrárna (MVE) — základní servis', kind: 'MVE', assets: ['MVE'] },
    { name: 'Energocentrum (kogenerace) — základní servis', kind: 'Kogenerace', assets: ['ENC'] },
    { name: 'Lokalita — společné činnosti a vyvedení výkonu', kind: 'Lokalita', assets: ['LOK', 'BOP'] }
  ];
  return defs
    .map((d) => {
      const acts = catalog.cinnosti.filter((a) => d.assets.indexOf(a.asset) >= 0 && a.modul === 'ZAKLAD' && a.aktivace.length === 0 && a.vychozi_zapnuto);
      const positions: Record<string, number> = {};
      const items: PlanTemplateItem[] = [];
      acts.forEach((a) => {
        const position = positions[a.perioda] ?? 0;
        positions[a.perioda] = position + 1;
        occurrenceMonths(catalog, a.perioda, position, 0).forEach((month) => {
          items.push({ title: a.nazev, description: description(a), month, jobKind: jobKindOf(a.zahrnuti) });
        });
      });
      return { name: d.name, kind: d.kind, items: items.sort((x, y) => x.month - y.month || x.title.localeCompare(y.title, 'cs-CZ')) };
    })
    .filter((t) => t.items.length > 0);
}
