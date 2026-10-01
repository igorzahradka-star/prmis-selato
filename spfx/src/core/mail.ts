/**
 * E-maily — čistá logika: kontrola adres, velikost příloh a výchozí text e-mailu s objednávkou.
 * Samotné odeslání (Microsoft Graph) je v datové vrstvě.
 */

/** Jednoduchá kontrola tvaru adresy — víc než „obsahuje zavináč", míň než celá norma. Skutečné doručení ověří až pošta. */
export function isValidEmail(text: string): boolean {
  return /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/.test(text.trim());
}

/**
 * Rozdělí adresy zapsané do jednoho pole (čárka, středník, mezera, nový řádek).
 * Duplicity (bez ohledu na velikost písmen) se spojí; špatný tvar se vrátí zvlášť, aby šel ukázat.
 */
export function parseRecipients(text: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen: string[] = [];
  (text || '')
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .forEach((s) => {
      if (!isValidEmail(s)) {
        invalid.push(s);
        return;
      }
      const key = s.toLowerCase();
      if (seen.indexOf(key) === -1) {
        seen.push(key);
        valid.push(s);
      }
    });
  return { valid, invalid };
}

/**
 * Nejvíc, kolik smí e-mail s přílohami zabrat. Microsoft Graph přijme jednu žádost do cca 4 MB
 * a přílohy se při odeslání zvětší o třetinu (base64), proto rezerva.
 */
export const MAIL_MAX_ATTACHMENT_BYTES = 2.8 * 1024 * 1024;

/** Vejdou se přílohy do jednoho e-mailu? */
export function attachmentsFit(sizes: number[]): boolean {
  return sizes.reduce((sum, s) => sum + s, 0) <= MAIL_MAX_ATTACHMENT_BYTES;
}

/** Výchozí předmět a text e-mailu dodavateli. Uživatel je před odesláním může upravit. */
export function defaultOrderMail(input: {
  orderNumber: string;
  projectNumber: string;
  companyName: string;
  senderName: string;
  senderEmail?: string;
  deliveryDate?: string;
  paymentTermDays?: number;
}): { subject: string; body: string } {
  const lines = [
    'Dobrý den,',
    '',
    `v příloze zasíláme objednávku č. ${input.orderNumber} (projekt ${input.projectNumber}).`,
    input.deliveryDate ? `Požadovaný termín dodání: ${input.deliveryDate}.` : '',
    input.paymentTermDays !== undefined ? `Splatnost faktury: ${input.paymentTermDays} dnů.` : '',
    '',
    `Prosíme o potvrzení přijetí objednávky. Na faktuře prosím uvádějte číslo objednávky ${input.orderNumber}.`,
    '',
    'S pozdravem',
    input.senderName,
    input.companyName,
    input.senderEmail || ''
  ];
  // Prázdné řádky z nevyplněných údajů (termín, splatnost) se vynechají, odstavce zůstanou.
  const body = lines
    .filter((l, i) => !(l === '' && (i === 3 || i === 4)) && !(l === '' && i === lines.length - 1))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/, '');
  return { subject: `Objednávka ${input.orderNumber} – ${input.companyName}`, body };
}

/** Výchozí předmět a text e-mailu účtárně s podkladem pro fakturaci. Uživatel je před odesláním může upravit. */
export function defaultInvoiceMail(input: {
  number: string;
  /** Podklad pro zálohovou fakturu (jinak běžná faktura). */
  advance?: boolean;
  projectNumber: string;
  projectName?: string;
  customerName?: string;
  amountText: string;
  dueDate?: string;
  senderName: string;
  senderEmail?: string;
  companyName: string;
}): { subject: string; body: string } {
  const lines = [
    'Dobrý den,',
    '',
    `v příloze zasíláme podklad pro ${input.advance ? 'zálohovou fakturu' : 'fakturaci'} č. ${input.number}.`,
    `Projekt: ${input.projectNumber}${input.projectName ? ' ' + input.projectName : ''}`,
    `Odběratel: ${input.customerName || '—'}`,
    `Částka bez DPH: ${input.amountText}`,
    input.dueDate ? `Splatnost: ${input.dueDate}` : '',
    '',
    input.advance ? 'Prosíme o vystavení zálohové faktury a sdělení jejího čísla.' : 'Prosíme o vystavení faktury a sdělení jejího čísla.',
    '',
    'S pozdravem',
    input.senderName,
    input.companyName,
    input.senderEmail || ''
  ];
  const body = lines.filter((l, i) => !(l === '' && i === 6)).join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '');
  return { subject: `Podklad pro ${input.advance ? 'zálohovou fakturu' : 'fakturaci'} ${input.number} – ${input.customerName || input.projectNumber}`, body };
}

/** Co Microsoft Graph vrátil při odeslání — nejen text, ale i číselný kód, ze kterého jde poznat příčina. */
export interface GraphErrorInfo {
  statusCode?: number;
  code?: string;
  message?: string;
}

/**
 * Oprávnění (`scp`) z přihlašovacího tokenu Microsoft Graph. Token je JWT (tři části oddělené tečkou); prostřední část je
 * JSON v kódování base64url. Podle výsledku se pozná, jestli token Mail.Send obsahuje (pak je chyba jinde),
 * nebo ne (pak prohlížeč drží starý token, nebo schválení ještě nedoběhlo). Neplatný token vrátí prázdný seznam.
 */
export function tokenScopes(token: string): string[] {
  try {
    const part = (token || '').split('.')[1];
    if (!part) {
      return [];
    }
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4);
    const payload = JSON.parse(decodeURIComponent(escape(atob(padded)))) as { scp?: string };
    return (payload.scp || '').split(' ').filter((s) => s !== '');
  } catch {
    return [];
  }
}

/**
 * Převede chybu odeslání na větu pro člověka. Chyba oprávnění (403, 401, nesouhlas správce) dostane návod, co schválit,
 * ale **vždy se připojí technický detail** (kód a text od Microsoftu) — bez něj se z hlášky nedá poznat, jestli chybí
 * schválení, jestli prohlížeč drží starý přístupový token, nebo jde o schránku uživatele.
 */
export function describeGraphError(error: GraphErrorInfo, permissionHint: string): { permission: boolean; message: string } {
  const parts = [error.statusCode ? `HTTP ${error.statusCode}` : '', error.code || '', error.message || ''].filter((p) => p && p.trim() !== '');
  const detail = parts.length > 0 ? ` (Technický detail: ${parts.join(' – ')})` : '';
  const text = `${error.code || ''} ${error.message || ''}`;
  const permission =
    error.statusCode === 403 ||
    error.statusCode === 401 ||
    /Authorization|Forbidden|consent|AccessDenied|permission|AADSTS65001|AADSTS500011/i.test(text);
  return permission
    ? { permission, message: `${permissionHint}${detail}` }
    : { permission, message: `E-mail se nepodařilo odeslat.${detail || ' Neznámá chyba.'}` };
}
