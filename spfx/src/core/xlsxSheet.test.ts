import { columnIndex, decodeXml, listSheets, parseSharedStrings, parseSheetRows, pickSheet } from './xlsxSheet';

describe('decodeXml', () => {
  it('převede entity', () => {
    expect(decodeXml('A &amp; B &lt;x&gt; &quot;q&quot; &apos;a&apos; &#269;&#x161;')).toBe('A & B <x> "q" \'a\' čš');
  });
});

describe('columnIndex', () => {
  it('písmena sloupce na index', () => {
    expect(columnIndex('A1')).toBe(0);
    expect(columnIndex('H425')).toBe(7);
    expect(columnIndex('Z9')).toBe(25);
    expect(columnIndex('AA3')).toBe(26);
  });
});

describe('parseSharedStrings', () => {
  it('čte prosté i formátované texty, bez fonetiky', () => {
    const xml =
      '<sst><si><t>Název</t></si><si><t xml:space="preserve"> s mezerou </t></si>' +
      '<si><r><rPr><b/></rPr><t>Tuč</t></r><r><t>ně</t></r><rPh><t>X</t></rPh></si><si/><si><t/></si></sst>';
    expect(parseSharedStrings(xml)).toEqual(['Název', ' s mezerou ', 'Tučně', '', '']);
    expect(parseSharedStrings(undefined)).toEqual([]);
  });
});

describe('parseSheetRows', () => {
  it('sdílené texty, čísla, vložené texty, prázdné buňky a řádky', () => {
    const shared = ['Název', 'IČO', 'Firma & syn'];
    const xml =
      '<worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>6859101</v></c><c r="D2" t="inlineStr"><is><t>vloženo</t></is></c></row>' +
      '<row r="3"/>' +
      '<row r="4"><c r="A4" s="1"/><c r="B4" t="str"><f>A1</f><v>Název</v></c><c r="C4" t="b"><v>1</v></c></row>' +
      '</sheetData></worksheet>';
    expect(parseSheetRows(xml, shared)).toEqual([
      ['Název', 'IČO'],
      ['Firma & syn', '6859101', '', 'vloženo'],
      [],
      ['', 'Název', 'TRUE']
    ]);
  });
  it('buňky bez odkazu jdou po sobě', () => {
    expect(parseSheetRows('<row><c t="inlineStr"><is><t>a</t></is></c><c><v>2</v></c></row>', [])).toEqual([['a', '2']]);
  });
});

describe('listSheets a pickSheet', () => {
  const workbook =
    '<workbook><sheets><sheet name="Návod" sheetId="1" r:id="rId1"/><sheet name="Import" sheetId="2" r:id="rId2"/></sheets></workbook>';
  const rels =
    '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="x" Target="/xl/worksheets/sheet2.xml"/><Relationship Id="rId3" Type="y" Target="styles.xml"/></Relationships>';
  it('najde listy a jejich soubory', () => {
    expect(listSheets(workbook, rels)).toEqual([
      { name: 'Návod', path: 'xl/worksheets/sheet1.xml' },
      { name: 'Import', path: 'xl/worksheets/sheet2.xml' }
    ]);
  });
  it('vybere list podle názvu, jinak první', () => {
    const sheets = listSheets(workbook, rels);
    expect(pickSheet(sheets, 'import')?.path).toBe('xl/worksheets/sheet2.xml');
    expect(pickSheet(sheets, 'Neexistuje')?.name).toBe('Návod');
    expect(pickSheet([], 'Import')).toBeUndefined();
  });
});
