# CLAUDE.md — trvalá pravidla projektu PRM Revoltum

> Tento soubor je **paměť projektu**. Claude Code ho čte na začátku každé relace.
> Aktualizuj ho po každém dokončeném kroku. Nikdy ho nemaž ani nezkracuj bez domluvy.

---

## 1. Co to je

**PRM Revoltum** — informační systém pro řízení projektů firmy
Revoltum Engineering & Services a.s. (dále RES).

Jedna webová aplikace na firemním SharePointu, kde projektoví manažeři (PM)
a jejich asistenti vedou celý projekt: evidence, složky, objednávky, fakturace,
realizační rozpočet, cashflow, harmonogram. Pro vedení navíc celofiremní cashflow
a Excel report pro finančního ředitele holdingu.

- **Zadavatel a vlastník:** Igor Zahrádka (igor.zahradka@gmail.com) — majitel/manažer, **není programátor**.
- **Kompletní zadání:** [`docs/ZADANI.md`](docs/ZADANI.md) — závazný dokument, má přednost před tímto souborem.
- **Stav fází:** viz kapitola 9 níže.

---

## 1a. Jak navázat v nové relaci

Historie předchozích konverzací se nepřenáší — **tento soubor a `docs/` jsou
jediná paměť projektu.** Na začátku každé relace:

0. **Začni souborem [`NAVAZANI.md`](NAVAZANI.md)** — předávka mezi relacemi:
   kde jsme skončili, co je další na řadě, co blokuje postup, na co si dát pozor.
1. Přečti tento soubor, `docs/ZADANI.md`, `docs/ROZHODNUTI.md` a `CHANGELOG.md`.
1b. **Přečti nové záznamy deníku druhé strany** `C:\Projekty\revcrm\docs\DENIK.md` (jen ty novější než „Přečteno z deníku druhé strany do“ v `NAVAZANI.md`), pak toto místo aktualizuj. Záznam s **AKCE** vyřiď a odpověz vlastním záznamem v `docs/DENIK.md` (`Reaguje na: R-…`). Do repozitáře REVCRM se nezapisuje. Vlastní deník `docs/DENIK.md` doplň po každé změně, která se může týkat REVCRM (sdílené seznamy a sloupce, oprávnění, verze balíčku, rozhraní, rozhodnutí Igora).
2. Podívej se na `git log --oneline` — co se dělalo naposledy.
3. Stav fází je v kapitole 9, otevřené otázky v `docs/ROZHODNUTI.md`.
4. Node.js 22 musí být v PATH (`node --version` → `v22.x`). Pokud není, viz kap. 3.

## 2. Pravidla spolupráce (závazná)

1. **Komunikuj česky**, srozumitelně, bez žargonu. Technické kroky (instalace,
   nasazení, oprávnění v M365) piš krok za krokem včetně toho, kam kliknout.
2. **Pracuj po fázích.** Na konci každé fáze se zastav a vypiš: co je hotové,
   jak to otestovat, otevřené otázky. Nepokračuj do další fáze bez pokynu.
3. **Git:** po každém dokončeném kroku commit s českou zprávou.
   Nikdy `git push --force`, nikdy nepřepisuj historii.
4. **Nikdy nemaž ani hromadně nepřepisuj data** v produkčních SharePoint seznamech.
   Změny schématu jen přidáváním, přes verzovaný instalační průvodce.
5. **Nejasnosti se ptej**, pokud mají dopad na data, peníze nebo oprávnění.
   U kosmetických věcí rozhodni rozumně a uveď to ve shrnutí.
6. **Čistá logika = testovaná logika.** Číslování, rozpočet, cashflow, CPM, semafor
   patří do `src/core/` jako funkce bez závislosti na SharePointu, pokryté unit testy.
7. **Licence:** jen MIT / Apache-2.0 / BSD. Nic pod GPL ani komerční licencí.
8. **Ověřuj dokumentaci Microsoftu**, neřiď se zastaralými návody z internetu.
   Toolchain SPFx se v roce 2026 zásadně změnil (viz kap. 3).

---

## 3. Technologie a verze (ověřeno 11. 9. 2026)

