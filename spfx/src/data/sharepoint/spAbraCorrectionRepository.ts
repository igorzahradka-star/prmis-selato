/**
 * Opravy řádků z účetnictví (PRM_AbraCorrections). Čtení nikdy nesmí shodit záložku „Data z účetnictví“: před Instalací seznam není
 * a vrací se prázdný výsledek; zápis pak skončí srozumitelnou hláškou.
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { CurrentUser } from '../../core/types';
import { toDate } from '../../core/format';
import { AbraDoc } from '../../core/abraDocs';
import { AbraCorrection, CORRECTION_STATUSES, CorrectionLine, CorrectionStatus, correctionLine, correctionNoteProblem } from '../../core/abraCorrections';
import { IAbraCorrectionRepository } from '../repositories';
import { getSp, describeSpError } from './spContext';

const LIST = 'PRM_AbraCorrections';

interface Item {
  Id: number;
  Created?: string;
  ProjectNumber?: string;
  AbraId?: string;
  DocNumber?: string;
  CorrectionNote?: string;
  CorrectionStatus?: string;
  LineJson?: string;
  MarkedByName?: string;
  MarkedByLogin?: string;
  SentAt?: string;
  SentByName?: string;
  ResolvedAt?: string;
  ResolveNote?: string;
}

const FIELDS = ['Id', 'Created', 'ProjectNumber', 'AbraId', 'DocNumber', 'CorrectionNote', 'CorrectionStatus', 'LineJson', 'MarkedByName', 'MarkedByLogin', 'SentAt', 'SentByName', 'ResolvedAt', 'ResolveNote'];

function parseLine(json: string | undefined): CorrectionLine {
  try {
    const raw = JSON.parse(json || '') as CorrectionLine;
    return { ...raw, amountNet: typeof raw.amountNet === 'number' ? raw.amountNet : 0, currency: raw.currency || 'CZK' };
  } catch {
    return { type: 'prijata', amountNet: 0, currency: 'CZK' };
  }
}

function toCorrection(i: Item): AbraCorrection {
  const status = (CORRECTION_STATUSES as readonly string[]).indexOf(i.CorrectionStatus || '') >= 0 ? (i.CorrectionStatus as CorrectionStatus) : 'Označeno';
  return {
    id: i.Id,
    projectNumber: i.ProjectNumber || '',
    abraId: i.AbraId || '',
    docNumber: i.DocNumber || i.AbraId || '',
    note: i.CorrectionNote || '',
    status,
    line: parseLine(i.LineJson),
    markedByName: i.MarkedByName || '',
    markedByLogin: i.MarkedByLogin || undefined,
    markedAt: toDate(i.Created),
    sentAt: toDate(i.SentAt),
    sentByName: i.SentByName || undefined,
    resolvedAt: toDate(i.ResolvedAt),
    resolveNote: i.ResolveNote || undefined
  };
}

const q = (s: string): string => s.replace(/'/g, "''");

export class SpAbraCorrectionRepository implements IAbraCorrectionRepository {
  public constructor(private readonly context: WebPartContext) {}

  public async list(projectNumber: string): Promise<AbraCorrection[]> {
    try {
      const items: Item[] = await getSp(this.context).web.lists.getByTitle(LIST).items.select(...FIELDS).filter(`ProjectNumber eq '${q(projectNumber)}'`).top(1000)();
      return items.map(toCorrection);
    } catch {
      return [];
    }
  }

  public async listOpen(): Promise<AbraCorrection[]> {
    try {
      const items: Item[] = await getSp(this.context).web.lists.getByTitle(LIST).items.select(...FIELDS).filter("CorrectionStatus eq 'Označeno' or CorrectionStatus eq 'Odesláno'").top(5000)();
      return items.map(toCorrection);
    } catch {
      return [];
    }
  }

  private async update(id: number, fields: Record<string, unknown>, what: string): Promise<void> {
    try {
      await getSp(this.context).web.lists.getByTitle(LIST).items.getById(id).update(fields);
    } catch (error) {
      throw new Error(describeSpError(error, what));
    }
  }

  public async mark(input: { projectNumber: string; doc: AbraDoc; note: string }, actor: CurrentUser): Promise<AbraCorrection> {
    const problem = correctionNoteProblem(input.note);
    if (problem) {
      throw new Error(problem);
    }
    const existing = (await this.list(input.projectNumber)).filter((c) => c.abraId === input.doc.abraId && (c.status === 'Označeno' || c.status === 'Odesláno'))[0];
    if (existing) {
      throw new Error('U tohoto řádku už je oprava označená.');
    }
    const line = correctionLine(input.doc);
    try {
      const added = await getSp(this.context).web.lists.getByTitle(LIST).items.add({
        Title: `${input.projectNumber} ${input.doc.number}`,
        ProjectNumber: input.projectNumber,
        AbraId: input.doc.abraId,
        DocNumber: input.doc.number,
        CorrectionNote: input.note.trim(),
        CorrectionStatus: 'Označeno',
        LineJson: JSON.stringify(line),
        MarkedByName: actor.displayName,
        MarkedByLogin: actor.loginName
      });
      const data = (added as { data?: { Id?: number }; Id?: number }).data ?? (added as { Id?: number });
      return { id: (data as { Id?: number }).Id ?? 0, projectNumber: input.projectNumber, abraId: input.doc.abraId, docNumber: input.doc.number, note: input.note.trim(), status: 'Označeno', line, markedByName: actor.displayName, markedByLogin: actor.loginName, markedAt: new Date() };
    } catch (error) {
      throw new Error(/does not exist|neexistuje/i.test(error instanceof Error ? error.message : String(error)) ? 'Na webu chybí seznam pro opravy z účetnictví. Požádejte administrátora, ať spustí Instalaci a diagnostiku.' : describeSpError(error, 'Opravu se nepodařilo označit'));
    }
  }

  public async cancel(id: number, _actor: CurrentUser): Promise<void> {
    await this.update(id, { CorrectionStatus: 'Zrušeno', ResolvedAt: new Date().toISOString(), ResolveNote: 'Označení zrušeno (omyl).' }, 'Opravu se nepodařilo zrušit');
  }

  public async markSent(ids: number[], actor: CurrentUser): Promise<void> {
    const now = new Date().toISOString();
    for (const id of ids) {
      await this.update(id, { CorrectionStatus: 'Odesláno', SentAt: now, SentByName: actor.displayName }, 'Odeslání opravy se nepodařilo zapsat');
    }
  }

  public async resolve(ids: number[], note: string, _actor: CurrentUser): Promise<void> {
    const now = new Date().toISOString();
    for (const id of ids) {
      await this.update(id, { CorrectionStatus: 'Vyřešeno', ResolvedAt: now, ResolveNote: note }, 'Opravu se nepodařilo uzavřít');
    }
  }
}
