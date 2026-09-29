import { parseListText, sameList } from './listText';

describe('parseListText', () => {
  it('rozdělí text po řádcích a ořízne mezery', () => {
    expect(parseListText('FVE\n  BESS  \nMVE')).toEqual(['FVE', 'BESS', 'MVE']);
  });

  it('prázdné řádky vynechá', () => {
    expect(parseListText('FVE\n\n\nBESS\n')).toEqual(['FVE', 'BESS']);
  });

  it('rozepsaný nový řádek (Enter na konci) nezmění seznam', () => {
    expect(parseListText('FVE\nBESS\n')).toEqual(parseListText('FVE\nBESS'));
  });

  it('prázdný text dá prázdný seznam', () => {
    expect(parseListText('')).toEqual([]);
  });
});

describe('sameList', () => {
  it('shodné seznamy jsou stejné', () => {
    expect(sameList(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameList([], [])).toBe(true);
  });

  it('jiné pořadí, jiná délka nebo jiná hodnota není stejné', () => {
    expect(sameList(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameList(['a'], ['a', 'b'])).toBe(false);
    expect(sameList(['a'], ['b'])).toBe(false);
  });
});
