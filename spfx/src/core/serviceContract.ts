/**
 * Servisní smlouva se zákazníkem (O&M) — čistá logika bez SharePointu a Reactu.
 *
 * Smlouva patří vždy jedné lokalitě (číslo `10500-01`) a má verze; každá verze nese **snapshot dat** ve tvaru ukázkového vstupu
 * `priklad_vstup_smlouvy.json` (klíče zůstávají české, protože se z nich později plní šablony Wordu bez úprav). Podepsaná verze se nemění.
 * Zde: číslování, stavy verzí, výběr příloh ze souborů, tabulka SLA a sekce checklistu (převod `sla_tabulka` a `checklist_sekce`),
 * kontroly (převod `validuj` z referenčního generátoru `render_smlouvy.py`) a popis změn mezi verzemi.
 */

import { ServiceDevice, ServiceSite } from './service';
import { catalogAssetType, ChecklistItem, cleanChecklist, evaluateChecklist, ServiceCatalog, SlaTimes } from './serviceCatalog';
import type { ContractSettings } from './serviceContractSettings';

// --- tvar dat smlouvy ---------------------------------------------------------------------------------------------

export interface ContractParty {
  nazev: string;
  sidlo: string;
  ico: string;
  dic?: string;
  rejstrik?: string;
  zastoupen?: string;
  bankovni_spojeni?: string;
  podpis_jmeno?: string;
  podpis_funkce?: string;
  dispecink_tel?: string;
  dispecink_email?: string;
}

export interface ContractParameters {
  doba_let: number;
  prodlouzeni_let: number;
  vypovedni_lhuta_mesicu: number;
  fakturace: string;
  splatnost_dni: number;
  indexace_den: string;
  indexace_prvni: string;
  limit_odpovednosti_pct: number;
  pojisteni_mil_kc: number;
  zaruka_prace_mesicu: number;
  limit_bez_schvaleni_kc: number;
  servisni_zpravy_dni: number;
  predani_mesicu: number;
  planovana_udrzba_h_rok: number;
  penale_dostupnost_pct: number;
  penale_p1_kc_hod: number;
  penale_cap_pct: number;
}

export interface ContractOptions {
  skupina_revoltum: boolean;
  penale: boolean;
  bankovni_ujednani: boolean;
}

export interface ContractRate {
  polozka: string;
  jednotka: string;
  cena: number;
  poznamka?: string;
}

export interface ContractOemAuthorization {
  vyrobce: string;
  rozsah: string;
  doklad: string;
  platnost_do: string;
}

export interface ContractServicePartner {
  nazev: string;
  ico: string;
  cinnosti: string;
  opravneni: string;
}

export interface ContractContact {
  strana?: string;
  role: string;
  jmeno: string;
  telefon: string;
  email: string;
}

export interface ContractEscalation {
  uroven: string;
  spoustec: string;
  res: string;
  objednatel: string;
}

export interface ContractAsset {
  kod: string;
  /** Typ v katalogu (FVE, BESS, MVE, ENC…). */
  typ: string;
  nazev: string;
  parametry?: string;
  technologie?: string;
  zaruky?: string;
  vyrobce_oem?: string;
}

export interface ContractPriceRow {
  polozka: string;
  zaklad: string;
  jednotkova: string;
  rocne: number;
}

export interface ContractSpare {
  polozka: string;
  asset: string;
  mnozstvi: string;
  umisteni: string;
}

/** Činnost zapsaná do snapshotu: číslo z katalogu a platná perioda. */
export interface ContractActivity {
  id: string;
  perioda: string;
}

/** Příloha lokality ve smlouvě. Šablona umí víc lokalit; naše smlouva má vždy jednu. */
export interface ContractSite {
  kod: string;
  nazev: string;
  priloha_cislo: string;
  verze: string;
  datum_zahajeni?: string;
  datum_podpisu?: string;
  adresa?: string;
  katastr?: string;
  lv?: string;
  parcely?: string;
  gps?: string;
  pripojeni?: string;
  pristup?: string;
  agregator?: string;
  banka?: string;
  priznaky: string[];
  moduly: string[];
  cinnosti_vypnute: string[];
  cinnosti_zapnute: string[];
  perioda_override: Record<string, string>;
  sla_profil?: string;
  sla_override?: Record<string, Partial<SlaTimes>>;
  assety: ContractAsset[];
  /** Činnosti v plánu lokality v okamžiku pořízení snapshotu. */
  cinnosti?: ContractActivity[];
  cena: { radky: ContractPriceRow[]; celkem: number; korektiva_hodin?: number; nd_limit?: number; poznamka?: string };
  nd: ContractSpare[];
  kontakty: ContractContact[];
  zvlastni_ujednani: string[];
}

