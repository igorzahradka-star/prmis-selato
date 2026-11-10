import { Partner, PartnerType } from './types';
import { buildPartnerImportPlan, checkImportIco, detectHeader, parseCountry, parsePartnerType, partnerImportActionLabel } from './partnerImport';
import { parseClipboardTable } from './budget';

const HEADER = ['Název', 'Typ', 'Země', 'IČO', 'DIČ', 'Adresa', 'Email', 'Telefon'];

const existing: Partner[] = [
  { id: 1, name: 'Stávající s.r.o.', partnerType: PartnerType.Zakaznik, country: 'CZ', ico: '06859101', isActive: true },
  { id: 2, name: 'Bez IČ GmbH', partnerType: PartnerType.Dodavatel, country: 'DE', isActive: false },
  { id: 3, name: 'Starý partner', partnerType: PartnerType.Dodavatel, ico: '24729035', isActive: true }
];

describe('parsePartnerType', () => {
  it('pozná zákazníka, dodavatele a obojí včetně běžných zápisů', () => {
    expect(parsePartnerType('Zákazník')).toBe(PartnerType.Zakaznik);
    expect(parsePartnerType('zakaznik')).toBe(PartnerType.Zakaznik);
    expect(parsePartnerType('Odběratel')).toBe(PartnerType.Zakaznik);
    expect(parsePartnerType(' DODAVATEL ')).toBe(PartnerType.Dodavatel);
    expect(parsePartnerType('Obojí')).toBe(PartnerType.Oboji);
    expect(parsePartnerType('Zákazník i dodavatel')).toBe(PartnerType.Oboji);
    expect(parsePartnerType('Zákazník, Dodavatel')).toBe(PartnerType.Oboji);
  });
  it('neznámý nebo prázdný typ vrátí undefined', () => {
    expect(parsePartnerType('')).toBeUndefined();
    expect(parsePartnerType('Konkurent')).toBeUndefined();
  });
});

describe('parseCountry', () => {
  it('prázdná země je CZ', () => {
    expect(parseCountry('')).toBe('CZ');
    expect(parseCountry('  ')).toBe('CZ');
  });
  it('bere kód, český název i běžné zápisy', () => {
    expect(parseCountry('de')).toBe('DE');
    expect(parseCountry('Německo')).toBe('DE');
    expect(parseCountry('ČR')).toBe('CZ');
    expect(parseCountry('Česká republika')).toBe('CZ');
    expect(parseCountry('Slovensko')).toBe('SK');
    expect(parseCountry('EL')).toBe('GR');
  });
  it('neznámou zemi vrátí undefined', () => {
    expect(parseCountry('Atlantida')).toBeUndefined();
    expect(parseCountry('XX')).toBeUndefined();
  });
});

describe('checkImportIco', () => {
  it('české IČO: 8 číslic a kontrolní číslice', () => {
    expect(checkImportIco('06859101', 'CZ')).toEqual({ ico: '06859101' });
    expect(checkImportIco('068 59 101', 'CZ')).toEqual({ ico: '06859101' });
    expect(checkImportIco('06859102', 'CZ').error).toMatch(/kontrolní číslici/);
    expect(checkImportIco('123456789', 'CZ').error).toMatch(/8 číslic/);
    expect(checkImportIco('CZ06859101', 'CZ').error).toMatch(/jen číslice/);
  });
  it('IČO uložené v Excelu jako číslo (bez nul zleva) se doplní', () => {
    expect(checkImportIco('60', 'CZ')).toEqual({ ico: '00000060' });
  });
  it('prázdné IČO je v pořádku', () => {
    expect(checkImportIco('', 'CZ')).toEqual({ ico: '' });
  });
  it('zahraniční IČ se nekontroluje na číslice ani kontrolní číslici', () => {
    expect(checkImportIco('HRB 12345', 'DE')).toEqual({ ico: 'HRB 12345' });
    expect(checkImportIco('12345', 'SK')).toEqual({ ico: '12345' });
    expect(checkImportIco('91310000MA1FL5XQ2K', 'CN')).toEqual({ ico: '91310000MA1FL5XQ2K' });
  });
});

describe('detectHeader', () => {
  it('najde sloupce podle nadpisů v libovolném pořadí', () => {
    expect(detectHeader(['IČO', 'Název', 'E-mail'])).toEqual({ ico: 0, name: 1, email: 2 });
    expect(detectHeader(HEADER)).toEqual({ name: 0, type: 1, country: 2, ico: 3, dic: 4, address: 5, email: 6, phone: 7 });
  });
  it('nadpis se pozná podle sloupce Název (i „Firma“), řádek s daty nadpis není', () => {
    expect(detectHeader(['Firma', 'Typ'])).toEqual({ name: 0, type: 1 });
    expect(detectHeader(['ACME a.s.', 'Zákazník', 'CZ'])).toBeUndefined();
  });
});

