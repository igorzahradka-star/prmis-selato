import { attachmentsFit, defaultOrderMail, isValidEmail, MAIL_MAX_ATTACHMENT_BYTES, parseRecipients } from './mail';

describe('isValidEmail', () => {
  it('běžné adresy projdou', () => {
    expect(isValidEmail('jan.novak@firma.cz')).toBe(true);
    expect(isValidEmail(' objednavky@dodavatel-beltec.com ')).toBe(true);
  });

  it('špatný tvar neprojde', () => {
    expect(isValidEmail('jan.novak')).toBe(false);
    expect(isValidEmail('@firma.cz')).toBe(false);
    expect(isValidEmail('jan@firma')).toBe(false);
    expect(isValidEmail('jan novak@firma.cz')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('parseRecipients', () => {
  it('rozdělí podle čárky, středníku, mezery i nového řádku', () => {
    const r = parseRecipients('a@x.cz, b@x.cz;c@x.cz\nd@x.cz  e@x.cz');
    expect(r.valid).toEqual(['a@x.cz', 'b@x.cz', 'c@x.cz', 'd@x.cz', 'e@x.cz']);
    expect(r.invalid).toEqual([]);
  });

  it('duplicity se spojí bez ohledu na velikost písmen', () => {
    expect(parseRecipients('A@x.cz, a@x.cz').valid).toEqual(['A@x.cz']);
  });

  it('špatné adresy vrátí zvlášť, dobré nechá', () => {
    const r = parseRecipients('a@x.cz, nesmysl, b@');
    expect(r.valid).toEqual(['a@x.cz']);
    expect(r.invalid).toEqual(['nesmysl', 'b@']);
  });

  it('prázdný text nemá žádné adresy', () => {
    expect(parseRecipients('  ')).toEqual({ valid: [], invalid: [] });
  });
});

describe('attachmentsFit', () => {
  it('drobné přílohy se vejdou, velké ne', () => {
    expect(attachmentsFit([100000, 200000])).toBe(true);
    expect(attachmentsFit([MAIL_MAX_ATTACHMENT_BYTES, 1])).toBe(false);
  });

  it('bez příloh se vejde vždy', () => {
    expect(attachmentsFit([])).toBe(true);
  });
});

describe('defaultOrderMail', () => {
  const vstup = {
    orderNumber: 'OBJ-2026-0005',
    projectNumber: '26001',
    companyName: 'Revoltum Engineering & Services',
    senderName: 'Anna Asistentka',
    senderEmail: 'anna@revoltum.cz'
  };

  it('předmět obsahuje číslo objednávky a firmu', () => {
    expect(defaultOrderMail(vstup).subject).toBe('Objednávka OBJ-2026-0005 – Revoltum Engineering & Services');
  });

  it('text uvádí číslo objednávky, prosbu o potvrzení a podpis', () => {
    const { body } = defaultOrderMail(vstup);
    expect(body).toContain('objednávku č. OBJ-2026-0005');
    expect(body).toContain('potvrzení');
    expect(body).toContain('Anna Asistentka');
    expect(body).toContain('anna@revoltum.cz');
  });

  it('termín a splatnost se uvedou jen když jsou', () => {
    expect(defaultOrderMail(vstup).body).not.toContain('termín dodání');
    const s = defaultOrderMail({ ...vstup, deliveryDate: '7. 10. 2026', paymentTermDays: 30 }).body;
    expect(s).toContain('Požadovaný termín dodání: 7. 10. 2026.');
    expect(s).toContain('Splatnost faktury: 30 dnů.');
  });

  it('text nemá tři prázdné řádky za sebou ani prázdný konec', () => {
    const { body } = defaultOrderMail(vstup);
    expect(body).not.toMatch(/\n{3,}/);
    expect(body.endsWith('\n')).toBe(false);
  });
});
