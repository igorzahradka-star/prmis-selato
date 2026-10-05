/**
 * Přepočet semaforu rozpočtu a jeho uložení do projektu (cache pro přehled projektů).
 *
 * Semafor se počítá z rozpočtu (baseline = náklady posledního schválení), navázaných objednávek a prognózy; prahy a minimální
 * marže jsou globální v Nastavení. Spouští se při otevření a uložení rozpočtu a po změně objednávky. Je to **best-effort**:
 * kdo nemá právo zapisovat do evidence projektů, jen nic nezapíše — chyba se nikdy nepřenese do práce uživatele.
 */

import { BudgetDoc, BudgetRecord, OrderLike, budgetSemaphore, budgetTotals, lastApproval } from '../../core/budget';
import { BudgetCacheInput } from '../../data/repositories';
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
  /** Součty v Kč pro přehledy: plán (nákup, prodej) a skutečnost. */
  costTotal: number;
  saleTotal: number;
  actualTotal: number;
  approved: boolean;
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
  return {
    status: result.status,
    deviationPercent: result.deviationPercent,
    marginPercent: result.marginPercent,
    baselineCost: last ? last.cost : undefined,
    forecastCost: totals.forecast,
    costTotal: totals.cost,
    saleTotal: totals.sale,
    actualTotal: totals.actual,
    approved: !!last
  };
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
    const next = cacheOf(view);
    const same =
      project.budgetStatus === view.status &&
      Math.round(project.budgetBaselineTotal ?? -1) === Math.round(next.baselineTotal ?? -1) &&
      Math.round(project.costForecastTotal ?? -1) === Math.round(next.forecastTotal ?? -1) &&
      Math.round(project.budgetCostTotal ?? -1) === Math.round(next.costTotal ?? -1) &&
      Math.round(project.budgetSaleTotal ?? -1) === Math.round(next.saleTotal ?? -1) &&
      Math.round(project.budgetActualTotal ?? -1) === Math.round(next.actualTotal ?? -1) &&
      (project.budgetApproved === true) === next.approved;
    if (!same) {
      await repos.projects.setBudgetCache(project.projectNumber, next);
    }
  } catch {
    // Cache je jen pro rychlost přehledu; přepočítá se při příštím otevření rozpočtu.
  }
}

/** Cache pro zápis do projektu z vypočteného semaforu. */
export function cacheOf(view: SemaphoreView): BudgetCacheInput {
  return { status: view.status, baselineTotal: view.baselineCost, forecastTotal: view.forecastCost, costTotal: view.costTotal, saleTotal: view.saleTotal, actualTotal: view.actualTotal, approved: view.approved };
}

export interface RefreshAllResult {
  projects: number;
  withBudget: number;
  updated: number;
  failed: string[];
}

/**
 * Přepočítá cache rozpočtu **všech projektů** (správce, jednorázově po nasazení nebo po opravě). Projekty bez rozpočtu se
 * přeskočí. Nic nemaže; zapisuje jen do cache sloupců projektu. Průběh hlásí `onProgress`.
 */
export async function refreshAllBudgetCaches(repos: RepositorySet, settings: AppSettings, rates: RateTable, onProgress?: (done: number, total: number) => void): Promise<RefreshAllResult> {
  const projects = (await repos.projects.list({ includeOverhead: false })).filter((p) => !p.isOverhead);
  const orders = await repos.orders.list({});
  const result: RefreshAllResult = { projects: projects.length, withBudget: 0, updated: 0, failed: [] };
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    try {
      const budget = await repos.budgets.get(p.projectNumber);
      if (budget) {
        result.withBudget += 1;
        const view = computeSemaphore(budget.doc, budget.record, orders.filter((o) => o.projectNumber === p.projectNumber), rates, settings);
        await repos.projects.setBudgetCache(p.projectNumber, cacheOf(view));
        result.updated += 1;
      }
    } catch (e) {
      result.failed.push(`${p.projectNumber}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (onProgress) {
      onProgress(i + 1, projects.length);
    }
  }
  return result;
}
