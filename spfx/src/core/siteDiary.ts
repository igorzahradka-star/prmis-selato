/**
 * Zápisy ze stavby a stavební deníky — typy, kontrola zadání, názvy složek a souborů a pravidla (kdo smí co).
 * Čistá logika bez SharePointu a Reactu.
 *
 * Jeden projekt může mít **víc deníků** (např. podle souborů stavby); v každém deníku jsou zápisy s vlastním pořadovým číslem.
 * Zápis má hlavičku (stavba, místo, datum, projektový manažer, firemní údaje — vše jde upravit), účastníky (dodavatelé
 * i jiné subjekty), body jednání s fotkami a náčrty a dohodnuté úkoly.
 *
 * Cesta zápisu: Koncept (píše se a upravuje) → Uzavřeno (zamčeno, vznikne PDF a Word, zapíše se otisk obsahu) →
 * Podepsáno (podpis v aplikaci, nebo nahraný sken listinného podpisu). Podepsaný zápis se už nemění.
 */

import { CompanySettings } from './settings';
import { hasAnyRole, normalizeLogin } from './roles';
import { Role } from './types';
import { Actor, WorkflowError, WorkflowProject, canIssueOrder } from './orderWorkflow';

export enum EntryStatus {
  Koncept = 'Koncept',
  Uzavreno = 'Uzavřeno',
  Podepsano = 'Podepsáno',
  Storno = 'Storno'
}

export const ENTRY_STATUS_ORDER: EntryStatus[] = [EntryStatus.Koncept, EntryStatus.Uzavreno, EntryStatus.Podepsano, EntryStatus.Storno];

/** Jak byl zápis podepsán: přímo v aplikaci, nebo nahraným skenem listinného podpisu. */
export type SignatureKind = 'aplikace' | 'sken';

export const SIGNATURE_LABELS: Record<SignatureKind, string> = {
  aplikace: 'podpis v aplikaci',
  sken: 'podepsaný sken'
};

/**
 * Druh zápisu: běžný zápis ze stavby, nebo **předávací protokol** (stejný postup — koncept, uzavření, podpis —, ale jiný
 * obsah a vzhled dokumentu). Uložený je v obsahu zápisu, takže se schéma seznamů nemění.
 */
export type EntryKind = 'zapis' | 'predani';

/** Výsledek předání: co objednatel s dílem udělal. */
export type HandoverResult = 'bez-vyhrad' | 's-vyhradami' | 'neprevzato';

export const HANDOVER_RESULTS: HandoverResult[] = ['bez-vyhrad', 's-vyhradami', 'neprevzato'];

export const HANDOVER_RESULT_LABELS: Record<HandoverResult, string> = {
  'bez-vyhrad': 'Dílo převzato bez výhrad',
  's-vyhradami': 'Dílo převzato s výhradami (vady a nedodělky viz níže)',
  neprevzato: 'Dílo nebylo převzato'
};

/** Závěr předávacího protokolu. */
export interface HandoverInfo {
  result?: HandoverResult;
  /** Záruční doba v měsících (od data předání). */
  warrantyMonths?: number;
}

/** Název deníku, do kterého se ukládají předávací protokoly projektu (zakládá se sám při prvním protokolu). */
export const HANDOVER_DIARY_TITLE = 'Předávací protokoly';

/** Deník — stavební, nebo ten, který je vyhrazený předávacím protokolům? */
export const isHandoverDiary = (d: { title: string }): boolean => d.title.trim().toLocaleLowerCase('cs-CZ') === HANDOVER_DIARY_TITLE.toLocaleLowerCase('cs-CZ');

/** Deník stavby. K jednomu projektu jich může být víc. */
export interface SiteDiary {
  id: number;
  projectNumber: string;
  title: string;
  isActive: boolean;
  note?: string;
  created?: Date;
}

export interface Participant {
  name: string;
  /** Firma nebo jiný subjekt (dodavatel, zákazník, úřad…). */
  organization?: string;
  role?: string;
  /** Byl na jednání přítomen. */
  present: boolean;
}

/** Bod jednání: nadpis, text a soubory (fotky, náčrty, přílohy) uložené ve složce zápisu. */
export interface DiaryPoint {
  title?: string;
  text: string;
  files: string[];
}

export interface DiaryTask {
  description: string;
  responsible?: string;
  /** Termín jako datum `RRRR-MM-DD`. */
  due?: string;
}

