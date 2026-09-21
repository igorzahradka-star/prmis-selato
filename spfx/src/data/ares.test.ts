import { mapAresResponse } from './ares';

describe('mapAresResponse', () => {
  it('namapuje název, adresu, DIČ a plátce DPH ze skutečné odpovědi ARES', () => {
    const result = mapAresResponse({
      obchodniJmeno: 'ELSI CZ s.r.o.',
      dic: 'CZ06859101',
      sidlo: { textovaAdresa: 'K Raškovci 1360, Kolín V, 28002 Kolín' },
      seznamRegistraci: { stavZdrojeDph: 'AKTIVNI' }
    });
    expect(result).toEqual({
      name: 'ELSI CZ s.r.o.',
      address: 'K Raškovci 1360, Kolín V, 28002 Kolín',
      dic: 'CZ06859101',
      isVatPayer: true
    });
  });

  it('u neplátce DPH nechá DIČ nevyplněné a isVatPayer false, ne chybu', () => {
    const result = mapAresResponse({
      obchodniJmeno: 'Bez DIČ s.r.o.',
      sidlo: { textovaAdresa: 'Nikde 1, 100 00 Praha' },
      seznamRegistraci: { stavZdrojeDph: 'NEEXISTUJICI' }
    });
    expect(result.dic).toBeUndefined();
    expect(result.isVatPayer).toBe(false);
  });

  it('chybějící seznamRegistraci znamená neplátce, ne pád', () => {
    const result = mapAresResponse({ obchodniJmeno: 'X' });
    expect(result.isVatPayer).toBe(false);
  });

  it('chybějící název nahradí prázdným řetězcem, ne undefined', () => {
    const result = mapAresResponse({});
    expect(result.name).toBe('');
  });
});
