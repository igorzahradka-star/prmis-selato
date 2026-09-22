/**
 * Schvalovací limity objednávek — převod čísel z Nastavení na větu.
 *
 * Součást vrstvy `core` — čistá logika bez SharePointu a Reactu.
 *
 * Záměrně tu **není** samotné schvalovací workflow (stavy, kdo komu posílá,
 * e-maily, PRM_Approvals). To přijde ve Fázi 2 a zadavatel ho teprve upřesní.
 * Zatím jde jen o to, aby si v Nastavení ověřil, že zadaná čísla znamenají,
 * co chtěl — čtyři čísla v polích se špatně kontrolují, věty dobře.
 */

import { ApprovalSettings } from './settings';
import { formatMoney } from './format';

/**
 * Lidsky čitelný popis toho, co zadané limity znamenají.
 * Vrací věty v pořadí od nejnižšího pásma po nejvyšší.
 */
export function describeApprovalLadder(settings: ApprovalSettings): string[] {
  const rows: string[] = [
    `do ${formatMoney(settings.pmLimit)} schvaluje projektový manažer`,
    `nad ${formatMoney(settings.pmLimit)} do ${formatMoney(settings.vedeniLimit)} schvaluje navíc vedení`,
    `nad ${formatMoney(settings.vedeniLimit)} do ${formatMoney(settings.jednatelLimit)} schvaluje navíc jednatel`,
    `nad ${formatMoney(settings.jednatelLimit)} se objednávka schvaluje mimo aplikaci`
  ];

  rows.push(
    settings.pmSelfApprovalEnabled
      ? 'objednávku do svého limitu si projektový manažer schvaluje sám'
      : 'i vlastní objednávku projektového manažera schvaluje vedení'
  );
  if (settings.overheadRequiresVedeni) {
    rows.push('objednávky na projekt Režie schvaluje vždy vedení, bez ohledu na částku');
  }

  return rows;
}

/**
 * Do kterého pásma částka spadá (0 = do limitu PM, 3 = nad limit jednatele).
 * Používá se jen pro zvýraznění v Nastavení; rozhodování o schválení
 * přijde ve Fázi 2 s celým workflow.
 */
export function approvalTierIndex(amountNet: number, settings: ApprovalSettings): number {
  if (amountNet <= settings.pmLimit) {
    return 0;
  }
  if (amountNet <= settings.vedeniLimit) {
    return 1;
  }
  if (amountNet <= settings.jednatelLimit) {
    return 2;
  }
  return 3;
}
