/**
 * Ukázková data pro vývoj UI a předvedení aplikace bez SharePointu.
 *
 * Data jsou smyšlená, ale realistická — odpovídají typům zakázek RES
 * (FVE, BESS, připojení do distribuční soustavy, servis).
 * Slouží k ladění vzhledu, ne k testování logiky.
 */

import { BudgetStatus, Partner, PartnerType, Project, ProjectStatus, ProjectTask, Role, TaskType } from '../../core/types';
import { ProjectFile } from '../repositories';
import { Person } from '../../core/userAdmin';

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
    projectNumber: '25001',
    title: '25001 ČEZ Distribuce – Havlíčkův Brod – Připojení DS',
    shortName: 'Připojení HB',
    customerName: 'ČEZ Distribuce, a.s.',
    projectManagerName: 'Igor Zahrádka',
    status: ProjectStatus.Realizace,
    projectType: 'Připojení DS',
    location: 'Havlíčkův Brod',
    latitude: 49.6078,
    longitude: 15.5808,
    contractPriceNet: 4850000,
    currency: 'CZK',
    startDate: den(-120),
    endDatePlanned: den(45),
    nextDeadline: den(9),
    folderUrl: '#/ukazkovy-rezim/slozka/2025/25001',
    isOverhead: false,
    budgetStatus: BudgetStatus.Zelena,
    budgetBaselineTotal: 3900000,
    costForecastTotal: 3820000
  },
  {
    id: 2,
    projectNumber: '25002',
    title: '25002 AgroFarma Lipnice – Lipnice nad Sázavou – FVE',
    shortName: 'FVE Lipnice',
    customerName: 'AgroFarma Lipnice s.r.o.',
    projectManagerName: 'Jan Novák',
    status: ProjectStatus.Realizace,
    projectType: 'FVE',
    location: 'Lipnice nad Sázavou',
    latitude: 49.6167,
    longitude: 15.4,
    contractPriceNet: 12400000,
    currency: 'CZK',
    startDate: den(-90),
    endDatePlanned: den(75),
    nextDeadline: den(3),
    folderUrl: '#/ukazkovy-rezim/slozka/2025/25002',
    isOverhead: false,
    budgetStatus: BudgetStatus.Zluta,
    budgetBaselineTotal: 9800000,
    costForecastTotal: 10100000
  },
  {
    id: 3,
    projectNumber: '25003',
    title: '25003 Teplárna Chotěboř – Chotěboř – BESS',
    shortName: 'BESS Chotěboř',
    customerName: 'Teplárna Chotěboř a.s.',
    projectManagerName: 'Jan Novák',
    status: ProjectStatus.Realizace,
    projectType: 'BESS',
    location: 'Chotěboř',
    latitude: 49.7208,
    longitude: 15.6717,
    contractPriceNet: 28900000,
    currency: 'CZK',
    startDate: den(-150),
    endDatePlanned: den(30),
    nextDeadline: den(-2),
    folderUrl: '#/ukazkovy-rezim/slozka/2025/25003',
    isOverhead: false,
    budgetStatus: BudgetStatus.Cervena,
    budgetBaselineTotal: 23000000,
    costForecastTotal: 24900000
  },
  {
    id: 4,
    projectNumber: '25004',
    title: '25004 Město Přibyslav – Přibyslav – FVE',
    shortName: 'FVE Přibyslav',
    customerName: 'Město Přibyslav',
    projectManagerName: 'Eva Malá',
    status: ProjectStatus.Priprava,
    projectType: 'FVE',
    location: 'Habry',
    latitude: 49.6228,
    longitude: 15.4664,
    contractPriceNet: 3150000,
    currency: 'CZK',
    startDate: den(-20),
    endDatePlanned: den(160),
    nextDeadline: den(21),
    folderUrl: '#/ukazkovy-rezim/slozka/2025/25004',
    isOverhead: false,
    budgetStatus: BudgetStatus.Bez,
    budgetBaselineTotal: undefined,
    costForecastTotal: undefined
  },
  {
    id: 5,
    projectNumber: '25005',
    title: '25005 Pila Světlá – Světlá nad Sázavou – Kogenerace',
    shortName: 'KGJ Světlá',
    customerName: 'Pila Světlá s.r.o.',
    projectManagerName: 'Eva Malá',
    status: ProjectStatus.Nabidka,
    projectType: 'Kogenerace',
    location: 'Světlá nad Sázavou',
    latitude: 49.6667,
    longitude: 15.4045,
    contractPriceNet: 8700000,
    currency: 'CZK',
    endDatePlanned: den(240),
    folderUrl: '#/ukazkovy-rezim/slozka/2025/25005',
    isOverhead: false,
    budgetStatus: BudgetStatus.Bez
  },
  {
    id: 6,
    projectNumber: '25018',
    title: '25018 ZD Habry – Habry – FVE',
    shortName: 'FVE Habry',
    customerName: 'ZD Habry',
    projectManagerName: 'Igor Zahrádka',
    status: ProjectStatus.Dokonceno,
    projectType: 'FVE',
    location: 'Habry',
    latitude: 49.6228,
    longitude: 15.4664,
    contractPriceNet: 6300000,
    currency: 'CZK',
    startDate: den(-400),
    endDatePlanned: den(-70),
    endDateActual: den(-58),
    folderUrl: '#/ukazkovy-rezim/slozka/2025/25018',
    isOverhead: false,
    budgetStatus: BudgetStatus.Zelena,
    budgetBaselineTotal: 5100000,
    costForecastTotal: 4980000
  },
  {
    id: 7,
    projectNumber: '25022',
    title: '25022 Solar Vysočina – Golčův Jeníkov – Servis',
    shortName: 'Servis Golčův Jeníkov',
    customerName: 'Solar Vysočina s.r.o.',
    projectManagerName: 'Jan Novák',
    status: ProjectStatus.Pozastaveno,
    projectType: 'Servis',
    location: 'Habry',
    latitude: 49.6228,
    longitude: 15.4664,
    contractPriceNet: 890000,
    currency: 'CZK',
    startDate: den(-200),
    endDatePlanned: den(120),
    folderUrl: '#/ukazkovy-rezim/slozka/2025/25022',
    isOverhead: false,
    budgetStatus: BudgetStatus.Zluta,
    budgetBaselineTotal: 620000,
    costForecastTotal: 640000
  },
  {
    id: 99,
    projectNumber: '26999',
    title: '26999 Režie RES 2026',
    shortName: 'Režie 2026',
    customerName: undefined,
    projectManagerName: 'Igor Zahrádka',
    status: ProjectStatus.Realizace,
    projectType: 'Režie',
    location: undefined,
    contractPriceNet: undefined,
    currency: 'CZK',
    startDate: den(-254),
    folderUrl: '#/ukazkovy-rezim/slozka/2026/26999',
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
    projectNumber: '25001',
    title: 'Předání přípojky do zkušebního provozu',
    taskType: TaskType.Milnik,
    finishDate: den(9),
    isContractualDeadline: true,
    percentComplete: 0,
    responsibleName: 'Igor Zahrádka'
  },
  {
    id: 2,
    projectNumber: '25001',
    title: 'Dokončení revizí',
    taskType: TaskType.Milnik,
    finishDate: den(34),
    isContractualDeadline: true,
    percentComplete: 0
  },
  {
    id: 3,
    projectNumber: '25001',
    title: 'Předání projektové dokumentace',
    taskType: TaskType.Milnik,
    finishDate: den(-40),
    isContractualDeadline: true,
    percentComplete: 100,
    responsibleName: 'Igor Zahrádka'
  },
  {
    id: 4,
    projectNumber: '25002',
    title: 'Dodávka panelů na stavbu',
    taskType: TaskType.DodavkaMaterialu,
    finishDate: den(3),
    isContractualDeadline: true,
    percentComplete: 60,
    responsibleName: 'Jan Novák'
  },
  {
    id: 5,
    projectNumber: '25003',
    title: 'Uvedení bateriového úložiště do provozu',
    taskType: TaskType.Milnik,
    finishDate: den(-2),
    isContractualDeadline: true,
    percentComplete: 80,
    responsibleName: 'Jan Novák'
  },
  {
    id: 6,
    projectNumber: '25004',
    title: 'Podpis smlouvy o připojení',
    taskType: TaskType.Milnik,
    finishDate: den(21),
    isContractualDeadline: true,
    percentComplete: 0,
    responsibleName: 'Eva Malá'
  }
];

