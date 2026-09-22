# Navázání v nové relaci — PRM Revoltum

> **K čemu to je:** historie konverzace s Claudem se do nové relace nepřenáší.
> Tenhle soubor je předávka: co je hotové, kde jsme skončili, co je další na řadě
> a co se od Claudea čeká. **Aktualizuj se po každé větší dávce práce.**
>
> Poslední aktualizace: **22. 9. 2026**

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
| Ostrý SharePoint | zatím **nikde** — čeká se na adresu tenanta (otázka 9) |

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

## 3. Stav k 22. 9. 2026

**Fáze 0 — Základ:** ✅ kód hotov, čeká na nasazení na tenant (blokuje otázka 8 a 9).

**Fáze 1 — Projekty (MVP):** 🔶 rozpracováno, **213 testů prochází**, pracovní strom čistý.

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
- **Terminologie** — v celé aplikaci i dokumentaci je „projekt", nikde „zakázka".

### Čím jsme skončili

Poslední commit `4ee6559`. Naposledy proběhlo ověření v náhledu od začátku do konce:
nový projekt dostal číslo `26-006` (správně navázal za ukázkovými daty),
název se vygeneroval jako `26-006 ČEZ Distribuce, a.s. – Havlíčkův Brod`,
uložení přesměrovalo na detail a na dashboardu přibyl řádek.

**Otevřená otázka na Igora:** projít si to naklikat a dát zpětnou vazbu,
nebo pokračovat rovnou dál?

---

## 4. Co zbývá do konce Fáze 1

| Co | Poznámka |
|---|---|
| Detail projektu — záložka **Dokumenty** | posledních ~10 změněných souborů ve složce projektu |
| **Projekt Režie** (`IsOverhead`) | vnitřní projekt pro režijní náklady |
| **Smluvní termíny** | milníky v seznamu `PRM_Tasks` |
| **Import stávajících projektů** | ⛔ **čeká na Igora** — Excel není, dodá printscreen složky s čísly a názvy projektů (rozhodnutí z 21. 9. 2026) |
| **Export tabulky do Excelu** | ExcelJS |

---

## 5. Co blokuje postup (otázky na Igora)

| # | Otázka | Blokuje |
|---|---|---|
| 8 | Kdo je správce Microsoftu 365 a může nahrát aplikaci do katalogu | dokončení Fáze 0 — bez toho se aplikace nedostane na SharePoint |
| 9 | Adresa tenanta a webů PRM a PRM-Finance | totéž |
| 10 | Kde přesně leží knihovna projektů (web, knihovna, kořenová složka) | zakládání složek naostro |
| — | Printscreen složky se stávajícími projekty | import a navázání číslování |

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
  Ukázkový projekt `26-005` (stav Nabídka) má číslo, ale žádné datum zahájení.
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