/** Snapshot dat jedné verze smlouvy (tvar `priklad_vstup_smlouvy.json`). */
export interface ContractInput {
  smlouva: { cislo: string; misto_podpisu?: string; datum_podpisu?: string };
  objednatel: ContractParty;
  zhotovitel: ContractParty;
  asset_manager?: { nazev: string; ico: string; sidlo: string } | null;
  banka?: { nazev: string; ico: string } | null;
  volby: ContractOptions;
  parametry: ContractParameters;
  sazebnik: ContractRate[];
  autorizace_oem: ContractOemAuthorization[];
  servisni_partneri: ContractServicePartner[];
  kontakty: ContractContact[];
  eskalace: ContractEscalation[];
  lokality: ContractSite[];
}

// --- číslování a verze ---------------------------------------------------------------------------------------------

/** Číslo smlouvy: číslo lokality, pomlčka a pořadí (10500-01, 10500-02…). */
export function nextContractNumber(siteNumber: string, existing: string[]): string {
  const prefix = `${siteNumber}-`;
  let max = 0;
  existing.forEach((n) => {
    if (n.indexOf(prefix) === 0) {
      const k = parseInt(n.slice(prefix.length), 10);
      if (isFinite(k) && k > max) {
        max = k;
      }
    }
  });
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
}

