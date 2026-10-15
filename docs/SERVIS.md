# Modul Servis — zadání, stav a rozhraní pro externí web (14. 10. 2026)

## Cíl
Samostatná funkcionalita v PRMIS: **lokality → zařízení → servisní požadavky → servisní listy**. Využívá stejné objednávky, fakturaci, dokumenty a schvalování
jako projekty, ale servisní zakázky se **nezobrazují v přehledu projektů**. Servisák (externí dodavatel bez Microsoftu) zapisuje provedení v samostatném
webu / mobilní aplikaci (paralelní session). V PRMIS je evidence, stav, fakturace zákazníkovi a přijaté faktury dodavatelů.

## Rozhodnutí (Igor, 14. 10. 2026)
- **Struktura:** lokalita (číslo po desítkách: 10500, 10510…) → zařízení (FVE, BESS…; 10501–10509 pod lokalitou 10500, 10511… pod 10510).
  **Zařízení = servisní zakázka**: vlastní číslo, složka (`General/02_SERVIS/…`), smlouva a fakturace. V aplikaci je to **skrytý projekt typu Servis**
  s omezeným přístupem (role Servisu, vedení, administrátor).
- **Role:** **Správce servisu** (spravuje lokality a zařízení, kontroluje provedení, odemyká fakturaci, schvaluje krok „PM“ objednávek) a
  **Dispečer** (zapisuje požadavky, zakládá servisní listy, objednává). Běžní PM a asistenti Servis nevidí. Vedení jen čte.
- **Tok servisního listu:** Naplánováno → Dodavatel objednán → Provedeno (zapisuje dodavatel) → **K fakturaci** (po kontrole správcem) → Vyfakturováno → Uzavřeno
  (nebo Zrušeno). Stav požadavku se odvozuje od listů (Přijato / Zpracovává se / Vyřešeno; Zamítnuto ručně).
- **Servisní smlouva:** dokument s komerčními podmínkami uložený u lokality/zařízení; v aplikaci jen platnost od–do, odkaz a poznámka (bez strukturovaných cen).
- **Fakturace:** zákazníkovi (lokalitě) jednak **pravidelný paušál**, jednak **jednotlivé činnosti** (z servisního listu). Dodavatelé fakturují nám (přijaté faktury přes Abru).
- **Schvalovací limity Servisu** se upřesní později; zatím platí stejné limity jako u projektů, krok „PM“ schvaluje správce servisu.

## Roční plán (0.53.0.0)
Plán je na záložce Plán údržby: položky (činnost, měsíc nebo datum, plánovaná/nahodilá) pro lokalitu nebo soubor a rok; šablony FVE/BESS/lokalita v Nastavení → Servis; kopie do dalšího roku; převod na požadavek. Plánovaná činnost = v paušálu (z plánu vzniká požadavek typu Preventivní prohlídka).

## Odloženo (rozhodnuto 15. 10. 2026)
- **Příchozí e-maily** (sdílená schránka servis@revoltum.cz → záložka „Příchozí“ → dispečer vytvoří požadavek nebo odmítne): Igor chce, **vrátíme se k tomu později**. Návrh: schránku zakládá administrátor M365, přenos e-mailů do seznamu `PRM_ServiceInbox` zajistí Power Automate (standardní konektory), aplikace jen ukáže frontu a převede e-mail na požadavek.
- **Schvalovací limity Servisu** (kdo od jaké částky schvaluje; vedoucí servisu schvaluje, dispečer připravuje) — Igor upřesní.

## Aktuální stav
Návrh dalšího vývoje je v `docs/SERVIS_NAVRH.md` (schválen 15. 10. 2026). **Etapa 1 hotová (0.47.0.0):** pojem „soubor“, GPS poloha a záložka Mapa (schéma 26). **Hotovo navíc (0.49.0.0):** Mapa servisu v nabídce, složky lokalit a souborů, servisní list na celou lokalitu, velikost fotek v Nastavení. **Etapa 3 hotová (0.48.0.0):** druh listu (plánovaná/nahodilá), doklad o provedení (popis / fotky / ověření na dálku), SLA indikace s lhůtami v Nastavení → Servis (schéma 27). Dále: etapa 2 checklist a smlouva se sazbami (čeká na první návrh smlouvy od Igora), etapa 4 portál dodavatele (před ní rozhodnout o hostingu).

## Hotovo (0.45.1.0)
- Role Správce servisu a Dispečer (SharePoint skupiny `PRM Správci servisu`, `PRM Dispečeři servisu` — vytvoří Instalace), práva `core/service.ts`.
- Číslování a validace lokalit a zařízení, složky, stav smlouvy; stránka **Servis** (nabídka jen pro oprávněné) se třemi záložkami: Požadavky, Servisní listy, Lokality a zařízení.
- Servisní požadavek (číslo `SPO-RRRR-NNNN`) a servisní list (`SL-RRRR-NNNN`), tok přechodů `core/serviceJobs.ts` (testováno), detail listu s tlačítky podle stavu a role,
  vazba na objednávku dodavateli a na podklad pro fakturaci (výběr existujícího nebo založení nového), audit.
- Servisní projekty skryté v přehledech projektů, objednávkách a fakturaci pro uživatele bez práv Servisu; objednávky/faktury servisních projektů smí vystavovat jen role Servisu.
- Přehled nahoře na stránce Servis a e-mailová upozornění správcům servisu (nový požadavek, provedení ke kontrole).
- Schéma 25: seznamy `PRM_ServiceSites`, `PRM_ServiceDevices`, `PRM_ServiceRequests`, `PRM_ServiceJobs`.

