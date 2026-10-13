/**
 * Profily uživatelů v seznamu PRM_UserProfiles — zatím podpis jako obrázek.
 *
 * Čtení **nikdy nesmí shodit** tvorbu dokladu: před doplněním schématu seznam na webu není a doklad se má vytvořit i bez
 * obrázku podpisu. Zápis smí jen vlastník podpisu (ověřuje se tady; skutečná ochrana jsou oprávnění seznamu v SharePointu).
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { CurrentUser } from '../../core/types';
import { toDate } from '../../core/format';
import { UserSignature, isSignatureImage, signatureKey, validateSignatureDataUrl } from '../../core/signatures';
import { DEFAULT_NOTIFICATION_PREFS, NotificationPrefs, prefsFromJson, prefsKey, prefsToJson } from '../../core/notifications';
import { emailFromLogin } from '../../core/orderNotify';
import { IProfileRepository } from '../repositories';
import { getSp, describeSpError, extractStatus } from './spContext';

const PROFILES_LIST = 'PRM_UserProfiles';

interface ProfileItem {
  Id: number;
  UserLogin?: string;
  UserName?: string;
  Signature?: string;
  SignatureUpdated?: string;
  NotifyPrefs?: string;
}

const FIELDS = ['Id', 'UserLogin', 'UserName', 'Signature', 'SignatureUpdated'];
const NOTIFY_FIELD = 'NotifyPrefs';

function toSignature(item: ProfileItem): UserSignature | undefined {
  if (!item.Signature || !isSignatureImage(item.Signature)) {
    return undefined;
  }
  return { login: item.UserLogin || '', displayName: item.UserName || '', imageDataUrl: item.Signature, updated: toDate(item.SignatureUpdated) };
}

export class SpProfileRepository implements IProfileRepository {
  public constructor(private readonly context: WebPartContext) {}

  private async readAll(): Promise<ProfileItem[]> {
    const sp = getSp(this.context);
    const items = sp.web.lists.getByTitle(PROFILES_LIST).items;
    try {
      return await items.select(...FIELDS, NOTIFY_FIELD).top(1000)();
    } catch (error) {
      // Sloupec nastavení upozornění ještě na webu není (chybí Instalace) — podpisy se čtou dál.
      if (extractStatus(error) !== 400) {
        throw error;
      }
      return items.select(...FIELDS).top(1000)();
    }
  }

  public async getSignatures(logins: string[]): Promise<Record<string, UserSignature>> {
    const wanted = new Set(logins.map((l) => signatureKey(l)).filter((k) => k !== ''));
    const out: Record<string, UserSignature> = {};
    if (wanted.size === 0) {
      return out;
    }
    try {
      (await this.readAll()).forEach((item) => {
        const key = signatureKey(item.UserLogin);
        const signature = toSignature(item);
        if (signature && wanted.has(key)) {
          out[key] = signature;
        }
      });
    } catch {
      // Seznam ještě není (před Instalací) nebo se nepodařilo přečíst — doklad se vytvoří bez obrázku podpisu.
    }
    return out;
  }

  public async getSignature(login: string): Promise<UserSignature | undefined> {
    return (await this.getSignatures([login]))[signatureKey(login)];
  }

  private async findItem(login: string): Promise<ProfileItem | undefined> {
    const key = signatureKey(login);
    return (await this.readAll()).filter((i) => signatureKey(i.UserLogin) === key)[0];
  }

  public async saveSignature(actor: CurrentUser, imageDataUrl: string): Promise<UserSignature> {
    const problem = validateSignatureDataUrl(imageDataUrl);
    if (problem) {
      throw new Error(problem);
    }
    const now = new Date();
    try {
      const sp = getSp(this.context);
      const list = sp.web.lists.getByTitle(PROFILES_LIST);
      const existing = await this.findItem(actor.loginName);
      const fields = { UserName: actor.displayName, Signature: imageDataUrl, SignatureUpdated: now.toISOString() };
      if (existing) {
        await list.items.getById(existing.Id).update(fields);
      } else {
        await list.items.add({ Title: actor.loginName, UserLogin: actor.loginName, ...fields });
      }
    } catch (error) {
      if (extractStatus(error) === 404 || extractStatus(error) === 400) {
        throw new Error('Podpis se nepodařilo uložit — na webu chybí seznam „Profily uživatelů“. Požádejte administrátora, ať spustí Instalaci a diagnostiku.');
      }
      throw new Error(describeSpError(error, 'Podpis se nepodařilo uložit'));
    }
    return { login: actor.loginName, displayName: actor.displayName, imageDataUrl, updated: now };
  }

  public async getNotificationPrefs(): Promise<Record<string, NotificationPrefs>> {
    const out: Record<string, NotificationPrefs> = {};
    try {
      (await this.readAll()).forEach((item) => {
        const email = emailFromLogin(item.UserLogin);
        if (email && item.NotifyPrefs) {
          out[prefsKey(email)] = prefsFromJson(item.NotifyPrefs);
        }
      });
    } catch {
      // Seznam nebo sloupec ještě není — upozornění se posílají všem (výchozí zapnuto).
    }
    return out;
  }

  public async getMyNotificationPrefs(actor: CurrentUser): Promise<NotificationPrefs> {
    try {
      const item = await this.findItem(actor.loginName);
      return item && item.NotifyPrefs ? prefsFromJson(item.NotifyPrefs) : { ...DEFAULT_NOTIFICATION_PREFS };
    } catch {
      return { ...DEFAULT_NOTIFICATION_PREFS };
    }
  }

  public async saveNotificationPrefs(actor: CurrentUser, prefs: NotificationPrefs): Promise<void> {
    try {
      const list = getSp(this.context).web.lists.getByTitle(PROFILES_LIST);
      const existing = await this.findItem(actor.loginName);
      const fields = { UserName: actor.displayName, [NOTIFY_FIELD]: prefsToJson(prefs) };
      if (existing) {
        await list.items.getById(existing.Id).update(fields);
      } else {
        await list.items.add({ Title: actor.loginName, UserLogin: actor.loginName, ...fields });
      }
    } catch (error) {
      if (extractStatus(error) === 404 || extractStatus(error) === 400) {
        throw new Error('Nastavení se nepodařilo uložit — na webu chybí seznam nebo sloupec profilů. Požádejte administrátora, ať spustí Instalaci a diagnostiku.');
      }
      throw new Error(describeSpError(error, 'Nastavení upozornění se nepodařilo uložit'));
    }
  }

  public async removeSignature(actor: CurrentUser): Promise<void> {
    try {
      const existing = await this.findItem(actor.loginName);
      if (existing) {
        await getSp(this.context).web.lists.getByTitle(PROFILES_LIST).items.getById(existing.Id).update({ Signature: '', SignatureUpdated: new Date().toISOString() });
      }
    } catch (error) {
      throw new Error(describeSpError(error, 'Podpis se nepodařilo odstranit'));
    }
  }
}
