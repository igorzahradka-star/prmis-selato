import { buildFieldXml, escapeXml } from './fieldXml';
import { FieldDef } from '../schema';
import { LISTS } from '../schema';

describe('escapeXml', () => {
  it('ošetří ampersand v názvu firmy', () => {
    expect(escapeXml('Revoltum Engineering & Services')).toBe(
      'Revoltum Engineering &amp; Services'
    );
  });

  it('ošetří lomené závorky a uvozovky', () => {
    expect(escapeXml('<a href="x">')).toBe('&lt;a href=&quot;x&quot;&gt;');
  });
});

describe('buildFieldXml', () => {
  it('u textového sloupce zachová anglický interní název a český zobrazovaný', () => {
    const f: FieldDef = { name: 'ProjectNumber', title: 'Číslo projektu', type: 'Text', required: true, indexed: true };
    const xml = buildFieldXml(f);
    expect(xml).toContain('Name="ProjectNumber"');
    expect(xml).toContain('StaticName="ProjectNumber"');
    expect(xml).toContain('DisplayName="Číslo projektu"');
    expect(xml).toContain('Required="TRUE"');
    expect(xml).toContain('Indexed="TRUE"');
  });

  it('nepovinný neindexovaný sloupec nemá odpovídající atributy', () => {
    const xml = buildFieldXml({ name: 'Note', title: 'Poznámka', type: 'Text' });
    expect(xml).not.toContain('Required=');
    expect(xml).not.toContain('Indexed=');
  });

  it('měnový sloupec má českou lokalizaci a desetinná místa', () => {
    const xml = buildFieldXml({ name: 'AmountNet', title: 'Částka bez DPH', type: 'Currency', decimals: 2 });
    expect(xml).toContain('LCID="1029"');
    expect(xml).toContain('Decimals="2"');
  });

  it('datum je bez času — kvůli časovým pásmům', () => {
    const xml = buildFieldXml({ name: 'StartDate', title: 'Zahájení', type: 'DateTime' });
    expect(xml).toContain('Format="DateOnly"');
  });

  it('výběrový sloupec vypíše všechny volby a výchozí hodnotu', () => {
    const xml = buildFieldXml({
      name: 'ProjectStatus',
      title: 'Stav',
      type: 'Choice',
      choices: ['Nabídka', 'Realizace'],
      defaultValue: 'Nabídka'
    });
    expect(xml).toContain('<CHOICE>Nabídka</CHOICE>');
    expect(xml).toContain('<CHOICE>Realizace</CHOICE>');
    expect(xml).toContain('<Default>Nabídka</Default>');
  });

  it('výběrový sloupec nedovolí uživateli dopsat vlastní hodnotu', () => {
    const xml = buildFieldXml({ name: 'X', title: 'X', type: 'Choice', choices: ['A'] });
    expect(xml).toContain('FillInChoice="FALSE"');
  });

  it('ampersand ve volbě nerozbije XML', () => {
    const xml = buildFieldXml({ name: 'X', title: 'X', type: 'Choice', choices: ['Subdodávky & služby'] });
    expect(xml).toContain('<CHOICE>Subdodávky &amp; služby</CHOICE>');
  });

  it('lookup vyžaduje ID cílového seznamu', () => {
    const f: FieldDef = { name: 'Project', title: 'Projekt', type: 'Lookup', lookupList: 'PRM_Projects', lookupField: 'ProjectNumber' };
    expect(() => buildFieldXml(f)).toThrow(/PRM_Projects/);
  });

  it('lookup se správným ID ukazuje na zvolený sloupec', () => {
    const f: FieldDef = { name: 'Project', title: 'Projekt', type: 'Lookup', lookupList: 'PRM_Projects', lookupField: 'ProjectNumber' };
    const xml = buildFieldXml(f, '{11111111-2222-3333-4444-555555555555}');
    expect(xml).toContain('List="{11111111-2222-3333-4444-555555555555}"');
    expect(xml).toContain('ShowField="ProjectNumber"');
  });

  it('sloupec s osobou nedovolí vybrat skupinu', () => {
    const xml = buildFieldXml({ name: 'ProjectManager', title: 'Projektový manažer', type: 'User' });
    expect(xml).toContain('UserSelectionMode="PeopleOnly"');
  });

  it('popis sloupce se vloží jako Description', () => {
    const xml = buildFieldXml({ name: 'X', title: 'X', type: 'Text', description: 'Vysvětlení pro uživatele' });
    expect(xml).toContain('<Description>Vysvětlení pro uživatele</Description>');
  });
});

describe('celé schéma jde převést na XML', () => {
  it('žádný sloupec v schema.ts nezpůsobí chybu', () => {
    LISTS.forEach((list) => {
      list.fields.forEach((field) => {
        const fakeId = field.type === 'Lookup' ? '{00000000-0000-0000-0000-000000000000}' : undefined;
        expect(() => buildFieldXml(field, fakeId)).not.toThrow();
      });
    });
  });

  it('výsledné XML je vždy jeden uzavřený element Field', () => {
    LISTS.forEach((list) => {
      list.fields.forEach((field) => {
        const fakeId = field.type === 'Lookup' ? '{00000000-0000-0000-0000-000000000000}' : undefined;
        const xml = buildFieldXml(field, fakeId);
        expect(xml.indexOf('<Field ')).toBe(0);
        expect(xml.substring(xml.length - 8)).toBe('</Field>');
      });
    });
  });
});