## Zbývá / další etapy
1. **Pravidelný paušál** podle smlouvy (plán fakturace, cashflow Servisu) — druhá etapa.
2. **Schvalovací řetěz a limity Servisu** (Igor upřesní).
3. **Externí web a mobilní aplikace pro servisáka** — paralelní session (viz níže).
4. Přijaté faktury dodavatelů k servisnímu listu přes Abru (zakázka = číslo zařízení, např. 10501); stejný tok jako Data z účetnictví u projektů.
5. Zavedení stávajících lokalit a zařízení (zatím ručně), **automatické zakládání složek lokality a zařízení** ve složce 02_SERVIS (zatím se do dialogu vkládá odkaz na existující složku), další upozornění (např. dodavateli o novém listu), přehledy a grafy.
6. **Oprávnění v SharePointu:** seznamy `PRM_Service*` omezit na skupiny Servisu (aplikace skrývá, skutečnou ochranu dělá SharePoint — viz CLAUDE.md, kap. 4);
   servisní projekty se omezují automaticky při založení zařízení.

## Rozhraní pro externí web / mobilní aplikaci (podklad pro paralelní session)
Externí servisák **nemá účet Microsoftu**, proto nesmí číst ani zapisovat SharePoint přímo. Je potřeba **prostředník** (malý web s vlastním přihlášením), který se do SharePointu
hlásí vlastní identitou a servisákovi ukáže **jen jeho listy**. Firma zatím nemá předplatné Azure — hosting a způsob přihlášení se musí rozhodnout (viz zadání Igorovi).

**Co servisák vidí a dělá (návrh):**
1. Přihlášení (jednorázový odkaz/kód na e-mail, bez hesla) → seznam **svých** servisních listů ve stavu *Dodavatel objednán* (a *Provedeno* vrácených k doplnění).
2. Detail listu: číslo, lokalita a zařízení (adresa, kontakt), zadání práce, plánovaný termín, číslo objednávky.
3. **Zápis provedení** (jednoduchý formulář): provedeno dne, co se provedlo (povinné), odpracované hodiny, použitý materiál, **fotky** → list přejde do stavu *Provedeno*.
4. Opravy: když správce list vrátí, servisák vidí poznámku a může provedení doplnit znovu.

**Datová smlouva (seznam `PRM_ServiceJobs`):** čte `JobNumber`, `JobStatus`, `SiteNumber`, `DeviceNumber`, `Title` (Title), `Description`, `PlannedDate`, `SupplierId`/`SupplierName`, `OrderNumber`, `CheckNote`;
zapisuje **jen** `WorkReport`, `Hours`, `Material`, `PhotosUrl`, `DoneAt` a `JobStatus` (z *Dodavatel objednán* na *Provedeno*). Pravidla přechodů jsou v `spfx/src/core/serviceJobs.ts`
(`applyJobAction('report', …)`) — prostředník je musí dodržet stejně (ověření v jeho vrstvě, ne jen v prohlížeči). Příslušnost listu k servisákovi se určuje podle `SupplierId` (partner ze seznamu `PRM_Partners`);
identita servisáka (e-mail kontaktu partnera) se musí ověřit před zobrazením. Fotky se ukládají do složky zařízení v `02_SERVIS` a do `PhotosUrl` jde odkaz.

**Bezpečnost:** žádné přihlašovací údaje v repozitáři ani v prohlížeči; prostředník dostane k SharePointu jen nejmenší nutná práva (čtení `PRM_ServiceJobs` a zápis vyjmenovaných sloupců); servisák nesmí vidět ceny ani jiné lokality než své listy.

## Smlouvy se zákazníkem (zadání Igor, 15. 10. 2026)

Podklady: složka `General/02_SERVIS/SERVIS - PODKLADY/RES Smlouvy VZORY` (šablony Wordu pro docxtpl, katalog činností `res_om_katalog_v01.json`, referenční generátor `render_smlouvy.py`, ukázkový vstup).

Rozhodnutí: smlouva je vždy k jedné lokalitě (číslo = číslo lokality + pořadí, např. `10500-01`); přílohy jsou samostatné dokumenty (Příloha lokality + Příloha pro každý soubor); dodatek je další dokument ke smlouvě; smlouva má verze (přidání, odebrání, změny; verze = snapshot dat); uloží se do složky lokality; údaje o objednateli se dotáhnou z ARES podle IČO (rejstřík, jednající osoby; bankovní účet ručně); kontroly s závažností „chyba“ blokují generování (P1 ≤ 72 h, doba ≥ 10 let, autorizace OEM pro BESS); náhled v aplikaci převodem Wordu na HTML, rozhodující je Word.

Etapy: **A hotovo (0.55.0.0)** — katalog + checklist lokality + technická pole; **B** — záložka Smlouvy, verze, kontroly, ARES; **C** — vykreslení Wordu (docxtpl syntaxe v prohlížeči: JSZip + vlastní vyhodnocení if/for/filtr `kc`), uložení do složky, porovnání s ukázkou (složka „UKAZKA OM smlouvy“ zatím chybí); **D** — roční plán z checklistu, vazba požadavků na smlouvu. Šablona Přílohy souboru a šablona dodatku se musí doplnit (zatím je jen Příloha lokality a rámcová smlouva). Zhotovitel ve vzoru je „s.r.o.“ — ověřit právní formu RES.
