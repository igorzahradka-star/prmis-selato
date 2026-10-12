# REVCRM — souběžný projekt vedle PRMIS (zadání a dohoda o spolupráci)

Zapsáno 4. 10. 2026 podle zadání Igora Zahrádky. **Zatím jen zadání a návrh — nic se nestaví**, dokud Igor neodpoví na otevřené otázky dole.

## Co REVCRM má být

- Evidence **obchodních příležitostí** společnosti **REVOLTUM a.s. (matka)**. Uložená na SharePointu matky.
- **Partneři** (zákazníci, dodavatelé) se **sdílejí s PRMIS** — dají se zakládat a upravovat v obou systémech a jsou v obou vidět.
- Obchodní případ má vlastní **rozpočet** (kalkulace), vlastní složku s dokumenty, rozdělenou na **komerční část** (SharePoint matky) a **technickou část** (SharePoint RES).
- Až se příležitost vyhraje, **předá se do PRMIS**: založí se projekt a rozpočet se přenese (kalkulace → realizační rozpočet).
- Později (Fáze 5 PRMIS): samostatná aplikace **Kalkulace nabídek**, která spolupracuje s PRMIS; patří do stejné rodiny (rozhodnout, zda je to součást REVCRM).

## Návrh uspořádání (k odsouhlasení)

1. **Dva samostatné projekty (repozitáře)**: `C:\Projekty\prm-revoltum` (PRMIS, existuje) a nový `C:\Projekty\revcrm`. Každý má vlastní CLAUDE.md, NAVAZANI.md a sestavení. Společné jsou jen **dohodnuté datové struktury** (viz níže).
2. **Sdílený seznam partnerů = stávající PRM_Partners na webu RES** (rozhodnuto 4. 10. 2026). Obě aplikace čtou a zapisují do něj; žádné stěhování ani kopírování. Změny jeho sloupců jen přidávací a po dohodě obou stran.
3. **Předání příležitosti do projektu** přes pevně dohodnutý formát (viz „Dohodnutá rozhraní“): REVCRM pošle PRMIS jednu „předávací obálku“ (JSON) — číslo/identifikace příležitosti, partner, cena, rozpočet, odkazy na složky. PRMIS z ní založí projekt (přidělí číslo `{RR}{NNN}`) a vrátí REVCRM číslo projektu a odkaz.
4. **Rozpočet je společný formát.** Realizační rozpočet v PRMIS (`core/budget.ts`: skupiny, položky, sazby profesí; částky v měně položky) je zároveň formát kalkulace v REVCRM, takže se při výhře přenese beze ztráty. Kusovník (`PRM_Catalog`) je určený i pro kalkulace.
5. **Jedna paměť pro člověka i Claudea:** dohoda o rozhraní je v tomto souboru a jeho kopii v repozitáři REVCRM; kdo ji mění, upraví obě kopie a zapíše datum.

## Jak spolupracují dvě souběžné relace Claude

- Každá relace pracuje ve **své složce** (PRMIS / REVCRM) a vidí jen ji. Mezi sebou nesdílejí paměť.
- Společné věci se předávají **souborem**: tento dokument (smlouva o rozhraní), `NAVAZANI.md` v každém projektu a commity s českou zprávou. Igor je „dispečer“: když jedna strana změní rozhraní, řekne druhé relaci „přečti docs/REVCRM.md a navaž“.
- Aplikace Claude umí zprávy mezi místními relacemi posílat přímo; stabilním základem ale zůstává soubor s dohodou.
- Pravidla z PRMIS platí i pro REVCRM: komunikace česky, pracovat po krocích a každý hotový krok commitnout, **nikdy nemazat ani hromadně nepřepisovat ostrá data**, změny schématu jen přidávací, oprávnění řešit v SharePointu a v datové vrstvě, jen licence MIT/Apache/BSD, nikdy se nepřihlašovat k firemním systémům.

## Dohodnutá rozhraní (návrh v1 — upřesní se)

| Rozhraní | Obsah | Kdo vlastní |
|---|---|---|
| Partner | název, typ (zákazník/dodavatel/obojí), země, IČO, DIČ, plátce DPH, adresa, kontakt, splatnost, aktivní | společný seznam |
| Předávací obálka příležitosti → projekt | id příležitosti, název, partner (id), smluvní cena + měna, rozpočet (JSON `BudgetDoc` v1), termíny, odkazy na komerční a technickou složku, kontakt na obchodníka | REVCRM → PRMIS |
| Odpověď PRMIS | číslo projektu, odkaz na projekt, odkaz na technickou složku | PRMIS → REVCRM |
| Kusovník | položky: popis, dodavatel, kategorie, měna, MJ, nákup za MJ | společný (PRMIS `PRM_Catalog`; REVCRM čte) |

