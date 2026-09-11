# PRM Revoltum – zadání pro Claude Code

**Informační systém pro řízení zakázek Revoltum Engineering & Services (RES)**
Verze zadání: 1.0 · Datum: 11. 9. 2026 · Vlastník: Igor Zahrádka

---

## 0. Jak s tímto dokumentem pracovat (pro Igora)

1. Na počítači založ prázdnou složku, např. `C:\Projekty\prm-revoltum`.
2. Do ní nakopíruj:
   - tento soubor jako `docs/ZADANI.md`,
   - loga RES (ideálně SVG + PNG, barevné i bílé/negativní) do `brand/loga/`,
   - grafický manuál (PDF) do `brand/`,
   - pokud existuje: šablonu CF reportu holdingu (Excel) do `docs/sablony/`, stávající seznam zakázek (Excel) do `docs/import/`, vzorovou objednávku a podklad pro fakturaci (PDF/Word) do `docs/sablony/`.
3. Ve složce spusť Claude Code a napiš první zprávu:

   > Přečti si `docs/ZADANI.md` a všechny soubory ve složkách `docs/` a `brand/`. Pak proveď **Fázi 0** podle zadání. Na konci každé fáze se zastav, shrň česky, co jsi udělal, co mám otestovat a jaké rozhodnutí potřebuješ ode mě.

4. Po otestování každé fáze napiš: „Pokračuj Fází 1“ (2, 3 …). Jednu fázi = jedna nebo více relací. Když se něco nelíbí, popiš to běžnou řečí.

Vše pod čarou je určeno pro Claude Code.

---

## 1. Role a pravidla spolupráce (pro Claude Code)

Jsi vývojář a architekt aplikace PRM Revoltum. Zadavatel (Igor) **není programátor** – je majitel/manažer firmy a bude aplikaci s tebou dlouhodobě rozvíjet. Z toho plynou pravidla:

- Komunikuj **česky**, srozumitelně, bez zbytečného žargonu. Když je nutný technický krok (instalace, nasazení, oprávnění v M365), napiš návod krok za krokem včetně toho, kam kliknout.
- Pracuj **po fázích** (kap. 12). Na konci každé fáze se zastav a vypiš: co je hotové, jak to otestovat, otevřené otázky.
- Před prvním kódem vytvoř v kořeni repozitáře **`CLAUDE.md`** s trvalými pravidly projektu (architektura, konvence, jak spustit, jak nasadit, stav fází) a průběžně ho aktualizuj – je to paměť projektu pro další relace.
- Používej **git**; po každém dokončeném kroku commit s českou zprávou. Nikdy nepoužívej `git push --force` ani nemaž historii.
- **Nikdy nemaž ani hromadně nepřepisuj data** v produkčních SharePoint seznamech. Změny schématu dělej jen přidáváním (nové sloupce/seznamy) přes verzovaný instalační průvodce (kap. 4.4).
- Nejasnosti v zadání neřeš odhadem u věcí, které mají dopad na data, peníze nebo oprávnění – zeptej se. U kosmetických věcí rozhodni rozumně a uveď to v shrnutí.
- Čistou obchodní logiku (číslování, výpočty rozpočtu, cashflow, kritická cesta) piš jako samostatné funkce bez závislosti na SharePointu a **pokryj je unit testy**.
- Používej jen knihovny s licencí MIT/Apache/BSD. Nic pod GPL ani komerční licencí bez výslovného souhlasu.
- Ověřuj aktuální stav nástrojů v oficiální dokumentaci Microsoftu (verze SPFx, podporovaná verze Node.js, způsob ladění) – neřiď se zastaralými návody.

---

## 2. Cíl aplikace

Jedna webová aplikace na SharePointu Revoltum Engineering & Services, kam chodí všichni projektoví manažeři (PM) a jejich asistenti a kde udělají veškerou práci se zakázkou:

- evidence zakázek, přidělování čísel a názvů, seznam/dashboard zakázek,
- automatické založení struktury složek projektu na firemním SharePointu a rychlý přístup k nim,
- nákupní objednávky se schvalovacím workflow,
- podklady pro fakturaci, předávací protokoly a další číslované dokumenty,
- realizační rozpočet (RR) a cashflow plán projektu,
- harmonogram projektu (Gantt, závislosti, kritická cesta),
- pro vedení: **celofiremní cashflow** (projekty + režie + důvěrné firemní položky) a **Excel report pro finančního ředitele holdingu (FO)**, benchmark projektů.

Aplikace se bude dlouhodobě rozšiřovat – architektura musí být modulární a čitelná.

---

## 3. Výchozí podmínky (potvrzené zadavatelem)

