/**
 * Doplnění voleb do existujících sloupců typu Volba — čistá logika.
 *
 * Schválně **bez importu SharePointu a PnPjs**, aby šla otestovat.
 *
 * Když se do schématu přidá nová hodnota (např. stav projektu „Reklamace“),
 * sloupec, který už na webu existuje, ji nezná — a protože nepovolujeme
 * vlastní hodnoty, SharePoint by ji při uložení odmítl. Průvodce proto
 * chybějící volby **doplní**. Nikdy žádnou neubere ani nepřepíše: na webu mohou být
 * projekty se starou hodnotou (třeba zrušené „Uzavřeno“) a ty se nesmí rozbít.
 */

/** Volby, které schéma chce a sloupec na webu nemá. Pořadí podle schématu. */
export function missingChoices(existing: string[] | undefined, wanted: string[]): string[] {
  const have = existing || [];
  return wanted.filter((w) => have.indexOf(w) === -1);
}

/** Nový seznam voleb pro zápis: všechny stávající (i ty už neplatné) a za nimi chybějící. */
export function mergedChoices(existing: string[] | undefined, wanted: string[]): string[] {
  return [...(existing || []), ...missingChoices(existing, wanted)];
}
