/**
 * Stavební deníky a zápisy ze stavby v seznamech PRM_SiteDiaries a PRM_DiaryEntries.
 *
 * Stejný postup jako u objednávek a podkladů: pravidla jsou v `core/siteDiary`, tenhle soubor jen načte zápis, nechá
 * rozhodnout pravidla a výsledek zapíše — a to **znovu s kontrolou oprávnění** těsně před zápisem (CLAUDE.md, kap. 4).
 * Zápis drží ETag načtené verze (souběžná změna → HTTP 412, nic se nezapíše). Každá změna jde do PRM_AuditLog.
 * Soubory zápisu (fotky, náčrty, PDF, Word) se neukládají sem, ale do složky projektu (řeší je `IDocumentRepository`).
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { CurrentUser, Project } from '../../core/types';
import { toDate } from '../../core/format';
import { AppSettings } from '../../core/settings';
import {
  DiaryEntry,
  EntryChange,
  EntryContext,
  EntryInput,
  EntryListFilter,
  EntryStatus,
  SignatureKind,
  SiteDiary,
  applyEntryChange,
  attachSignedScan,
  canDeleteEntry,
  canEditEntry,
  canWriteDiary,
  cancelEntry,
  closeEntry,
  contentFromJson,
  contentToJson,
  emptyHeader,
  entryFolderPath,
  filterEntries,
  nextEntryNumber,
  reopenEntry,
  signEntryInApp,
  sortEntriesNewestFirst,
  validateEntry
} from '../../core/siteDiary';
import { WorkflowError, toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { DiaryHistoryEntry, IDiaryRepository, IProjectRepository, ISettingsRepository } from '../repositories';
import { getSp, describeSpError, extractStatus } from './spContext';
import { extractEtag } from './spProjectRepository';
import { escapeODataString } from './spSettingsRepository';

const DIARIES_LIST = 'PRM_SiteDiaries';
const ENTRIES_LIST = 'PRM_DiaryEntries';
const AUDIT_LIST = 'PRM_AuditLog';
const AUDIT_ENTITY = 'Zápis ze stavby';

const DIARY_FIELDS = ['Id', 'Title', 'Project/Id', 'Project/ProjectNumber', 'IsActive', 'DiaryNote', 'Created'];
const ENTRY_FIELDS = [
  'Id',
  'Title',
  'Diary/Id',
  'Diary/Title',
  'Project/Id',
  'Project/ProjectNumber',
  'EntryNo',
  'EntryDate',
  'EntryStatus',
  'Content',
  'FolderPath',
  'EntryAuthor/Title',
  'EntryAuthor/Name',
  'ClosedByName',
  'ClosedAt',
  'ContentHash',
  'SignatureKind',
  'SignedByName',
  'SignedAt',
  'PdfUrl',
  'DocxUrl',
  'SignedUrl',
  'CancelReason',
  'Created',
  'Modified'
];

interface DiaryItem {
  Id: number;
  Title?: string;
  Project?: { Id: number; ProjectNumber: string };
  IsActive?: boolean;
  DiaryNote?: string;
  Created?: string;
}

interface EntryItem {
  Id: number;
  Diary?: { Id: number; Title: string };
  Project?: { Id: number; ProjectNumber: string };
  EntryNo?: number;
  EntryDate?: string;
  EntryStatus?: string;
  Content?: string;
  FolderPath?: string;
  EntryAuthor?: { Title: string; Name: string };
  ClosedByName?: string;
  ClosedAt?: string;
  ContentHash?: string;
  SignatureKind?: string;
  SignedByName?: string;
  SignedAt?: string;
  PdfUrl?: { Url: string };
  DocxUrl?: { Url: string };
  SignedUrl?: { Url: string };
  CancelReason?: string;
  Created?: string;
  Modified?: string;
}

const MISSING_HINT =
  'Seznamy stavebních deníků na webu ještě nejsou založené (nebo jim chybí sloupce). ' +
  'Otevřete Instalace a diagnostika a doplňte chybějící části (přidá jen seznamy a sloupce, nic nesmaže).';

export class SpDiaryRepository implements IDiaryRepository {
  public constructor(
    private readonly context: WebPartContext,
    private readonly projects: IProjectRepository,
    private readonly settings: ISettingsRepository
  ) {}

  // --- deníky ---

  public async listDiaries(projectNumber?: string): Promise<SiteDiary[]> {
    try {
      const sp = getSp(this.context);
      const items: DiaryItem[] = await sp.web.lists
        .getByTitle(DIARIES_LIST)
        .items.select(...DIARY_FIELDS)
        .expand('Project')
        .orderBy('Id', true)
        .top(2000)();
      return items.map(mapDiary).filter((d) => !projectNumber || d.projectNumber === projectNumber);
    } catch (error) {
      throw new Error(explain(error, 'Nepodařilo se načíst stavební deníky'));
    }
  }

  public async createDiary(projectNumber: string, title: string, note: string | undefined, actor: CurrentUser): Promise<SiteDiary> {
    const project = await this.requireProject(projectNumber);
    if (!canWriteDiary(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Na tomto projektu nemáte oprávnění vést stavební deník (na Režii se deníky nevedou).');
    }
    const name = (title || '').trim();
    if (name === '') {
      throw new WorkflowError('Pojmenujte deník, např. „Hlavní deník“.');
    }
    const existing = await this.listDiaries(projectNumber);
    if (existing.some((d) => d.title.toLocaleLowerCase('cs-CZ') === name.toLocaleLowerCase('cs-CZ'))) {
      throw new WorkflowError(`Projekt ${projectNumber} už má deník s názvem „${name}“.`);
    }
    try {
      const sp = getSp(this.context);
      const added = await sp.web.lists.getByTitle(DIARIES_LIST).items.add({
        Title: name,
        ProjectId: project.id,
        IsActive: true,
        DiaryNote: note ?? ''
      });
      const id = extractAddedId(added);
      if (id === undefined) {
        throw new Error('SharePoint nevrátil číslo položky.');
      }
      await this.audit(`Deník ${name}`, `D${id}`, actor, 'Založen deník', undefined, 'Aktivní');
      return (await this.requireDiary(id)).diary;
    } catch (error) {
      if (error instanceof WorkflowError) {
        throw error;
      }
      throw new Error(explain(error, `Deník „${name}“ se nepodařilo založit`));
    }
  }

  public async updateDiary(id: number, patch: { title?: string; isActive?: boolean; note?: string }, actor: CurrentUser): Promise<SiteDiary> {
    const { diary } = await this.requireDiary(id);
    const project = await this.requireProject(diary.projectNumber);
    if (!canWriteDiary(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Na tomto projektu nemáte oprávnění upravovat stavební deník.');
    }
    const fields: Record<string, unknown> = {};
    if (patch.title !== undefined) {
      const name = patch.title.trim();
      if (name === '') {
        throw new WorkflowError('Deník musí mít název.');
      }
      fields.Title = name;
    }
    if (patch.isActive !== undefined) {
      fields.IsActive = patch.isActive;
    }
    if (patch.note !== undefined) {
      fields.DiaryNote = patch.note;
    }
    try {
      const sp = getSp(this.context);
      await sp.web.lists.getByTitle(DIARIES_LIST).items.getById(id).update(fields);
    } catch (error) {
      throw new Error(explain(error, `Deník „${diary.title}“ se nepodařilo upravit`));
    }
    await this.audit(`Deník ${diary.title}`, `D${id}`, actor, `Upraven deník${patch.isActive === false ? ' (vypnut)' : patch.isActive === true ? ' (zapnut)' : ''}`, undefined, 'Aktivní');
    return (await this.requireDiary(id)).diary;
  }

  // --- zápisy ---

  public async listEntries(filter?: EntryListFilter): Promise<DiaryEntry[]> {
    try {
      const sp = getSp(this.context);
      const settings = await this.settings.get();
      const items: EntryItem[] = await sp.web.lists
        .getByTitle(ENTRIES_LIST)
        .items.select(...ENTRY_FIELDS)
        .expand('Diary', 'Project', 'EntryAuthor')
        .orderBy('Id', false)
        .top(2000)();
      return sortEntriesNewestFirst(filterEntries(items.map((i) => mapEntry(i, settings)), filter));
    } catch (error) {
      throw new Error(explain(error, 'Nepodařilo se načíst zápisy'));
    }
  }

  public async getEntry(id: number): Promise<DiaryEntry | undefined> {
    try {
      return (await this.loadEntry(id)).entry;
    } catch (error) {
      if (extractStatus(error) === 404) {
        return undefined;
      }
      throw new Error(explain(error, `Nepodařilo se načíst zápis č. ${id}`));
    }
  }

  public async createEntry(input: EntryInput, actor: CurrentUser): Promise<DiaryEntry> {
    const project = await this.requireProject(input.projectNumber);
    if (!canWriteDiary(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Na tomto projektu nemáte oprávnění psát zápisy (na Režii se deníky nevedou).');
    }
    const { diary } = await this.requireDiary(input.diaryId);
    if (diary.projectNumber !== input.projectNumber) {
      throw new WorkflowError('Deník patří k jinému projektu.');
    }
    if (!diary.isActive) {
      throw new WorkflowError(`Deník „${diary.title}“ je vypnutý — zapněte ho, nebo zvolte jiný.`);
    }
    assertValid(input);

    const settings = await this.settings.get();
    const existing = (await this.listEntries({ diaryId: diary.id })).map((e) => e.entryNo);
    const firstNo = nextEntryNumber(existing);
    let newId: number | undefined;
    try {
      const sp = getSp(this.context);
      const added = await sp.web.lists.getByTitle(ENTRIES_LIST).items.add({
        Title: `Zápis č. ${firstNo}`,
        DiaryId: diary.id,
        ProjectId: project.id,
        EntryNo: firstNo,
        EntryDate: input.date.toISOString(),
        EntryStatus: EntryStatus.Koncept,
        Content: contentToJson(input),
        FolderPath: entryFolderPath(settings.folders.diaryFolder, diary.title, firstNo),
        EntryAuthorId: actor.id
      });
      newId = extractAddedId(added);
    } catch (error) {
      throw new Error(explain(error, 'Zápis se nepodařilo uložit'));
    }
    if (newId === undefined) {
      throw new Error('Zápis se uložil, ale SharePoint nevrátil jeho číslo položky. Načtěte seznam znovu.');
    }

    // Dva zápisy založené ve stejnou chvíli mohly dostat stejné číslo — ten mladší se přečísluje.
    const createdId: number = newId;
    const rivals = (await this.listEntries({ diaryId: diary.id })).filter((e) => e.entryNo === firstNo && e.id < createdId);
    let finalNo = firstNo;
    if (rivals.length > 0) {
      finalNo = nextEntryNumber((await this.listEntries({ diaryId: diary.id })).map((e) => e.entryNo));
      await this.write(
        createdId,
        { Title: `Zápis č. ${finalNo}`, EntryNo: finalNo, FolderPath: entryFolderPath(settings.folders.diaryFolder, diary.title, finalNo) },
        undefined,
        'Nepodařilo se přečíslovat zápis'
      );
    }
    await this.audit(`Zápis č. ${finalNo}`, `D${diary.id}-Z${finalNo}`, actor, 'Založen zápis', undefined, EntryStatus.Koncept);
    return (await this.requireEntry(createdId)).entry;
  }

  public async updateEntry(id: number, input: EntryInput, actor: CurrentUser): Promise<DiaryEntry> {
    const { entry, etag } = await this.requireEntry(id);
    const project = await this.requireProject(entry.projectNumber);
    if (!canEditEntry(entry, toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError(`Zápis č. ${entry.entryNo} teď nejde upravovat (stav „${entry.status}“, nebo k němu nemáte oprávnění).`);
    }
    if (input.projectNumber !== entry.projectNumber || input.diaryId !== entry.diaryId) {
      throw new WorkflowError('Projekt ani deník se u založeného zápisu nemění. Zápis stornujte a založte nový.');
    }
    assertValid(input);
    await this.write(id, { EntryDate: input.date.toISOString(), Content: contentToJson(input) }, etag, `Zápis č. ${entry.entryNo} se nepodařilo uložit`);
    await this.audit(`Zápis č. ${entry.entryNo}`, auditId(entry), actor, 'Upraveno', entry.status, entry.status);
    return (await this.requireEntry(id)).entry;
  }

  public close(id: number, contentHash: string, output: { pdfUrl?: string; docxUrl?: string }, actor: CurrentUser): Promise<DiaryEntry> {
    return this.transition(id, actor, (e, c) => closeEntry(e, contentHash, c, output));
  }

  public reopen(id: number, reason: string, actor: CurrentUser): Promise<DiaryEntry> {
    return this.transition(id, actor, (e, c) => reopenEntry(e, reason, c));
  }

  public signInApp(id: number, currentHash: string, actor: CurrentUser): Promise<DiaryEntry> {
    return this.transition(id, actor, (e, c) => signEntryInApp(e, currentHash, c));
  }

  public attachScan(id: number, signedUrl: string, actor: CurrentUser): Promise<DiaryEntry> {
    return this.transition(id, actor, (e, c) => attachSignedScan(e, signedUrl, c));
  }

  public cancel(id: number, reason: string, actor: CurrentUser): Promise<DiaryEntry> {
    return this.transition(id, actor, (e, c) => cancelEntry(e, reason, c));
  }

  public async delete(id: number, actor: CurrentUser): Promise<void> {
    if (!canDeleteEntry(toActor(actor))) {
      throw new WorkflowError('Zápis smí smazat jen administrátor PRM.');
    }
    const { entry } = await this.requireEntry(id);
    // Audit jde první: smazaný zápis je v koši SharePointu, ale bez záznamu by nebylo vidět, kdo ho smazal.
    await this.audit(
      `Zápis č. ${entry.entryNo}`,
      auditId(entry),
      actor,
      `Zápis smazán administrátorem (projekt ${entry.projectNumber}, deník ${entry.diaryTitle ?? entry.diaryId}, stav „${entry.status}“)`,
      entry.status,
      'Smazáno'
    );
    try {
      const sp = getSp(this.context);
      await sp.web.lists.getByTitle(ENTRIES_LIST).items.getById(id).recycle();
    } catch (error) {
      throw new Error(explain(error, `Zápis č. ${entry.entryNo} se nepodařilo smazat`));
    }
  }

  public async history(id: number): Promise<DiaryHistoryEntry[]> {
    try {
      const { entry } = await this.requireEntry(id);
      const sp = getSp(this.context);
      const rows: { Action?: string; PerformedAt?: string; PerformedBy?: { Title: string } }[] = await sp.web.lists
        .getByTitle(AUDIT_LIST)
        .items.select('Action', 'PerformedAt', 'PerformedBy/Title')
        .expand('PerformedBy')
        .filter(`EntityType eq '${AUDIT_ENTITY}' and EntityId eq '${escapeODataString(auditId(entry))}'`)
        .orderBy('Id', true)
        .top(200)();
      return rows.map((r) => ({ action: r.Action ?? '', byName: r.PerformedBy?.Title ?? '—', at: toDate(r.PerformedAt) }));
    } catch (error) {
      throw new Error(describeSpError(error, 'Nepodařilo se načíst historii zápisu'));
    }
  }

  // --- vnitřní ---

  private async loadDiary(id: number): Promise<{ diary: SiteDiary }> {
    const sp = getSp(this.context);
    const item: DiaryItem = await sp.web.lists
      .getByTitle(DIARIES_LIST)
      .items.getById(id)
      .select(...DIARY_FIELDS)
      .expand('Project')();
    return { diary: mapDiary(item) };
  }

  private async requireDiary(id: number): Promise<{ diary: SiteDiary }> {
    try {
      return await this.loadDiary(id);
    } catch (error) {
      if (extractStatus(error) === 404) {
        throw new WorkflowError('Deník nebyl nalezen. Nejspíš ho někdo smazal, nebo k němu nemáte oprávnění.');
      }
      throw new Error(explain(error, `Nepodařilo se načíst deník č. ${id}`));
    }
  }

  private async loadEntry(id: number): Promise<{ entry: DiaryEntry; etag?: string }> {
    const sp = getSp(this.context);
    const settings = await this.settings.get();
    const item: EntryItem = await sp.web.lists
      .getByTitle(ENTRIES_LIST)
      .items.getById(id)
      .select(...ENTRY_FIELDS)
      .expand('Diary', 'Project', 'EntryAuthor')();
    return { entry: mapEntry(item, settings), etag: extractEtag(item) };
  }

  private async requireEntry(id: number): Promise<{ entry: DiaryEntry; etag?: string }> {
    try {
      return await this.loadEntry(id);
    } catch (error) {
      if (extractStatus(error) === 404) {
        throw new WorkflowError('Zápis nebyl nalezen. Nejspíš ho někdo smazal, nebo k němu nemáte oprávnění.');
      }
      throw new Error(explain(error, `Nepodařilo se načíst zápis č. ${id}`));
    }
  }

  private async requireProject(projectNumber: string): Promise<Project> {
    const project = await this.projects.getByNumber(projectNumber);
    if (!project) {
      throw new WorkflowError(`Projekt ${projectNumber} nebyl nalezen, nebo na něj nemáte oprávnění.`);
    }
    return project;
  }

  private async write(id: number, fields: Record<string, unknown>, etag: string | undefined, context: string): Promise<void> {
    try {
      const sp = getSp(this.context);
      await sp.web.lists.getByTitle(ENTRIES_LIST).items.getById(id).update(fields, etag ?? '*');
    } catch (error) {
      if (extractStatus(error) === 412) {
        throw new WorkflowError('Zápis mezitím někdo jiný změnil. Načtěte ho znovu a akci zopakujte — jinak byste přepsali cizí změnu.');
      }
      throw new Error(explain(error, context));
    }
  }

  /** Společný postup všech změn stavu: načíst, nechat rozhodnout pravidla, zapsat. */
  private async transition(id: number, actor: CurrentUser, decide: (entry: DiaryEntry, ctx: EntryContext) => EntryChange): Promise<DiaryEntry> {
    const { entry, etag } = await this.requireEntry(id);
    const project = await this.requireProject(entry.projectNumber);
    const now = new Date();
    const change = decide(entry, { project: toWorkflowProject(project), actor: toActor(actor), now });
    const after = applyEntryChange(entry, change, now);

    const fields: Record<string, unknown> = { EntryStatus: after.status };
    if (change.clearClosure) {
      fields.ClosedByName = '';
      fields.ClosedAt = null;
      fields.ContentHash = '';
    }
    if (change.closedByName !== undefined) {
      fields.ClosedByName = change.closedByName;
    }
    if (change.closedAt) {
      fields.ClosedAt = change.closedAt.toISOString();
    }
    if (change.contentHash !== undefined) {
      fields.ContentHash = change.contentHash;
    }
    if (change.signatureKind) {
      fields.SignatureKind = change.signatureKind;
    }
    if (change.signedByName !== undefined) {
      fields.SignedByName = change.signedByName;
    }
    if (change.signedAt) {
      fields.SignedAt = change.signedAt.toISOString();
    }
    if (change.cancelReason) {
      fields.CancelReason = change.cancelReason;
    }
    if (change.pdfUrl) {
      fields.PdfUrl = { Url: change.pdfUrl, Description: `Zápis č. ${entry.entryNo} (PDF)` };
    }
    if (change.docxUrl) {
      fields.DocxUrl = { Url: change.docxUrl, Description: `Zápis č. ${entry.entryNo} (Word)` };
    }
    if (change.signedUrl) {
      fields.SignedUrl = { Url: change.signedUrl, Description: `Zápis č. ${entry.entryNo} (podepsaný sken)` };
    }
    await this.write(id, fields, etag, `Nepodařilo se změnit stav zápisu č. ${entry.entryNo}`);

    try {
      await this.audit(`Zápis č. ${entry.entryNo}`, auditId(entry), actor, change.auditAction, entry.status, after.status);
    } catch (error) {
      throw new Error(
        `Změna zápisu č. ${entry.entryNo} se provedla, ale nepodařilo se zapsat záznam o ní do historie. ` +
          `Dejte to vědět správci. (${error instanceof Error ? error.message : String(error)})`
      );
    }
    return (await this.requireEntry(id)).entry;
  }

  private async audit(title: string, entityId: string, actor: CurrentUser, action: string, oldValue: string | undefined, newValue: string): Promise<void> {
    try {
      const sp = getSp(this.context);
      await sp.web.lists.getByTitle(AUDIT_LIST).items.add({
        Title: title,
        EntityType: AUDIT_ENTITY,
        EntityId: entityId,
        Action: action.length > 250 ? `${action.slice(0, 247)}…` : action,
        PerformedById: actor.id,
        PerformedAt: new Date().toISOString(),
        OldValue: oldValue ?? '',
        NewValue: newValue
      });
    } catch (error) {
      throw new Error(describeSpError(error, `Nepodařilo se zapsat audit (${title})`));
    }
  }
}

