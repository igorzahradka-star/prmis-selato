import { isCustomOrder, moveColumn, orderColumns } from './columnOrder';

const col = (key: string): { key: string } => ({ key });
const keys = (cols: { key: string }[]): string[] => cols.map((c) => c.key);
const DEFAULT = ['number', 'title', 'pm', 'status', 'price'];

describe('orderColumns', () => {
  const all = DEFAULT.map(col);

  it('bez uloženého pořadí použije výchozí', () => {
    expect(keys(orderColumns(all, undefined, DEFAULT))).toEqual(DEFAULT);
    expect(keys(orderColumns(all, [], DEFAULT))).toEqual(DEFAULT);
  });

  it('výchozí pořadí platí, i když jsou sloupce předané v jiném pořadí', () => {
    const zamichane = ['price', 'status', 'number', 'pm', 'title'].map(col);
    expect(keys(orderColumns(zamichane, undefined, DEFAULT))).toEqual(DEFAULT);
  });

  it('respektuje uložené pořadí', () => {
    const saved = ['status', 'number', 'title', 'pm', 'price'];
    expect(keys(orderColumns(all, saved, DEFAULT))).toEqual(saved);
  });

  it('sloupec, který už neexistuje, se v uloženém pořadí ignoruje', () => {
    const saved = ['status', 'zrusenySloupec', 'number', 'title', 'pm', 'price'];
    expect(keys(orderColumns(all, saved, DEFAULT))).toEqual(['status', 'number', 'title', 'pm', 'price']);
  });

  it('nový sloupec se zařadí za svého výchozího předchůdce', () => {
    // Uložené pořadí nezná sloupec „status", který ve výchozím pořadí následuje za „pm".
    const saved = ['pm', 'number', 'title', 'price'];
    expect(keys(orderColumns(all, saved, DEFAULT))).toEqual(['pm', 'status', 'number', 'title', 'price']);
  });

  it('nový sloupec bez předchůdce v uloženém pořadí jde na začátek', () => {
    const saved = ['title', 'pm'];
    const r = keys(orderColumns(all, saved, DEFAULT));
    expect(r.indexOf('number')).toBe(0);
    expect(r.length).toBe(DEFAULT.length);
  });

  it('žádný sloupec nezmizí ani se nezdvojí, ani při duplicitách v uloženém pořadí', () => {
    const saved = ['pm', 'pm', 'number'];
    const r = keys(orderColumns(all, saved, DEFAULT));
    expect(r.slice().sort()).toEqual(DEFAULT.slice().sort());
  });

  it('sloupec mimo výchozí pořadí skončí na konci, ne v propadlišti', () => {
    const r = keys(orderColumns([...all, col('novy')], undefined, DEFAULT));
    expect(r[r.length - 1]).toBe('novy');
  });
});

describe('moveColumn', () => {
  it('přesune sloupec dopředu i dozadu', () => {
    expect(moveColumn(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveColumn(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('neplatná nebo stejná pozice pořadí nemění a původní pole zůstane netknuté', () => {
    const puvodni = ['a', 'b', 'c'];
    expect(moveColumn(puvodni, 1, 1)).toEqual(['a', 'b', 'c']);
    expect(moveColumn(puvodni, -1, 2)).toEqual(['a', 'b', 'c']);
    expect(moveColumn(puvodni, 0, 9)).toEqual(['a', 'b', 'c']);
    expect(puvodni).toEqual(['a', 'b', 'c']);
  });
});

describe('isCustomOrder', () => {
  it('bez uloženého pořadí není přizpůsobené', () => {
    expect(isCustomOrder(undefined, DEFAULT, DEFAULT)).toBe(false);
    expect(isCustomOrder([], DEFAULT, DEFAULT)).toBe(false);
  });

  it('uložené pořadí shodné s výchozím není přizpůsobené', () => {
    expect(isCustomOrder(DEFAULT, DEFAULT, DEFAULT)).toBe(false);
  });

  it('jiné pořadí je přizpůsobené', () => {
    expect(isCustomOrder(['status', 'number', 'title', 'pm', 'price'], DEFAULT, DEFAULT)).toBe(true);
  });
});