/** Hlavička zápisu. Předvyplní se z projektu a Nastavení, ale vše jde před uzavřením upravit. */
export interface EntryHeader {
  constructionName: string;
  place: string;
  managerName: string;
  /** S kým se jednalo (dodavatel, zákazník, jiný subjekt) — volný text, může být vybraný z Partnerů. */
  counterparty?: string;
  counterpartyId?: number;
  company: Pick<CompanySettings, 'name' | 'street' | 'zip' | 'city' | 'ico' | 'dic'>;
}

/** Obsah zápisu, který se ukládá jako JSON. */
export interface EntryContent {
  header: EntryHeader;
  participants: Participant[];
  points: DiaryPoint[];
  tasks: DiaryTask[];
  /** Počasí a podmínky na stavbě (u stavebního deníku obvyklé). */
  conditions?: string;
  /** Druh zápisu; bez uvedení je to běžný zápis ze stavby. */
  kind?: EntryKind;
  /** Závěr předávacího protokolu (jen u druhu `predani`). */
  handover?: HandoverInfo;
}

export interface DiaryEntry extends EntryContent {
  id: number;
  diaryId: number;
  diaryTitle?: string;
  projectNumber: string;
  /** Pořadové číslo zápisu v rámci deníku. */
  entryNo: number;
  date: Date;
  /** Složka zápisu uvnitř složky projektu (vzniká při založení zápisu a už se nemění, ani když se deník přejmenuje). */
  folderPath: string;
  status: EntryStatus;
  createdByName: string;
  createdByLogin: string;
  closedByName?: string;
  closedAt?: Date;
  /** Otisk (SHA-256) obsahu zápisu a jeho souborů v okamžiku uzavření. */
  contentHash?: string;
  signatureKind?: SignatureKind;
  signedByName?: string;
  signedAt?: Date;
  pdfUrl?: string;
  docxUrl?: string;
  /** Nahraný sken podepsaného zápisu. */
  signedUrl?: string;
  cancelReason?: string;
  created?: Date;
  modified?: Date;
}

/** Údaje z formuláře zápisu. */
export interface EntryInput extends EntryContent {
  diaryId: number;
  projectNumber: string;
  date: Date;
}

// --- převody obsahu ------------------------------------------------------------

export const emptyHeader = (company: CompanySettings): EntryHeader => ({
  constructionName: '',
  place: '',
  managerName: '',
  company: { name: company.name, street: company.street, zip: company.zip, city: company.city, ico: company.ico, dic: company.dic }
});

export function contentToJson(content: EntryContent): string {
  return JSON.stringify({
    header: content.header,
    participants: content.participants,
    points: content.points,
    tasks: content.tasks,
    conditions: content.conditions ?? '',
    // Jen u předávacího protokolu — běžné zápisy se ukládají beze změny.
    ...(content.kind === 'predani' ? { kind: content.kind, handover: content.handover ?? {} } : {})
  });
}

/** Přečte uložený obsah; chybějící nebo poškozená část se nahradí prázdnou, aby zápis šel vždy otevřít. */
export function contentFromJson(json: string | undefined, fallbackHeader: EntryHeader): EntryContent {
  let raw: Partial<EntryContent> = {};
  try {
    raw = json ? (JSON.parse(json) as Partial<EntryContent>) : {};
  } catch {
    raw = {};
  }
  const arr = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
  return {
    header: { ...fallbackHeader, ...(raw.header ?? {}), company: { ...fallbackHeader.company, ...(raw.header && raw.header.company ? raw.header.company : {}) } },
    participants: arr(raw.participants).map((p) => ({ name: p.name || '', organization: p.organization, role: p.role, present: p.present !== false })),
    points: arr(raw.points).map((p) => ({ title: p.title, text: p.text || '', files: arr(p.files) })),
    tasks: arr(raw.tasks),
    conditions: raw.conditions || undefined,
    ...(raw.kind === 'predani' ? { kind: 'predani' as EntryKind, handover: readHandover(raw.handover) } : {})
  };
}

/** Závěr protokolu z uloženého JSONu; neznámé hodnoty se zahodí. */
function readHandover(raw: HandoverInfo | undefined): HandoverInfo {
  const result = raw && HANDOVER_RESULTS.indexOf(raw.result as HandoverResult) !== -1 ? raw.result : undefined;
  const months = raw && typeof raw.warrantyMonths === 'number' && raw.warrantyMonths >= 0 && raw.warrantyMonths <= 600 ? Math.floor(raw.warrantyMonths) : undefined;
  return { result, warrantyMonths: months };
}