export const CONTRACT_VERSION_KINDS = ['Smlouva', 'Dodatek'] as const;
export const CONTRACT_STATUSES = ['Návrh', 'K podpisu', 'Podepsaná', 'Nahrazená'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export interface ContractVersionInfo {
  versionNo: number;
  kind: string;
  status: string;
}

/** Označení verze pro lidi i šablonu („1.0“, „2.0“). */
export function versionLabel(versionNo: number): string {
  return `${versionNo}.0`;
}

export function nextVersionNo(versions: ContractVersionInfo[]): number {
  return versions.reduce((m, v) => Math.max(m, v.versionNo), 0) + 1;
}

const OPEN: string[] = ['Návrh', 'K podpisu'];

/** Smí vzniknout další verze (dodatek)? Jen po první verzi a nesmí být rozpracovaná jiná. Vrací důvod, nebo prázdný text. */
export function newVersionProblem(versions: ContractVersionInfo[]): string {
  if (versions.length === 0) {
    return 'Smlouva nemá žádnou verzi.';
  }
  if (versions.some((v) => OPEN.indexOf(v.status) >= 0)) {
    return 'Je rozpracovaná jiná verze (návrh nebo k podpisu). Dokončete ji, nebo ji zrušte.';
  }
  if (!versions.some((v) => v.status === 'Podepsaná')) {
    return 'Nová verze (dodatek) se zakládá až k podepsané smlouvě.';
  }
  return '';
}

/** Povolené přechody stavu verze. */
export function nextStatuses(status: string): ContractStatus[] {
  switch (status) {
    case 'Návrh':
      return ['K podpisu'];
    case 'K podpisu':
      return ['Návrh', 'Podepsaná'];
    default:
      return [];
  }
}

/** Důvod, proč přechod nejde (prázdný text = jde). K podpisu: smlouva nesmí mít chyby ani nevyplněné údaje. */
export function statusChangeProblem(from: string, to: string, issues: ContractIssue[]): string {
  if (nextStatuses(from).indexOf(to as ContractStatus) < 0) {
    return `Z verze ve stavu „${from}“ nejde přejít do stavu „${to}“.`;
  }
  if (to === 'K podpisu') {
    const blocking = issues.filter((i) => i.severity === 'chyba' || i.severity === 'doplnit');
    if (blocking.length > 0) {
      return `Smlouvu nejde dát k podpisu: ${blocking.length} nevyřešených bodů (chyby a chybějící údaje).`;
    }
  }
  return '';
}

/** Po podpisu nové verze se dříve podepsané verze stávají nahrazenými. Vrací nové stavy podle čísla verze. */
export function statusesAfterSigning(versions: ContractVersionInfo[], signedNo: number): Record<number, string> {
  const out: Record<number, string> = {};
  versions.forEach((v) => {
    if (v.versionNo === signedNo) {
      out[v.versionNo] = 'Podepsaná';
    } else if (v.status === 'Podepsaná' && v.versionNo < signedNo) {
      out[v.versionNo] = 'Nahrazená';
    } else {
      out[v.versionNo] = v.status;
    }
  });
  return out;
}

// --- přílohy ze souborů, SLA, checklist -----------------------------------------------------------------------------

/** Soubory lokality jako assety přílohy; soubory druhu „Jiné“ nemají v katalogu činnosti, a proto se do přílohy nenabízejí. */
export function assetsFromDevices(devices: ServiceDevice[]): ContractAsset[] {
  const out: ContractAsset[] = [];
  devices
    .filter((d) => d.isActive)
    .forEach((d) => {
      const typ = catalogAssetType(d.kind);
      if (typ) {
        out.push({ kod: d.number, typ, nazev: d.name, parametry: d.parameters, technologie: d.technology, zaruky: d.warranty, vyrobce_oem: d.oemVendor });
      }
    });
  return out.sort((a, b) => a.kod.localeCompare(b.kod));
}

/** Činnosti z vyhodnoceného checklistu do snapshotu. */
export function snapshotActivities(items: ChecklistItem[]): ContractActivity[] {
  return items.filter((i) => i.active).map((i) => ({ id: i.activity.id, perioda: i.period }));
}

export interface SlaRow extends SlaTimes {
  kod: string;
  nazev: string;
}

export interface SlaTable {
  profil: string;
  radky: SlaRow[];
  casy: Record<string, SlaTimes>;
}

/** Tabulka SLA lokality: časy profilu s úpravami lokality (převod `sla_tabulka`). */
export function slaTable(catalog: ServiceCatalog, profile: string | undefined, override: Record<string, Partial<SlaTimes>> | undefined): SlaTable {
  const prof = catalog.sla.profily[profile || 'STANDARD'] || catalog.sla.profily.STANDARD;
  const casy: Record<string, SlaTimes> = {};
  Object.keys(prof.casy).forEach((k) => {
    casy[k] = { ...prof.casy[k], ...((override && override[k]) || {}) };
  });
  return { profil: prof.nazev, radky: catalog.sla.priority.map((p) => ({ kod: p.kod, nazev: p.nazev, ...casy[p.kod] })), casy };
}

const ASSET_ORDER = ['LOK', 'BOP', 'FVE', 'BESS', 'MVE', 'VTE', 'ENC'];
const ASSET_HEADING: Record<string, string> = { LOK: 'Lokalita – management, monitoring, bezpečnost a areál', BOP: 'Vyvedení výkonu – VN/NN, transformace, ochrany' };
const INCLUSION_SHORT: Record<string, string> = { PAUSAL: 'P', MODUL: 'M', EXTRA: 'E' };
const OEM_SHORT: Record<string, string> = { RES: 'RES', RES_OEM: 'RES/OEM', OEM: 'OEM' };

export interface ChecklistSection {
  typ: string;
  nadpis: string;
  polozky: { id: string; nazev: string; perioda: string; kvalifikace: string; vystup: string; rezim: string; oem: string }[];
}

/** Sekce checklistu po typech zařízení pro přílohu (převod `checklist_sekce`). */
export function checklistSections(catalog: ServiceCatalog, items: ChecklistItem[], assets: ContractAsset[]): ChecklistSection[] {
  const codes: Record<string, string[]> = {};
  assets.forEach((a) => {
    (codes[a.typ] = codes[a.typ] || []).push(a.kod);
  });
  const out: ChecklistSection[] = [];
  ASSET_ORDER.forEach((t) => {
    const rows = items.filter((i) => i.active && i.activity.asset === t);
    if (rows.length === 0) {
      return;
    }
    out.push({
      typ: t,
      nadpis: ASSET_HEADING[t] || `${catalog.typy_assetu[t]} (${(codes[t] || []).join(', ')})`,
      polozky: rows.map((i) => ({
        id: i.activity.id,
        nazev: i.activity.nazev,
        perioda: catalog.periodicity[i.period].nazev,
        kvalifikace: i.activity.kvalifikace.join(', '),
        vystup: i.activity.vystup,
        rezim: INCLUSION_SHORT[i.activity.zahrnuti],
        oem: OEM_SHORT[i.activity.rozsah_oem]
      }))
    });
  });
  return out;
}

/** Součet ročních cen. */
export function sumPriceRows(rows: ContractPriceRow[]): number {
  return rows.reduce((s, r) => s + (isFinite(r.rocne) ? r.rocne : 0), 0);
}

// --- kontroly -------------------------------------------------------------------------------------------------------

export type IssueSeverity = 'chyba' | 'varování' | 'doplnit';

export interface ContractIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  /** Lokalita nebo asset, ke kterému se kontrola vztahuje. */
  scope?: string;
}

