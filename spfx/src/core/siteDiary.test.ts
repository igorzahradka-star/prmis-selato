import {
  DiaryEntry,
  EntryStatus,
  EntryContext,
  attachSignedScan,
  applyEntryChange,
  canAddLateAttachments,
  entryLateFilesPath,
  lateAttachmentAudit,
  availableEntryActions,
  cancelEntry,
  canWriteDiary,
  closeEntry,
  contentFromJson,
  contentToJson,
  emptyHeader,
  entryFileName,
  entryFolderPath,
  entryFilesPath,
  entryTitle,
  filterEntries,
  handoverDirectionOf,
  handoverParties,
  isHandover,
  isHandoverDiary,
  protocolNumber,
  isImageFile,
  isoDay,
  nextEntryNumber,
  parseIsoDay,
  pointFiles,
  reopenEntry,
  safeName,
  signEntryInApp,
  sortEntriesNewestFirst,
  validateEntry,
  warrantyEnd
} from './siteDiary';
import { computeEntryHash, entryHashInput, sha256Hex } from './entryHash';
import { Actor, WorkflowError, WorkflowProject } from './orderWorkflow';
import { DEFAULT_SETTINGS } from './settings';
import { Role } from './types';

const PM = 'i:0#.f|membership|pm@revoltum.cz';
const ASISTENT = 'i:0#.f|membership|asistent@revoltum.cz';
const pm: Actor = { login: PM, displayName: 'Petr Manažer', roles: [Role.ProjektovyManazer] };
const asistent: Actor = { login: ASISTENT, displayName: 'Anna Asistentka', roles: [Role.AsistentPM] };
const cizi: Actor = { login: 'i:0#.f|membership|cizi@revoltum.cz', displayName: 'Cizí', roles: [Role.ProjektovyManazer] };
const admin: Actor = { login: 'i:0#.f|membership|admin@revoltum.cz', displayName: 'Adam Admin', roles: [Role.Administrator] };
const projekt: WorkflowProject = { projectNumber: '26001', projectManagerLogin: PM, projectManagerName: 'Petr Manažer', assistantLogins: [ASISTENT], isOverhead: false };
const rezie: WorkflowProject = { projectNumber: '26999', isOverhead: true };
const NOW = new Date(2026, 9, 1, 10, 0);
const ctx = (actor: Actor): EntryContext => ({ project: projekt, actor, now: NOW });

const header = { ...emptyHeader(DEFAULT_SETTINGS.company), constructionName: 'FVE Mastířovice', place: 'Mastířovice', managerName: 'Petr Manažer' };

function zapis(extra: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id: 1,
    diaryId: 1,
    diaryTitle: 'Hlavní deník',
    projectNumber: '26001',
    entryNo: 7,
    date: new Date(2026, 9, 1),
    folderPath: 'Zápisy/Hlavní deník/Z007',
    header,
    participants: [{ name: 'Jan Dodavatel', organization: 'ElektroMontáže', present: true }],
    points: [{ title: 'Kabeláž', text: 'Položeno 200 m kabelu.', files: ['foto1.jpg'] }],
    tasks: [],
    status: EntryStatus.Koncept,
    createdByName: asistent.displayName,
    createdByLogin: ASISTENT,
    ...extra
  };
}