| Oblast | Stav |
|---|---|
| Přihlášení | Microsoft 365 účty firmy (Entra ID) – jednotné přihlášení, žádná vlastní hesla |
| Soubory projektů | SharePoint / Teams knihovna dokumentů (synchronizovaná přes OneDrive) |
| Hosting | **Pouze Microsoft 365, bez Azure předplatného** a bez vlastního serveru |
| Vývoj | Zadavatel s Claude Code, bez interního vývojáře |

---

## 4. Architektura (závazná)

### 4.1 Technologie

- **SharePoint Framework (SPFx)** – aktuální GA verze, React + TypeScript, **Fluent UI** (vzhled M365, upravený do barev RES).
- Aplikace = jeden full-width web part na stránce typu *single part app page* na webu **PRM** (např. `https://<tenant>.sharepoint.com/sites/RES-PRM`). Interní navigace aplikace přes hash router (`#/zakazky`, `#/zakazky/26-014`, `#/objednavky` …).
- Stejný web part zpřístupnit i jako **záložku v Microsoft Teams** (SPFx to podporuje) – PM mohou pracovat z Teams.
- Přístup k datům: **PnPjs** (SharePoint REST) v kontextu přihlášeného uživatele. Microsoft Graph použij jen tam, kde to REST neumí, a vždy předem popiš, jaké oprávnění musí admin schválit.
- Data: **SharePoint seznamy** (kap. 6). Snapshoty a vygenerované PDF/Excel: **knihovny dokumentů**.
- Excel výstupy: **ExcelJS** (formátování, vzorce, více listů). PDF výstupy: **pdfmake** (font s plnou podporou češtiny, logo vložené).
- Gantt: vlastní lehká komponenta (SVG/React) **nebo** MIT knihovna (např. frappe-gantt) – výpočet kritické cesty (CPM) **vždy vlastní**, testovaný kód nezávislý na vykreslování.
- Notifikace: e-mail přes `SP.Utilities.Utility.SendEmail` (bez Graph oprávnění) + v aplikaci přehled „Čeká na mě“. Připomínky a časované úlohy (aplikace nemá server) připrav jako návod na **Power Automate** flow se standardními konektory (SharePoint, Outlook) – ty jsou součástí M365 licence.

### 4.2 Struktura kódu

```
src/
  core/        čistá doménová logika (číslování, rozpočet, CF, CPM, semafor) + unit testy
  data/        repozitáře – rozhraní (IProjectRepository …) a implementace pro SharePoint
  data/mock/   mock implementace s ukázkovými daty pro vývoj UI
  features/    moduly: projects, purchasing, invoicing, documents, budget, cashflow, schedule, finance, settings, admin
  ui/          sdílené komponenty, theme RES, layout, formátování čísel/dat
  webparts/prm/  vstupní web part
```

Veškerý přístup k datům jde přes rozhraní repozitářů – aby bylo možné později přejít na Azure SQL / Dataverse bez přepisu UI a logiky.

### 4.3 Bezpečnost – klíčový princip

SPFx běží v prohlížeči s oprávněními přihlášeného uživatele. **Skutečnou ochranu dat zajišťují oprávnění SharePointu, ne skrytí v UI.**

- Web **PRM** (projektová data): čtení pro všechny interní uživatele PRM, zápis pro PM/asistenty/admin.
- Samostatný web **PRM-Finance** (např. `/sites/RES-PRM-Finance`) s **vlastními (nezděděnými) oprávněními** – jen skupina *PRM Finance – důvěrné*. Tam leží důvěrné firemní příjmy/výdaje, zůstatky účtů, odevzdané verze CF.
- Aplikace zjistí, zda uživatel na PRM-Finance vidí; pokud ne, finanční moduly vůbec nezobrazí (a i kdyby je někdo vyvolal, SharePoint data nevydá).
- Agregovaná čísla z důvěrných dat **nikdy neukládej** do seznamů na webu PRM.
- Na všech seznamech zapnout **historii verzí** (audit: kdo, kdy, co změnil) + vlastní `PRM_AuditLog` pro schvalování a změny stavů.
- UI kontroluje role (kdo smí schválit, editovat cizí zakázku). Tam, kde je to důležité (schválení objednávky), ověřuj pravidla znovu těsně před zápisem a zapisuj do auditu.

### 4.4 Instalační a diagnostický průvodce (místo PowerShellu)

Zadavatel není vývojář, proto **aplikace sama založí svou datovou strukturu**:

