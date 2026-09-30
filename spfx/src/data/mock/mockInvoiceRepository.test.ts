import { createMockRepositories } from './mockRepositories';
import { CurrentUser, Role } from '../../core/types';
import { InvoiceStatus } from '../../core/invoiceBases';
import { InvoiceInput } from '../repositories';
import { MOCK_USER } from './mockData';

function uzivatel(login: string, name: string, roles: Role[]): CurrentUser {
  return { ...MOCK_USER, id: Math.floor(Math.random() * 1000) + 100, loginName: `i:0#.f|membership|${login}@revoltum.cz`, displayName: name, roles };
}

const igor = { ...MOCK_USER } as CurrentUser; // administrátor, vedení, finance, PM
const jan = uzivatel('jan.novak', 'Jan Novák', [Role.ProjektovyManazer]); // PM projektu 25003
const martin = uzivatel('martin.svoboda', 'Martin Svoboda', [Role.AsistentPM]); // asistent projektů 25002 a 25003
const cizi = uzivatel('cizi', 'Cizí PM', [Role.ProjektovyManazer]);
const financni = uzivatel('fin', 'Filip Finance', [Role.Finance]);

const vstup = (extra: Partial<InvoiceInput> = {}): InvoiceInput => ({
  projectNumber: '25003',
  customerName: 'Teplárna Chotěboř a.s.',
  lines: [{ description: 'Dílčí plnění', quantity: 1, unitPriceNet: 100000 }],
  vatRate: 21,
  currency: 'CZK',
  issueDate: new Date(2026, 9, 1),
  dueDate: new Date(2026, 9, 31),
  ...extra
});

describe('MockInvoiceRepository — zakládání a čísla', () => {
  it('nový podklad je koncept, dostane další číslo FP a spočítanou částku', async () => {
    const r = createMockRepositories();
    const i = await r.invoices.create(vstup(), jan);
    expect(i.status).toBe(InvoiceStatus.Koncept);
    expect(i.number).toBe('FP26004');
    expect(i.amountNet).toBe(100000);
    expect(i.requestedByLogin).toBe(jan.loginName);
  });

  it('čísla jdou po sobě bez duplicit', async () => {
    const r = createMockRepositories();
    const a = await r.invoices.create(vstup(), jan);
    const b = await r.invoices.create(vstup(), jan);
    expect(a.number).not.toBe(b.number);
  });

  it('neúplný koncept se neuloží a číslo se nespotřebuje', async () => {
    const r = createMockRepositories();
    await expect(r.invoices.create(vstup({ projectNumber: '' }), jan)).rejects.toThrow(/nebyl nalezen/);
    expect((await r.invoices.create(vstup(), jan)).number).toBe('FP26004');
  });

  it('cizí PM a čtenář nezaloží; na Režii se nefakturuje', async () => {
    const r = createMockRepositories();
    await expect(r.invoices.create(vstup(), cizi)).rejects.toThrow(/oprávnění/);
    await expect(r.invoices.create(vstup({ projectNumber: '26999' }), igor)).rejects.toThrow(/oprávnění/);
  });
});

describe('MockInvoiceRepository — cesta podkladu', () => {
  it('asistent: koncept → ke kontrole → PM předá účtárně → finance doplní fakturu → úhrada; historie to zná', async () => {
    const r = createMockRepositories();
    const i = await r.invoices.create(vstup(), martin);
    await expect(r.invoices.handOver(i.id, martin)).rejects.toThrow(/zkontrolovat/);
    expect((await r.invoices.submit(i.id, martin)).status).toBe(InvoiceStatus.KeKontrole);
    const predano = await r.invoices.handOver(i.id, jan, { sentTo: 'ucetni@res.cz', pdfUrl: 'https://x/FP.pdf' });
    expect(predano.status).toBe(InvoiceStatus.Predano);
    expect(predano.pdfUrl).toBe('https://x/FP.pdf');
    const vyf = await r.invoices.markInvoiced(i.id, '2026-0500', financni);
    expect(vyf.accountingInvoiceNo).toBe('2026-0500');
    const uhr = await r.invoices.markPaid(i.id, new Date(2026, 10, 5), financni);
    expect(uhr.status).toBe(InvoiceStatus.Uhrazeno);
    const h = await r.invoices.history(i.id);
    expect(h.map((x) => x.action)).toEqual([
      'Založen podklad',
      'Předáno ke kontrole',
      'Předáno účtárně (ucetni@res.cz)',
      'Vyfakturováno, faktura 2026-0500',
      'Uhrazeno'
    ]);
  });

  it('PM předá vlastní podklad účtárně rovnou; vrácení ke kontrole vyžaduje komentář od kontrolora', async () => {
    const r = createMockRepositories();
    const i = await r.invoices.create(vstup(), martin);
    await r.invoices.submit(i.id, martin);
    await expect(r.invoices.returnToDraft(i.id, ' ', jan)).rejects.toThrow(/opravit/);
    expect((await r.invoices.returnToDraft(i.id, 'Chybí DUZP', jan)).status).toBe(InvoiceStatus.Koncept);
    const vlastni = await r.invoices.create(vstup(), jan);
    expect((await r.invoices.handOver(vlastni.id, jan)).status).toBe(InvoiceStatus.Predano);
  });

  it('podklad bez zákazníka nejde předat', async () => {
    const r = createMockRepositories();
    const i = await r.invoices.create(vstup({ customerName: undefined }), jan);
    await expect(r.invoices.handOver(i.id, jan)).rejects.toThrow(/zákazníka/);
  });

  it('upravit jde jen koncept', async () => {
    const r = createMockRepositories();
    const i = await r.invoices.create(vstup(), martin);
    const u = await r.invoices.update(i.id, vstup({ note: 'Poznámka' }), martin);
    expect(u.note).toBe('Poznámka');
    await r.invoices.submit(i.id, martin);
    await expect(r.invoices.update(i.id, vstup(), martin)).rejects.toThrow(/nejde upravovat/);
  });

  it('opakované předání účtárně nemění stav; storno chce důvod; smazat smí jen administrátor', async () => {
    const r = createMockRepositories();
    const i = await r.invoices.create(vstup(), jan);
    await r.invoices.handOver(i.id, jan, { sentTo: 'a@b.cz' });
    const znovu = await r.invoices.resend(i.id, jan, { sentTo: 'jina@b.cz' });
    expect(znovu.status).toBe(InvoiceStatus.Predano);
    await expect(r.invoices.cancel(i.id, ' ', jan)).rejects.toThrow(/důvod/);
    expect((await r.invoices.cancel(i.id, 'Chyba', jan)).status).toBe(InvoiceStatus.Storno);
    await expect(r.invoices.delete(i.id, jan)).rejects.toThrow(/administrátor/);
    await r.invoices.delete(i.id, igor);
    expect(await r.invoices.getById(i.id)).toBeUndefined();
  });

  it('seznam jde filtrovat podle projektu, stavu a textu', async () => {
    const r = createMockRepositories();
    expect((await r.invoices.list({ projectNumber: '25001' })).map((x) => x.number)).toEqual(['FP26001']);
    expect((await r.invoices.list({ statuses: [InvoiceStatus.KeKontrole] })).map((x) => x.number)).toEqual(['FP26002']);
    expect((await r.invoices.list({ search: '2026-0412' })).map((x) => x.number)).toEqual(['FP26001']);
  });
});
