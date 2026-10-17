import { ENTITY } from '../../config/entity';
import { buildProjectReportDocument } from './projectReportPdf';
import { ALL_REPORT_SECTIONS, ProjectReportModel } from '../../core/projectReport';

const model = (extra: Partial<ProjectReportModel> = {}): ProjectReportModel => ({
  generatedAt: new Date(2026, 9, 1, 14, 30),
  generatedBy: 'Igor Zahrádka',
  companyName: 'Revoltum Engineering & Services',
  sections: ALL_REPORT_SECTIONS,
  currency: 'CZK',
  project: {
    number: '26001',
    title: 'MASTIROVICE 1 GENERALNI OPRAVA',
    customer: 'ČEZ Distribuce',
    location: 'Mastířovice',
    type: 'FVE',
    manager: 'Igor Zahrádka',
    status: 'Realizace',
    start: new Date(2026, 5, 3),
    endPlanned: new Date(2027, 0, 15),
    budgetStatus: 'Zelená'
  },
  finance: {
    price: 4850000,
    spent: 1200000,
    spentPercent: 24.7,
    ordersByStatus: [{ status: 'Odesláno dodavateli', count: 2, amount: 1200000 }],
    ordersTotal: 2,
    orders: [{ number: 'OBJ-2026-0001', supplier: 'BELTEC s.r.o.', subject: 'Dodávka trafostanice', status: 'Odesláno dodavateli', amount: 1000000 }],
    ordersHidden: 0,
    invoices: [{ number: 'FP26001', kind: 'Zálohová faktura', status: 'Předáno účtárně', amount: 500000, dueDate: new Date(2026, 10, 1) }],
    invoicesHidden: 0,
    invoicesByStatus: [{ status: 'Předáno účtárně', count: 1, amount: 500000 }],
    invoiced: 0,
    paid: 0
  },
  deadlines: [{ title: 'Předání díla', type: 'Milník', dueDate: new Date(2026, 10, 30), percent: 0, contractual: true, overdue: false }],
  deadlinesHidden: 0,
  tasks: [{ description: 'Doložit revizní zprávu', responsible: 'Jan Dodavatel', due: new Date(2026, 9, 15), entryNo: 7, overdue: false }],
  tasksHidden: 0,
  entries: [{ entryNo: 7, date: new Date(2026, 9, 1), diary: 'Hlavní deník', counterparty: 'BELTEC', status: 'Uzavřeno', pointCount: 3, summary: 'Kabeláž: Položeno 200 m kabelu.' }],
  entriesHidden: 0,
  photos: [{ dataUrl: 'data:image/jpeg;base64,/9j/4AAQ', caption: 'mělký výkop', batch: '2026-10-01 Výkop' }],
  budget: undefined,
  ...extra
});

/** Všechen text z dokumentu na jednu hromadu. */
function allText(node: unknown): string {
  if (node === null || node === undefined) {
    return '';
  }
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(allText).join(' ');
  }
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>;
    return ['text', 'stack', 'columns', 'table', 'body'].map((k) => (k in o ? allText(o[k]) : '')).join(' ');
  }
  return '';
}

