import { mapAresResponse } from './ares';

describe('mapAresResponse', () => {
  it('namapuje název, adresu a DIČ ze skutečné odpovědi ARES', () => {
    const result = mapAresResponse({
      obchodniJmeno: 'ELSI CZ s.r.o.',
      dic: 'CZ06859101',
      sidlo: { textovaAdresa: 'K Raškovci 1360, Kolín V, 28002 Kolín' }
    });
    expect(result).toEqual({
      name: 'ELSI CZ s.r.o.',
      address: 'K Raškovci 1360, Kolín V, 28002 Kolín',
      dic: 'CZ06859101'
    });
  });

  it('u neplátce DPH nechá DIČ nevyplněné, ne chybu', () => {
    const result = mapAresResponse({
      obchodniJmeno: 'Bez DIČ s.r.o.',
      sidlo: { textovaAdresa: 'Nikde 1, 100 00 Praha' }
    });
    expect(result.dic).toBeUndefined();
  });

  it('chybějící název nahradí prázdným řetězcem, ne undefined', () => {
    const result = mapAresResponse({});
    expect(result.name).toBe('');
  });
});
