import { ALL_REPORT_SECTIONS, REPORT_LIMITS, ProjectReportModel, ReportInput, buildProjectReportModel, reportFileName, reportHighlights, shorten } from './projectReport';
import { BudgetDoc, BudgetRecord, BudgetStatus as BStatus } from './budget';
import { RateTable } from './currency';
import { BudgetStatus, Project, ProjectStatus, ProjectTask, TaskType } from './types';
import { OrderStatus, PurchaseOrder } from './orders';
import { InvoiceBasis, InvoiceKind, InvoiceStatus } from './invoiceBases';
import { DiaryEntry, EntryStatus, emptyHeader } from './siteDiary';
import { DEFAULT_SETTINGS } from './settings';

const NOW = new Date(2026, 9, 1, 12, 0, 0);

const projekt: Project = {
  id: 1,
  projectNumber: '26001',
  title: '26001 MASTIROVICE 1 GENERALNI OPRAVA',
  shortName: 'MASTIROVICE 1',
  customerName: 'ČEZ Distribuce',
  location: 'Mastířovice',
  projectType: 'FVE',
  projectManagerName: 'Igor Zahrádka',
  status: ProjectStatus.Realizace,
  currency: 'EUR',
  contractPriceNet: 1000,
  isOverhead: false,
  budgetStatus: BudgetStatus.Zelena
};

const convert = (amount: number, currency: string): number => (currency === 'EUR' ? amount * 25 : amount);

function objednavka(id: number, status: OrderStatus, amountNet: number, currency = 'CZK', extra: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id,
    orderNumber: `OBJ-2026-${String(id).padStart ? String(id).padStart(4, '0') : '000' + id}`,
    projectNumber: '26001',
    supplierName: 'BELTEC s.r.o.',
    subject: `Dodávka č. ${id}`,
    lines: [],
    amountNet,
    vatRate: 21,
    currency,
    status,
    requestedByName: 'Anna',
    requestedByLogin: 'anna',
    approvalChain: [],
    created: new Date(2026, 8, id),
    ...extra
  };
}

function podklad(id: number, status: InvoiceStatus, amountNet: number, extra: Partial<InvoiceBasis> = {}): InvoiceBasis {
  return {
    id,
    number: `FP2600${id}`,
    projectNumber: '26001',
    lines: [],
    amountNet,
    vatRate: 21,
    currency: 'CZK',
    status,
    requestedByName: 'Anna',
    requestedByLogin: 'anna',
    created: new Date(2026, 8, id),
    ...extra
  };
}

function termin(id: number, finish: Date | undefined, percent = 0): ProjectTask {
  return { id, projectNumber: '26001', title: `Termín ${id}`, taskType: TaskType.Milnik, finishDate: finish, isContractualDeadline: true, percentComplete: percent };
}

function zapis(no: number, date: Date, extra: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id: no,
    diaryId: 1,
    diaryTitle: 'Hlavní deník',
    projectNumber: '26001',
    entryNo: no,
    date,
    folderPath: `04-Zápisy/Hlavní deník/Z00${no}`,
    header: { ...emptyHeader(DEFAULT_SETTINGS.company), counterparty: 'BELTEC' },
    participants: [],
    points: [{ title: 'Kabeláž', text: 'Položeno 200 m kabelu.', files: [] }],
    tasks: [],
    status: EntryStatus.Uzavreno,
    createdByName: 'Anna',
    createdByLogin: 'anna',
    ...extra
  };
}

function vstup(extra: Partial<ReportInput> = {}): ReportInput {
  return {
    project: projekt,
    orders: [],
    invoices: [],
    tasks: [],
    entries: [],
    photos: [],
    sections: ALL_REPORT_SECTIONS,
    convert,
    currency: 'CZK',
    generatedBy: 'Igor Zahrádka',
    companyName: 'Revoltum Engineering & Services',
    now: NOW,
    ...extra
  };
}

describe('zkrácení textu', () => {
  it('krátký text zůstane, dlouhý se zkrátí na hranici slova a řádky se spojí', () => {
    expect(shorten('Krátký text', 50)).toBe('Krátký text');
    expect(shorten('Jedna\n\n dva   tři', 50)).toBe('Jedna dva tři');
    const s = shorten('Položeno dvě stě metrů kabelu a ještě se pokračuje dál a dál', 30);
    expect(s.length).toBeLessThanOrEqual(31);
    expect(s.endsWith('…')).toBe(true);
    expect(s).not.toMatch(/\s…$/);
  });
});

