# Navázání v nové relaci — PRM Revoltum

> **K čemu to je:** historie konverzace s Claudem se do nové relace nepřenáší.
> Tenhle soubor je předávka: co je hotové, kde jsme skončili, co je další na řadě
> a co se od Claudea čeká. **Aktualizuj se po každé větší dávce práce.**
>
> Poslední aktualizace: **23. 9. 2026**

---

## 1. Čím začít novou relaci (zkopíruj do Claudea)

```
Pokračujeme na projektu PRM Revoltum v C:\Projekty\prm-revoltum.
Přečti si NAVAZANI.md, CLAUDE.md, docs/ZADANI.md a docs/ROZHODNUTI.md,
mrkni na git log a řekni mi, kde jsme skončili a co navrhuješ dál.
```

To stačí. Claude si zbytek dohledá sám.

---

## 2. Kde to leží a jak to spustit

| | |
|---|---|
| Kód | `C:\Projekty\prm-revoltum` (**mimo OneDrive** — `node_modules` se nesmí synchronizovat) |
| Náhled v prohlížeči | `http://localhost:4322` |
| Ostrý SharePoint | tenant **https://revoltum.sharepoint.com**. Aplikace i seznamy poběží na **`/sites/RevoltumEngineeringServices`** (vědomé rozhodnutí — projekty už tam jsou). Igor má roli **Správce SharePointu**, nasazení zvládne sám. |

**Spuštění náhledu — nejjednodušeji:** na ploše je zástupce
**„PRM Revoltum – náhled"**. Dvojklik sestaví náhled, spustí server a otevře
prohlížeč. Černé okno, které se přitom objeví, **nechte otevřené** — dokud běží,
běží i náhled. Zavřením okna se náhled ukončí.
Druhý zástupce **„PRM Revoltum – složka projektu"** otevře složku s kódem.

Ručně (PowerShell, v kořeni projektu):

```bash
cd spfx; npm run test; cd ..\nahled; node build.js; node serve.js
```

Náhled bere přeložený kód ze `spfx/lib`, proto se musí nejdřív buildnout
(`npm run test` build zahrnuje). Po každé změně UI znovu sestavit.

> **Pozor na cache prohlížeče.** Soubor `nahled.js` má pořád stejný název.
> Když se změna „neprojeví", načti stránku s `?v=2` na konci adresy
> nebo Ctrl+F5.

Node.js 22 musí být v PATH (`node --version` → `v22.x`). Když není, viz CLAUDE.md kap. 3.

---

## 3. Stav k 23. 9. 2026

**Fáze 0 — Základ:** ✅ kód hotov, čeká na nasazení na tenant (blokuje otázka 8).

**Fáze 1 — Projekty (MVP):** ✅ **kód hotov**, čeká na nasazení na tenant. **351 testů prochází**, pracovní strom čistý.

Hotovo ve Fázi 1:

- **Číselné řady a čítače dokladů** — `core/numbering.ts`, mock i SharePoint
  implementace. Souběh (dva lidé zakládají projekt naráz) řešen přes ETag
  a opakování při HTTP 412. V mocku je souběh schválně simulovaný a otestovaný.
- **Partneři (zákazníci a dodavatelé)** — seznam + boční panel, stránka
  *Partneři* v levém menu.
- **Dotažení údajů z ARES podle IČO** — zadá se IČO, tlačítko s lupou dotáhne
  název, sídlo, DIČ a příznak *plátce DPH*. ARES posílá `Access-Control-Allow-Origin: *`,
  takže se volá přímo z prohlížeče, bez mezičlánku.
- **Úprava existujícího projektu** — tlačítko „Upravit projekt" v detailu.
  Mění se stav, zákazník, typ, lokalita, PM, cena, termíny, zkratka a název.
  Číslo projektu se nemění nikdy. Kontroly (termíny pozpátku, záporná cena,
  ukončený projekt bez data ukončení) jsou v `core/projectEdit.ts`.
  Datum jde ve formulářích **napsat** česky, nejen vyklikat v kalendáři.
