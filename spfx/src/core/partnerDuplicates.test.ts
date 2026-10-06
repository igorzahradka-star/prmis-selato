import { checkPartner, findIcoDuplicate, icoKey, similarNames, similarWarning, simplifyName } from './partnerDuplicates';
import { Partner, PartnerType } from './types';

function partner(id: number, name: string, over: Partial<Partner> = {}): Partner {
  return { id, name, partnerType: PartnerType.Dodavatel, isVatPayer: false, isActive: true, ...over };
}

const list: Partner[] = [
  partner(1, 'ČEZ Distribuce, a.s.', { ico: '24729035' }),
  partner(2, 'Solar Komponenten GmbH', { ico: 'HRB 123', country: 'DE' }),
  partner(3, 'Starý dodavatel s.r.o.', { ico: '00069797', isActive: false })
];

describe('kontrola duplicit partnerů — IČO', () => {
  it('stejné IČO ve stejné zemi, zapsané „po lidsku“, je duplicita; i u deaktivovaného partnera', () => {
    expect(findIcoDuplicate(list, { ico: '247 29 035' })?.id).toBe(1);
    expect(findIcoDuplicate(list, { ico: '69797' })?.id).toBe(3);
    expect(checkPartner(list, { name: 'Nějaká firma', ico: '69797' }).blocking).toContain('deaktivovaný');
  });

  it('upravovaný partner se sám se sebou neporovnává; prázdné IČO se nekontroluje', () => {
    expect(findIcoDuplicate(list, { ico: '24729035' }, 1)).toBeUndefined();
    expect(findIcoDuplicate(list, { ico: '' })).toBeUndefined();
    expect(findIcoDuplicate(list, { ico: undefined })).toBeUndefined();
  });

  it('stejné číslo v jiné zemi není duplicita; zahraniční registrační číslo se porovnává jako písmena a číslice', () => {
    expect(findIcoDuplicate(list, { ico: '24729035', country: 'SK' })).toBeUndefined();
    expect(findIcoDuplicate(list, { ico: 'hrb123', country: 'DE' })?.id).toBe(2);
    expect(findIcoDuplicate(list, { ico: '123', country: 'DE' })).toBeUndefined();
    expect(icoKey('HRB 12-3', 'DE')).toBe('HRB123');
    expect(icoKey('69797', undefined)).toBe('00069797');
  });
});

describe('kontrola duplicit partnerů — jméno', () => {
  it('zjednodušení názvu odstraní diakritiku, interpunkci a právní formu', () => {
    expect(simplifyName('ČEZ Distribuce, a.s.')).toBe('cez distribuce');
    expect(simplifyName('Elektro Novák spol. s r.o.')).toBe('elektro novak');
    expect(simplifyName('s.r.o.')).toBe('s r o');
  });

  it('stejné, obsažené a o znak odlišné jméno je podobné; jiné ne', () => {
    expect(similarNames('CEZ Distribuce a.s.', 'ČEZ Distribuce, a. s.')).toBe(true);
    expect(similarNames('ČEZ Distribuce', 'ČEZ Distribuce Morava')).toBe(true);
    expect(similarNames('Teplárna Chotěboř', 'Teplarna Chotebor')).toBe(true);
    expect(similarNames('Elektro Novák', 'Elektro Nováč')).toBe(true);
    expect(similarNames('Elektro Novák', 'Solar Komponenten')).toBe(false);
    expect(similarNames('ABC', 'ABD')).toBe(false);
  });

  it('podobné jméno nebrání uložení, jen upozorní; IČO duplicita upozornění nahradí blokací', () => {
    const c = checkPartner(list, { name: 'CEZ Distribuce a.s.', ico: '12345678' });
    expect(c.blocking).toBeUndefined();
    expect(c.similar.map((p) => p.id)).toEqual([1]);
    expect(similarWarning(c.similar)).toContain('„ČEZ Distribuce, a.s.“ (IČO 24729035)');
    expect(checkPartner(list, { name: 'Cokoli', ico: '24729035' }).similar).toEqual([]);
    expect(checkPartner(list, { name: 'Cokoli', ico: '24729035' }).blocking).toBeDefined();
  });
});
