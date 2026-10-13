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

---

## Prostředník — stav a návrh (14. 10. 2026, druhá session)

### Hotovo
- `integrations/abra-sync/` — čistá logika bez sítě a bez hesel: `src/mapping.js` (doklad z Flexi → řádek `PRM_AbraDocs`: dobropis záporný,
  EUR/USD v měně dokladu, jiná měna v Kč s poznámkou, doklad s jinou než „číselnou“ zakázkou se přeskočí), `src/plan.js` (co přidat / upravit /
  označit jako „zmizel z Abry“; nic se nemaže; pojistka, aby výpadek Abry neoznačil hromadně všechno), `src/config.js` (**všechny názvy
  evidencí a polí Flexi na jednom místě — NEPOTVRZENÉ**). 14 jednotkových testů na vymyšlených datech: `cd integrations/abra-sync && npm test`.
- Zatím **nic** z toho nekomunikuje s Abrou ani se SharePointem.

### Čeká na Igora / CFO
1. Odpověď, zda má firma **Power Automate Premium** (nebo plán „na tok“) — M365 admin centrum → Fakturace → Licence.
2. Výpisy z Flexi (CFO, přihlášený v prohlížeči): `faktura-prijata.json?limit=3&detail=full`, `faktura-vydana/properties.json`, `zakazka.json?limit=3`
   + název evidence **zálohových faktur** (přijatých i vydaných) a **účetního deníku** (`…/properties.json` k nim).
3. Účet ve Flexi **jen pro čtení** (CFO) — heslo se zadá jen do připojení/úschovny prostředníka.
Do té doby se nehádají názvy polí; v `config.js` jsou označené jako nepotvrzené.

### Otevřené otázky k datům (rozhodne se podle výpisů)
- Je zakázka jen v hlavičce dokladu, nebo i na řádcích (doklad rozdělený na víc projektů)? Při řádcích by jeden doklad dal víc řádků v `PRM_AbraDocs`
  — **to by znamenalo změnu smlouvy** (klíč `AbraId` by musel obsahovat i řádek); zatím se předpokládá zakázka v hlavičce.
- Mají dobropisy v Abře částku kladnou, nebo zápornou? (Mapování to zvládne obojí.)
- Filtr podle účtů 501/518/512/601: zatím se **nefiltruje**, účty se jen vypisují do pole `Accounts`. Pokud mají stahovat jen doklady s těmito účty, je třeba účetní deník.

### Který prostředník — doporučení
| | Power Automate (Igor preferuje) | Azure Function | Plánovač úloh na PC |
|---|---|---|---|
| Potřebuje | licenci **Power Automate Premium** (konektor HTTP je prémiový) jen pro účet, pod nímž flow běží | předplatné Azure (firma nemá; stačí průběžná platba, provoz pár korun měsíčně) | stálý zapnutý počítač |
| Kód z `integrations/abra-sync` | **nepoužije se přímo** — logika se přepíše do výrazů v kroku „Výběr“; kód a testy slouží jako přesná specifikace | použije se přímo (+ tenká vrstva pro Flexi a SharePoint) | použije se přímo |
| Heslo k Abře | v připojení HTTP / úschovně flow | Azure Key Vault | nejhůř — soubor v počítači |
| Slabina | hodně kroků, pomalejší při stovkách dokladů, limity akcí za den | nutné zřídit Azure a registraci aplikace | vypne se počítač = nestahuje se |
Doporučení: **licence Premium k dispozici → Power Automate**; jinak Azure Function (nejčistší řešení); plánovač až jako nouzovka.