/** Je hodnota prázdná nebo jen vzor typu „[DOPLNIT]“? */
export function isPlaceholder(v: string | undefined): boolean {
  const t = (v ?? '').trim();
  return t === '' || /^\[.*\]$/.test(t);
}

const BANK_FLAG = 'bankovni_financovani';

/**
 * Kontroly smlouvy. **Chyby blokují** vygenerování smlouvy (požadavky banky: P1 ≤ 72 h, 10 let, autorizace OEM pro BESS); varování jen upozorní;
 * „doplnit“ jsou povinné údaje, které chybí (blokují jen předání k podpisu). Převod `validuj`.
 */
export function validateContract(catalog: ServiceCatalog, input: ContractInput): ContractIssue[] {
  const out: ContractIssue[] = [];
  const authorizations = input.autorizace_oem.map((a) => a.vyrobce.toLowerCase());
  input.lokality.forEach((lok) => {
    const bank = lok.priznaky.indexOf(BANK_FLAG) >= 0;
    const sla = slaTable(catalog, lok.sla_profil, lok.sla_override);
    const p1 = sla.casy.P1 ? sla.casy.P1.odstraneni_h : null;
    if (bank && (p1 === null || p1 > 72)) {
      out.push({ code: 'BANKA_P1_72H', severity: 'chyba', scope: lok.kod, message: `${lok.kod}: P1 odstranění ${p1 === null ? 'není stanoveno' : `${p1} h`} > 72 h (požadavek banky).` });
    }
    if (bank && input.parametry.doba_let < 10) {
      out.push({ code: 'BANKA_DOBA_10', severity: 'chyba', scope: lok.kod, message: `${lok.kod}: doba trvání ${input.parametry.doba_let} let < 10 let (požadavek banky).` });
    }
    if (bank && !input.volby.bankovni_ujednani) {
      out.push({ code: 'BANKA_UJEDNANI', severity: 'varování', scope: lok.kod, message: `${lok.kod}: bankovní financování bez aktivního čl. 16 (bankovní ujednání).` });
    }
    lok.assety.forEach((a) => {
      if (a.typ !== 'BESS') {
        return;
      }
      const v = (a.vyrobce_oem || '').toLowerCase();
      if (!v || !authorizations.some((x) => x.indexOf(v) >= 0 || v.indexOf(x) >= 0)) {
        out.push({ code: 'BESS_AUTORIZACE', severity: 'chyba', scope: `${lok.kod}/${a.kod}`, message: `${lok.kod}/${a.kod}: chybí autorizace OEM pro výrobce BESS „${a.vyrobce_oem || ''}“.` });
      }
      if (bank && lok.nd.length === 0) {
        out.push({ code: 'BESS_ND', severity: 'varování', scope: `${lok.kod}/${a.kod}`, message: `${lok.kod}/${a.kod}: chybí seznam strategických náhradních dílů.` });
      }
    });
  });
  if (input.volby.skupina_revoltum && input.volby.penale) {
    out.push({ code: 'PENALE_SKUPINA', severity: 'varování', message: 'Smlouva ve skupině Revoltum má aktivní penále.' });
  }
  return out.concat(missingData(input));
}

/** Povinné údaje, které nejsou vyplněné (prázdné nebo vzor v hranatých závorkách). */
export function missingData(input: ContractInput): ContractIssue[] {
  const out: ContractIssue[] = [];
  const need = (label: string, value: string | undefined, code: string, scope?: string): void => {
    if (isPlaceholder(value)) {
      out.push({ code, severity: 'doplnit', scope, message: `${scope ? `${scope}: ` : ''}doplňte ${label}.` });
    }
  };
  need('název objednatele', input.objednatel.nazev, 'OBJ_NAZEV');
  need('sídlo objednatele', input.objednatel.sidlo, 'OBJ_SIDLO');
  need('IČO objednatele', input.objednatel.ico, 'OBJ_ICO');
  need('osobu oprávněnou jednat za objednatele', input.objednatel.zastoupen, 'OBJ_ZASTOUPEN');
  need('jméno podepisující za objednatele', input.objednatel.podpis_jmeno, 'OBJ_PODPIS');
  need('název zhotovitele', input.zhotovitel.nazev, 'ZHO_NAZEV');
  need('IČO zhotovitele', input.zhotovitel.ico, 'ZHO_ICO');
  need('osobu oprávněnou jednat za zhotovitele', input.zhotovitel.zastoupen, 'ZHO_ZASTOUPEN');
  need('telefon dispečinku zhotovitele', input.zhotovitel.dispecink_tel, 'ZHO_DISPECINK');
  if (input.lokality.length === 0) {
    out.push({ code: 'LOKALITA_CHYBI', severity: 'doplnit', message: 'Smlouva nemá žádnou lokalitu.' });
  }
  input.lokality.forEach((l) => {
    if (l.assety.length === 0) {
      out.push({ code: 'ASSETY_CHYBI', severity: 'doplnit', scope: l.kod, message: `${l.kod}: příloha nemá žádný soubor (FVE, BESS…).` });
    }
    if (l.cena.radky.length === 0) {
      out.push({ code: 'CENA_CHYBI', severity: 'doplnit', scope: l.kod, message: `${l.kod}: doplňte cenu lokality.` });
    }
    if (l.cinnosti !== undefined && l.cinnosti.length === 0) {
      out.push({ code: 'CINNOSTI_CHYBI', severity: 'doplnit', scope: l.kod, message: `${l.kod}: checklist nemá žádné činnosti.` });
    }
  });
  return out;
}

