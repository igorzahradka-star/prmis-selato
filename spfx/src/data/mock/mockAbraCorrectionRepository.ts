/** Opravy řádků z účetnictví v ukázkovém režimu — jen v paměti, po obnovení stránky se ztratí. */

import { CurrentUser } from '../../core/types';
import { AbraDoc } from '../../core/abraDocs';
import { AbraCorrection, correctionLine, correctionNoteProblem, isOpenCorrection } from '../../core/abraCorrections';
import { IAbraCorrectionRepository } from '../repositories';

export class MockAbraCorrectionRepository implements IAbraCorrectionRepository {
  private items: AbraCorrection[] = [];
  private nextId = 1;

  public list(projectNumber: string): Promise<AbraCorrection[]> {
    return Promise.resolve(this.items.filter((c) => c.projectNumber === projectNumber).map((c) => ({ ...c })));
  }

  public listOpen(): Promise<AbraCorrection[]> {
    return Promise.resolve(this.items.filter(isOpenCorrection).map((c) => ({ ...c })));
  }

  public mark(input: { projectNumber: string; doc: AbraDoc; note: string }, actor: CurrentUser): Promise<AbraCorrection> {
    const problem = correctionNoteProblem(input.note);
    if (problem) {
      return Promise.reject(new Error(problem));
    }
    if (this.items.some((c) => c.projectNumber === input.projectNumber && c.abraId === input.doc.abraId && isOpenCorrection(c))) {
      return Promise.reject(new Error('U tohoto řádku už je oprava označená.'));
    }
    const created: AbraCorrection = {
      id: this.nextId++,
      projectNumber: input.projectNumber,
      abraId: input.doc.abraId,
      docNumber: input.doc.number,
      note: input.note.trim(),
      status: 'Označeno',
      line: correctionLine(input.doc),
      markedByName: actor.displayName,
      markedByLogin: actor.loginName,
      markedAt: new Date()
    };
    this.items = [...this.items, created];
    return Promise.resolve({ ...created });
  }

  public cancel(id: number, _actor: CurrentUser): Promise<void> {
    this.items = this.items.map((c) => (c.id === id ? { ...c, status: 'Zrušeno', resolvedAt: new Date(), resolveNote: 'Označení zrušeno (omyl).' } : c));
    return Promise.resolve();
  }

  public markSent(ids: number[], actor: CurrentUser): Promise<void> {
    this.items = this.items.map((c) => (ids.indexOf(c.id) >= 0 ? { ...c, status: 'Odesláno', sentAt: new Date(), sentByName: actor.displayName } : c));
    return Promise.resolve();
  }

  public resolve(ids: number[], note: string, _actor: CurrentUser): Promise<void> {
    this.items = this.items.map((c) => (ids.indexOf(c.id) >= 0 ? { ...c, status: 'Vyřešeno', resolvedAt: new Date(), resolveNote: note } : c));
    return Promise.resolve();
  }
}