### Postup A — Power Automate (krok za krokem, pro Igora / administrátora)
Dokončí se po výpisech od CFO (budou v něm přesné názvy polí); zatím jen kostra:
1. **Účet pro flow:** zvolte účet (ideálně servisní, ne osobní) s licencí Power Automate Premium; musí mít **zápis** do webu PRM (členové skupiny PM/Admin).
2. **Vytvořit flow:** make.powerautomate.com → *Moje toky* → *Nový tok* → *Naplánovaný cloudový tok* → název „PRM – Abra – denní stahování“, denně 5:00.
3. **Spuštění na žádost:** druhý tok „PRM – Abra – na žádost“ se spouštěčem *SharePoint – Při vytvoření položky* (web PRM, seznam `PRM_AbraSync`) s podmínkou `Kind = Žádost`. Oba toky volají stejný podtok (*Podřízený tok*).
4. **Připojení ke Flexi:** akce *HTTP* → metoda GET, URI `https://revoltum.flexibee.eu/flexi/revoltum_engineering___services_s_r_o_/faktura-prijata.json?limit=0&detail=custom:…` (přesný filtr a pole doplním po výpisech); ověřování *Základní*, uživatel = účet jen pro čtení. **Heslo se zadá jen do tohoto pole** (a nikam jinam); doporučeno uložit do Azure Key Vault/proměnné prostředí prostředí Power Platform — ne do textu toku.
5. Totéž pro `faktura-vydana`, zálohové evidence (po potvrzení názvů).
6. **Zápis:** pro každý doklad *Získat položky* (`PRM_AbraDocs`, filtr `AbraId eq '…'`) → když není, *Vytvořit položku*, když je a liší se, *Aktualizovat položku*; nic nemazat. Zmizelé označit podle pravidel v `plan.js`.
7. **Výsledek:** *Vytvořit položku* v `PRM_AbraSync` (`Kind = Stav`, `Status = Hotovo`/`Chyba`, `FinishedAt`, `Message`); čekající žádost přepnout na `Hotovo`. Chyby zachytit větví „Při selhání“ → `Status = Chyba`.
8. **Zkouška:** spustit ručně, zkontrolovat v seznamu `PRM_AbraDocs` pár dokladů proti Abře.

### Postup B — Azure Function (krok za krokem)
1. Správce M365/CFO založí **předplatné Azure** (portal.azure.com → *Předplatná* → *Přidat*, platební karta firmy; Function typu Consumption stojí řádově korunky).
2. *Vytvořit prostředek* → **Function App** (Node.js 22, Consumption), region West Europe.
3. **Registrace aplikace** v Entra ID (*Registrace aplikací* → *Nová*) s oprávněním **Sites.Selected** k webu PRM, souhlas správce, přidělit zápis jen na web PRM. (Bez hesla: spravovaná identita Function App.)
4. **Key Vault** s heslem k Abře; Function ho čte přes odkaz v nastavení aplikace — heslo nikdy v kódu.
5. Nasadit kód z `integrations/abra-sync` + tenká vrstva (doplním po výpisech); časovač denně 5:00 a časovač každých 5 minut, který hledá žádosti `Čeká`.

### Upřesnění z hlavní session (14. 10. 2026): jeden řádek = nejmenší přiřaditelná jednotka
V PRMIS je záložka projektu „Data z účetnictví“. Řádek v `PRM_AbraDocs` je **nejmenší účetní jednotka, kterou PM přiřazuje k položce rozpočtu**
(řádka faktury nebo zápis účetního deníku), ne nutně celá faktura. Schéma se nemění. Pro prostředníka z toho plyne:
- `AbraId` stálé a unikátní **na řádek** (evidence + id dokladu + id řádku/zápisu); `Title` = číslo dokladu; `Description` = popis řádku;
  `Accounts` = jeden účet řádku; `AmountNet` = částka řádku bez DPH (dobropis záporný); `DocType` beze změny.
- **Součet řádků dokladu = částka dokladu** (bez DPH). Prostředník to při stahování kontroluje; při rozdílu zapíše varování do `PRM_AbraSync.Message`
  (např. doklad má položky bez DPH nesouhrnné, zaokrouhlení, položka bez účtu).
- „Zmizel z Abry“ se označuje po řádcích; vypadne-li z dokladu jen jeden řádek, označí se jen ten.