export const hasBlockingError = (issues: ContractIssue[]): boolean => issues.some((i) => i.severity === 'chyba');

// --- změny mezi verzemi ----------------------------------------------------------------------------------------------

const money = (n: number): string => `${Math.round(n).toLocaleString('cs-CZ').replace(/ /g, ' ')} Kč`;

/** Věty o rozdílech mezi dvěma verzemi (pro popis dodatku a porovnání verzí). Prázdný seznam = beze změny. */
export function describeChanges(prev: ContractInput, next: ContractInput, catalog?: ServiceCatalog): string[] {
  const out: string[] = [];
  const name = (id: string): string => {
    const a = catalog ? catalog.cinnosti.filter((c) => c.id === id)[0] : undefined;
    return a ? `${id} ${a.nazev}` : id;
  };
  next.lokality.forEach((n) => {
    const p = prev.lokality.filter((l) => l.kod === n.kod)[0];
    if (!p) {
      out.push(`Přidána lokalita ${n.kod} ${n.nazev}.`);
      return;
    }
    const before = new Map(p.assety.map((a) => [a.kod, a]));
    const after = new Map(n.assety.map((a) => [a.kod, a]));
    n.assety.forEach((a) => {
      const o = before.get(a.kod);
      if (!o) {
        out.push(`Přidán soubor ${a.kod} ${a.nazev} (${a.typ}).`);
      } else if (o.parametry !== a.parametry || o.technologie !== a.technologie || o.vyrobce_oem !== a.vyrobce_oem || o.nazev !== a.nazev) {
        out.push(`Změněny údaje souboru ${a.kod} ${a.nazev}.`);
      }
    });
    p.assety.forEach((a) => {
      if (!after.has(a.kod)) {
        out.push(`Odebrán soubor ${a.kod} ${a.nazev} (${a.typ}).`);
      }
    });
    const pa = new Map((p.cinnosti || []).map((c) => [c.id, c.perioda]));
    const na = new Map((n.cinnosti || []).map((c) => [c.id, c.perioda]));
    na.forEach((per, id) => {
      if (!pa.has(id)) {
        out.push(`Přidána činnost ${name(id)}.`);
      } else if (pa.get(id) !== per) {
        out.push(`Změněna perioda činnosti ${name(id)}: ${catalog ? catalog.periodicity[pa.get(id) as string]?.nazev ?? pa.get(id) : pa.get(id)} → ${catalog ? catalog.periodicity[per]?.nazev ?? per : per}.`);
      }
    });
    pa.forEach((_, id) => {
      if (!na.has(id)) {
        out.push(`Odebrána činnost ${name(id)}.`);
      }
    });
    if (p.cena.celkem !== n.cena.celkem) {
      out.push(`Změněna roční cena lokality ${n.kod}: ${money(p.cena.celkem)} → ${money(n.cena.celkem)}.`);
    }
    if ((p.sla_profil || 'STANDARD') !== (n.sla_profil || 'STANDARD') || JSON.stringify(p.sla_override || {}) !== JSON.stringify(n.sla_override || {})) {
      out.push(`Změněno SLA lokality ${n.kod}.`);
    }
  });
  prev.lokality.forEach((p) => {
    if (!next.lokality.some((n) => n.kod === p.kod)) {
      out.push(`Odebrána lokalita ${p.kod} ${p.nazev}.`);
    }
  });
  (Object.keys(next.parametry) as (keyof ContractParameters)[]).forEach((k) => {
    if (prev.parametry[k] !== next.parametry[k]) {
      out.push(`Změněn parametr ${k}: ${String(prev.parametry[k])} → ${String(next.parametry[k])}.`);
    }
  });
  (Object.keys(next.volby) as (keyof ContractOptions)[]).forEach((k) => {
    if (prev.volby[k] !== next.volby[k]) {
      out.push(`Změněna volba ${k}: ${prev.volby[k] ? 'ano' : 'ne'} → ${next.volby[k] ? 'ano' : 'ne'}.`);
    }
  });
  if (JSON.stringify(prev.sazebnik) !== JSON.stringify(next.sazebnik)) {
    out.push('Změněn sazebník.');
  }
  if (prev.objednatel.nazev !== next.objednatel.nazev || prev.objednatel.ico !== next.objednatel.ico) {
    out.push(`Změněn objednatel: ${prev.objednatel.nazev} → ${next.objednatel.nazev}.`);
  }
  return out;
}

