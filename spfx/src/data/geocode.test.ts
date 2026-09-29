import { buildSearchUrl, mapNominatimResults } from './geocode';

describe('mapNominatimResults', () => {
  it('převede text souřadnic na čísla a zachová název', () => {
    const r = mapNominatimResults([
      { display_name: 'Mastířovice, okres Kolín, Česko', lat: '50.0123', lon: '15.1234' }
    ]);
    expect(r).toEqual([{ label: 'Mastířovice, okres Kolín, Česko', latitude: 50.0123, longitude: 15.1234 }]);
  });

  it('zahodí položky bez souřadnic nebo bez názvu', () => {
    const r = mapNominatimResults([
      { display_name: 'Bez souřadnic' },
      { display_name: 'Špatné', lat: 'x', lon: 'y' },
      { lat: '50', lon: '14' },
      { display_name: 'Dobré', lat: '49.5', lon: '16.5' }
    ]);
    expect(r.map((p) => p.label)).toEqual(['Dobré']);
  });

  it('prázdná odpověď dá prázdný seznam', () => {
    expect(mapNominatimResults([])).toEqual([]);
  });

  it('zvládne záporné souřadnice', () => {
    const r = mapNominatimResults([{ display_name: 'Lisabon', lat: '38.72', lon: '-9.14' }]);
    expect(r[0].longitude).toBe(-9.14);
  });
});

describe('buildSearchUrl', () => {
  it('zakóduje diakritiku a mezery a žádá česky pojmenovaná místa', () => {
    const url = buildSearchUrl(' Boršov Moravská Třebová ');
    expect(url).toContain('q=Bor%C5%A1ov%20Moravsk%C3%A1%20T%C5%99ebov%C3%A1');
    expect(url).toContain('accept-language=cs');
    expect(url).toContain('format=jsonv2');
  });

  it('omezí počet výsledků', () => {
    expect(buildSearchUrl('x', 3)).toContain('limit=3');
  });
});
