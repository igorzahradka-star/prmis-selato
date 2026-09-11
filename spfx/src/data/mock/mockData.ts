/**
 * Ukázková data pro vývoj UI a předvedení aplikace bez SharePointu.
 *
 * Data jsou smyšlená, ale realistická — odpovídají typům zakázek RES
 * (FVE, BESS, připojení do distribuční soustavy, servis).
 * Slouží k ladění vzhledu, ne k testování logiky.
 */

import { BudgetStatus, Project, ProjectStatus, Role } from '../../core/types';

/** Pomocník: datum relativně ke dnešku, aby ukázka nezestárla. */
function den(offset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

export const MOCK_USER = {
  id: 11,
  loginName: 'i:0#.f|membership|igor.zahradka@revoltum.cz',
  displayName: 'Igor Zahrádka',
  email: 'igor.zahradka@revoltum.cz',
  roles: [Role.Administrator, Role.Vedeni, Role.Finance, Role.ProjektovyManazer],
  isSiteAdmin: true,
  hasFinanceAccess: true
};

export const MOCK_PROJECTS: Project[] = [
  {
    id: 1,
    projectNumber: '26-001',
    title: '26-001 ČEZ Distribuce – Havlíčkův Brod – Připojení DS',
    shortName: 'Připojení HB',
    customerName: 'ČEZ Distribuce, a.s.',
    projectManagerName: 'Igor Zahrádka',
    status: ProjectStatus.Realizace,
    projectType: 'Připojení DS',
    location: 'Havlíčkův Brod',
    contractPriceNet: 4850000,
    currency: 'CZK',
    startDate: den(-120),
    endDatePlanned: den(45),
    nextDeadline: den(9),
    isOverhead: false,
    budgetStatus: BudgetStatus.Zelena,
    budgetBaselineTotal: 3900000,
    costForecastTotal: 3820000
  },
  {
    id: 2,
    projectNumber: '26-002',
    title: '26-002 AgroFarma Lipnice – Lipnice nad Sázavou – FVE',
    shortName: 'FVE Lipnice',
    customerName: 'AgroFarma Lipnice s.r.o.',
    projectManagerName: 'Jan Novák',
    status: ProjectStatus.Realizace,
    projectType: 'FVE',
    location: 'Lipnice nad Sázavou',
    contractPriceNet: 12400000,
    currency: 'CZK',
    startDate: den(-90),
    endDatePlanned: den(75),
    nextDeadline: den(3),
    isOverhead: false,
    budgetStatus: BudgetStatus.Zluta,
    budgetBaselineTotal: 9800000,
    costForecastTotal: 10100000
  },
  {
    id: 3,
    projectNumber: '26-003',
    title: '26-003 Teplárna Chotěboř – Chotěboř – BESS',
    shortName: 'BESS Chotěboř',
    customerName: 'Teplárna Chotěboř a.s.',
    projectManagerName: 'Jan Novák',
    status: ProjectStatus.Realizace,
    projectType: 'BESS',
    location: 'Chotěboř',
    contractPriceNet: 28900000,
    currency: 'CZK',
    startDate: den(-150),
    endDatePlanned: den(30),
    nextDeadline: den(-2),
    isOverhead: false,
    budgetStatus: BudgetStatus.Cervena,
    budgetBaselineTotal: 23000000,
    costForecastTotal: 24900000
  },
  {
    id: 4,
    projectNumber: '26-004',
    title: '26-004 Město Přibyslav – Přibyslav – FVE',
    shortName: 'FVE Přibyslav',
    customerName: 'Město Přibyslav',
    projectManagerName: 'Eva Malá',
    status: ProjectStatus.Priprava,
    projectType: 'FVE',
    location: 'Přibyslav',
    contractPriceNet: 3150000,
    currency: 'CZK',
    startDate: den(-20),
    endDatePlanned: den(160),
    nextDeadline: den(21),
    isOverhead: false,
    budgetStatus: BudgetStatus.Bez,
    budgetBaselineTotal: undefined,
    costForecastTotal: undefined
  },
  {
    id: 5,
    projectNumber: '26-005',
    title: '26-005 Pila Světlá – Světlá nad Sázavou – Kogenerace',
    shortName: 'KGJ Světlá',
    customerName: 'Pila Světlá s.r.o.',
    projectManagerName: 'Eva Malá',
    status: ProjectStatus.Nabidka,
    projectType: 'Kogenerace',
    location: 'Světlá nad Sázavou',
    contractPriceNet: 8700000,
    currency: 'CZK',
    endDatePlanned: den(240),
    isOverhead: false,
    budgetStatus: BudgetStatus.Bez
  },
  {
    id: 6,
    projectNumber: '25-018',
    title: '25-018 ZD Habry – Habry – FVE',
    shortName: 'FVE Habry',
    customerName: 'ZD Habry',
    projectManagerName: 'Igor Zahrádka',
    status: ProjectStatus.Dokonceno,
    projectType: 'FVE',
    location: 'Habry',
    contractPriceNet: 6300000,
    currency: 'CZK',
    startDate: den(-400),
    endDatePlanned: den(-70),
    endDateActual: den(-58),
    isOverhead: false,
    budgetStatus: BudgetStatus.Zelena,
    budgetBaselineTotal: 5100000,
    costForecastTotal: 4980000
  },
  {
    id: 7,
    projectNumber: '25-022',
    title: '25-022 Solar Vysočina – Golčův Jeníkov – Servis',
    shortName: 'Servis Golčův Jeníkov',
    customerName: 'Solar Vysočina s.r.o.',
    projectManagerName: 'Jan Novák',
    status: ProjectStatus.Pozastaveno,
    projectType: 'Servis',
    location: 'Golčův Jeníkov',
    contractPriceNet: 890000,
    currency: 'CZK',
    startDate: den(-200),
    endDatePlanned: den(120),
    isOverhead: false,
    budgetStatus: BudgetStatus.Zluta,
    budgetBaselineTotal: 620000,
    costForecastTotal: 640000
  },
  {
    id: 99,
    projectNumber: '26-000',
    title: '26-000 Režie RES',
    shortName: 'Režie',
    customerName: undefined,
    projectManagerName: 'Igor Zahrádka',
    status: ProjectStatus.Realizace,
    projectType: 'Režie',
    location: undefined,
    contractPriceNet: undefined,
    currency: 'CZK',
    startDate: den(-254),
    isOverhead: true,
    budgetStatus: BudgetStatus.Bez
  }
];
