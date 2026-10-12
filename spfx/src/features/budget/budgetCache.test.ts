import { createMockRepositories } from '../../data/mock/mockRepositories';
import { DEFAULT_SETTINGS } from '../../core/settings';
import { RateTable } from '../../core/currency';
import { BudgetStatus as Semafor } from '../../core/types';
import { legacyStatusOf } from '../../core/budgetMargin';
import { computeSemaphore, refreshBudgetCache } from './budgetCache';

// Při plné zátěži počítače (celý běh testů) trvá ukázkový repozitář déle než výchozích 5 s.
jest.setTimeout(30000);

const RATES = { EUR: 25, USD: 20, source: 'test' } as unknown as RateTable;

describe('semafor rozpočtu v projektu', () => {
  it('rozpočet bez schválení nemá baseline ani marži zadání, semafor se ale počítá z marže prognózy', async () => {
    const r = createMockRepositories();
    const b = await r.budgets.get('25001');
    expect(b).toBeDefined();
    const view = computeSemaphore(b!.doc, { ...b!.record, approvals: [] }, [], RATES, DEFAULT_SETTINGS);
    expect(view.status).not.toBe(Semafor.Bez);
    expect(view.marginPercent).toBeDefined();
    expect(view.baselineCost).toBeUndefined();
    expect(view.approvedMarginPercent).toBeUndefined();
    expect(view.approved).toBe(false);
  });

  it('refreshBudgetCache zapíše semafor, baseline a prognózu do projektu; podruhé už nic nemění', async () => {
    const r = createMockRepositories();
    const project = (await r.projects.getByNumber('25001'))!;
    const b = (await r.budgets.get('25001'))!;
    const orders = await r.orders.list({ projectNumber: '25001' });
    const expected = computeSemaphore(b.doc, b.record, orders, RATES, DEFAULT_SETTINGS);
    await refreshBudgetCache(r, project, DEFAULT_SETTINGS, RATES);
    const after = (await r.projects.getByNumber('25001'))!;
    expect(after.budgetStatus).toBe(legacyStatusOf(expected.status as Semafor));
    expect(after.budgetBaselineTotal).toBe(expected.baselineCost);
    expect(after.costForecastTotal).toBe(expected.forecastCost);
    expect(after.budgetRevenueForecast).toBe(expected.revenueForecast);
    expect(after.budgetMarginApproved).toBe(expected.approvedMarginPercent);
    const spy = jest.spyOn(r.projects, 'setBudgetCache');
    await refreshBudgetCache(r, after, DEFAULT_SETTINGS, RATES);
    expect(spy).not.toHaveBeenCalled();
  });

  it('projekt bez rozpočtu nebo chyba zápisu nevyhodí chybu', async () => {
    const r = createMockRepositories();
    const project = (await r.projects.getByNumber('25003'))!;
    await expect(refreshBudgetCache(r, project, DEFAULT_SETTINGS, RATES)).resolves.toBeUndefined();
    const p1 = (await r.projects.getByNumber('25001'))!;
    jest.spyOn(r.projects, 'setBudgetCache').mockRejectedValue(new Error('nemáte právo'));
    await expect(refreshBudgetCache(r, { ...p1, budgetStatus: Semafor.Cervena }, DEFAULT_SETTINGS, RATES)).resolves.toBeUndefined();
  });
});
