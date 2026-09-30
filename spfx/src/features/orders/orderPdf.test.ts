import { buildOrderDocument, orderPdfData, orderPdfFileName, watermarkForStatus } from './orderPdf';
import { OrderStatus, PurchaseOrder } from '../../core/orders';
import { DEFAULT_SETTINGS } from '../../core/settings';

const firma = { ...DEFAULT_SETTINGS.company, ico: '12345678', dic: 'CZ12345678' };

const objednavka: PurchaseOrder = {
  id: 1,
  orderNumber: 'OBJ-2026-0005',
  projectNumber: '26001',
  supplierName: 'BELTEC s.r.o.',
  subject: 'Projekt a staněk',
  lines: [
    { description: 'Projekt', quantity: 1, unit: 'ks', unitPriceNet: 52000 },
    { description: 'Staněk', quantity: 1, unit: 'kpl', unitPriceNet: 2300 }
  ],
  amountNet: 54300,
  vatRate: 21,
  currency: 'CZK',
  status: OrderStatus.Schvaleno,
  requestedByName: 'Anna Asistentka',
  requestedByLogin: 'anna',
  approvalChain: [{ level: 'pm', approved: true, byName: 'Petr Manažer', at: new Date(2026, 8, 30) }],
  created: new Date(2026, 8, 29)
};

/** Všechen text z dokumentu na jednu hromadu — stačí na kontrolu, co v PDF je. */
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
    return ['text', 'stack', 'columns', 'table', 'body']
      .map((k) => (k in o ? allText(o[k]) : ''))
      .join(' ');
  }
  return '';
}

describe('buildOrderDocument', () => {
  const doc = buildOrderDocument(
    orderPdfData(objednavka, 'MASTIROVICE 1', { name: 'BELTEC s.r.o.', address: 'Ulice 1, Brno', ico: '11111111' }, firma)
  );
  const text = allText(doc.content);

  it('obsahuje číslo objednávky, projekt, dodavatele a předmět', () => {
    expect(text).toContain('OBJEDNÁVKA č. OBJ-2026-0005');
    expect(text).toContain('Projekt 26001');
    expect(text).toContain('BELTEC s.r.o.');
    expect(text).toContain('Projekt a staněk');
  });

  it('obsahuje hlavičku RES: název firmy, IČO a DIČ', () => {
    expect(text).toContain(firma.name);
    expect(text).toContain('IČO: 12345678');
    expect(text).toContain('DIČ: CZ12345678');
  });

  it('obsahuje všechny položky a součty (54 300 bez DPH, 65 703 s DPH)', () => {
    expect(text).toContain('Staněk');
    const compact = text.replace(/[\s ]/g, '');
    expect(compact).toContain('54300,00Kč');
    expect(compact).toContain('65703,00Kč');
  });

  it('obsahuje schvalovatele se jménem', () => {
    expect(text).toContain('Petr Manažer');
  });

  it('schválená objednávka nemá vodoznak', () => {
    expect(doc.watermark).toBeUndefined();
  });

  it('logo RES je v hlavičce', () => {
    const first = (doc.content as { columns: { image?: string }[] }[])[0];
    expect(first.columns[0].image).toMatch(/^data:image\/png;base64,/);
  });
});

describe('vodoznak podle stavu', () => {
  it('koncept, schvalování a vrácená objednávka jsou „NÁHLED – NESCHVÁLENO"', () => {
    [OrderStatus.Koncept, OrderStatus.KeSchvaleni, OrderStatus.VracenoKUprave].forEach((s) => {
      expect(watermarkForStatus(s)).toBe('NÁHLED – NESCHVÁLENO');
    });
  });

  it('schválená a dále posunutá objednávka je bez vodoznaku', () => {
    [OrderStatus.Schvaleno, OrderStatus.Odeslano, OrderStatus.Dodano, OrderStatus.Uzavreno].forEach((s) => {
      expect(watermarkForStatus(s)).toBeUndefined();
    });
  });

  it('storno a zamítnutí mají vlastní vodoznak', () => {
    expect(watermarkForStatus(OrderStatus.Storno)).toBe('STORNO');
    expect(watermarkForStatus(OrderStatus.Zamitnuto)).toBe('ZAMÍTNUTO');
  });

  it('neschválená objednávka dostane vodoznak i do dokumentu', () => {
    const doc = buildOrderDocument(
      orderPdfData({ ...objednavka, status: OrderStatus.Koncept, approvalChain: [] }, '', { name: 'X' }, firma)
    );
    expect(doc.watermark).toBeDefined();
    expect(allText(doc.content)).toContain('zatím není schválená');
  });
});

describe('orderPdfData', () => {
  it('automaticky schválený krok uvede vystavitele, ne prázdné jméno', () => {
    const d = orderPdfData(
      { ...objednavka, approvalChain: [{ level: 'pm', approved: true, auto: true }] },
      '',
      { name: 'X' },
      firma
    );
    expect(d.approvals[0].name).toContain('Anna Asistentka');
  });

  it('nevyřízené kroky se v PDF neuvádějí jako schválené', () => {
    const d = orderPdfData(
      { ...objednavka, approvalChain: [{ level: 'pm', approved: true, byName: 'Petr' }, { level: 'vedeni', approved: false }] },
      '',
      { name: 'X' },
      firma
    );
    expect(d.approvals).toHaveLength(1);
  });
});

describe('orderPdfFileName', () => {
  it('z čísla objednávky udělá bezpečný název souboru', () => {
    expect(orderPdfFileName('OBJ-2026-0005')).toBe('OBJ-2026-0005.pdf');
    expect(orderPdfFileName('OBJ/2026:5')).toBe('OBJ_2026_5.pdf');
  });
});