/** Je zápis předávací protokol? */
export const isHandover = (e: { kind?: EntryKind }): boolean => e.kind === 'predani';

/** Číslo předávacího protokolu podle řady PP: `PP-26001-01`. */
export function protocolNumber(projectNumber: string, entryNo: number): string {
  return `PP-${(projectNumber || '').trim()}-${pad(entryNo, 2)}`;
}

/** Název dokumentu v záhlaví a v seznamech: „Zápis č. 7“, nebo „Předávací protokol PP-26001-01“. */
export function entryTitle(e: { kind?: EntryKind; projectNumber: string; entryNo: number }): string {
  return isHandover(e) ? `Předávací protokol ${protocolNumber(e.projectNumber, e.entryNo)}` : `Zápis č. ${e.entryNo}`;
}

/** Soubory použité v bodech zápisu (bez opakování, v pořadí použití). */
export function pointFiles(points: DiaryPoint[]): string[] {
  const seen: string[] = [];
  points.forEach((p) => p.files.forEach((f) => seen.indexOf(f) === -1 && seen.push(f)));
  return seen;
}

// --- kontrola zadání ---------------------------------------------------------------

export interface EntryIssue {
  field: string;
  message: string;
}

/**
 * Kontrola zadání. Koncept potřebuje jen deník a projekt; před uzavřením (`strict`) musí být vyplněná hlavička,
 * aspoň jeden bod jednání a úkoly musí mít popis.
 */
export function validateEntry(input: EntryInput, strict: boolean): EntryIssue[] {
  const issues: EntryIssue[] = [];
  if (!input.projectNumber || input.projectNumber.trim() === '') {
    issues.push({ field: 'projectNumber', message: 'Vyberte projekt.' });
  }
  if (!input.diaryId) {
    issues.push({ field: 'diary', message: 'Vyberte deník, do kterého zápis patří.' });
  }
  input.tasks.forEach((t, i) => {
    if ((t.responsible || t.due) && t.description.trim() === '') {
      issues.push({ field: 'tasks', message: `Úkol ${i + 1}: doplňte popis.` });
    }
  });
  if (strict) {
    if (input.header.constructionName.trim() === '') {
      issues.push({ field: 'constructionName', message: 'Vyplňte název stavby.' });
    }
    if (input.header.place.trim() === '') {
      issues.push({ field: 'place', message: 'Vyplňte místo stavby.' });
    }
    if (!input.points.some((p) => p.text.trim() !== '' || p.files.length > 0)) {
      issues.push({
        field: 'points',
        message: input.kind === 'predani' ? 'Popište předmět předání (text nebo fotku).' : 'Zapište aspoň jeden bod jednání (text nebo fotku).'
      });
    }
    if (input.kind === 'predani') {
      const result = input.handover ? input.handover.result : undefined;
      if (!result) {
        issues.push({ field: 'result', message: 'Vyberte výsledek předání (převzato bez výhrad / s výhradami / nepřevzato).' });
      }
      if (!input.header.counterparty || input.header.counterparty.trim() === '') {
        issues.push({ field: 'counterparty', message: 'Vyplňte, komu se dílo předává (objednatel / přebírající).' });
      }
      if (result === 's-vyhradami' && !input.tasks.some((t) => t.description.trim() !== '')) {
        issues.push({ field: 'tasks', message: 'Při převzetí s výhradami uveďte aspoň jednu vadu nebo nedodělek.' });
      }
    }
    if (input.header.company.name.trim() === '') {
      issues.push({ field: 'company', message: 'Vyplňte název firmy v hlavičce.' });
    }
  }
  return issues;
}

// --- názvy složek a souborů -----------------------------------------------------------