## Sdílené seznamy PRM_Partners a PRM_Catalog — dohoda v1 (5. 10. 2026)

Převzato z `C:\Projekty\revcrm\docs\REVCRM.md` (zapsala relace REVCRM, potvrdil Igor). Seznamy **patří PRMIS** — zakládá je jeho *Instalace a diagnostika*; REVCRM je nezakládá, jen je čte, přidává a upravuje. Obě aplikace běží na webu RES se stejnými daty, nic se nekopíruje ani nesynchronizuje (změna je ve druhé aplikaci vidět po obnovení stránky).

| Seznam | Obsah | Zapisuje | Mazání |
|---|---|---|---|
| `PRM_Partners` | zákazníci a dodavatelé (název, typ, země, IČO, DIČ, plátce DPH, adresa, kontakt, e-mail, telefon, splatnost, aktivní) | PRMIS i REVCRM | **jen PRMIS**; v REVCRM se partner jen deaktivuje (`IsActive`) |
| `PRM_Catalog` | kusovník (popis ve sloupci Název, dodavatel `SupplierName`, kategorie, měna `ItemCurrency` CZK/EUR/USD, MJ, nákup za MJ `UnitCost`, poznámka, z projektu `SourceProject`) | PRMIS i REVCRM | **jen PRMIS** (do koše SharePointu) |

Pravidla:

1. **Mazání jen v PRMIS** (rozhodl Igor 5. 10. 2026). REVCRM nic z těchto seznamů nemaže; tlačítko Smazat tam ukáže hlášku, že se to dělá v PRMIS.
2. **Změny sloupců jen přidávací a po dohodě obou stran.** Nový sloupec = zápis do obou kopií tohoto dokumentu a zvýšení `SCHEMA_VERSION` v PRMIS (ten seznamy zakládá). PRMIS tedy nemění ani nepřejmenovává sloupce těchto seznamů bez zápisu sem.
3. **Duplicity v kusovníku:** stejný popis a dodavatel (bez ohledu na velikost písmen, diakritiku a mezery) se při uložení **přepíše**, nevznikne duplikát. V PRMIS je to `sameCatalogItem` / `findInCatalog` v `core/catalog.ts` — stejné pravidlo má REVCRM.
4. **Partner v REVCRM:** případ si ukládá `PartnerId` i `PartnerName` (název v době uložení), takže zůstane čitelný, i kdyby partner zmizel. Seznamy REVCRM se na `PRM_Partners` neodkazují sloupcem Lookup. *Důsledek pro PRMIS:* smazání partnera v PRMIS nehlídá případy v REVCRM — před smazáním partnera, který byl jen v obchodním případu, je lepší ho deaktivovat.
5. **Oprávnění:** zápis do sdílených seznamů mají skupiny obou aplikací; právo **mazat** se v SharePointu doporučuje omezit na administrátory PRMIS (oprávnění seznamu), aby nikdo nesmazal záznam přímo mimo aplikace. *(Nastavuje Igor v SharePointu — je to jen doporučení, v kódu PRMIS se nemění.)*
6. **Souběh úprav:** obě aplikace zapisují jako přihlášený uživatel; při souběžné úpravě stejné položky vrátí SharePoint konflikt (412) a aplikace vyzve k opakování.

Role REVCRM, které smí zapisovat do sdílených seznamů: administrátor, obchodník, technik, vedení; čtenář jen čte.

**Poznámky z PRMIS pro REVCRM (5. 10. 2026):**
- **Země partnera** je dvoupísmenný ISO kód v textovém sloupci `Country` (prázdné = Česko). Od verze 0.28.2 PRMIS nabízí i **země mimo EU** (Čína, Tchaj-wan, USA, Kanada, Velká Británie, Švýcarsko, … přes 45 zemí; seznam `ALL_COUNTRIES` v `core/countries.ts`). REVCRM má v seznamu zemí nabízet stejné kódy a neznámý kód nesmí zahodit ani přepsat. DIČ / VAT ID se mimo EU nekontroluje (ukládá se tak, jak je).
- **Dodavatel v PRMIS se vybírá jen ze seznamu partnerů** (rozpočet, kusovník, objednávka; od 0.28.1) — dodavatel v kusovníku je tedy název existujícího partnera. REVCRM by měl do `SupplierName` ukládat také název partnera ze seznamu, ne volný text (PRMIS jinak zvýrazní dodavatele „není v seznamu partnerů“).

