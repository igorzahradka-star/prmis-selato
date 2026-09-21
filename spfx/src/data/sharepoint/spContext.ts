/**
 * Připojení k SharePointu přes PnPjs v kontextu přihlášeného uživatele.
 *
 * Aplikace nemá žádné vlastní přihlašování ani servisní účet — všechny dotazy
 * jdou pod účtem uživatele. Co uživatel nesmí vidět, SharePoint nevydá.
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs/index.js';
import '@pnp/sp/lists/index.js';
import '@pnp/sp/fields/index.js';
import '@pnp/sp/items/index.js';
import '@pnp/sp/views/index.js';
import '@pnp/sp/site-users/index.js';
import '@pnp/sp/site-groups/index.js';
import '@pnp/sp/security/index.js';

/** Připojení k webu, na kterém běží aplikace (web PRM). */
export function getSp(context: WebPartContext): SPFI {
  return spfi().using(SPFx(context));
}

/** Připojení k jinému webu — typicky PRM-Finance. */
export function getSpForSite(context: WebPartContext, siteUrl: string): SPFI {
  return spfi(siteUrl).using(SPFx(context));
}

/**
 * Převede chybu ze SharePointu na srozumitelnou českou hlášku.
 *
 * Zadavatel není vývojář — hláška musí říct, co se stalo a co s tím dělat,
 * ne vypsat stack trace. Původní text chyby se připojí na konec pro případ,
 * že bude potřeba ho poslat do podpory.
 */
export function describeSpError(error: unknown, context: string): string {
  const raw = extractMessage(error);
  const status = extractStatus(error);

  if (status === 403) {
    return (
      `${context}: nemáte dostatečná oprávnění. ` +
      'Požádejte správce SharePointu o přidání do příslušné skupiny na webu PRM. ' +
      `(Technicky: ${raw})`
    );
  }
  if (status === 404) {
    return (
      `${context}: požadovaná data nebo seznam neexistují. ` +
      'Spusťte prosím Správa → Instalace a diagnostika a doplňte chybějící části. ' +
      `(Technicky: ${raw})`
    );
  }
  if (status === 412) {
    return (
      `${context}: záznam mezitím změnil někdo jiný. ` +
      'Načtěte si prosím stránku znovu a změnu zopakujte. ' +
      `(Technicky: ${raw})`
    );
  }
  if (status === 429 || status === 503) {
    return (
      `${context}: SharePoint je momentálně zahlcený a požadavek odmítl. ` +
      'Zkuste to prosím za chvíli znovu. ' +
      `(Technicky: ${raw})`
    );
  }
  return `${context}: ${raw}`;
}

function extractMessage(error: unknown): string {
  if (!error) {
    return 'neznámá chyba';
  }
  if (typeof error === 'string') {
    return error;
  }
  const e = error as { message?: string; data?: { responseBody?: unknown } };
  if (e.message) {
    // PnPjs vkládá do message celé tělo odpovědi; zkrátíme na rozumnou délku.
    return e.message.length > 400 ? `${e.message.substring(0, 400)}…` : e.message;
  }
  return String(error);
}

/** HTTP status z chyby PnPjs, pokud jde zjistit. Používá i `describeSpError`. */
export function extractStatus(error: unknown): number | undefined {
  const e = error as { status?: number; httpStatus?: number; message?: string };
  if (typeof e?.status === 'number') {
    return e.status;
  }
  if (typeof e?.httpStatus === 'number') {
    return e.httpStatus;
  }
  // PnPjs v4 vrací status i v textu zprávy: „...(403) Forbidden..."
  const match = /\((\d{3})\)/.exec(e?.message ?? '');
  return match ? parseInt(match[1], 10) : undefined;
}
