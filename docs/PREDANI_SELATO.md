# Předání: PRMIS a REV CRM pro SELATO

Zapsáno 17. 10. 2026 (relace „migrace do SELATO“, zadavatel Igor Zahrádka). Tento dokument je
vstup pro Claude Code, který povede další vývoj v SELATO. Historie konverzací se nepřenáší, platí jen soubory.

## 1. O co jde (rozhodnuto Igorem)

- **SELATO s.r.o. je jiná entita s vlastním tenantem Microsoft 365**: `selatosro2025.sharepoint.com`
  (hlavní web `/sites/SELATOs.r.o`). Web part Řízení CF už tam běží (repo `C:\Projekty\cf-selato`, jiný projekt).
- **Přenáší se jen funkcionalita, číselníky a vazby. Žádná data** (projekty, partneři, objednávky, faktury,
  doklady z Abry, uživatelé, soubory, nic z `integrations/abra-sync/vystupy`).
- **Souběžný provoz:** kopie PRMIS a REV CRM poběží v SELATO i dál v Revoltum. Revoltum se vyvíjí dál ve svých repozitářích.
- **Postup A (zvolen):** samostatná kopie (fork) obou aplikací + tento balíček. Kód z Revoltum se do kopie přenáší ručně, vybranými změnami.
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
6. **Napojení na Abru, jen pokud ho SELATO chce:** vlastní účet jen pro čtení, vlastní prostředník a heslo mimo kód. Jinak funkci Abry vypnout nebo skrýt.
7. **Předání a údržba:** postup přenosu oprav z Revoltum (viz kap. 8).

## 7. Otevřené otázky na Igora (zatím nezodpovězeno)

1. Název aplikací v SELATO (zůstane PRMIS a „RES CRM“, nebo vlastní, např. „PRM SELATO“ a „SELATO CRM“)?
2. Adresa a názvy webů v tenantu SELATO (projektový web, web pro důvěrná finanční data, stránka REVCRM) a kdo je správce tenanta?
3. Používá SELATO Abru (Flexi)? Pokud ne, funkce Abry se vypne.
4. Které moduly SELATO chce: Servis ano/ne, stavební deník, harmonogram, cashflow firmy (vazba na `cf-selato`)?
5. Číslování projektů a obchodních případů v SELATO (předpona, zkratka firmy).
6. Zůstávají role a skupiny stejné (PM, asistent, vedení, finance, správce servisu, dispečer, čtenář, administrátor)?
7. Jak často a kým se mají opravy z Revoltum přenášet do SELATO?

## 8. Přenos změn mezi Revoltum a SELATO

Kopie se postupně rozejdou. Doporučení: v kopii držet všechny úpravy pro SELATO v malém počtu míst (kap. 6, bod 1), aby šly opravy z Revoltum přebírat
přes `git cherry-pick` nebo ručně. Při přebírání číst `CHANGELOG.md` a `docs/DENIK.md` originálu. Zdroj pravdy o pravidlech zůstává `CLAUDE.md` v kopii (upravit až po schválení Igorem).
