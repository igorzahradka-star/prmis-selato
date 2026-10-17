import { buildOverviewDocument, OverviewModel } from './projectOverviewPdf';
import { ENTITY } from '../../config/entity';
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

  it('zadní strana: bez fotek jen slogan; s fotkami se objeví obě (druhá překrývá první); fotogalerie už není', () => {
    const one = textOf(model({ photos: [{ dataUrl: 'data:image/jpeg;base64,COVER' }] }));
    expect(one).toContain(ENTITY.company.slogan.cs[0]);
    expect(one).toContain('COVER');
    const two = textOf(model({ photos: [{ dataUrl: 'data:image/jpeg;base64,COVER' }, { dataUrl: 'data:image/jpeg;base64,ZADNI1' }, { dataUrl: 'data:image/jpeg;base64,ZADNI2' }] }));
    expect(two).toContain('ZADNI1');
    expect(two).toContain('ZADNI2');
    expect(two).not.toContain('Fotodokumentace');
    // druhá fotka je v dokumentu až za první, takže ji překrývá
    expect(two.indexOf('ZADNI2')).toBeGreaterThan(two.indexOf('ZADNI1'));
    // třetí a další fotky se do PDF nedostanou
    const more = textOf(model({ photos: [0, 1, 2, 3, 4].map((i) => ({ dataUrl: 'data:image/jpeg;base64,F' + i + 'X' })) }));
    expect(more).toContain('F2X');
    expect(more).not.toContain('F3X');
  });

  it('mapa je na první straně jen když je zapnutá a načtená; stránka s popisem ji neobsahuje', () => {
    const mapImg = 'data:image/png;base64,MAPA';
    const on = model({ map: mapImg });
    on.overview = { ...on.overview, showMap: true };
    expect(textOf(on)).toContain('MAPA');
    const off = model({ map: mapImg });
    off.overview = { ...off.overview, showMap: false };
    expect(textOf(off)).not.toContain('MAPA');
    const noMap = model();
    noMap.overview = { ...noMap.overview, showMap: true };
    expect(textOf(noMap)).not.toContain('MAPA');
    const content = buildOverviewDocument(on).content as unknown[];
    const mapIndex = content.findIndex((x) => JSON.stringify(x).indexOf('MAPA') !== -1);
    const aboutIndex = content.findIndex((x) => JSON.stringify(x).indexOf('O projektu') !== -1);
    expect(mapIndex).toBeGreaterThanOrEqual(0);
    expect(mapIndex).toBeLessThan(aboutIndex);
  });
});
