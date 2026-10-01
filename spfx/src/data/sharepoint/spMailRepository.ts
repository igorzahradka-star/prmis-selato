/**
 * Odesílání e-mailů přes Microsoft Graph — **jako přihlášený uživatel** (`/me/sendMail`), tedy z jeho schránky,
 * s kopií v jeho Odeslané poště. Aplikace nemá žádný vlastní odesílací účet ani heslo.
 *
 * Potřebuje delegované oprávnění `Mail.Send`. Žádá si ho balíček aplikace (`webApiPermissionRequests`),
 * ale dokud ho správce nepotvrdí (SharePoint admin centrum → Zabezpečení → Přístup k rozhraní API),
 * odeslání skončí chybou. Ta se ukáže česky s návodem a uživatel má v dialogu i cestu bez e-mailu.
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IMailRepository, OutgoingMail } from '../repositories';
import { GraphErrorInfo, attachmentsFit, describeGraphError, tokenScopes } from '../../core/mail';

const PERMISSION_HINT =
  'Odeslání e-mailem zatím nemá oprávnění. Správce musí v SharePoint admin centru (Zabezpečení → Přístup k rozhraní API) ' +
  'schválit požadavek „Microsoft Graph – Mail.Send“ pro PRM Revoltum. Do té doby použijte „Jen uložit PDF a označit jako odesláno“ ' +
  'a e-mail pošlete sami.';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('Soubor se nepodařilo přečíst.'));
    reader.readAsDataURL(blob);
  });
}

export class SpMailRepository implements IMailRepository {
  public constructor(private readonly context: WebPartContext) {}

  public async send(mail: OutgoingMail): Promise<void> {
    if (!attachmentsFit(mail.attachments.map((a) => a.content.size))) {
      throw new Error('Přílohy jsou dohromady příliš velké pro jeden e-mail (limit asi 2,8 MB). Odškrtněte přílohy objednávky, nebo pošlete e-mail sami.');
    }
    const attachments = [];
    for (const a of mail.attachments) {
      attachments.push({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.name,
        contentType: a.contentType,
        contentBytes: await blobToBase64(a.content)
      });
    }

    try {
      const client = await this.context.msGraphClientFactory.getClient('3');
      await client.api('/me/sendMail').post({
        message: {
          subject: mail.subject,
          body: { contentType: 'Text', content: mail.bodyText },
          toRecipients: mail.to.map((address) => ({ emailAddress: { address } })),
          ccRecipients: (mail.cc || []).map((address) => ({ emailAddress: { address } })),
          attachments
        },
        saveToSentItems: true
      });
    } catch (error) {
      // Technický detail od Microsoftu se v hlášce ukáže vždy — podle něj se pozná skutečná příčina.
      const described = describeGraphError(error as GraphErrorInfo, PERMISSION_HINT);
      throw new Error(described.permission ? `${described.message}${await this.scopesNote()}` : described.message);
    }
  }

  /**
   * Při chybě oprávnění zjistí, která oprávnění má přihlašovací token skutečně v sobě. Chybí-li v něm Mail.Send, je to
   * znamení, že prohlížeč drží starý token vydaný před schválením (nebo schválení ještě nedoběhlo); je-li tam, je chyba jinde.
   */
  private async scopesNote(): Promise<string> {
    try {
      const provider = await this.context.aadTokenProviderFactory.getTokenProvider();
      const token = await provider.getToken('https://graph.microsoft.com');
      const scopes = tokenScopes(token);
      if (scopes.length === 0) {
        return ' Přihlašovací token se nepodařilo přečíst.';
      }
      const has = scopes.some((s) => s.toLowerCase() === 'mail.send');
      return ` Oprávnění v přihlašovacím tokenu: ${scopes.join(', ')}. Mail.Send ${has ? 'v tokenu JE — chyba je jinde (schránka uživatele, zásady tenantu)' : 'v tokenu CHYBÍ — odhlaste se z Microsoft 365 a přihlaste znovu (nebo otevřete aplikaci v anonymním okně)'}.`;
    } catch {
      return ' Oprávnění v tokenu se nepodařilo zjistit.';
    }
  }
}