- **Mazání projektu** — jen role Administrátor PRM, v panelu úprav. Potvrzení
  vyžaduje opsat číslo projektu. Maže se do koše SharePointu (93 dní na obnovu),
  složka projektu zůstává, a do `PRM_AuditLog` se zapíše kdo, kdy a proč mazal.
  Projektový manažer místo mazání používá stav Storno.
- **Založení projektu (průvodce)** — náhled čísla (nespotřebuje ho), výběr nebo
  založení zákazníka, typ, PM, cena a měna, termíny, generovaný název projektu,
  přidělení čísla, založení složek. Když selže zakládání složek, projekt se
  **uloží stejně** a nabídne se tlačítko „Zkusit znovu založit složky".
- **Dashboard** — kompaktní pruh KPI, hledání, filtr podle projektového manažera,
  hlavní plocha = seznam projektů. Pod celou hlavičkou podkladová grafika RES
  (modrý gradient + blesky ze šablony prezentace), roztažená od menu ke scrollbaru.
- **Projekt Režie** — vnitřní projekt pro režijní objednávky a náklady mimo
  zakázky. Číslo `{RR}999`, **jedna Režie na rok** (26999, 27999…). Je součástí
  běžné řady i seznamu projektů, ale číslo se nebere z čítače, takže nikomu
  neukradne pořadí. Zakládá se v *Nastavení → Jednorázové akce*.
- **Import stávajících projektů ze složek** — *Nastavení → Jednorázové akce*.
  Přečte názvy složek, rozebere je na číslo a název, pozná pomocné složky
  (`00_Project tools`) i to, co už je naimportované. Po importu posune čítač.
  Rozbor je v `core/projectImport.ts`, ověřený na skutečných složkách RES.
- **Uživatelé a role** — stránka v levém menu (jen administrátor). Role = členství
  ve skupině SharePointu; aplikace **nezakládá účty**, ty dělá správce tenanta.
- **Smluvní termíny plnění** — záložka *Termíny* v detailu projektu. Výběr
  nejbližšího je v `core/deadlines.ts`: hotové se přeskakují a **zmeškaný termín
  má přednost před budoucím**. Po každé změně se přepočítá cache `NextDeadline`,
  ze které čte dashboard.
- **Záložka Dokumenty** — posledních 10 změněných souborů ve složce projektu
  včetně podsložek. Jeden CAML dotaz se `Scope="RecursiveAll"`; REST `folder.files`
  vrací jen jednu úroveň a znamenal by desítky dotazů.
- **Export tabulky do Excelu** — tlačítko na dashboardu, stáhne to, co je právě
  vyfiltrované. ExcelJS se načítá až při kliknutí (dynamický import).
- **Limity schvalování** v Nastavení — 100 tis. / 500 tis. / 1 mil., pod poli
  výpis vět, co ta čísla znamenají. Workflow samotné je až Fáze 2.
- **Terminologie** — v celé aplikaci i dokumentaci je „projekt", nikde „zakázka".

### Čím jsme skončili

**Aplikace běží ostře** na `/sites/RevoltumEngineeringServices` (nasazeno 29. 9. 2026,
balíček 0.2.4.0). Nasazení odhalilo čtyři chyby, které se lokálně nedaly najít:
hledání lidí (HTTP 400), skupiny rolí bez oprávnění, knihovna „Dokumenty" se
nenašla podle zobrazeného názvu, oříznuté záložky. Všechny opravené.

**Aktuální balíček je 0.12.1.0** (30. 9. 2026; na ostrém webu běží 0.3.x nebo 0.4.0.0 — ověřit v katalogu). Přidává stavy projektů
(Uzavřeno zrušeno, nově Reklamace), barvy špendlíků podle stavu, legendu mapy. **Po nahrání znovu
spustit Instalace a diagnostika** — doplní volbu „Reklamace" do sloupce Stav (schéma 5). Pokud
by automatické doplnění selhalo, přidat volbu ručně: nastavení seznamu PRM – Projekty → sloupec Stav
→ Volby. Bez toho nejde uložit projekt ve stavu Reklamace.

