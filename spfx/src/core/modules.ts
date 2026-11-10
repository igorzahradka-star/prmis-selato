/**
 * Volitelné moduly aplikace — zapínají se v `config/entity.ts` (`ENTITY.modules`).
 *
 * Vypnutý modul se jen skryje (nabídka, záložky, odkazy, instalátor); kód, schéma ani data se nemažou.
 * Čistá logika bez SharePointu a Reactu.
 */

/** Klíč volitelného modulu. */
export type AppModule = 'abra' | 'service';

/** Které volitelné moduly jsou zapnuté. */
export interface AppModules {
  /** Doklady z účetnictví ABRA Flexi. */
  abra: boolean;
  /** Modul Servis. */
  service: boolean;
}

/** Všechno zapnuté — výchozí stav tam, kde se přepínače nepředají (např. testy původního chování). */
export const ALL_MODULES: AppModules = { abra: true, service: true };

/** Je věc patřící k modulu `module` vidět? Věc bez modulu (`undefined`) patří k základu aplikace a je vidět vždy. */
export function isModuleEnabled(module: AppModule | undefined, modules: AppModules): boolean {
  return module === undefined || modules[module] === true;
}

/** Vybere z položek jen ty, jejichž modul je zapnutý (např. seznamy pro instalátor). */
export function withEnabledModules<T extends { module?: AppModule }>(items: T[], modules: AppModules): T[] {
  return items.filter((i) => isModuleEnabled(i.module, modules));
}
