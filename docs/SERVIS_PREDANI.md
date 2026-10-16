# Servis — předávací dokument pro samostatnou relaci (stav k 16. 10. 2026, balíček 0.64.0.0, schéma 35)

Čti spolu s `CLAUDE.md`, `docs/PRACOVNI_POSTUP.md` (větev `servis`, vlastnictví souborů), `docs/SERVIS.md` (zadání a rozhodnutí) a `docs/SERVIS_NAVRH.md`.

## 1. Co Servis obsahuje

Nabídka **Servis** (`ui/layout/navigation.ts`): Servis (požadavky + servisní listy), Kalendář (týden / měsíc / rok), Přehled požadavků, Lokality (se soubory, checklist, složky), Servisní plány (roční plány + šablony), Správa smluv (smlouvy se zákazníky, verze, kontroly, Word; údaje smluv), Mapa servisu. Role: správce servisu, dispečer, vedení (čte), čtenář (čte, bez smluv), administrátor.

Tok: **lokalita → soubor (FVE, BESS…) → požadavek → servisní list** (objednávka dodavateli, provedení, kontrola, fakturace). Požadavek jde uzavřít bez listu (jednoduché úkony). Smlouva patří jedné lokalitě (číslo `10500-01`), má verze (smlouva, dodatky; stavy Návrh → K podpisu → Podepsaná → Nahrazená) a generuje Word z šablon RES.

## 2. Kde je kód

| Oblast | Soubory |
|---|---|
| Čistá logika (s testy) | `core/service.ts` (práva, číslování, složky), `serviceJobs.ts` (tok listu, požadavek), `serviceSla.ts`, `servicePlan.ts` + `servicePlanCatalog.ts`, `serviceCatalog.ts` + `serviceCatalog.data.ts` (katalog 101 činností O&M, verze 0.1), `serviceContract.ts` (smlouva, kontroly, verze, pokrytí), `serviceContractSettings.ts`, `serviceContractRender.ts` (kontext šablon), `serviceOverview.ts` (kalendář, přehled požadavků), `serviceMap.ts`, `partnerKinds.ts`, `geo.ts` |
| Data | `data/sharepoint/spServiceRepository.ts`, `data/mock/mockServiceRepository.ts`, rozhraní `IServiceRepository` v `data/repositories.ts`, seznamy `PRM_Service*` v `data/schema.ts`, `data/ares.ts` (ARES: firma, rejstřík, jednatelé), `spGeoCheck.ts` |
| Obrazovky | `features/service/*` (ServicePage, ServiceSitesPage, ServiceCalendarPage, ServiceRequestsPage, ServicePlansPage + ServicePlanTab, ServiceContractsPage + ContractsTab + ContractEditor + ContractSettingsEditor + ContractPreviewPanel, SiteChecklistPanel, ServiceMap…), `features/map/*` (sdílená mapa) |
| Word | `features/service/docxTemplate.ts` (docxtpl v prohlížeči: JSZip + Nunjucks), `contractDocuments.ts`; šablony ve SharePointu `General/02_SERVIS/00_SERVIS - PODKLADY/RES Smlouvy VZORY`; `tools/build_priloha_souboru.js`; testovací podklady `spfx/test-fixtures/contract/` |

## 3. Seznamy ve SharePointu (`PRM_Service*`)

`PRM_ServiceSites` (lokality, technická pole, `ChecklistJson`), `PRM_ServiceDevices` (soubory), `PRM_ServiceRequests` (vč. uzavření bez listu), `PRM_ServiceJobs`, `PRM_ServicePlan`, `PRM_ServiceContracts`, `PRM_ServiceContractVersions` (snapshot `SnapshotJson`, `DocumentsJson`). Nastavení Servisu (SLA, šablony plánů, **údaje smluv**) je v `PRM_Settings` (`settings.service`). Schéma se mění jen přidáním; po změně zvýšit `SCHEMA_VERSION` (ve vydání) a v záznamu změn uvést „spustit Instalaci“.

## 4. Rozhraní k PRMIS (nemění se bez domluvy)

- **Partneři** (`repos.partners`): zákazník lokality, dodavatelé servisu (příznak `IsServiceSupplier`).
- **Skrytý servisní projekt** u souboru (číslo 10501…) a lokality (společné zásahy): nese objednávky, faktury a **párování s Abrou podle čísla**. Zakládá `projects.ensureServiceProject`. Servisní projekty se nezobrazují v přehledu projektů.
- **Objednávky a schvalování** (`core/orderWorkflow.ts`), **nastavení** (`repos.settings`), **role** (`core/roles.ts`), **číslování** (SPO, SL), **audit**, **složky** (`settings.folders`, `spFolders`, `spLibrary`), motiv a komponenty (`ui/*`).

## 5. Hotovo a odloženo

Hotovo: lokality a soubory, mapa, požadavky a listy, SLA (indikace), roční plány (ze šablon, z checklistu, ze smlouvy), kalendář, přehled požadavků, uzavření bez listu, checklist lokality + katalog O&M, smlouvy (seznam, editor, verze, dodatky, kontroly s blokací, ARES, Word z šablon, náhled, platnost u souborů, pokrytí požadavků), Příloha souboru.

Zbývá / odloženo: **šablona dodatku**; příchozí e-maily servis@revoltum.cz (Power Automate + `PRM_ServiceInbox`); schvalovací limity Servisu (Igor upřesní); portál dodavatele (rozhodnout o hostingu); smlouvy s dodavateli; omezení práv seznamů `PRM_Service*` v SharePointu; šablony plánů pro MVE/kogeneraci jsou jen z checklistu.

## 6. Jak se zkouší

- **Mock náhled:** `cd nahled ; node build.js` (nejdřív `npx heft test` — čte `lib`), pak `node serve.js` (port 4322; `$env:PORT=…` pro jiný). Pro šablony smluv zkopírovat `.docx` do `nahled/dist/templates/`. Ukončit server přes PowerShell (Get-NetTCPConnection → Stop-Process). Po sestavení: `fetch('/nahled.js',{cache:'reload'}); location.reload()`. Když je okno úzké, `resize_window`.
- **Testy:** `cd spfx ; npx heft test` (kompiluje i lint; ~2–3 min). **Balíček:** `npm run build` — po sestavení **ověřit verzi uvnitř** `.sppkg` (`AppManifest.xml` → `Version`).
- **Ostrý SharePoint:** Igor nahrává balíček ručně a hlásí chyby; do tenantu se **nikdy nepřihlašujeme**.

## 7. Poučení z práce (úskalí)

- Delší příkazy (test + build) spouštět samostatně nebo na pozadí a ověřit výsledek; 10min limit nástroje zabije příkaz uprostřed.
- Víceřádkové úpravy souborů dělat nástrojem Write/Edit nebo skriptem uloženým do souboru; heredoc a `node -e` kazí zpětná lomítka a regulární výrazy.
- Kontrola, že se zápis (např. poloha) skutečně uložil, čte položku zpět (`geoMismatch`).
- Šablony Wordu se vykreslují beze změny; shoda s referenčním generátorem je hlídaná testem `docxTemplate.test.ts` (text ukázky).
