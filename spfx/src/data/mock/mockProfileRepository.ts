/**
 * Profily uživatelů v ukázkovém režimu — podpisy jen v paměti prohlížeče, do zavření stránky.
 */

import { CurrentUser } from '../../core/types';
import { UserSignature, signatureKey, validateSignatureDataUrl } from '../../core/signatures';
import { DEFAULT_NOTIFICATION_PREFS, NotificationPrefs, prefsKey } from '../../core/notifications';
import { emailFromLogin } from '../../core/orderNotify';
import { IProfileRepository } from '../repositories';

export class MockProfileRepository implements IProfileRepository {
  private readonly signatures = new Map<string, UserSignature>();
  private readonly prefs = new Map<string, NotificationPrefs>();

  private keyOf(actor: CurrentUser): string {
    return prefsKey(emailFromLogin(actor.loginName) || actor.email || actor.loginName);
  }

  public getNotificationPrefs(): Promise<Record<string, NotificationPrefs>> {
    const out: Record<string, NotificationPrefs> = {};
    this.prefs.forEach((v, k) => (out[k] = { ...v }));
    return Promise.resolve(out);
  }

  public getMyNotificationPrefs(actor: CurrentUser): Promise<NotificationPrefs> {
    return Promise.resolve({ ...(this.prefs.get(this.keyOf(actor)) || DEFAULT_NOTIFICATION_PREFS) });
  }

  public saveNotificationPrefs(actor: CurrentUser, prefs: NotificationPrefs): Promise<void> {
    this.prefs.set(this.keyOf(actor), { ...prefs });
    return Promise.resolve();
  }

  public getSignatures(logins: string[]): Promise<Record<string, UserSignature>> {
    const out: Record<string, UserSignature> = {};
    logins.forEach((l) => {
      const key = signatureKey(l);
      const found = this.signatures.get(key);
      if (found) {
        out[key] = { ...found };
      }
    });
    return Promise.resolve(out);
  }

  public async getSignature(login: string): Promise<UserSignature | undefined> {
    return (await this.getSignatures([login]))[signatureKey(login)];
  }

  public saveSignature(actor: CurrentUser, imageDataUrl: string): Promise<UserSignature> {
    const problem = validateSignatureDataUrl(imageDataUrl);
    if (problem) {
      return Promise.reject(new Error(problem));
    }
    const signature: UserSignature = { login: actor.loginName, displayName: actor.displayName, imageDataUrl, updated: new Date() };
    this.signatures.set(signatureKey(actor.loginName), signature);
    return Promise.resolve({ ...signature });
  }

  public removeSignature(actor: CurrentUser): Promise<void> {
    this.signatures.delete(signatureKey(actor.loginName));
    return Promise.resolve();
  }
}
