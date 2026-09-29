/**
 * Instalační a diagnostický průvodce.
 *
 * Zadavatel není vývojář, proto si aplikace svou datovou strukturu založí sama —
 * bez PowerShellu. Průvodce:
 *   1. zjistí, co existuje a co chybí (`diagnose`) — nic přitom nemění,
 *   2. na tlačítko chybějící části **přidá** (`install`).
 *
 * ŽELEZNÉ PRAVIDLO: nikdy nic nemaže, nepřejmenovává ani nepřepisuje.
 * Opakované spuštění nesmí nic rozbít (idempotence).
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { PermissionKind } from '@pnp/sp/security/index.js';
import {
  DiagnosticItem,
  DiagnosticReport,
  IInstallRepository,
  InstallProgress
} from '../repositories';
import { LISTS, ListDef, SCHEMA_VERSION, creationOrder, listsForSite } from '../schema';
import { buildFieldXml, ADD_FIELD_INTERNAL_NAME_HINT } from './fieldXml';
import { mergedChoices, missingChoices } from './choiceSync';
import { getSp, getSpForSite, describeSpError } from './spContext';
import { SpSettingsRepository } from './spSettingsRepository';

/** Šablona SharePoint seznamu. */
const TEMPLATE_GENERIC_LIST = 100;
const TEMPLATE_DOCUMENT_LIBRARY = 101;

/**
 * Volby pro AddFieldAsXml:
 *   1 = AddToDefaultContentType — bez toho by sloupec nebyl v položkách použitelný
 *   8 = AddFieldInternalNameHint — přinutí SharePoint použít náš anglický interní název
 *
 * Záměrně **nepřidáváme** sloupce do výchozího zobrazení (16). Seznamy mají
 * přes 20 sloupců a výchozí pohled by byl nečitelný. S daty se pracuje
 * v aplikaci, ne přímo v seznamu.
 */
const ADD_FIELD_OPTIONS = 1 | ADD_FIELD_INTERNAL_NAME_HINT;

/** Kolik verzí položky si SharePoint pamatuje. Audit potřebuje historii. */
const MAJOR_VERSION_LIMIT = 500;

interface ExistingList {
  Id: string;
  Title: string;
  RootFolder: { Name: string };
}

export class SpInstallRepository implements IInstallRepository {
  public constructor(
    private readonly context: WebPartContext,
    private readonly financeSiteUrl: string,
    private readonly settingsRepo: SpSettingsRepository
  ) {}

  public getPlannedLists(): ListDef[] {
    return creationOrder(LISTS);
  }

  public async diagnose(): Promise<DiagnosticReport> {
    const items: DiagnosticItem[] = [];
    const canManageWeb = await this.canManageLists();

    if (!canManageWeb) {
      items.push({
        key: 'permissions',
        label: 'Oprávnění pro instalaci',
        state: 'manual',
        detail:
          'Nemáte právo zakládat seznamy na tomto webu. Požádejte správce SharePointu, ' +
          'aby vás přidal do skupiny Vlastníci webu PRM, a spusťte průvodce znovu.'
      });
    }

    const installedVersion = await this.settingsRepo.getSchemaVersion();

    // --- Web PRM ---
    await this.diagnoseSite('PRM', undefined, items);

    // --- Web PRM-Finance ---
    if (!this.financeSiteUrl) {
      items.push({
        key: 'finance-site',
        label: 'Web PRM-Finance',
        state: 'manual',
        detail:
          'Není zadaná adresa webu pro důvěrná finanční data. Správce M365 musí web ' +
          'založit (např. /sites/RES-PRM-Finance), nastavit mu vlastní, nezděděná oprávnění ' +
          'a adresu vyplnit ve vlastnostech web partu. Do té doby finanční moduly nefungují.'
      });
    } else {
      await this.diagnoseSite('PRM-Finance', this.financeSiteUrl, items);
    }

    return {
      codeSchemaVersion: SCHEMA_VERSION,
      installedSchemaVersion: installedVersion,
      canManageWeb,
      items
    };
  }

  public async install(onProgress?: (p: InstallProgress) => void): Promise<DiagnosticReport> {
    const plan = this.buildPlan();
    let done = 0;

    for (const entry of plan) {
      const { list, siteUrl } = entry;
      if (onProgress) {
        onProgress({
          step: `Zakládám ${list.kind === 'library' ? 'knihovnu' : 'seznam'} „${list.title}"`,
          done,
          total: plan.length
        });
      }
      try {
        await this.ensureList(list, siteUrl);
      } catch (error) {
        // Jedna neúspěšná část nesmí zastavit celou instalaci — ostatní
        // seznamy se založí a diagnostika na konci ukáže, co zbývá.
        console.error(describeSpError(error, `Seznam ${list.name}`));
      }
      done++;
    }

    if (onProgress) {
      onProgress({ step: 'Ukládám verzi datové struktury', done, total: plan.length });
    }
    try {
      await this.settingsRepo.setSchemaVersion(SCHEMA_VERSION);
    } catch (error) {
      console.error(describeSpError(error, 'Uložení verze schématu'));
    }

    return this.diagnose();
  }

