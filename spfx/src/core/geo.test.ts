import {
  buildLegend,
  PinInfo,
  buildPinInfo,
  budgetSignal,
  clusterListHtml,
  clusterPoints,
  sameLocation,
  deadlineSignal,
  escapeHtml,
  isValidCoordinates,
  projectCoordinates,
  projectTypeLabel,
  splitByLocation,
  stackSlots,
  stackOffsetPx,
  MAX_STACK_SPREAD,
  pinTooltipHtml,
  SIGNAL_COLORS,
  STATUS_ORDER,
  STATUS_STYLE,
  statusStyle
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

describe('barvy stavů', () => {
  it('každý stav má vlastní výplň', () => {
    const vyplne = STATUS_ORDER.map((st) => STATUS_STYLE[st].fill);
    expect(new Set(vyplne).size).toBe(vyplne.length);
  });

  it('Nabídka je bílá, Realizace zelená, Pozastaveno žlutá, Dokončeno tmavě zelená', () => {
    expect(STATUS_STYLE[ProjectStatus.Nabidka].fill).toBe('#FFFFFF');
    // Zelené odstíny: složka G je největší; tmavě zelená je tmavší než sytě zelená.
    const svetlost = (hex: string): number =>
      parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    const zelena = STATUS_STYLE[ProjectStatus.Realizace].fill;
    const tmava = STATUS_STYLE[ProjectStatus.Dokonceno].fill;
    const nazelenala = STATUS_STYLE[ProjectStatus.Priprava].fill;
    expect(svetlost(tmava)).toBeLessThan(svetlost(zelena));
    expect(svetlost(nazelenala)).toBeGreaterThan(svetlost(zelena));
    expect(STATUS_STYLE[ProjectStatus.Pozastaveno].fill).toMatch(/^#F/i);
  });

  it('Storno i Reklamace jsou červené (nejvyšší je složka R)', () => {
    [ProjectStatus.Storno, ProjectStatus.Reklamace].forEach((st) => {
      const hex = STATUS_STYLE[st].fill;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const bl = parseInt(hex.slice(5, 7), 16);
      expect(r).toBeGreaterThan(g * 2);
      expect(r).toBeGreaterThan(bl * 2);
    });
  });

  it('žádný stav nemá zrušené Uzavřeno; všechny stavy z výčtu jsou v pořadí legendy', () => {
    expect(STATUS_ORDER.length).toBe(Object.keys(ProjectStatus).length);
    expect(STATUS_ORDER.map((st) => String(st))).not.toContain('Uzavřeno');
  });

  it('neznámý stav dostane šedou, ne prázdnou barvu', () => {
    expect(statusStyle('Něco nového').fill).toMatch(/^#/);
    expect(statusStyle(undefined).fill).toBe(statusStyle('Něco nového').fill);
  });

  it('projekt bez typu se v popisku jmenuje „Bez typu"', () => {
    expect(projectTypeLabel(undefined)).toBe('Bez typu');
    expect(projectTypeLabel('  ')).toBe('Bez typu');
    expect(projectTypeLabel('FVE')).toBe('FVE');
  });
});

describe('buildLegend', () => {
  it('ukáže všechny stavy v pořadí cyklu a spočítá projekty v každém', () => {
    const l = buildLegend([
      projekt('1', { status: ProjectStatus.Realizace }),
      projekt('2', { status: ProjectStatus.Realizace }),
      projekt('3', { status: ProjectStatus.Storno }),
      projekt('4', { status: ProjectStatus.Nabidka })
    ]);
    expect(l.map((e) => e.status)).toEqual(STATUS_ORDER);
    const pocty: Record<string, number> = {};
    l.forEach((e) => (pocty[e.status] = e.count));
    expect(pocty.Realizace).toBe(2);
    expect(pocty.Storno).toBe(1);
    expect(pocty['Nabídka']).toBe(1);
    expect(pocty['Příprava']).toBe(0);
  });

  it('prázdný seznam dá legendu s nulami, ne prázdnou legendu', () => {
    const l = buildLegend([]);
    expect(l.length).toBe(STATUS_ORDER.length);
    expect(l.every((e) => e.count === 0)).toBe(true);
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
      status: 'Realizace',
      statusStyle: STATUS_STYLE[ProjectStatus.Realizace],
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
    expect(html).toContain('Realizace');
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

describe('stackSlots', () => {
  it('projekty na stejném místě dostanou pořadí podle čísla', () => {
    const slots = stackSlots([
      projekt('26003', { latitude: 49.6, longitude: 15.5 }),
      projekt('26001', { latitude: 49.6, longitude: 15.5 }),
      projekt('26002', { latitude: 49.6, longitude: 15.5 })
    ]);
    expect(slots['26001']).toEqual({ index: 0, count: 3 });
    expect(slots['26002']).toEqual({ index: 1, count: 3 });
    expect(slots['26003']).toEqual({ index: 2, count: 3 });
  });

  it('projekty s odlišnou polohou jsou každý sám', () => {
    const slots = stackSlots([
      projekt('26001', { latitude: 49.6, longitude: 15.5 }),
      projekt('26002', { latitude: 50.1, longitude: 14.4 })
    ]);
    expect(slots['26001']).toEqual({ index: 0, count: 1 });
    expect(slots['26002']).toEqual({ index: 0, count: 1 });
  });

  it('projekty vzdálené pár desítek metrů se berou jako jedno místo', () => {
    const slots = stackSlots([
      projekt('26001', { latitude: 49.6000, longitude: 15.5000 }),
      projekt('26002', { latitude: 49.60004, longitude: 15.50004 })
    ]);
    expect(slots['26001'].count).toBe(2);
  });

  it('projekt bez polohy se do hromádek nezahrnuje', () => {
    const slots = stackSlots([projekt('26001'), projekt('26002', { latitude: 49, longitude: 15 })]);
    expect(slots['26001']).toBeUndefined();
    expect(slots['26002'].count).toBe(1);
  });

  it('čísla řadí podle hodnoty, ne abecedně', () => {
    const slots = stackSlots([
      projekt('100000', { latitude: 49, longitude: 15 }),
      projekt('26010', { latitude: 49, longitude: 15 }),
      projekt('26009', { latitude: 49, longitude: 15 })
    ]);
    expect(slots['26009'].index).toBe(0);
    expect(slots['26010'].index).toBe(1);
    expect(slots['100000'].index).toBe(2);
  });
});

describe('stackOffsetPx', () => {
  it('samostatný špendlík se neposouvá', () => {
    expect(stackOffsetPx({ index: 0, count: 1 })).toBe(0);
  });

  it('hromádka je vystředěná — součet posunů je nula a krok je konstantní', () => {
    const offsets = [0, 1, 2].map((i) => stackOffsetPx({ index: i, count: 3 }, 10));
    expect(offsets).toEqual([-10, 0, 10]);
  });

  it('sudý počet se vystředí mezi dva prostřední', () => {
    const offsets = [0, 1].map((i) => stackOffsetPx({ index: i, count: 2 }, 10));
    expect(offsets).toEqual([-5, 5]);
  });

  it('nad limit se špendlíky už nerozestupují a hromádka nezáhne přes mapu', () => {
    const count = MAX_STACK_SPREAD + 5;
    const posledniViditelny = stackOffsetPx({ index: MAX_STACK_SPREAD - 1, count }, 10);
    const dalsi = stackOffsetPx({ index: MAX_STACK_SPREAD + 3, count }, 10);
    expect(dalsi).toBe(posledniViditelny);
    const sirka = stackOffsetPx({ index: MAX_STACK_SPREAD - 1, count }, 10) - stackOffsetPx({ index: 0, count }, 10);
    expect(sirka).toBe((MAX_STACK_SPREAD - 1) * 10);
  });
});

describe('slučování špendlíků do skupin', () => {
  it('body blíž než dosah se sloučí, vzdálené zůstanou samostatné', () => {
    const r = clusterPoints(
      [
        { id: 'A', x: 100, y: 100 },
        { id: 'B', x: 110, y: 105 },
        { id: 'C', x: 400, y: 400 }
      ],
      40
    );
    expect(r.map((c) => c.ids)).toEqual([['A', 'B'], ['C']]);
    expect(r[0].x).toBe(105);
    expect(r[0].y).toBe(102.5);
  });

  it('body na stejném místě jsou jedna skupina, bez bodů nic', () => {
    const r = clusterPoints([{ id: 'A', x: 5, y: 5 }, { id: 'B', x: 5, y: 5 }, { id: 'C', x: 5, y: 5 }], 10);
    expect(r).toHaveLength(1);
    expect(r[0].ids).toEqual(['A', 'B', 'C']);
    expect(clusterPoints([], 10)).toEqual([]);
  });

  it('bod jde do nejbližší skupiny v dosahu', () => {
    const r = clusterPoints([{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 50, y: 0 }, { id: 'C', x: 40, y: 0 }], 20);
    // C je blíž k B (10) než k A (40, mimo dosah) → C patří k B.
    expect(r.map((c) => c.ids)).toEqual([['A'], ['B', 'C']]);
  });

  it('stejné místo se pozná i s drobnou odchylkou', () => {
    expect(sameLocation([{ latitude: 49.1, longitude: 15.2 }, { latitude: 49.100001, longitude: 15.200001 }])).toBe(true);
    expect(sameLocation([{ latitude: 49.1, longitude: 15.2 }, { latitude: 49.2, longitude: 15.2 }])).toBe(false);
    expect(sameLocation([{ latitude: 49.1, longitude: 15.2 }])).toBe(true);
  });

  it('seznam projektů ve skupině: odkazy jen když se chtějí, text se ošetří a dlouhý seznam se zkrátí', () => {
    const info = (n: string): PinInfo => buildPinInfo(projekt(n, { title: `${n} <b>Název</b>` }));
    const items = ['26001', '26002', '26003'].map(info);
    const html = clusterListHtml(items, true, (n) => `#/projekt/${n}`, 2);
    expect(html).toContain('3 projektů na tomto místě');
    expect(html).toContain('href="#/projekt/26001"');
    expect(html).toContain('…a dalších 1');
    expect(html).not.toContain('<b>Název</b>');
    expect(clusterListHtml(items, false, (n) => n)).not.toContain('href=');
  });
});
