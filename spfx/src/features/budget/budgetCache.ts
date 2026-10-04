/**
 * Přepočet semaforu rozpočtu a jeho uložení do projektu (cache pro přehled projektů).
 *
 * Semafor se počítá z rozpočtu (baseline = náklady posledního schválení), navázaných objednávek a prognózy; prahy a minimální
 * marže jsou globální v Nastavení. Spouští se při otevření a uložení rozpočtu a po změně objednávky. Je to **best-effort**:
 * kdo nemá právo zapisovat do evidence projektů, jen nic nezapíše — chyba se nikdy nepřenese do práce uživatele.
 */

import { BudgetDoc, BudgetRecord, OrderLike, budgetSemaphore, budgetTotals, lastApproval } from '../../core/budget';
import { RateTable } from '../../core/currency';
import { AppSettings } from '../../core/settings';
import { Project } from '../../core/types';
import { RepositorySet } from '../../data/repositories';

export interface SemaphoreView {
  status: string;
  deviationPercent?: number;
  marginPercent?: number;
  baselineCost?: number;
  forecastCost: number;
}

/** Semafor rozpočtu v Kč: baseline = náklady posledního schválení, smluvní cena = prodej posledního schválení. */
export function computeSemaphore(doc: BudgetDoc, record: BudgetRecord | undefined, orders: OrderLike[], rates: RateTable, settings: AppSettings): SemaphoreView {
  const totals = budgetTotals(doc, 'CZK', rates, orders);
  const last = lastApproval(record);
  const result = budgetSemaphore({
    baselineCost: last ? last.cost : undefined,
    forecastCost: totals.forecast,
    contractPrice: last ? last.sale : undefined,
    yellowThresholdPercent: settings.budget.yellowThresholdPercent,
    minimumMarginPercent: settings.budget.minimumMarginPercent
  });
  return { status: result.status, deviationPercent: result.deviationPercent, marginPercent: result.marginPercent, baselineCost: last ? last.cost : undefined, forecastCost: totals.forecast };
}

/** Přepočítá semafor projektu a zapíše ho, když se změnil. Nikdy nevyhazuje chybu. */
export async function refreshBudgetCache(repos: RepositorySet, project: Project, settings: AppSettings, rates: RateTable): Promise<void> {
  try {
    const budget = await repos.budgets.get(project.projectNumber);
    if (!budget) {
      return;
    }
    const orders = await repos.orders.list({ projectNumber: project.projectNumber });
    const view = computeSemaphore(budget.doc, budget.record, orders, rates, settings);
    const same =
      project.budgetStatus === view.status &&
      Math.round(project.budgetBaselineTotal ?? -1) === Math.round(view.baselineCost ?? -1) &&
      Math.round(project.costForecastTotal ?? -1) === Math.round(view.forecastCost);
    if (!same) {
      await repos.projects.setBudgetCache(project.projectNumber, { status: view.status, baselineTotal: view.baselineCost, forecastTotal: view.forecastCost });
    }
  } catch {
    // Cache je jen pro rychlost přehledu; přepočítá se při příštím otevření rozpočtu.
  }
}