  // --- diagnostika ---------------------------------------------------------

  private async diagnoseSite(
    site: 'PRM' | 'PRM-Finance',
    siteUrl: string | undefined,
    items: DiagnosticItem[]
  ): Promise<void> {
    const wanted = listsForSite(site);
    let existing: Map<string, ExistingList>;

    try {
      existing = await this.readExistingLists(siteUrl);
    } catch (error) {
      items.push({
        key: `site-${site}`,
        label: `Web ${site}`,
        state: 'error',
        detail: describeSpError(error, `Nepodařilo se načíst seznamy webu ${site}`)
      });
      return;
    }

    for (const def of wanted) {
      const found = existing.get(def.name);
      const kindLabel = def.kind === 'library' ? 'Knihovna' : 'Seznam';

      if (!found) {
        items.push({
          key: def.name,
          label: `${kindLabel} ${def.title}`,
          state: 'missing',
          detail: `Chybí. Průvodce ho založí i se všemi sloupci a indexy. (${def.description})`
        });
        continue;
      }

      const missing = await this.findMissing(def, siteUrl);
      const missingFields = missing.fields;
      if (missingFields.length === 0 && missing.choices.length > 0) {
        items.push({
          key: def.name,
          label: `${kindLabel} ${def.title}`,
          state: 'missing',
          detail: `Existuje, ale ve sloupcích chybí nové volby: ${missing.choices.join('; ')}. Průvodce je doplní (nic neubere).`
        });
        continue;
      }
      if (missingFields.length === 0) {
        items.push({
          key: def.name,
          label: `${kindLabel} ${def.title}`,
          state: 'ok',
          detail: `Existuje, všech ${def.fields.length} sloupců je na místě.`
        });
      } else {
        items.push({
          key: def.name,
          label: `${kindLabel} ${def.title}`,
          state: 'missing',
          detail: `Existuje, ale chybí sloupce: ${missingFields.join(', ')}. Průvodce je doplní.`
        });
      }
    }
  }

  private async readExistingLists(siteUrl?: string): Promise<Map<string, ExistingList>> {
    const sp = siteUrl ? getSpForSite(this.context, siteUrl) : getSp(this.context);
    const lists = await sp.web.lists
      .select('Id', 'Title', 'RootFolder/Name')
      .expand('RootFolder')
      .top(500)();

    const map = new Map<string, ExistingList>();
    (lists as ExistingList[]).forEach((l) => {
      // Klíčem je název složky v URL — ten se při přejmenování seznamu nemění.
      if (l.RootFolder && l.RootFolder.Name) {
        map.set(l.RootFolder.Name, l);
      }
    });
    return map;
  }

  /** Co seznamu chybí: sloupce a nové volby ve stávajících sloupcích typu Volba. */
  private async findMissing(
    def: ListDef,
    siteUrl?: string
  ): Promise<{ fields: string[]; choices: string[] }> {
    try {
      const sp = siteUrl ? getSpForSite(this.context, siteUrl) : getSp(this.context);
      const rows = (await sp.web.lists
        .getById(await this.getListId(def, siteUrl))
        .fields.select('InternalName', 'Choices')
        .top(500)()) as { InternalName: string; Choices?: string[] }[];
      const byName = new Map<string, { InternalName: string; Choices?: string[] }>();
      rows.forEach((r) => byName.set(r.InternalName, r));

      const fields = def.fields.filter((f) => !byName.has(f.name)).map((f) => f.title);
      const choices: string[] = [];
      def.fields.forEach((f) => {
        const row = byName.get(f.name);
        if (row && (f.type === 'Choice' || f.type === 'MultiChoice') && f.choices) {
          const missing = missingChoices(row.Choices, f.choices);
          if (missing.length > 0) {
            choices.push(`${f.title}: ${missing.join(', ')}`);
          }
        }
      });
      return { fields, choices };
    } catch {
      return { fields: def.fields.map((f) => f.title), choices: [] };
    }
  }

  // --- instalace -----------------------------------------------------------

  /** Plán: co založit a na kterém webu, ve správném pořadí kvůli lookupům. */
  private buildPlan(): { list: ListDef; siteUrl?: string }[] {
    const plan: { list: ListDef; siteUrl?: string }[] = creationOrder(listsForSite('PRM')).map(
      (list) => ({ list, siteUrl: undefined })
    );
    if (this.financeSiteUrl) {
      creationOrder(listsForSite('PRM-Finance')).forEach((list) =>
        plan.push({ list, siteUrl: this.financeSiteUrl })
      );
    }
    return plan;
  }

