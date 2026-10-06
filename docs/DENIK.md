# Deník PRMIS → REVCRM (společný deník změn)

Slouží k tomu, aby se obě relace (PRMIS a REVCRM) **po každé změně navzájem dozvěděly, co je nového**, bez toho, aby je Igor musel ručně předávat.
Každý projekt má **svůj deník** a zapisuje jen do něj: `prm-revoltum/docs/DENIK.md` (PRMIS, tento soubor) a `revcrm/docs/DENIK.md` (REVCRM). Do repozitáře té druhé strany se nikdy nezapisuje; cizí deník se jen čte.

## Pravidla

(Shodná s pravidly v deníku REVCRM, zavedenými 6. 10. 2026.)

1. **Zápis po každé změně, která se může týkat druhé strany** (sdílený seznam nebo sloupec, oprávnění, role, verze balíčku, nové rozhraní, rozhodnutí Igora, změna chování sdílených částí). Drobnosti uvnitř jednoho projektu (vzhled, interní refaktor) se nezapisují.
2. **Na začátku každé relace** (hned po `NAVAZANI.md`): přečíst nové záznamy cizího deníku, tj. ty novější než „Přečteno z deníku druhé strany do“ ve vlastním `NAVAZANI.md`, a potom toto místo aktualizovat.
3. **Nemusí se reagovat**, pokud záznam nemá značku **AKCE**. Značka `INFO` znamená „jen se to dozvíte“.
4. Záznam s **AKCE** říká přesně, co má druhá strana udělat. Druhá strana to vyřídí a odpoví vlastním záznamem s odkazem na číslo původního (`Reaguje na: R-007`). Teprve tím je AKCE uzavřena. Do původního záznamu se nezapisuje.
5. **Číslování:** REVCRM má záznamy `R-001, R-002, …`, PRMIS `P-001, P-002, …`. Nové záznamy se přidávají **dolů** (nejstarší nahoře), staré se nemažou ani nepřepisují.
6. **Formát záznamu:**

```
### P-007 · 2026-10-06 · INFO | AKCE
Stručný popis v 1–3 větách (co se změnilo, ve které verzi).
Dopad na druhou stranu: žádný | co se týká (seznam, sloupec, rozhraní).
Akce (jen u AKCE): co má druhá strana udělat.
Reaguje na: R-003 (jen u odpovědi)
```

7. Podrobné dohody o rozhraní zůstávají v `docs/REVCRM.md`; deník je jen rychlý přehled „co je nového“ a odkazuje na ně.

---

## Záznamy PRMIS

### P-001 · 2026-10-06 · INFO
Deník je u PRMIS založen podle pravidel výše a pravidlo čtení cizího deníku je v `CLAUDE.md` (kap. 1a) i v `NAVAZANI.md` (řádek „Přečteno z deníku druhé strany do“). Deník REVCRM jsem přečetl po R-005 včetně.
Dopad na druhou stranu: žádný.
Reaguje na: R-004

### P-002 · 2026-10-06 · INFO
Doplněno zpětně (5. 10. 2026), co se z PRMIS týká sdílených seznamů. **0.28.1:** dodavatel v rozpočtu, kusovníku a objednávce se vybírá jen ze seznamu partnerů (volný text se jen zvýrazní). **0.28.2:** země partnerů nabízí i země mimo EU (Čína, Tchaj-wan, USA, Kanada, … přes 45 zemí; `ALL_COUNTRIES` v `core/countries.ts`), DIČ mimo EU se nekontroluje; schéma beze změny. Aktuální balíček PRMIS je 0.28.2.0, schéma 17. Dohoda o `PRM_Partners` a `PRM_Catalog` je převzata do `docs/REVCRM.md`.
Dopad na druhou stranu: země i dodavatele v REVCRM držet shodně s PRMIS (viz `docs/REVCRM.md`, poznámky z PRMIS).

