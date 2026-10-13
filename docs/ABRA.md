# Napojení na ABRA Flexi — zadání a stav (14. 10. 2026)

## Cíl
Účetnictví (ABRA Flexi) je **jediný zdroj pravdy** pro **Nakoupeno** (faktury přijaté) a **Vyfakturováno** (faktury vydané). Doklady se denně
(a na vyžádání) přenášejí do SharePointu; projektový manažer je v rozpočtu přiřazuje k položkám nákupu a k výnosům.

## Rozhodnutí (Igor, 13.–14. 10. 2026)
- Doklady se v Abře poznají podle **zakázky = číslo projektu** (stejné číslování jako v PRMIS).
- Čtou se **všechny faktury přijaté i vydané a zálohové**; účty 501, 518, 512 (náklady) a 601 (tržby).
- Jen **čtení**, do Abry se nezapisuje.
- **Automatizace** (denně + tlačítko „Aktualizovat z Abry“), ne ruční export.
- **Zálohy** se zobrazují bokem, ale **nezapočítávají** se.
- K položce rozpočtu může být přiřazeno **víc dokladů** (kumulují se); **Nakoupeno = součet dokladů**, ruční zápis se přepíše (zůstává uložený).
  Položka bez dokladů dál používá ruční hodnotu. Totéž pro Vyfakturováno u výnosů. Doklad lze **rozdělit** mezi víc položek. Dobropisy se odečtou.
- **Nezařazeno** (doklady bez přiřazení) je zatím jen upozornění, v součtech projektu není — **ještě se domyslí**.

## Hotovo (0.44.0.0, strana PRMIS)
- `core/abraDocs.ts` (+ testy): typy dokladů, přiřazení, rozdělení, součty, zálohy, „Nezařazeno“.
- `core/budget.ts`: `BudgetDoc.allocations`, `calcItems` (skutečnost z dokladů), `revenueInvoicedOf`.
- Seznamy **PRM_AbraDocs** a **PRM_AbraSync** (schéma 23), repozitáře `SpAbraDocRepository` / `MockAbraDocRepository`.
- UI: část „Doklady z Abry“ v rozpočtu, dialog „Doklady“ u položek a výnosů, tlačítko „Aktualizovat z Abry“.

## Chybí: prostředník (stahování z Flexi do SharePointu)
Prohlížeč se do Flexi přímo nedostane (CORS, heslo), proto potřebujeme prostředníka, který se do Abry přihlásí pod účtem **jen pro čtení**.
Možnosti: **Power Automate** (prémiový konektor HTTP; licence jen pro účet, pod kterým flow běží) — preferováno Igorem, pokud bude funkční;
**Azure Function** (časovač, předplatné Azure — firma ho zatím nemá); plánovač úloh na stálém počítači (nejkřehčí).

### Smlouva prostředníka (co musí dělat, ať je to jedno čím)
1. **Denně** (a když najde v `PRM_AbraSync` položku `Kind = Žádost`, `Status = Čeká`) stáhne z Flexi doklady od začátku zvoleného období
   (návrh: od 1. 1. 2026), které mají vyplněnou zakázku odpovídající číslu projektu.
2. Pro každý doklad **vloží nebo aktualizuje** položku v `PRM_AbraDocs` podle `AbraId` (klíč; evidence + id v Abře). Nic nemaže;
   doklad, který z Abry zmizel, jen označí (návrh: popis „zmizel z Abry“) — přiřazení v rozpočtu zůstávají a aplikace na ně upozorní.
3. Pole: `Title` = číslo dokladu, `AbraId`, `DocType` (`prijata` | `vydana` | `zaloha-prijata` | `zaloha-vydana`), `ProjectNumber`,
   `Partner`, `Description`, `IssueDate`, `DueDate`, `Currency` (CZK/EUR/USD; jiná měna → přepočtená částka v CZK), `AmountNet` (**bez DPH**,
   v měně dokladu, dobropis záporný), `Accounts` (účty z účetního deníku, informativně), `SyncedAt`.
4. Po doběhnutí zapíše do `PRM_AbraSync` položku `Kind = Stav` (`Status = Hotovo` | `Chyba`, `FinishedAt`, `Message`) a čekající žádost přepne na `Hotovo`.
5. Heslo k Abře je **jen v prostředníkovi** (úschovna hesel / připojení). Nikdy v kódu, v repozitáři ani v Nastavení aplikace.

### Flexi API — co ještě ověřit na vaší instanci (podle dokumentace)
Základ: `https://revoltum.flexibee.eu/flexi/<firma>/` · Basic přihlášení · `…/<evidence>.json?limit=0&detail=custom:<pole>` · filtr v adrese `/(…)`.
Evidence: `faktura-prijata`, `faktura-vydana`; zálohové a účetní deník **nepotvrzeno** — názvy a pole zjistí CFO přes `…/<evidence>/properties.json`.
Potřebujeme od CFO (přihlášený v prohlížeči): `faktura-prijata.json?limit=3&detail=full`, `faktura-vydana/properties.json`, `zakazka.json?limit=3`.

## Co zbývá rozhodnout
- Čím poběží prostředník (Power Automate / Azure) a kdo ho nastaví; **účet jen pro čtení** vytvoří CFO.
- „Nezařazeno“ v součtech projektu (zatím mimo).
- Odkdy se doklady stahují (návrh: od 1. 1. 2026).
