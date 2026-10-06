/**
 * Mazání partnerů — pravidla: smazat smí vedení a administrátor (do koše SharePointu); partner, který je někde použit
 * (projekty, objednávky, podklady pro fakturaci, případy RES CRM), se nesmaže — nabídne se deaktivace. Čistá logika.
 */

import { Role } from './types';
import { hasAnyRole } from './roles';

/** Kolikrát je partner použit. */
export interface PartnerUsage {
  projects: number;
  orders: number;
  invoices: number;
  /** Případy RES CRM (`REV_Cases.PartnerId`). */
  cases: number;
}

export const NO_USAGE: PartnerUsage = { projects: 0, orders: 0, invoices: 0, cases: 0 };

/** Smazat partnera smí vedení a administrátor. */
export function canDeletePartner(roles: Role[]): boolean {
  return hasAnyRole(roles, Role.Vedeni, Role.Administrator);
}

export const usageTotal = (u: PartnerUsage): number => u.projects + u.orders + u.invoices + u.cases;

/** Kde je partner použit — věta pro uživatele (prázdné, když nikde). */
export function describeUsage(u: PartnerUsage): string {
  const parts: string[] = [];
  if (u.projects > 0) {
    parts.push(`${u.projects} ${u.projects === 1 ? 'projekt' : u.projects < 5 ? 'projekty' : 'projektů'} (jako zákazník)`);
  }
  if (u.orders > 0) {
    parts.push(`${u.orders} ${u.orders === 1 ? 'objednávka' : u.orders < 5 ? 'objednávky' : 'objednávek'} (jako dodavatel)`);
  }
  if (u.invoices > 0) {
    parts.push(`${u.invoices} ${u.invoices === 1 ? 'podklad pro fakturaci' : u.invoices < 5 ? 'podklady pro fakturaci' : 'podkladů pro fakturaci'}`);
  }
  if (u.cases > 0) {
    parts.push(`${u.cases} ${u.cases === 1 ? 'obchodní případ' : u.cases < 5 ? 'obchodní případy' : 'obchodních případů'} v RES CRM`);
  }
  return parts.join(', ');
}
