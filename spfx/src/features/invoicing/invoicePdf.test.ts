import { buildInvoiceDocument, invoicePdfData, invoicePdfFileName, invoiceWatermark } from './invoicePdf';
import { InvoiceBasis, InvoiceKind, InvoiceStatus, invoiceKindOf } from '../../core/invoiceBases';
import { DEFAULT_SETTINGS } from '../../core/settings';

const firma = { ...DEFAULT_SETTINGS.company, ico: '12345678', dic: 'CZ12345678' };

const podklad: InvoiceBasis = {
  id: 1,
  number: 'FP26004',
  projectNumber: '26001',
  customerName: 'ČEZ Distribuce, a.s.',
  lines: [
    { description: 'Záloha dle SoD', quantity: 1, unit: 'kpl', unitPriceNet: 100000 },
    { description: 'Doprava', quantity: 2, unit: 'ks', unitPriceNet: 2500 }
  ],
  amountNet: 105000,
  vatRate: 21,
  currency: 'CZK',
  issueDate: new Date(2026, 9, 1),
  taxableDate: new Date(2026, 9, 1),
  dueDate: new Date(2026, 9, 31),
  status: InvoiceStatus.Predano,
  requestedByName: 'Jan Novák',
  requestedByLogin: 'jan',
  note: 'Fakturovat na sídlo zákazníka.'
};

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

describe('buildInvoiceDocument', () => {
  const doc = buildInvoiceDocument(
    invoicePdfData(podklad, 'MASTIROVICE 1', { name: 'ČEZ Distribuce, a.s.', address: 'Teplická 874, Děčín', ico: '24729035' }, firma)
  );
  const text = allText(doc.content);

  it('obsahuje číslo podkladu, projekt, odběratele a položky', () => {
    expect(text).toContain('PODKLAD PRO FAKTURACI č. FP26004');
    expect(text).toContain('Projekt 26001');
    expect(text).toContain('ČEZ Distribuce, a.s.');
    expect(text).toContain('Záloha dle SoD');
  });

  it('má hlavičku firmy, termíny a částky včetně DPH', () => {
    expect(text).toContain(firma.name);
    expect(text).toContain('IČO: 12345678');
    expect(text).toContain('DUZP');
    expect(text).toContain('31. 10. 2026');
    // 100 000 + 2×2 500 = 105 000 bez DPH, DPH 22 050, celkem 127 050
    expect(text.replace(/\s/g, ' ')).toMatch(/127\s050/);
  });

  it('obsahuje poznámku a pole pro číslo faktury z účetnictví', () => {
    expect(text).toContain('Fakturovat na sídlo zákazníka.');
    expect(text).toContain('Číslo faktury');
  });

  it('předaný podklad nemá vodoznak, koncept a storno ano', () => {
    expect(doc.watermark).toBeUndefined();
    expect(invoiceWatermark(InvoiceStatus.Koncept)).toBe('NÁHLED – NEPŘEDÁNO');
    expect(invoiceWatermark(InvoiceStatus.KeKontrole)).toBe('NÁHLED – NEPŘEDÁNO');
    expect(invoiceWatermark(InvoiceStatus.Storno)).toBe('STORNO');
    expect(invoiceWatermark(InvoiceStatus.Uhrazeno)).toBeUndefined();
  });

  it('název souboru je bez nepovolených znaků', () => {
    expect(invoicePdfFileName('FP26004')).toBe('FP26004.pdf');
    expect(invoicePdfFileName('FP 26/004')).toBe('FP_26_004.pdf');
  });
});

describe('zálohová faktura', () => {
  const zaloha: InvoiceBasis = { ...podklad, kind: InvoiceKind.Zaloha };
  const text = allText(buildInvoiceDocument(invoicePdfData(zaloha, 'MASTIROVICE 1', { name: 'ČEZ Distribuce, a.s.' }, firma)).content);

  it('nadpis je „Podklad pro zálohovou fakturu“ a záloha nemá DUZP', () => {
    expect(text).toContain('PODKLAD PRO ZÁLOHOVOU FAKTURU č. FP26004');
    expect(text).not.toContain('DUZP');
    expect(text).toContain('Splatnost');
  });

  it('objednatel se ukáže jen když se liší od odběratele', () => {
    const t1 = allText(buildInvoiceDocument(invoicePdfData(podklad, 'X', { name: 'Odběratel s.r.o.' }, firma, undefined, { name: 'Objednatel a.s.', ico: '12345678' })).content);
    expect(t1).toContain('OBJEDNATEL');
    expect(t1).toContain('Objednatel a.s.');
    expect(t1).toContain('IČO: 12345678');
    const t2 = allText(buildInvoiceDocument(invoicePdfData(podklad, 'X', { name: 'Stejný s.r.o.' }, firma, undefined, { name: 'Stejný s.r.o.' })).content);
    expect(t2).not.toContain('OBJEDNATEL');
    expect(allText(buildInvoiceDocument(invoicePdfData(podklad, 'X', { name: 'Z' }, firma)).content)).not.toContain('OBJEDNATEL');
  });

  it('běžný podklad (i starší bez druhu) zůstává „Podklad pro fakturaci“ s DUZP', () => {
    const beze = allText(buildInvoiceDocument(invoicePdfData(podklad, 'X', { name: 'Z' }, firma)).content);
    expect(beze).toContain('PODKLAD PRO FAKTURACI č. FP26004');
    expect(beze).toContain('DUZP');
    expect(invoiceKindOf(podklad)).toBe(InvoiceKind.Faktura);
    expect(invoiceKindOf({ kind: InvoiceKind.Zaloha })).toBe(InvoiceKind.Zaloha);
  });
});

describe('podpis na podkladu', () => {
  const marks = [{ label: 'Vystavil', name: 'Jan Novák', at: new Date(2026, 9, 1, 10, 30) }];

  it('ostrý (předaný) podklad má podpisové pole se značkou „Elektronicky podepsáno“', () => {
    const text = allText(buildInvoiceDocument(invoicePdfData(podklad, 'X', { name: 'Z' }, firma, marks)).content);
    expect(text).toContain('Elektronicky podepsáno');
    expect(text).toContain('Jan Novák');
  });

  it('koncept s vodoznakem se nepodepisuje', () => {
    const koncept = { ...podklad, status: InvoiceStatus.Koncept };
    const text = allText(buildInvoiceDocument(invoicePdfData(koncept, 'X', { name: 'Z' }, firma, marks)).content);
    expect(text).not.toContain('Elektronicky podepsáno');
  });

  it('bez podpisů se pole nevykreslí', () => {
    expect(allText(buildInvoiceDocument(invoicePdfData(podklad, 'X', { name: 'Z' }, firma)).content)).not.toContain('Elektronicky');
  });
});