**Rozhodnutí o zdroji řádků (čeká na výpisy od CFO):**
| Zdroj | Výhoda | Nevýhoda |
|---|---|---|
| Faktury + jejich položky (`faktura-prijata`/`-vydana` + `polozkyDokladu`) | vidíme popis položek i zálohy; nezávislé na zaúčtování | účet na položce nemusí být vyplněn; zakázka může být jen v hlavičce |
| Účetní deník (obratovky) | **účet a zakázka jsou vždy u zápisu**, částky sedí s účetnictvím, pokryje i zápisy bez faktury | nemá popis položek faktury; zálohy a DPH se zde chovají jinak; evidence a pole nepotvrzené |
Předběžný sklon: **účetní deník jako zdroj částek a účtů** (je to „pravda“ účetnictví a účty 501/518/512/601 jsou přímo tam), doklady jen pro doplnění
čísla dokladu, partnera a data splatnosti. Potvrdí se po výpisech `faktura-prijata…detail=full` (obsahuje položky?) a z evidence účetního deníku.
Mapování v `integrations/abra-sync/src/mapping.js` je zatím po dokladech; po rozhodnutí se přepíše na řádky a doplní test „součet řádků = doklad“.

### První zkouška sondy (13. 10. 2026): BLOKUJE LICENCE API
Sonda (`integrations/abra-sync/src/probe.js`, účet Igora) — přihlášení **prošlo**, ale každé čtení vrací **HTTP 402**: „Přístup uživatele k API lze povolit
pouze na licenci se zakoupeným přístupem k API (možno aktivovat ve webovém rozhraní v sekci Licence a přístup)“. Bez zakoupeného API přístupu
v licenci Flexi nejde automatizace žádnou variantou (Power Automate, Azure, aplikace). Další krok: CFO/správce Abry ověří v Abře → Licence a přístup,
zda je API přístup zakoupen/aktivován a zda je zapnut pro daného uživatele; teprve pak sondu zopakovat. Mezitím lze strukturu zjistit z ručního exportu (Excel/CSV) z Abry.

### Ruční export z Abry (13. 10. 2026) — co z něj víme
Igor vyexportoval 33 přijatých faktur (XML i Excel; soubory v `integrations/abra-sync/vystupy/`, mimo git). **Potvrzeno** (XML odpovídá názvům v `config.js`):
`kod` (číslo dokladu, např. PF0033/2026), `firma` (kód; `showAs` je „KÓD: Název“), `popis`, `datVyst`, `datSplat`, `mena`, `sumZklCelkem` (základ v Kč, **bez DPH**),
`sumZklCelkemMen` (základ v cizí měně), `zakazka` (`code:26001`; u některých dokladů prázdná), `typDokl` (typ dokladu) s `typDoklK` (`typDokladu.faktura`; dobropis bude zřejmě
jiná hodnota — **zatím neviděno**), `id` (`key:…` a u importovaných i `ext:…`; stálé ID pro `AbraId` použít `key:`, popř. číselné id z API).
Zakázky v datech: 26001, 26005, 10501, 26999 (Režie) — všechno pětimístná čísla, tedy kompatibilní s PRMIS. Doklady **bez zakázky** (např. PF0033, PF0022) se nestahují.
**Zjištěno / nevyřešeno:**
- XML export **neobsahuje položky faktur** a Excel nemá ani sloupec Zakázka — **pro řádky (položky/zápisy) je potřeba účetní deník** nebo položky dokladů přes API (402 — chybí licence API).
  U dokladu je jen `primUcet` = 321001 (závazky), nikoli nákladový účet 501/518/512; ten je až v účetním deníku/předpisu zaúčtování (`typUcOp` např. „NÁKUP SLUŽBY“).
- Zálohy: „poskytnutá záloha na nový vůz“ (PF0011, PF0014) jsou v evidenci běžných přijatých faktur; samostatná evidence zálohových dokladů zatím nenalezena.
- Potřebujeme ještě export **účetního deníku** (obratovky) za jeden projekt, ideálně s polem Zakázka, Účet, Částka, Popis, Číslo dokladu — a stejně vydané faktury.

