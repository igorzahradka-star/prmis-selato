/**
 * Koncepty dokumentů ve složce projektu: `OBJ-2026-0001 (KO).pdf` je pracovní verze dokumentu, ještě než je vystavený.
 *
 * Objednávky, podklady pro fakturaci a zápisy se ukládají do složky projektu už jako koncept, aby s nimi projektový manažer mohl
 * pracovat dřív. Koncept má za názvem před příponou ` (KO)`; ostrý dokument má stejný název bez něj. Když se dokument vystaví,
 * koncept se nahradí ostrou verzí (smaže se do koše SharePointu); když se dokument stornuje nebo smaže, koncept zůstane.
 */

/** Přípona názvu konceptu (před příponou souboru). */
export const CONCEPT_MARK = ' (KO)';

/** `OBJ-2026-0001.pdf` → `OBJ-2026-0001 (KO).pdf`. Název bez přípony dostane označení na konec. */
export function conceptFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) {
    return `${fileName}${CONCEPT_MARK}`;
  }
  return `${fileName.slice(0, dot)}${CONCEPT_MARK}${fileName.slice(dot)}`;
}

/** Je to koncept (název končí ` (KO)` před příponou)? */
export function isConceptFileName(fileName: string): boolean {
  const dot = fileName.lastIndexOf('.');
  const base = dot <= 0 ? fileName : fileName.slice(0, dot);
  return base.length > CONCEPT_MARK.length && base.slice(base.length - CONCEPT_MARK.length) === CONCEPT_MARK;
}

/** `OBJ-2026-0001 (KO).pdf` → `OBJ-2026-0001.pdf`; ostrý název vrátí beze změny. */
export function finalFileName(fileName: string): string {
  if (!isConceptFileName(fileName)) {
    return fileName;
  }
  const dot = fileName.lastIndexOf('.');
  const base = dot <= 0 ? fileName : fileName.slice(0, dot);
  const ext = dot <= 0 ? '' : fileName.slice(dot);
  return `${base.slice(0, base.length - CONCEPT_MARK.length)}${ext}`;
}