/** Název použitelný ve složce nebo souboru SharePointu: bez zakázaných znaků, bez koncových teček a mezer. */
export function safeName(text: string, fallback: string = 'bez_nazvu'): string {
  const cleaned = (text || '')
    .replace(/["*:<>?/\\|#%~&{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return cleaned === '' ? fallback : cleaned.length > 80 ? cleaned.slice(0, 80).trim() : cleaned;
}

function pad(n: number, width: number): string {
  let s = String(Math.max(0, Math.floor(n)));
  while (s.length < width) {
    s = `0${s}`;
  }
  return s;
}

/** Složka zápisu uvnitř složky projektu: `Zápisy/Hlavní deník/Z007`. */
export function entryFolderPath(diaryFolder: string, diaryTitle: string, entryNo: number, kind?: EntryKind): string {
  const base = (diaryFolder || '').replace(/^\/+|\/+$/g, '');
  // Předávací protokol má složku `PP01` (v deníku Předávací protokoly), zápis `Z007`.
  const last = kind === 'predani' ? `PP${pad(entryNo, 2)}` : `Z${pad(entryNo, 3)}`;
  return `${base ? base + '/' : ''}${safeName(diaryTitle, 'Denik')}/${last}`;
}

/** Podsložka příloh zápisu (fotky, náčrty, další soubory). */
export function entryFilesPath(entryFolder: string): string {
  return `${entryFolder}/Přílohy`;
}

/** Název souboru s výstupem zápisu: `Zapis_26001_Z007.pdf`. */
export function entryFileName(projectNumber: string, entryNo: number, extension: 'pdf' | 'docx' | 'podepsano.pdf', kind?: EntryKind): string {
  if (kind === 'predani') {
    return `Predavaci_protokol_${safeName(projectNumber, 'projekt').replace(/\s/g, '_')}_PP${pad(entryNo, 2)}.${extension}`;
  }
  return `Zapis_${safeName(projectNumber, 'projekt').replace(/\s/g, '_')}_Z${pad(entryNo, 3)}.${extension}`;
}

/** Oddělí příponu od názvu (`foto.JPG` → `.jpg`); bez přípony prázdný text. */
export function fileExtension(name: string): string {
  const dot = (name || '').lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

export function isImageFile(name: string): boolean {
  return IMAGE_EXTENSIONS.indexOf(fileExtension(name)) !== -1;
}

/** Den jako `RRRR-MM-DD` (místního času). */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

/** Den z textu `RRRR-MM-DD`; jiný tvar vrátí `undefined`. */
export function parseIsoDay(text: string | undefined): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((text || '').trim());
  if (!m) {
    return undefined;
  }
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Neexistující den (2026-13-45) se nepřepočítá na jiné datum, ale odmítne.
  return isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3]) ? undefined : d;
}

/** Další pořadové číslo zápisu v deníku (nejvyšší existující + 1). */
export function nextEntryNumber(existing: number[]): number {
  return existing.reduce((max, n) => (n > max ? n : max), 0) + 1;
}

// --- pravidla: kdo smí co ---------------------------------------------------------------

function sameLogin(a: string | undefined, b: string | undefined): boolean {
  const x = normalizeLogin(a);
  return x !== '' && x === normalizeLogin(b);
}

/** Smí uživatel psát zápisy na projektu? PM, asistent a další s právem upravovat projekt; na Režii se zápisy nevedou. */
export function canWriteDiary(project: WorkflowProject, actor: Actor): boolean {
  return !project.isOverhead && canIssueOrder(project, actor);
}

/** Kdo smí se zápisem nakládat: autor, PM projektu, vedení a administrátor. */
export function canManageEntry(entry: DiaryEntry, project: WorkflowProject, actor: Actor): boolean {
  return (
    sameLogin(entry.createdByLogin, actor.login) ||
    sameLogin(project.projectManagerLogin, actor.login) ||
    hasAnyRole(actor.roles, Role.Administrator, Role.Vedeni)
  );
}

export type EntryAction = 'edit' | 'close' | 'reopen' | 'sign' | 'scan' | 'cancel';

export interface EntryContext {
  project: WorkflowProject;
  actor: Actor;
  now: Date;
}

export interface EntryChange {
  status: EntryStatus;
  auditAction: string;
  closedByName?: string;
  closedAt?: Date;
  contentHash?: string;
  clearClosure?: boolean;
  signatureKind?: SignatureKind;
  signedByName?: string;
  signedAt?: Date;
  signedUrl?: string;
  pdfUrl?: string;
  docxUrl?: string;
  cancelReason?: string;
}

