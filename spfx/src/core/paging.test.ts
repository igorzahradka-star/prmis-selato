import { pageSlice } from './paging';

const items = Array.from({ length: 20 }, (_, i) => i + 1);

describe('pageSlice', () => {
  it('první stránka má nejvýš 9 položek', () => {
    const p = pageSlice(items, 0, 9);
    expect(p.items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(p).toMatchObject({ page: 0, pageCount: 3, from: 1, to: 9, total: 20 });
  });
  it('poslední stránka je neúplná', () => {
    expect(pageSlice(items, 2, 9)).toMatchObject({ items: [19, 20], from: 19, to: 20 });
  });
  it('stránka mimo rozsah se posune na nejbližší platnou', () => {
    expect(pageSlice(items, 7, 9).page).toBe(2);
    expect(pageSlice(items, -3, 9).page).toBe(0);
    expect(pageSlice([1, 2], 4, 9)).toMatchObject({ items: [1, 2], page: 0, pageCount: 1 });
  });
  it('prázdný seznam', () => {
    expect(pageSlice([], 0, 9)).toEqual({ items: [], page: 0, pageCount: 1, from: 0, to: 0, total: 0 });
  });
  it('přesně plná stránka nemá prázdnou další', () => {
    expect(pageSlice(items.slice(0, 9), 0, 9).pageCount).toBe(1);
  });
});