  /**
   * Zajistí, že seznam existuje a má všechny sloupce. Idempotentní.
   *
   * Seznam se zakládá pod **anglickým** názvem, aby měl čitelnou URL
   * (/Lists/PRM_Projects), a teprve pak se přejmenuje na český zobrazovaný
   * název. Kdybychom ho rovnou pojmenovali česky, URL by byla
   * /Lists/PRM%20%E2%80%93%20Zak%C3%A1zky a odkazy by byly nepoužitelné.
   */
  private async ensureList(def: ListDef, siteUrl?: string): Promise<void> {
    const sp = siteUrl ? getSpForSite(this.context, siteUrl) : getSp(this.context);
    const existing = await this.readExistingLists(siteUrl);
    let listId = existing.get(def.name)?.Id;

    if (!listId) {
      const template = def.kind === 'library' ? TEMPLATE_DOCUMENT_LIBRARY : TEMPLATE_GENERIC_LIST;
      const created = await sp.web.lists.add(def.name, def.description, template, false);
      listId = created.Id;
      if (!listId) {
        throw new Error(`SharePoint nevrátil ID nově založeného seznamu ${def.name}.`);
      }

      await sp.web.lists.getById(listId).update({
        Title: def.title,
        EnableVersioning: def.versioning,
        MajorVersionLimit: MAJOR_VERSION_LIMIT
      });
    }

    await this.ensureFields(def, listId, siteUrl);
  }

  private async ensureFields(def: ListDef, listId: string, siteUrl?: string): Promise<void> {
    const sp = siteUrl ? getSpForSite(this.context, siteUrl) : getSp(this.context);
    const list = sp.web.lists.getById(listId);

    const fields = await list.fields.select('InternalName').top(500)();
    const present = new Set((fields as { InternalName: string }[]).map((f) => f.InternalName));
    const existingBefore = new Set(Array.from(present));

    for (const field of def.fields) {
      if (present.has(field.name)) {
        continue;
      }
      const lookupListId =
        field.type === 'Lookup' && field.lookupList
          ? await this.getListIdByName(field.lookupList, siteUrl)
          : undefined;

      const xml = buildFieldXml(field, lookupListId);
      await list.fields.createFieldAsXml({
        SchemaXml: xml,
        Options: ADD_FIELD_OPTIONS
      });

      if (field.indexed) {
        // U některých typů (Lookup, User) SharePoint atribut Indexed v XML
        // ignoruje. Doindexujeme zvlášť; když to selže, seznam funguje dál,
        // jen bude nad 5 000 položkami pomalejší — proto to není fatální.
        try {
          await list.fields.getByInternalNameOrTitle(field.name).update({ Indexed: true });
        } catch (error) {
          console.warn(describeSpError(error, `Index na sloupci ${def.name}.${field.name}`));
        }
      }
    }

    // Nové volby ve sloupcích, které na webu už byly (nově založené sloupce je mají celé).
    for (const field of def.fields) {
      if (!existingBefore.has(field.name) || !field.choices) {
        continue;
      }
      if (field.type !== 'Choice' && field.type !== 'MultiChoice') {
        continue;
      }
      try {
        const column = list.fields.getByInternalNameOrTitle(field.name);
        const current = (await column.select('Choices')()) as { Choices?: string[] };
        const missing = missingChoices(current.Choices, field.choices);
        if (missing.length > 0) {
          await column.update({ Choices: { results: mergedChoices(current.Choices, field.choices) } });
        }
      } catch (error) {
        // Nefatální: seznam funguje dál, jen nová hodnota půjde uložit až po ručním doplnění.
        console.error(describeSpError(error, `Doplnění voleb sloupce ${def.name}.${field.name}`));
      }
    }
  }

  private async getListId(def: ListDef, siteUrl?: string): Promise<string> {
    return this.getListIdByName(def.name, siteUrl);
  }

  private async getListIdByName(name: string, siteUrl?: string): Promise<string> {
    const existing = await this.readExistingLists(siteUrl);
    const found = existing.get(name);
    if (!found) {
      throw new Error(
        `Seznam ${name} ještě neexistuje. Sloupec, který na něj odkazuje, ` +
          'se doplní při dalším spuštění průvodce.'
      );
    }
    return found.Id;
  }

  private async canManageLists(): Promise<boolean> {
    try {
      return await getSp(this.context).web.currentUserHasPermissions(PermissionKind.ManageLists);
    } catch {
      return false;
    }
  }
}
