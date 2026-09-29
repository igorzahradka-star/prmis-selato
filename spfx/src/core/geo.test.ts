import {
  buildLegend,
  buildPinInfo,
  budgetSignal,
  deadlineSignal,
  escapeHtml,
  isValidCoordinates,
  projectCoordinates,
  projectTypeColor,
  projectTypeLabel,
  splitByLocation,
  pinTooltipHtml,
  SIGNAL_COLORS,
  PROJECT_TYPE_COLORS
} from './geo';
import { BudgetStatus, Project, ProjectStatus } from './types';

function projekt(cislo: string, extra: Partial<Project> = {}): Project {
  return {
    id: Number(cislo),
    projectNumber: cislo,
    title: `${cislo} Projekt`,
    status: ProjectStatus.Realizace,
    currency: 'CZK',
    isOverhead: false,
    budgetStatus: BudgetStatus.Bez,
    ...extra
  };
}

describe('isValidCoordinates', () => {
  it('přijme běžné souřadnice v Česku', () => {
    expect(isValidCoordinates(50.0755, 14.4378)).toBe(true);
  });

  it('odmítne chybějící hodnoty', () => {
    expect(isValidCoordinates(undefined, 14.4)).toBe(false);
    expect(isValidCoordinates(50, undefined)).toBe(false);
    expect(isValidCoordinates(NaN, 14)).toBe(false);
  });

  it('odmítne hodnoty mimo rozsah', () => {
    expect(isValidCoordinates(91, 14)).toBe(false);
    expect(isValidCoordinates(50, 181)).toBe(false);
    expect(isValidCoordinates(-91, 0)).toBe(false);
  });

  it('odmítne 0/0 — je to prázdná hodnota, ne lokalita', () => {
    expect(isValidCoordinates(0, 0)).toBe(false);
  });

  it('nulová jen jedna souřadnice je v pořádku (nultý poledník, rovník)', () => {
    expect(isValidCoordinates(51.5, 0)).toBe(true);
    expect(isValidCoordinates(0, 30)).toBe(true);
  });
});

describe('projectCoordinates / splitByLocation', () => {
  it('projekt s polohou vrátí souřadnice, bez polohy undefined', () => {
    expect(projectCoordinates(projekt('26001', { latitude: 50, longitude: 14 }))).toEqual({
      latitude: 50,
      longitude: 14
    });
    expect(projectCoordinates(projekt('26002'))).toBeUndefined();
    expect(projectCoordinates(projekt('26003', { latitude: 0, longitude: 0 }))).toBeUndefined();
  });

  it('rozdělí projekty na ty s polohou a bez ní', () => {
    const r = splitByLocation([
      projekt('26001', { latitude: 50, longitude: 14 }),
      projekt('26002'),
      projekt('26003', { latitude: 49, longitude: 16 })
    ]);
    expect(r.located.map((p) => p.projectNumber)).toEqual(['26001', '26003']);
    expect(r.missing.map((p) => p.projectNumber)).toEqual(['26002']);
  });
});