// --- uložené smlouvy a jejich verze --------------------------------------------------------------------------------

/** Smlouva: patří vždy jedné lokalitě; její obsah je ve verzích. */
export interface ServiceContract {
  id: number;
  /** Číslo smlouvy: číslo lokality a pořadí (10500-01). */
  number: string;
  siteNumber: string;
  customerId?: number;
  customerName?: string;
  createdByName?: string;
  createdAt?: Date;
}

/** Verze smlouvy: původní smlouva, nebo dodatek; nese snapshot dat. */
/** Vygenerovaný dokument verze smlouvy (Word, checklist) uložený ve složce lokality. */
export interface ContractDocument {
  name: string;
  url: string;
  createdAt?: Date;
}

export interface ServiceContractVersion {
  id: number;
  contractNumber: string;
  versionNo: number;
  kind: string;
  status: string;
  /** Od kdy verze platí (datum účinnosti). */
  effectiveFrom?: Date;
  /** U dodatku popis změn oproti předchozí verzi. */
  changeNote?: string;
  snapshot: ContractInput;
  createdByName?: string;
  createdAt?: Date;
  signedAt?: Date;
  signedByName?: string;
  /** Odkaz na sken podepsané verze. */
  signedUrl?: string;
  /** Vygenerované dokumenty této verze (od nejstarších). */
  documents?: ContractDocument[];
}

/** Nejnovější verze smlouvy (nejvyšší číslo). */
export function latestVersion(versions: ServiceContractVersion[], contractNumber: string): ServiceContractVersion | undefined {
  return versions.filter((v) => v.contractNumber === contractNumber).sort((a, b) => b.versionNo - a.versionNo)[0];
}

/** Platná verze: nejnovější podepsaná. */
export function activeVersion(versions: ServiceContractVersion[], contractNumber: string): ServiceContractVersion | undefined {
  return versions.filter((v) => v.contractNumber === contractNumber && v.status === 'Podepsaná').sort((a, b) => b.versionNo - a.versionNo)[0];
}

export interface BuildContractParams {
  catalog: ServiceCatalog;
  contractNumber: string;
  site: ServiceSite;
  /** Soubory lokality (neaktivní se vynechají). */
  devices: ServiceDevice[];
  /** Zákazník lokality (partner): objednatel smlouvy. */
  partner?: { name: string; ico?: string; dic?: string; address?: string };
  settings: ContractSettings;
}

const gpsText = (site: ServiceSite): string | undefined => (site.latitude !== undefined && site.longitude !== undefined ? `${site.latitude.toFixed(6)}, ${site.longitude.toFixed(6)}` : undefined);

/**
 * Výchozí obsah nové smlouvy pro lokalitu: objednatel z partnera, zhotovitel, asset manager, parametry, sazebník, autorizace, kontakty a eskalace
 * z nastavení (kopie), příloha lokality z lokality, jejích souborů a checklistu (příznaky, moduly, činnosti, periody). Cena a náhradní díly
 * zůstávají prázdné k doplnění.
 */