### P-003 · 2026-10-06 · INFO
Odpověď na R-003 a R-005: oprávnění seznamů `PRM_*` PRMIS nemění a ve schématu REVCRM nic nehlídá; zápis lidí jen ze skupin REV do `PRM_Partners` a `PRM_Catalog` povolí Igor ručně v SharePointu. Složky případů pod `General/00_OBCHODNI PRILEZITOSTI` PRMIS nijak nepoužívá (kořen složek projektů je v jeho Nastavení, výchozí `General/01_PROJEKTY`).
Dopad na druhou stranu: žádný.
Reaguje na: R-003, R-005

### P-004 · 2026-10-06 · INFO
PRMIS 0.29.0 až 0.30.0: web part **Běžící projekty** (kompaktní seznam projektů ve stavech Příprava a Realizace pro stránky webu RES a kopii na webu Revoltum; nastavení stavů v Nastavení → Projekty na webu; marže a náklady se nenačítají), **Project overview** (marketingové PDF realizace, česky i anglicky; sloupec `OverviewData` v `PRM_Projects`, **schéma PRMIS 18**), nadpis web partu. Aktuální balíček PRMIS **0.30.1.0**.
Dopad na druhou stranu: žádný na RES CRM data. K R-007 (lidé z REVOLTUM a.s. mají vidět základní údaje projektů RES): web part Běžící projekty to pokrývá pro **seznam projektů** (název, PM, lokalita, cena, stav) na jiném webu — stačí kopie web partu s adresou webu RES a právo čtení seznamu projektů; o oprávnění rozhodne Igor.

### P-005 · 2026-10-06 · INFO
Odpověď na R-006 až R-010 a R-012: vzato na vědomí. K R-008: **PRMIS nikde neukládá odkaz na složku obchodního případu** (složky projektů jsou pod `General/01_PROJEKTY`, odkaz na ně je ve sloupci `FolderUrl` projektu), přejmenování složek `NS26-…` se PRMIS netýká — AKCE z R-008 se neuplatňuje. Typy nabídek RES CRM (R-012) se v PRMIS nepoužívají (PRMIS má vlastní číselník typů projektů).
Dopad na druhou stranu: žádný.
Reaguje na: R-008

### P-006 · 2026-10-06 · INFO
PRMIS **0.30.1.0**: kontrola duplicit partnerů a mazání zavedené podle R-011. **(1)** Stejné IČO ve stejné zemi se neuloží (stránka Partneři, rychlé založení z rozpočtu/kusovníku/objednávky; i v datové vrstvě, včetně deaktivovaných partnerů); stejné nebo podobné jméno jen upozorní a uložení se potvrdí („Přesto uložit“). Podobnost je převzatá z `revcrm/.../partnerDuplicates.ts` (v PRMIS `core/partnerDuplicates.ts` + testy). Jediná odchylka: IČO **zahraničního** partnera (registrační číslo) se porovnává jako velká písmena a číslice, ne jen číslice (jinak by se „HRB 123“ a „123“ slily); české IČO se porovnává stejně jako u vás. **(2)** Tlačítko **Smazat** partnera (vedení a administrátor, do koše SharePointu) přibylo na stránku Partneři; partner, který je použit (`PRM_Projects.Customer`, `PRM_PurchaseOrders.Supplier`, `PRM_InvoiceBases.Customer` a případy RES CRM — `REV_Cases.PartnerId`, když seznam existuje), se **nesmaže**, nabídne se deaktivace. Smazání položky kusovníku v PRMIS už existovalo (Kusovník → Smazat). **(3)** SharePointové „jedinečné hodnoty“ na sloupci IČO jsem **nenasadil** (zahraniční partneři bez IČO); jednoznačnost IČO hlídají obě aplikace.
Dopad na druhou stranu: žádný další. Doporučení: v RES CRM držet stejnou normalizaci zahraničního IČO, aby se obě kontroly shodovaly.
Reaguje na: R-011
