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
 * Název složky projektu: `26ZA00005_ZÁKAZNÍK_Popis` (číslo, podtržítko, zbytek názvu; části názvu oddělené ` – ` také podtržítkem)
 * — stejně jako na disku SELATO. Číslo na začátku názvu projektu se nezdvojí, název se zkrátí na rozumnou délku.
 */
export const PROJECT_FOLDER_NAME_MAX = 100;

export function projectFolderName(projectNumber: string, title: string): string {
  const number = (projectNumber || '').trim();
  let rest = (title || '').trim();
  if (number && rest.indexOf(number) === 0) {
    rest = rest.slice(number.length);
  } else {
    rest = rest.replace(/^(\d{2}ZA\d{5}|\d{5,})/, '');
  }
  const withoutNumber = rest
    .replace(/^[\s\-–—_]+/, '')
    .replace(/\s*–\s*/g, '_')
    .trim();
  const name = sanitizeFolderName(`${number}${withoutNumber ? '_' + withoutNumber : ''}`, PROJECT_FOLDER_NAME_MAX);
  return name || sanitizeFolderName(number) || 'projekt';
}

/**
 * Cesta složky ve srovnávací podobě: bez adresy serveru (`https://firma.sharepoint.com`), dekódovaná (`%20` → mezera),
 * bez koncového lomítka, malými písmeny. Funguje pro plnou adresu i pro cestu od kořene serveru (`/sites/…`).
 */
export function comparableFolderPath(urlOrPath: string): string {
  return readableFolderPath(urlOrPath).toLowerCase();
}

/** Cesta složky k zobrazení: bez adresy serveru, dekódovaná, bez koncového lomítka (velikost písmen zůstane). */
function readableFolderPath(urlOrPath: string): string {
  let path = (urlOrPath || '').trim().replace(/^https?:\/\/[^/]+/i, '');
  try {
    path = decodeURIComponent(path);
  } catch {
    // Neplatné %xx — použije se tak, jak je.
  }
  return path.replace(/\/+$/, '');
}

/**
 * Vede uložený odkaz na složku projektu **jinam**, než kam by se složky podle šablony zakládaly?
 * Typicky po změně názvu projektu (název složky se skládá z čísla a názvu) nebo po změně kořenové složky v Nastavení.
 * Doplňování složek se pak nesmí spustit — založilo by druhou, prázdnou složku projektu a odkaz by přesměrovalo na ni.
 * Projekt bez odkazu se nepovažuje za rozpor (složky ještě nemá).
 */
export function folderLinkMismatch(folderUrl: string | undefined, expectedRootUrlOrPath: string): boolean {
  if (!folderUrl || !folderUrl.trim()) {
    return false;
  }
  return comparableFolderPath(folderUrl) !== comparableFolderPath(expectedRootUrlOrPath);
}

/** Text chyby pro `folderLinkMismatch` — stejný v ostrém i ukázkovém režimu. */
export function folderLinkMismatchMessage(currentLink: string, expectedPath: string): string {
  return (
    'Odkaz „Otevřít složku projektu“ vede jinam, než kam by se složky podle šablony zakládaly ' +
    `(odkaz: ${readableFolderPath(currentLink)}; podle šablony: ${readableFolderPath(expectedPath)}). ` +
    'Obvykle je to po změně názvu projektu. Aby nevznikla druhá složka projektu, nic se nezaložilo. ' +
    'Zkontrolujte odkaz v Nastavení projektu → Složky projektu.'
  );
}
