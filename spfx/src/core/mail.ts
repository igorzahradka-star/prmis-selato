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