describe('PDF reportu projektu', () => {
  it('stránky jsou 16:9 jako v PowerPointové šabloně RES (960 × 540 bodů)', () => {
    const doc = buildProjectReportDocument(model());
    expect(doc.pageSize).toEqual({ width: 960, height: 540 });
  });

  it('má úvodní stranu s názvem a projektem a závěrečnou s claimem značky', () => {
    const text = allText(buildProjectReportDocument(model()).content);
    expect(text).toContain('REPORT PROJEKTU');
    expect(text).toContain('MASTIROVICE 1 GENERALNI OPRAVA');
    expect(text).toContain('Projekt 26001');
    expect(text).toContain(ENTITY.company.slogan.cs[0]);
    expect(text).toContain(ENTITY.company.slogan.cs[1]);
  });

  it('obsahuje přehled, objednávky, fakturaci, termíny, deník i fotky', () => {
    const text = allText(buildProjectReportDocument(model()).content);
    ['Přehled projektu', 'Objednávky a nákup', 'Fakturace', 'Termíny a úkoly', 'Stavební deník', 'Fotodokumentace'].forEach((t) => expect(text).toContain(t));
    expect(text).toContain('OBJ-2026-0001');
    expect(text).toContain('Zálohová faktura');
    expect(text).toContain('Doložit revizní zprávu');
    expect(text).toContain('mělký výkop');
  });

  it('vypnuté části se nevykreslí (přehled zůstává)', () => {
    const text = allText(buildProjectReportDocument(model({ sections: { budget: false, finance: false, deadlines: false, diary: false, photos: false } })).content);
    expect(text).toContain('Přehled projektu');
    ['Objednávky a vyčerpání', 'Termíny a úkoly', 'Stavební deník', 'Fotodokumentace'].forEach((t) => expect(text).not.toContain(t));
  });

  it('přehled ukáže cenu, vyčerpáno a „Na co dát pozor“', () => {
    const text = allText(buildProjectReportDocument(model()).content).replace(/\s/g, ' ');
    expect(text).toMatch(/4\s850\s000/);
    expect(text).toContain('Na co dát pozor');
    expect(text).toContain('Žádná upozornění');
  });

  it('prázdné části řeknou, že nic není, a nezhroutí se', () => {
    const empty = model({
      finance: { ...model().finance, orders: [], ordersByStatus: [], invoices: [], invoicesByStatus: [], ordersTotal: 0 },
      deadlines: [],
      tasks: [],
      entries: [],
      photos: []
    });
    const text = allText(buildProjectReportDocument(empty).content);
    expect(text).toContain('Žádné objednávky');
    expect(text).toContain('žádné podklady pro fakturaci');
    expect(text).toContain('Projekt zatím nemá zadané termíny');
    expect(text).toContain('žádné zápisy ze stavby');
    expect(text).toContain('žádné fotky');
  });

  it('s obrázky šablony je podklad obrázek a výboje jsou vložené', () => {
    const s = JSON.stringify(
      buildProjectReportDocument(model(), { gradient: 'data:image/jpeg;base64,GRAD', streak: 'data:image/png;base64,STREAK', logoDark: 'data:image/png;base64,LOGO' }).content
    );
    expect(s).toContain('data:image/jpeg;base64,GRAD');
    expect(s.split('data:image/png;base64,STREAK').length - 1).toBe(4); // 2 výboje na úvodní a 2 na závěrečné straně
    expect(s).toContain('data:image/png;base64,LOGO');
    // bez obrázků šablony se dokument sestaví s vektorovým navy podkladem
    expect(JSON.stringify(buildProjectReportDocument(model()).content)).not.toContain('STREAK');
  });

  it('logo na obsahových stranách je v pozadí, na úvodní straně ne; patička na úvodní a závěrečné straně chybí', () => {
    const doc = buildProjectReportDocument(model());
    const bg = doc.background as (page: number) => unknown;
    expect(bg(1)).toBeNull();
    expect(bg(2)).not.toBeNull();
    const footer = doc.footer as (page: number, count: number) => unknown;
    expect(footer(1, 8)).toBeNull();
    expect(footer(8, 8)).toBeNull();
    expect(JSON.stringify(footer(3, 8))).toContain('Report projektu 26001');
  });
});

describe('PDF reportu: realizační rozpočet', () => {
  const budget = {
    approved: false,
    pending: false,
    changedSinceApproval: false,
    cost: 3900000,
    sale: 4500000,
    revenueForecast: 4500000,
    marginForecastPercent: 13.33,
    marginApprovedPercent: 13.33,
    ordered: 120000,
    forecast: 3950000,
    actual: 3411582,
    remaining: 488418,
    spentPercent: 87.5,
    semaphore: 'Bez rozpočtu',
    groups: [
      { name: 'Materiál', kind: 'standard', cost: 3000000, actual: 2800000, remaining: 200000 },
      { name: 'Vlastní práce', kind: 'prace', cost: 900000, actual: 611582, remaining: 288418 }
    ]
  };

  it('s rozpočtem je v PDF strana Realizační rozpočet se skupinami a stavem schválení', () => {
    const t = allText(buildProjectReportDocument(model({ budget, finance: { ...model().finance, fromBudget: true, provisional: true, price: 4500000, spent: 3411582, spentPercent: 87.5 } })).content);
    expect(t).toContain('Realizační rozpočet');
    expect(t).toContain('NESCHVÁLENO');
    expect(t).toContain('Materiál');
    expect(t).toContain('Vlastní práce (práce)');
    expect(t).toContain('Nakoupeno');
    expect(t).toContain('prostavěnost 87,5 %');
    expect(t).toContain('smluvní cena (plán výnosů rozpočtu)');
  });

  it('schválený rozpočet ukáže číslo záznamu a kdo ho schválil', () => {
    const t = allText(buildProjectReportDocument(model({ budget: { ...budget, approved: true, approvalNo: 2, approvedBy: 'Igor Zahrádka', approvedAt: new Date(2026, 9, 2), changedSinceApproval: true, semaphore: 'Zelená' } })).content);
    expect(t).toContain('Schváleno (záznam č. 2');
    expect(t).toContain('Igor Zahrádka');
    expect(t).toContain('od té doby upraveno');
    expect(t).toContain('Semafor rozpočtu: Zelená');
  });

  it('vypnutá část Rozpočet stranu nevykreslí', () => {
    const t = allText(buildProjectReportDocument(model({ budget, sections: { ...ALL_REPORT_SECTIONS, budget: false } })).content);
    expect(t).not.toContain('Plán – nákup');
  });
});