export function buildContractInput(p: BuildContractParams): ContractInput {
  const settings = JSON.parse(JSON.stringify(p.settings)) as ContractSettings;
  const checklist = cleanChecklist(p.catalog, p.site.checklist ?? { flags: [], modules: [], disabled: [], enabled: [], periods: {} });
  const siteDevices = p.devices.filter((d) => d.siteNumber === p.site.number && d.isActive);
  const items = evaluateChecklist(p.catalog, checklist, siteDevices.map((d) => d.kind));
  const bank = checklist.flags.indexOf('bankovni_financovani') >= 0;
  return {
    smlouva: { cislo: p.contractNumber, misto_podpisu: settings.mistoPodpisu },
    objednatel: {
      nazev: p.partner ? p.partner.name : p.site.customerName || '',
      sidlo: p.partner && p.partner.address ? p.partner.address : '',
      ico: p.partner && p.partner.ico ? p.partner.ico : '',
      dic: p.partner ? p.partner.dic : undefined
    },
    zhotovitel: settings.zhotovitel,
    asset_manager: settings.assetManager.nazev ? settings.assetManager : null,
    banka: p.site.financingBank ? { nazev: p.site.financingBank, ico: '' } : null,
    volby: { skupina_revoltum: false, penale: false, bankovni_ujednani: bank },
    parametry: settings.parametry,
    sazebnik: settings.sazebnik,
    autorizace_oem: settings.autorizaceOem,
    servisni_partneri: [],
    kontakty: settings.kontakty,
    eskalace: settings.eskalace,
    lokality: [
      {
        kod: p.site.number,
        nazev: p.site.name,
        priloha_cislo: '1',
        verze: versionLabel(1),
        adresa: p.site.address,
        katastr: p.site.cadastre,
        lv: p.site.lvNumber,
        parcely: p.site.parcels,
        gps: gpsText(p.site),
        pripojeni: p.site.gridConnection,
        pristup: p.site.siteAccess,
        agregator: p.site.aggregator,
        banka: p.site.financingBank,
        priznaky: checklist.flags,
        moduly: checklist.modules,
        cinnosti_vypnute: checklist.disabled,
        cinnosti_zapnute: checklist.enabled,
        perioda_override: checklist.periods,
        sla_profil: checklist.slaProfile,
        assety: assetsFromDevices(siteDevices),
        cinnosti: snapshotActivities(items),
        cena: { radky: [], celkem: 0 },
        nd: [],
        kontakty: [],
        zvlastni_ujednani: []
      }
    ]
  };
}

/** Nová verze (dodatek) vychází z kopie dat předchozí verze; příloha lokality dostane nové číslo verze. */
export function nextVersionSnapshot(previous: ContractInput, versionNo: number): ContractInput {
  const copy = JSON.parse(JSON.stringify(previous)) as ContractInput;
  copy.lokality.forEach((l) => {
    l.verze = versionLabel(versionNo);
  });
  return copy;
}

/** Souhrn smlouvy pro seznam: počet souborů, činností a kontrol podle závažnosti. */
export function contractSummary(catalog: ServiceCatalog, input: ContractInput): { assets: number; activities: number; errors: number; missing: number; warnings: number } {
  const issues = validateContract(catalog, input);
  return {
    assets: input.lokality.reduce((n, l) => n + l.assety.length, 0),
    activities: input.lokality.reduce((n, l) => n + (l.cinnosti ? l.cinnosti.length : 0), 0),
    errors: issues.filter((i) => i.severity === 'chyba').length,
    missing: issues.filter((i) => i.severity === 'doplnit').length,
    warnings: issues.filter((i) => i.severity === 'varování').length
  };
}

/**
 * Změna stavu verze smlouvy: důvod, proč nejde (prázdný text = jde), a nové stavy dotčených verzí (podepsání nahradí dříve podepsané).
 * Do stavu „K podpisu“ jde jen smlouva bez chyb a chybějících údajů (viz `statusChangeProblem`).
 */
export function contractStatusChange(catalog: ServiceCatalog, versions: ServiceContractVersion[], versionNo: number, to: string): { problem: string; updates: Record<number, string> } {
  const version = versions.filter((v) => v.versionNo === versionNo)[0];
  if (!version) {
    return { problem: 'Verze smlouvy nebyla nalezena.', updates: {} };
  }
  const problem = statusChangeProblem(version.status, to, to === 'K podpisu' ? validateContract(catalog, version.snapshot) : []);
  if (problem) {
    return { problem, updates: {} };
  }
  if (to === 'Podepsaná') {
    const after = statusesAfterSigning(versions, versionNo);
    const updates: Record<number, string> = {};
    Object.keys(after).forEach((k) => {
      const no = Number(k);
      const current = versions.filter((v) => v.versionNo === no)[0].status;
      if (after[no] !== current) {
        updates[no] = after[no];
      }
    });
    return { problem: '', updates };
  }
  return { problem: '', updates: { [versionNo]: to } };
}

/** Druh souboru v aplikaci podle typu v katalogu (pro vyhodnocení checklistu u příloh ve smlouvě). */
export function deviceKindOfAsset(typ: string): string {
  return typ === 'ENC' ? 'Kogenerace' : typ;
}

