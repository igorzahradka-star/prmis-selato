/**
 * Modul Servis — čistá logika bez SharePointu a Reactu.
 *
 * Struktura: **lokalita** (místo zákazníka, číslo po desítkách: 10500, 10510…) → **soubor** (FVE, BESS…; dříve „zařízení“; číslo lokality + 1 až 9:
 * 10501…). Soubor je „servisní zakázka“: má vlastní číslo, složku, smlouvu a fakturaci a v aplikaci je to skrytý projekt typu Servis
 * (nezobrazuje se v přehledu projektů). Pod lokalitou se vydávají servisní požadavky a z nich servisní listy.
 * Práva: Servis vidí a obsluhuje jen Správce servisu, Dispečer a administrátor (vedení jen čte).
 */

import { Role } from './types';
import { hasAnyRole } from './roles';
import { sanitizeFolderName } from './numbering';

/** Typ projektu, pod kterým je zařízení vedeno; takové projekty se v přehledu projektů neukazují. */
export const SERVICE_PROJECT_TYPE = 'Servis';

/** První číslo lokality (10500), když ještě žádná není. */
export const FIRST_SITE_NUMBER = 10500;

export const DEVICE_KINDS = ['FVE', 'BESS', 'MVE', 'Kogenerace', 'Jiné'] as const;

export interface ServiceSite {
  id: number;
  /** Číslo lokality (10500, 10510…) — násobek deseti. */
  number: string;
  name: string;
  customerId?: number;
  customerName?: string;
  address?: string;
  /** Poloha lokality na mapě (zeměpisná šířka a délka). */
  latitude?: number;
  longitude?: number;
  contact?: string;
  note?: string;
  /** Odkaz na složku lokality v knihovně Dokumenty. */
  folderUrl?: string;
  isActive: boolean;
}

export interface ServiceDevice {
  id: number;
  /** Číslo zařízení = číslo servisního projektu (10501…). */
  number: string;
  siteNumber: string;
  name: string;
  kind: string;
  /** Poloha souboru na mapě; bez ní platí poloha lokality. */
  latitude?: number;
  longitude?: number;
  customerName?: string;
  /** Servisní smlouva: dokument s komerčními podmínkami uložený u zařízení; zde jen platnost a odkaz. */
  contractFrom?: Date;
  contractTo?: Date;
  contractNote?: string;
  contractUrl?: string;
  folderUrl?: string;
  isActive: boolean;
}

// --- práva -----------------------------------------------------------------------

/** Smí uživatel Servis vidět? Správce, dispečer, administrátor, vedení a čtenář (vedení a čtenář jen čtou). */
export function canViewService(roles: Role[]): boolean {
  return hasAnyRole(roles, Role.Administrator, Role.Vedeni, Role.SpravceServisu, Role.Dispecer, Role.Ctenar);
}

/** Smí uživatel v Servisu pracovat (požadavky, servisní listy, objednávky)? */
export function canWorkInService(roles: Role[]): boolean {
  return hasAnyRole(roles, Role.Administrator, Role.SpravceServisu, Role.Dispecer);
}

/** Smí uživatel spravovat lokality a zařízení, kontrolovat provedení a odemykat fakturaci? Jen správce servisu a administrátor. */
export function canAdministerService(roles: Role[]): boolean {
  return hasAnyRole(roles, Role.Administrator, Role.SpravceServisu);
}

/** Role, které smí vidět servisní projekty (pro omezení přístupu v SharePointu). */
export const SERVICE_ACCESS_ROLES: Role[] = [Role.Administrator, Role.Vedeni, Role.SpravceServisu, Role.Dispecer];

export const isServiceProject = (p: { projectType?: string }): boolean => p.projectType === SERVICE_PROJECT_TYPE;

/**
 * Čísla servisních projektů, jejichž objednávky, faktury a další záznamy se uživateli **nemají ukazovat** (nemá práva Servisu).
 * Ochrana dat je v SharePointu; tohle jen uklidí obrazovky, aby se servis neobjevil v seznamech běžným projektovým manažerům.
 */
export function hiddenServiceNumbers(projects: { projectNumber: string; projectType?: string }[], roles: Role[]): Set<string> {
  return canViewService(roles) ? new Set<string>() : new Set(projects.filter(isServiceProject).map((p) => p.projectNumber));
}

// --- číslování -------------------------------------------------------------------

const num = (s: string): number => parseInt(s, 10);
const isFiveDigits = (s: string): boolean => /^\d{5}$/.test(s);