describe('barvy typů', () => {
  it('každý typ z výchozího nastavení má vlastní barvu', () => {
    const barvy = Object.keys(PROJECT_TYPE_COLORS).map((t) => PROJECT_TYPE_COLORS[t]);
    expect(new Set(barvy).size).toBe(barvy.length);
  });

  it('neznámý typ a projekt bez typu dostanou šedou, ne prázdnou barvu', () => {
    expect(projectTypeColor('Něco nového')).toMatch(/^#/);
    expect(projectTypeColor(undefined)).toBe(projectTypeColor('Něco nového'));
  });

  it('projekt bez typu se v popisku jmenuje „Bez typu"', () => {
    expect(projectTypeLabel(undefined)).toBe('Bez typu');
    expect(projectTypeLabel('  ')).toBe('Bez typu');
    expect(projectTypeLabel('FVE')).toBe('FVE');
  });
});

describe('buildLegend', () => {
  it('spočítá projekty podle typu, nejčetnější první', () => {
    const l = buildLegend([
      projekt('1', { projectType: 'BESS' }),
      projekt('2', { projectType: 'FVE' }),
      projekt('3', { projectType: 'FVE' }),
      projekt('4')
    ]);
    expect(l.map((e) => [e.label, e.count])).toEqual([
      ['FVE', 2],
      ['BESS', 1],
      ['Bez typu', 1]
    ]);
    expect(l[0].color).toBe(PROJECT_TYPE_COLORS.FVE);
  });

  it('prázdný seznam dá prázdnou legendu', () => {
    expect(buildLegend([])).toEqual([]);
  });
});

describe('deadlineSignal', () => {
  const dnes = new Date(2026, 8, 29);

  it('bez termínu je šedá', () => {
    expect(deadlineSignal(undefined, dnes)).toBe('none');
  });

  it('po termínu je červená', () => {
    expect(deadlineSignal(new Date(2026, 8, 28), dnes)).toBe('red');
  });

  it('dnes a do 14 dní je žlutá', () => {
    expect(deadlineSignal(new Date(2026, 8, 29), dnes)).toBe('yellow');
    expect(deadlineSignal(new Date(2026, 9, 13), dnes)).toBe('yellow');
  });

  it('za 15 dní a později je zelená', () => {
    expect(deadlineSignal(new Date(2026, 9, 14), dnes)).toBe('green');
  });
});

describe('budgetSignal', () => {
  it('převede semafor rozpočtu; bez rozpočtu je šedá', () => {
    expect(budgetSignal(BudgetStatus.Zelena)).toBe('green');
    expect(budgetSignal(BudgetStatus.Zluta)).toBe('yellow');
    expect(budgetSignal(BudgetStatus.Cervena)).toBe('red');
    expect(budgetSignal(BudgetStatus.Bez)).toBe('none');
    expect(budgetSignal(undefined)).toBe('none');
  });
});

describe('buildPinInfo', () => {
  const dnes = new Date(2026, 8, 29);

  it('složí všechno, co bublina ukazuje', () => {
    const info = buildPinInfo(
      projekt('26003', {
        title: '26003 BORSOV MORAVSKA TREBOVA',
        projectType: 'FVE',
        projectManagerName: 'Igor Zahrádka',
        budgetStatus: BudgetStatus.Zluta,
        nextDeadline: new Date(2026, 9, 2)
      }),
      dnes
    );
    expect(info).toEqual({
      projectNumber: '26003',
      name: 'BORSOV MORAVSKA TREBOVA',
      typeLabel: 'FVE',
      typeColor: PROJECT_TYPE_COLORS.FVE,
      budgetLabel: 'Žlutá',
      budgetSignal: 'yellow',
      deadlineLabel: 'za 3 dny',
      deadlineSignal: 'yellow',
      manager: 'Igor Zahrádka'
    });
  });

  it('projekt bez termínu, PM a typu se zobrazí srozumitelně, ne jako undefined', () => {
    const info = buildPinInfo(projekt('26004'), dnes);
    expect(info.deadlineLabel).toBe('bez termínu');
    expect(info.deadlineSignal).toBe('none');
    expect(info.manager).toBe('—');
    expect(info.typeLabel).toBe('Bez typu');
  });

  it('zkrácený název má přednost před dlouhým', () => {
    const info = buildPinInfo(projekt('26005', { shortName: 'Mastířovice 1' }), dnes);
    expect(info.name).toBe('Mastířovice 1');
  });
});

describe('escapeHtml', () => {
  it('zneškodní znaky, kterými by se dal do bubliny vložit kód', () => {
    expect(escapeHtml('<img src=x onerror="a()">&\'')).toBe(
      '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;'
    );
  });
});

describe('pinTooltipHtml', () => {
  const dnes = new Date(2026, 8, 29);
  const html = pinTooltipHtml(
    buildPinInfo(
      projekt('26003', {
        title: '26003 BORSOV',
        projectType: 'FVE',
        projectManagerName: 'Igor Zahrádka',
        budgetStatus: BudgetStatus.Cervena,
        nextDeadline: new Date(2026, 8, 20)
      }),
      dnes
    )
  );

  it('obsahuje název, typ, rozpočet, termíny i projektového manažera', () => {
    expect(html).toContain('26003 · BORSOV');
    expect(html).toContain('FVE');
    expect(html).toContain('Červená');
    expect(html).toContain('po termínu o 9 dní');
    expect(html).toContain('Igor Zahrádka');
  });

  it('semafor má vedle barvy i slovo — barva nestojí sama', () => {
    expect(html).toContain(SIGNAL_COLORS.red);
    expect(html).toContain('problém');
  });

  it('text z dat nemůže do bubliny vložit kód', () => {
    const zly = pinTooltipHtml(
      buildPinInfo(projekt('26004', { shortName: '<script>alert(1)</script>' }), dnes)
    );
    expect(zly).not.toContain('<script>');
    expect(zly).toContain('&lt;script&gt;');
  });
});
