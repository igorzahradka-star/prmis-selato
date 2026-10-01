import { attachmentsFit, defaultOrderMail, describeGraphError, isValidEmail, MAIL_MAX_ATTACHMENT_BYTES, parseRecipients, tokenScopes } from './mail';

describe('tokenScopes', () => {
  const jwt = (payload: object): string => {
    const b64 = Buffer.from(JSON.stringify(payload)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `eyJhbGciOiJSUzI1NiJ9.${b64}.podpis`;
  };

  beforeAll(() => {
    // Testovací prostředí nemusí znát atob (prohlížeč ho má).
    if (typeof atob === 'undefined') {
      Object.assign(globalThis, { atob: (s: string): string => Buffer.from(s, 'base64').toString('binary') });
    }
  });

  it('přečte oprávnění z tokenu, včetně diakritiky a chybějícího vyplnění base64', () => {
    expect(tokenScopes(jwt({ scp: 'Mail.Send User.Read' }))).toEqual(['Mail.Send', 'User.Read']);
    expect(tokenScopes(jwt({ scp: 'Mail.Send', name: 'Zahrádka Žluťoučký' }))).toEqual(['Mail.Send']);
  });

  it('token bez oprávnění nebo neplatný vrátí prázdný seznam', () => {
    expect(tokenScopes(jwt({ name: 'x' }))).toEqual([]);
    expect(tokenScopes('nesmysl')).toEqual([]);
    expect(tokenScopes('')).toEqual([]);
  });
});

describe('describeGraphError', () => {
  const HINT = 'Chybí schválení.';

  it('chyba oprávnění dostane návod a vždy i technický detail od Microsoftu', () => {
    const r = describeGraphError({ statusCode: 403, code: 'ErrorAccessDenied', message: 'Access is denied.' }, HINT);
    expect(r.permission).toBe(true);
    expect(r.message).toContain(HINT);
    expect(r.message).toContain('HTTP 403');
    expect(r.message).toContain('ErrorAccessDenied');
    expect(r.message).toContain('Access is denied.');
  });

  it('chybu získání přístupového tokenu (nesouhlas správce) pozná i bez stavového kódu', () => {
    const r = describeGraphError({ message: 'AADSTS65001: The user or administrator has not consented to use the application' }, HINT);
    expect(r.permission).toBe(true);
    expect(r.message).toContain('AADSTS65001');
  });

  it('jiná chyba (schránka, nesmysl v žádosti) návod k oprávnění nedostane, ale detail ano', () => {
    const r = describeGraphError({ statusCode: 404, code: 'MailboxNotEnabledForRESTAPI', message: 'The mailbox is either inactive.' }, HINT);
    expect(r.permission).toBe(false);
    expect(r.message).not.toContain(HINT);
    expect(r.message).toContain('MailboxNotEnabledForRESTAPI');
    expect(r.message).toContain('HTTP 404');
  });

  it('bez jakéhokoli detailu řekne, že chyba není známá', () => {
    expect(describeGraphError({}, HINT).message).toContain('Neznámá chyba');
  });
});

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
