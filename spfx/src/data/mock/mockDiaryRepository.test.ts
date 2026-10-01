import { createMockRepositories } from './mockRepositories';
import { CurrentUser, Role } from '../../core/types';
import { EntryInput, EntryStatus, emptyHeader } from '../../core/siteDiary';
import { DEFAULT_SETTINGS } from '../../core/settings';
import { MOCK_USER } from './mockData';

function uzivatel(login: string, name: string, roles: Role[]): CurrentUser {
  return { ...MOCK_USER, id: Math.floor(Math.random() * 1000) + 100, loginName: `i:0#.f|membership|${login}@revoltum.cz`, displayName: name, roles };
}

const igor = { ...MOCK_USER } as CurrentUser; // administrátor, vedení, finance, PM
const jan = uzivatel('jan.novak', 'Jan Novák', [Role.ProjektovyManazer]); // PM projektu 25003
const martin = uzivatel('martin.svoboda', 'Martin Svoboda', [Role.AsistentPM]); // asistent projektů 25002 a 25003
const cizi = uzivatel('cizi', 'Cizí PM', [Role.ProjektovyManazer]);

const vstup = (extra: Partial<EntryInput> = {}): EntryInput => ({
  diaryId: 2,
  projectNumber: '25003',
  date: new Date(2026, 9, 1),
  header: { ...emptyHeader(DEFAULT_SETTINGS.company), constructionName: 'BESS Chotěboř', place: 'Chotěboř', managerName: 'Jan Novák' },
  participants: [{ name: 'Karel Dvořák', organization: 'ElektroMontáže', present: true }],
  points: [{ title: 'Rozvaděče', text: 'Rozvaděče osazeny.', files: [] }],
  tasks: [],
  ...extra
});

describe('MockDiaryRepository — deníky', () => {
  it('projekt může mít víc deníků; stejný název dvakrát ne', async () => {
    const r = createMockRepositories();
    expect((await r.diary.listDiaries('25003')).map((d) => d.title)).toEqual(['Hlavní deník', 'Elektro – hala B']);
    const novy = await r.diary.createDiary('25003', 'Stavební část', undefined, jan);
    expect(novy.projectNumber).toBe('25003');
    await expect(r.diary.createDiary('25003', 'stavební část', undefined, jan)).rejects.toThrow(/už má deník/);
  });

  it('deník založí jen ten, kdo smí na projektu psát zápisy; na Režii ne', async () => {
    const r = createMockRepositories();
    await expect(r.diary.createDiary('25003', 'Cizí', undefined, cizi)).rejects.toThrow(/oprávnění/);
    await expect(r.diary.createDiary('26999', 'Režie', undefined, igor)).rejects.toThrow(/oprávnění/);
  });
});

describe('MockDiaryRepository — zápisy', () => {
  it('nový zápis dostane další číslo v deníku a složku; každý deník počítá zvlášť', async () => {
    const r = createMockRepositories();
    const a = await r.diary.createEntry(vstup(), martin);
    expect(a.entryNo).toBe(2); // v deníku č. 2 už je ukázkový zápis č. 1
    expect(a.folderPath).toBe('04-Zápisy/Hlavní deník/Z002');
    expect(a.status).toBe(EntryStatus.Koncept);
    const b = await r.diary.createEntry(vstup({ diaryId: 3 }), martin);
    expect(b.entryNo).toBe(1);
    expect(b.folderPath).toBe('04-Zápisy/Elektro – hala B/Z001');
  });

  it('cizí PM zápis nezaloží; vypnutý deník nejde použít', async () => {
    const r = createMockRepositories();
    await expect(r.diary.createEntry(vstup(), cizi)).rejects.toThrow(/oprávnění/);
    await r.diary.updateDiary(2, { isActive: false }, jan);
    await expect(r.diary.createEntry(vstup(), jan)).rejects.toThrow(/vypnutý/);
  });

  it('cesta zápisu: koncept → uzavřeno → podepsáno skenem; historie to zná', async () => {
    const r = createMockRepositories();
    const z = await r.diary.createEntry(vstup(), martin);
    const uzavreny = await r.diary.close(z.id, 'hash1', { pdfUrl: 'https://x/z.pdf', docxUrl: 'https://x/z.docx' }, martin);
    expect(uzavreny.status).toBe(EntryStatus.Uzavreno);
    expect(uzavreny.contentHash).toBe('hash1');
    await expect(r.diary.updateEntry(z.id, vstup(), martin)).rejects.toThrow(/nejde upravovat/);
    const podepsany = await r.diary.attachScan(z.id, 'https://x/sken.pdf', martin);
    expect(podepsany.status).toBe(EntryStatus.Podepsano);
    expect(podepsany.signatureKind).toBe('sken');
    expect((await r.diary.history(z.id)).map((h) => h.action)).toEqual([
      'Založen zápis',
      'Zápis uzavřen (otisk hash1…)',
      'Připojen podepsaný sken'
    ]);
  });

  it('podpis v aplikaci projde jen se shodným otiskem', async () => {
    const r = createMockRepositories();
    const z = await r.diary.createEntry(vstup(), martin);
    await r.diary.close(z.id, 'hash1', {}, martin);
    await expect(r.diary.signInApp(z.id, 'jiny', martin)).rejects.toThrow(/změnil/);
    expect((await r.diary.signInApp(z.id, 'hash1', jan)).status).toBe(EntryStatus.Podepsano);
  });

  it('znovuotevření vrátí koncept a smaže otisk; podepsaný zápis se nemění', async () => {
    const r = createMockRepositories();
    const z = await r.diary.createEntry(vstup(), martin);
    await r.diary.close(z.id, 'hash1', {}, martin);
    const otevreny = await r.diary.reopen(z.id, 'Chybí foto', jan);
    expect(otevreny.status).toBe(EntryStatus.Koncept);
    expect(otevreny.contentHash).toBeUndefined();
    await r.diary.close(z.id, 'hash2', {}, martin);
    await r.diary.signInApp(z.id, 'hash2', martin);
    await expect(r.diary.reopen(z.id, 'x', igor)).rejects.toThrow();
    await expect(r.diary.cancel(z.id, 'x', igor)).rejects.toThrow();
  });

  it('neúplný zápis (bez bodu jednání) nejde uzavřít', async () => {
    const r = createMockRepositories();
    const z = await r.diary.createEntry(vstup({ points: [{ text: '', files: [] }] }), martin);
    await expect(r.diary.close(z.id, 'h', {}, martin)).rejects.toThrow(/bod jednání/);
  });

  it('smazat smí jen administrátor; seznam jde filtrovat', async () => {
    const r = createMockRepositories();
    const z = await r.diary.createEntry(vstup(), martin);
    await expect(r.diary.delete(z.id, martin)).rejects.toThrow(/administrátor/);
    expect((await r.diary.listEntries({ projectNumber: '25002' })).map((e) => e.entryNo)).toEqual([2, 1]);
    expect((await r.diary.listEntries({ statuses: [EntryStatus.Uzavreno] })).map((e) => e.id)).toEqual([2]);
    await r.diary.delete(z.id, igor);
    expect(await r.diary.getEntry(z.id)).toBeUndefined();
  });
});
