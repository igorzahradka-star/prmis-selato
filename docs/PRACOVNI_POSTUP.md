# Paralelní vývoj: projektová část (PRMIS) a Servis

Cíl: dvě relace Claude Code pracují **současně** — jedna na PRMIS (projekty, objednávky, faktury, rozpočty, deník…), druhá na Servisu (lokality, požadavky, listy, plány, smlouvy) — a nepletou se. Výsledkem je stále **jeden balíček** (`prm-revoltum.sppkg`), který Igor nahrává ručně.

## 1. Relace, pracovní složky a větve

Jedna repozitářová historie, **dvě relace** v aplikaci Claude (vlákna ve skupině PMIS):

| Relace (vlákno) | Pracovní složka | Větev | Úloha |
|---|---|---|---|
| **PRMIS development** | `C:\Projekty\prm-revoltum` | `master` | vývoj projektové části **a vydání** (slučování, sestavení balíčku, verze) |
| **SERVIS development** (podřízené vlákno PRMIS development) | pracovní složka (worktree) vytvořená aplikací pod `C:\Projekty\prm-revoltum` | `servis` | vývoj Servisu |

Relace SERVIS se spouští z karty „SERVIS development“ (nabídne ji vlákno PRMIS development): aplikace jí sama založí **vlastní pracovní složku a větev** (git worktree). Relace v ní hned na začátku větev přejmenuje na `servis` (`git branch -m servis`) a v `spfx` provede `npm install`. **Relace nikdy nesahá do složky té druhé.**

Servisní větev vydává PRMIS relace: `git merge servis` v hlavní složce (viz oddíl 4). Po vydání si větev servis vezme změny z master (`git merge master` ve své složce).

## 2. Co komu patří

**Servis** (větev `servis`): `spfx/src/features/service/**`, `spfx/src/core/service*.ts` (+ testy), `spfx/src/core/serviceContract*.ts`, `serviceCatalog*.ts`, `servicePlan*.ts`, `serviceOverview.ts`, `data/sharepoint/spServiceRepository.ts`, `data/mock/mockServiceRepository.ts`, `data/sharepoint/spGeoCheck.ts` (sdílené s mapou), `docs/SERVIS*.md`, `tools/build_priloha_souboru.js`, `spfx/test-fixtures/contract/**`, seznamy `PRM_Service*` ve schématu.

**PRMIS** (větev `master`): vše ostatní (projekty, objednávky, faktury, rozpočty, deník, partneři, uživatelé, nastavení, Abra…).

**Sdílená místa** (smí se měnit **jen přidáním a v malých krocích**, aby se nekonfliktovalo): `ui/router.ts`, `ui/layout/navigation.ts`, `ui/layout/AppShell.tsx`, `webparts/prm/components/Prm.tsx`, `data/schema.ts`, `data/repositories.ts` (RepositorySet a rozhraní), `core/settings.ts`, `core/roles.ts`, `core/types.ts`, `data/mock/*` registrace. Neformátovat, nepřesouvat řádky, nemazat cizí.

Co Servis bere z PRMIS (rozhraní, nemění se bez domluvy): partneři (`repos.partners`), uživatelé a role, nastavení (`settings.service.*`), číslování, audit, skryté servisní projekty (objednávky, faktury a párování s Abrou jedou podle čísla souboru 10501…), motiv a společné komponenty (`ui/*`).

## 3. Verze, záznam změn a schéma

- **Verzi balíčku zvyšuje jen vydání** (hlavní složka). Funkční commity ve větvích verzi **nemění** (`package-solution.json`, `core/version.ts`).
- Záznam změn: větve zapisují do **vlastních souborů** — Servis do `docs/CHANGELOG_SERVIS.md` (sekce „Nevydáno“), PRMIS (master) do `docs/CHANGELOG_PRMIS.md`. Při vydání se obsah přepíše do `CHANGELOG.md` pod jednou verzí. Stejně `NAVAZANI.md` aktualizuje jen vydání.
- **Schéma:** větve **přidávají** definice seznamů (Servis jen `PRM_Service*`), ale `SCHEMA_VERSION` zvyšuje **vydání** jednou za sloučení (a v CHANGELOGu uvede „spustit Instalaci“). Plánovaná úprava: samostatné číslo schématu Servisu (`SERVICE_SCHEMA_VERSION`), aby se konflikty vůbec nevyskytovaly.

## 4. Vydání (hlavní složka, větev master)

1. `git merge servis` (PRMIS vývoj už je v master). Konflikty se řeší v sdílených místech; jinde se nevyskytují.
2. `cd spfx ; npm run build` (musí projít testy a lint bez chyb), zkontrolovat verzi v `AppManifest.xml` uvnitř balíčku.
3. Zvýšit verzi (`package-solution.json`, `core/version.ts`), zapsat `CHANGELOG.md` a `NAVAZANI.md`, commit, případně značka.
4. Balíček `spfx/sharepoint/solution/prm-revoltum.sppkg` nahraje Igor ručně (Deploy; v dialogu o Teams „I'll do it later“) a podle changelogu spustí Instalaci a diagnostiku.
5. Servisní větev srovnat s master: v její pracovní složce `git merge master`.

## 5. Pravidla pro relace

- Relace Servis nemění PRMIS soubory mimo sdílená místa; relace PRMIS nemění soubory Servisu. Potřebuje-li něco od druhé části, napíše to do `docs/PREDANI_MEZI_RELACEMI.md` (poznámka s datem a popisem), nepřepisuje cizí kód.
- Každá relace má vlastní náhled (`nahled/`): spouštět na **jiném portu** (Servis 4322 výchozí, PRMIS 4323 — v PowerShellu `$env:PORT=4323; node serve.js`).
- Před koncem práce relace commituje do své větve (česká zpráva s trailerem) a aktualizuje svůj „Nevydáno“ záznam.
- Údaje a hesla zákazníka nikdy nezpracovává (platí pravidla z `CLAUDE.md`).

## 6. Co zbývá připravit

1. Samostatný web part Servis na vlastní stránce (`Servis.aspx`) — vlastní spuštění, nabídka a oprávnění stránky; sdílené seznamy a kód zůstávají.
2. `SERVICE_SCHEMA_VERSION` a oddělené záznamy změn (viz výše).
3. Případně pozdější vyjmutí Servisu do vlastního balíčku nad sdíleným jádrem — jen pokud to bude nutné.
