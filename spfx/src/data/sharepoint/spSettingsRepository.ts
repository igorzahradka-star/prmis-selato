/**
 * Nastavení aplikace uložené v seznamu PRM_Settings.
 *
 * Jedna položka = jedna sekce nastavení. Hodnota je JSON, aby se daly
 * sekce rozšiřovat bez zásahu do schématu seznamu.
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { AppSettings, withDefaults } from '../../core/settings';
import { ISettingsRepository } from '../repositories';
import { getSp, describeSpError } from './spContext';

const SETTINGS_LIST = 'PRM_Settings';
const SCHEMA_VERSION_KEY = 'schemaVersion';

interface SettingItem {
  Id: number;
  SettingKey: string;
  SettingValue: string;
}

export class SpSettingsRepository implements ISettingsRepository {
  /** Nastavení se během jednoho načtení stránky nemění — čteme ho jednou. */
  private cache: AppSettings | undefined;

  public constructor(private readonly context: WebPartContext) {}

  public async get(): Promise<AppSettings> {
    if (this.cache) {
      return this.cache;
    }
    const items = await this.readAll();
    const stored: Record<string, unknown> = {};

    items.forEach((item) => {
      if (item.SettingKey === SCHEMA_VERSION_KEY) {
        return;
      }
      try {
        stored[item.SettingKey] = JSON.parse(item.SettingValue || '{}');
      } catch {
        // Poškozený JSON nesmí shodit celou aplikaci — sekce se prostě
        // nahradí výchozími hodnotami a admin si toho všimne v Nastavení.
        stored[item.SettingKey] = undefined;
      }
    });

    this.cache = withDefaults(stored as Partial<AppSettings>);
    return this.cache;
  }

  public async saveSection<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ): Promise<void> {
    try {
      const sp = getSp(this.context);
      const list = sp.web.lists.getByTitle(SETTINGS_LIST);
      const existing = await list.items
        .filter(`SettingKey eq '${escapeODataString(String(key))}'`)
        .select('Id')
        .top(1)();

      const payload = {
        Title: String(key),
        SettingKey: String(key),
        SettingValue: JSON.stringify(value)
      };

      if (existing.length > 0) {
        await list.items.getById(existing[0].Id).update(payload);
      } else {
        await list.items.add(payload);
      }
      // Cache je po zápisu neplatná.
      this.cache = undefined;
    } catch (error) {
      throw new Error(describeSpError(error, `Nepodařilo se uložit nastavení „${String(key)}"`));
    }
  }

  public async getSchemaVersion(): Promise<number> {
    const items = await this.readAll();
    const found = items.filter((i) => i.SettingKey === SCHEMA_VERSION_KEY)[0];
    if (!found) {
      return 0;
    }
    const parsed = parseInt(found.SettingValue, 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  public async setSchemaVersion(version: number): Promise<void> {
    try {
      const sp = getSp(this.context);
      const list = sp.web.lists.getByTitle(SETTINGS_LIST);
      const existing = await list.items
        .filter(`SettingKey eq '${SCHEMA_VERSION_KEY}'`)
        .select('Id')
        .top(1)();

      const payload = {
        Title: SCHEMA_VERSION_KEY,
        SettingKey: SCHEMA_VERSION_KEY,
        SettingValue: String(version)
      };

      if (existing.length > 0) {
        await list.items.getById(existing[0].Id).update(payload);
      } else {
        await list.items.add(payload);
      }
    } catch (error) {
      throw new Error(describeSpError(error, 'Nepodařilo se uložit verzi datové struktury'));
    }
  }

  /** Přečte celý seznam nastavení. Je malý — vejde se do jedné stránky. */
  private async readAll(): Promise<SettingItem[]> {
    try {
      const sp = getSp(this.context);
      return await sp.web.lists
        .getByTitle(SETTINGS_LIST)
        .items.select('Id', 'SettingKey', 'SettingValue')
        .top(200)();
    } catch {
      // Seznam ještě neexistuje → aplikace poběží na výchozím nastavení
      // a instalační průvodce nabídne jeho založení.
      return [];
    }
  }
}

/** Ošetří apostrof v hodnotě OData filtru. */
export function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}
