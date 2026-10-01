/**
 * Stavební deníky a zápisy v ukázkovém režimu — v paměti, bez SharePointu.
 *
 * Používá **stejná pravidla** (`core/siteDiary`) jako ostrá implementace, takže ukázkový režim ukazuje skutečné chování.
 */

import { folderFor } from '../../core/projectFolders';
import { CurrentUser, Project } from '../../core/types';
import { AppSettings } from '../../core/settings';
import {
  DiaryEntry,
  EntryChange,
  EntryContext,
  EntryInput,
  EntryListFilter,
  EntryStatus,
  SiteDiary,
  applyEntryChange,
  attachSignedScan,
  canDeleteEntry,
  canEditEntry,
  canWriteDiary,
  cancelEntry,
  closeEntry,
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

function delay<T>(value: T, ms: number = 150): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

const MARTIN = { login: 'i:0#.f|membership|martin.svoboda@revoltum.cz', name: 'Martin Svoboda' };
const JAN = { login: 'i:0#.f|membership|jan.novak@revoltum.cz', name: 'Jan Novák' };

export const MOCK_DIARIES: SiteDiary[] = [
  { id: 1, projectNumber: '25002', title: 'Hlavní deník', isActive: true, created: new Date(2026, 7, 10) },
  { id: 2, projectNumber: '25003', title: 'Hlavní deník', isActive: true, created: new Date(2026, 8, 1) },
  { id: 3, projectNumber: '25003', title: 'Elektro – hala B', isActive: true, created: new Date(2026, 8, 12) }
];

/** Ukázkové zápisy — koncept, uzavřený a podepsaný. */
export function mockEntries(settings: AppSettings): DiaryEntry[] {
  const header = (name: string, place: string, manager: string, counterparty?: string): DiaryEntry['header'] => ({
    ...emptyHeader(settings.company),
    constructionName: name,
    place,
    managerName: manager,
    counterparty
  });
  return [
    {
      id: 1,
      diaryId: 1,
      diaryTitle: 'Hlavní deník',
      projectNumber: '25002',
      entryNo: 1,
      date: new Date(2026, 8, 3),
      folderPath: entryFolderPath(settings.folders.diaryFolder, 'Hlavní deník', 1),
      header: header('FVE AgroFarma Lipnice', 'Lipnice nad Sázavou', 'Jan Novák', 'FVE Komponenty s.r.o.'),
      participants: [
        { name: 'Jan Novák', organization: 'Revoltum Engineering & Services', role: 'projektový manažer', present: true },
        { name: 'Karel Dvořák', organization: 'FVE Komponenty s.r.o.', role: 'stavbyvedoucí dodavatele', present: true }
      ],
      points: [
        { title: 'Převzetí staveniště', text: 'Staveniště převzato bez závad. Přístup po stávající komunikaci, oplocení doplní dodavatel do 10. 9.', files: [] },
        { title: 'Harmonogram', text: 'Dodávka panelů 1. etapy potvrzena na 15. 10. 2026.', files: [] }
      ],
      tasks: [{ description: 'Doplnit oplocení staveniště', responsible: 'Karel Dvořák', due: '2026-09-10' }],
      conditions: 'Polojasno, 18 °C',
      status: EntryStatus.Podepsano,
      createdByName: MARTIN.name,
      createdByLogin: MARTIN.login,
      closedByName: MARTIN.name,
      closedAt: new Date(2026, 8, 3, 15, 10),
      contentHash: 'a3f1c2d4e5b60718293a4b5c6d7e8f901a2b3c4d5e6f708192a3b4c5d6e7f809',
      signatureKind: 'sken',
      signedByName: MARTIN.name,
      signedAt: new Date(2026, 8, 4, 9, 0),
      signedUrl: '#/ukazkovy-rezim/soubor/Zapis_25002_Z001.podepsano.pdf',
      created: new Date(2026, 8, 3)
    },
    {
      id: 2,
      diaryId: 1,
      diaryTitle: 'Hlavní deník',
      projectNumber: '25002',
      entryNo: 2,
      date: new Date(2026, 8, 24),
      folderPath: entryFolderPath(settings.folders.diaryFolder, 'Hlavní deník', 2),
      header: header('FVE AgroFarma Lipnice', 'Lipnice nad Sázavou', 'Jan Novák', 'FVE Komponenty s.r.o.'),
      participants: [{ name: 'Karel Dvořák', organization: 'FVE Komponenty s.r.o.', present: true }],
      points: [{ title: 'Kontrola základů', text: 'Základy pod konstrukce dokončeny, provedena kontrola rozměrů.', files: [] }],
      tasks: [],
      status: EntryStatus.Uzavreno,
      createdByName: MARTIN.name,
      createdByLogin: MARTIN.login,
      closedByName: MARTIN.name,
      closedAt: new Date(2026, 8, 24, 16, 0),
      contentHash: 'b4e2d3c5f6a70819304b5c6d7e8f9012b3c4d5e6f7081930a4b5c6d7e8f90123',
      created: new Date(2026, 8, 24)
    },
    {
      id: 3,
      diaryId: 2,
      diaryTitle: 'Hlavní deník',
      projectNumber: '25003',
      entryNo: 1,
      date: new Date(2026, 8, 29),
      folderPath: entryFolderPath(settings.folders.diaryFolder, 'Hlavní deník', 1),
      header: header('BESS Teplárna Chotěboř', 'Chotěboř', 'Jan Novák'),
      participants: [],
      points: [{ title: '', text: '', files: [] }],
      tasks: [],
      status: EntryStatus.Koncept,
      createdByName: JAN.name,
      createdByLogin: JAN.login,
      created: new Date(2026, 8, 29)
    }
  ];
}

export class MockDiaryRepository implements IDiaryRepository {
  private diaries: SiteDiary[] = MOCK_DIARIES.map((d) => ({ ...d }));
  private entries: DiaryEntry[] | undefined;
  private readonly log = new Map<number, DiaryHistoryEntry[]>();
  private nextDiaryId = 4;
  private nextEntryId = 4;

  public constructor(
    private readonly projects: IProjectRepository,
    private readonly settings: ISettingsRepository
  ) {}

  private async all(): Promise<DiaryEntry[]> {
    if (!this.entries) {
      this.entries = mockEntries(await this.settings.get());
    }
    return this.entries;
  }

  public listDiaries(projectNumber?: string): Promise<SiteDiary[]> {
    return delay(this.diaries.filter((d) => !projectNumber || d.projectNumber === projectNumber).map((d) => ({ ...d })));
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
    if (this.diaries.some((d) => d.projectNumber === projectNumber && d.title.toLocaleLowerCase('cs-CZ') === name.toLocaleLowerCase('cs-CZ'))) {
      throw new WorkflowError(`Projekt ${projectNumber} už má deník s názvem „${name}“.`);
    }
    const diary: SiteDiary = { id: this.nextDiaryId++, projectNumber, title: name, isActive: true, note, created: new Date() };
    this.diaries = [...this.diaries, diary];
    return delay({ ...diary });
  }

  public async updateDiary(id: number, patch: { title?: string; isActive?: boolean; note?: string }, actor: CurrentUser): Promise<SiteDiary> {
    const diary = this.diaries.filter((d) => d.id === id)[0];
    if (!diary) {
      throw new WorkflowError('Deník nebyl nalezen.');
    }
    const project = await this.requireProject(diary.projectNumber);
    if (!canWriteDiary(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Na tomto projektu nemáte oprávnění upravovat stavební deník.');
    }
    if (patch.title !== undefined && patch.title.trim() === '') {
      throw new WorkflowError('Deník musí mít název.');
    }
    const updated: SiteDiary = {
      ...diary,
      title: patch.title !== undefined ? patch.title.trim() : diary.title,
      isActive: patch.isActive !== undefined ? patch.isActive : diary.isActive,
      note: patch.note !== undefined ? patch.note : diary.note
    };
    this.diaries = this.diaries.map((d) => (d.id === id ? updated : d));
    return delay({ ...updated });
  }

  public async listEntries(filter?: EntryListFilter): Promise<DiaryEntry[]> {
    const all = await this.all();
    return delay(sortEntriesNewestFirst(filterEntries(all, filter)));
  }

  public async getEntry(id: number): Promise<DiaryEntry | undefined> {
    return delay((await this.all()).filter((e) => e.id === id)[0]);
  }

  public async createEntry(input: EntryInput, actor: CurrentUser): Promise<DiaryEntry> {
    const project = await this.requireProject(input.projectNumber);
    if (!canWriteDiary(toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError('Na tomto projektu nemáte oprávnění psát zápisy (na Režii se deníky nevedou).');
    }
    const diary = this.diaries.filter((d) => d.id === input.diaryId)[0];
    if (!diary || diary.projectNumber !== input.projectNumber) {
      throw new WorkflowError('Deník nebyl nalezen, nebo patří k jinému projektu.');
    }
    if (!diary.isActive) {
      throw new WorkflowError(`Deník „${diary.title}“ je vypnutý — zapněte ho, nebo zvolte jiný.`);
    }
    this.assertValid(input);

    const settings = await this.settings.get();
    const all = await this.all();
    const entryNo = nextEntryNumber(all.filter((e) => e.diaryId === diary.id).map((e) => e.entryNo));
    const entry: DiaryEntry = {
      ...input,
      id: this.nextEntryId++,
      diaryTitle: diary.title,
      entryNo,
      folderPath: entryFolderPath(folderFor(project, 'diary', settings.folders), diary.title, entryNo),
      status: EntryStatus.Koncept,
      createdByName: actor.displayName,
      createdByLogin: actor.loginName,
      created: new Date(),
      modified: new Date()
    };
    this.entries = [...all, entry];
    this.record(entry.id, actor, 'Založen zápis');
    return delay(entry);
  }

  public async updateEntry(id: number, input: EntryInput, actor: CurrentUser): Promise<DiaryEntry> {
    const entry = await this.require(id);
    const project = await this.requireProject(entry.projectNumber);
    if (!canEditEntry(entry, toWorkflowProject(project), toActor(actor))) {
      throw new WorkflowError(`Zápis č. ${entry.entryNo} teď nejde upravovat (stav „${entry.status}“, nebo k němu nemáte oprávnění).`);
    }
    if (input.projectNumber !== entry.projectNumber || input.diaryId !== entry.diaryId) {
      throw new WorkflowError('Projekt ani deník se u založeného zápisu nemění. Zápis stornujte a založte nový.');
    }
    this.assertValid(input);
    const updated: DiaryEntry = { ...entry, ...input, id: entry.id, modified: new Date() };
    this.replace(updated);
    this.record(id, actor, 'Upraveno');
    return delay(updated);
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
    await this.require(id);
    this.entries = (this.entries ?? []).filter((e) => e.id !== id);
    this.log.delete(id);
    return delay(undefined);
  }

  public history(id: number): Promise<DiaryHistoryEntry[]> {
    return delay((this.log.get(id) ?? []).map((h) => ({ ...h })));
  }

  // --- vnitřní ---

  private async require(id: number): Promise<DiaryEntry> {
    const entry = (await this.all()).filter((e) => e.id === id)[0];
    if (!entry) {
      throw new WorkflowError('Zápis nebyl nalezen. Nejspíš k němu nemáte oprávnění.');
    }
    return entry;
  }

  private async requireProject(projectNumber: string): Promise<Project> {
    const project = await this.projects.getByNumber(projectNumber);
    if (!project) {
      throw new WorkflowError(`Projekt ${projectNumber} nebyl nalezen, nebo na něj nemáte oprávnění.`);
    }
    return project;
  }

  private assertValid(input: EntryInput): void {
    const issues = validateEntry(input, false);
    if (issues.length > 0) {
      throw new WorkflowError(issues.map((i) => i.message).join(' '));
    }
  }

  private replace(updated: DiaryEntry): void {
    this.entries = (this.entries ?? []).map((e) => (e.id === updated.id ? updated : e));
  }

  private record(id: number, actor: CurrentUser, action: string): void {
    const list = this.log.get(id) ?? [];
    list.push({ action, byName: actor.displayName, at: new Date() });
    this.log.set(id, list);
  }

  private async transition(id: number, actor: CurrentUser, decide: (entry: DiaryEntry, ctx: EntryContext) => EntryChange): Promise<DiaryEntry> {
    const entry = await this.require(id);
    const project = await this.requireProject(entry.projectNumber);
    const now = new Date();
    const change = decide(entry, { project: toWorkflowProject(project), actor: toActor(actor), now });
    const updated = applyEntryChange(entry, change, now);
    this.replace(updated);
    this.record(id, actor, change.auditAction);
    return delay(updated);
  }
}
