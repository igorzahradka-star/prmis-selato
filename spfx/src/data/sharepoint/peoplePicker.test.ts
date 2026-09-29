import { peoplePickerQuery, parsePeoplePickerResults } from './peoplePicker';

describe('peoplePickerQuery', () => {
  it('předá hledaný text', () => {
    const q = peoplePickerQuery('novák') as { queryParams: { QueryString: string } };
    expect(q.queryParams.QueryString).toBe('novák');
  });

  it('hledá jen uživatele, ne skupiny', () => {
    const q = peoplePickerQuery('novák') as { queryParams: { PrincipalType: number } };
    expect(q.queryParams.PrincipalType).toBe(1);
  });

  it('hledá i v adresáři firmy, ne jen mezi uživateli webu', () => {
    const q = peoplePickerQuery('novák') as { queryParams: { PrincipalSource: number } };
    expect(q.queryParams.PrincipalSource).toBe(15);
  });

  it('respektuje zadaný počet výsledků', () => {
    const q = peoplePickerQuery('novák', 5) as { queryParams: { MaximumEntitySuggestions: number } };
    expect(q.queryParams.MaximumEntitySuggestions).toBe(5);
  });

  // Obojí zjištěno až na ostrém tenantu: endpoint vracel HTTP 400.
  it('neposílá __metadata — s hlavičkou OData 4.0 od SPHttpClient se tluče', () => {
    const q = peoplePickerQuery('novák') as { queryParams: Record<string, unknown> };
    expect('__metadata' in q.queryParams).toBe(false);
  });

  it('posílá SharePointGroupID — bez něj endpoint požadavek odmítne', () => {
    const q = peoplePickerQuery('novák') as { queryParams: { SharePointGroupID: number } };
    expect(q.queryParams.SharePointGroupID).toBe(0);
  });
});

describe('parsePeoplePickerResults', () => {
  function odpoved(entities: unknown[]): object {
    return { d: { ClientPeoplePickerSearchUser: JSON.stringify(entities) } };
  }

  it('rozbalí jméno, přihlašovací jméno a e-mail', () => {
    const lide = parsePeoplePickerResults(
      odpoved([
        {
          Key: 'i:0#.f|membership|jan.novak@revoltum.cz',
          DisplayText: 'Jan Novák',
          EntityData: { Email: 'jan.novak@revoltum.cz' }
        }
      ])
    );

    expect(lide).toEqual([
      {
        id: 0,
        loginName: 'i:0#.f|membership|jan.novak@revoltum.cz',
        displayName: 'Jan Novák',
        email: 'jan.novak@revoltum.cz'
      }
    ]);
  });

  it('zvládne odpověď i bez obalu `d`', () => {
    const lide = parsePeoplePickerResults({
      ClientPeoplePickerSearchUser: JSON.stringify([{ Key: 'x', DisplayText: 'X' }])
    });
    expect(lide.length).toBe(1);
  });

  it('položku bez přihlašovacího jména zahodí — nedala by se přidat', () => {
    const lide = parsePeoplePickerResults(odpoved([{ DisplayText: 'Bez klíče' }, { Key: 'a', DisplayText: 'A' }]));
    expect(lide.map((l) => l.displayName)).toEqual(['A']);
  });

  it('bez zobrazovaného jména použije přihlašovací jméno', () => {
    const lide = parsePeoplePickerResults(odpoved([{ Key: 'jan@revoltum.cz' }]));
    expect(lide[0].displayName).toBe('jan@revoltum.cz');
  });

  it('nečekaný tvar odpovědi vrátí prázdný seznam, ne pád', () => {
    expect(parsePeoplePickerResults(undefined)).toEqual([]);
    expect(parsePeoplePickerResults({})).toEqual([]);
    expect(parsePeoplePickerResults({ d: {} })).toEqual([]);
    expect(parsePeoplePickerResults({ d: { ClientPeoplePickerSearchUser: 'tohle není JSON' } })).toEqual([]);
    expect(parsePeoplePickerResults({ d: { ClientPeoplePickerSearchUser: '{"a":1}' } })).toEqual([]);
  });

  it('prázdný seznam výsledků je prázdný seznam', () => {
    expect(parsePeoplePickerResults(odpoved([]))).toEqual([]);
  });
});