- Stránka *Správa → Instalace a diagnostika* (jen role Administrátor): zkontroluje existenci webů, seznamů, sloupců, indexů a skupin a chybějící části založí jedním tlačítkem.
- Schéma je popsané v kódu (`src/data/schema.ts`) s **číslem verze schématu**; průvodce je idempotentní a jen přidává, nikdy nemaže.
- Na sloupcích používaných ve filtrech (Projekt, Stav, Rok, PM, Datum) založ **indexy** (limit zobrazení seznamů 5 000 položek).
- Pokud něco vyžaduje ruční krok admina M365 (App Catalog, vytvoření webu, schválení API oprávnění), průvodce to zobrazí jako srozumitelný checklist.

---

## 5. Role a oprávnění

Role = SharePoint skupiny (název konfigurovatelný v Nastavení):

| Role | Co smí |
|---|---|
| **Administrátor PRM** | vše, Nastavení, Instalace, správa rolí, číselné řady, šablony složek |
| **Vedení** | vidí všechny zakázky, schvaluje objednávky nad limit, schvaluje realizační rozpočty, benchmark |
| **Finance – důvěrné** | firemní CF, důvěrné položky, Excel report pro FO, odevzdané verze CF |
| **Projektový manažer** | zakládá zakázky, spravuje své zakázky (RR, CF, harmonogram), vystavuje a schvaluje objednávky ve svém limitu, vystavuje podklady pro fakturaci |
| **Asistent PM** | pracuje na zakázkách přiřazených PM/zakázce; objednávky a podklady vytváří, ale neschvaluje |
| **Čtenář** | jen čtení zakázek (volitelné) |

Výchozí pravidla (konfigurovatelná): všichni PM vidí seznam všech zakázek, editovat mohou jen zakázky, kde jsou PM nebo asistent. Uživatel může mít více rolí.

---

## 6. Datový model (SharePoint seznamy)

Interní názvy sloupců anglicky bez diakritiky, zobrazované názvy česky. Částky ukládej **bez DPH**, sazba DPH zvlášť; měna výchozí CZK (sloupec Currency pro EUR s kurzem). Níže je minimum – rozšiř, kde to dává smysl, a rozšíření zdůvodni.

### Web PRM

**PRM_Settings** – klíč/hodnota (JSON): cesta ke knihovně projektů, šablony složek, limity schvalování, prahy semaforu, názvy skupin, vzor názvu zakázky, splatnosti apod.

**PRM_DocTypes** – číselné řady dokumentů (kap. 7):
Code (PRJ, OBJ, FP, PP, …), Name, Pattern, Padding, ResetPeriod (Ročně / Nikdy), Scope (Globální / Zakázka), StartValue, Active.

**PRM_Counters** – čítače: DocTypeCode, Year, ScopeKey, LastValue.

**PRM_Partners** – zákazníci a dodavatelé: Name, Type (Zákazník/Dodavatel/Obojí), ICO, DIC, Address, ContactName, Email, Phone, PaymentTermDays. Volitelně načtení údajů z **ARES podle IČO** (ověř, zda veřejné API ARES dovolí volání z prohlížeče – pokud ne, funkci vynech a napiš proč).

**PRM_Projects** – zakázky:
ProjectNumber, Title (generovaný název), ShortName, Customer (lookup), ProjectManager (osoba), Assistants (osoby), Status (Nabídka / Příprava / Realizace / Pozastaveno / Dokončeno / Uzavřeno / Storno), ProjectType (FVE, BESS, MVE, Vítr, Kogenerace, Připojení DS, Servis, Režie, Jiné – konfigurovatelné), Location, InstalledPowerKWp, StorageCapacityKWh, ContractNumber, ContractPriceNet, Currency, StartDate, EndDatePlanned, EndDateActual, FolderUrl, IsOverhead, BudgetStatus (Zelená/Žlutá/Červená – cache výpočtu), BudgetBaselineTotal, CostForecastTotal, NextDeadline (cache), Description.
Jedna zakázka je **Režie** (IsOverhead = true) – vlastní číslo, sbírá režijní objednávky a náklady.

**PRM_Tasks** – položky harmonogramu i smluvní termíny plnění:
Project, WBS, Title, TaskType (Činnost / Dodávka materiálu / Služba / Milník), Start, Finish, DurationDays, Predecessors (JSON: `[{taskId, type: FS|SS|FF|SF, lagDays}]`), PercentComplete, IsContractualDeadline, Responsible, BaselineStart, BaselineFinish, IsCritical (cache CPM), WatchAsCritical (ruční příznak), SortOrder.

**PRM_BudgetItems** – položky realizačního rozpočtu:
Project, WBS/Code, Category (Materiál / Subdodávky a služby / Vlastní práce / Doprava / Ostatní / Rezerva – konfigurovatelné), Description, Supplier, Quantity, Unit, UnitCost, PlannedCost, BaselineCost (ze schválené verze), ForecastCost (aktuální prognóza PM), LinkedTask (lookup do PRM_Tasks), AdvancePercent, PaymentTermDays, PaymentDateOverride, Note.

