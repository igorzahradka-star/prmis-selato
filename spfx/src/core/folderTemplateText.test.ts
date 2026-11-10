import { templateToText, textToTemplate } from './folderTemplateText';
import { DEFAULT_FOLDER_TEMPLATE, FolderTemplateNode } from './settings';

describe('textToTemplate / templateToText', () => {
  const selato: FolderTemplateNode[] = [
    {
      name: 'A_Projektový management',
      children: [
        { name: '_Předávací dokumenty' },
        {
          name: '_Smluvní dokumenty',
          children: [{ name: '_Nabídka' }, { name: '_Objednávka' }, { name: '_Smlouva' }]
        }
      ]
    },
    { name: 'C_Foto' }
  ];

  const selatoText = [
    'A_Projektový management',
    '  _Předávací dokumenty',
    '  _Smluvní dokumenty',
    '    _Nabídka',
    '    _Objednávka',
    '    _Smlouva',
    'C_Foto'
  ].join('\n');

  test('tři úrovně: text → strom', () => {
    expect(textToTemplate(selatoText)).toEqual(selato);
  });

  test('tři úrovně: text → strom → text zůstane stejný', () => {
    expect(templateToText(textToTemplate(selatoText))).toBe(selatoText);
  });

  test('strom → text → strom zůstane stejný (i výchozí šablona)', () => {
    expect(textToTemplate(templateToText(selato))).toEqual(selato);
    expect(textToTemplate(templateToText(DEFAULT_FOLDER_TEMPLATE))).toEqual(DEFAULT_FOLDER_TEMPLATE);
  });

  test('pátá úroveň a návrat o několik úrovní zpět', () => {
    const text = ['A', '  B', '    C', '      D', '        E', '  F', 'G'].join('\n');
    expect(textToTemplate(text)).toEqual([
      { name: 'A', children: [{ name: 'B', children: [{ name: 'C', children: [{ name: 'D', children: [{ name: 'E' }] }] }] }, { name: 'F' }] },
      { name: 'G' }
    ]);
    expect(templateToText(textToTemplate(text))).toBe(text);
  });

  test('přeskočená úroveň se připojí k nejhlubší složce nad ní', () => {
    expect(textToTemplate('A\n      B')).toEqual([{ name: 'A', children: [{ name: 'B' }] }]);
  });

  test('odsazení na prvním řádku nevadí', () => {
    expect(textToTemplate('    A\nB')).toEqual([{ name: 'A' }, { name: 'B' }]);
  });

  test('tabulátor = jedna úroveň, Windows konce řádků, prázdné řádky', () => {
    expect(textToTemplate('A\r\n\tB\r\n\r\n\t\tC\r\n')).toEqual([
      { name: 'A', children: [{ name: 'B', children: [{ name: 'C' }] }] }
    ]);
  });

  test('jedna mezera je podsložka (jako dřív)', () => {
    expect(textToTemplate('A\n B')).toEqual([{ name: 'A', children: [{ name: 'B' }] }]);
  });

  test('prázdný text', () => {
    expect(textToTemplate('')).toEqual([]);
    expect(templateToText([])).toBe('');
  });
});
