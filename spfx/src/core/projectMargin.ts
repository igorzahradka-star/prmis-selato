/**
 * Marže projektu pro přehledy (seznam projektů, detail): počítá se z uložené cache rozpočtu v projektu — prognóza tržeb
 * a prognóza nákupu dávají aktuální marži, marže při schválení je zafixovaná posledním schválením. Hranice semaforu
 * se berou z Nastavení, takže jejich změna se projeví hned bez přepočtu cache.
 */

import { BudgetStatus, Project } from './types';
import { marginOf } from './budget';
import { MarginThresholds, marginStatus } from './budgetMargin';
import { formatMoney } from './format';

export interface ProjectMarginView {
  /** Semafor (pět stupňů, nebo „Bez rozpočtu“). */
  status: BudgetStatus;
  /** Aktuální marže z prognózy v % a v Kč; bez cache marží nebo bez tržeb nejsou známé. */
  forecastPercent?: number;
  forecastAmount?: number;
  /** Marže zadání (při posledním schválení) v % a v Kč. */
  approvedPercent?: number;
  approvedAmount?: number;
  /** Cache marží už v projektu je (jinak se použije dosavadní čtyřstupňový semafor). */
  known: boolean;
}

export function projectMarginView(p: Project, t: MarginThresholds): ProjectMarginView {
  const approvedPercent = p.budgetMarginApproved;
  const approvedAmount = p.budgetMarginApprovedAmount;
  // Dokud cache marží není přepočítaná, počítá se marže z toho, co přehled ukazuje: celková cena (prodej rozpočtu) a nákup (prognóza, jinak plán).
  const revenue = p.budgetRevenueForecast ?? p.budgetSaleTotal;
  const cost = p.costForecastTotal ?? p.budgetCostTotal;
  if (revenue === undefined || cost === undefined || revenue <= 0) {
    return { status: p.budgetStatus ?? BudgetStatus.Bez, approvedPercent, approvedAmount, known: false };
  }
  const m = marginOf(revenue, cost);
  return { status: marginStatus(m.percent, t), forecastPercent: m.percent, forecastAmount: m.amount, approvedPercent, approvedAmount, known: true };
}

const pct = (v: number): string => `${v.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} %`;

/** Text do bubliny u semaforu — proč je zrovna takhle barevný. */
export function marginTooltip(view: ProjectMarginView, t: MarginThresholds): string {
  if (view.status === BudgetStatus.Bez) {
    return 'Projekt nemá rozpočet s výnosy, marže se nepočítá.';
  }
  if (!view.known) {
    return `Semafor: ${view.status}. Přesná marže se zobrazí po přepočtu rozpočtů (otevření rozpočtu projektu, nebo Správa → Instalace a diagnostika → Přepočítat všechny projekty).`;
  }
  const parts = [`Marže při prognóze ${view.forecastPercent !== undefined ? pct(view.forecastPercent) : '—'}${view.forecastAmount !== undefined ? ` (zisk ${formatMoney(view.forecastAmount)})` : ''}.`];
  parts.push(view.approvedPercent !== undefined ? `Zadání (schválená marže) ${pct(view.approvedPercent)}${view.approvedAmount !== undefined ? ` (${formatMoney(view.approvedAmount)})` : ''}.` : 'Rozpočet zatím nebyl schválen.');
  parts.push(`Hranice: zelená od ${t.green} %, světle zelená od ${t.lightGreen} %, žlutá od ${t.yellow} %, pod ${t.yellow} % červená, záporná marže tmavě červená.`);
  return parts.join(' ');
}