**PRM_BudgetVersions** – verze RR: Project, VersionNo, Status (Koncept / Ke schválení / Schváleno), ApprovedBy, ApprovedDate, Comment, SnapshotFile (JSON v knihovně PRM_Snapshots). Schválená verze = baseline pro semafor a benchmark.

**PRM_IncomePlan** – fakturační milníky (plán příjmů): Project, Description, PlannedDate, AmountNet, VATRate, DueDays, LinkedTask, Status (Plán / Podklad vystaven / Vyfakturováno / Uhrazeno), InvoiceBasis (lookup).

**PRM_PurchaseOrders** – objednávky: Number, Project, Supplier, BudgetItem (volitelně), Subject, Lines (JSON nebo podřízený seznam PRM_POLines), AmountNet, VATRate, Currency, DeliveryDate, PaymentTermDays, Status, CreatedBy/RequestedBy, CurrentApprover, PdfUrl, SentDate, Note.

**PRM_InvoiceBases** – podklady pro fakturaci: Number, Project, Customer, IncomeMilestone, Lines, AmountNet, VATRate, IssueDate, TaxableDate (DUZP), DueDate, Status (Koncept / Ke kontrole / Předáno účtárně / Vyfakturováno / Uhrazeno / Storno), AccountingInvoiceNo, PaidDate, PdfUrl.

**PRM_Documents** – ostatní číslované dokumenty (předávací protokoly a další typy z PRM_DocTypes): Number, DocType, Project, Title, Date, Parties, Status, FileUrl.

**PRM_ActualCashflows** – skutečné platby projektu (import z účetnictví nebo ruční zadání): Project, Date, Direction (Příjem/Výdaj), AmountNet, Source (PO/FP/import), Reference.

**PRM_Approvals** – historie schvalování: EntityType, EntityId, Step, Approver, Decision, Comment, DecidedAt.

**PRM_AuditLog** – kdo, kdy, entita, akce, stará/nová hodnota (stručně).

**Knihovny:** PRM_Snapshots (JSON verze RR, CF), PRM_Outputs (vygenerovaná PDF/Excel, pokud se neukládají do složky zakázky).

### Web PRM-Finance (důvěrné)

**FIN_CompanyCashItems** – firemní příjmy a výdaje mimo projekty: Category (Mzdy, Odvody, Daně, Úvěry a splátky, Nájem, IT a licence, Pojištění, Ostatní režie, Příjmy mimo projekty, Dotace … – konfigurovatelné), Month, Direction, AmountNet, VAT, PlanOrActual, Recurring (měsíčně/čtvrtletně/ročně + od–do), Note.

**FIN_BankBalances** – počáteční zůstatky / skutečné zůstatky k měsíci.

**FIN_CFSubmissions** (knihovna) – odevzdané verze celofiremního CF (Excel + JSON snapshot, datum, kdo odevzdal) pro porovnání plán vs. skutečnost v čase.

**FIN_Settings** – nastavení finančního modulu (struktura reportu pro FO, mapování kategorií).

---

## 7. Číslování dokumentů (konfigurovatelné)

Každý typ dokumentu má v Nastavení svou číselnou řadu:

- **Vzor** s tokeny: `{PREFIX}`, `{YYYY}`, `{YY}`, `{N}` (s doplněním nul dle Padding), `{PRJ}` (číslo zakázky). Příklady: `{YY}-{N}` → `26-014` (zakázky), `OBJ-{YYYY}-{N}` → `OBJ-2026-0153`, `FP{YY}{N}` → `FP260042`, `PP-{PRJ}-{N}` → `PP-26-014-02`.
- **Reset**: ročně (podle roku data dokumentu) nebo nikdy.
- **Rozsah**: globální (napříč zakázkami) nebo v rámci zakázky.
- Výchozí nastavení podle zadání: **objednávky** – společná řada napříč zakázkami (zobrazují se u své zakázky); **podklady pro fakturaci** – společná řada, **reset každý rok**; předávací protokoly – dle nastavení.
- **Bez duplicit při souběhu**: SharePoint nemá transakce → čítač v PRM_Counters zvyšuj optimistickým zámkem (ETag / `If-Match`), při konfliktu (HTTP 412) načti znovu a opakuj. Pokryj testem i simulaci souběhu.
- Číslo se přiděluje při založení dokumentu. Dokumenty **se nemažou**, jen stornují (řada zůstane bez děr – důležité pro audit).
- Změna vzoru se týká jen nových dokumentů. Počáteční hodnotu čítače jde nastavit (navázání na dosavadní číslování).