/** Číslo lokality: pětimístné a násobek deseti (10500, 10510). */
export const isSiteNumber = (s: string): boolean => isFiveDigits(s) && num(s) % 10 === 0;
/** Číslo zařízení: pětimístné a ne násobek deseti (10501…10509). */
export const isDeviceNumber = (s: string): boolean => isFiveDigits(s) && num(s) % 10 !== 0;
/** Číslo lokality, do které zařízení patří (10513 → 10510). */
export const siteNumberOfDevice = (deviceNumber: string): string => String(Math.floor(num(deviceNumber) / 10) * 10);

/** Další volné číslo lokality po desítkách; bez lokalit 10500. */
export function nextSiteNumber(existing: string[]): string {
  const used = existing.filter(isSiteNumber).map(num);
  return String(used.length > 0 ? Math.max(...used) + 10 : FIRST_SITE_NUMBER);
}

/** Další volné číslo zařízení v rozsahu lokality; `undefined`, když je rozsah plný (devět zařízení). */
export function nextDeviceNumber(siteNumber: string, existing: string[]): string | undefined {
  const base = num(siteNumber);
  for (let i = 1; i <= 9; i++) {
    const candidate = String(base + i);
    if (existing.indexOf(candidate) === -1) {
      return candidate;
    }
  }
  return undefined;
}

/** Kontrola čísla lokality při zadání; vrací text chyby, nebo prázdný řetězec. */
export function validateSiteNumber(number: string, existing: string[], selfNumber?: string): string {
  if (!isSiteNumber(number)) {
    return 'Číslo lokality musí být pětimístné a dělitelné deseti (např. 10510).';
  }
  if (number !== selfNumber && existing.indexOf(number) !== -1) {
    return `Lokalita s číslem ${number} už existuje.`;
  }
  return '';
}

/** Kontrola čísla zařízení; číslo mimo rozsah lokality jen upozorní (správce ho smí přepsat), duplicita je chyba. */
export function validateDeviceNumber(number: string, siteNumber: string, existing: string[], selfNumber?: string): { error: string; warning: string } {
  if (!isDeviceNumber(number)) {
    return { error: 'Číslo souboru musí být pětimístné a nesmí být dělitelné deseti (např. 10511).', warning: '' };
  }
  if (number !== selfNumber && existing.indexOf(number) !== -1) {
    return { error: `Soubor s číslem ${number} už existuje.`, warning: '' };
  }
  return { error: '', warning: siteNumberOfDevice(number) !== siteNumber ? `Číslo ${number} je mimo rozsah lokality ${siteNumber} (${num(siteNumber) + 1}–${num(siteNumber) + 9}).` : '' };
}

// --- složky ----------------------------------------------------------------------

/** Název složky: „10501 - Mastířovice I. FVE“. */
export const serviceFolderName = (number: string, name: string): string => sanitizeFolderName(`${number} - ${name}`.trim());

/** Cesta složky lokality nebo zařízení pod kořenem Servisu, např. `General/02_SERVIS/10500 - Mastířovice/10501 - Mastířovice I. FVE`. */
export function serviceFolderPath(serviceRoot: string, site: { number: string; name: string }, device?: { number: string; name: string }): string {
  const parts = serviceRoot.split('/').map((s) => sanitizeFolderName(s)).filter((s) => s !== '');
  parts.push(serviceFolderName(site.number, site.name));
  if (device) {
    parts.push(serviceFolderName(device.number, device.name));
  }
  return parts.join('/');
}

/** Kořenová složka Servisu v knihovně dokumentů (nastavuje se v Nastavení → Servis). */
export const DEFAULT_SERVICE_FOLDER_ROOT = 'General/02_SERVIS';

/** Podsložky lokality: smlouva a podmínky, požadavky, objednávky a faktury, dokumentace, společné zásahy (CCTV, EZS, sečení trávy…). */
export const SERVICE_SITE_SUBFOLDERS = ['01-Smlouva a podmínky', '02-Servisní požadavky', '03-Objednávky a faktury', '04-Dokumentace lokality', '05-Společné zásahy lokality'];

/** Podsložky souboru (FVE, BESS…): plán údržby a revize, servisní listy (fotky a protokoly), dokumentace, objednávky a faktury. */
export const SERVICE_DEVICE_SUBFOLDERS = ['01-Plán údržby a revize', '02-Servisní listy', '03-Dokumentace souboru', '04-Objednávky a faktury'];

