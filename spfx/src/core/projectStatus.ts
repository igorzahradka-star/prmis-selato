/**
 * Rychlá změna stavu projektu přímo ze seznamu — čistá logika.
 *
 * Stav se mění nejčastěji, proto jde přepnout bez otevření detailu. Formulář
 * úpravy ale hlídá, že dokončený projekt má skutečné datum ukončení; rychlá
 * změna tohle pravidlo nesmí obejít, jen ho splní za člověka.
 */

import { Project, ProjectStatus } from './types';

/** Co se má při změně stavu zapsat. */
export interface StatusChange {
  status: ProjectStatus;
  /** Nastavit skutečné ukončení (jen když ho dokončený projekt ještě nemá). */
  endDateActual?: Date;
  /** Věta pro uživatele, když aplikace udělala víc než jen přepnutí stavu. */
  note?: string;
}

/**
 * Sestaví zápis pro změnu stavu. Přechod do stavu Dokončeno bez skutečného ukončení
 * doplní dnešní datum a řekne to; jinak mění jen stav.
 */
export function quickStatusChange(project: Project, newStatus: ProjectStatus, today: Date = new Date()): StatusChange {
  if (newStatus === ProjectStatus.Dokonceno && !project.endDateActual) {
    return {
      status: newStatus,
      endDateActual: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
      note: `Projekt ${project.projectNumber}: skutečné ukončení nastaveno na dnešní datum. Případně ho upravte v detailu projektu.`
    };
  }
  return { status: newStatus };
}

/**
 * Stavy nabízené v přepínači: všechny platné, a když má projekt uloženou nestandardní
 * hodnotu (ručně přidanou ve SharePointu), zůstane v nabídce, aby se neztratila.
 */
export function statusChoices(current: string, all: ProjectStatus[]): string[] {
  const values: string[] = all.map((s) => String(s));
  return values.indexOf(current) === -1 ? [current, ...values] : values;
}

/** Stavy, ve kterých má smysl schválený realizační rozpočet (Nabídka a Storno ne). */
export const APPROVAL_COMPATIBLE_STATUSES: ProjectStatus[] = [ProjectStatus.Priprava, ProjectStatus.Realizace, ProjectStatus.Pozastaveno, ProjectStatus.Dokonceno, ProjectStatus.Reklamace];

/** Výchozí stav, který se nabídne při schválení rozpočtu projektu ve stavu, který se schválením nesouhlasí. */
export const APPROVAL_DEFAULT_STATUS = ProjectStatus.Priprava;

/** Smí mít projekt v tomto stavu schválený rozpočet? Nabídka (ještě není zakázáno) a Storno ne. */
export function statusAllowsApprovedBudget(status: string): boolean {
  return APPROVAL_COMPATIBLE_STATUSES.some((s) => String(s) === status) || status === 'Uzavřeno';
}

/** Stavy, které se v přehledu projektů ve výchozím stavu skrývají (dokončené a stornované; „Uzavřeno“ je starý název Dokončeno). */
export function isHiddenByDefault(status: string): boolean {
  return status === String(ProjectStatus.Dokonceno) || status === String(ProjectStatus.Storno) || status === 'Uzavřeno';
}