/** Akce, které má uživatel u zápisu nabídnout (tlačítka). Rozhodnutí se znovu ověřuje při zápisu. */
export function availableEntryActions(entry: DiaryEntry, project: WorkflowProject, actor: Actor): EntryAction[] {
  if (!canManageEntry(entry, project, actor)) {
    return [];
  }
  switch (entry.status) {
    case EntryStatus.Koncept:
      return ['edit', 'close', 'cancel'];
    case EntryStatus.Uzavreno:
      return ['sign', 'scan', 'reopen', 'cancel'];
    default:
      return [];
  }
}

export function canEditEntry(entry: DiaryEntry, project: WorkflowProject, actor: Actor): boolean {
  return entry.status === EntryStatus.Koncept && canManageEntry(entry, project, actor);
}

function requireManage(entry: DiaryEntry, ctx: EntryContext, what: string): void {
  if (!canManageEntry(entry, ctx.project, ctx.actor)) {
    throw new WorkflowError(`${what}: se zápisem smí nakládat jen jeho autor, projektový manažer projektu, vedení nebo administrátor.`);
  }
}

function requireStatus(entry: DiaryEntry, allowed: EntryStatus[], what: string): void {
  if (allowed.indexOf(entry.status) === -1) {
    throw new WorkflowError(`${what}: zápis č. ${entry.entryNo} je ve stavu „${entry.status}“, to nejde.`);
  }
}

/**
 * Uzavření zápisu: zamkne ho, zapíše kdo a kdy a otisk obsahu (`contentHash`), kterým se později ověří, že se zápis
 * do podpisu nezměnil. Zápis musí být úplný.
 */
export function closeEntry(entry: DiaryEntry, contentHash: string, ctx: EntryContext, output?: { pdfUrl?: string; docxUrl?: string }): EntryChange {
  requireStatus(entry, [EntryStatus.Koncept], 'Uzavřít zápis');
  requireManage(entry, ctx, 'Uzavřít zápis');
  const issues = validateEntry(
    { ...entry, diaryId: entry.diaryId, projectNumber: entry.projectNumber, date: entry.date },
    true
  );
  if (issues.length > 0) {
    throw new WorkflowError(`Zápis nejde uzavřít: ${issues.slice(0, 3).map((i) => i.message).join(' ')}`);
  }
  if (!contentHash) {
    throw new WorkflowError('Zápis nejde uzavřít: chybí otisk obsahu.');
  }
  return {
    status: EntryStatus.Uzavreno,
    closedByName: ctx.actor.displayName,
    closedAt: ctx.now,
    contentHash,
    pdfUrl: output ? output.pdfUrl : undefined,
    docxUrl: output ? output.docxUrl : undefined,
    auditAction: `Zápis uzavřen (otisk ${contentHash.slice(0, 12)}…)`
  };
}

/** Zrušení uzavření — zápis se vrátí do konceptu, dokud není podepsaný. Vždy s důvodem. */
export function reopenEntry(entry: DiaryEntry, reason: string, ctx: EntryContext): EntryChange {
  requireStatus(entry, [EntryStatus.Uzavreno], 'Znovu otevřít zápis');
  requireManage(entry, ctx, 'Znovu otevřít zápis');
  const text = (reason || '').trim();
  if (text === '') {
    throw new WorkflowError('Při znovuotevření napište důvod.');
  }
  return { status: EntryStatus.Koncept, clearClosure: true, auditAction: `Uzavření zrušeno: ${text}` };
}

/**
 * Podpis v aplikaci (jednoduchý elektronický podpis): zapíše se, kdo a kdy; otisk obsahu se musí shodovat s otiskem
 * z uzavření — jinak by se podepsalo něco jiného, než bylo uzavřeno.
 */
export function signEntryInApp(entry: DiaryEntry, currentHash: string, ctx: EntryContext): EntryChange {
  requireStatus(entry, [EntryStatus.Uzavreno], 'Podepsat zápis');
  requireManage(entry, ctx, 'Podepsat zápis');
  if (!entry.contentHash || entry.contentHash !== currentHash) {
    throw new WorkflowError('Obsah zápisu se od uzavření změnil (nesouhlasí otisk). Zápis znovu otevřete, zkontrolujte a uzavřete.');
  }
  return {
    status: EntryStatus.Podepsano,
    signatureKind: 'aplikace',
    signedByName: ctx.actor.displayName,
    signedAt: ctx.now,
    auditAction: `Podepsáno v aplikaci (otisk ${entry.contentHash.slice(0, 12)}…)`
  };
}

