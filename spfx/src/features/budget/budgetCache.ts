/**
 * Přepočet semaforu rozpočtu a jeho uložení do projektu (cache pro přehled projektů).
 *
 * Semafor se řídí **aktuální marží z prognózy** — (tržby prognóza − nákup prognóza) / tržby prognóza — proti hranicím z Nastavení
 * (výchozí 15 / 10 / 5 %, záporná marže je tmavě červená). Z posledního schválení se přebírá jen zafixovaná marže (pro porovnání).
 * Spouští se při otevření a uložení rozpočtu a po změně objednávky. Je to **best-effort**: kdo nemá právo zapisovat do evidence
 * projektů, jen nic nezapíše — chyba se nikdy nepřenese do práce uživatele.
 */

import { BudgetDoc, BudgetRecord, OrderLike, budgetTotals, lastApproval } from '../../core/budget';
import { approvedMargin, ensureRevenues, legacyStatusOf, marginStatus, marginThresholdsOf } from '../../core/budgetMargin';
import { BudgetCacheInput } from '../../data/repositories';
import { RateTable } from '../../core/currency';
import { AppSettings } from '../../core/settings';
import { Project } from '../../core/types';
import { RepositorySet } from '../../data/repositories';

export interface SemaphoreView {
  /** Semafor podle aktuální marže (pět stupňů, nebo „Bez rozpočtu“). */
  status: string;
  /** Aktuální marže z prognózy: v % (bez tržeb nedefinovaná) a v Kč. */
  marginPercent?: number;
  marginAmount: number;
  /** Marže při posledním schválení (zadání): v % a v Kč. */
  approvedMarginPercent?: number;
  approvedMarginAmount?: number;
  /** Plán nákupu při posledním schválení. */
  baselineCost?: number;
  /** Prognóza nákupu a tržeb v Kč. */
  forecastCost: number;
  revenueForecast: number;
  /** Součty v Kč pro přehledy: plán nákupu, plán výnosů (smluvní cena) a skutečnost (koupeno). */
  costTotal: number;
  saleTotal: number;
  actualTotal: number;
  approved: boolean;
}

/** Semafor rozpočtu v Kč; starý rozpočet bez výnosů se pro výpočet převede v paměti (`project` dodá smluvní cenu). */
export function computeSemaphore(doc: BudgetDoc, record: BudgetRecord | undefined, orders: OrderLike[], rates: RateTable, settings: AppSettings, project?: { currency: string; contractPriceNet?: number }): SemaphoreView {
  const converted = ensureRevenues(doc, project ?? { currency: 'CZK' }, rates);
  const totals = budgetTotals(converted, 'CZK', rates, orders);
  const last = lastApproval(record);
  const approved = approvedMargin(last, totals.sale);
  const margin = totals.forecastMargin;
  return {
    status: marginStatus(margin.percent, marginThresholdsOf(settings.budget)),
    marginPercent: margin.percent,
    marginAmount: margin.amount,
    approvedMarginPercent: approved ? approved.percent : undefined,
    approvedMarginAmount: approved ? approved.amount : undefined,
    baselineCost: last ? last.cost : undefined,
    forecastCost: totals.forecast,
    revenueForecast: totals.revenueForecast,
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
    const view = computeSemaphore(budget.doc, budget.record, orders, rates, settings, project);
    const next = cacheOf(view);
    const r = (v: number | undefined): number => Math.round(v ?? -1);
    const same =
      project.budgetStatus === next.status &&
      r(project.budgetBaselineTotal) === r(next.baselineTotal) &&
      r(project.costForecastTotal) === r(next.forecastTotal) &&
      r(project.budgetCostTotal) === r(next.costTotal) &&
      r(project.budgetSaleTotal) === r(next.saleTotal) &&
      r(project.budgetActualTotal) === r(next.actualTotal) &&
      r(project.budgetRevenueForecast) === r(next.revenueForecast) &&
      (project.budgetMarginApproved === undefined ? -999 : Math.round(project.budgetMarginApproved * 100)) === (next.marginApproved === undefined ? -999 : Math.round(next.marginApproved * 100)) &&
      r(project.budgetMarginApprovedAmount) === r(next.marginApprovedAmount) &&
      (project.budgetApproved === true) === next.approved;
    if (!same) {
      await repos.projects.setBudgetCache(project.projectNumber, next);
    }
  } catch {
    // Cache je jen pro rychlost přehledu; přepočítá se při příštím otevření rozpočtu.
  }
}

/** Cache pro zápis do projektu z vypočteného semaforu (sloupec semaforu drží původní čtyři hodnoty, přesný stupeň se počítá z marže). */
export function cacheOf(view: SemaphoreView): BudgetCacheInput & { status: string; approved: boolean } {
  return {
    status: legacyStatusOf(view.status as never),
    baselineTotal: view.baselineCost,
    forecastTotal: view.forecastCost,
    costTotal: view.costTotal,
    saleTotal: view.saleTotal,
    actualTotal: view.actualTotal,
    approved: view.approved,
    revenueForecast: view.revenueForecast,
    marginApproved: view.approvedMarginPercent,
    marginApprovedAmount: view.approvedMarginAmount
  };
}

export interface RefreshAllResult {
  projects: number;
  withBudget: number;
  updated: number;
  failed: string[];
  /** U kolika projektů se nepodařilo uložit marže, protože web nemá sloupce marží (chybí Instalace a diagnostika). */
  withoutMarginColumns: number;
}

/**
 * Přepočítá cache rozpočtu **všech projektů** (správce, jednorázově po nasazení nebo po opravě). Projekty bez rozpočtu se
 * přeskočí. Nic nemaže; zapisuje jen do cache sloupců projektu. Průběh hlásí `onProgress`.
 */
export async function refreshAllBudgetCaches(repos: RepositorySet, settings: AppSettings, rates: RateTable, onProgress?: (done: number, total: number) => void): Promise<RefreshAllResult> {
  const projects = (await repos.projects.list({ includeOverhead: false })).filter((p) => !p.isOverhead);
  const orders = await repos.orders.list({});
  const result: RefreshAllResult = { projects: projects.length, withBudget: 0, updated: 0, failed: [], withoutMarginColumns: 0 };
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    try {
      const budget = await repos.budgets.get(p.projectNumber);
      if (budget) {
        result.withBudget += 1;
        const view = computeSemaphore(budget.doc, budget.record, orders.filter((o) => o.projectNumber === p.projectNumber), rates, settings, p);
        const marginsSaved = await repos.projects.setBudgetCache(p.projectNumber, cacheOf(view));
        result.updated += 1;
        if (!marginsSaved) {
          result.withoutMarginColumns += 1;
        }
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