/**
 * Soubory ve složce projektu pro ukázkový režim. Časy doplní repozitář,
 * aby ukázka nezestárla; tady je jen názvosloví a rozložení do podsložek.
 */
export const MOCK_FILES: Omit<ProjectFile, 'url' | 'modified'>[] = [
  {
    name: 'OBJ-26014 Trafostanice.pdf',
    relativeFolder: '03-Nákup/Objednávky',
    sizeBytes: 184320,
    modifiedByName: 'Igor Zahrádka'
  },
  {
    name: 'Realizační rozpočet v3.xlsx',
    relativeFolder: '03-Rozpočet projektu',
    sizeBytes: 96256,
    modifiedByName: 'Jan Novák'
  },
  {
    name: 'Smlouva o dílo – podepsaná.pdf',
    relativeFolder: '05-Smlouvy',
    sizeBytes: 2458624,
    modifiedByName: 'Igor Zahrádka'
  },
  {
    name: 'Fotodokumentace montáže.zip',
    relativeFolder: '07-Dokumentace a podklady',
    sizeBytes: 48234496,
    modifiedByName: 'Eva Malá'
  },
  {
    name: 'PP-26014-01 Předávací protokol.pdf',
    relativeFolder: '07-Dokumentace a podklady',
    sizeBytes: 137216,
    modifiedByName: 'Jan Novák'
  },
  {
    name: 'Zápis z kontrolního dne 12.docx',
    relativeFolder: '07-Dokumentace a podklady',
    sizeBytes: 45056,
    modifiedByName: 'Igor Zahrádka'
  },
  {
    name: 'Revizní zpráva NN.pdf',
    relativeFolder: '07-Dokumentace a podklady',
    sizeBytes: 312320,
    modifiedByName: 'Eva Malá'
  },
  {
    name: 'Podklad pro fakturaci 26014-02.pdf',
    relativeFolder: '03-Rozpočet projektu/Fakturace',
    sizeBytes: 118784,
    modifiedByName: 'Jan Novák'
  },
  {
    name: 'Situační výkres.pdf',
    relativeFolder: '',
    sizeBytes: 1548288,
    modifiedByName: 'Igor Zahrádka'
  },
  {
    name: 'Harmonogram prací.xlsx',
    relativeFolder: '',
    sizeBytes: 78848,
    modifiedByName: 'Igor Zahrádka'
  }
];