/** Podpis skenem: k uzavřenému zápisu se připojí nahraný podepsaný sken. */
export function attachSignedScan(entry: DiaryEntry, signedUrl: string, ctx: EntryContext): EntryChange {
  requireStatus(entry, [EntryStatus.Uzavreno], 'Připojit podepsaný sken');
  requireManage(entry, ctx, 'Připojit podepsaný sken');
  if (!signedUrl) {
    throw new WorkflowError('Chybí odkaz na nahraný sken.');
  }
  return {
    status: EntryStatus.Podepsano,
    signatureKind: 'sken',
    signedByName: ctx.actor.displayName,
    signedAt: ctx.now,
    signedUrl,
    auditAction: 'Připojen podepsaný sken'
  };
}

/** Storno zápisu (jen koncept nebo uzavřený, vždy s důvodem). Podepsaný zápis se nestornuje — opravuje se dalším zápisem. */
export function cancelEntry(entry: DiaryEntry, reason: string, ctx: EntryContext): EntryChange {
  requireStatus(entry, [EntryStatus.Koncept, EntryStatus.Uzavreno], 'Stornovat zápis');
  requireManage(entry, ctx, 'Stornovat zápis');
  const text = (reason || '').trim();
  if (text === '') {
    throw new WorkflowError('Při stornu napište důvod.');
  }
  return { status: EntryStatus.Storno, cancelReason: text, auditAction: `Stornováno: ${text}` };
}

/** Smazat smí jen administrátor (Jednorázové akce). */
export function canDeleteEntry(actor: Actor): boolean {
  return hasAnyRole(actor.roles, Role.Administrator);
}

export function applyEntryChange(entry: DiaryEntry, change: EntryChange, now: Date): DiaryEntry {
  return {
    ...entry,
    status: change.status,
    closedByName: change.clearClosure ? undefined : change.closedByName ?? entry.closedByName,
    closedAt: change.clearClosure ? undefined : change.closedAt ?? entry.closedAt,
    contentHash: change.clearClosure ? undefined : change.contentHash ?? entry.contentHash,
    signatureKind: change.signatureKind ?? entry.signatureKind,
    signedByName: change.signedByName ?? entry.signedByName,
    signedAt: change.signedAt ?? entry.signedAt,
    signedUrl: change.signedUrl ?? entry.signedUrl,
    pdfUrl: change.pdfUrl ?? entry.pdfUrl,
    docxUrl: change.docxUrl ?? entry.docxUrl,
    cancelReason: change.cancelReason ?? entry.cancelReason,
    modified: now
  };
}

// --- filtr a řazení -------------------------------------------------------------------------

export interface EntryListFilter {
  projectNumber?: string;
  diaryId?: number;
  statuses?: string[];
  search?: string;
  /** Jen zápisy ze stavby (`zapis`), nebo jen předávací protokoly (`predani`); bez uvedení všechno. */
  kind?: EntryKind;
}

/** Fulltext přes pořadové číslo, hlavičku, účastníky a texty bodů; filtr projektu, deníku a stavu. */
export function filterEntries(list: DiaryEntry[], filter?: EntryListFilter): DiaryEntry[] {
  const f = filter || {};
  const q = (f.search || '').trim().toLocaleLowerCase('cs-CZ');
  return list.filter((e) => {
    if (f.projectNumber && e.projectNumber !== f.projectNumber) {
      return false;
    }
    if (f.diaryId && e.diaryId !== f.diaryId) {
      return false;
    }
    if (f.kind && (f.kind === 'predani') !== isHandover(e)) {
      return false;
    }
    if (f.statuses && f.statuses.length > 0 && f.statuses.indexOf(e.status) === -1) {
      return false;
    }
    if (!q) {
      return true;
    }
    const hay = [
      String(e.entryNo),
      e.diaryTitle,
      e.header.constructionName,
      e.header.place,
      e.header.counterparty,
      ...e.participants.map((p) => `${p.name} ${p.organization || ''}`),
      ...e.points.map((p) => `${p.title || ''} ${p.text}`)
    ];
    return hay.filter((v) => !!v).some((v) => (v as string).toLocaleLowerCase('cs-CZ').indexOf(q) !== -1);
  });
}

/** Nejnovější zápis první: podle data, při shodě podle čísla. */
export function sortEntriesNewestFirst(list: DiaryEntry[]): DiaryEntry[] {
  return list.slice().sort((a, b) => b.date.getTime() - a.date.getTime() || b.entryNo - a.entryNo);
}