Starší poznámka k balíčku 0.3.0.0 (obsah je součástí všech novějších):
Balíček 0.3.0.0 byl hotový (vytvořen 29. 9. 2026 večer).
Verze 0.12.0.0: fotky po **dávkách** (složka `rok-měsíc-den_přídomek`, den vložení nebo pořízení), **tolerantní hledání složek** (`_`/`-`), výchozí složka fotek `07-Dokumentace a podklady/FOTO`, **nabídka ve skupinách** (Projekty, Nastavení), oprava kreslení náčrtů. Verze 0.12.1.0: všechny složky podle skutečného projektu 26001 (04-Zápisy, 03-Nákup/Objednávky, 03-Rozpočet projektu/Fakturace, šablona nového projektu), cesty v Nastavení, hledání složky ignoruje číselnou předponu. **Otevřené:** diagnostika odeslání e-mailu (403 ErrorAccessDenied — v tokenu chybí Mail.Send?).
Verze 0.11.0.0: **fotodokumentace z mobilu** (Fáze 2, krok 4) — stránka Foto a záložka v projektu, foťák rovnou, fronta nahrávání s opakováním, složka `FOTO/rok/den`. Bez změny schématu. **Další nápady:** vložit fotky z FOTO do zápisu ze stavby jedním klikem, poloha fotky (GPS), samostatná mobilní aplikace s offline frontou, **předávací protokoly** (řada PP, složka 06_Předání a revize), Excel exporty objednávek a podkladů.
Verze 0.10.0.0: **zápisy ze stavby a stavební deníky** (Fáze 2, krok 3) — víc deníků k projektu, zápis s upravitelnou hlavičkou, účastníky, body, fotkami, náčrty a úkoly, PDF + Word do složky zápisu, podpis v aplikaci (otisk SHA-256) nebo nahraný podepsaný sken. Schéma 9 (**spustit Instalaci a diagnostiku**). **Další krok: fotodokumentace z mobilu** (stránka Foto, složka 07_Dokumentace a podklady/FOTO — cesta je už v Nastavení → Složky), potom předávací protokoly a Excel exporty.
Verze 0.9.0.0: **podklady pro fakturaci** (Fáze 2, krok 2) — seznam Fakturace, záložka v projektu, cesta Koncept → Ke kontrole → Předáno účtárně → Vyfakturováno → Uhrazeno, PDF do 04_Fakturace, e-mail účtárně, historie. Schéma 8 (**spustit Instalaci a diagnostiku**, vyplnit E-mail účtárny v Údajích firmy). **Dál ve Fázi 2:** předávací protokoly (řada PP, složka 06_Předání a revize), Excel export objednávek a podkladů, doladění PDF podle vzorů RES. Opravy 0.8.2–0.8.3: srozumitelné chyby odeslání objednávky, složka 03_Nákup se zakládá jen když chybí.
Verze 0.8.1.0: oprava číslování objednávek (všechny měly OBJ-2026-0001 — čítač s prázdným klíčem rozsahu, viz `pickCounterRow`), částky v přehledu v Kč, zarovnané filtry, šedý podklad mapy, mazání/přečíslování duplicit v Jednorázových akcích.
Verze 0.8.0.0 (zpětná vazba z ostrého zkoušení): okna uvnitř panelu objednávky, nadlimitní objednávky se schvalují v aplikaci, přílohy jako dlaždice
s miniaturou (pdf.js, Apache-2.0), změna schvalovatele tlačítkem, e-mail schvalovateli s odkazem, úprava po schválení/zamítnutí, odeslat znovu,
smazání objednávky adminem, datum vystavení + řazení, automatické obnovování seznamů, soubory v nové kartě. Schéma zůstává 7.
**Do budoucna (rozpočet):** objednávka z položky rozpočtu, i z její části; termín dodání do harmonogramu — viz docs/ROZHODNUTI.md.

Verze 0.7.0.0 doplňuje objednávky o PDF, e-mail dodavateli (Graph `Mail.Send` — schválit v SharePoint admin centru, API access), přílohy,
měny EUR/USD s kurzy ČNB (Nastavení → Kurzy, ručně), výběr schvalovatele a opravu řady OBJ. Schéma 7.