**Název zakázky** se generuje podle konfigurovatelného vzoru, např. `{ČÍSLO} {Zákazník} – {Lokalita} – {Typ}`; PM ho může před uložením upravit. Název složky se odvodí z názvu a očistí od znaků, které SharePoint nepovoluje (`" * : < > ? / \ |`, počáteční/koncové mezery a tečky), a omezí délku.

---

## 8. Funkční požadavky

### 8.1 Přihlášení a úvodní dashboard

- Uživatel je přihlášen automaticky účtem M365 (kontext SharePointu), žádné další přihlašování.
- Úvodní obrazovka = **dashboard zakázek**:
  - dlaždice KPI: počet aktivních zakázek, součet cen aktivních zakázek, počet zakázek v červené, objednávky čekající na mé schválení, nejbližší smluvní termíny (14 dní),
  - **tabulka zakázek** se sloupci: **Číslo, Název, Projektový manažer, Rozpočet (semafor zelená/žlutá/červená), Celková cena, Nejbližší termín plnění, Zahájení, Ukončení**, Stav,
  - filtry (moje zakázky, stav, typ, PM, rok), fulltext, řazení, uložení oblíbeného filtru (localStorage), export tabulky do Excelu,
  - tlačítko **Nová zakázka**.
- Semafor ukazuje po najetí myší vysvětlení (rozpočet vs. prognóza, odchylka v %).

### 8.2 Založení zakázky

Průvodce: zákazník (výběr/nový), typ, lokalita, PM, asistenti, cena, termíny → náhled čísla a názvu → uložit. Po uložení:
1. přidělí číslo (kap. 7),
2. **založí strukturu složek** podle šablony (kap. 8.3),
3. uloží odkaz na složku, zapíše audit, otevře detail zakázky.
Pokud založení složek selže, zakázka zůstane uložená s upozorněním a tlačítkem „Zkusit znovu založit složky“.

### 8.3 Struktura složek projektu

- V Nastavení: **cílový web + knihovna + kořenová složka** (např. Teams web „RES – Zakázky“, knihovna Dokumenty, složka `Zakázky/2026`) – volitelně podsložka podle roku.
- **Šablona složek** editovatelná ve stromu v Nastavení, možnost více šablon podle typu zakázky. Výchozí návrh (upřesní zadavatel):
  `01_Smlouvy a objednávky zákazníka`, `02_Projektová dokumentace`, `03_Nákup` (`Objednávky`, `Nabídky dodavatelů`), `04_Fakturace`, `05_Realizace` (`Fotodokumentace`, `Stavební deník`), `06_Předání a revize`, `07_Korespondence`, `08_Rozpočet a harmonogram`.
- Vygenerovaná PDF objednávek, podkladů a protokolů se **automaticky ukládají do příslušné složky zakázky**.
- **Otevření složky:** ikona u zakázky otevře složku v novém okně SharePointu/Teams. V detailu zakázky zobraz i posledních ~10 změněných souborů ve složce.
  *Omezení, které vysvětli uživatelům v nápovědě:* webový prohlížeč z bezpečnostních důvodů nemůže přímo otevřít Průzkumník Windows. Doporučený postup: knihovnu zakázek mít jednou provždy **synchronizovanou přes OneDrive** („Synchronizovat“ / „Přidat zástupce do Mé soubory“) – pak jsou stejné složky v Průzkumníku pod stejným názvem. Ve web partu přidej tlačítko „Kopírovat název složky“ pro rychlé dohledání v Průzkumníku. Pokud najdeš spolehlivější podporovaný způsob, navrhni ho.

### 8.4 Detail zakázky

Záložky:
- **Přehled** – všechny údaje zakázky, PM a tým, zákazník, finanční souhrn (cena, baseline, prognóza, odchylka, marže plán/prognóza, vyfakturováno, uhrazeno, objednáno), nejbližší termíny, odkaz na složku, historie změn.
- **Realizační rozpočet** (8.7), **Cashflow** (8.8), **Harmonogram** (8.9),
- **Objednávky** (této zakázky), **Fakturace** (podklady + plán fakturačních milníků), **Dokumenty** (protokoly a další číslované dokumenty + soubory ve složce).

### 8.5 Objednávky na nákup + schvalování

