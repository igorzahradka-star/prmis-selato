import { buildOverviewDocument, OverviewModel } from './projectOverviewPdf';
import { defaultOverview } from '../../core/projectOverview';
import { BudgetStatus, Project, ProjectStatus } from '../../core/types';

const project: Project = {
  id: 3,
  projectNumber: '25003',
  title: '25003 Teplárna Chotěboř – Chotěboř – BESS',
  customerName: 'Teplárna Chotěboř a.s.',
  status: ProjectStatus.Realizace,
  projectType: 'BESS',
  location: 'Chotěboř',
  currency: 'CZK',
  isOverhead: false,
  budgetStatus: BudgetStatus.Bez,
  contractPriceNet: 28900000,
  budgetSaleTotal: 28900000,
  budgetCostTotal: 24000000,
  endDatePlanned: new Date(2026, 5, 30)
};

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function model(over: Partial<OverviewModel> = {}): OverviewModel {
  return {
    lang: 'cs',
    project,
    overview: { ...defaultOverview(project), power: 2000, capacity: 4.4, capacityUnit: 'MWh' },
    company: 'Revoltum Engineering & Services',
    text: 'Popis realizace.',
    photos: [],
    ...over
  };
}

const textOf = (m: OverviewModel): string => JSON.stringify(buildOverviewDocument(m).content);

describe('PDF Project overview', () => {
  it('ukáže předmět, lokalitu, rok, výkon a kapacitu; zákazníka jen obecně a nikdy ceny či náklady', () => {
    const t = textOf(model());
    expect(t).toContain('Realizace bateriového úložiště');
    expect(t).toContain('Chotěboř');
    expect(t).toContain('2026');
    expect(t).toContain('2');
    expect(t).toContain('4,4 MWh');
    expect(t).toContain('průmyslová společnost');
    expect(t).not.toContain('Teplárna Chotěboř a.s.');
    expect(t).not.toContain('28900000');
    expect(t).not.toContain('24000000');
  });

  it('se souhlasem zákazníka uvede jeho jméno', () => {
    const m = model();
    m.overview = { ...m.overview, customerConsent: true };
    expect(textOf(m)).toContain('Teplárna Chotěboř a.s.');
  });

  it('anglická verze má anglické popisky a anglický předmět', () => {
    const t = textOf(model({ lang: 'en' }));
    expect(t).toContain('CASE STUDY');
    expect(t).toContain('Battery energy storage system');
    expect(t).toContain('Installed power');
    expect(t).not.toContain('REFERENCE');
  });

  it('fotogalerie vznikne jen když jsou kromě titulní další fotky', () => {
    expect(textOf(model({ photos: [{ dataUrl: pixel }] }))).not.toContain('Fotodokumentace');
    expect(textOf(model({ photos: [{ dataUrl: pixel }, { dataUrl: pixel, caption: 'Montáž' }] }))).toContain('Fotodokumentace');
  });

  it('mapa se přidá jen když je zapnutá a načtená', () => {
    const on = model({ map: pixel });
    on.overview = { ...on.overview, showMap: true };
    expect(textOf(on)).toContain('Umístění');
    const off = model({ map: pixel });
    off.overview = { ...off.overview, showMap: false };
    expect(textOf(off)).not.toContain('Umístění');
    const noMap = model();
    noMap.overview = { ...noMap.overview, showMap: true };
    expect(textOf(noMap)).not.toContain('Umístění');
  });
});
