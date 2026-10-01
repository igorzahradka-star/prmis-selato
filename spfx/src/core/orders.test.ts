import { effectiveRates } from './currency';
import {
  OrderDraft,
  OrderStatus,
  PurchaseOrder,
  filterOrders,
  sortOrdersNewestFirst,
  sortOrders,
  ordersToRenumber,
  highestOrderSequence,
  amountNetInCzk,
  ATTACHMENT_MAX_BYTES,
  attachmentKind,
  chainFromJson,
  chainToJson,
  linesFromJson,
  linesToJson,
  lineTotalNet,
  orderTotals,
  round2,
  spentByProject,
  validateAttachment,
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

  it('eura a dolary se pro limity přepočítají kurzem, koruny zůstanou', () => {
    const k = effectiveRates(undefined, { EUR: 25, USD: 23 });
    expect(amountNetInCzk(1000, 'EUR', k)).toBe(25000);
    expect(amountNetInCzk(1000, 'USD', k)).toBe(23000);
    expect(amountNetInCzk(1000, 'CZK', k)).toBe(1000);
  });

  it('nesmyslný kurz nevynuluje částku', () => {
    expect(amountNetInCzk(1000, 'EUR', effectiveRates(undefined, { EUR: 0, USD: 0 }))).toBe(1000);
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

describe('přiřazený schvalovatel v uloženém řetězci', () => {
  it('přežije uložení do textu', () => {
    const zpet = chainFromJson(
      chainToJson([{ level: 'vedeni', approved: false, assignedLogin: 'v@revoltum.cz', assignedName: 'Viktor Vedení' }])
    );
    expect(zpet[0]).toMatchObject({ assignedLogin: 'v@revoltum.cz', assignedName: 'Viktor Vedení' });
  });

  it('krok bez přiřazení zůstane bez přiřazení', () => {
    const zpet = chainFromJson(chainToJson([{ level: 'pm', approved: false }]));
    expect(zpet[0].assignedLogin).toBeUndefined();
  });
});

describe('validateAttachment', () => {
  it('běžný soubor projde', () => {
    expect(validateAttachment('nabidka.pdf', 120000)).toBeUndefined();
    expect(validateAttachment('Výkres č. 3.dwg', 5000)).toBeUndefined();
  });

  it('spustitelné soubory odmítne', () => {
    expect(validateAttachment('instalace.exe', 1000)).toContain('.exe');
    expect(validateAttachment('SKRIPT.PS1', 1000)).toContain('.ps1');
  });

  it('prázdný a příliš velký soubor odmítne', () => {
    expect(validateAttachment('a.pdf', 0)).toContain('prázdný');
    expect(validateAttachment('a.pdf', ATTACHMENT_MAX_BYTES + 1)).toContain('větší');
  });

  it('název se znakem, který SharePoint nepovoluje, odmítne; název bez přípony projde', () => {
    expect(validateAttachment('faktura #12.pdf', 100)).toContain('nepovoluje');
    expect(validateAttachment('poznamky', 100)).toBeUndefined();
  });

  it('bez názvu odmítne', () => {
    expect(validateAttachment('  ', 100)).toContain('název');
  });
});

describe('attachmentKind', () => {
  it('pozná obrázky, PDF a kancelářské dokumenty bez ohledu na velikost písmen', () => {
    expect(attachmentKind('Foto.JPG')).toBe('image');
    expect(attachmentKind('nabidka.pdf')).toBe('pdf');
    expect(attachmentKind('rozpocet.xlsx')).toBe('excel');
    expect(attachmentKind('smlouva.docx')).toBe('word');
    expect(attachmentKind('prezentace.pptx')).toBe('powerpoint');
    expect(attachmentKind('podklady.zip')).toBe('archive');
  });
  it('neznámá přípona nebo žádná přípona je other', () => {
    expect(attachmentKind('poznamka.xyz')).toBe('other');
    expect(attachmentKind('README')).toBe('other');
  });
});

describe('filterOrders — datum vystavení', () => {
  const o = (id: number, created: Date | undefined): PurchaseOrder =>
    ({
      id,
      orderNumber: `OBJ-2026-${id}`,
      projectNumber: '25001',
      subject: 'x',
      lines: [],
      amountNet: 0,
      vatRate: 21,
      currency: 'CZK',
      status: OrderStatus.Koncept,
      requestedByName: '',
      requestedByLogin: '',
      approvalChain: [],
      created
    }) as PurchaseOrder;
  const list = [o(1, new Date(2026, 8, 1, 23, 59)), o(2, new Date(2026, 8, 15, 8, 0)), o(3, new Date(2026, 9, 1, 0, 0)), o(4, undefined)];

  it('od a do platí včetně krajních dnů, bez ohledu na hodinu', () => {
    const r = filterOrders(list, { issuedFrom: new Date(2026, 8, 1), issuedTo: new Date(2026, 8, 15) });
    expect(r.map((x) => x.id)).toEqual([1, 2]);
  });
  it('jen od', () => {
    expect(filterOrders(list, { issuedFrom: new Date(2026, 8, 16) }).map((x) => x.id)).toEqual([3]);
  });
  it('objednávka bez data se při filtru podle data nezobrazí, bez filtru ano', () => {
    expect(filterOrders(list, {}).length).toBe(4);
    expect(filterOrders(list, { issuedTo: new Date(2030, 0, 1) }).map((x) => x.id)).toEqual([1, 2, 3]);
  });
});

describe('sortOrders', () => {
  const mk = (id: number, extra: Partial<PurchaseOrder>): PurchaseOrder =>
    ({
      id,
      orderNumber: `OBJ-2026-000${id}`,
      projectNumber: '25001',
      subject: '',
      lines: [],
      amountNet: 0,
      vatRate: 21,
      currency: 'CZK',
      status: OrderStatus.Koncept,
      requestedByName: '',
      requestedByLogin: '',
      approvalChain: [],
      ...extra
    }) as PurchaseOrder;
  const list = [
    mk(1, { created: new Date(2026, 8, 20), supplierName: 'Čeněk' }),
    mk(2, { created: new Date(2026, 8, 1), supplierName: 'Adam' }),
    mk(3, { created: undefined, supplierName: 'Boris' })
  ];

  it('podle data vystavení vzestupně a sestupně; bez data vždy na konec při vzestupném řazení', () => {
    expect(sortOrders(list, 'created', false).map((o) => o.id)).toEqual([2, 1, 3]);
    expect(sortOrders(list, 'created', true).map((o) => o.id)).toEqual([3, 1, 2]);
  });
  it('podle dodavatele česky', () => {
    expect(sortOrders(list, 'supplier', false).map((o) => o.supplierName)).toEqual(['Adam', 'Boris', 'Čeněk']);
  });
  it('podle čísla číselně a původní seznam nemění', () => {
    const before = list.map((o) => o.id);
    expect(sortOrders(list, 'number', true).map((o) => o.id)).toEqual([3, 2, 1]);
    expect(list.map((o) => o.id)).toEqual(before);
  });
  it('podle stavu v pořadí životního cyklu', () => {
    const s = [mk(1, { status: OrderStatus.Uzavreno }), mk(2, { status: OrderStatus.Koncept }), mk(3, { status: OrderStatus.Schvaleno })];
    expect(sortOrders(s, 'status', false).map((o) => o.id)).toEqual([2, 3, 1]);
  });
});

describe('ordersToRenumber a highestOrderSequence', () => {
  const mk = (id: number, orderNumber: string): PurchaseOrder =>
    ({ id, orderNumber, projectNumber: 'x', subject: '', lines: [], amountNet: 0, vatRate: 21, currency: 'CZK', status: OrderStatus.Koncept, requestedByName: '', requestedByLogin: '', approvalChain: [] }) as PurchaseOrder;

  it('v každé skupině shodných čísel nechá nejstarší, ostatní vrátí', () => {
    const list = [mk(5, 'OBJ-2026-0001'), mk(2, 'OBJ-2026-0001'), mk(9, 'OBJ-2026-0002'), mk(7, 'obj-2026-0001 ')];
    expect(ordersToRenumber(list).map((o) => o.id)).toEqual([5, 7]);
  });
  it('bez duplicit nevrátí nic', () => {
    expect(ordersToRenumber([mk(1, 'OBJ-2026-0001'), mk(2, 'OBJ-2026-0002')])).toEqual([]);
  });
  it('nejvyšší pořadí bere jen z daného roku a jen ze správného tvaru', () => {
    expect(highestOrderSequence(['OBJ-2026-0003', 'OBJ-2026-0011', 'OBJ-2025-0099', 'xyz'], 2026)).toBe(11);
    expect(highestOrderSequence([], 2026)).toBe(0);
  });
});

describe('vyčerpáno podle projektu', () => {
  const o = (projectNumber: string, status: OrderStatus, amountNet: number, currency = 'CZK'): { projectNumber: string; status: OrderStatus; amountNet: number; currency: string } => ({
    projectNumber,
    status,
    amountNet,
    currency
  });
  const convert = (amount: number, currency: string): number => (currency === 'EUR' ? amount * 25 : amount);

  it('počítají se vystavené objednávky, ne koncepty, vrácené, zamítnuté ani storno', () => {
    const r = spentByProject(
      [
        o('26001', OrderStatus.Koncept, 1000),
        o('26001', OrderStatus.KeSchvaleni, 2000),
        o('26001', OrderStatus.Schvaleno, 3000),
        o('26001', OrderStatus.Odeslano, 4000),
        o('26001', OrderStatus.Dodano, 500),
        o('26001', OrderStatus.Uzavreno, 500),
        o('26001', OrderStatus.VracenoKUprave, 9000),
        o('26001', OrderStatus.Zamitnuto, 9000),
        o('26001', OrderStatus.Storno, 9000)
      ],
      convert
    );
    expect(r['26001']).toBe(10000);
  });

  it('částky v cizí měně se přepočtou a sčítají se po projektech', () => {
    const r = spentByProject([o('26001', OrderStatus.Schvaleno, 100, 'EUR'), o('26001', OrderStatus.Odeslano, 500), o('26002', OrderStatus.Odeslano, 700)], convert);
    expect(r).toEqual({ '26001': 3000, '26002': 700 });
  });

  it('projekt bez vystavených objednávek v přehledu není', () => {
    expect(spentByProject([o('26003', OrderStatus.Koncept, 1)], convert)).toEqual({});
  });
});
