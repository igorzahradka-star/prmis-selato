/**
 * Průběh a výsledek importu projektů — čistá logika pro panel Import stávajících projektů.
 *
 * Import má dvě fáze: nejdřív se jedním voláním založí záznamy projektů (průběh po jednotlivých
 * projektech nejde zjistit, ukazatel je „neurčitý“), u importu ze seznamu pak po jednom složky
 * podle šablony (ukazatel „hotovo x z y“).
 */

export type ImportPhase = 'records' | 'folders';

export interface ImportProgress {
  phase: ImportPhase;
  /** Kolik projektů už má složky hotové (jen fáze `folders`). */
  done: number;
  total: number;
  /** Číslo projektu, u kterého se právě zakládají složky. */
  current?: string;
}

/**
 * Podíl hotové práce 0–1 pro ukazatel průběhu. `undefined` = neurčitý ukazatel (fáze záznamů,
 * nebo není co počítat). Hodnota se drží v mezích, i kdyby `done` přesáhlo `total`.
 */
export function importProgressFraction(p: ImportProgress): number | undefined {
  if (p.phase !== 'folders' || p.total <= 0) {
    return undefined;
  }
  return Math.max(0, Math.min(1, p.done / p.total));
}

/** Popisek pod ukazatelem průběhu. */
export function importProgressLabel(p: ImportProgress): string {
  if (p.phase === 'records') {
    return `Zakládám záznamy projektů (${p.total})…`;
  }
  const current = p.current && p.done < p.total ? ` · teď ${p.current}` : '';
  return `Zakládám složky podle šablony: hotovo ${p.done} z ${p.total}${current}`;
}

export interface ImportOutcome {
  /** Barva hlášky: vše v pořádku / něco selhalo / nic se nenaimportovalo. */
  kind: 'success' | 'warning' | 'error';
  headline: string;
}

/**
 * Shrnutí po dokončení importu do jedné věty nahoře v panelu.
 * `folderFailures` se počítá jen u importu ze seznamu (u importu z knihovny složky už existují).
 */
export function importOutcome(imported: number, failed: number, folderFailures: number, foldersCreated: boolean): ImportOutcome {
  const parts: string[] = [`naimportováno ${imported} ${projektu(imported)}`];
  if (foldersCreated && imported > 0) {
    parts.push(`složky založeny u ${imported - folderFailures}`);
  }
  if (failed > 0) {
    parts.push(`nenaimportováno ${failed}`);
  }
  if (folderFailures > 0) {
    parts.push(`bez složek ${folderFailures}`);
  }
  const text = parts.join(', ');
  if (imported === 0 && failed > 0) {
    return { kind: 'error', headline: `Import se nepodařil: ${text}.` };
  }
  if (failed > 0 || folderFailures > 0) {
    return { kind: 'warning', headline: `Import dokončen s chybami: ${text}. Podrobnosti jsou níže.` };
  }
  return { kind: 'success', headline: `Import dokončen: ${text}.` };
}

function projektu(n: number): string {
  if (n === 1) {
    return 'projekt';
  }
  return n >= 2 && n <= 4 ? 'projekty' : 'projektů';
}