/** Klíč zápisu v auditním logu: deník a pořadové číslo. */
function auditId(entry: DiaryEntry): string {
  return `D${entry.diaryId}-Z${entry.entryNo}`;
}

function assertValid(input: EntryInput): void {
  const issues = validateEntry(input, false);
  if (issues.length > 0) {
    throw new WorkflowError(issues.map((i) => i.message).join(' '));
  }
}

function mapDiary(item: DiaryItem): SiteDiary {
  return {
    id: item.Id,
    projectNumber: item.Project?.ProjectNumber ?? '',
    title: item.Title || `Deník ${item.Id}`,
    isActive: item.IsActive !== false,
    note: item.DiaryNote || undefined,
    created: toDate(item.Created)
  };
}

function mapEntry(item: EntryItem, settings: AppSettings): DiaryEntry {
  const content = contentFromJson(item.Content, emptyHeader(settings.company));
  const kind = item.SignatureKind;
  return {
    ...content,
    id: item.Id,
    diaryId: item.Diary?.Id ?? 0,
    diaryTitle: item.Diary?.Title,
    projectNumber: item.Project?.ProjectNumber ?? '',
    entryNo: item.EntryNo ?? 0,
    date: toDate(item.EntryDate) ?? toDate(item.Created) ?? new Date(),
    folderPath: item.FolderPath || '',
    status: (item.EntryStatus as EntryStatus) ?? EntryStatus.Koncept,
    createdByName: item.EntryAuthor?.Title ?? '',
    createdByLogin: item.EntryAuthor?.Name ?? '',
    closedByName: item.ClosedByName || undefined,
    closedAt: toDate(item.ClosedAt),
    contentHash: item.ContentHash || undefined,
    signatureKind: kind === 'aplikace' || kind === 'sken' ? (kind as SignatureKind) : undefined,
    signedByName: item.SignedByName || undefined,
    signedAt: toDate(item.SignedAt),
    pdfUrl: item.PdfUrl?.Url || undefined,
    docxUrl: item.DocxUrl?.Url || undefined,
    signedUrl: item.SignedUrl?.Url || undefined,
    cancelReason: item.CancelReason || undefined,
    created: toDate(item.Created),
    modified: toDate(item.Modified)
  };
}

function extractAddedId(added: unknown): number | undefined {
  const a = added as { data?: { Id?: number }; Id?: number };
  return a?.data?.Id ?? a?.Id;
}

/** Chybu SharePointu převede na větu; HTTP 400/404 na těchto seznamech znamená, že ještě nejsou založené. */
function explain(error: unknown, context: string): string {
  const status = extractStatus(error);
  if (status === 400 || status === 404) {
    return `${context}. ${MISSING_HINT}`;
  }
  return describeSpError(error, context);
}