Verze 0.6.0.0 přidává **objednávky a schvalování** (Fáze 2, krok 1). Po nahrání: (1) Instalace a diagnostika (schéma 6),
(2) Uživatelé a role → založit chybějící skupiny (vznikne „PRM Jednatelé") a obsadit ji, (3) v Nastavení → Schvalování
zkontrolovat přepínač „PM si schválí sám" (má být vypnutý, rozhodnutí zadavatele) a kurz EUR pro limity.
**Otevřené:** správa lidí s přístupem k Režii v aplikaci; oprávnění objednávek na Režii (viz ROZHODNUTI).

Přináší také: mapu projektů (Leaflet + OpenStreetMap, hledání míst Nominatim), výběr lokality
z mapy, řazení seznamu, opravu editoru typů projektů a výběru zákazníka; schéma je nyní 4
(sloupce Země u partnerů, šířka a délka u projektů; aplikace bez doplnění schématu nespadne).
**Nápady na příště:** dopočítat polohy stávajících projektů z textu Lokalita jedním tlačítkem;
zahraniční registry (viz ROZHODNUTI).
Přináší: omezený přístup k Režii (jen Administrátoři, Vedení, Finance),
výběr země u partnerů (EU), opravu nabídky projektových manažerů.
Po nahrání je třeba **jednou spustit Správa → Instalace a diagnostika** (nový sloupec
„Země", schéma 3) a v detailu **Režie 26999 kliknout na „Omezit přístup"** —
stávající Režie 2026 vznikla dřív a je zatím otevřená všem.
Ověřit na ostrém webu: zda po omezení uvidí Režii jen očekávané skupiny
(pruh v detailu ukazuje skutečný stav). Lokálně se to ověřit nedá.

Naimportováno šest projektů (26001–26006) a založena Režie 2026 (26999).
Čítač projektů čeká na 26007. Importované projekty mají jen číslo, název
a složku — **Igor doplňuje zákazníky, ceny a termíny** v detailu projektu.

Struktura knihovny a číslování nabídek jsou zapsané v `docs/ROZHODNUTI.md`.
Nabídky zatím nestavíme (návrh: otevřené v kořeni `00_OBCHODNI PRILEZITOSTI`,
prohrané do `CLOSED/rok`, vyhrané se stanou projektem; `N26_0002`, řada oddělená
od projektů).

---

## 4. Co je další na řadě

**Nasazení na tenant.** Postup: [`docs/NASAZENI.md`](docs/NASAZENI.md).
Balíček `spfx/sharepoint/solution/prm-revoltum.sppkg` verze 0.2.0.0 je hotový.

Igor má roli **Správce SharePointu** (ověřeno 29. 9. 2026) — katalog aplikací
si založí sám, cizí správce není potřeba.

Po nasazení:

| Co | Poznámka |
|---|---|
| **Ověřit ostrý provoz** | první spuštění na SharePointu odhalí věci, které lokálně ověřit nejdou: souběh, koš, auditní log, čtení knihovny, zakládání složek |
| **Fáze 2 — objednávky a schvalování** | limity už jsou v Nastavení (100 tis. / 500 tis. / 1 mil.). Chybí jména schvalovatelů (ot. 3) a fakturační údaje RES + vzory PDF (ot. 4) |

Igor 22. 9. 2026 rozhodl: dodělat Fázi 1, pak teprve Fáze 2.
Fáze 1 je hotová — ale Fázi 2 stavět až na ověřeném základu, ne na kódu,
který nikdy neběžel.

---

## 5. Co blokuje postup (otázky na Igora)

| # | Otázka | Blokuje |
|---|---|---|
| 8 | ✅ zodpovězeno — Igor má roli Správce SharePointu, nasazení zvládne sám |  |
| 9 | ✅ zodpovězeno — tenant `revoltum.sharepoint.com`, aplikace poběží na `/sites/RevoltumEngineeringServices` |  |
| 10 | ✅ zodpovězeno — knihovna `Dokumenty`, kořenová složka `General/01_PROJEKTY`, bez podsložek podle roku |  |
| 3 | Jména schvalovatelů objednávek (limity už zadané) | Fázi 2 |
| 4 | Vzory PDF a fakturační údaje RES (IČO, DIČ, e-mail účtárny) | Fázi 2 |
| — | Kde leží **obchodní příležitosti** a jestli je importovat jako projekty ve stavu Nabídka | import |
| — | Samostatný web pro důvěrná finanční data | Fázi 5 |

Celý seznam včetně zodpovězených rozhodnutí: [`docs/ROZHODNUTI.md`](docs/ROZHODNUTI.md).

---

## 6. Co si Claude musí pamatovat (a co se už jednou pokazilo)

Trvalá pravidla jsou v [`CLAUDE.md`](CLAUDE.md). Navíc věci, na které se naráží
opakovaně a v dokumentaci je nenajdeš:

- **Říkáme „projekt", nikdy „zakázka."** I když to Igor sám napíše, Claude to má opravit.
- **`String.padStart` a `Promise.finally` v SPFx nejsou k dispozici** (cílová knihovna
  je starší). Používat vlastní pomocnou funkci — vzory jsou v `core/format.ts`
  (`pad2`) a `core/numbering.ts` (`padWithZeros`).
- **Číslo projektu se odvozuje od data registrace, ne od data zahájení.**
  Ukázkový projekt `25005` (stav Nabídka) má číslo, ale žádné datum zahájení.
- **Formát čísla projektu je `26001`, bez pomlčky.** Navazuje na čísla, která RES
  reálně používá na složkách. Režie je `26999`. Kdyby se někde objevilo `26-001`,
  je to pozůstatek a patří opravit.
- **Mock čítač se musí naplnit ze seedu** (`seedProjectCounter()`), jinak nový
  projekt dostane číslo, které už ukázková data mají. Je na to test.
- **Při jakékoli změně schématu zvýšit `SCHEMA_VERSION`** a doplnit migrační krok.
  Instalátor jen přidává, nikdy nemaže.
- **Souběh, zakládání složek a koš SharePointu se lokálně neověří.** Otestuje se
  až na ostrém tenantu — dokud se to nestane, tvrdit „ověřeno" by bylo nepoctivé.
  Týká se to i kontroly ETagu při úpravě projektu (v mocku je jen simulovaná)
  a zápisu do `PRM_AuditLog` při mazání.
- **Oprávnění se ověřují i v datové vrstvě, ne jen skrytím tlačítka v UI.**
  Vzor: `remove()` v `mockRepositories.ts` i `spProjectRepository.ts` volá
  `canDeleteProject` znovu. Stejně postupuj u každé další destruktivní akce.
- **Fluent DatePicker neumí česká data** — bez `parseDateFromString` se napsané
  „20. 9. 2026" tiše zahodí. Každý nový DatePicker musí dostat `allowTextInput`
  a `parseDateFromString={(t) => parseCzechDate(t) ?? null}`.
- **Čistá logika patří do `src/core/` a musí mít testy** (číslování, rozpočet,
  cashflow, CPM, semafor). Žádný import SharePointu, PnPjs ani Reactu.

---

## 7. Mapa důležitých souborů

```
CLAUDE.md                        trvalá pravidla projektu (Claude to čte první)
CHANGELOG.md                     historie po fázích
docs/ZADANI.md                   závazné kompletní zadání
docs/ROZHODNUTI.md               rozhodnutí + otevřené otázky
brand/BARVY.md                   paleta RES

spfx/src/core/                   čistá logika (numbering, folders, ico, format, roles, settings)
spfx/src/data/repositories.ts    rozhraní všech repozitářů — klíčový soubor
spfx/src/data/ares.ts            dotažení firmy z ARES podle IČO
spfx/src/data/mock/              ukázková data pro náhled
spfx/src/data/sharepoint/        ostré implementace
spfx/src/features/projects/      dashboard, detail, průvodce založením
spfx/src/features/partners/      partneři
spfx/src/ui/theme.ts             barvy a rozměry RES — jediný zdroj pravdy
nahled/                          lokální náhled bez SharePointu
```
