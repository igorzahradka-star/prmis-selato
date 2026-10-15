/**
 * Čtení projektů pro web part „Běžící projekty“ — jen údaje určené všem (název, PM, lokalita, prodejní cena, stav).
 * Náklady a marže se nenačítají. Funguje i z jiného webu (kopie web partu na webu Revoltum): data se čtou z webu s aplikací.
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { webListWithDefaults, WebListSettings } from '../../core/webProjects';
import { IWebProjectsRepository, WebProjectsData } from '../repositories';
import { describeSpError, extractStatus, getSp, getSpForSite } from './spContext';
import { escapeODataString } from './spSettingsRepository';
import { mapProject } from './spProjectRepository';

const BASE_FIELDS = ['Id', 'Title', 'ProjectNumber', 'ProjectManager/Title', 'ProjectManager/Name', 'ProjectStatus', 'Location', 'ContractPriceNet', 'Currency', 'IsOverhead', 'ProjectType'];
/** Součty rozpočtu přibyly ve schématu 17 — dokud je web nezná, načte se seznam bez nich (cena = smluvní cena). */
const BUDGET_FIELDS = ['BudgetSaleTotal', 'BudgetApproved'];

type Item = Parameters<typeof mapProject>[0];

export class SpWebProjectsRepository implements IWebProjectsRepository {
  public constructor(private readonly context: WebPartContext, private readonly siteUrl: string) {}

  private get sp(): ReturnType<typeof getSp> {
    return this.siteUrl ? getSpForSite(this.context, this.siteUrl) : getSp(this.context);
  }

  public async load(): Promise<WebProjectsData> {
    const settings = await this.readSettings();
    if (settings.statuses.length === 0) {
      return { settings, projects: [] };
    }
    const filter = `IsOverhead eq 0 and ProjectType ne 'Servis' and (${settings.statuses.map((s) => `ProjectStatus eq '${escapeODataString(s)}'`).join(' or ')})`;
    const run = (fields: string[]): Promise<Item[]> =>
      this.sp.web.lists
        .getByTitle('PRM_Projects')
        .items.select(...fields)
        .expand('ProjectManager')
        .filter(filter)
        .orderBy('ProjectNumber', false)
        .top(500)() as Promise<Item[]>;
    try {
      let items: Item[];
      try {
        items = await run([...BASE_FIELDS, ...BUDGET_FIELDS]);
      } catch (error) {
        if (extractStatus(error) !== 400) {
          throw error;
        }
        items = await run(BASE_FIELDS);
      }
      return { settings, projects: items.map(mapProject) };
    } catch (error) {
      throw new Error(describeSpError(error, 'Nepodařilo se načíst seznam projektů'));
    }
  }

  /** Nastavení z PRMIS; když ho uživatel nesmí číst nebo není uložené, platí výchozí. */
  private async readSettings(): Promise<WebListSettings> {
    try {
      const items = await this.sp.web.lists.getByTitle('PRM_Settings').items.filter("SettingKey eq 'webList'").select('SettingValue').top(1)();
      if (items.length > 0 && items[0].SettingValue) {
        return webListWithDefaults(JSON.parse(items[0].SettingValue) as Partial<WebListSettings>);
      }
    } catch {
      // Chybějící oprávnění nebo poškozený JSON nesmí seznam shodit — použijí se výchozí hodnoty.
    }
    return webListWithDefaults(undefined);
  }
}
