/**
 * Profily uživatelů v ukázkovém režimu — podpisy jen v paměti prohlížeče, do zavření stránky.
 */

import { CurrentUser } from '../../core/types';
import { UserSignature, signatureKey, validateSignatureDataUrl } from '../../core/signatures';
import { IProfileRepository } from '../repositories';

export class MockProfileRepository implements IProfileRepository {
  private readonly signatures = new Map<string, UserSignature>();

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
