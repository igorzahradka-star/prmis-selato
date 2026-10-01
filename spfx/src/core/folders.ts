/**
 * Plán složek, které se založí při vytvoření projektu — zadání kap. 8.3.
 *
 * Čistá logika bez závislosti na SharePointu: jen spočítá seznam cest,
 * které je potřeba založit. Samotné volání SharePointu dělá repozitář.
 */

import { FolderSettings, FolderTemplateNode } from './settings';
import { sanitizeFolderName } from './numbering';
import { OVERHEAD_FOLDER_NAME } from './overhead';

/**
 * Sestaví seznam relativních cest ke složkám, které se mají založit —
 * v pořadí rodič před dětmi, aby šly zakládat popořadě.
 *
 * Např. při `rootFolder="Projekty"`, `subfolderByYear=true`, roku 2026
 * a názvu projektu „26-014 ČEZ Distribuce" vrátí:
 * `["Projekty", "Projekty/2026", "Projekty/2026/26-014 ČEZ Distribuce",
 *   "Projekty/2026/26-014 ČEZ Distribuce/01-Nabídky", …]`
 *
 * Kořenová složka může být vnořená (`General/01_PROJEKTY`) — každý díl cesty se čistí zvlášť, lomítko mezi díly zůstane.
 * Pro **Režii** (`overheadYear`) je cesta `…/99900-Režie/2026`: společná složka Režie a pod ní rok; název projektu se nepoužije.
 */
export function buildProjectFolderPlan(
  settings: Pick<FolderSettings, 'rootFolder' | 'subfolderByYear' | 'template'>,
  projectFolderName: string,
  startDate?: Date,
  overheadYear?: number
): string[] {
  const segments = projectFolderSegments(settings, projectFolderName, startDate, overheadYear);

  const paths: string[] = [];
  let cumulative = '';
  segments.forEach((segment) => {
    cumulative = cumulative ? `${cumulative}/${segment}` : segment;
    paths.push(cumulative);
  });

  paths.push(...flattenTemplate(settings.template, cumulative));
  return paths;
}

/** Cesta ke **kořenové složce projektu** (ne k poslední podsložce šablony) — z ní se dělá odkaz na projekt. */
export function projectFolderRoot(
  settings: Pick<FolderSettings, 'rootFolder' | 'subfolderByYear' | 'template'>,
  projectFolderName: string,
  startDate?: Date,
  overheadYear?: number
): string {
  return projectFolderSegments(settings, projectFolderName, startDate, overheadYear).join('/');
}

function projectFolderSegments(
  settings: Pick<FolderSettings, 'rootFolder' | 'subfolderByYear'>,
  projectFolderName: string,
  startDate?: Date,
  overheadYear?: number
): string[] {
  const segments: string[] = [];
  settings.rootFolder
    .split('/')
    .map((part) => sanitizeFolderName(part))
    .filter((part) => part !== '')
    .forEach((part) => segments.push(part));
  if (overheadYear !== undefined) {
    segments.push(OVERHEAD_FOLDER_NAME, String(overheadYear));
  } else {
    if (settings.subfolderByYear && startDate) {
      segments.push(String(startDate.getFullYear()));
    }
    segments.push(sanitizeFolderName(projectFolderName));
  }
  return segments;
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
 * Název složky bez číselné předpony (`04-Zápisy` → `zapisy`). Předpona je jedno- nebo dvojčíslí následované oddělovačem;
 * datum `2026-10-01` se tak nezkrátí.
 */
export function folderNameWithoutNumber(name: string): string {
  const key = normalizeFolderName(name);
  const stripped = key.replace(/^\d{1,2} /, '');
  return stripped === '' ? key : stripped;
}

/**
 * Vybere z existujících názvů ten, který odpovídá požadovanému: nejdřív přesná shoda (bez ohledu na velikost písmen),
 * potom shoda ve srovnávací podobě (`normalizeFolderName`) a nakonec shoda bez číselné předpony (`Zápisy` najde `04-Zápisy`). Vrací skutečný název složky, nebo `undefined`.
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
  const normalized = existing.filter((n) => normalizeFolderName(n) === key)[0];
  if (normalized !== undefined) {
    return normalized;
  }
  const bare = folderNameWithoutNumber(wanted);
  return existing.filter((n) => folderNameWithoutNumber(n) === bare)[0];
}

/**
 * Název složky projektu: `26007-Název` (číslo, pomlčka, název) — stejně jako ve stávajících projektech (`26001-MASTIROVICE 1 GENERALNI OPRAVA`)
 * a jak to čte import projektů. Číslo na začátku názvu projektu se nezdvojí, název se zkrátí na rozumnou délku.
 */
export const PROJECT_FOLDER_NAME_MAX = 100;

export function projectFolderName(projectNumber: string, title: string): string {
  const number = (projectNumber || '').trim();
  const withoutNumber = (title || '')
    .trim()
    .replace(/^\d{5,}\s*[-–—_ ]?\s*/, '')
    .trim();
  const name = sanitizeFolderName(`${number}${withoutNumber ? '-' + withoutNumber : ''}`, PROJECT_FOLDER_NAME_MAX);
  return name || sanitizeFolderName(number) || 'projekt';
}