## Kontrola duplicit partnerů a mazání (6. 10. 2026, rozhodl Igor; převzato z REVCRM)

Platí pro obě aplikace, protože sdílejí `PRM_Partners`: (1) **stejné IČO ve stejné zemi nelze uložit** (včetně deaktivovaných; v UI i v repozitáři); (2) **stejné nebo podobné jméno jen upozorní** a uložení potvrdí uživatel; (3) **mazání je jen v PRMIS** (vedení a administrátor, do koše SharePointu), **použitého partnera nelze smazat** (projekty, objednávky, podklady, případy RES CRM `REV_Cases.PartnerId`) — nabídne se deaktivace. V PRMIS: `core/partnerDuplicates.ts`, `core/partnerDelete.ts` (verze 0.30.1). Referenční implementace podobnosti je v `revcrm/spfx/src/core/partnerDuplicates.ts`; odchylka PRMIS: zahraniční IČO se porovnává jako písmena a číslice. Podrobnosti v deníku (R-011, P-006).

## Rozhodnuto 4. 10. 2026

Odpovědi Igora na otevřené otázky jsou v [`REVCRM_ZAHAJENI.md`](REVCRM_ZAHAJENI.md): jeden společný tenant, REVCRM běží na webu RES (na matce jen odkaz a případně komerční data), partneři zůstávají v seznamu **PRM_Partners** (žádné stěhování), číslo případu **N26-0001**, kalkulace nabídek se odděluje do REVCRM; fáze nabídky se rozebírají ve vlastní relaci.

## Zbývá upřesnit (v relaci REVCRM)

- **Čeká na dohodu (společně):** předávací obálka vyhraného případu → projekt v PRMIS (Fáze D) a formát kalkulace `BudgetDoc` při technické fázi (Fáze C). Funkce „založit projekt z vyhraného případu“ v PRMIS se začne dělat až po zapsání obálky.

- Komerční část případu na webu matky: co přesně tam leží (dokumenty, data) a jak se k ní z RES přistupuje (odkaz, nebo čtení přes API).
- Fáze nabídky, stavy případu, role a oprávnění, složková struktura případu (komerční / technická).
- Přesná podoba „předávací obálky“ při výhře (viz tabulka rozhraní výše).

## Rozpočet a předání kalkulace — dohoda v2 (12. 10. 2026, rozhodl Igor; zapsala relace PRMIS)

Doplňuje „Dohodnutá rozhraní“ výše (řádek o rozpočtu a kalkulaci). **Kopii této části si má zapsat i relace REVCRM** (viz P-008 v deníku PRMIS).

- **Smluvní cena a nákup přicházejí do projektu z kalkulace; prodej a přirážku počítá jen RES CRM.** PRMIS prodej a přirážku u položek nezobrazuje ani nepoužívá (ve starých datech zůstávají uložené).
- **Rozpočet PRMIS = Nákup + Výnosy.** Formát `BudgetDoc` (`groups`, `items`, `rates`) se rozšířil o `revenues` (smluvní tržby: `id`, `description`, `currency`, `plan`, volitelně `forecast`, `invoiced`, `note`). **Součet `plan` je smluvní cena projektu**, vždy bez DPH; dodatek nebo vícepráce je další řádek výnosů.
- **Počty kusů, MJ a ceny za MJ patří jen do RES CRM.** V PRMIS se zadávají jen celkové částky položek (plán, prognóza, nakoupeno). Pole `quantity`, `unit`, `unitCost` zůstávají v datech (plán položky = `quantity × unitCost`) a PRMIS je nemaže; úprava celkové částky v PRMIS dopočte `unitCost`.
- **Marže** = (tržby − nákup) / tržby, v měně tržby − nákup, z aktuálního kurzu ČNB. První schválení rozpočtu zafixuje marži a prognózu přepíše plánem; plán je po schválení uzamčený. Semafor podle marže z prognóz: od 15 % zelená, od 10 % světle zelená, od 5 % žlutá, pod 5 % červená, záporná tmavě červená (hranice v Nastavení PRMIS).
- **Procentní rezerva** (`reservePercent`) je v PRMIS p % z **nákupu** ostatních položek; RES CRM ji počítá z prodeje. Při předání se proto procentní rezerva převede na **částku**.
- **Předání (Fáze D):** do rozpočtu projektu se předají `items` (plán nákupu: popis, dodavatel, kategorie, měna, `quantity`, `unit`, `unitCost`) a `revenues` (minimálně „Smluvní cena“ = prodej celkem z kalkulace). Bez `revenues` PRMIS vezme dosavadní cenu projektu (starý model).