- Vystavit může PM i asistent; objednávka se váže na zakázku (vč. Režie) a volitelně na položku rozpočtu.
- Stavy: **Koncept → Ke schválení → Schváleno / Vráceno k úpravě / Zamítnuto → Odesláno dodavateli → Dodáno → Uzavřeno**, kdykoli **Storno** (s důvodem).
- **Schvalovací pravidla v Nastavení** (limity bez DPH), výchozí návrh: do X Kč schvaluje PM zakázky (pokud objednávku vystavil asistent); objednávka vystavená samotným PM do X Kč se považuje za schválenou (přepínač v Nastavení – lze vypnout, pak ji schvaluje Vedení); nad X Kč navíc Vedení; nad Y Kč jednatel. Nikdo nesmí ručně schválit objednávku, kterou sám vystavil. U Režie schvaluje Vedení.
- Schvalovatel dostane e-mail s odkazem; v aplikaci stránka **„Čeká na mě“**. Schválení/zamítnutí s komentářem → PRM_Approvals + audit.
- Upozornění při vystavení: objednávka překračuje zbývající rozpočet položky/zakázky (zobrazit, nezakazovat; překročení vyžaduje komentář).
- PDF objednávky v grafice RES (logo, hlavička, dodavatel, položky, termín, splatnost, fakturační údaje, číslo zakázky, podpis/schválil) → uložení do složky zakázky `03_Nákup/Objednávky`.
- Celkový seznam všech objednávek (napříč zakázkami) s filtry + export Excel.

### 8.6 Podklady pro fakturaci a další dokumenty

- Podklad vždy ke konkrétní zakázce (volitelně k fakturačnímu milníku), číslování **napříč zakázkami s ročním resetem**.
- Stavy: Koncept → Ke kontrole → Předáno účtárně → Vyfakturováno (doplní se číslo faktury z účetnictví) → Uhrazeno (datum úhrady) / Storno.
- PDF podkladu v grafice RES → složka `04_Fakturace`; volitelně e-mail účtárně.
- Předávací protokoly a další typy dokumentů podle PRM_DocTypes: číslo, šablona PDF, uložení do složky `06_Předání a revize`.

### 8.7 Realizační rozpočet (RR) – přímo v aplikaci

- Editovatelná tabulka ve stylu Excelu (vkládání řádků, kopírování, hromadné vložení ze schránky z Excelu, součty po kategoriích a WBS).
- **Import z Excelu** (šablona ke stažení) – pro přechod z dosavadních rozpočtů.
- Verze: PM připraví → odešle ke schválení → Vedení schválí → vznikne **baseline** (snapshot). Další úpravy = prognóza; nová verze baseline jen novým schválením.
- U každé položky: plán, baseline, prognóza, **objednáno** (součet schválených objednávek), **uhrazeno** (skutečnost), zbývá.
- **Semafor rozpočtu** (prahy v Nastavení):
  `Prognóza nákladů = Σ max(ForecastCost, objednáno)` přes položky; odchylka = (prognóza − baseline) / baseline.
  Zelená: odchylka ≤ 0 % · Žlutá: 0 až +5 % · Červená: > +5 % **nebo** plánovaná marže pod minimem. Bez schválené baseline = šedá („bez rozpočtu“).
  Výpočet v `src/core`, testovaný; výsledek ukládat do PRM_Projects jako cache pro dashboard.

### 8.8 Cashflow plán projektu

- **Výdaje**: z položek RR – datum platby = konec navázané položky harmonogramu (nebo datum dodání z objednávky) + splatnost; záloha (AdvancePercent) k datu objednání; ruční přepsání data. Schválené objednávky nahrazují plán položky svými daty.
- **Příjmy**: z fakturačních milníků (PlannedDate + DueDays); vystavené podklady a úhrady plán upřesňují.
- **Skutečnost**: z PRM_ActualCashflows (import z účetnictví přes Excel/CSV + ruční zadání). Formát importu navrhni obecně a vyžádej si ukázkový export z účetního systému.
- Zobrazení po měsících (volitelně týdnech): příjmy, výdaje, saldo, kumulované saldo – graf + tabulka, plán vs. skutečnost.
- **Automatická aktualizace**: změna v RR, objednávkách, podkladech nebo **posun v harmonogramu** se okamžitě promítne do CF projektu (výpočet on-the-fly v `src/core`, žádná ruční synchronizace).

### 8.9 Harmonogram (Gantt) projektu

- Položky: činnosti, dodávky materiálu, služby, milníky; hierarchie WBS; smluvní termíny plnění jako milníky s příznakem.
- **Závislosti** FS/SS/FF/SF s prodlevou (lag), kreslené šipkami.
- **Kritická cesta** počítaná metodou CPM (dopředný/zpětný průchod, rezervy), kritické položky zvýrazněné červeně; navíc ruční příznak „sledovat jako kritické“. Kontrola cyklů v závislostech.
- Úpravy: tabulka vlevo + Gantt vpravo; posun/prodloužení tažením myší (v pozdější iteraci, nejdřív editace v tabulce), % dokončení, baseline vs. aktuální plán.
- Vazba položek RR na položky harmonogramu → **posun dodávky posune CF**. Při posunu upozornit na dopad na smluvní termíny.
- Měřítko den/týden/měsíc, dnešek, víkendy; export do Excelu a PDF (A3 na šířku).
- Volitelně později: import z MS Project (XML).