describe('buildPartnerImportPlan', () => {
  it('rozdělí řádky na založení, duplicity a chyby a spočítá je', () => {
    const plan = buildPartnerImportPlan(
      [
        HEADER,
        ['Nová firma s.r.o.', 'Zákazník', '', '24729035 ', 'cz24729035', 'Lučice 1, 582 35 Lučice', 'info@nova.cz', '+420 777 000 000'],
        ['Stávající a.s.', 'Dodavatel', 'CZ', '06859101', '', '', '', ''],
        ['Překlep', 'Dodavatel', 'CZ', '06859102', '', '', '', ''],
        ['', 'Zákazník', 'CZ', '', '', '', '', ''],
        ['Divný typ', 'Konkurent', 'CZ', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['Berlin Montage GmbH', 'Obojí', 'Německo', 'HRB 98765', 'DE123456789', 'Berlin', '', ''],
        ['Berlin Montage zweite', 'Obojí', 'DE', 'hrb98765', '', '', '', ''],
        ['Bez IČ GmbH', 'Dodavatel', 'DE', '', '', '', '', ''],
        ['Bez IČO s.r.o.', 'Zákazník', '', '', '', '', 'spatny-mail', '']
      ],
      existing
    );
    expect(plan.hasHeader).toBe(true);
    expect(plan.rows.map((r) => [r.line, r.action])).toEqual([
      [2, 'duplicate'], // IČO 24729035 má „Starý partner“ (bez země = CZ)
      [3, 'duplicate'],
      [4, 'error'],
      [5, 'error'],
      [6, 'error'],
      [8, 'create'],
      [9, 'duplicate'], // stejné zahraniční IČ jako řádek 8
      [10, 'duplicate'], // bez IČO, stejný název a země jako deaktivovaný partner
      [11, 'create']
    ]);
    expect(plan.toCreate).toBe(2);
    expect(plan.duplicates).toBe(4);
    expect(plan.errors).toBe(3);
    expect(plan.rows[0].message).toMatch(/Starý partner/);
    expect(plan.rows[2].message).toMatch(/kontrolní číslici/);
    expect(plan.rows[3].message).toMatch(/Chybí název/);
    expect(plan.rows[4].message).toMatch(/Neznámý typ „Konkurent“/);
    expect(plan.rows[6].message).toMatch(/řádek 8/);
    // Přeskočený řádek má uklizené údaje jen pro náhled (země jako kód, IČ jak je); chybný řádek žádné.
    expect(plan.rows[6].partner?.country).toBe('DE');
    expect(plan.rows[2].partner).toBeUndefined();
    expect(plan.rows[7].message).toMatch(/deaktivovaný/);
    expect(plan.rows[8].message).toMatch(/E-mail/);
  });

  it('převede řádek na partnera: typ, země CZ u prázdné, adresa, DIČ s předponou, plátce DPH podle DIČ', () => {
    const plan = buildPartnerImportPlan(
      [
        HEADER,
        ['Nová firma s.r.o.', 'zákazník i dodavatel', '', '6859101', '06859101', 'Lučice 260, 582 35 Lučice', 'info@nova.cz', '777 000 000'],
        ['Dílna Novák', 'Dodavatel', 'cz', '', '', '', '', '']
      ],
      []
    );
    expect(plan.rows[0].partner).toEqual({
      name: 'Nová firma s.r.o.',
      partnerType: PartnerType.Oboji,
      country: 'CZ',
      ico: '06859101',
      dic: 'CZ06859101',
      isVatPayer: true,
      address: 'Lučice 260, 582 35 Lučice',
      email: 'info@nova.cz',
      phone: '777 000 000',
      isActive: true
    });
    expect(plan.rows[1].partner).toEqual({
      name: 'Dílna Novák',
      partnerType: PartnerType.Dodavatel,
      country: 'CZ',
      ico: undefined,
      dic: undefined,
      isVatPayer: false,
      address: undefined,
      email: undefined,
      phone: undefined,
      isActive: true
    });
  });

  it('zahraniční DIČ nemá kontrolu kontrolní číslice, nečekaný tvar jen upozorní', () => {
    const plan = buildPartnerImportPlan(
      [
        ['Shenzhen Parts Ltd.', 'Dodavatel', 'CN', '91440300MA5XXXXX', '91440300MA5XXXXX', 'Shenzhen', '', ''],
        ['Wien Elektro GmbH', 'Dodavatel', 'AT', 'FN 123456a', '12345', '', '', '']
      ],
      []
    );
    expect(plan.hasHeader).toBe(false);
    expect(plan.rows.map((r) => r.action)).toEqual(['create', 'create']);
    expect(plan.rows[0].message).toBe('');
    expect(plan.rows[0].partner?.dic).toBe('91440300MA5XXXXX');
    expect(plan.rows[1].partner?.dic).toBe('AT12345');
    expect(plan.rows[1].message).toMatch(/DIČ AT12345/);
  });

  it('opakovaný import: už založení partneři se přeskočí', () => {
    const table = [HEADER, ['Nová firma s.r.o.', 'Zákazník', 'CZ', '06859101', '', '', '', ''], ['Dílna Novák', 'Dodavatel', '', '', '', '', '', '']];
    const first = buildPartnerImportPlan(table, []);
    const created = first.rows.map((r, i) => ({ ...(r.partner as Omit<Partner, 'id'>), id: 100 + i }));
    const second = buildPartnerImportPlan(table, created);
    expect(second.toCreate).toBe(0);
    expect(second.duplicates).toBe(2);
  });

  it('text vložený z Excelu (tabulátory) se čte stejně', () => {
    const text = 'Název\tTyp\tZemě\tIČO\r\nNová firma\tZákazník\t\t06859101\r\n\r\n';
    const plan = buildPartnerImportPlan(parseClipboardTable(text), []);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0].partner?.ico).toBe('06859101');
    expect(plan.rows[0].partner?.country).toBe('CZ');
  });
});

describe('partnerImportActionLabel', () => {
  it('popisky akcí', () => {
    expect(partnerImportActionLabel('create')).toBe('Založí se');
    expect(partnerImportActionLabel('duplicate')).toBe('Přeskočí se');
    expect(partnerImportActionLabel('error')).toBe('Chyba');
  });
});
