import {
  DEFAULT_WEB_LIST,
  defaultAppPageUrl,
  projectDetailUrl,
  selectWebProjects,
  validateWebList,
  webListWithDefaults,
  webPrice
} from './webProjects';
import { BudgetStatus, Project, ProjectStatus } from './types';

function project(over: Partial<Project>): Project {
  return {
    id: 1,
    projectNumber: '26001',
    title: 'Projekt',
    status: ProjectStatus.Realizace,
    currency: 'CZK',
    isOverhead: false,
    budgetStatus: BudgetStatus.Bez,
    ...over
  };
}

describe('seznam projektů na webu', () => {
  it('výchozí nastavení ukazuje jen Přípravu a Realizaci', () => {
    expect(DEFAULT_WEB_LIST.statuses).toEqual([ProjectStatus.Priprava, ProjectStatus.Realizace]);
  });

  it('filtruje podle stavu, vynechá Režii a řadí podle čísla projektu vzestupně bez ohledu na stav', () => {
    const list = [
      project({ projectNumber: '25001', status: ProjectStatus.Dokonceno }),
      project({ projectNumber: '25005', status: ProjectStatus.Priprava }),
      project({ projectNumber: '26010', status: ProjectStatus.Realizace }),
      project({ projectNumber: '26001', status: ProjectStatus.Realizace }),
      project({ projectNumber: '99901', status: ProjectStatus.Realizace, isOverhead: true }),
      project({ projectNumber: '26020', status: ProjectStatus.Nabidka })
    ];
    expect(selectWebProjects(list, DEFAULT_WEB_LIST).map((p) => p.projectNumber)).toEqual(['25005', '26001', '26010']);
  });

  it('po zaškrtnutí dalšího stavu se projekty v něm objeví', () => {
    const list = [project({ projectNumber: '25001', status: ProjectStatus.Reklamace }), project({ projectNumber: '26001' })];
    const s = { ...DEFAULT_WEB_LIST, statuses: [ProjectStatus.Realizace, ProjectStatus.Reklamace] };
    expect(selectWebProjects(list, s).map((p) => p.projectNumber)).toEqual(['25001', '26001']);
  });

  it('cena: prodej z rozpočtu v Kč (provizorní, dokud není schválený), jinak smluvní cena v měně projektu, jinak nic', () => {
    expect(webPrice(project({ budgetSaleTotal: 5000000, budgetApproved: true }))).toEqual({ amount: 5000000, currency: 'CZK', provisional: false });
    expect(webPrice(project({ budgetSaleTotal: 5000000, budgetApproved: false }))?.provisional).toBe(true);
    expect(webPrice(project({ contractPriceNet: 120000, currency: 'EUR' }))).toEqual({ amount: 120000, currency: 'EUR', provisional: false });
    expect(webPrice(project({}))).toBeUndefined();
  });

  it('odkazy: detail projektu a výchozí stránka aplikace', () => {
    expect(defaultAppPageUrl('https://x.sharepoint.com/sites/RES/')).toBe('https://x.sharepoint.com/sites/RES/SitePages/PRM.aspx');
    expect(projectDetailUrl('https://x/SitePages/PRM.aspx#/projekty', '26001')).toBe('https://x/SitePages/PRM.aspx#/projekt/26001');
  });

  it('nastavení: chybějící nebo poškozené hodnoty se nahradí výchozími; kontrola hlídá prázdné stavy a počet řádků', () => {
    expect(webListWithDefaults(undefined)).toEqual(DEFAULT_WEB_LIST);
    expect(webListWithDefaults({ statuses: 'x' as unknown as string[], maxRows: NaN }).statuses).toEqual(DEFAULT_WEB_LIST.statuses);
    expect(webListWithDefaults({ statuses: [ProjectStatus.Realizace], maxRows: 30, showPrice: false })).toEqual({ statuses: [ProjectStatus.Realizace], maxRows: 30, showPrice: false });
    expect(validateWebList(DEFAULT_WEB_LIST)).toEqual([]);
    expect(validateWebList({ ...DEFAULT_WEB_LIST, statuses: [] })).toHaveLength(1);
    expect(validateWebList({ ...DEFAULT_WEB_LIST, maxRows: 0 })).toHaveLength(1);
    expect(validateWebList({ ...DEFAULT_WEB_LIST, maxRows: 500 })).toHaveLength(1);
  });
});
