/**
 * Plán složek, které se založí při vytvoření projektu — zadání kap. 8.3.
 *
 * Čistá logika bez závislosti na SharePointu: jen spočítá seznam cest,
 * které je potřeba založit. Samotné volání SharePointu dělá repozitář.
 */

import { FolderSettings, FolderTemplateNode } from './settings';
import { sanitizeFolderName } from './numbering';

/**
 * Sestaví seznam relativních cest ke složkám, které se mají založit —
 * v pořadí rodič před dětmi, aby šly zakládat popořadě.
 *
 * Např. při `rootFolder="Projekty"`, `subfolderByYear=true`, roku 2026
 * a názvu projektu „26-014 ČEZ Distribuce" vrátí:
 * `["Projekty", "Projekty/2026", "Projekty/2026/26-014 ČEZ Distribuce",
 *   "Projekty/2026/26-014 ČEZ Distribuce/01_Smlouvy a objednávky zákazníka", …]`
 */
export function buildProjectFolderPlan(
  settings: Pick<FolderSettings, 'rootFolder' | 'subfolderByYear' | 'template'>,
  projectFolderName: string,
  startDate?: Date
): string[] {
  const segments: string[] = [];
  if (settings.rootFolder.trim()) {
    segments.push(sanitizeFolderName(settings.rootFolder));
  }
  if (settings.subfolderByYear && startDate) {
    segments.push(String(startDate.getFullYear()));
  }
  segments.push(sanitizeFolderName(projectFolderName));

  const paths: string[] = [];
  let cumulative = '';
  segments.forEach((segment) => {
    cumulative = cumulative ? `${cumulative}/${segment}` : segment;
    paths.push(cumulative);
  });

  const projectRoot = cumulative;
  paths.push(...flattenTemplate(settings.template, projectRoot));
  return paths;
}

function flattenTemplate(nodes: FolderTemplateNode[], basePath: string): string[] {
  const paths: string[] = [];
  nodes.forEach((node) => {
    const name = sanitizeFolderName(node.name);
    if (!name) {
      return;
    }
    const path = `${basePath}/${name}`;
    paths.push(path);
    if (node.children && node.children.length > 0) {
      paths.push(...flattenTemplate(node.children, path));
    }
  });
  return paths;
}

/**
 * Název složky ve srovnávací podobě: bez velikosti písmen a diakritiky, s podtržítkem, pomlčkou a mezerou
 * považovanými za totéž. `07_Dokumentace a podklady` a `07-Dokumentace a podklady` tak vyjdou stejně.
 * Slouží k tomu, aby aplikace nezakládala druhou složku, když už se stejným názvem (jen psaným trochu jinak) existuje.
 */
export function normalizeFolderName(name: string): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\-–—\s]+/g, ' ')
    .trim();
}

/**
 * Vybere z existujících názvů ten, který odpovídá požadovanému: nejdřív přesná shoda (bez ohledu na velikost písmen),
 * potom shoda ve srovnávací podobě (`normalizeFolderName`). Vrací skutečný název složky, nebo `undefined`.
 */
export function findMatchingFolder(existing: string[], wanted: string): string | undefined {
  const lower = (wanted || '').toLowerCase();
  const same = existing.filter((n) => n === wanted)[0];
  if (same !== undefined) {
    return same;
  }
  const exact = existing.filter((n) => n.toLowerCase() === lower)[0];
  if (exact !== undefined) {
    return exact;
  }
  const key = normalizeFolderName(wanted);
  if (key === '') {
    return undefined;
  }
  return existing.filter((n) => normalizeFolderName(n) === key)[0];
}
