/**
 * Čísla projektu pro přehledy: celková cena, náklady a čerpání. Má-li projekt rozpočet, berou se z něj (smluvní cena = plán výnosů,
 * náklady = prognóza nákupu, skutečnost);
 * dokud rozpočet nikdo neschválil, jsou **provizorní** (přehled je ukáže šedě se štítkem „neschváleno“). Bez rozpočtu platí
 * smluvní cena z údajů projektu a čerpání z objednávek. Čistá logika bez Reactu.
 */

import { Project } from './types';

export interface ProjectFigures {
  /** Celková cena (prodej), náklady a čerpání ve zvolené měně; `undefined` = nedá se určit. */
  price?: number;
  cost?: number;
  actual?: number;
  /** Čísla jsou z rozpočtu. */
  fromBudget: boolean;
  /** Rozpočet zatím nebyl schválen — čísla jsou provizorní. */
  provisional: boolean;
}

/**
 * @param convertCzk přepočet částky v Kč do měny přehledu (součty rozpočtu jsou uložené v Kč)
 * @param convertProject přepočet částky v měně projektu do měny přehledu
 * @param ordersSpent čerpání z objednávek (platí jen u projektu bez rozpočtu)
 */
export function projectFigures(p: Project, convertCzk: (amount: number) => number, convertProject: (amount: number, currency: string) => number, ordersSpent?: number): ProjectFigures {
  if (p.budgetSaleTotal !== undefined) {
    return {
      price: convertCzk(p.budgetSaleTotal),
      // Náklady = aktuální prognóza nákupu (může se odchylovat od plánu); před přepočtem cache platí plán.
      cost: p.costForecastTotal !== undefined ? convertCzk(p.costForecastTotal) : p.budgetCostTotal !== undefined ? convertCzk(p.budgetCostTotal) : undefined,
      actual: p.budgetActualTotal !== undefined ? convertCzk(p.budgetActualTotal) : undefined,
      fromBudget: true,
      provisional: p.budgetApproved !== true
    };
  }
  return {
    price: p.contractPriceNet === undefined ? undefined : convertProject(p.contractPriceNet, p.currency),
    cost: undefined,
    actual: ordersSpent,
    fromBudget: false,
    provisional: false
  };
}