export interface ServiceFolderPlan {
  /** Cesta ke kořeni Servisu po dílech (např. General, 02_SERVIS). */
  rootSegments: string[];
  /** Složka lokality: `10500 - Mastířovice`. */
  siteFolder: string;
  siteSubfolders: string[];
  /** Složka souboru uvnitř složky lokality: `10501 - Mastířovice I. FVE`. */
  deviceFolder?: string;
  deviceSubfolders: string[];
}

/** Co se má při založení lokality (nebo souboru) vytvořit. Existující složky se podle čísla na začátku najdou a znovu se nezakládají. */
export function serviceFolderPlan(root: string, site: { number: string; name: string }, device?: { number: string; name: string }): ServiceFolderPlan {
  return {
    rootSegments: (root || DEFAULT_SERVICE_FOLDER_ROOT).split('/').map((s) => sanitizeFolderName(s)).filter((s) => s !== ''),
    siteFolder: serviceFolderName(site.number, site.name),
    siteSubfolders: SERVICE_SITE_SUBFOLDERS,
    deviceFolder: device ? serviceFolderName(device.number, device.name) : undefined,
    deviceSubfolders: device ? SERVICE_DEVICE_SUBFOLDERS : []
  };
}

/**
 * Servisní list na **celou lokalitu** (společné zásahy: CCTV, EZS, sečení trávy, dispečerské pracoviště) má jako `deviceNumber` číslo lokality;
 * objednávky a fakturace se pak vedou na skrytém servisním projektu lokality (číslo lokality, např. 10500).
 */
export const isSiteWideJob = (job: { siteNumber: string; deviceNumber: string }): boolean => job.deviceNumber === job.siteNumber;

/**
 * Lokalitu jde smazat jen tehdy, když je prázdná — nemá žádný soubor, požadavek ani servisní list. Jinak by se ztratila historie;
 * takovou lokalitu je lepší označit jako neaktivní. Vrací důvod, proč smazat nejde, nebo prázdný text.
 */
export function siteDeletionProblem(
  siteNumber: string,
  devices: { siteNumber: string }[],
  requests: { siteNumber: string }[],
  jobs: { siteNumber: string }[]
): string {
  const parts: string[] = [];
  const d = devices.filter((x) => x.siteNumber === siteNumber).length;
  const r = requests.filter((x) => x.siteNumber === siteNumber).length;
  const j = jobs.filter((x) => x.siteNumber === siteNumber).length;
  if (d > 0) {
    parts.push(`${d} souborů`);
  }
  if (r > 0) {
    parts.push(`${r} požadavků`);
  }
  if (j > 0) {
    parts.push(`${j} servisních listů`);
  }
  return parts.length === 0 ? '' : `Lokalitu nejde smazat, má ${parts.join(', ')}. Označte ji raději jako neaktivní (Upravit → Aktivní).`;
}

/** Požadavek jde smazat jen bez servisních listů (jinak by se ztratila návaznost objednávek a fakturace); vrací důvod, proč ne, nebo prázdný text. */
export function requestDeletionProblem(requestId: number, jobs: { requestId?: number }[]): string {
  const n = jobs.filter((j) => j.requestId === requestId).length;
  return n === 0 ? '' : `Požadavek nejde smazat, má ${n} servisních listů. Zrušte nebo uzavřete listy, případně požadavek zamítněte.`;
}

// --- smlouva ---------------------------------------------------------------------

export type ContractState = 'bez' | 'platna' | 'konci' | 'vyprsela';

export const CONTRACT_STATE_LABELS: Record<ContractState, string> = {
  bez: 'Bez smlouvy',
  platna: 'Smlouva platí',
  konci: 'Smlouva brzy končí',
  vyprsela: 'Smlouva vypršela'
};

/** Stav smlouvy zařízení k datu: bez údajů, platí, končí do 60 dnů, vypršela. */
export function contractState(device: Pick<ServiceDevice, 'contractFrom' | 'contractTo' | 'contractUrl'>, today: Date = new Date()): ContractState {
  if (!device.contractFrom && !device.contractTo && !device.contractUrl) {
    return 'bez';
  }
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (device.contractTo) {
    const end = new Date(device.contractTo.getFullYear(), device.contractTo.getMonth(), device.contractTo.getDate()).getTime();
    if (end < t) {
      return 'vyprsela';
    }
    if (end - t <= 60 * 86400000) {
      return 'konci';
    }
  }
  return 'platna';
}
