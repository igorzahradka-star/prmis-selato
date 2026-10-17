# Předání: PRMIS a REV CRM pro SELATO

Zapsáno 17. 10. 2026 (relace „migrace do SELATO“, zadavatel Igor Zahrádka). Tento dokument je
vstup pro Claude Code, který povede další vývoj v SELATO. Historie konverzací se nepřenáší, platí jen soubory.

## 1. O co jde (rozhodnuto Igorem)

- **SELATO s.r.o. je jiná entita s vlastním tenantem Microsoft 365**: `selatosro2025.sharepoint.com`
  (hlavní web `/sites/SELATOs.r.o`). Web part Řízení CF už tam běží (repo `C:\Projekty\cf-selato`, jiný projekt).
- **Přenáší se jen funkcionalita, číselníky a vazby. Žádná data** (projekty, partneři, objednávky, faktury,
  doklady z Abry, uživatelé, soubory, nic z `integrations/abra-sync/vystupy`).
- **Souběžný provoz:** kopie PRMIS a REV CRM poběží v SELATO i dál v Revoltum. Revoltum se vyvíjí dál ve svých repozitářích.
- **Postup A (zvolen):** samostatná kopie (fork) obou aplikací + tento balíček. **Přenos z Revoltum proběhne jednou.** Potom jede SELATO jako samostatná instance, bez průběžného přebírání oprav. Revoltum zůstává beze změny a Igor se sem může jen občas vrátit s dotazem na detail.
- Další vývoj v SELATO převezme Claude Code zřízený v SELATO. Cílový systém spravuje SELATO.

## 2. Kde co leží

| Co | Cesta | Poznámka |
|---|---|---|
| PRMIS SELATO | `C:\Projekty\prmis-selato` | klon z `prm-revoltum`, větev `selato`, bez vzdáleného repozitáře (nelze omylem pushnout do originálu) |
| REV CRM SELATO | `C:\Projekty\revcrm-selato` | klon z `revcrm`, větev `selato`, také bez vzdáleného repozitáře |
| Originály (jen číst) | `C:\Projekty\prm-revoltum`, `C:\Projekty\revcrm` | PRMIS 0.66.0.0 (schéma 36), REVCRM 0.11.1.0 (schéma 5); stav k commitům `b5d9a86` a `50caac8` |
| Řízení CF SELATO | `C:\Projekty\cf-selato` | jiný projekt; má být časem modul PRMIS (viz jeho CLAUDE.md) |

V klonech je plná git historie originálu. Originály se nesmí měnit (ani větve master/servis, verze, balíčky).

## 3. Stálá pravidla (platí i zde)

Komunikace česky, srozumitelně, „projekt“ (ne „zakázka“). Commit po krocích s českou zprávou a trailerem
`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Žádný force-push. Nemazat ani hromadně neměnit produkční data.
Schéma jen přidávací (zvýšit `SCHEMA_VERSION`, migrační krok). Licence jen MIT / Apache / BSD. Hesla, tokeny a přihlašování do cizího
tenanta nezpracovávat, přihlašovací údaje zadává admin přímo do nástroje. Čistá logika patří do `src/core/` s testy.
Agent a Workflow jen na vyžádání Igora.

## 4. Inventura (čtením, neověřeno spuštěním)

**PRMIS** (`spfx/`, SPFx 1.23.2, Node 22, React 17, Fluent v8, PnPjs v4; 384 souborů ts/tsx):
moduly `features/`: projects, partners, orders (schvalování), invoicing, budget (realizační rozpočet, verze), cashflow, schedule (Gantt, CPM),
documents, diary (stavební deník), photos, map, service (lokality, požadavky, servisní listy, plány, smlouvy z Wordu), accounting (data z Abry),
notify, reports, settings, admin, profile, catalog, help.
Seznamy ve `spfx/src/data/schema.ts`: `PRM_Settings, DocTypes, Counters, Partners, Projects, Tasks, BudgetItems, BudgetVersions, Catalog,
PurchaseOrders, Approvals, InvoiceBases, Documents, DiaryEntries, SiteDiaries, ExchangeRates, UserProfiles, Snapshots, Outputs, IncomePlan,
ActualCashflows, AuditLog, AbraDocs, AbraSync, AbraCorrections, Service* (Sites, Devices, Requests, Jobs, Plan, Contracts, ContractVersions)`
a důvěrné `FIN_*` (Settings, CompanyCashItems, CFSubmissions, BankBalances) na samostatném webu PRM-Finance s vlastními právy.
Instalaci seznamů dělá idempotentní průvodce „Správa → Instalace a diagnostika“ (jen přidává).
**ABRA prostředník:** `integrations/abra-sync/` (čistá logika `mapping.js`, `plan.js`; názvy evidencí a polí Flexi v `src/config.js`
byly označené jako nepotvrzené). Čte se jen, do Abry se nezapisuje. Doklady se párují podle zakázky = číslo projektu.
**Externí volání:** ARES (`ares.gov.cz`), mapy OpenStreetMap a Nominatim, Microsoft Graph. Nic z toho nezávisí na Revoltum.
**Šablony a značka:** `brand/` (loga, `BARVY.md`, tři šablony Word/PowerPoint Revoltum), šablony smluv docxtpl pro Servis.

**REV CRM** (apka „RES CRM“, `spfx/`): seznamy `REV_Cases, REV_Calculations, REV_Counters, REV_Settings, REV_AuditLog`,
skupiny `REV …`, kalkulace nabídky a PDF nabídky. **Sdílí s PRMIS seznamy `PRM_Partners` a `PRM_Catalog`** (dohoda v `docs/REVCRM.md`),
a vyhraný případ předává do PRMIS (předávací obálka, `BudgetDoc`). Proto musí v SELATO běžet obě aplikace na jednom webu.

## 5. Co je pevně zapsané pro Revoltum a musí se přepsat (nalezeno v PRMIS)

- Adresa webu: `core/settings.ts:239`, `features/settings/SettingsPage.tsx:151` a `:568` (odkaz na REVCRM.aspx),
  `webparts/projects/ProjectsWebPart.ts:84`, `data/sharepoint/documentQuery.ts:172`.
- Značka: název a ID řešení v `spfx/config/package-solution.json` (`PRM Revoltum`, id `5af5efa5-…`, firma „Revoltum Engineering & Services“) a v manifestech
  web partů; v REVCRM „RES CRM“, firma „REVOLTUM a.s.“. **SELATO potřebuje vlastní id řešení a jména** (jinak kolize s Revoltum, kdyby se balíček dostal do stejného katalogu).
- Barvy, písmo a logo: `ui/theme.ts`, `brand/`. Barvy SELATO jsou popsané v `cf-selato/CLAUDE.md` (modrá `#0030ac`, zelená `#00a600`, Poppins, claim
  SERVIS | ELEKTRO | AUTOMATIZACE); logo ze složky `Loga a grafický manuál`. Texty typu „Revoltujte s námi…“ nahradit.