### 8.10 Celofiremní cashflow (jen Finance – důvěrné)

- Měsíční přehled na zvolené období (např. 18 měsíců dopředu + 6 zpět):
  počáteční zůstatek → **příjmy projektů** → **výdaje projektů** → **Režie** → **důvěrné firemní příjmy a výdaje** (FIN_CompanyCashItems, včetně opakovaných položek) → saldo → konečný zůstatek.
- Rozpad po projektech a kategoriích, plán vs. skutečnost, porovnání s posledním odevzdaným CF (co se změnilo a proč – u projektů dohledatelné na úroveň položek).
- Tlačítko **„Odevzdat CF na FO“**: uloží snapshot (JSON + Excel) do FIN_CFSubmissions s datem a autorem.

### 8.11 Excel report pro finančního ředitele holdingu

- Generuje se v prohlížeči (ExcelJS), grafika RES (logo, barvy, písmo), čitelné pro finančníka: listy
  `Souhrn CF` (měsíce ve sloupcích, řádky dle struktury FO, součty jako vzorce), `Projekty – přehled` (cena, baseline, prognóza, marže, vyfakturováno, uhrazeno, semafor), `CF po projektech`, `Režie`, `Firemní položky`, `Plán vs. skutečnost`, `Změny proti minulé verzi`.
- **Pokud je v `docs/sablony/` šablona holdingu, report se přizpůsobí jejím řádkům a formátu** (mapování kategorií v FIN_Settings).
- Volitelně export projektového CF pro PM (bez důvěrných dat).

### 8.12 Benchmark projektů (Vedení)

- Porovnání dokončených zakázek: marže plán/skutečnost, odchylka rozpočtu, odchylka termínu (plán vs. skutečné ukončení), náklady na kWp / kWh podle typu (FVE, BESS…), podíl kategorií nákladů, počet a objem objednávek.
- Filtry podle typu, roku, PM; grafy + export Excel.

### 8.13 Nastavení (Administrátor)

Cesta ke knihovně projektů, šablony složek, číselné řady, vzor názvu zakázky, typy zakázek, kategorie rozpočtu, prahy semaforu, limity schvalování a schvalovatelé, názvy skupin rolí, e-mail účtárny, fakturační údaje RES pro PDF, kategorie firemního CF (Finance), import stávajících zakázek.

---

## 9. Grafický manuál a značka RES

- Přečti grafický manuál v `brand/` a loga v `brand/loga/`; kde se od níže uvedeného liší, **má přednost manuál**.
- Výchozí paleta (z firemní šablony dokumentů): text `#030422`, tmavě modrá (navy) `#153D64` / `#0E2841`, zelená `#00C667`, modrá `#0268A6`, světle modrá `#C1E4F5`; grafy: modrá `#0268A6`, zelená `#00A857`, tmavě modrá `#215E99`, šedá `#9AA3AD`.
- Semafor: použij odstíny zelená/žlutá/červená sladěné s paletou, vždy doplněné textem nebo ikonou (ne jen barvou – přístupnost).
- Písmo: **Aptos** (M365), záloha `'Segoe UI', system-ui, sans-serif`. Do PDF vlož font s plnou podporou češtiny (Aptos nevkládej – licence).
- Hlavička aplikace: logo RES, název „PRM Revoltum“; claim „Revoltujte s námi za moderní decentralizovanou energetiku“ jen v patičce/PDF.
- PDF patička: Revoltum Engineering & Services, Havířská 1021, 580 01 Havlíčkův Brod (+ IČO/DIČ z Nastavení).
- Vytvoř vlastní Fluent UI theme `ui/theme.ts`, aby všechny komponenty používaly barvy RES. Čistý, věcný vzhled; tabulky husté, ale čitelné; responzivní (tablet, na mobilu aspoň čtení a schvalování).
- Jazyk UI čeština, formáty `cs-CZ` (1 234 567 Kč, 11. 9. 2026).

---

## 10. Nefunkční požadavky

- Rychlost: dashboard do 2 s při 500 zakázkách; načítej jen potřebné sloupce, stránkuj, cachuj číselníky.
- Robustnost: srozumitelné chybové hlášky česky (co se stalo, co dělat), žádné tiché selhání. Při chybě oprávnění vysvětlit, koho požádat.
- Souběh: optimistické zamykání (ETag) i u editace rozpočtu a zakázky – upozornění „mezitím změnil kolega X“.
- Testy: unit testy `src/core` (číslování, semafor, CF, CPM, názvy složek), ruční testovací scénáře pro každou fázi v `docs/testy/`.
- Dokumentace: `README.md` (pro admina: instalace, nasazení, aktualizace), `docs/NAVOD_UZIVATEL.md` (pro PM, česky, se snímky obrazovek později), `CHANGELOG.md`.
- Připravenost na budoucí migraci: repozitáře (4.2), žádná logika rozprostřená v komponentách UI.

