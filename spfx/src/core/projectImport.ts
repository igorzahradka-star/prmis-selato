/**
 * Import stávajících projektů ze složek v knihovně.
 *
 * Součást vrstvy `core` — čistá logika bez SharePointu a Reactu.
 *
 * RES vede projekty jako složky pojmenované `26001-MASTIROVICE 1 GENERALNI OPRAVA`,
 * tedy `{ČÍSLO}-{POPIS}`. Tenhle soubor z názvů složek vytáhne čísla a názvy,
 * pozná, co projekt není (`00_Project tools`), a řekne, na jakém čísle má
 * navázat čítač.
 *
 * Import **nic nepřejmenovává ani nepřesouvá**. Složky zůstanou, jak jsou;
 * jen k nim vznikne evidenční záznam v aplikaci.
 */

import { isOverheadNumber } from './overhead';

/** Co jsme z názvu složky vyčetli. */
export interface ImportCandidate {
  /** Název složky tak, jak je v knihovně. */
  folderName: string;
  /** Vytažené číslo projektu, např. `26001`. */
  projectNumber?: string;
  /** Vytažený název, např. `MASTIROVICE 1 GENERALNI OPRAVA`. */
  title?: string;
  /** Rok odvozený z čísla, např. 2026. */
  year?: number;
  /** Co s touhle složkou udělat. */
  action: 'import' | 'skip' | 'duplicate';
  /** Proč se přeskakuje nebo proč je duplicitní. Vyplněno jen u `skip`/`duplicate`. */
  reason?: string;
  /** Je to Režie? Importuje se s příznakem `isOverhead`. */
  isOverhead: boolean;
}

/** Výsledek rozboru celé složky. */
export interface ImportPlan {
  candidates: ImportCandidate[];
  /** Kolik se jich naimportuje. */
  toImport: number;
  /**
   * Na jaké hodnotě má skončit čítač pro daný rok, aby další projekt
   * navázal za nejvyšším importovaným číslem. Klíč je rok.
   */
  counterByYear: { year: number; lastValue: number }[];
}

/**
 * Rozbor jednoho názvu složky.
 *
 * Uznávaný tvar je `{ČÍSLO}-{NÁZEV}` nebo `{ČÍSLO} {NÁZEV}`, kde číslo je
 * pět a více číslic (`26001`). Cokoli jiného je pomocná složka, ne projekt —
 * typicky `00_Project tools`.
 */
export function parseFolderName(folderName: string): ImportCandidate {
  const name = (folderName || '').trim();

  if (!name) {
    return { folderName, action: 'skip', reason: 'Prázdný název složky.', isOverhead: false };
  }

  const match = /^(\d{5,})\s*[-–—_ ]\s*(.*)$/.exec(name);
  if (!match) {
    return {
      folderName: name,
      action: 'skip',
      reason: 'Název nezačíná číslem projektu — nejspíš pomocná složka.',
      isOverhead: false
    };
  }

  const projectNumber = match[1];
  const title = match[2].trim();

  if (!title) {
    return {
      folderName: name,
      projectNumber,
      action: 'skip',
      reason: 'Složka má číslo, ale žádný název.',
      isOverhead: false
    };
  }

  return {
    folderName: name,
    projectNumber,
    title,
    year: yearFromNumber(projectNumber),
    action: 'import',
    isOverhead: isOverheadNumber(projectNumber)
  };
}

/**
 * Sestaví plán importu ze seznamu názvů složek.
 *
 * `existingNumbers` jsou čísla projektů, která už v aplikaci jsou — ta se
 * označí jako duplicitní a **nepřepíšou se**. Import se má dát spustit
 * opakovaně, aniž by podruhé cokoli zdvojil.
 */
export function buildImportPlan(folderNames: string[], existingNumbers: string[] = []): ImportPlan {
  const existing = new Set(existingNumbers.map((n) => n.trim()));
  const videna = new Set<string>();
  const candidates: ImportCandidate[] = [];

  folderNames.forEach((folderName) => {
    const c = parseFolderName(folderName);

    if (c.action === 'import' && c.projectNumber) {
      if (existing.has(c.projectNumber)) {
        c.action = 'duplicate';
        c.reason = `Projekt ${c.projectNumber} už v aplikaci je — přeskočí se, aby se nepřepsal.`;
      } else if (videna.has(c.projectNumber)) {
        c.action = 'duplicate';
        c.reason = `Číslo ${c.projectNumber} má víc složek. Naimportuje se jen první.`;
      } else {
        videna.add(c.projectNumber);
      }
    }

    candidates.push(c);
  });

  candidates.sort(porovnejPodleCisla);

  return {
    candidates,
    toImport: candidates.filter((c) => c.action === 'import').length,
    counterByYear: counterTargets(candidates)
  };
}

/**
 * Na jakou hodnotu nastavit čítač pro každý rok.
 *
 * Bere **nejvyšší** pořadové číslo, ne počet projektů: kdyby některé číslo
 * v řadě chybělo (projekt se zrušil), počítání kusů by řadu vrátilo zpět
 * a další projekt by dostal číslo, které už někdy existovalo.
 *
 * Režie (`{RR}999`) se do maxima nepočítá — jinak by čítač skočil na 999.
 */
export function counterTargets(candidates: ImportCandidate[]): { year: number; lastValue: number }[] {
  const byYear = new Map<number, number>();

  candidates.forEach((c) => {
    if (!c.projectNumber || c.year === undefined || c.isOverhead) {
      return;
    }
    if (c.action !== 'import' && c.action !== 'duplicate') {
      return;
    }
    const sequence = sequenceFromNumber(c.projectNumber);
    if (sequence === undefined) {
      return;
    }
    byYear.set(c.year, Math.max(byYear.get(c.year) ?? 0, sequence));
  });

  const result: { year: number; lastValue: number }[] = [];
  byYear.forEach((lastValue, year) => result.push({ year, lastValue }));
  result.sort((a, b) => a.year - b.year);
  return result;
}

/** Rok z čísla `26001` → 2026. Dvojčíslí bereme jako tenhle věk. */
export function yearFromNumber(projectNumber: string): number | undefined {
  const match = /^(\d{2})(\d{3,})$/.exec(projectNumber.trim());
  return match ? 2000 + parseInt(match[1], 10) : undefined;
}

/** Pořadové číslo z čísla `26001` → 1. */
export function sequenceFromNumber(projectNumber: string): number | undefined {
  const match = /^(\d{2})(\d{3,})$/.exec(projectNumber.trim());
  return match ? parseInt(match[2], 10) : undefined;
}

/** Řadí podle čísla vzestupně; složky bez čísla nakonec, mezi sebou abecedně. */
function porovnejPodleCisla(a: ImportCandidate, b: ImportCandidate): number {
  if (!a.projectNumber && !b.projectNumber) {
    return a.folderName.localeCompare(b.folderName, 'cs-CZ');
  }
  if (!a.projectNumber) {
    return 1;
  }
  if (!b.projectNumber) {
    return -1;
  }
  return a.projectNumber.localeCompare(b.projectNumber, 'cs-CZ', { numeric: true });
}
