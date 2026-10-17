/**
 * Opravy řádků z účetnictví — čistá logika bez SharePointu a Reactu.
 *
 * Najde-li projektový manažer v datech z Abry řádek, který do jeho projektu nepatří, označí ho jako **OPRAVU** s textovým popisem.
 * Řádek se tím odpojí od rozpočtu (nezapočítává se) a čeká, dokud se neodešle účtárně a ta ho neopraví; po opravě v Abře řádek
 * z projektu při dalším stažení zmizí a oprava se sama uzavře. Opravy jsou v samostatném seznamu (PRM_AbraCorrections), aby šly
 * sledovat napříč projekty.
 */

import { formatDate, formatMoney } from './format';
import { AbraDoc, AbraDocType, ABRA_DOC_LABELS } from './abraDocs';

/** Označeno = čeká na odeslání účtárně, Odesláno = čeká na opravu v účetnictví, Vyřešeno (opraveno v Abře), Zrušeno (omyl). */
export const CORRECTION_STATUSES = ['Označeno', 'Odesláno', 'Vyřešeno', 'Zrušeno'] as const;
export type CorrectionStatus = (typeof CORRECTION_STATUSES)[number];

/** Kopie řádku v okamžiku označení — pro e-mail účtárně a historii i poté, co řádek z Abry zmizí. */
export interface CorrectionLine {
  type: AbraDocType;
  partnerName?: string;
  description?: string;
  accounts?: string[];
  amountNet: number;
  currency: string;
  /** Datum vystavení jako text ISO (JSON). */
  issueDate?: string;
}

export interface AbraCorrection {
  id: number;
  projectNumber: string;
  /** Klíč řádku v Abře (shodný s `AbraDoc.abraId`). */
  abraId: string;
  docNumber: string;
  /** Popis opravy od projektového manažera. */
  note: string;
  status: CorrectionStatus;
  line: CorrectionLine;
  markedByName: string;
  markedByLogin?: string;
  markedAt?: Date;
  sentAt?: Date;
  sentByName?: string;
  resolvedAt?: Date;
  resolveNote?: string;
}

export const isOpenCorrection = (c: Pick<AbraCorrection, 'status'>): boolean => c.status === 'Označeno' || c.status === 'Odesláno';

export function correctionLine(doc: AbraDoc): CorrectionLine {
  return {
    type: doc.type,
    partnerName: doc.partnerName,
    description: doc.description,
    accounts: doc.accounts,
    amountNet: doc.amountNet,
    currency: doc.currency,
    issueDate: doc.issueDate ? doc.issueDate.toISOString() : undefined
  };
}

/** Popis opravy musí něco říkat (aspoň pár znaků). Vrací větu pro člověka, nebo prázdný text. */
export function correctionNoteProblem(note: string): string {
  return note.trim().length < 5 ? 'Popište, co je špatně a kam doklad patří (aspoň několik slov).' : '';
}

/** Otevřené opravy podle klíče řádku (u jednoho řádku je otevřená nejvýš jedna). */
export function openCorrectionsByDoc(list: AbraCorrection[]): Map<string, AbraCorrection> {
  const out = new Map<string, AbraCorrection>();
  list
    .filter(isOpenCorrection)
    .sort((a, b) => (a.markedAt ? a.markedAt.getTime() : 0) - (b.markedAt ? b.markedAt.getTime() : 0))
    .forEach((c) => out.set(c.abraId, c));
  return out;
}

/** Zmizel řádek z účetnictví projektu? (Není v seznamu, nebo ho prostředník označil „zmizel z Abry“.) */
export const isGoneFromAbra = (rows: AbraDoc[], abraId: string): boolean => {
  const row = rows.filter((r) => r.abraId === abraId)[0];
  return !row || /zmizel z Abry/i.test(row.description || '');
};

/**
 * Otevřené opravy, jejichž řádek už v účetnictví projektu není — účtárna ho opravila (přeúčtovala), nebo řádek zmizel z jiného důvodu a oprava
 * je zbytečná. Uzavírají se samy.
 * Jen když se z Abry vůbec něco stáhlo (prázdný seznam může znamenat výpadek, ne opravu).
 */
export function autoResolvable(corrections: AbraCorrection[], rows: AbraDoc[]): AbraCorrection[] {
  if (rows.length === 0) {
    return [];
  }
  return corrections.filter((c) => isOpenCorrection(c) && isGoneFromAbra(rows, c.abraId));
}

export interface CorrectionSummary {
  /** Označené, zatím neodeslané účtárně. */
  toSend: number;
  /** Odeslané, čekají na opravu v účetnictví. */
  waiting: number;
  /** Nejdéle čekající odeslaná oprava ve dnech od odeslání. */
  oldestWaitingDays?: number;
}

export function summarizeCorrections(list: AbraCorrection[], today: Date = new Date()): CorrectionSummary {
  const waiting = list.filter((c) => c.status === 'Odesláno');
  const days = waiting
    .map((c) => (c.sentAt ? Math.floor((today.getTime() - c.sentAt.getTime()) / (24 * 3600 * 1000)) : undefined))
    .filter((d): d is number => d !== undefined);
  return { toSend: list.filter((c) => c.status === 'Označeno').length, waiting: waiting.length, oldestWaitingDays: days.length > 0 ? Math.max(...days) : undefined };
}

/** E-mail účtárně: žádost o změnu zaúčtování řádků projektu (jeden e-mail na víc oprav jednoho projektu). */
export function correctionMail(p: { projectNumber: string; projectTitle: string; requesterName: string; corrections: AbraCorrection[]; link: string }): { subject: string; bodyText: string } {
  const lines = p.corrections.map((c, i) => {
    const l = c.line;
    const parts = [
      `${i + 1}. Doklad ${c.docNumber} (${ABRA_DOC_LABELS[l.type]})`,
      `   Partner: ${l.partnerName || '—'}`,
      `   Popis řádku: ${l.description || '—'}`,
      `   Účet: ${(l.accounts || []).join(', ') || '—'} · částka bez DPH: ${formatMoney(l.amountNet, l.currency)}${l.issueDate ? ` · vystaveno ${formatDate(l.issueDate)}` : ''}`,
      `   Požadovaná oprava: ${c.note.trim()}`
    ];
    return parts.join('\n');
  });
  return {
    subject: `Žádost o opravu zaúčtování — projekt ${p.projectNumber} (${p.corrections.length} ${p.corrections.length === 1 ? 'řádek' : p.corrections.length < 5 ? 'řádky' : 'řádků'})`,
    bodyText: [
      'Dobrý den,',
      '',
      `projektový manažer ${p.requesterName} při kontrole projektu ${p.projectNumber} ${p.projectTitle} zjistil řádky v účetnictví, které se mají opravit:`,
      '',
      lines.join('\n\n'),
      '',
      `Po opravě v Abře zmizí řádek při dalším stažení z projektu a oprava se v PRMIS uzavře sama. Projekt: ${p.link}`,
      '',
      'Děkuji.',
      p.requesterName
    ].join('\n')
  };
}
