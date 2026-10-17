/**
 * Kontroly účetnictví napříč projekty — čistá logika: u každého projektu kolik řádků z Abry není přiřazeno k rozpočtu, kolik oprav čeká
 * na odeslání účtárně a kolik jich visí na účtárně. Podklad pro obrazovku Kontroly projektů.
 */

import { AbraDoc, orphanAllocations, unallocatedDocs } from './abraDocs';
import { AbraCorrection, isOpenCorrection, summarizeCorrections } from './abraCorrections';
import { DocAllocation } from './budget';

export interface CheckedProject {
  projectNumber: string;
  title: string;
  projectManagerName?: string;
  projectManagerLogin?: string;
}

export interface ProjectCheck extends CheckedProject {
  /** Řádků z Abry celkem (bez záloh). */
  lines: number;
  /** Řádky, kterým zbývá něco přiřadit k rozpočtu (bez záloh a bez řádků s otevřenou opravou). */
  unassigned: number;
  /** Přiřazení v rozpočtu k řádkům, které už v projektu nejsou (přesunuté jinam nebo smazané v Abře). */
  orphans: number;
  /** Opravy označené, ale neodeslané účtárně. */
  fixToSend: number;
  /** Opravy odeslané účtárně, čekají na opravu v Abře. */
  fixWaiting: number;
  /** Nejdéle čekající odeslaná oprava ve dnech. */
  oldestWaitingDays?: number;
  /** Má projekt něco k řešení? */
  hasProblem: boolean;
}

/**
 * Kontroly všech projektů. Projekt bez řádků z Abry a bez otevřených oprav se vynechá (není co kontrolovat).
 * `allocations` jsou přiřazení z rozpočtu podle čísla projektu (chybí-li rozpočet, jsou všechny řádky nepřiřazené).
 */
export function projectChecks(projects: CheckedProject[], docs: AbraDoc[], allocations: Record<string, DocAllocation[] | undefined>, corrections: AbraCorrection[], today: Date = new Date()): ProjectCheck[] {
  const out: ProjectCheck[] = [];
  projects.forEach((p) => {
    const own = docs.filter((d) => d.projectNumber === p.projectNumber);
    const fixes = corrections.filter((c) => c.projectNumber === p.projectNumber && isOpenCorrection(c));
    const orphans = orphanAllocations(own, allocations[p.projectNumber]).length;
    if (own.length === 0 && fixes.length === 0 && orphans === 0) {
      return;
    }
    const flagged = new Set(fixes.map((c) => c.abraId));
    const unassigned = unallocatedDocs(
      own.filter((d) => !flagged.has(d.abraId)),
      allocations[p.projectNumber]
    ).length;
    const sum = summarizeCorrections(fixes, today);
    out.push({
      ...p,
      lines: own.filter((d) => d.type === 'prijata' || d.type === 'vydana').length,
      unassigned,
      orphans,
      fixToSend: sum.toSend,
      fixWaiting: sum.waiting,
      oldestWaitingDays: sum.oldestWaitingDays,
      hasProblem: unassigned > 0 || orphans > 0 || sum.toSend > 0 || sum.waiting > 0
    });
  });
  return out.sort((a, b) => (b.oldestWaitingDays ?? -1) - (a.oldestWaitingDays ?? -1) || b.fixToSend - a.fixToSend || b.unassigned - a.unassigned || a.projectNumber.localeCompare(b.projectNumber));
}

export interface ChecksTotals {
  projects: number;
  unassigned: number;
  orphans: number;
  fixToSend: number;
  fixWaiting: number;
  oldestWaitingDays?: number;
}

export function checksTotals(checks: ProjectCheck[]): ChecksTotals {
  const days = checks.map((c) => c.oldestWaitingDays).filter((d): d is number => d !== undefined);
  return {
    projects: checks.filter((c) => c.hasProblem).length,
    unassigned: checks.reduce((s, c) => s + c.unassigned, 0),
    orphans: checks.reduce((s, c) => s + c.orphans, 0),
    fixToSend: checks.reduce((s, c) => s + c.fixToSend, 0),
    fixWaiting: checks.reduce((s, c) => s + c.fixWaiting, 0),
    oldestWaitingDays: days.length > 0 ? Math.max(...days) : undefined
  };
}
