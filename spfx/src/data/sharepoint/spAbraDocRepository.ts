/**
 * Doklady z ABRA Flexi (PRM_AbraDocs) a stav stahování (PRM_AbraSync).
 *
 * Doklady do seznamu zapisuje prostředník (denní stahování z Abry pod vlastním účtem). Aplikace je jen čte; zápis z aplikace
 * je jediný — žádost „Aktualizovat z Abry“ jako položka v PRM_AbraSync, kterou prostředník vyzvedne. Čtení nikdy nesmí shodit
 * rozpočet: před Instalací seznamy nejsou, a pak se vrací prázdný výsledek.
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { CurrentUser } from '../../core/types';
import { toDate } from '../../core/format';
import { asCurrencyCode } from '../../core/currency';
import { AbraDoc, AbraDocType } from '../../core/abraDocs';
import { AbraSyncStatus, IAbraDocRepository } from '../repositories';
import { getSp, describeSpError } from './spContext';

const DOCS_LIST = 'PRM_AbraDocs';
const SYNC_LIST = 'PRM_AbraSync';

const DOC_TYPES: AbraDocType[] = ['prijata', 'vydana', 'zaloha-prijata', 'zaloha-vydana'];

interface DocItem {
  Id: number;
  Title?: string;
  AbraId?: string;
  DocType?: string;
  ProjectNumber?: string;
  Partner?: string;
  Description?: string;
  IssueDate?: string;
  DueDate?: string;
  Currency?: string;
  AmountNet?: number;
  AmountNetCzk?: number;
  Accounts?: string;
  SyncedAt?: string;
}

const FIELDS = ['Id', 'Title', 'AbraId', 'DocType', 'ProjectNumber', 'Partner', 'Description', 'IssueDate', 'DueDate', 'Currency', 'AmountNet', 'AmountNetCzk', 'Accounts', 'SyncedAt'];

function toDoc(item: DocItem): AbraDoc | undefined {
  const type = DOC_TYPES.filter((t) => t === item.DocType)[0];
  if (!type || !item.AbraId || typeof item.AmountNet !== 'number') {
    return undefined;
  }
  return {
    id: item.Id,
    abraId: item.AbraId,
    type,
    number: item.Title || item.AbraId,
    projectNumber: item.ProjectNumber || '',
    partnerName: item.Partner || undefined,
    description: item.Description || undefined,
    issueDate: toDate(item.IssueDate),
    dueDate: toDate(item.DueDate),
    currency: asCurrencyCode(item.Currency || 'CZK'),
    amountNet: item.AmountNet,
    amountNetCzk: typeof item.AmountNetCzk === 'number' ? item.AmountNetCzk : undefined,
    accounts: item.Accounts ? item.Accounts.split(/[\s,;]+/).filter((a) => a !== '') : undefined,
    syncedAt: toDate(item.SyncedAt)
  };
}

export class SpAbraDocRepository implements IAbraDocRepository {
  public constructor(private readonly context: WebPartContext) {}

  public async list(projectNumber: string): Promise<AbraDoc[]> {
    try {
      const sp = getSp(this.context);
      const items: DocItem[] = await sp.web.lists
        .getByTitle(DOCS_LIST)
        .items.select(...FIELDS)
        .filter(`ProjectNumber eq '${projectNumber.replace(/'/g, "''")}'`)
        .top(5000)();
      return items.map(toDoc).filter((d): d is AbraDoc => !!d);
    } catch {
      // Seznam ještě není (před Instalací) nebo se nepodařilo přečíst — rozpočet se otevře i bez dokladů.
      return [];
    }
  }

  public async listAll(): Promise<AbraDoc[]> {
    try {
      const sp = getSp(this.context);
      const items: DocItem[] = await sp.web.lists
        .getByTitle(DOCS_LIST)
        .items.select(...FIELDS)
        .top(5000)();
      return items.map(toDoc).filter((d): d is AbraDoc => !!d);
    } catch {
      return [];
    }
  }

  public async syncStatus(): Promise<AbraSyncStatus> {
    try {
      const sp = getSp(this.context);
      const items: { Id: number; Kind?: string; Status?: string; RequestedAt?: string; FinishedAt?: string; Message?: string }[] = await sp.web.lists
        .getByTitle(SYNC_LIST)
        .items.select('Id', 'Kind', 'Status', 'RequestedAt', 'FinishedAt', 'Message')
        .orderBy('Id', false)
        .top(50)();
      const pending = items.filter((i) => i.Kind === 'Žádost' && i.Status === 'Čeká')[0];
      const last = items.filter((i) => i.Kind === 'Stav')[0];
      return {
        configured: true,
        lastSyncAt: last ? toDate(last.FinishedAt) : undefined,
        lastOk: last ? last.Status === 'Hotovo' : undefined,
        lastMessage: last ? last.Message || undefined : undefined,
        pendingSince: pending ? toDate(pending.RequestedAt) : undefined
      };
    } catch {
      return { configured: false };
    }
  }

  public async requestSync(actor: CurrentUser): Promise<void> {
    try {
      const status = await this.syncStatus();
      if (!status.configured) {
        throw new Error('Na webu chybí seznam pro stahování z Abry. Požádejte administrátora, ať spustí Instalaci a diagnostiku.');
      }
      if (status.pendingSince) {
        return;
      }
      await getSp(this.context).web.lists.getByTitle(SYNC_LIST).items.add({
        Title: `Žádost ${actor.displayName}`,
        Kind: 'Žádost',
        Status: 'Čeká',
        RequestedByName: actor.displayName,
        RequestedAt: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof Error && error.message.indexOf('Na webu chybí') === 0) {
        throw error;
      }
      throw new Error(describeSpError(error, 'Žádost o aktualizaci z Abry se nepodařilo zapsat'));
    }
  }
}
