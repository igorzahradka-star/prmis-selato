/**
 * Respektování osobního nastavení upozornění před odesláním e-mailu. Čtení nastavení nikdy nesmí shodit odeslání:
 * když se nastavení nepodaří přečíst, upozornění se pošlou všem (výchozí je zapnuto).
 */

import { RepositorySet } from '../../data/repositories';
import { NotificationKind, splitByPrefs } from '../../core/notifications';
import { Recipient } from '../../core/orderNotify';

export async function applyNotificationPrefs(repos: RepositorySet, recipients: Recipient[], kind: NotificationKind): Promise<{ send: Recipient[]; muted: Recipient[] }> {
  try {
    return splitByPrefs(recipients, await repos.profiles.getNotificationPrefs(), kind);
  } catch {
    return { send: recipients, muted: [] };
  }
}

/** Věta pro uživatele, když si příjemci upozornění vypnuli. */
export function mutedText(muted: Recipient[]): string {
  return muted.length === 0 ? '' : `${muted.map((r) => r.name).join(', ')} má upozornění e-mailem vypnutá`;
}
