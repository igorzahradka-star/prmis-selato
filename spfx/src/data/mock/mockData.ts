/**
 * Ukázková data pro vývoj UI a předvedení aplikace bez SharePointu.
 *
 * Data jsou smyšlená, ale realistická — odpovídají typům zakázek RES
 * (FVE, BESS, připojení do distribuční soustavy, servis).
 * Slouží k ladění vzhledu, ne k testování logiky.
 */

import { BudgetStatus, Partner, PartnerType, Project, ProjectStatus, ProjectTask, Role, TaskType } from '../../core/types';
import { DocTypeConfig } from '../repositories';

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

/**
 * Smluvní termíny ukázkových projektů. Data jsou zvolená tak, aby šly vidět
 * všechny stavy: termín v budoucnu, termín za pár dní, zmeškaný i splněný.
 * Odpovídají hodnotám `nextDeadline` u projektů výše.
 */
export const MOCK_TASKS: ProjectTask[] = [
  {
    id: 1,
    projectNumber: '26-001',
    title: 'Předání přípojky do zkušebního provozu',
    taskType: TaskType.Milnik,
    finishDate: den(9),
    isContractualDeadline: true,
    percentComplete: 0,
    responsibleName: 'Igor Zahrádka'
  },
  {
    id: 2,
    projectNumber: '26-001',
    title: 'Dokončení revizí',
    taskType: TaskType.Milnik,
    finishDate: den(34),
    isContractualDeadline: true,
    percentComplete: 0
  },
  {
    id: 3,
    projectNumber: '26-001',
    title: 'Předání projektové dokumentace',
    taskType: TaskType.Milnik,
    finishDate: den(-40),
    isContractualDeadline: true,
    percentComplete: 100,
    responsibleName: 'Igor Zahrádka'
  },
  {
    id: 4,
    projectNumber: '26-002',
    title: 'Dodávka panelů na stavbu',
    taskType: TaskType.DodavkaMaterialu,
    finishDate: den(3),
    isContractualDeadline: true,
    percentComplete: 60,
    responsibleName: 'Jan Novák'
  },
  {
    id: 5,
    projectNumber: '26-003',
    title: 'Uvedení bateriového úložiště do provozu',
    taskType: TaskType.Milnik,
    finishDate: den(-2),
    isContractualDeadline: true,
    percentComplete: 80,
    responsibleName: 'Jan Novák'
  },
  {
    id: 6,
    projectNumber: '26-004',
    title: 'Podpis smlouvy o připojení',
    taskType: TaskType.Milnik,
    finishDate: den(21),
    isContractualDeadline: true,
    percentComplete: 0,
    responsibleName: 'Eva Malá'
  }
];

export const MOCK_PARTNERS: Partner[] = [
  {
    id: 1,
    name: 'ČEZ Distribuce, a.s.',
    partnerType: PartnerType.Zakaznik,
    ico: '24729035',
    dic: 'CZ24729035',
    isVatPayer: true,
    address: 'Teplická 874/8, 405 02 Děčín',
    contactName: 'Petra Svobodová',
    email: 'svobodova@cezdistribuce.cz',
    phone: '+420 601 100 200',
    paymentTermDays: 30,
    isActive: true
  },
  {
    id: 2,
    name: 'AgroFarma Lipnice s.r.o.',
    partnerType: PartnerType.Zakaznik,
    ico: '28112233',
    isVatPayer: false,
    address: 'Lipnice nad Sázavou 45, 582 32',
    contactName: 'Martin Král',
    email: 'kral@agrolipnice.cz',
    phone: '+420 602 300 400',
    paymentTermDays: 30,
    isActive: true
  },
  {
    id: 3,
    name: 'Teplárna Chotěboř a.s.',
    partnerType: PartnerType.Zakaznik,
    ico: '25887744',
    dic: 'CZ25887744',
    isVatPayer: true,
    contactName: 'Ing. Pavel Dvořák',
    email: 'dvorak@teplarnachb.cz',
    paymentTermDays: 45,
    isActive: true
  },
  {
    id: 4,
    name: 'Město Přibyslav',
    partnerType: PartnerType.Zakaznik,
    ico: '00268097',
    isVatPayer: false,
    address: 'Bechyňovo náměstí 1, 582 22 Přibyslav',
    paymentTermDays: 30,
    isActive: true
  },
  {
    id: 5,
    name: 'FVE Komponenty s.r.o.',
    partnerType: PartnerType.Dodavatel,
    ico: '06556677',
    dic: 'CZ06556677',
    isVatPayer: true,
    contactName: 'Jana Nová',
    email: 'obchod@fvekomponenty.cz',
    phone: '+420 725 111 222',
    paymentTermDays: 14,
    isActive: true
  },
  {
    id: 6,
    name: 'ElektroMontáže Vysočina s.r.o.',
    partnerType: PartnerType.Oboji,
    ico: '04998877',
    isVatPayer: false,
    contactName: 'Tomáš Beneš',
    email: 'benes@elektromontaze-vysocina.cz',
    phone: '+420 606 555 111',
    paymentTermDays: 21,
    isActive: true
  }
];

/**
 * Výchozí číselné řady (PRM_DocTypes) — návrh podle zadání kap. 7.
 * Administrátor je bude moct upravit v Nastavení; tohle je jen startovní sada.
 */
export const DEFAULT_DOC_TYPES: DocTypeConfig[] = [
  {
    code: 'PRJ',
    name: 'Číslo projektu',
    pattern: '{YY}-{N}',
    padding: 3,
    resetPeriod: 'Ročně',
    scope: 'Globální',
    startValue: 1,
    active: true
  },
  {
    code: 'OBJ',
    name: 'Objednávka',
    pattern: 'OBJ-{YYYY}-{N}',
    padding: 4,
    resetPeriod: 'Ročně',
    scope: 'Globální',
    startValue: 1,
    active: true
  },
  {
    code: 'FP',
    name: 'Podklad pro fakturaci',
    pattern: 'FP{YY}{N}',
    padding: 3,
    resetPeriod: 'Ročně',
    scope: 'Globální',
    startValue: 1,
    active: true
  },
  {
    code: 'PP',
    name: 'Předávací protokol',
    pattern: 'PP-{PRJ}-{N}',
    padding: 2,
    resetPeriod: 'Nikdy',
    scope: 'Projekt',
    startValue: 1,
    active: true
  }
];