/**
 * Přepočítá činnosti přílohy lokality podle jejích příznaků, modulů a ručních úprav a podle souborů v příloze (po přidání nebo odebrání souboru).
 * Příznaky, moduly a úpravy zůstávají; mění se jen seznam činností.
 */
export function recomputeSiteActivities(catalog: ServiceCatalog, site: ContractSite): ContractSite {
  const checklist = cleanChecklist(catalog, { flags: site.priznaky, modules: site.moduly, disabled: site.cinnosti_vypnute, enabled: site.cinnosti_zapnute, periods: site.perioda_override, slaProfile: site.sla_profil });
  const items = evaluateChecklist(catalog, checklist, site.assety.map((a) => deviceKindOfAsset(a.typ)));
  return { ...site, cinnosti: snapshotActivities(items) };
}

// --- vazba smlouvy na provoz: pokrytí požadavků, platnost u souborů --------------------------------------------------

export type CoverageState = 'platna' | 'mimo-prilohu' | 'vyprsela' | 'bez-smlouvy';

export interface ContractCoverage {
  state: CoverageState;
  contractNumber?: string;
  /** Věta pro člověka („Smlouva 10500-01“, „Soubor není v příloze smlouvy 10500-01“…). */
  text: string;
}

/** Konec platnosti verze: účinnost od + doba smlouvy v letech (poslední den). Bez data účinnosti `undefined`. */
export function contractValidUntil(version: Pick<ServiceContractVersion, 'effectiveFrom' | 'snapshot'>): Date | undefined {
  const from = version.effectiveFrom;
  const years = version.snapshot.parametry.doba_let;
  if (!from || !isFinite(years) || years <= 0) {
    return undefined;
  }
  return new Date(from.getFullYear() + Math.floor(years), from.getMonth() + Math.round((years % 1) * 12), from.getDate() - 1);
}

/**
 * Pokrytí servisu smlouvou: platná smlouva lokality (nejnovější podepsaná verze, účinná a neuplynulá) a je-li požadavek na souboru, musí být
 * soubor v příloze. Činnost na celé lokalitě (bez souboru) pokrývá platná smlouva lokality.
 */
export function contractCoverage(siteNumber: string, deviceNumber: string | undefined, contracts: ServiceContract[], versions: ServiceContractVersion[], today: Date = new Date()): ContractCoverage {
  const own = contracts.filter((c) => c.siteNumber === siteNumber);
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  let expired: ServiceContract | undefined;
  let outside: ServiceContract | undefined;
  for (const c of own) {
    const v = activeVersion(versions, c.number);
    if (!v || (v.effectiveFrom && v.effectiveFrom.getTime() > day)) {
      continue;
    }
    const until = contractValidUntil(v);
    if (until && until.getTime() < day) {
      expired = c;
      continue;
    }
    const wholeSite = !deviceNumber || deviceNumber === siteNumber;
    if (wholeSite || v.snapshot.lokality.some((l) => l.assety.some((a) => a.kod === deviceNumber))) {
      return { state: 'platna', contractNumber: c.number, text: `Smlouva ${c.number}` };
    }
    outside = c;
  }
  if (outside) {
    return { state: 'mimo-prilohu', contractNumber: outside.number, text: `Soubor není v příloze smlouvy ${outside.number}` };
  }
  if (expired) {
    return { state: 'vyprsela', contractNumber: expired.number, text: `Smlouva ${expired.number} už vypršela` };
  }
  return { state: 'bez-smlouvy', text: 'Bez platné smlouvy' };
}

export interface DeviceContractUpdate {
  deviceNumber: string;
  contractFrom: Date;
  contractTo?: Date;
  contractNote: string;
}

/** Při podpisu verze: platnost smlouvy u souborů v příloze (od účinnosti na dobu smlouvy) a poznámka s číslem smlouvy a verze. */
export function deviceContractUpdates(version: Pick<ServiceContractVersion, 'contractNumber' | 'versionNo' | 'effectiveFrom' | 'snapshot'>, signedAt: Date): DeviceContractUpdate[] {
  const from = version.effectiveFrom ?? new Date(signedAt.getFullYear(), signedAt.getMonth(), signedAt.getDate());
  const until = contractValidUntil({ effectiveFrom: from, snapshot: version.snapshot });
  const out: DeviceContractUpdate[] = [];
  version.snapshot.lokality.forEach((l) => l.assety.forEach((a) => out.push({ deviceNumber: a.kod, contractFrom: from, contractTo: until, contractNote: `Smlouva ${version.contractNumber}, verze ${version.versionNo}` })));
  return out;
}
