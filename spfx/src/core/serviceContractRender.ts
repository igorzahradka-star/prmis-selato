/**
 * Podklad pro vykreslení šablon smlouvy (rámcová smlouva a Příloha lokality): z dat verze smlouvy sestaví kontext, který šablony Wordu očekávají.
 * Převod funkce `main` z referenčního generátoru `render_smlouvy.py` (sekce checklistu, tabulka SLA, moduly, legenda kvalifikací, dostupnost
 * assetů). Činnosti se berou ze **snapshotu verze** (ne z živého checklistu), takže podepsaná smlouva se při pozdějším vygenerování nezmění.
 */

import { ChecklistItem, ServiceCatalog } from './serviceCatalog';
import { ContractAsset, ContractInput, ContractSite, checklistSections, slaTable } from './serviceContract';

/** Částka jako „952 842 Kč“ (filtr `kc` šablon); prázdná hodnota je pomlčka. */
export function formatKc(v: unknown): string {
  if (v === null || v === undefined || v === '') {
    return '—';
  }
  const n = Math.round(Number(v));
  if (!isFinite(n)) {
    return String(v);
  }
  const digits = Math.abs(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '-' : ''}${digits} Kč`;
}

/** Činnosti snapshotu jako položky checklistu (platná perioda ze snapshotu). */
export function snapshotItems(catalog: ServiceCatalog, site: ContractSite): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  (site.cinnosti || []).forEach((c) => {
    const activity = catalog.cinnosti.filter((a) => a.id === c.id)[0];
    if (activity && catalog.periodicity[c.perioda]) {
      out.push({ activity, available: true, active: true, period: c.perioda, periodChanged: c.perioda !== activity.perioda });
    }
  });
  // Pořadí jako v katalogu (checklist se pak třídí po typech zařízení).
  const order = new Map(catalog.cinnosti.map((a, i) => [a.id, i]));
  return out.sort((a, b) => (order.get(a.activity.id) as number) - (order.get(b.activity.id) as number));
}

export interface RenderContext {
  /** Společný kontext (rámcová smlouva). */
  common: Record<string, unknown>;
  /** Kontext každé přílohy lokality (společný + `lokalita`). */
  annexes: { site: ContractSite; context: Record<string, unknown> }[];
  /** Kontext přílohy každého souboru (společný + `lokalita` + `soubor`). */
  assetAnnexes: { site: ContractSite; asset: ContractAsset; context: Record<string, unknown> }[];
}

/** Kontext pro šablony: společné údaje, lokality s checklistem, SLA, moduly a assety. */
export function buildRenderContext(catalog: ServiceCatalog, input: ContractInput): RenderContext {
  const lokality = input.lokality.map((lok) => {
    const items = snapshotItems(catalog, lok);
    const sla = slaTable(catalog, lok.sla_profil, lok.sla_override);
    const used = Array.from(new Set(items.reduce<string[]>((a, i) => a.concat(i.activity.kvalifikace), []))).sort();
    return {
      ...lok,
      bankovni_financovani: lok.priznaky.indexOf('bankovni_financovani') >= 0,
      checklist: checklistSections(catalog, items, lok.assety),
      sla,
      moduly: Object.keys(catalog.moduly)
        .filter((m) => m === 'ZAKLAD' || lok.moduly.indexOf(m) >= 0)
        .map((m) => ({ kod: m, ...catalog.moduly[m] })),
      priznaky_text: lok.priznaky.map((f) => catalog.priznaky[f]).filter((x) => !!x).join('; '),
      kvalifikace_legenda: used.map((q) => `${q} = ${catalog.kvalifikace[q]}`).join('; '),
      assety: lok.assety.map((a) => {
        const garance = catalog.dostupnost.garance_vychozi[a.typ];
        return { ...a, dostupnost: (garance === undefined ? '' : garance.toFixed(1)).replace('.', ','), metodika_cl: a.typ === 'BESS' ? '2.2' : '2.1' };
      }),
      assety_text: lok.assety.map((a) => `${a.kod} ${a.typ}`).join(', ')
    };
  });
  const p1 = Math.min(...lokality.map((l) => (l.sla.casy.P1 ? (l.sla.casy.P1.odstraneni_h as number) : Infinity)));
  const common: Record<string, unknown> = {
    smlouva: input.smlouva,
    objednatel: input.objednatel,
    zhotovitel: input.zhotovitel,
    asset_manager: input.asset_manager,
    banka: input.banka,
    parametry: input.parametry,
    sazebnik: input.sazebnik,
    autorizace_oem: input.autorizace_oem,
    servisni_partneri: input.servisni_partneri,
    kontakty: input.kontakty,
    eskalace: input.eskalace,
    volby: { ...input.volby, obsahuje_bess: input.lokality.some((l) => l.assety.some((a) => a.typ === 'BESS')) },
    lokality,
    sla_priority: catalog.sla.priority,
    sla_pravidla: catalog.sla.pravidla,
    sla_p1_odstraneni_h: isFinite(p1) ? Math.trunc(p1) : null,
    dostupnost_monitoringu: catalog.dostupnost.monitoring_dostupnost.toFixed(1),
    katalog_verze: catalog.meta.verze
  };
  const assetAnnexes: RenderContext['assetAnnexes'] = [];
  lokality.forEach((l, i) => {
    const site = input.lokality[i];
    const items = snapshotItems(catalog, site);
    l.assety.forEach((a, k) => {
      const own = items.filter((it) => it.activity.asset === a.typ);
      const used = Array.from(new Set(own.reduce<string[]>((acc, it) => acc.concat(it.activity.kvalifikace), []))).sort();
      const soubor = {
        ...a,
        poradi: k + 1,
        typ_nazev: catalog.typy_assetu[a.typ] || a.typ,
        checklist: checklistSections(catalog, own, [site.assety[k]]),
        kvalifikace_legenda: used.map((q) => `${q} = ${catalog.kvalifikace[q]}`).join('; '),
        nd: site.nd.filter((n) => n.asset === a.kod)
      };
      assetAnnexes.push({ site, asset: site.assety[k], context: { ...common, lokalita: l, soubor } });
    });
  });
  return { common, annexes: lokality.map((l, i) => ({ site: input.lokality[i], context: { ...common, lokalita: l } })), assetAnnexes };
}

/** Strojově čitelný checklist lokality (pro CMMS / mobilní checklist technika): činnosti katalogu s platnou periodou. */
export function checklistExport(catalog: ServiceCatalog, input: ContractInput, site: ContractSite): Record<string, unknown> {
  return {
    lokalita: site.kod,
    smlouva: input.smlouva.cislo,
    katalog_verze: catalog.meta.verze,
    cinnosti: snapshotItems(catalog, site).map((i) => ({ ...i.activity, perioda: i.period }))
  };
}