| Položka | Verze | Poznámka |
|---|---|---|
| SharePoint Framework (SPFx) | **1.23.2** | GA, vydáno 30. 6. 2026. Verze 1.23.1 byla stažena kvůli regresím — nepoužívat. |
| Node.js | **22 LTS** (22.23.2) | SPFx 1.23 běží **jen** na Node 22. Ne 24, ne 26. Nainstalováno přes `winget install OpenJS.NodeJS.22` — jde o přenosnou (zip) variantu v `%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.22_*\node-v22.23.2-win-x64`. |
| PnPjs | **4.21.0** | Přístup k SharePoint REST. |
| Build toolchain | **Heft** (`@rushstack/heft`) | Od SPFx 1.22 **není gulp**. Návody s `gulp serve` / `gulp bundle` jsou zastaralé. |
| React | **17.0.1** (přesně) | Instalovat s `--save-exact`. Jiná verze = tichá selhání za běhu. |
| TypeScript | 5.8 | Rozsah podporovaný SPFx 1.23: 2.9–5.8. |
| UI knihovna | Fluent UI React **v8** (`@fluentui/react`) | MIT. Odpovídá Reactu 17 a vzhledu M365. |
| Přístup k datům | **PnPjs v4** | SharePoint REST v kontextu přihlášeného uživatele. MIT. |
| Excel výstupy | ExcelJS | MIT. |
| PDF výstupy | pdfmake | MIT. Font s plnou podporou češtiny (ne Aptos — licence). |
| Testy | Jest (součást Heft toolchainu) | Testy jen pro `src/core/`. |

**Klíčové příkazy** (v kořeni projektu `spfx/`):

```bash
npm install              # instalace závislostí
heft start               # vývojový server + workbench
heft build               # sestavení
heft test                # unit testy
npm run package          # produkční .sppkg do sharepoint/solution/
```

> **Pozor:** hostovaný workbench Microsoftu končí 1. 12. 2026.
> Pro vývoj UI používej **režim s mock daty** (viz kap. 5) — funguje i bez SharePointu.

---

## 4. Architektura (závazná — neměnit bez domluvy)

Aplikace je **jeden full-width web part** na stránce typu *single part app page*
na webu PRM. Interní navigace přes hash router (`#/projekty`, `#/projekt/26-014`, …).
Stejný web part lze přidat jako záložku do Microsoft Teams.

```
spfx/src/
  core/        čistá doménová logika — číslování, rozpočet, CF, CPM, semafor
               ŽÁDNÝ import SharePointu, PnPjs ani Reactu. Vše pokryto testy.
  data/        repozitáře: rozhraní (IProjectRepository…) + SharePoint implementace
  data/mock/   mock implementace s ukázkovými daty — pro vývoj UI bez SharePointu
  features/    moduly UI: projects, purchasing, invoicing, documents, budget,
               cashflow, schedule, finance, settings, admin
  ui/          sdílené komponenty, theme RES, layout, formátování čísel a dat
  webparts/prm/  vstupní web part
```

**Pravidlo č. 1:** veškerý přístup k datům jde **přes rozhraní repozitářů**.
Důvod: aby bylo možné později přejít na Azure SQL / Dataverse bez přepisu UI a logiky.

**Pravidlo č. 2:** v komponentách UI není žádná obchodní logika.
Komponenta volá funkci z `core/` nebo metodu repozitáře.

### Bezpečnost — klíčový princip

SPFx běží v prohlížeči s oprávněními přihlášeného uživatele.
**Skutečnou ochranu dat zajišťují oprávnění SharePointu, ne skrytí v UI.**

- Web **PRM** — projektová data, čtení pro všechny interní, zápis pro PM/asistenty/admin.
- Web **PRM-Finance** — samostatný web s **vlastními (nezděděnými) oprávněními**,
  jen skupina *PRM Finance – důvěrné*. Tam leží důvěrné firemní příjmy/výdaje a zůstatky.
- Agregovaná čísla z důvěrných dat **nikdy neukládej** do seznamů na webu PRM.
- Historie verzí zapnutá na všech seznamech + vlastní `PRM_AuditLog`.
- Kritická pravidla (schválení objednávky) ověřuj **znovu těsně před zápisem**.

---

## 5. Režim mock dat

Web part má vlastnost **„Zdroj dat"** (v panelu vlastností web partu):

| Hodnota | Chování |
|---|---|
| `sharepoint` | ostrá data ze SharePoint seznamů (výchozí v produkci) |
| `mock` | ukázková data z `src/data/mock/` — pro vývoj UI a demo bez SharePointu |

Mock repozitáře implementují **stejná rozhraní** jako ostré. Díky tomu se dá
celé UI vyvíjet a předvést i bez hotových seznamů.

### Lokální náhled (bez SharePointu)

Složka `nahled/` vykreslí **stejné komponenty** s mock daty do obyčejné stránky —
jediný způsob, jak aplikaci vidět bez tenanta (lokální workbench SPFx už neexistuje).

```bash
cd spfx && npm run test && cd ..\nahled && node build.js && node serve.js
```

Pak `http://localhost:4322`. Náhled bere přeložený kód ze `spfx/lib`, proto
nejdřív `npm run test` (nebo `heft build`). Po každé změně UI náhled znovu sestav
a ověř v prohlížeči, než řekneš, že je hotovo.

---

## 6. Datové schéma

Popsáno v kódu: **`spfx/src/data/schema.ts`** s **číslem verze schématu**
(`SCHEMA_VERSION`). Instalační průvodce (*Správa → Instalace a diagnostika*)
je **idempotentní**: kontroluje, co chybí, a jen **přidává**. Nikdy nemaže.

