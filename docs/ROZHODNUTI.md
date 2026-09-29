# Rozhodnutí zadavatele

Zaznamenané odpovědi na otevřené otázky. Zdroj pravdy pro další fáze —
když se něco změní, uprav řádek a doplň datum.

---

## Fáze 0

| Datum | Otázka | Rozhodnutí |
|---|---|---|
| 11. 9. 2026 | Kde má projekt ležet | `C:\Projekty\prm-revoltum`, mimo OneDrive. Důvod: `node_modules` má přes 100 000 souborů a synchronizoval by se celé firmě přes sdílenou knihovnu. |
| 11. 9. 2026 | Node.js | Nainstalována verze 22.23.2 přes `winget install OpenJS.NodeJS.22`. SPFx 1.23 jinou hlavní verzi nepodporuje. |

---

## Fáze 1 (zodpovězeno předem)

| Datum | Otázka | Rozhodnutí |
|---|---|---|
| 23. 9. 2026 | Formát čísla projektu (ot. 1) | **`{RR}{NNN}` bez pomlčky — `26001`, `26002`…** Odpovídá číslům, která RES používá na složkách projektů. (21. 9. bylo omylem zapsáno `26-014` podle návrhu v zadání; zadavatel myslel „stejný jako u nás".) Od jakého čísla navázat se nastaví v *Nastavení* (počáteční hodnota čítače) — konkrétní hodnotu doplníme při zakládání číselné řady. |
| 21. 9. 2026 | Šablona složek projektu (ot. 2) | Jedna společná šablona pro všechny typy projektů (ne různá podle typu). Zůstává ale editovatelná v *Nastavení*, kdyby se to v budoucnu změnilo. |
| 21. 9. 2026 | Import stávajících projektů (ot. 11) | Žádný Excel k dispozici — Igor dodá printscreen složky se seznamem projektů (čísla a názvy). Import/navázání číslování se podle toho navrhne ručně, ne přes hromadný import z Excelu. |
| 21. 9. 2026 | Terminologie: „zakázka" vs. „projekt" | Aplikace nikde nepoužívá slovo „zakázka" — správný a jediný pojem je **projekt** (viz kap. 2, „Cíl aplikace"). Přejmenováno v celém kódu, UI i dokumentaci (route `#/zakazky` → `#/projekty` apod.). |
| 22. 9. 2026 | Kdo smí mazat projekt | **Jen administrátor PRM.** Projektový manažer smí projekt založit a upravit, ale ne smazat — má na to stav *Storno*. Maže se do koše SharePointu (93 dní na obnovu), složka projektu s dokumenty zůstává a do `PRM_AuditLog` se zapíše kdo, kdy a proč. |
| 23. 9. 2026 | Číslo projektu Režie | Tvar `{RR}999` — **26999, 27999, jedna Režie na rok**, součást běžné řady projektů (upřesněno zadavatelem; původní návrhy `{RR}-000` i `{RR}-999` byly špatně). Číslo se nebere z čítače, takže Režie nikomu neukradne pořadí. |
| 22. 9. 2026 | Schvalovací limity objednávek (ot. 3, částečně) | Zadány částky **100 000 / 500 000 / 1 000 000 Kč** bez DPH (PM / vedení / jednatel). Uloženy jako výchozí hodnoty v *Nastavení → Schvalování*, kde se dají kdykoli změnit. **Jména schvalovatelů a celé workflow zadavatel upřesní ve Fázi 2.** |
| 23. 9. 2026 | Správa uživatelů | Aplikace **nezakládá uživatelské účty** — ty vznikají v Microsoftu 365 a spravuje je správce tenanta. Stránka *Uživatelé a role* jen přiděluje role, tedy členství ve skupinách SharePointu. Důvod: vlastní seznam uživatelů by se rozešel s tím, co SharePoint skutečně povolí. |
| 23. 9. 2026 | Adresa tenanta (ot. 9, částečně) | Tenant je **https://revoltum.sharepoint.com**. Existující firemní web: `/sites/RevoltumEngineeringServices` (*Revoltum Engineering & Services*, soukromá skupina M365) s knihovnou **Dokumenty** (interně `Shared Documents`), ve které jsou složky CORPORATE GOVERNANCE, CRM, FINANCE… Tahle knihovna je i zdrojem lokální OneDrive cesty zadavatele. **Zbývá určit, jestli PRM poběží na tomhle webu, nebo na vlastním** — a kde přesně mají vznikat složky projektů (ot. 10). |
| 23. 9. 2026 | Kde poběží PRM (ot. 9) | **Vlastní web `/sites/PRM`**, ne stávající firemní web. Důvod: oprávnění k PRM se nastaví nezávisle na firemních dokumentech a 21 seznamů aplikace nezapleví web, který se používá k jiné práci. Důvěrná část zůstává na samostatném webu `/sites/PRM-Finance` s vlastními oprávněními (požadavek zadání, kap. 4.3). |
| 23. 9. 2026 | Kam zakládat složky projektů (ot. 10, částečně) | **Tam, kde projekty leží dnes** — do knihovny **Dokumenty** na webu `/sites/RevoltumEngineeringServices`. Lidem tak dál funguje synchronizace přes OneDrive a projekty nehledají na dvou místech. Aplikace umí mít složky na jiném webu, než kde běží sama (`folders.siteUrl` v Nastavení). Kořenová složka je **`General/01_PROJEKTY`**, projekty v ní leží přímo — **bez mezipatra podle roku**. Ověřeno na skutečné složce. |
| 23. 9. 2026 | Import stávajících projektů (ot. 11) | Importuje se **ze složek v knihovně**, ne z Excelu. K 23. 9. 2026 je v `01_PROJEKTY` pět projektů (26001–26005) a pomocná složka `00_Project tools`, která se přeskočí. Po importu čítač navazuje na 26006. Import nepřejmenovává ani nepřesouvá složky. |
| 23. 9. 2026 | Kde poběží PRM — **změna** | Igor má správcovská práva jen k webu *Revoltum Engineering & Services*, ne k celému SharePointu. **Nové weby `/sites/PRM` a `/sites/PRM-Finance` proto nevzniknou.** Aplikace i jejích 21 seznamů poběží na existujícím firemním webu. Ruší se tím rozhodnutí z dopoledne 23. 9. o vlastním webu. Web PRM-Finance se odkládá na Fázi 5 a bude na něj potřeba správce tenanta. |
| 23. 9. 2026 | Katalog aplikací | Jediné, co Igor vlastními právy neudělá. Požádá správce o **katalog aplikací pro jeden web** (`Add-SPOSiteCollectionAppCatalog`) — pak si další verze nahrává sám. Náhradní varianta: správce nahraje balíček do firemního katalogu, ale pak ho musí nahrávat při každé aktualizaci. Text požadavku: `docs/POZADAVEK-NA-SPRAVCE.md`. |
| 29. 9. 2026 | Nasazení proběhlo | Aplikace běží na webu `/sites/RevoltumEngineeringServices`. Instalace založila **17 seznamů** (rozdíl proti dřívějším 21 jsou 4 finanční seznamy pro budoucí web PRM-Finance, které se přeskočily). Verze schématu 2. Jediná nevyřízená položka diagnostiky je *Web PRM-Finance* — vědomě odloženo na Fázi 5. |
| 29. 9. 2026 | Struktura knihovny Dokumenty (zjištěno) | Složka `General` obsahuje: `00_OBCHODNI PRILEZITOSTI`, `01_PROJEKTY`, `02_SERVIS`, `05_JEDNANI KONFERENCE MATERIÁLY`, `6_DOKUMENTACE`. **`02_SERVIS` bude aplikace jednou potřebovat** — zatím mimo rozsah. Uvnitř `00_OBCHODNI PRILEZITOSTI` je `00_TOOLS` (šablony k nabídkám, aktualizují se, složka musí zůstat), `CLOSED` (nabídky, které nedopadly) a složky otevřených nabídek ve tvaru **`N26_0002 Název`** (N = nabídka, rok, podtržítko, čtyřmístné pořadí). **Návrh, jak nabídky vést v aplikaci, čeká na potvrzení zadavatele.** |
| 29. 9. 2026 | Číslování nabídek a projektů jsou dvě oddělené řady | Nabídky se číslují **`N26_0002`** (N = nabídka, dvojčíslí roku, podtržítko, čtyřmístné pořadí, řada se každý rok začíná od jedničky) — formát, který už RES používá, aby to lidem něco říkalo (rok a pořadí). **Vyhraná nabídka dostane nové číslo projektu, číslo nabídky se nekopíruje.** Důvod: nabídek je násobně víc než projektů a v řadě projektů by zely díry, které by svádělo hledat. Číslo původní nabídky si aplikace pamatuje u projektu. Navazování čítače nabídek se odvodí z existujících složek (jako u projektů). |
| 22. 9. 2026 | Pořadí prací | Nejdřív dodělat Fázi 1, teprve pak začít Fázi 2 (objednávky). Důvod: Fáze 2 staví na projektu Režie a na složkách, kam se ukládají PDF objednávek. |

