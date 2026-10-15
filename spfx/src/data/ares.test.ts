import { capitalizeName, mapAresRegister, mapAresResponse } from './ares';

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

describe('mapAresRegister', () => {
  const rec = {
    zaznamy: [
      {
        primarniZaznam: true,
        spisovaZnacka: [{ soud: 'KSHK', oddil: 'C', vlozka: 57052 }],
        statutarniOrgany: [
          {
            zpusobJednani: [{ hodnota: 'Každý z jednatelů zastupuje samostatně.' }],
            clenoveOrganu: [
              { clenstvi: { funkce: { nazev: 'Jednatel' } }, fyzickaOsoba: { jmeno: 'BRONISLAV', prijmeni: 'PŘEVRÁTIL', titulPredJmenem: 'Ing.', titulZaJmenem: 'Ph.D.' } },
              { clenstvi: { funkce: { nazev: 'Jednatel', zanikFunkce: '2025-01-01' } }, fyzickaOsoba: { jmeno: 'BYVALÝ', prijmeni: 'JEDNATEL' } },
              { clenstvi: { funkce: { nazev: 'Jediný člen' } }, pravnickaOsoba: { obchodniJmeno: 'Holding a.s.' } }
            ]
          }
        ]
      }
    ]
  };

  it('složí spisovou značku se soudem a jednatele s tituly', () => {
    const r = mapAresRegister(rec);
    expect(r.registration).toBe('C 57052 vedená u Krajského soudu v Hradci Králové');
    expect(r.representatives).toEqual([
      { name: 'Ing. Bronislav Převrátil, Ph.D.', role: 'Jednatel', isLegalEntity: false },
      { name: 'Holding a.s.', role: 'Jediný člen', isLegalEntity: true }
    ]);
    expect(r.actingRule).toBe('Každý z jednatelů zastupuje samostatně.');
  });

  it('prázdná odpověď nebo neznámý soud nespadne', () => {
    expect(mapAresRegister({})).toEqual({ representatives: [] });
    expect(mapAresRegister({ zaznamy: [{ spisovaZnacka: [{ soud: 'XXXX', oddil: 'B', vlozka: 1 }] }] }).registration).toBe('B 1 vedená u XXXX');
  });

  it('velká písmena ve jménech se převedou, spojovník zůstane', () => {
    expect(capitalizeName('JAN-KAREL')).toBe('Jan-Karel');
    expect(capitalizeName('NOVÁKOVÁ')).toBe('Nováková');
  });
});