Konvence:
- Interní názvy sloupců **anglicky bez diakritiky**, zobrazované názvy **česky**.
- Částky ukládat **bez DPH**, sazbu DPH zvlášť. Měna výchozí CZK.
- Na filtrovaných sloupcích (Project, Status, Year, PM, Date) **indexy**
  — limit zobrazení seznamu je 5 000 položek.

Při **jakékoli** změně schématu: zvýšit `SCHEMA_VERSION` a doplnit migrační krok.

---

## 7. Značka RES

Zdroje: `brand/loga/` (SVG + PNG), `brand/sablony/` (Word/PowerPoint šablony),
paleta odvozená z firemního motivu Office — viz [`brand/BARVY.md`](brand/BARVY.md).

Hlavní barvy: text `#030422`, navy `#153D64` / `#0E2841`, zelená `#00C667`,
modrá `#0268A6`, světle modrá `#C1E4F5`.

- Písmo: **Aptos** (M365), záloha `'Segoe UI', system-ui, sans-serif`.
- Hlavička aplikace: logo RES + název „PRM Revoltum".
  Claim „Revoltujte s námi za moderní decentralizovanou energetiku" jen v patičce a PDF.
- Semafor (zelená/žlutá/červená) **vždy doplněný textem nebo ikonou** — přístupnost.
- Jazyk UI čeština, formáty `cs-CZ` (1 234 567 Kč, 11. 9. 2026).
- Fluent UI theme je v `spfx/src/ui/theme.ts` — všechny komponenty berou barvy odtud.

---

## 8. Prostředí a nasazení

| | |
|---|---|
| Umístění projektu | `C:\Projekty\prm-revoltum` (**mimo OneDrive** — `node_modules` se nesmí synchronizovat) |
| Zdrojové kódy SPFx | `C:\Projekty\prm-revoltum\spfx\` |
| Hosting | **pouze Microsoft 365**, bez Azure předplatného a bez vlastního serveru |
| Přihlášení | účty M365 firmy (Entra ID), jednotné přihlášení |
| Weby | PRM (projektová data), PRM-Finance (důvěrné, vlastní oprávnění) |

Postup nasazení krok za krokem: [`README.md`](README.md).
Návod pro uživatele: [`docs/NAVOD_UZIVATEL.md`](docs/NAVOD_UZIVATEL.md).
Testovací scénáře pro každou fázi: [`docs/testy/`](docs/testy/).

---

## 9. Stav fází

| Fáze | Obsah | Stav |
|---|---|---|
| **0 — Základ** | kostra SPFx, CLAUDE.md, git, theme RES + logo, layout a navigace, detekce uživatele a rolí, mock data, průvodce Instalace a diagnostika, Nastavení (základ), návod na nasazení | ✅ kód hotov (11. 9. 2026), build i testy prochází · **čeká na nasazení a otestování na tenantu** |
| 1 — Projekty (MVP) | číselné řady a čítače ✅, partneři + ARES ✅, založení projektu ✅, úprava ✅, mazání (admin, do koše + audit) ✅, projekt Režie ({RR}999, jedna na rok) ✅, uživatelé a role ✅, smluvní termíny ✅, dashboard ✅, záložka Dokumenty ✅, export do Excelu ✅ , import stávajících projektů ze složek ✅ | ✅ **kód hotov (23. 9. 2026)** · čeká na nasazení na tenant, 351 testů prochází |
| 2 — Objednávky, fakturace, dokumenty | objednávky + schvalování, „Čeká na mě", e-maily, PDF, podklady pro fakturaci, protokoly, audit | ⏳ čeká |
| 3 — Realizační rozpočet a CF projektu | RR editor, verze a baseline, semafor, fakturační milníky, CF projektu | ⏳ čeká |
| 4 — Harmonogram | Gantt, závislosti, CPM a kritická cesta, baseline, vazba na RR a CF | ▶ rozpracováno: 4a editor + CPM (0.32.0), 4b Gantt (0.33.0), 4c vazba na RR/CF (0.34.0) hotovo, dál 4d export |
| 5 — Firma a vedení | web PRM-Finance, celofiremní CF, odevzdání CF na FO, Excel report, benchmark | ⏳ čeká |
| 6+ — Rozvoj | Power Automate připomínky, napojení na účetnictví, nabídky, výkazy práce | ⏳ čeká |

Akceptační kritéria jednotlivých fází: `docs/ZADANI.md`, kapitola 12.

---

## 10. Otevřené otázky na zadavatele

Ptát se **ve správné fázi**, ne předem (viz `docs/ZADANI.md`, kap. 13).
Aktuální seznam otázek i zodpovězených rozhodnutí je v [`docs/ROZHODNUTI.md`](docs/ROZHODNUTI.md).

Blokující pro dokončení Fáze 0: **kdo je správce M365** (otázka 8)
a **adresa tenanta a webů PRM / PRM-Finance** (otázka 9).
