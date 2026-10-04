/**
 * Kusovník v SharePointu — seznam PRM_Catalog (společný pro všechny projekty). Popis položky je ve sloupci Název.
 * Mazání jde do koše webu. Oprávnění rozhodují v `core/catalog`; skutečná ochrana jsou oprávnění seznamu.
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { CurrentUser } from '../../core/types';
import { toDate } from '../../core/format';
import { asCurrencyCode } from '../../core/currency';
import { CatalogInput, CatalogItem, canDeleteCatalog, canWriteCatalog, findInCatalog, validateCatalogInput } from '../../core/catalog';
import { WorkflowError, toActor } from '../../core/orderWorkflow';
import { ICatalogRepository } from '../repositories';
import { getSp, describeSpError, extractStatus } from './spContext';

const LIST = 'PRM_Catalog';
const FIELDS = ['Id', 'Title', 'SupplierName', 'Category', 'ItemCurrency', 'Unit', 'UnitCost', 'Note', 'SourceProject', 'Author/Title', 'Modified'];

interface CatalogRow {
  Id: number;
  Title?: string;
  SupplierName?: string;
  Category?: string;
  ItemCurrency?: string;
  Unit?: string;
  UnitCost?: number;
  Note?: string;
  SourceProject?: string;
  Author?: { Title: string };
  Modified?: string;
}

const MISSING_HINT = 'Seznam kusovníku na webu ještě není založený nebo mu chybí sloupce. Otevřete Instalace a diagnostika a doplňte chybějící části (přidá jen to, co chybí, nic nesmaže).';

function explain(error: unknown, context: string): string {
  const status = extractStatus(error);
  if (status === 400 || status === 404) {
    return `${context}. ${MISSING_HINT}`;
  }
  return describeSpError(error, context);
}

function map(row: CatalogRow): CatalogItem {
  return {
    id: row.Id,
    description: row.Title ?? '',
    supplier: row.SupplierName || undefined,
    category: row.Category || undefined,
    currency: asCurrencyCode(row.ItemCurrency),
    unit: row.Unit || undefined,
    unitCost: row.UnitCost ?? 0,
    note: row.Note || undefined,
    sourceProject: row.SourceProject || undefined,
    createdByName: row.Author?.Title,
    modified: toDate(row.Modified)
  };
}

const fieldsOf = (input: CatalogInput): Record<string, unknown> => ({
  Title: input.description.trim(),
  SupplierName: input.supplier ?? '',
  Category: input.category ?? '',
  ItemCurrency: input.currency,
  Unit: input.unit ?? '',
  UnitCost: input.unitCost,
  Note: input.note ?? '',
  SourceProject: input.sourceProject ?? ''
});

export class SpCatalogRepository implements ICatalogRepository {
  public constructor(private readonly context: WebPartContext) {}

  public async list(): Promise<CatalogItem[]> {
    try {
      const sp = getSp(this.context);
      const rows: CatalogRow[] = await sp.web.lists
        .getByTitle(LIST)
        .items.select(...FIELDS)
        .expand('Author')
        .top(5000)();
      return rows.map(map);
    } catch (error) {
      throw new Error(explain(error, 'Nepodařilo se načíst kusovník'));
    }
  }

  private check(input: CatalogInput, actor: CurrentUser): void {
    if (!canWriteCatalog(toActor(actor))) {
      throw new WorkflowError('Do kusovníku smí ukládat projektový manažer, asistent, vedení nebo administrátor.');
    }
    const issues = validateCatalogInput(input);
    if (issues.length > 0) {
      throw new WorkflowError(issues.join(' '));
    }
  }

  public async save(input: CatalogInput, actor: CurrentUser): Promise<{ item: CatalogItem; updated: boolean }> {
    this.check(input, actor);
    const existing = findInCatalog(await this.list(), input);
    if (existing) {
      return { item: await this.update(existing.id, input, actor), updated: true };
    }
    try {
      const sp = getSp(this.context);
      const added = await sp.web.lists.getByTitle(LIST).items.add(fieldsOf(input));
      const a = added as { data?: { Id?: number }; Id?: number };
      const id = a?.data?.Id ?? a?.Id;
      if (id === undefined) {
        throw new Error('SharePoint nevrátil číslo nové položky.');
      }
      const row: CatalogRow = await sp.web.lists.getByTitle(LIST).items.getById(id).select(...FIELDS).expand('Author')();
      return { item: map(row), updated: false };
    } catch (error) {
      throw new Error(explain(error, 'Položku se nepodařilo uložit do kusovníku'));
    }
  }

  public async update(id: number, input: CatalogInput, actor: CurrentUser): Promise<CatalogItem> {
    this.check(input, actor);
    try {
      const sp = getSp(this.context);
      await sp.web.lists.getByTitle(LIST).items.getById(id).update(fieldsOf(input));
      const row: CatalogRow = await sp.web.lists.getByTitle(LIST).items.getById(id).select(...FIELDS).expand('Author')();
      return map(row);
    } catch (error) {
      throw new Error(explain(error, 'Položku kusovníku se nepodařilo upravit'));
    }
  }

  public async remove(id: number, actor: CurrentUser): Promise<void> {
    if (!canDeleteCatalog(toActor(actor))) {
      throw new WorkflowError('Z kusovníku smí položky mazat jen vedení nebo administrátor.');
    }
    try {
      const sp = getSp(this.context);
      await sp.web.lists.getByTitle(LIST).items.getById(id).recycle();
    } catch (error) {
      throw new Error(explain(error, 'Položku se nepodařilo smazat'));
    }
  }
}
