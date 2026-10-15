import { PartnerType } from './types';
import { isSupplier, kindsOf, partnerKindLabel, partnerTypeFrom, suppliersToPick, withKinds } from './partnerKinds';

const p = (type: PartnerType, service = false, active = true) => ({ partnerType: type, isServiceSupplier: service, isActive: active });

describe('druhy partnera', () => {
  it('z typu a příznaku se přečtou tři druhy', () => {
    expect(kindsOf(p(PartnerType.Oboji, true))).toEqual({ customer: true, supplier: true, serviceSupplier: true });
    expect(kindsOf(p(PartnerType.Zakaznik))).toEqual({ customer: true, supplier: false, serviceSupplier: false });
    expect(kindsOf({ partnerType: PartnerType.Dodavatel })).toEqual({ customer: false, supplier: true, serviceSupplier: false });
  });

  it('z druhů vznikne sloupec Typ; dodavatel servisu se počítá jako dodavatel; nic = nic', () => {
    expect(partnerTypeFrom({ customer: true, supplier: true, serviceSupplier: false })).toBe(PartnerType.Oboji);
    expect(partnerTypeFrom({ customer: true, supplier: false, serviceSupplier: true })).toBe(PartnerType.Oboji);
    expect(partnerTypeFrom({ customer: true, supplier: false, serviceSupplier: false })).toBe(PartnerType.Zakaznik);
    expect(partnerTypeFrom({ customer: false, supplier: false, serviceSupplier: true })).toBe(PartnerType.Dodavatel);
    expect(partnerTypeFrom({ customer: false, supplier: false, serviceSupplier: false })).toBeUndefined();
  });

  it('withKinds změní typ i příznak; popis druhů', () => {
    const x = withKinds(p(PartnerType.Zakaznik), { customer: false, supplier: false, serviceSupplier: true });
    expect(x.partnerType).toBe(PartnerType.Dodavatel);
    expect(x.isServiceSupplier).toBe(true);
    expect(partnerKindLabel(p(PartnerType.Oboji, true))).toBe('Zákazník, Dodavatel, Dodavatel servisu');
    expect(partnerKindLabel(p(PartnerType.Zakaznik))).toBe('Zákazník');
  });

  it('zákazník není dodavatel, pokud není dodavatel servisu', () => {
    expect(isSupplier(p(PartnerType.Zakaznik))).toBe(false);
    expect(isSupplier(p(PartnerType.Zakaznik, true))).toBe(true);
    expect(isSupplier(p(PartnerType.Dodavatel))).toBe(true);
  });

  it('výběr dodavatele: výchozí jen dodavatelé servisu, „všichni“ ukáže všechny; bez označených servisních se nabídnou všichni', () => {
    const list = [p(PartnerType.Dodavatel), p(PartnerType.Dodavatel, true), p(PartnerType.Zakaznik), p(PartnerType.Dodavatel, true, false)];
    expect(suppliersToPick(list, false)).toEqual([list[1]]);
    expect(suppliersToPick(list, true)).toEqual([list[0], list[1]]);
    expect(suppliersToPick([list[0], list[2]], false)).toEqual([list[0]]);
  });
});
