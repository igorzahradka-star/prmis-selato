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
import { GraphErrorInfo, attachmentsFit, describeGraphError } from '../../core/mail';

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
      throw new Error(describeGraphError(error as GraphErrorInfo, PERMISSION_HINT).message);
    }
  }
}