describe('finance v reportu', () => {
  it('cena projektu v EUR se přepočte do měny reportu, původní částka se zachová', () => {
    const m = buildProjectReportModel(vstup());
    expect(m.finance.price).toBe(25000);
    expect(m.finance.originalPrice).toEqual({ amount: 1000, currency: 'EUR' });
  });

  it('vyčerpáno = jen vystavené objednávky (ne koncepty, vrácené, zamítnuté, storno), v měně reportu', () => {
    const m = buildProjectReportModel(
      vstup({
        orders: [
          objednavka(1, OrderStatus.Koncept, 9000),
          objednavka(2, OrderStatus.KeSchvaleni, 2000),
          objednavka(3, OrderStatus.Odeslano, 100, 'EUR'),
          objednavka(4, OrderStatus.Storno, 7000),
          objednavka(5, OrderStatus.VracenoKUprave, 7000)
        ]
      })
    );
    expect(m.finance.spent).toBe(2000 + 2500);
    expect(m.finance.spentPercent).toBe(18);
  });

  it('objednávky podle stavu mají počet a součet, ve stejném pořadí jako stavy', () => {
    const m = buildProjectReportModel(vstup({ orders: [objednavka(1, OrderStatus.Odeslano, 100), objednavka(2, OrderStatus.Koncept, 50), objednavka(3, OrderStatus.Odeslano, 200)] }));
    expect(m.finance.ordersByStatus.map((s) => [s.status, s.count, s.amount])).toEqual([
      ['Koncept', 1, 50],
      ['Odesláno dodavateli', 2, 300]
    ]);
    expect(m.finance.ordersTotal).toBe(3);
  });

  it('seznam objednávek je od nejnovější a zkrácený na limit s poznámkou, kolik jich zbývá', () => {
    const orders = Array.from({ length: REPORT_LIMITS.orders + 3 }, (_, i) => objednavka(i + 1, OrderStatus.Odeslano, 10));
    const m = buildProjectReportModel(vstup({ orders }));
    expect(m.finance.orders).toHaveLength(REPORT_LIMITS.orders);
    expect(m.finance.ordersHidden).toBe(3);
  });

  it('cizí měna u dokladu se pozná (kvůli „≈“ v tabulce)', () => {
    const m = buildProjectReportModel(vstup({ orders: [objednavka(1, OrderStatus.Odeslano, 10, 'EUR'), objednavka(2, OrderStatus.Odeslano, 10, 'CZK')] }));
    expect(m.finance.orders.filter((o) => o.originalCurrency === 'EUR')).toHaveLength(1);
  });

  it('fakturace: vyfakturováno = Vyfakturováno + Uhrazeno, uhrazeno jen Uhrazeno; storno se mezi stavy nepočítá; druh dokladu se ukáže', () => {
    const m = buildProjectReportModel(
      vstup({
        invoices: [
          podklad(1, InvoiceStatus.Predano, 1000),
          podklad(2, InvoiceStatus.Vyfakturovano, 2000),
          podklad(3, InvoiceStatus.Uhrazeno, 4000, { kind: InvoiceKind.Zaloha }),
          podklad(4, InvoiceStatus.Storno, 8000)
        ]
      })
    );
    expect(m.finance.invoiced).toBe(6000);
    expect(m.finance.paid).toBe(4000);
    expect(m.finance.invoicesByStatus.map((s) => s.status)).not.toContain('Storno');
    expect(m.finance.invoices.filter((i) => i.kind === InvoiceKind.Zaloha)).toHaveLength(1);
  });
});

describe('termíny a úkoly v reportu', () => {
  it('termíny podle data, bez data nakonec; po termínu a nedokončený se označí', () => {
    const m = buildProjectReportModel(vstup({ tasks: [termin(1, undefined), termin(2, new Date(2026, 9, 20)), termin(3, new Date(2026, 8, 20), 40), termin(4, new Date(2026, 8, 10), 100)] }));
    expect(m.deadlines.map((d) => d.title)).toEqual(['Termín 4', 'Termín 3', 'Termín 2', 'Termín 1']);
    expect(m.deadlines.map((d) => d.overdue)).toEqual([false, true, false, false]);
  });

  it('úkoly jsou z nejnovějších tří zápisů, seřazené podle termínu, prošlý se označí', () => {
    const entries = [
      zapis(1, new Date(2026, 8, 1), { tasks: [{ description: 'Starý úkol', due: '2026-09-02' }] }),
      zapis(2, new Date(2026, 8, 10), { tasks: [{ description: 'Doložit revizi', responsible: 'Jan', due: '2026-09-15' }] }),
      zapis(3, new Date(2026, 8, 20), { tasks: [{ description: 'Oplotit staveniště', due: '2026-10-20' }, { description: 'Bez termínu' }] }),
      zapis(4, new Date(2026, 8, 25), { tasks: [{ description: '  ' }] })
    ];
    const m = buildProjectReportModel(vstup({ entries }));
    expect(m.tasks.map((t) => t.description)).toEqual(['Doložit revizi', 'Oplotit staveniště', 'Bez termínu']);
    expect(m.tasks.map((t) => t.overdue)).toEqual([true, false, false]);
    expect(m.tasks.map((t) => t.entryNo)).toEqual([2, 3, 3]);
  });
});