## Zatím nezodpovězené

Tyto otázky blokují nebo ovlivní další práci. U každé je uvedeno,
kdy nejpozději ji potřebujeme znát.

| # | Otázka | Potřeba ve fázi | Proč na tom záleží |
|---|---|---|---|
| 8 | Kdo je správce Microsoftu 365 a může nahrát aplikaci do katalogu aplikací | **0** | Bez toho se aplikace nedostane na SharePoint a Fázi 0 nelze otestovat v ostrém provozu. |
| 9 | Adresa tenanta (`https://<firma>.sharepoint.com`) a adresy webů PRM a PRM-Finance | **0** | Potřebné pro ladění i pro nastavení web partu. |
| 10 | Kde přesně leží knihovna projektů (web, knihovna, kořenová složka) | 1 | Cíl, kam aplikace zakládá složky. |
| 3 | Limity schvalování objednávek a jména schvalovatelů | 2 | Peníze a oprávnění — nelze odhadovat. |
| 4 | Vzory PDF (objednávka, podklad pro fakturaci, protokol) a fakturační údaje RES (IČO, DIČ, e-mail účtárny) | 2 | Dokumenty jdou ven k dodavatelům a zákazníkům. |
| 5 | Účetní systém a formát exportu skutečných plateb | 3 | Určuje podobu importu skutečnosti do cashflow. |
| 6 | Kategorie rozpočtu, prahy semaforu, minimální marže | 3 | Výchozí hodnoty v aplikaci jsou zatím jen návrh. |
| 7 | Struktura reportu pro finančního ředitele holdingu, perioda odevzdání, kategorie firemního CF | 5 | Report se má přizpůsobit šabloně holdingu. |
