/**
 * Odesílání e-mailů v ukázkovém režimu — nic se neodešle, zpráva se jen uloží do paměti.
 */

import { IMailRepository, OutgoingMail } from '../repositories';
import { attachmentsFit } from '../../core/mail';

export class MockMailRepository implements IMailRepository {
  /** Co by se odeslalo — pro zkoušku a pro testy. */
  public readonly sent: OutgoingMail[] = [];

  public send(mail: OutgoingMail): Promise<void> {
    if (!attachmentsFit(mail.attachments.map((a) => a.content.size))) {
      return Promise.reject(new Error('Přílohy jsou dohromady příliš velké pro jeden e-mail (limit asi 2,8 MB).'));
    }
    this.sent.push(mail);
    return new Promise((resolve) => setTimeout(resolve, 200));
  }
}
