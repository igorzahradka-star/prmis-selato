import { mergedChoices, missingChoices } from './choiceSync';

describe('missingChoices', () => {
  it('vrátí jen volby, které sloupec nemá', () => {
    expect(missingChoices(['Nabídka', 'Realizace'], ['Nabídka', 'Realizace', 'Reklamace'])).toEqual(['Reklamace']);
  });

  it('když má sloupec všechno, nechce nic doplnit', () => {
    expect(missingChoices(['A', 'B'], ['A', 'B'])).toEqual([]);
  });

  it('sloupec bez voleb dostane všechny', () => {
    expect(missingChoices(undefined, ['A', 'B'])).toEqual(['A', 'B']);
  });

  it('přebytečná stará volba nevadí — nic se nemaže', () => {
    expect(missingChoices(['A', 'Uzavřeno'], ['A'])).toEqual([]);
  });
});

describe('mergedChoices', () => {
  it('zachová stávající volby včetně zrušených a přidá chybějící na konec', () => {
    expect(mergedChoices(['Nabídka', 'Uzavřeno', 'Storno'], ['Nabídka', 'Storno', 'Reklamace'])).toEqual([
      'Nabídka',
      'Uzavřeno',
      'Storno',
      'Reklamace'
    ]);
  });

  it('nic nedoplňuje dvakrát', () => {
    const jednou = mergedChoices(['A'], ['A', 'B']);
    expect(mergedChoices(jednou, ['A', 'B'])).toEqual(['A', 'B']);
  });
});
