import {
  parseFolderName,
  buildImportPlan,
  counterTargets,
  yearFromNumber,
  sequenceFromNumber
} from './projectImport';

/** Skutečné složky RES z knihovny Dokumenty\General\01_PROJEKTY (23. 9. 2026). */
const SKUTECNE_SLOZKY = [
  '00_Project tools',
  '26001-MASTIROVICE 1 GENERALNI OPRAVA',
  '26002-MASTIROVICE 2 - BESS',
  '26003-BORSOV MORAVSKA TREBOVA',
  '26004-DOHLEDOVY SYSTEM',
  '26005-DOPLNENI STRIDACU MASTIROVICE 1'
];

describe('parseFolderName', () => {
  it('rozebere skutečný název složky RES', () => {
    const c = parseFolderName('26001-MASTIROVICE 1 GENERALNI OPRAVA');
    expect(c.action).toBe('import');
    expect(c.projectNumber).toBe('26001');
    expect(c.title).toBe('MASTIROVICE 1 GENERALNI OPRAVA');
    expect(c.year).toBe(2026);
    expect(c.isOverhead).toBe(false);
  });

  it('nevadí mu pomlčka uvnitř názvu', () => {
    const c = parseFolderName('26002-MASTIROVICE 2 - BESS');
    expect(c.projectNumber).toBe('26002');
    expect(c.title).toBe('MASTIROVICE 2 - BESS');
  });

  it('zvládne i mezeru místo pomlčky', () => {
    const c = parseFolderName('26007 NOVY PROJEKT');
    expect(c.projectNumber).toBe('26007');
    expect(c.title).toBe('NOVY PROJEKT');
  });

  it('pomocnou složku pozná a přeskočí', () => {
    const c = parseFolderName('00_Project tools');
    expect(c.action).toBe('skip');
    expect(c.reason).toContain('pomocná');
  });

  it('přeskočí i složku s číslem, ale bez názvu', () => {
    expect(parseFolderName('26008-').action).toBe('skip');
  });

  it('prázdný název zvládne', () => {
    expect(parseFolderName('   ').action).toBe('skip');
  });

  it('Režii pozná podle čísla', () => {
    const c = parseFolderName('26999-REZIE RES 2026');
    expect(c.action).toBe('import');
    expect(c.isOverhead).toBe(true);
  });

  it('krátké číslo za projekt nepovažuje — 2601 není číslo projektu', () => {
    expect(parseFolderName('2601-NECO').action).toBe('skip');
  });
});

describe('buildImportPlan', () => {
  it('ze skutečných složek RES naimportuje pět projektů a tools přeskočí', () => {
    const plan = buildImportPlan(SKUTECNE_SLOZKY);

    expect(plan.toImport).toBe(5);
    const importovane = plan.candidates.filter((c) => c.action === 'import');
    expect(importovane.map((c) => c.projectNumber)).toEqual(['26001', '26002', '26003', '26004', '26005']);

    const preskocene = plan.candidates.filter((c) => c.action === 'skip');
    expect(preskocene.map((c) => c.folderName)).toEqual(['00_Project tools']);
  });

  it('čítač navazuje na nejvyšší číslo — další projekt bude 26006', () => {
    const plan = buildImportPlan(SKUTECNE_SLOZKY);
    expect(plan.counterByYear).toEqual([{ year: 2026, lastValue: 5 }]);
  });

  it('projekt, který už v aplikaci je, označí jako duplicitní a nepřepíše', () => {
    const plan = buildImportPlan(SKUTECNE_SLOZKY, ['26002']);

    expect(plan.toImport).toBe(4);
    const dup = plan.candidates.filter((c) => c.action === 'duplicate');
    expect(dup.map((c) => c.projectNumber)).toEqual(['26002']);
  });

  it('opakovaný import už nic nenaimportuje', () => {
    const vsechna = ['26001', '26002', '26003', '26004', '26005'];
    expect(buildImportPlan(SKUTECNE_SLOZKY, vsechna).toImport).toBe(0);
  });

  it('dvě složky se stejným číslem naimportuje jen jednou', () => {
    const plan = buildImportPlan(['26001-PRVNI', '26001-DRUHA KOPIE']);
    expect(plan.toImport).toBe(1);
    expect(plan.candidates.filter((c) => c.action === 'duplicate').length).toBe(1);
  });

  it('řadí podle čísla, složky bez čísla nakonec', () => {
    const plan = buildImportPlan(['26005-PATY', '00_Project tools', '26001-PRVNI']);
    expect(plan.candidates.map((c) => c.folderName)).toEqual([
      '26001-PRVNI',
      '26005-PATY',
      '00_Project tools'
    ]);
  });

  it('prázdná složka dá prázdný plán, ne chybu', () => {
    const plan = buildImportPlan([]);
    expect(plan.toImport).toBe(0);
    expect(plan.counterByYear).toEqual([]);
  });
});

describe('counterTargets', () => {
  it('bere nejvyšší číslo, ne počet projektů', () => {
    // 26003 chybí — projekt se zrušil. Čítač musí přesto skončit na 5,
    // jinak by další projekt dostal číslo, které už jednou existovalo.
    const plan = buildImportPlan(['26001-A', '26002-B', '26005-E']);
    expect(plan.counterByYear).toEqual([{ year: 2026, lastValue: 5 }]);
  });

  it('počítá každý rok zvlášť', () => {
    const plan = buildImportPlan(['25018-STARY', '26001-NOVY', '26004-NOVEJSI']);
    expect(plan.counterByYear).toEqual([
      { year: 2025, lastValue: 18 },
      { year: 2026, lastValue: 4 }
    ]);
  });

  it('Režie čítač nevytlačí na 999', () => {
    const plan = buildImportPlan(['26001-A', '26999-REZIE RES 2026']);
    expect(plan.counterByYear).toEqual([{ year: 2026, lastValue: 1 }]);
  });

  it('do maxima počítá i duplicity — to číslo je obsazené tak jako tak', () => {
    const plan = buildImportPlan(['26001-A', '26009-B'], ['26009']);
    expect(plan.counterByYear).toEqual([{ year: 2026, lastValue: 9 }]);
  });

  it('přeskočené složky do čítače nepočítá', () => {
    expect(counterTargets([{ folderName: '00_Project tools', action: 'skip', isOverhead: false }])).toEqual([]);
  });
});

describe('yearFromNumber a sequenceFromNumber', () => {
  it('rozeberou číslo na rok a pořadí', () => {
    expect(yearFromNumber('26001')).toBe(2026);
    expect(sequenceFromNumber('26001')).toBe(1);
    expect(yearFromNumber('25018')).toBe(2025);
    expect(sequenceFromNumber('25018')).toBe(18);
  });

  it('zvládnou i delší pořadové číslo', () => {
    expect(yearFromNumber('261234')).toBe(2026);
    expect(sequenceFromNumber('261234')).toBe(1234);
  });

  it('nesmyslné číslo vrátí undefined', () => {
    expect(yearFromNumber('abc')).toBeUndefined();
    expect(sequenceFromNumber('26')).toBeUndefined();
  });
});
