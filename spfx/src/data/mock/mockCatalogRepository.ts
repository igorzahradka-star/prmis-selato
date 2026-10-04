/**
 * Kusovník v ukázkovém režimu — v paměti, bez SharePointu. Pravidla zápisu (kdo smí co) jsou stejná jako v ostré implementaci.
 */

import { CurrentUser } from '../../core/types';
import { CatalogInput, CatalogItem, canDeleteCatalog, canWriteCatalog, findInCatalog, validateCatalogInput } from '../../core/catalog';
import { WorkflowError, toActor } from '../../core/orderWorkflow';
import { ICatalogRepository } from '../repositories';

function delay<T>(value: T, ms: number = 120): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export const MOCK_CATALOG: CatalogItem[] = [
  { id: 1, description: 'FV panel 550 Wp', supplier: 'NODA', category: 'Materiál', currency: 'EUR', unit: 'ks', unitCost: 95, sourceProject: '25001', createdByName: 'Igor Zahrádka', modified: new Date(2026, 8, 20) },
  { id: 2, description: 'Kabel CYKY 4×16', supplier: 'ELKA', category: 'Materiál', currency: 'CZK', unit: 'm', unitCost: 118, sourceProject: '25001', createdByName: 'Igor Zahrádka', modified: new Date(2026, 8, 21) },
  { id: 3, description: 'Rozvaděč RH1', supplier: 'Beltec', category: 'Materiál', currency: 'CZK', unit: 'ks', unitCost: 48500, sourceProject: '25002', createdByName: 'Jan Novák', modified: new Date(2026, 8, 25) }
];

export class MockCatalogRepository implements ICatalogRepository {
  private items: CatalogItem[] = MOCK_CATALOG.map((c) => ({ ...c }));
  private nextId = 100;

  public list(): Promise<CatalogItem[]> {
    return delay(this.items.map((c) => ({ ...c })));
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
    const existing = findInCatalog(this.items, input);
    if (existing) {
      const item = { ...existing, ...input, modified: new Date() };
      this.items = this.items.map((c) => (c.id === existing.id ? item : c));
      return delay({ item: { ...item }, updated: true });
    }
    const item: CatalogItem = { ...input, id: this.nextId++, createdByName: actor.displayName, modified: new Date() };
    this.items = [...this.items, item];
    return delay({ item: { ...item }, updated: false });
  }

  public async update(id: number, input: CatalogInput, actor: CurrentUser): Promise<CatalogItem> {
    this.check(input, actor);
    const existing = this.items.filter((c) => c.id === id)[0];
    if (!existing) {
      throw new WorkflowError('Položka kusovníku nebyla nalezena.');
    }
    const item = { ...existing, ...input, modified: new Date() };
    this.items = this.items.map((c) => (c.id === id ? item : c));
    return delay({ ...item });
  }

  public async remove(id: number, actor: CurrentUser): Promise<void> {
    if (!canDeleteCatalog(toActor(actor))) {
      throw new WorkflowError('Z kusovníku smí položky mazat jen vedení nebo administrátor.');
    }
    this.items = this.items.filter((c) => c.id !== id);
    return delay(undefined);
  }
}
