/**
 * Přidělování čísel dokladů — čte řady z PRM_DocTypes a zvyšuje čítač
 * v PRM_Counters. Viz zadání kap. 7.
 *
 * SharePoint nemá transakce ani unikátní omezení na sloupce, takže souběh
 * řeší tento soubor sám:
 *  - existující čítač se zapisuje s optimistickým zámkem (ETag / If-Match) —
 *    při konfliktu SharePoint vrátí HTTP 412, což se bere jako signál
 *    „někdo tě předběhl, načti znovu a zkus to znovu",
 *  - úplně první řádek čítače (nová řada nebo nový rok) žádný ETag k ochraně
 *    nemá — po založení se proto ověří, že mezitím nevznikl souběžně
 *    duplicitní řádek se stejným klíčem; pokud ano, svůj řádek smaže
 *    a přidělení zopakuje (tentokrát už přes bezpečný ETag update).
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { DocTypeConfig, INumberingRepository } from '../repositories';
import { renderDocumentNumber, nextSequence, counterScopeKey } from '../../core/numbering';
import { getSp, describeSpError, extractStatus } from './spContext';
import { escapeODataString } from './spSettingsRepository';

const DOC_TYPES_LIST = 'PRM_DocTypes';
const COUNTERS_LIST = 'PRM_Counters';
const MAX_ATTEMPTS = 10;

interface DocTypeItem {
  Title: string;
  Code: string;
  Pattern: string;
  Padding: number;
  ResetPeriod: 'Ročně' | 'Nikdy';
  Scope: 'Globální' | 'Projekt';
  StartValue: number;
  Active: boolean;
}

interface CounterItem {
  Id: number;
  LastValue: number;
  'odata.etag'?: string;
}

/** Signalizuje, že se mezi čtením a zápisem čítače vložil souběžný požadavek — zkus to znovu. */
class NumberingConflictError extends Error {}

export class SpNumberingRepository implements INumberingRepository {
  public constructor(private readonly context: WebPartContext) {}

  public async listDocTypes(): Promise<DocTypeConfig[]> {
    try {
      const sp = getSp(this.context);
      const items: DocTypeItem[] = await sp.web.lists
        .getByTitle(DOC_TYPES_LIST)
        .items.select('Title', 'Code', 'Pattern', 'Padding', 'ResetPeriod', 'Scope', 'StartValue', 'Active')
        .top(500)();
      return items.map(mapDocType);
    } catch (error) {
      throw new Error(describeSpError(error, 'Nepodařilo se načíst číselné řady'));
    }
  }

  public async previewNextNumber(
    docTypeCode: string,
    opts?: { projectNumber?: string; date?: Date }
  ): Promise<string> {
    const docType = await this.getActiveDocType(docTypeCode);
    if (!docType) {
      throw new Error(`Neznámá nebo neaktivní číselná řada „${docTypeCode}".`);
    }
    const year = (opts?.date ?? new Date()).getFullYear();
    const scopeKey = counterScopeKey(docType.scope, opts?.projectNumber);

    try {
      const sp = getSp(this.context);
      const rows: CounterItem[] = await sp.web.lists
        .getByTitle(COUNTERS_LIST)
        .items.select('LastValue')
        .filter(
          `DocTypeCode eq '${escapeODataString(docType.code)}' and Year eq ${year} and ScopeKey eq '${escapeODataString(scopeKey)}'`
        )
        .top(1)();
      const existing = rows[0];
      const sequence = nextSequence(existing ? { year, lastValue: existing.LastValue } : undefined, docType, year);
      return renderDocumentNumber(docType, {
        prefix: docType.code,
        year,
        sequence,
        projectNumber: opts?.projectNumber
      });
    } catch (error) {
      throw new Error(describeSpError(error, 'Nepodařilo se načíst náhled čísla'));
    }
  }