### Doklady bez zakázky (Igor, 13. 10. 2026)
Doklady bez zakázky z větší části (~90 %) patří do projektu **Režie** (`{RR}999`, rok podle data dokladu, např. 26999). Zatím se nestahují; **časem je budeme potřebovat**.
Návrh na později (ještě nerozhodnuto): stahovat je s `ProjectNumber` = Režie roku a v `Description` je označit „bez zakázky v Abře“, ať je PM/účetní může
přeřadit (zbývajících ~10 % patří jinam). Pozor na doklady mezi firmami holdingu (např. PF0022) — vyžadují lidské rozhodnutí. Čeká na rozhodnutí Igora.

### Cizí měny — AmountNetCzk (schéma 24, od hlavní session 14. 10. 2026)
Účetnictví je jediný zdroj pravdy, proto se u dokladů v cizí měně přenáší i **částka v Kč, jak ji zaúčtovala Abra**. Pravidla (implementováno v `mapping.js`, testy):
1. `Currency` (CZK/EUR/USD) + `AmountNet` = částka v měně dokladu.
2. `AmountNetCzk` = u dokladů v EUR/USD hodnota z Abry `sumZklCelkem` (základ celkem v Kč), **ne vlastní přepočet**; u dokladů v CZK prázdné (`null`). Dobropis záporný v obou.
   **Nepotvrzeno:** v ručním exportu nebyl žádný doklad v cizí měně; že `sumZklCelkem` nese Kč a `sumZklCelkemMen` měnu dokladu, plyne z Excelu (sloupce „Základ celkem [měna]“ / „[Kč]“) a dokumentace. Ověřit na prvním EUR dokladu.
3. Řádky = části dokladu: `allocateProportionally()` rozdělí `AmountNetCzk` stejným poměrem jako `AmountNet`, na haléře; zbytek po zaokrouhlení dostane největší řádek, součet řádků = zaúčtovaná částka dokladu v Kč.
4. Jiná měna než CZK/EUR/USD: `Currency = CZK`, `AmountNet` = zaúčtovaná částka v Kč, `AmountNetCzk` prázdné.
Změna `AmountNetCzk` u již stažené položky se bere jako změna řádku (aktualizuje se).

### Rozhodnutí o zdroji řádků: ÚČETNÍ DENÍK (13. 10. 2026, podle reportů Účetní deník a Účetní analýza zakázky)
Igor vyexportoval (PDF, `integrations/abra-sync/vystupy/`) **Účetní deník** a **Účetní analýzu zakázky**. Z nich plyne:
- **Zakázka je na úrovni zápisu (řádku), ne jen v hlavičce dokladu.** Příklad: doklad PF0033/2026 má prázdnou zakázku v hlavičce, ale v deníku je rozpadnutý po účtech/řádcích na
  několik zakázek (např. 8 600 → 26001, 12 900 → 26002, 17 200 → 26005, zbytek Režie). Doklad PF0022 (od firmy holdingu) se rozpadá obdobně. **Proto jsou řádky = zápisy účetního deníku,
  ne faktury**; hlavička faktury se k tomu hodí jen pro doplnění (partner, splatnost, měna). Potvrzuje to i „jeden řádek = nejmenší přiřaditelná jednotka“.
- Záznam deníku nese: modul (FAP = faktury přijaté, ZAV = závazky, BAN = banka…), interní číslo dokladu (→ `Title`), variabilní symbol, **Částka [Kč]**, **Účet MD**, **Účet DAL**,
  datum zaúčtování, středisko, činnost, **zakázka**, popis, firmu. Částky jsou **bez DPH** (DPH jde samostatným zápisem na 343…, ten se přeskakuje); součet řádků PF0033 = základ faktury.
- Do PRMIS patří jen zápisy dotýkající se **nákladových nebo výnosových účtů**; zbytek (banka 221, závazky 321, DPH 343, kapitál 411…) se přeskočí. Logika je v `src/journal.js`
  (`classifyEntry`, testy): náklad na MD = kladný, na DAL (storno) = záporný; výnos na DAL = kladný, na MD (dobropis/storno) = záporný.