- Zkratky firem v textech a číslování (např. „RES“, číslo případu `NS26-…` v REVCRM, projekt Režie `{RR}999`): potvrdit s Igorem, jak má číslování SELATO vypadat.
- Ukázkové uživatele a e-maily `@revoltum.cz` v mock datech a v komentářích (`mockData.ts` atd.): přepsat na vymyšlené. V ostrém kódu jsou jen v příkladech
  (`orderNotify.ts`, `roles.ts`, `types.ts`, `userAdmin.ts`), ověřit, že se nepoužívají jako výchozí hodnoty.
- Dalších zhruba 137 souborů zmiňuje „Revoltum“ nebo „RES“ (většinou texty a komentáře). Čeká systematický průchod.
- Číselníky a obsah ze zdrojového kódu (ne data, ale obsah specifický pro Revoltum): katalog 101 činností O&M `core/serviceCatalog.data.ts`,
  pravidla SLA, šablony plánů, limity schvalování (100 tis. / 500 tis. / 1 mil.), typy dokumentů, struktura složek projektu `core/folders.ts`, seznam zemí a stavů projektů.
  U každého rozhodnout: ponechat / upravit / vypustit. Servis zřejmě SELATO dává smysl (servis, elektro), ale potvrdit.

## 6. Doporučené etapy (každá se potvrzuje Igorem)

0. **Rozhodnutí a parametry** (viz kap. 7), založení webů a skupin v tenantu SELATO (to dělá správce SELATO, ne Claude).
1. **Jedno místo pro parametry** místo roztroušených řetězců (např. `src/config/entity.ts`: adresa webu, název aplikace, firma, odkazy, zkratky, barvy).
   Nejprve v PRMIS, pak totéž v REVCRM. Testy musí dál procházet.
2. **Značka SELATO:** téma, logo, názvy, ID řešení, texty. Ověřit v lokálním náhledu (`nahled/`) před nasazením.
3. **Číselníky:** přehled a úprava podle kap. 5.
4. **Čistý start dat:** ověřit, že kód neobsahuje žádná data Revoltum (klony je neobsahují: `vystupy`, `docs/import` nejsou v gitu). Mock data nahradit vymyšlenými.
5. **Sestavení balíčků** pro SELATO a instalace průvodcem (`npm run test`, `npm run package`; nasazení do katalogu aplikací dělá admin SELATO; v dialogu o Teams stačí „Deploy“).
6. **Účetnictví:** SELATO používá **POHODU**, ne Abru. Napojení na Abru (`integrations/abra-sync`, seznamy `PRM_Abra*`, záložka „Data z účetnictví“) se v SELATO nepoužije: vypnout nebo skrýt. Napojení na Pohodu je nová věc, nejdřív zadání s Igorem (co a jak se má přenášet, jen čtení), nic se nehádá.
7. **Předání:** přenos z Revoltum je jednorázový, dál samostatná instance (kap. 8).

## 7. Odpovědi Igora (17. 10. 2026)

1. **Název:** PRMIS zůstává. REV CRM se v SELATO přejmenuje na **SELCRM** (aplikace, řešení, texty; předponu seznamů a skupin `REV` řešit ve vlastním kroku, schéma jen přidávací).
2. **Weby a tenant:** upřesní se podle tenantu `selatosro2025.sharepoint.com`. Správce tenanta SELATO existuje (stejný model jako u Revoltum).
3. **Účetnictví:** SELATO používá **POHODU**. Abra se nepoužije (kap. 6, bod 6).
4. **Číslování:** projektů a nabídek je v SELATO jiné, ale ne příliš. Přesný tvar upřesní Igor v navazující relaci.
5. **Přesné hodnoty** (předpony, zkratky, adresy webů) doplní Igor až v navazující relaci, která je převezme a upraví.
6. **Role a skupiny** zůstávají stejné jako v Revoltum.
7. **Přenos:** jednorázově z Revoltum, potom samostatná instance. Průběžné přebírání oprav neplatí.

**Stále otevřené:** které moduly SELATO ponechá (Servis, stavební deník, harmonogram, cashflow firmy a vazba na `cf-selato`). Zatím se ponechávají všechny.

## 8. Co dělá navazující relace (SELATO)

Žádné sladění s Revoltum. Kopie je od teď vlastní: upravit parametry, značku a číselníky (kap. 5 a 6), přejmenovat REV CRM na SELCRM, odpojit Abru,
vyřešit otevřené body s Igorem a teprve potom sestavit a nasadit balíček. Původní repozitáře jen číst, když je třeba něco dohledat.
