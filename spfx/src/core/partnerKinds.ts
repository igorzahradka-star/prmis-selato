/**
 * Druhy partnera: **zákazník**, **dodavatel** a **dodavatel servisu** — dají se kombinovat (i všechny tři).
 * V seznamu PRM_Partners zůstává kvůli kompatibilitě (a sdílení s REVCRM) původní sloupec Typ (Zákazník / Dodavatel / Obojí);
 * dodavatel servisu je samostatný příznak. Dodavatel servisu je zároveň dodavatel (smí se objednávat i mimo Servis).
 */

import { Partner, PartnerType } from './types';

export interface PartnerKinds {
  customer: boolean;
  supplier: boolean;
  serviceSupplier: boolean;
}

export function kindsOf(p: Pick<Partner, 'partnerType' | 'isServiceSupplier'>): PartnerKinds {
  return {
    customer: p.partnerType === PartnerType.Zakaznik || p.partnerType === PartnerType.Oboji,
    supplier: p.partnerType === PartnerType.Dodavatel || p.partnerType === PartnerType.Oboji,
    serviceSupplier: p.isServiceSupplier === true
  };
}

/** Sloupec Typ podle zaškrtnutých druhů; `undefined`, když není zaškrtnuto nic. Dodavatel servisu se do Typu počítá jako dodavatel. */
export function partnerTypeFrom(k: PartnerKinds): PartnerType | undefined {
  const supplier = k.supplier || k.serviceSupplier;
  if (k.customer && supplier) {
    return PartnerType.Oboji;
  }
  if (k.customer) {
    return PartnerType.Zakaznik;
  }
  return supplier ? PartnerType.Dodavatel : undefined;
}

/** Změní druhy partnera (typ i příznak dodavatele servisu). */
export function withKinds<T extends Pick<Partner, 'partnerType' | 'isServiceSupplier'>>(p: T, k: PartnerKinds): T {
  return { ...p, partnerType: partnerTypeFrom(k) ?? p.partnerType, isServiceSupplier: k.serviceSupplier };
}

/** Popis druhů partnera pro seznamy: „Zákazník, dodavatel, dodavatel servisu“. */
export function partnerKindLabel(p: Pick<Partner, 'partnerType' | 'isServiceSupplier'>): string {
  const k = kindsOf(p);
  const out: string[] = [];
  if (k.customer) {
    out.push('Zákazník');
  }
  if (k.supplier) {
    out.push('Dodavatel');
  }
  if (k.serviceSupplier) {
    out.push('Dodavatel servisu');
  }
  return out.join(', ');
}

/** Smí se partner vybrat jako dodavatel (objednávky)? Zákazníci ne. */
export const isSupplier = (p: Pick<Partner, 'partnerType' | 'isServiceSupplier'>): boolean => p.partnerType !== PartnerType.Zakaznik || p.isServiceSupplier === true;

/**
 * Dodavatelé k výběru: ve výchozím stavu jen **dodavatelé servisu** (přehlednost); `all` zobrazí všechny dodavatele.
 * Když žádný dodavatel servisu ještě není označený, nabídne se raději všichni, ať výběr není prázdný.
 */
export function suppliersToPick<T extends Pick<Partner, 'partnerType' | 'isServiceSupplier' | 'isActive'>>(partners: T[], all: boolean): T[] {
  const suppliers = partners.filter((p) => p.isActive && isSupplier(p));
  if (all) {
    return suppliers;
  }
  const service = suppliers.filter((p) => p.isServiceSupplier === true);
  return service.length > 0 ? service : suppliers;
}