  public async allocateNumber(
    docTypeCode: string,
    opts?: { projectNumber?: string; date?: Date }
  ): Promise<string> {
    const docType = await this.getActiveDocType(docTypeCode);
    if (!docType) {
      throw new Error(`Neznámá nebo neaktivní číselná řada „${docTypeCode}".`);
    }

    const year = (opts?.date ?? new Date()).getFullYear();
    const scopeKey = counterScopeKey(docType.scope, opts?.projectNumber);

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await this.tryAllocate(docType, year, scopeKey, opts?.projectNumber);
      } catch (error) {
        lastError = error;
        if (!(error instanceof NumberingConflictError) && extractStatus(error) !== 412) {
          throw new Error(describeSpError(error, 'Nepodařilo se přidělit číslo dokladu'));
        }
        // Konflikt — někdo jiný mezitím čítač změnil. Zkus to znovu od začátku.
      }
    }
    throw new Error(
      describeSpError(lastError, 'Nepodařilo se přidělit číslo dokladu — příliš mnoho současných pokusů')
    );
  }

  private async getActiveDocType(code: string): Promise<DocTypeConfig | undefined> {
    try {
      const sp = getSp(this.context);
      const items: DocTypeItem[] = await sp.web.lists
        .getByTitle(DOC_TYPES_LIST)
        .items.select('Title', 'Code', 'Pattern', 'Padding', 'ResetPeriod', 'Scope', 'StartValue', 'Active')
        .filter(`Code eq '${escapeODataString(code)}' and Active eq 1`)
        .top(1)();
      return items.length > 0 ? mapDocType(items[0]) : undefined;
    } catch (error) {
      throw new Error(describeSpError(error, 'Nepodařilo se načíst číselnou řadu'));
    }
  }

  /** Jeden pokus o přidělení čísla. Při souběhu vyhodí `NumberingConflictError`. */
  private async tryAllocate(
    docType: DocTypeConfig,
    year: number,
    scopeKey: string,
    projectNumber: string | undefined
  ): Promise<string> {
    const sp = getSp(this.context);
    const list = sp.web.lists.getByTitle(COUNTERS_LIST);
    const filter =
      `DocTypeCode eq '${escapeODataString(docType.code)}' and ` +
      `Year eq ${year} and ScopeKey eq '${escapeODataString(scopeKey)}'`;

    const rows: CounterItem[] = await list.items.select('Id', 'LastValue').filter(filter).top(1)();
    const existing = rows[0];
    const sequence = nextSequence(existing ? { year, lastValue: existing.LastValue } : undefined, docType, year);

    if (existing) {
      try {
        await list.items.getById(existing.Id).update({ LastValue: sequence }, existing['odata.etag'] ?? '*');
      } catch (error) {
        if (extractStatus(error) === 412) {
          throw new NumberingConflictError();
        }
        throw error;
      }
    } else {
      const added = await list.items.add({
        Title: `${docType.code} ${year} ${scopeKey}`.trim(),
        DocTypeCode: docType.code,
        Year: year,
        ScopeKey: scopeKey,
        LastValue: sequence
      });
      const newId = extractAddedId(added);

      // Nikdo tu ještě řádek neměl (žádný ETag k ochraně) — ověř, že mezitím
      // nevznikl souběžně duplicitní řádek se stejným klíčem.
      const rivals: { Id: number }[] = await list.items.select('Id').filter(filter).orderBy('Id').top(5)();
      if (rivals.length > 1 && newId !== undefined && rivals[0].Id !== newId) {
        // Prohrál jsi — někdo jiný založil řádek dřív. Smaž svůj duplicit
        // a zkus to znovu; tentokrát už řádek existuje a půjde bezpečně
        // přes ETag update výše.
        await list.items.getById(newId).delete();
        throw new NumberingConflictError();
      }
    }

    return renderDocumentNumber(docType, { prefix: docType.code, year, sequence, projectNumber });
  }
}

function mapDocType(item: DocTypeItem): DocTypeConfig {
  return {
    code: item.Code,
    name: item.Title,
    pattern: item.Pattern,
    padding: item.Padding,
    resetPeriod: item.ResetPeriod,
    scope: item.Scope,
    startValue: item.StartValue,
    active: item.Active
  };
}

function extractAddedId(added: unknown): number | undefined {
  const a = added as { data?: { Id?: number }; Id?: number };
  return a?.data?.Id ?? a?.Id;
}
