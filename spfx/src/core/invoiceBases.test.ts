import {
  InvoiceBasis,
  InvoiceDraft,
  InvoiceStatus,
  dueDateFrom,
  filterInvoices,
  highestInvoiceSequence,
  invoiceTotals,
  isOverdue,
  paymentDays,
  sortInvoices,
  sortInvoicesNewestFirst,
  validateInvoiceDraft
} from './invoiceBases';

const inv = (id: number, extra: Partial<InvoiceBasis> = {}): InvoiceBasis => ({
  id,
  number: `FP26${100 + id}`,
  projectNumber: '26001',
  lines: [{ description: 'Dílčí plnění', quantity: 1, unitPriceNet: 100000 }],
  amountNet: 100000,
  vatRate: 21,
  currency: 'CZK',
  issueDate: new Date(2026, 8, 10),
  dueDate: new Date(2026, 9, 10),
  status: InvoiceStatus.Koncept,
  requestedByName: 'Jan',
  requestedByLogin: 'jan',
  ...extra
});

const draft = (extra: Partial<InvoiceDraft> = {}): InvoiceDraft => ({
  projectNumber: '26001',
  customerName: 'ČEZ Distribuce',
  lines: [{ description: 'Dílčí plnění', quantity: 1, unitPriceNet: 100000 }],
  vatRate: 21,
  currency: 'CZK',
  issueDate: new Date(2026, 8, 10),
  dueDate: new Date(2026, 9, 10),
  ...extra
});

describe('validateInvoiceDraft', () => {
  it('úplný podklad projde i v přísném režimu', () => {
    expect(validateInvoiceDraft(draft(), true)).toEqual([]);
  });
  it('koncept potřebuje jen projekt', () => {
    expect(validateInvoiceDraft(draft({ projectNumber: '', customerName: undefined, lines: [] }), false).map((i) => i.field)).toEqual([
      'projectNumber'
    ]);
  });
  it('před předáním chybí zákazník, položky i termíny', () => {
    const f = validateInvoiceDraft(draft({ customerName: '', lines: [], issueDate: undefined, dueDate: undefined }), true).map((i) => i.field);
    expect(f).toEqual(expect.arrayContaining(['customer', 'lines', 'issueDate', 'dueDate']));
  });
  it('splatnost před vystavením se odmítne', () => {
    const f = validateInvoiceDraft(draft({ dueDate: new Date(2026, 8, 1) }), false);
    expect(f.map((i) => i.field)).toContain('dueDate');
  });
  it('nulové množství a záporná cena jsou chyba; nulová celková částka také', () => {
    expect(validateInvoiceDraft(draft({ lines: [{ description: 'x', quantity: 0, unitPriceNet: 10 }] }), true).length).toBeGreaterThan(0);
    expect(validateInvoiceDraft(draft({ lines: [{ description: 'x', quantity: 1, unitPriceNet: -5 }] }), true).length).toBeGreaterThan(0);
    expect(validateInvoiceDraft(draft({ lines: [{ description: 'x', quantity: 1, unitPriceNet: 0 }] }), true).map((i) => i.message).join(' ')).toMatch(/větší než nula/);
  });
  it('neznámá měna a nesmyslné DPH', () => {
    expect(validateInvoiceDraft(draft({ currency: 'GBP' }), false).map((i) => i.field)).toContain('currency');
    expect(validateInvoiceDraft(draft({ vatRate: 150 }), false).map((i) => i.field)).toContain('vatRate');
  });
});

describe('částky a data', () => {
  it('součty po řádcích a DPH', () => {
    expect(invoiceTotals([{ description: 'a', quantity: 2, unitPriceNet: 1000 }], 21)).toEqual({ net: 2000, vat: 420, gross: 2420 });
  });
  it('splatnost = vystavení + dny a zpět', () => {
    const d = dueDateFrom(new Date(2026, 8, 25), 14);
    expect(d).toEqual(new Date(2026, 9, 9));
    expect(paymentDays(new Date(2026, 8, 25), d)).toBe(14);
    expect(paymentDays(undefined, d)).toBeUndefined();
  });
});

describe('filtr, řazení, po splatnosti', () => {
  const list = [
    inv(1, { issueDate: new Date(2026, 8, 1), customerName: 'Beta', status: InvoiceStatus.Predano }),
    inv(2, { issueDate: new Date(2026, 8, 20), customerName: 'Alfa', accountingInvoiceNo: '2026123' }),
    inv(3, { issueDate: undefined, customerName: 'Čeněk' })
  ];
  it('fulltext najde číslo faktury z účetnictví a zákazníka', () => {
    expect(filterInvoices(list, { search: '2026123' }).map((i) => i.id)).toEqual([2]);
    expect(filterInvoices(list, { search: 'beta' }).map((i) => i.id)).toEqual([1]);
  });
  it('filtr stavů a data vystavení včetně krajních dnů', () => {
    expect(filterInvoices(list, { statuses: [InvoiceStatus.Predano] }).map((i) => i.id)).toEqual([1]);
    expect(filterInvoices(list, { issuedFrom: new Date(2026, 8, 1), issuedTo: new Date(2026, 8, 20) }).map((i) => i.id)).toEqual([1, 2]);
  });
  it('nejnovější číslo první; řazení podle zákazníka česky a podle data s prázdnými na konci', () => {
    expect(sortInvoicesNewestFirst(list).map((i) => i.id)).toEqual([3, 2, 1]);
    expect(sortInvoices(list, 'customer', false).map((i) => i.customerName)).toEqual(['Alfa', 'Beta', 'Čeněk']);
    expect(sortInvoices(list, 'issued', false).map((i) => i.id)).toEqual([1, 2, 3]);
  });
  it('po splatnosti jen předaný nebo vyfakturovaný podklad', () => {
    const now = new Date(2026, 10, 1);
    expect(isOverdue(inv(1, { status: InvoiceStatus.Predano }), now)).toBe(true);
    expect(isOverdue(inv(1, { status: InvoiceStatus.Uhrazeno }), now)).toBe(false);
    expect(isOverdue(inv(1, { status: InvoiceStatus.Koncept }), now)).toBe(false);
    expect(isOverdue(inv(1, { status: InvoiceStatus.Predano }), new Date(2026, 9, 10))).toBe(false);
  });
});

describe('highestInvoiceSequence', () => {
  it('bere nejvyšší pořadí jen z daného roku a správného tvaru', () => {
    expect(highestInvoiceSequence(['FP26001', 'FP26011', 'FP25099', 'xyz', 'FP26'], 2026)).toBe(11);
    expect(highestInvoiceSequence([], 2026)).toBe(0);
  });
});
