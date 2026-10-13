/**
 * E-mailová upozornění Servisu (nový požadavek, provedení ke kontrole) — respektují osobní nastavení příjemců (Můj profil).
 * Selhání e-mailu nikdy nesmí shodit práci se servisem: funkce nikdy nehází chybu.
 */

import { RepositorySet } from '../../data/repositories';
import { AppSettings } from '../../core/settings';
import { CurrentUser, Role } from '../../core/types';
import { roleRecipients } from '../../core/notifications';
import { applyNotificationPrefs } from '../notify/notificationPrefs';

export function serviceLink(): string {
  const base = (typeof window !== 'undefined' ? window.location.href : '').split('#')[0];
  return `${base}#/servis`;
}

/** Pošle upozornění správcům servisu (mimo toho, kdo akci provedl); vrací větu pro hlášku, nebo prázdný text. */
export async function notifyServiceManagers(repos: RepositorySet, settings: AppSettings, actor: CurrentUser, mail: { subject: string; body: string }): Promise<string> {
  try {
    const members = await repos.userAdmin.listRoleMembers(settings.roles);
    const recipients = roleRecipients(Role.SpravceServisu, members, actor.loginName);
    if (recipients.length === 0) {
      return '';
    }
    const { send } = await applyNotificationPrefs(repos, recipients, 'approvals');
    if (send.length === 0) {
      return '';
    }
    await repos.mail.send({ to: send.map((r) => r.email), subject: mail.subject, bodyText: mail.body, attachments: [] });
    return ` Upozornění odesláno: ${send.map((r) => r.name).join(', ')}.`;
  } catch (e) {
    return ` E-mail správci servisu se nepodařilo odeslat (${e instanceof Error ? e.message : String(e)}).`;
  }
}
