import { AbraDoc } from './abraDocs';
import { parseJournalXml, parseXml, planJournalImport } from './abraJournalImport';

// Tvar odpovídá ručnímu exportu Flexi (13. 10. 2026); texty a částky jsou vymyšlené.
const entry = (id: string, md: string, dal: string, extra: { project?: string; tuz?: string; men?: string; mena?: string; popis?: string; firma?: string } = {}): string => `
  <ucetni-denik>
    <!-- komentář -->
    <idUcetniDenik>${id}</idUcetniDenik>
    <datVyst>2026-09-15</datVyst>
    <doklad>FP-${id}</doklad>
    <mdUcet evidencePath="ucet" showAs="${md}: Účet" ref="/v2/ucet/1.xml">
      <ucet><id>1</id><kod>${md}</kod></ucet>
    </mdUcet>
    <dalUcet evidencePath="ucet" showAs="${dal}: Účet"><ucet><kod>${dal}</kod></ucet></dalUcet>
    <mena evidencePath="mena" showAs="${extra.mena || 'CZK'}: Měna"><mena><kod>${extra.mena || 'CZK'}</kod></mena></mena>
    <zakazka evidencePath="zakazka" showAs="${extra.project || ''}: x">${extra.project ? `code:${extra.project}` : ''}</zakazka>
    <firma evidencePath="adresar" showAs="MEM: Memodo &amp; syn s.r.o.">code:MEM</firma>
    <nazFirmy></nazFirmy>
    <popis>${extra.popis || 'Střídač &lt;100 kW&gt;'}</popis>
    <sumTuz>${extra.tuz || '1000.0'}</sumTuz>
    <sumMen>${extra.men || '0.0'}</sumMen>
  </ucetni-denik>`;

const wrap = (...entries: string[]): string => `<?xml version="1.0" encoding="utf-8"?>\n<winstrom version="1.0" source="FlexiBee">\n  <!-- Účetní deník -->${entries.join('')}\n</winstrom>`;

describe('čtečka XML', () => {
  it('prvky, atributy, entity, komentáře a CDATA', () => {
    const t = parseXml('<?xml version="1.0"?><a x="1 &amp; 2"><!-- k --><b>t&lt;u</b><c/><d><![CDATA[<raw>]]></d></a>');
    const a = t.children[0];
    expect(a.attrs.x).toBe('1 & 2');
    expect(a.children.map((c) => c.name)).toEqual(['b', 'c', 'd']);
    expect(a.children[0].text).toBe('t<u');
    expect(a.children[2].text).toBe('<raw>');
  });
  it('useknutý soubor a nesedící značky hlásí chybu', () => {
    expect(() => parseXml('<a><b></a>')).toThrow();
    expect(() => parseXml('<a><b>')).toThrow();
  });
});

describe('import účetního deníku z XML', () => {
  it('náklad na MD, výnos na DAL, storno a dobropis se znaménkem; ostatní se nepřenáší', () => {
    const r = parseJournalXml(wrap(entry('1', '501001', '321001', { project: '26001' }), entry('2', '321001', '501001', { project: '26001', tuz: '200.0' }), entry('3', '311001', '602001', { project: '26001', tuz: '5000.0' }), entry('4', '602001', '311001', { project: '26001', tuz: '300.0' }), entry('5', '221001', '321001', { project: '26001' })));
    expect(r.entries).toBe(5);
    expect(r.rows.map((x) => [x.abraId, x.type, x.amountNet])).toEqual([
      ['ucetni-denik:1', 'prijata', 1000],
      ['ucetni-denik:2', 'prijata', -200],
      ['ucetni-denik:3', 'vydana', 5000],
      ['ucetni-denik:4', 'vydana', -300]
    ]);
    expect(r.rows[0]).toMatchObject({ number: 'FP-1', partnerName: 'Memodo & syn s.r.o.', description: 'Střídač <100 kW>', projectNumber: '26001', accounts: ['501001'] });
  });

  it('zápis s nákladem na obou stranách dá dva řádky s příponou #1 a #2', () => {
    const r = parseJournalXml(wrap(entry('7', '518001', '501001', { project: '26002', tuz: '50.0' })));
    expect(r.rows.map((x) => [x.abraId, x.amountNet])).toEqual([
      ['ucetni-denik:7#1', 50],
      ['ucetni-denik:7#2', -50]
    ]);
  });

  it('cizí měna: částka v měně dokladu a zaúčtovaná v Kč', () => {
    const r = parseJournalXml(wrap(entry('8', '501001', '321001', { project: '26001', mena: 'EUR', tuz: '24680.0', men: '1000.0' })));
    expect(r.rows[0]).toMatchObject({ currency: 'EUR', amountNet: 1000, amountNetCzk: 24680 });
  });

  it('bez zakázky, špatné číslo zakázky a bez částky se přeskočí a spočítá', () => {
    const r = parseJournalXml(wrap(entry('1', '501001', '321001'), entry('2', '501001', '321001', { project: '26999X' }), entry('3', '501001', '321001', { project: '26001', tuz: 'abc' })));
    expect(r.rows).toHaveLength(0);
    expect(r.skipped).toEqual({ 'bez-zakazky': 1, 'zakazka-neodpovida': 1, 'bez-id': 0, 'bez-castky': 1 });
  });

  it('soubor, který není export Flexi, nebo bez zápisů, hlásí chybu', () => {
    expect(() => parseJournalXml('<html></html>')).toThrow(/winstrom/);
    expect(() => parseJournalXml(wrap())).toThrow(/žádné zápisy/);
  });
});

describe('náhled importu nad stávajícími řádky', () => {
  const base = (abraId: string, project: string, amount: number): AbraDoc => ({ id: 1, abraId, type: 'prijata', number: `FP-${abraId.split(':')[1]}`, projectNumber: project, partnerName: 'Memodo & syn s.r.o.', description: 'Střídač <100 kW>', issueDate: new Date('2026-09-15T12:00:00.000Z'), currency: 'CZK', amountNet: amount, accounts: ['501001'] });
  const rows = parseJournalXml(wrap(entry('1', '501001', '321001', { project: '26001' }), entry('2', '501001', '321001', { project: '26002' }), entry('3', '501001', '321001', { project: '26001', tuz: '700.0' }))).rows;

  it('přidá nové, změněné opraví, shodné nechá; přesun do jiného projektu pozná; co v souboru chybí, se nedotkne', () => {
    const plan = planJournalImport(rows, [base('ucetni-denik:1', '26001', 1000), base('ucetni-denik:2', '26001', 1000), base('ucetni-denik:99', '26001', 5)]);
    expect(plan.toAdd.map((r) => r.abraId)).toEqual(['ucetni-denik:3']);
    expect(plan.unchanged).toBe(1);
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0]).toMatchObject({ movedFrom: '26001' });
    expect(plan.toUpdate[0].row.projectNumber).toBe('26002');
    expect(plan.notInFile).toBe(1);
    expect(plan.totals).toEqual([
      { projectNumber: '26001', lines: 2, cost: 1700, revenue: 0 },
      { projectNumber: '26002', lines: 1, cost: 1000, revenue: 0 }
    ]);
  });

  it('opakovaný import téhož souboru nic nemění', () => {
    const existing = rows.map((r, i) => ({ ...base(r.abraId, r.projectNumber, r.amountNet), id: i + 1 }));
    const plan = planJournalImport(rows, existing);
    expect(plan.toAdd).toHaveLength(0);
    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.unchanged).toBe(3);
  });
});