- **K potvrzení Igorem:**
  1. **Výnosové účty jsou 602xxx a 604xxx** (ne 601, jak bylo v zadání) — bereme celou skupinu 60. Kurzový zisk/ztráta (663/563) a bankovní poplatky (568) se zatím **nepřenášejí**.
  2. Nákladové účty zatím jen 501, 512, 518 (podle zadání). Jiné (např. 502 energie, 511 opravy, 521 mzdy, 568 bankovní poplatky) by se **nepřenesly**, i když mají zakázku — prověřit s CFO, zda nejsou potřeba.
  3. **Doklady modulu ZAV (závazky: cestovné, drobné nákupy) nejsou faktury**; zatím se berou jako `DocType = prijata`. Pokud mají být zvlášť, je potřeba nová hodnota Druh (změna schématu).
  4. Zaokrouhlení (např. „Zaokrouhleno 0,14“ nebo −7,33 na výnosu 602001) jsou drobné zápisy v deníku — přenášejí se, aby součet sedl s účetnictvím.
- `AbraId` řádku: stálé ID zápisu deníku z API (zatím neznáme název evidence ani pole — **čeká na licenci API**; ručně lze získat jen PDF, který pro automatizaci nestačí).
  Do té doby případně lze brát z exportu Excel/CSV (v reportech Účetní deník / analýza zakázky zkusit Tisk → formát XLS/CSV).
- Přenos cizích měn: deník nese jen Kč → `AmountNetCzk` z deníku; částka v měně dokladu (`AmountNet`) z hlavičky dokladu a rozdělí se poměrně (viz „Cizí měny“).

### Účetní deník z XML (13. 10. 2026) — potvrzeno a ověřeno
Ruční export XML `ucetni-denik` (267 zápisů, jen u nás v `vystupy/`, mimo git). **Potvrzené názvy:** evidence **`ucetni-denik`**; stálé ID zápisu **`idUcetniDenik`** (unikátní → `AbraId` = `ucetni-denik:<id>`);
`doklad` (číslo dokladu), `modul` (FAP, FAV, BAN, ZAV, INT, MAJ, PHL…), `datUcto`/`datVyst`/`datSplat`, `mdUcet`, `dalUcet`, **`sumTuz` (částka v Kč)**, **`sumMen` (částka v měně dokladu, u CZK 0)**, `mena`, `zakazka`, `popis`, `nazFirmy`, `firma`.
- **Cizí měna je potvrzená:** např. faktura vydaná v EUR má `sumMen` 79 896,30 EUR a `sumTuz` 1 952 665,57 Kč (kurz dne zaúčtování) → `AmountNet` = `sumMen`, `AmountNetCzk` = `sumTuz`. Hotovo v `src/journalMapping.js`.
- `DocType` se určuje podle toho, co zápis je (náklad → `prijata`, výnos → `vydana`), ne podle modulu: např. vydaná faktura, která připíše na nákladový účet 518, je záporný náklad. Moduly ZAV/INT jsou tak `prijata`.
- **Kontrola proti účetnictví:** mapování (`mapJournalBatch`) na tomto exportu dává součty po projektech **shodné s reportem Účetní analýza zakázky** (10501: náklad 61 047,11 / výnos 89 879,14; 26001: 125 643,00 / 2 149 758,24; 26002: 38 700,00 / 66 522,00; 26005: 171 090,08 / 1 843 300,00; 26006: výnos 142 311,00).
  Z 267 zápisů se přenáší 78 řádků; zbytek je banka, DPH, závazky a nenákladové účty.
- **Bez zakázky** jsou u nákladových/výnosových účtů jen 2 zápisy (část PF0033 „práce na ostatních projektech“ 4 300 Kč a drobný interní zbytek 0,03 Kč) → souvisí s rozhodnutím o Režii (viz výše).
- **Stále neznámé:** zálohy (v deníku se žádné zálohové zápisy nevyskytly — zachytí se, až nějaké budou; zatím žádný `DocType` zaloha-*), tvar JSON z API (kvůli licenci 402), zda API vrací `mdUcet`/`dalUcet` jako „code:…“.