describe('zápisy v reportu', () => {
  it('od nejnovějšího, bez stornovaných, se stručným obsahem prvního bodu', () => {
    const entries = [
      zapis(1, new Date(2026, 8, 1)),
      zapis(2, new Date(2026, 8, 12), { status: EntryStatus.Storno }),
      zapis(3, new Date(2026, 8, 20), { points: [{ title: '', text: 'x'.repeat(400), files: [] }] })
    ];
    const m = buildProjectReportModel(vstup({ entries }));
    expect(m.entries.map((e) => e.entryNo)).toEqual([3, 1]);
    expect(m.entries[0].summary.length).toBeLessThanOrEqual(151);
    expect(m.entries[1].summary).toBe('Kabeláž: Položeno 200 m kabelu.');
    expect(m.entries[0].counterparty).toBe('BELTEC');
  });

  it('počet zápisů nad limit se ohlásí', () => {
    const entries = Array.from({ length: REPORT_LIMITS.entries + 2 }, (_, i) => zapis(i + 1, new Date(2026, 8, i + 1)));
    const m = buildProjectReportModel(vstup({ entries }));
    expect(m.entries).toHaveLength(REPORT_LIMITS.entries);
    expect(m.entriesHidden).toBe(2);
  });
});

describe('fotky, údaje projektu a název souboru', () => {
  it('fotek je nejvýš tolik, kolik se vejde na stránku', () => {
    const photos = Array.from({ length: 10 }, (_, i) => ({ dataUrl: 'data:image/jpeg;base64,AA', caption: `Foto ${i}`, batch: '2026-09-01 X' }));
    expect(buildProjectReportModel(vstup({ photos })).photos).toHaveLength(REPORT_LIMITS.photos);
  });

  it('projekt bez zákazníka a PM se zobrazí srozumitelně, ne jako undefined; zkrácený název má přednost', () => {
    const m = buildProjectReportModel(vstup({ project: { ...projekt, customerName: undefined, projectManagerName: undefined, shortName: undefined, title: 'Dlouhý název', contractPriceNet: undefined } }));
    expect(m.project.customer).toBe('—');
    expect(m.project.manager).toBe('—');
    expect(m.project.title).toBe('Dlouhý název');
    expect(m.finance.price).toBeUndefined();
    expect(m.finance.spentPercent).toBeUndefined();
  });

  it('název souboru: číslo projektu a den', () => {
    expect(reportFileName('26001', new Date(2026, 9, 1))).toBe('Report_26001_2026-10-01.pdf');
    expect(reportFileName('26 00/1', new Date(2026, 0, 5))).toBe('Report_26_00_1_2026-01-05.pdf');
  });
});

