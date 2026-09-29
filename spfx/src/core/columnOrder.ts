/**
 * Pořadí sloupců tabulky, které si uživatel může přeskládat — čistá logika.
 *
 * Uložené pořadí nesmí tabulku nikdy rozbít: když aplikace časem přidá sloupec,
 * starý uložený seznam ho nezná, a když sloupec zmizí, uložený seznam ho ještě
 * obsahuje. Nový sloupec se proto zařadí na jeho výchozí místo a zaniklý se ignoruje.
 */

/**
 * Seřadí sloupce podle uloženého pořadí. Sloupce, které v uloženém pořadí nejsou
 * (nové), se zařadí za ten výchozí sloupec, který jim v základním pořadí předchází.
 */
export function orderColumns<T extends { key: string }>(
  columns: T[],
  saved: string[] | undefined,
  defaultOrder: string[]
): T[] {
  const known = columns.map((c) => c.key);
  // Základ: uložené pořadí bez zaniklých sloupců a bez duplicit.
  const order: string[] = [];
  (saved || []).forEach((k) => {
    if (known.indexOf(k) !== -1 && order.indexOf(k) === -1) {
      order.push(k);
    }
  });
  // Chybějící (nové) sloupce vsadit za jejich výchozího předchůdce.
  defaultOrder.forEach((key, i) => {
    if (known.indexOf(key) === -1 || order.indexOf(key) !== -1) {
      return;
    }
    let insertAt = 0;
    for (let j = i - 1; j >= 0; j--) {
      const at = order.indexOf(defaultOrder[j]);
      if (at !== -1) {
        insertAt = at + 1;
        break;
      }
    }
    order.splice(insertAt, 0, key);
  });
  // Sloupce, které nejsou ani ve výchozím pořadí, na konec (nesmí zmizet).
  known.forEach((k) => {
    if (order.indexOf(k) === -1) {
      order.push(k);
    }
  });
  return order.map((k) => columns[known.indexOf(k)]);
}

/** Přesune sloupec z jedné pozice na druhou. Neplatné pozice pořadí nemění. */
export function moveColumn(order: string[], fromIndex: number, toIndex: number): string[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= order.length ||
    toIndex >= order.length
  ) {
    return order.slice();
  }
  const next = order.slice();
  const moved = next.splice(fromIndex, 1)[0];
  next.splice(toIndex, 0, moved);
  return next;
}

/** Je uložené pořadí jiné než výchozí? (Rozhoduje, zda ukázat „Obnovit výchozí pořadí".) */
export function isCustomOrder(saved: string[] | undefined, columnKeys: string[], defaultOrder: string[]): boolean {
  if (!saved || saved.length === 0) {
    return false;
  }
  const effective = orderColumns(
    columnKeys.map((key) => ({ key })),
    saved,
    defaultOrder
  ).map((c) => c.key);
  const base = orderColumns(
    columnKeys.map((key) => ({ key })),
    undefined,
    defaultOrder
  ).map((c) => c.key);
  return effective.join('|') !== base.join('|');
}