---

## 11. Nasazení (popiš Igorovi krok za krokem)

1. Příprava PC: Node.js v verzi podporované aktuálním SPFx, git, VS Code – ověř a vysvětli.
2. Admin M365: založení webů PRM a PRM-Finance, **App Catalog** (tenantový nebo site-collection), skupiny rolí.
3. Build `.sppkg` → nahrání do App Catalogu → přidání aplikace na web PRM → stránka s web partem (single part app page) → volitelně přidání do Teams.
4. Spuštění průvodce Instalace a diagnostika → založení seznamů.
5. Nastavení (knihovna, šablony, řady, limity) → import stávajících zakázek → test.
6. Postup pro aktualizaci na novou verzi (zvýšení verze balíčku, nahrání, kontrola schématu).
7. Ladění během vývoje: použij aktuálně podporovaný způsob Microsoftu (hostovaný workbench se ruší 1. 12. 2026) + režim s mock daty pro vývoj UI.

---

## 12. Fáze vývoje a akceptační kritéria

**Fáze 0 – Základ** · kostra SPFx projektu, `CLAUDE.md`, git, theme RES + logo, layout a navigace, detekce uživatele a rolí, mock data, průvodce Instalace a diagnostika (weby, seznamy, indexy), stránka Nastavení (základ), návod na nasazení.
✔ Aplikace běží na webu PRM, ukazuje přihlášeného uživatele a jeho role, průvodce založí seznamy.

**Fáze 1 – Zakázky (MVP)** · číselné řady a čítače, partneři, založení zakázky + generování názvu, **struktura složek**, dashboard, detail zakázky (Přehled, Dokumenty), smluvní termíny (PRM_Tasks jako milníky), zakázka Režie, **import stávajících zakázek z Excelu** a navázání číslování, export tabulky.
✔ PM založí zakázku, dostane číslo, složky vzniknou, dashboard ukazuje požadované sloupce.

**Fáze 2 – Objednávky, fakturace, dokumenty** · objednávky + schvalovací workflow, „Čeká na mě“, e-maily, PDF v grafice RES do složky zakázky, podklady pro fakturaci s ročním resetem, předávací protokoly, přehledy napříč zakázkami, audit.
✔ Asistent vystaví objednávku, PM/Vedení schválí podle limitu, PDF je ve složce, čísla jsou bez duplicit.

**Fáze 3 – Realizační rozpočet a CF projektu** · RR editor + import z Excelu, verze a schválení baseline, objednáno/uhrazeno, semafor, fakturační milníky, CF projektu (plán vs. skutečnost), import skutečnosti.
✔ Semafor na dashboardu odpovídá datům; změna položky RR se hned projeví v CF.

**Fáze 4 – Harmonogram** · Gantt, závislosti, CPM a kritická cesta, baseline, vazba na RR a CF, export.
✔ Posun dodávky v harmonogramu posune platby v CF a kritická cesta se přepočítá.

**Fáze 5 – Firma a vedení** · web PRM-Finance, důvěrné položky, celofiremní CF, odevzdání CF na FO se snapshotem, Excel report pro FO (dle šablony holdingu), benchmark projektů.
✔ Uživatel bez role Finance nevidí žádná důvěrná data (ověřeno i přímým přístupem na seznam); report pro FO se vygeneruje jedním kliknutím.

**Fáze 6+ – Rozvoj (návrhy)** · Power Automate připomínky (splatnosti, termíny), napojení na účetní systém, nabídky (před zakázkou), výkazy práce, mobilní schvalování, AI shrnutí stavu zakázky.

---

## 13. Otevřené body, na které se máš zeptat (ve správné fázi)

1. Přesný formát čísla zakázky a dosavadní číslování (Fáze 1).
2. Finální šablona složek, případně podle typu zakázky (Fáze 1).
3. Limity schvalování a jména schvalovatelů (Fáze 2).
4. Vzory PDF (objednávka, podklad pro fakturaci, protokol) a fakturační údaje RES (Fáze 2).
5. Účetní systém a formát exportu skutečných plateb (Fáze 3).
6. Kategorie rozpočtu a prahy semaforu, minimální marže (Fáze 3).
7. Struktura reportu pro FO holdingu, perioda odevzdání, kategorie firemního CF (Fáze 5).
8. Kdo je admin M365 a může nahrát aplikaci do App Catalogu (Fáze 0).