describe('na co dát pozor', () => {
  it('bez problémů jedna uklidňující věta', () => {
    const m = buildProjectReportModel(vstup({ project: { ...projekt, endDatePlanned: new Date(2027, 0, 1) } }));
    expect(reportHighlights(m)).toEqual(['Žádná upozornění — termíny, rozpočet i schvalování jsou v pořádku.']);
  });

  it('termín po lhůtě, úkol po termínu a čekající schválení se vypíšou', () => {
    const m = buildProjectReportModel(
      vstup({
        project: { ...projekt, endDatePlanned: new Date(2027, 0, 1) },
        tasks: [termin(1, new Date(2026, 8, 1), 20), termin(2, new Date(2026, 8, 5), 0)],
        entries: [zapis(1, new Date(2026, 8, 20), { tasks: [{ description: 'Doložit revizi', due: '2026-09-15' }] })],
        orders: [objednavka(1, OrderStatus.KeSchvaleni, 100), objednavka(2, OrderStatus.KeSchvaleni, 100)],
        invoices: [podklad(1, InvoiceStatus.KeKontrole, 1000)]
      })
    );
    const h = reportHighlights(m).join(' | ');
    expect(h).toContain('2 termíny jsou po lhůtě');
    expect(h).toContain('1 úkol ze zápisu je po termínu');
    expect(h).toContain('2 objednávky čekají na schválení');
    expect(h).toContain('1 podklad pro fakturaci čeká na kontrolu');
  });

  it('rozpočet: přes 100 % překročeno, od 90 % blíží se, červený semafor', () => {
    const base = { ...projekt, currency: 'CZK', contractPriceNet: 1000, endDatePlanned: new Date(2027, 0, 1) };
    const over = buildProjectReportModel(vstup({ project: base, orders: [objednavka(1, OrderStatus.Odeslano, 1200)] }));
    expect(reportHighlights(over).join(' ')).toContain('přesahují cenu projektu');
    const near = buildProjectReportModel(vstup({ project: base, orders: [objednavka(1, OrderStatus.Odeslano, 920)] }));
    expect(reportHighlights(near).join(' ')).toContain('Objednáno už 92 %');
    const red = buildProjectReportModel(vstup({ project: { ...base, budgetStatus: BudgetStatus.Cervena } }));
    expect(reportHighlights(red).join(' ')).toContain('červený');
  });

  it('plánované ukončení po termínu u nedokončeného projektu', () => {
    const m = buildProjectReportModel(vstup({ project: { ...projekt, endDatePlanned: new Date(2026, 8, 1) } }));
    expect(reportHighlights(m).join(' ')).toContain('Plánované ukončení');
    const done = buildProjectReportModel(vstup({ project: { ...projekt, endDatePlanned: new Date(2026, 8, 1), status: ProjectStatus.Dokonceno } }));
    expect(reportHighlights(done).join(' ')).not.toContain('Plánované ukončení');
  });
});

describe('rozpočet v modelu reportu', () => {
  const doc: BudgetDoc = {
    groups: [{ id: 'g1', name: 'Materiál', kind: 'standard', defaultMarkupPercent: 20 }],
    items: [{ id: 'i1', groupId: 'g1', description: 'Panely', currency: 'CZK', quantity: 100, unitCost: 1, actualQty: 60, actualCost: 60 }],
    rates: [],
    revenues: [{ id: 'v1', description: 'Smluvní cena', currency: 'CZK', plan: 120 }]
  };
  const rates = { EUR: 25, USD: 20, source: 'test' } as unknown as RateTable;
  const rec = (approved: boolean): BudgetRecord => ({ id: 1, projectNumber: '26001', status: BStatus.Schvaleno, approvals: approved ? [{ no: 1, at: new Date(2026, 9, 1), byName: 'V', cost: 100, sale: 120, marginPercent: 16.67 }] : [] });
  const build = (approved: boolean): ProjectReportModel => buildProjectReportModel({ ...vstup(), budget: { doc, record: rec(approved), rates } });

  it('cena = plán výnosů (smluvní cena), vyčerpáno = skutečnost, proinvestováno = skutečnost / náklady; semafor podle marže z prognózy', () => {
    const m = build(true);
    expect(m.budget).toMatchObject({ approved: true, cost: 100, sale: 120, actual: 60, remaining: 40, spentPercent: 60, semaphore: 'Zelená' });
    expect(m.finance).toMatchObject({ price: 120, spent: 60, spentPercent: 60, fromBudget: true, provisional: false });
    expect(m.budget?.groups[0]).toMatchObject({ name: 'Materiál', cost: 100, actual: 60 });
  });

  it('neschválený rozpočet je provizorní (semafor se počítá z marže, zadání chybí) a report na to upozorní', () => {
    const m = build(false);
    expect(m.finance.provisional).toBe(true);
    expect(m.budget?.semaphore).toBe('Zelená');
    expect(m.budget?.marginApprovedPercent).toBeUndefined();
    expect(reportHighlights(m).join(' ')).toContain('Rozpočet zatím nebyl schválen');
  });

  it('bez rozpočtu (nebo s vypnutou částí) platí cena z projektu a čerpání z objednávek', () => {
    const bez = buildProjectReportModel(vstup());
    expect(bez.budget).toBeUndefined();
    expect(bez.finance.fromBudget).toBe(false);
    const vyp = buildProjectReportModel({ ...vstup(), budget: { doc, record: rec(true), rates }, sections: { ...ALL_REPORT_SECTIONS, budget: false } });
    expect(vyp.budget).toBeUndefined();
  });

  it('rozpočet upravený po schválení se pozná', () => {
    const m = buildProjectReportModel({ ...vstup(), budget: { doc: { ...doc, items: [{ ...doc.items[0], unitCost: 2 }] }, record: rec(true), rates } });
    expect(m.budget?.changedSinceApproval).toBe(true);
    expect(reportHighlights(m).join(' ')).toContain('upraven');
  });
});
