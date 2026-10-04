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

## Rozhodnuto 4. 10. 2026

Odpovědi Igora na otevřené otázky jsou v [`REVCRM_ZAHAJENI.md`](REVCRM_ZAHAJENI.md): jeden společný tenant, REVCRM běží na webu RES (na matce jen odkaz a případně komerční data), partneři zůstávají v seznamu **PRM_Partners** (žádné stěhování), číslo případu **N26-0001**, kalkulace nabídek se odděluje do REVCRM; fáze nabídky se rozebírají ve vlastní relaci.

## Zbývá upřesnit (v relaci REVCRM)

- Komerční část případu na webu matky: co přesně tam leží (dokumenty, data) a jak se k ní z RES přistupuje (odkaz, nebo čtení přes API).
- Fáze nabídky, stavy případu, role a oprávnění, složková struktura případu (komerční / technická).
- Přesná podoba „předávací obálky“ při výhře (viz tabulka rozhraní výše).
