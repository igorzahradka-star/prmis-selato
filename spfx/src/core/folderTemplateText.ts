/**
 * Šablona složek jako text — čistá logika pro editor v Nastavení → Složky.
 *
 * Jedna složka na řádek, každá úroveň podsložky = odsazení o dvě mezery (tabulátor se počítá jako jedna úroveň).
 * Hloubka není omezená: šablona SELATO má tři úrovně (`A_Projektový management` → `_Smluvní dokumenty` → `_Nabídka`).
 * `templateToText` a `textToTemplate` jsou navzájem obrácené: strom → text → strom vrátí totéž.
 */

import { FolderTemplateNode } from './settings';

/** Kolik mezer znamená jednu úroveň podsložky. */
export const FOLDER_INDENT = '  ';

/** Strom složek → text (podsložky odsazené o dvě mezery na úroveň). */
export function templateToText(nodes: FolderTemplateNode[], level: number = 0): string {
  return nodes
    .map((n) => {
      const line = `${FOLDER_INDENT.repeat(level)}${n.name}`;
      const children = n.children && n.children.length > 0 ? `\n${templateToText(n.children, level + 1)}` : '';
      return line + children;
    })
    .join('\n');
}

/**
 * Text → strom složek, libovolná hloubka.
 *
 * Úroveň řádku = počet mezer na začátku / 2, zaokrouhleno nahoru (jedna zbloudilá mezera tedy dál znamená podsložku,
 * jako dřív). Řádek odsazený o víc úrovní, než kolik jich nad ním je, se připojí jako podsložka té nejhlubší
 * (nevznikne díra ve stromu). Prázdné řádky se přeskakují, `\r` z Windows nevadí.
 */
export function textToTemplate(text: string): FolderTemplateNode[] {
  const result: FolderTemplateNode[] = [];
  // stack[i] = poslední složka na úrovni i — kandidát na rodiče řádku na úrovni i + 1.
  const stack: FolderTemplateNode[] = [];
  (text || '').split('\n').forEach((rawLine) => {
    const line = rawLine.replace(/\t/g, FOLDER_INDENT);
    const name = line.trim();
    if (!name) {
      return;
    }
    const spaces = line.length - line.replace(/^ +/, '').length;
    const level = Math.min(Math.ceil(spaces / FOLDER_INDENT.length), stack.length);
    const node: FolderTemplateNode = { name };
    if (level === 0) {
      result.push(node);
    } else {
      const parent = stack[level - 1];
      parent.children = parent.children || [];
      parent.children.push(node);
    }
    stack.length = level;
    stack.push(node);
  });
  return result;
}