describe('názvy a dny', () => {
  it('safeName vyhodí zakázané znaky a koncové tečky', () => {
    expect(safeName('Deník: hlavní / "sever"...')).toBe('Deník hlavní sever');
    expect(safeName('   ', 'x')).toBe('x');
    expect(safeName('a'.repeat(120)).length).toBeLessThanOrEqual(80);
  });
  it('cesty a soubory zápisu', () => {
    expect(entryFolderPath('Zápisy', 'Hlavní deník', 7)).toBe('Zápisy/Hlavní deník/Z007');
    expect(entryFolderPath('/Zápisy/', 'Sever', 12)).toBe('Zápisy/Sever/Z012');
    expect(entryFilesPath('Zápisy/Sever/Z012')).toBe('Zápisy/Sever/Z012/Přílohy');
    expect(entryFileName('26001', 7, 'pdf')).toBe('Zapis_26001_Z007.pdf');
    expect(entryFileName('26001', 7, 'podepsano.pdf')).toBe('Zapis_26001_Z007.podepsano.pdf');
  });
  it('přípony a obrázky', () => {
    expect(isImageFile('Foto.JPG')).toBe(true);
    expect(isImageFile('plan.pdf')).toBe(false);
  });
  it('dny se převádějí tam i zpět', () => {
    expect(isoDay(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(parseIsoDay('2026-01-05')).toEqual(new Date(2026, 0, 5));
    expect(parseIsoDay('5. 1. 2026')).toBeUndefined();
  });
  it('další číslo zápisu', () => {
    expect(nextEntryNumber([])).toBe(1);
    expect(nextEntryNumber([1, 5, 3])).toBe(6);
  });
});

describe('obsah zápisu', () => {
  it('uložený JSON se přečte zpět a poškozený nebo prázdný se nahradí prázdným obsahem', () => {
    const z = zapis();
    const back = contentFromJson(contentToJson(z), emptyHeader(DEFAULT_SETTINGS.company));
    expect(back.points[0].files).toEqual(['foto1.jpg']);
    expect(back.header.constructionName).toBe('FVE Mastířovice');
    const prazdny = contentFromJson('{rozbité', header);
    expect(prazdny.points).toEqual([]);
    expect(prazdny.header.place).toBe('Mastířovice');
    expect(contentFromJson(undefined, header).participants).toEqual([]);
  });
  it('soubory bodů bez opakování', () => {
    expect(pointFiles([{ text: 'a', files: ['1.jpg', '2.jpg'] }, { text: 'b', files: ['2.jpg', '3.jpg'] }])).toEqual(['1.jpg', '2.jpg', '3.jpg']);
  });
});

describe('validateEntry', () => {
  const vstup = (extra = {}): Parameters<typeof validateEntry>[0] => ({
    diaryId: 1,
    projectNumber: '26001',
    date: NOW,
    header,
    participants: [],
    points: [{ text: 'Text', files: [] }],
    tasks: [],
    ...extra
  });
  it('koncept potřebuje projekt a deník', () => {
    expect(
      validateEntry(vstup({ diaryId: 0, projectNumber: '', header: { ...header, constructionName: '' }, points: [] }), false).map((i) => i.field)
    ).toEqual(['projectNumber', 'diary']);
  });
  it('před uzavřením chybí stavba, místo a obsah', () => {
    const f = validateEntry(vstup({ header: { ...header, constructionName: '', place: '' }, points: [{ text: ' ', files: [] }] }), true).map((i) => i.field);
    expect(f).toEqual(expect.arrayContaining(['constructionName', 'place', 'points']));
    expect(validateEntry(vstup(), true)).toEqual([]);
  });
  it('bod jen s fotkou stačí; úkol bez popisu ne', () => {
    expect(validateEntry(vstup({ points: [{ text: '', files: ['a.jpg'] }] }), true)).toEqual([]);
    expect(validateEntry(vstup({ tasks: [{ description: '', responsible: 'Jan' }] }), false).map((i) => i.field)).toEqual(['tasks']);
  });
});

describe('pravidla a cesta zápisu', () => {
  it('psát smí PM, asistent a vedení; cizí PM ne; na Režii ne', () => {
    expect(canWriteDiary(projekt, pm)).toBe(true);
    expect(canWriteDiary(projekt, asistent)).toBe(true);
    expect(canWriteDiary(projekt, cizi)).toBe(false);
    expect(canWriteDiary(rezie, admin)).toBe(false);
  });

  it('akce podle stavu', () => {
    expect(availableEntryActions(zapis(), projekt, asistent)).toEqual(['edit', 'close', 'cancel']);
    expect(availableEntryActions(zapis({ status: EntryStatus.Uzavreno }), projekt, pm)).toEqual(['sign', 'scan', 'reopen', 'cancel']);
    expect(availableEntryActions(zapis({ status: EntryStatus.Podepsano }), projekt, pm)).toEqual([]);
    expect(availableEntryActions(zapis(), projekt, cizi)).toEqual([]);
  });

  it('uzavření zamkne zápis a zapíše otisk; neúplný zápis nejde uzavřít', () => {
    const z = closeEntry(zapis(), 'abcdef0123456789', ctx(asistent));
    expect(z.status).toBe(EntryStatus.Uzavreno);
    expect(z.contentHash).toBe('abcdef0123456789');
    expect(z.closedAt).toBe(NOW);
    expect(() => closeEntry(zapis({ points: [] }), 'abc', ctx(asistent))).toThrow(/bod jednání/);
    expect(() => closeEntry(zapis(), '', ctx(asistent))).toThrow(/otisk/);
    expect(() => closeEntry(zapis({ status: EntryStatus.Uzavreno }), 'abc', ctx(asistent))).toThrow(WorkflowError);
    expect(() => closeEntry(zapis(), 'abc', ctx(cizi))).toThrow(/nakládat/);
  });

  it('podpis v aplikaci vyžaduje shodný otisk', () => {
    const uzavreny = zapis({ status: EntryStatus.Uzavreno, contentHash: 'h1' });
    expect(() => signEntryInApp(uzavreny, 'h2', ctx(pm))).toThrow(/změnil/);
    const s = signEntryInApp(uzavreny, 'h1', ctx(pm));
    expect(s.status).toBe(EntryStatus.Podepsano);
    expect(s.signatureKind).toBe('aplikace');
    expect(s.signedByName).toBe('Petr Manažer');
  });

  it('podpis skenem připojí odkaz; podepsaný zápis už nejde měnit ani stornovat', () => {
    const uzavreny = zapis({ status: EntryStatus.Uzavreno, contentHash: 'h1' });
    const s = attachSignedScan(uzavreny, 'https://x/sken.pdf', ctx(asistent));
    expect(s.signatureKind).toBe('sken');
    expect(s.signedUrl).toBe('https://x/sken.pdf');
    const podepsany = applyEntryChange(uzavreny, s, NOW);
    expect(podepsany.status).toBe(EntryStatus.Podepsano);
    expect(() => cancelEntry(podepsany, 'x', ctx(admin))).toThrow(WorkflowError);
    expect(() => reopenEntry(podepsany, 'x', ctx(admin))).toThrow(WorkflowError);
  });

  it('znovuotevření smaže uzavření a chce důvod; storno chce důvod', () => {
    const uzavreny = applyEntryChange(zapis(), closeEntry(zapis(), 'h1', ctx(asistent)), NOW);
    expect(() => reopenEntry(uzavreny, ' ', ctx(pm))).toThrow(/důvod/);
    const otevreny = applyEntryChange(uzavreny, reopenEntry(uzavreny, 'Chybí foto', ctx(pm)), NOW);
    expect(otevreny.status).toBe(EntryStatus.Koncept);
    expect(otevreny.contentHash).toBeUndefined();
    expect(otevreny.closedAt).toBeUndefined();
    expect(() => cancelEntry(zapis(), '', ctx(pm))).toThrow(/důvod/);
    expect(cancelEntry(zapis(), 'Omyl', ctx(pm)).status).toBe(EntryStatus.Storno);
  });
});

describe('filtr a řazení', () => {
  const list = [
    zapis({ id: 1, entryNo: 1, date: new Date(2026, 8, 1) }),
    zapis({ id: 2, entryNo: 2, date: new Date(2026, 8, 15), diaryId: 2, status: EntryStatus.Uzavreno, header: { ...header, counterparty: 'Beltec' } }),
    zapis({ id: 3, entryNo: 3, date: new Date(2026, 8, 15) })
  ];
  it('filtr deníku, stavu a textu', () => {
    expect(filterEntries(list, { diaryId: 2 }).map((e) => e.id)).toEqual([2]);
    expect(filterEntries(list, { statuses: [EntryStatus.Uzavreno] }).map((e) => e.id)).toEqual([2]);
    expect(filterEntries(list, { search: 'beltec' }).map((e) => e.id)).toEqual([2]);
    expect(filterEntries(list, { search: 'kabelu' }).length).toBe(3);
  });
  it('nejnovější první, při shodě data podle čísla', () => {
    expect(sortEntriesNewestFirst(list).map((e) => e.id)).toEqual([3, 2, 1]);
  });
});

describe('otisk zápisu', () => {
  const identity = { projectNumber: '26001', diaryId: 1, entryNo: 7, date: new Date(2026, 9, 1) };
  it('SHA-256 souhlasí se známou hodnotou', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('stejný zápis dá stejný otisk, změna textu nebo souboru jiný', async () => {
    const z = zapis();
    const h1 = await computeEntryHash(identity, z, { 'foto1.jpg': 'aaa' });
    expect(await computeEntryHash(identity, z, { 'foto1.jpg': 'aaa' })).toBe(h1);
    expect(await computeEntryHash(identity, { ...z, points: [{ ...z.points[0], text: 'Jiný text' }] }, { 'foto1.jpg': 'aaa' })).not.toBe(h1);
    expect(await computeEntryHash(identity, z, { 'foto1.jpg': 'bbb' })).not.toBe(h1);
  });
  it('do vstupu se berou soubory seřazené podle názvu', () => {
    const z = zapis({ points: [{ text: 'a', files: ['b.jpg', 'a.jpg'] }] });
    expect(entryHashInput(identity, z, { 'a.jpg': '1', 'b.jpg': '2' })).toContain('"files":["a.jpg:1","b.jpg:2"]');
  });
});

describe('předávací protokol', () => {
  const protokol = (extra: Partial<DiaryEntry> = {}): DiaryEntry =>
    zapis({
      kind: 'predani',
      handover: { result: 'bez-vyhrad', warrantyMonths: 60 },
      header: { ...header, counterparty: 'ČEZ Distribuce' },
      diaryTitle: 'Předávací protokoly',
      entryNo: 1,
      ...extra
    });

  it('číslo PP-projekt-pořadí a název dokumentu', () => {
    expect(protocolNumber('26001', 1)).toBe('PP-26001-01');
    expect(protocolNumber('26001', 12)).toBe('PP-26001-12');
    expect(entryTitle(protokol())).toBe('Předávací protokol PP-26001-01');
    expect(entryTitle(zapis())).toBe('Zápis č. 7');
    expect(isHandover(protokol())).toBe(true);
    expect(isHandover(zapis())).toBe(false);
  });

  it('složka PP01 a název souboru; zápis zůstává Z007', () => {
    expect(entryFolderPath('04-Zápisy', 'Předávací protokoly', 1, 'predani')).toBe('04-Zápisy/Předávací protokoly/PP01');
    expect(entryFolderPath('04-Zápisy', 'Hlavní deník', 7)).toBe('04-Zápisy/Hlavní deník/Z007');
    expect(entryFileName('26001', 1, 'pdf', 'predani')).toBe('Predavaci_protokol_26001_PP01.pdf');
    expect(entryFileName('26001', 7, 'pdf')).toBe('Zapis_26001_Z007.pdf');
  });

  it('deník Předávací protokoly se pozná podle názvu', () => {
    expect(isHandoverDiary({ title: 'Předávací protokoly' })).toBe(true);
    expect(isHandoverDiary({ title: ' předávací PROTOKOLY ' })).toBe(true);
    expect(isHandoverDiary({ title: 'Hlavní deník' })).toBe(false);
  });

  it('druh a závěr se uloží a přečtou zpět; běžný zápis druh neukládá', () => {
    const back = contentFromJson(contentToJson(protokol()), header);
    expect(back.kind).toBe('predani');
    expect(back.handover).toEqual({ result: 'bez-vyhrad', warrantyMonths: 60 });
    expect(contentToJson(zapis())).not.toContain('kind');
    expect(contentFromJson(contentToJson(zapis()), header).kind).toBeUndefined();
    const spatny = contentFromJson(JSON.stringify({ kind: 'predani', handover: { result: 'nesmysl', warrantyMonths: -3 } }), header);
    expect(spatny.handover).toEqual({ result: undefined, warrantyMonths: undefined });
  });

  it('před uzavřením musí být výsledek, přebírající a předmět; s výhradami i vada', () => {
    const vstup = (extra = {}): Parameters<typeof validateEntry>[0] => ({
      diaryId: 1,
      projectNumber: '26001',
      date: NOW,
      header: { ...header, counterparty: 'ČEZ Distribuce' },
      participants: [],
      points: [{ text: 'Předána FVE 1 MWp', files: [] }],
      tasks: [],
      kind: 'predani',
      handover: { result: 'bez-vyhrad' },
      ...extra
    });
    expect(validateEntry(vstup(), true)).toEqual([]);
    expect(validateEntry(vstup({ handover: {} }), true).map((i) => i.field)).toEqual(['result']);
    expect(validateEntry(vstup({ header: { ...header, counterparty: ' ' } }), true).map((i) => i.field)).toEqual(['counterparty']);
    expect(validateEntry(vstup({ points: [] }), true)[0].message).toContain('předmět předání');
    expect(validateEntry(vstup({ handover: { result: 's-vyhradami' } }), true).map((i) => i.field)).toEqual(['tasks']);
    expect(validateEntry(vstup({ handover: { result: 's-vyhradami' }, tasks: [{ description: 'Doplnit štítky' }] }), true)).toEqual([]);
    // koncept se nekontroluje přísně
    expect(validateEntry(vstup({ handover: {}, points: [] }), false)).toEqual([]);
  });

  it('konec záruky: datum předání + měsíce, konec měsíce se nepřelévá', () => {
    expect(warrantyEnd(new Date(2026, 9, 1), 60)).toEqual(new Date(2031, 9, 1));
    expect(warrantyEnd(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 28));
    expect(warrantyEnd(new Date(2027, 11, 15), 24)).toEqual(new Date(2029, 11, 15));
  });

  it('směr předání: bez uvedení předáváme my; přebíráme prohodí strany', () => {
    const h = { managerName: 'Petr Manažer', counterparty: 'BELTEC' };
    expect(handoverDirectionOf({})).toBe('predavame');
    expect(handoverDirectionOf({ handover: { direction: 'prebirame' } })).toBe('prebirame');
    const a = handoverParties({ header: h }, 'Revoltum');
    expect([a.giver, a.giverRole, a.receiver, a.receiverRole]).toEqual(['Revoltum · Petr Manažer', 'zhotovitel', 'BELTEC', 'objednatel']);
    const b = handoverParties({ header: h, handover: { direction: 'prebirame' } }, 'Revoltum');
    expect([b.giver, b.giverRole, b.receiver, b.receiverRole]).toEqual(['BELTEC', 'dodavatel', 'Revoltum · Petr Manažer', 'objednatel']);
    expect(b.ourRole).toBe('objednatel');
    expect(contentFromJson(contentToJson({ ...protokol(), handover: { result: 'bez-vyhrad', direction: 'prebirame' } }), header).handover?.direction).toBe('prebirame');
    expect(contentFromJson(contentToJson(protokol()), header).handover?.direction).toBeUndefined();
  });

  it('filtr podle druhu odděluje protokoly od zápisů', () => {
    const list = [zapis({ id: 1 }), protokol({ id: 2 }), zapis({ id: 3 })];
    expect(filterEntries(list, { kind: 'predani' }).map((e) => e.id)).toEqual([2]);
    expect(filterEntries(list, { kind: 'zapis' }).map((e) => e.id)).toEqual([1, 3]);
    expect(filterEntries(list).length).toBe(3);
  });

  it('otisk se mění se závěrem protokolu, ale otisk běžného zápisu zůstává stejný', async () => {
    const identity = { projectNumber: '26001', diaryId: 1, entryNo: 1, date: new Date(2026, 9, 1) };
    const p = protokol();
    const h1 = await computeEntryHash(identity, p, {});
    expect(await computeEntryHash(identity, { ...p, handover: { result: 'neprevzato' } }, {})).not.toBe(h1);
    expect(entryHashInput(identity, zapis(), {})).not.toContain('kind');
  });
});

describe('dodatečné přílohy po uzavření a podpisu', () => {
  it('složka je vedle příloh zápisu, ne v nich (nezasahuje do otisku obsahu)', () => {
    expect(entryLateFilesPath('Zápisy/Hlavní deník/Z007')).toBe('Zápisy/Hlavní deník/Z007/Dodatečné přílohy');
    expect(entryLateFilesPath('Z007')).not.toBe(entryFilesPath('Z007'));
  });

  it('smí autor, PM, vedení a administrátor — a jen u uzavřeného nebo podepsaného zápisu', () => {
    const uzavreny = zapis({ status: EntryStatus.Uzavreno });
    const podepsany = zapis({ status: EntryStatus.Podepsano });
    expect(canAddLateAttachments(uzavreny, projekt, asistent)).toBe(true);
    expect(canAddLateAttachments(podepsany, projekt, pm)).toBe(true);
    expect(canAddLateAttachments(podepsany, projekt, admin)).toBe(true);
    expect(canAddLateAttachments(podepsany, projekt, cizi)).toBe(false);
    expect(canAddLateAttachments(zapis({ status: EntryStatus.Koncept }), projekt, asistent)).toBe(false);
    expect(canAddLateAttachments(zapis({ status: EntryStatus.Storno }), projekt, asistent)).toBe(false);
  });

  it('záznam do historie vypíše soubory; cizí člověk, koncept nebo prázdný seznam jsou chyba', () => {
    const podepsany = zapis({ status: EntryStatus.Podepsano });
    expect(lateAttachmentAudit(podepsany, ['sken-podpis.pdf', 'foto.jpg'], ctx(pm))).toBe('Dodatečně přiloženo (2): sken-podpis.pdf, foto.jpg');
    expect(() => lateAttachmentAudit(podepsany, ['a.pdf'], ctx(cizi))).toThrow(WorkflowError);
    expect(() => lateAttachmentAudit(zapis(), ['a.pdf'], ctx(pm))).toThrow(/uzavřenému nebo podepsanému/);
    expect(() => lateAttachmentAudit(podepsany, ['  '], ctx(pm))).toThrow(/Není co přiložit/);
  });
});
