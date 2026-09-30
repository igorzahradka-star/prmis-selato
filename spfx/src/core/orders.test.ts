import {
  OrderDraft,
  OrderStatus,
  PurchaseOrder,
  filterOrders,
  sortOrdersNewestFirst,
  amountNetInCzk,
  chainFromJson,
  chainToJson,
  linesFromJson,
  linesToJson,
  lineTotalNet,
  orderTotals,
  round2,
  validateOrderDraft
} from './orders';

const draft = (extra: Partial<OrderDraft> = {}): OrderDraft => ({
  projectNumber: '26001',
  supplierId: 5,
  subject: 'Kabely',
  lines: [{ description: 'Kabel', quantity: 2, unitPriceNet: 1000 }],
  vatRate: 21,
  currency: 'CZK',
  ...extra
});

describe('částky', () => {
  it('round2 zaokrouhluje na haléře', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.344)).toBe(2.34);
  });

  it('cena řádku je množství krát cena; prázdné hodnoty se berou jako nula', () => {
    expect(lineTotalNet({ description: 'a', quantity: 3, unitPriceNet: 12.5 })).toBe(37.5);
    expect(lineTotalNet({ description: 'a', quantity: NaN, unitPriceNet: 5 })).toBe(0);
  });

  it('součty: DPH se počítá ze součtu bez DPH', () => {
    const t = orderTotals(
      [
        { description: 'a', quantity: 2, unitPriceNet: 1000 },
        { description: 'b', quantity: 1, unitPriceNet: 499.5 }
      ],
      21
    );
    expect(t).toEqual({ net: 2499.5, vat: 524.9, gross: 3024.4 });
  });

  it('bez položek jsou součty nula', () => {
    expect(orderTotals([], 21)).toEqual({ net: 0, vat: 0, gross: 0 });
  });

  it('eura se pro limity přepočítají kurzem, koruny zůstanou', () => {
    expect(amountNetInCzk(1000, 'EUR', 25)).toBe(25000);
    expect(amountNetInCzk(1000, 'CZK', 25)).toBe(1000);
  });

  it('nesmyslný kurz eura nevynuluje částku', () => {
    expect(amountNetInCzk(1000, 'EUR', 0)).toBe(1000);
  });
});

describe('validateOrderDraft', () => {
  it('kompletní objednávka je v pořádku', () => {
    expect(validateOrderDraft(draft(), true)).toEqual([]);
  });

  it('koncept jde uložit jen s projektem a předmětem', () => {
    const rozpracovany = draft({ supplierId: undefined, lines: [] });
    expect(validateOrderDraft(rozpracovany, false)).toEqual([]);
    expect(validateOrderDraft(draft({ projectNumber: '', subject: ' ' }), false).map((i) => i.field)).toEqual([
      'projectNumber',
      'subject'
    ]);
  });

  it('pro odeslání chce dodavatele, položky a nenulovou částku', () => {
    expect(validateOrderDraft(draft({ supplierId: undefined, supplierName: undefined }), true).map((i) => i.field)).toContain(
      'supplier'
    );
    expect(validateOrderDraft(draft({ lines: [] }), true).map((i) => i.field)).toContain('lines');
    expect(
      validateOrderDraft(draft({ lines: [{ description: 'Zdarma', quantity: 1, unitPriceNet: 0 }] }), true).map((i) => i.field)
    ).toContain('lines');
  });

  it('dodavatele stačí zadat názvem', () => {
    expect(validateOrderDraft(draft({ supplierId: undefined, supplierName: 'Solar GmbH' }), true)).toEqual([]);
  });

  it('kontroluje položky: popis, množství, cena; hlásí číslo položky', () => {
    const issues = validateOrderDraft(
      draft({
        lines: [
          { description: 'Dobrá', quantity: 1, unitPriceNet: 10 },
          { description: ' ', quantity: 0, unitPriceNet: -5 }
        ]
      }),
      false
    );
    expect(issues.map((i) => i.message)).toEqual([
      'Položka 2: doplňte popis.',
      'Položka 2: množství musí být větší než nula.',
      'Položka 2: cena nesmí být záporná.'
    ]);
  });

  it('sazba DPH mimo 0–100 a záporná splatnost jsou chyby', () => {
    expect(validateOrderDraft(draft({ vatRate: 150 }), false).map((i) => i.field)).toEqual(['vatRate']);
    expect(validateOrderDraft(draft({ paymentTermDays: -1 }), false).map((i) => i.field)).toEqual(['paymentTermDays']);
  });
});

