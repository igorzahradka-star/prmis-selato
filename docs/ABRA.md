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
