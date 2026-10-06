import {
  aiPrompt,
  customerLabel,
  defaultOverview,
  formatPower,
  overviewFileName,
  overviewFromJson,
  overviewToJson,
  overviewWarnings,
  paramLines,
  templateText
} from './projectOverview';
import { BudgetStatus, Project, ProjectStatus } from './types';

const bess: Project = {
  id: 3,
  projectNumber: '25003',
  title: '25003 Teplárna Chotěboř – Chotěboř – BESS',
  customerName: 'Teplárna Chotěboř a.s.',
  status: ProjectStatus.Realizace,
  projectType: 'BESS',
  location: 'Chotěboř',
  latitude: 49.72,
  longitude: 15.67,
  currency: 'CZK',
  isOverhead: false,
  budgetStatus: BudgetStatus.Bez,
  contractPriceNet: 28900000,
  startDate: new Date(2025, 3, 1),
  endDatePlanned: new Date(2026, 5, 30)
};

describe('Project overview — výchozí hodnoty a uložení', () => {
  it('výchozí přehled podle typu projektu: předmět, rok, jednotka, mapa', () => {
    const o = defaultOverview(bess);
    expect(o.subject).toEqual({ cs: 'Realizace bateriového úložiště', en: 'Battery energy storage system' });
    expect(o.year).toBe(2026);
    expect(o.powerUnit).toBe('kW');
    expect(o.showMap).toBe(true);
    expect(defaultOverview({ ...bess, projectType: 'FVE', latitude: undefined }).powerUnit).toBe('kWp');
    expect(defaultOverview({ ...bess, projectType: 'FVE', latitude: undefined }).showMap).toBe(false);
    expect(defaultOverview({ ...bess, projectType: 'Jiné' }).subject.cs).toBe('Realizace energetického projektu');
  });

  it('uloží a přečte JSON; poškozený nebo chybějící se nahradí výchozím; fotek nejvýš 6', () => {
    const o = { ...defaultOverview(bess), power: 2000, capacity: 4400, capacityUnit: 'kWh' as const, customerConsent: true, year: undefined };
    o.photos = Array.from({ length: 8 }, (_, i) => ({ folder: 'FOTO/2026-03-01 Montáž', name: `f${i}.jpg` }));
    const back = overviewFromJson(overviewToJson(o), bess);
    expect(back.power).toBe(2000);
    expect(back.customerConsent).toBe(true);
    expect(back.year).toBeUndefined();
    expect(back.photos).toHaveLength(6);
    expect(overviewFromJson('{rozbité', bess)).toEqual(defaultOverview(bess));
    expect(overviewFromJson(undefined, bess)).toEqual(defaultOverview(bess));
    expect(overviewFromJson(JSON.stringify({ powerUnit: 'GW' }), bess).powerUnit).toBe('kW');
  });
});

describe('Project overview — texty', () => {
  const o = { ...defaultOverview(bess), power: 2000, capacity: 4.4, capacityUnit: 'MWh' as const, params: { cs: 'Baterie: LFP\nStřídače: 4 ks', en: 'Batteries: LFP' } };

  it('zákazník jménem jen se souhlasem, jinak obecně', () => {
    expect(customerLabel(o, bess, 'cs')).toBe('průmyslová společnost');
    expect(customerLabel({ ...o, customerConsent: true }, bess, 'en')).toBe('Teplárna Chotěboř a.s.');
  });

  it('výkon a parametry se formátují podle jazyka', () => {
    expect(formatPower(o, 'cs')).toBe('2 000 kW');
    expect(formatPower(o, 'en')).toBe('2,000 kW');
    expect(paramLines(o, 'cs')).toEqual([
      { label: 'Baterie', value: 'LFP' },
      { label: 'Střídače', value: '4 ks' }
    ]);
  });

  it('návrh textu ze šablony česky i anglicky obsahuje fakta a žádnou cenu', () => {
    const cs = templateText(o, bess, 'Revoltum Engineering & Services', 'cs');
    expect(cs).toContain('Realizace bateriového úložiště v lokalitě Chotěboř.');
    expect(cs).toContain('v roce 2026');
    expect(cs).toContain('objednatelem je průmyslová společnost');
    expect(cs).toContain('4,4 MWh');
    expect(cs).not.toContain('28');
    const en = templateText(o, bess, 'Revoltum Engineering & Services', 'en');
    expect(en).toContain('Battery energy storage system in Chotěboř.');
    expect(en).toContain('for an industrial company');
  });

  it('zadání pro AI: fakta, jazyk a pokyny; bez ceny a bez jména zákazníka bez souhlasu', () => {
    const p = aiPrompt(o, bess, 'Revoltum Engineering & Services', 'en');
    expect(p).toContain('anglicky');
    expect(p).toContain('- Instalovaný výkon: 2 000 kW');
    expect(p).toContain('neuváděj ceny');
    expect(p).not.toContain('Teplárna Chotěboř a.s.');
    expect(p).not.toContain('28900000');
  });

  it('upozornění na poloprázdný přehled a název souboru', () => {
    expect(overviewWarnings(defaultOverview(bess), 'cs').length).toBeGreaterThanOrEqual(3);
    expect(overviewFileName('25003', 'en')).toBe('Project overview 25003 EN.pdf');
  });
});