/**
 * Adresář firmy pro ukázkový režim — koho vyhodí hledání při přidávání
 * do role. Na ostro se hledá v Entra ID přes výběr osob SharePointu.
 */
export const MOCK_DIRECTORY: Person[] = [
  { id: 11, loginName: 'i:0#.f|membership|igor.zahradka@revoltum.cz', displayName: 'Igor Zahrádka', email: 'igor.zahradka@revoltum.cz' },
  { id: 12, loginName: 'i:0#.f|membership|jan.novak@revoltum.cz', displayName: 'Jan Novák', email: 'jan.novak@revoltum.cz' },
  { id: 13, loginName: 'i:0#.f|membership|eva.mala@revoltum.cz', displayName: 'Eva Malá', email: 'eva.mala@revoltum.cz' },
  { id: 14, loginName: 'i:0#.f|membership|petr.dvorak@revoltum.cz', displayName: 'Petr Dvořák', email: 'petr.dvorak@revoltum.cz' },
  { id: 15, loginName: 'i:0#.f|membership|lucie.horakova@revoltum.cz', displayName: 'Lucie Horáková', email: 'lucie.horakova@revoltum.cz' },
  { id: 16, loginName: 'i:0#.f|membership|martin.svoboda@revoltum.cz', displayName: 'Martin Svoboda', email: 'martin.svoboda@revoltum.cz' },
  { id: 17, loginName: 'i:0#.f|membership|tereza.benesova@revoltum.cz', displayName: 'Tereza Benešová', email: 'tereza.benesova@revoltum.cz' }
];

/** Kdo je v ukázkovém režimu v které roli. */
export const MOCK_ROLE_MEMBERS: { role: Role; members: Person[] }[] = [
  { role: Role.Administrator, members: [MOCK_DIRECTORY[0]] },
  { role: Role.Vedeni, members: [MOCK_DIRECTORY[0], MOCK_DIRECTORY[3]] },
  { role: Role.Jednatel, members: [MOCK_DIRECTORY[3]] },
  { role: Role.Finance, members: [MOCK_DIRECTORY[0], MOCK_DIRECTORY[4]] },
  { role: Role.ProjektovyManazer, members: [MOCK_DIRECTORY[0], MOCK_DIRECTORY[1], MOCK_DIRECTORY[2]] },
  { role: Role.AsistentPM, members: [MOCK_DIRECTORY[5]] },
  { role: Role.Ctenar, members: [MOCK_DIRECTORY[6]] }
];

/**
 * Složky v kořenové složce projektů — podklad pro import.
 *
 * Schválně **skutečné názvy z knihovny RES** (`Dokumenty\General\01_PROJEKTY`,
 * stav k 23. 9. 2026), aby šlo import vyzkoušet na tom, co se bude importovat
 * doopravdy — včetně pomocné složky `00_Project tools`, která projekt není.
 */
export const MOCK_PROJECT_FOLDERS: string[] = [
  '00_Project tools',
  '26001-MASTIROVICE 1 GENERALNI OPRAVA',
  '26002-MASTIROVICE 2 - BESS',
  '26003-BORSOV MORAVSKA TREBOVA',
  '26004-DOHLEDOVY SYSTEM',
  '26005-DOPLNENI STRIDACU MASTIROVICE 1'
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
  },
  {
    id: 7,
    name: 'Solar Komponenten GmbH',
    partnerType: PartnerType.Dodavatel,
    country: 'DE',
    ico: 'HRB 123456',
    dic: 'DE123456789',
    isVatPayer: true,
    address: 'Sonnenallee 12, 80331 München, Německo',
    contactName: 'Hans Becker',
    email: 'becker@solar-komponenten.example',
    paymentTermDays: 30,
    isActive: true
  }
];

// Výchozí číselné řady jsou v `data/defaultDocTypes.ts` (používá je i ostrá implementace).
export { DEFAULT_DOC_TYPES } from '../defaultDocTypes';