describe('ukládání do SharePointu', () => {
  it('řetězec schválení přežije uložení do textu, včetně data', () => {
    const at = new Date(2026, 9, 1, 10, 30);
    const zpet = chainFromJson(
      chainToJson([
        { level: 'pm', approved: true, byName: 'Petr', byLogin: 'petr@revoltum.cz', at },
        { level: 'vedeni', approved: false }
      ])
    );
    expect(zpet[0]).toMatchObject({ level: 'pm', approved: true, byName: 'Petr' });
    expect(zpet[0].at?.getTime()).toBe(at.getTime());
    expect(zpet[1]).toMatchObject({ level: 'vedeni', approved: false });
  });

  it('poškozený nebo prázdný text řetězce dá prázdný řetězec, ne chybu', () => {
    expect(chainFromJson(undefined)).toEqual([]);
    expect(chainFromJson('')).toEqual([]);
    expect(chainFromJson('není json')).toEqual([]);
    expect(chainFromJson('{"a":1}')).toEqual([]);
  });

  it('neznámá úroveň schvalovatele se z uloženého řetězce zahodí', () => {
    expect(chainFromJson('[{"level":"ředitel","approved":true},{"level":"pm","approved":false}]').map((s) => s.level)).toEqual([
      'pm'
    ]);
  });

  it('položky přežijí uložení; poškozený text dá prázdný seznam', () => {
    const polozky = [{ description: 'Kabel', quantity: 2, unit: 'ks', unitPriceNet: 1000 }];
    expect(linesFromJson(linesToJson(polozky))).toEqual(polozky);
    expect(linesFromJson('nesmysl')).toEqual([]);
    expect(linesFromJson(undefined)).toEqual([]);
  });
});

describe('filterOrders / sortOrdersNewestFirst', () => {
  const o = (orderNumber: string, extra: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
    id: 1,
    orderNumber,
    projectNumber: '26001',
    subject: 'Kabely',
    lines: [],
    amountNet: 0,
    vatRate: 21,
    currency: 'CZK',
    status: OrderStatus.Koncept,
    requestedByName: 'A',
    requestedByLogin: 'a',
    approvalChain: [],
    ...extra
  });

  it('filtruje podle projektu a stavu', () => {
    const data = [
      o('OBJ-2026-0001'),
      o('OBJ-2026-0002', { projectNumber: '26002' }),
      o('OBJ-2026-0003', { status: OrderStatus.Schvaleno })
    ];
    expect(filterOrders(data, { projectNumber: '26002' }).map((x) => x.orderNumber)).toEqual(['OBJ-2026-0002']);
    expect(filterOrders(data, { statuses: [OrderStatus.Schvaleno] }).map((x) => x.orderNumber)).toEqual(['OBJ-2026-0003']);
  });

  it('fulltext hledá v čísle, předmětu, dodavateli i projektu, bez ohledu na velikost písmen a diakritiku v malých/velkých', () => {
    const data = [
      o('OBJ-2026-0001', { supplierName: 'Solar Komponenten GmbH' }),
      o('OBJ-2026-0002', { subject: 'Měnič', projectTitle: '26002 Mastířovice' })
    ];
    expect(filterOrders(data, { search: 'solar' }).length).toBe(1);
    expect(filterOrders(data, { search: 'MĚNIČ' }).length).toBe(1);
    expect(filterOrders(data, { search: 'mastířovice' }).length).toBe(1);
    expect(filterOrders(data, { search: '0002' }).length).toBe(1);
    expect(filterOrders(data, { search: 'nic takového' }).length).toBe(0);
  });

  it('prázdný filtr vrátí vše', () => {
    expect(filterOrders([o('OBJ-2026-0001')], undefined).length).toBe(1);
    expect(filterOrders([o('OBJ-2026-0001')], { statuses: [], search: ' ' }).length).toBe(1);
  });

  it('řadí nejnovější první podle hodnoty čísla, ne abecedně', () => {
    const data = [o('OBJ-2026-0009'), o('OBJ-2026-0100'), o('OBJ-2026-0010')];
    expect(sortOrdersNewestFirst(data).map((x) => x.orderNumber)).toEqual([
      'OBJ-2026-0100',
      'OBJ-2026-0010',
      'OBJ-2026-0009'
    ]);
  });
});
