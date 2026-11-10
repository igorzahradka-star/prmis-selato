/**
 * Stránkování seznamů (např. přehled projektů ukazuje nejvýš 9 řádků na stránku). Čistá logika bez Reactu.
 */

export interface PageSlice<T> {
  /** Položky zobrazené stránky. */
  items: T[];
  /** Číslo stránky od 0, oříznuté do platného rozsahu. */
  page: number;
  /** Počet stránek (prázdný seznam = 1 stránka). */
  pageCount: number;
  /** Pořadí první a poslední zobrazené položky od 1 (u prázdného seznamu 0 a 0). */
  from: number;
  to: number;
  total: number;
}

/** Vybere z položek jednu stránku. Stránka mimo rozsah (např. po zúžení filtru) se posune na nejbližší platnou. */
export function pageSlice<T>(items: T[], page: number, size: number): PageSlice<T> {
  const total = items.length;
  const perPage = Math.max(1, Math.floor(size));
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(0, Math.floor(page) || 0), pageCount - 1);
  const start = current * perPage;
  const slice = items.slice(start, start + perPage);
  return {
    items: slice,
    page: current,
    pageCount,
    from: total === 0 ? 0 : start + 1,
    to: start + slice.length,
    total
  };
}
