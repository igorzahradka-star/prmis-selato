import { BudgetStatus, Project } from './types';
import { DEFAULT_MARGIN_THRESHOLDS } from './budgetMargin';
import { marginTooltip, projectMarginView } from './projectMargin';

const T = DEFAULT_MARGIN_THRESHOLDS;
const projekt = (extra: Partial<Project> = {}): Project => ({ budgetStatus: BudgetStatus.Bez, ...extra } as Project);

describe('marže projektu v přehledech (z cache v projektu)', () => {
  it('aktuální marže z prognózy tržeb a prognózy nákupu; semafor podle hranic', () => {
    const v = projectMarginView(projekt({ budgetRevenueForecast: 1000, costForecastTotal: 880, budgetMarginApproved: 15, budgetMarginApprovedAmount: 150 }), T);
    expect(v).toMatchObject({ known: true, forecastPercent: 12, forecastAmount: 120, approvedPercent: 15, approvedAmount: 150, status: BudgetStatus.SvetleZelena });
  });
  it('schválená nulová marže: zůstane-li nula, barva je červená; záporná je tmavě červená', () => {
    expect(projectMarginView(projekt({ budgetRevenueForecast: 1000, costForecastTotal: 1000, budgetMarginApproved: 0 }), T).status).toBe(BudgetStatus.Cervena);
    expect(projectMarginView(projekt({ budgetRevenueForecast: 1000, costForecastTotal: 1100 }), T).status).toBe(BudgetStatus.TmaveCervena);
  });
  it('změna hranic v Nastavení se projeví hned (bez přepočtu cache)', () => {
    const p = projekt({ budgetRevenueForecast: 1000, costForecastTotal: 920 }); // 8 %
    expect(projectMarginView(p, T).status).toBe(BudgetStatus.Zluta);
    expect(projectMarginView(p, { green: 12, lightGreen: 8, yellow: 3 }).status).toBe(BudgetStatus.SvetleZelena);
  });
  it('bez cache marží (starý projekt před přepočtem) platí dosavadní semafor a bublina to řekne', () => {
    const v = projectMarginView(projekt({ budgetStatus: BudgetStatus.Zluta }), T);
    expect(v).toMatchObject({ known: false, status: BudgetStatus.Zluta });
    expect(marginTooltip(v, T)).toContain('Přesná marže se zobrazí po přepočtu');
  });
  it('bez tržeb (nula) není marže definovaná', () => {
    const v = projectMarginView(projekt({ budgetRevenueForecast: 0, costForecastTotal: 50 }), T);
    expect(v).toMatchObject({ forecastPercent: undefined, status: BudgetStatus.Bez });
    expect(marginTooltip(v, T)).toContain('marže se nepočítá');
  });
  it('bublina uvádí marži, zadání a hranice', () => {
    const text = marginTooltip(projectMarginView(projekt({ budgetRevenueForecast: 1000, costForecastTotal: 880, budgetMarginApproved: 15 }), T), T);
    expect(text).toContain('Marže při prognóze 12 %');
    expect(text).toContain('Zadání (schválená marže) 15 %');
    expect(text).toContain('zelená od 15 %');
    expect(marginTooltip(projectMarginView(projekt({ budgetRevenueForecast: 1000, costForecastTotal: 880 }), T), T)).toContain('Rozpočet zatím nebyl schválen');
  });
});
