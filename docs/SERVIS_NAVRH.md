# Servis O&M — návrh řešení (verze 1, 15. 10. 2026)

**Stav: NÁVRH K SCHVÁLENÍ. Nic z toho zatím není naprogramováno.** Kód vznikne až po výslovném souhlasu Igora s tímto dokumentem.
Vychází ze studie „REVOLTUM – zadání: návrh servisní O&M aplikace“ a z odpovědí Igora (kola 1 a 2). Navazuje na stávající základ modulu Servis (0.45.1, popis v `docs/SERVIS.md`).

## 0. Rozhodnutí, která už padla
- Hierarchie: **lokalita** (10500) → **soubor** (10501, 10502 … FVE, BESS; dříve „zařízení“). Zásahy se vážou na lokalitu **nebo** na soubor.
- Složky: `General/02_SERVIS/<číslo lokality> <název>/…`, vytváří je tlačítko při založení lokality a souboru. Přístup jen Servis a vedení.
- **Smlouva** je dokument, který generuje Revoltum Engineering & Services pro **interního zákazníka**. Vzniká z **checklistu lokality**; podle prvního návrhu smlouvy (dodá Igor) se checklist sestaví. Sazby jsou součástí checklistu s platností od–do.
- Práce je buď **v paušálu** (plánovaná: revize, pravidelné), nebo **mimo paušál** (nahodilá: porucha, havárie). Nikdy půl na půl; přesah se zadá jako nový požadavek mimo paušál.
- **SLA:** reakční časy podle typu činnosti jsou parametr smlouvy; aplikace měří čas od podání požadavku do vyřešení a **jen indikuje**, žádné sankce.
- **Doklad o provedení:** stačí jedno z: fotka, textový popis, vzdálené ověření dispečerem.
- **Přijaté faktury:** Digitoo (vytěžení a schválení, jen workflow) → Abra (zaúčtování, **zdroj pravdy**).
- **Dodavatel nepůjde do SharePointu**, má samostatný portál (požadavek přijde e-mailem, vidí jen své a uzavřené, potvrzuje přijetí a hotovo).
- Role: **Dispečer** (zadává, objednává), **Správce servisu** (administrativní: faktury, kontrola, správa lokalit). Dnes jedna osoba, role zůstávají oddělené.
- Limity objednávání se **nastavují v Nastavení**, hodnoty doplní Igor později.
- Fotky z aplikace se **zmenšují při ukládání** (celá aplikace, projekty i servis).

---

## 1. Přehled konceptu
Servis je samostatná část PRMIS vedle projektů. Každá lokalita má smlouvu, plán údržby a historii zásahů. Zásah začíná **požadavkem** (porucha, plánovaná revize, žádost zákazníka), z něj vznikne **servisní list** (pracovní příkaz s objednávkou dodavateli). Dodavatel list dostane e-mailem a v portálu ho potvrdí a uzavře dokladem o provedení. Správce servisu provedení zkontroluje, list jde k fakturaci interními zákazníkovi a přijaté faktury dodavatelů se párují s listem přes Abru.

## 2. Mapa procesů
1. **Příprava lokality:** založení lokality a souborů → složky → checklist → návrh smlouvy → podpis → plán údržby.
2. **Plánovaná údržba:** plán vygeneruje požadavek se stavem „plánovaná“ k termínu; list je v paušálu.
3. **Nahodilý zásah:** dispečer zapíše požadavek (lokalita nebo soubor, typ, priorita) → reakce (SLA se měří) → list mimo paušál.
4. **Provedení:** objednávka dodavateli → dodavatel potvrdí přijetí → přidělí technika → provede → doloží (fotka, popis nebo vzdálené ověření) → označí „hotovo“.
5. **Kontrola a převzetí:** správce zkontroluje a převezme, nebo vrátí dodavateli s důvodem.
6. **Ekonomika:** paušál = pravidelný podklad k fakturaci podle smlouvy; mimo paušál = podklad z konkrétního listu. Přijaté faktury: Digitoo → Abra → párování (číslo souboru = zakázka v Abře).
7. **Uzavření:** vyfakturováno → uzavřeno. Požadavek se vyřeší, když jsou uzavřeny všechny jeho listy.

Odděluji **technický stav** (Naplánováno → Objednáno → Přijato dodavatelem → Provedeno → Převzato) a **ekonomický stav** (Nefakturuje se / K fakturaci / Vyfakturováno / Uzavřeno). Dnes je to jeden společný stav; rozdělení umožní například převzít práci technicky dřív, než se fakturuje.

## 3. Datový model (seznamy SharePointu; vše přidávacím způsobem)
Stávající seznamy zůstávají (`PRM_ServiceSites`, `PRM_ServiceDevices` → v UI „soubory“, `PRM_ServiceRequests`, `PRM_ServiceJobs`). Technické názvy sloupců se nepřejmenovávají (kvůli kompatibilitě); mění se jen popisky v aplikaci na „soubor“.

| Seznam | Účel | Nové / klíčové sloupce |
|---|---|---|
| PRM_ServiceSites | lokalita | **Customer** (interní zákazník, vazba na partnera), adresa, kontakt na místě |
| PRM_ServiceDevices | soubor | typ (FVE, BESS…), výkon, uvedení do provozu |
| **PRM_ServiceContracts** (nový) | smlouva lokality | lokalita, zákazník, platnost od–do, stav (Návrh / Podepsáno / Ukončena), **Checklist (JSON)**, odkaz na dokument, verze |
| **PRM_ServiceRates** (nový) | sazby z checklistu | smlouva, kategorie činnosti, jednotka (hod., výjezd, paušál/rok), cena, platnost od–do (historie = nové řádky, staré se nepřepisují) |
| **PRM_ServicePlans** (nový) | plán údržby | lokalita nebo soubor, činnost, četnost, příští termín, v paušálu |
| PRM_ServiceRequests | požadavek | vazba na lokalitu **nebo** soubor, typ, priorita, **čas přijetí / první reakce / vyřešení**, SLA reakce (z typu) |
| PRM_ServiceJobs | servisní list | druh (**Plánovaná / Nahodilá**), **přijato dodavatelem**, technik, **druh dokladu** (Fotka / Popis / Vzdálené ověření), ověřil (dispečer), technický stav, ekonomický stav, vazby objednávka/faktura |
| PRM_ServicePortalAccess (nový, podle varianty B) | přístup dodavatele | kontakt partnera, e-mail, platnost, poslední přihlášení (bez hesel) |

Všechny seznamy mají verzování a zápisy jdou do PRM_AuditLog. Schéma se zvýší na 26 (další jen přidávací).

## 4. Role a práva
| Činnost | Admin | Vedení | Správce servisu | Dispečer | Běžný PM / asistent |
|---|---|---|---|---|---|
| Číst Servis | ano | ano (čtení) | ano | ano | ne |
| Založit lokalitu, soubor, smlouvu, sazby | ano | ne | ano | ne | ne |
| Zapsat požadavek, založit list | ano | ne | ano | ano | ne |
| Objednat dodavatele | ano | ne | ano | ano (do limitu) | ne |
| Převzít provedení, odemknout fakturaci | ano | ne | ano | ne | ne |
| Faktury interního zákazníka | ano | ne | ano | ne | ne |
| Nastavení Servisu (limity, SLA, fotky) | ano | ne | ne | ne | ne |
Dodavatel je mimo tuto matici (portál). Vedení schvaluje objednávky nad limity jako u projektů. Pro zkoušení použijte „Zobrazit jako“ (0.46.0).

## 5. Obrazovky
- **Servis – přehled:** dlaždice (nové požadavky, po termínu, ke kontrole, k fakturaci, smlouvy končí, **SLA po lhůtě**).
- **Požadavky**, **Servisní listy**, **Lokality a soubory** (stávající, doplněné o stav smlouvy).
- **Detail lokality:** soubory, smlouva a checklist, plán údržby, historie zásahů, složky.
- **Checklist smlouvy:** formulář podle prvního návrhu smlouvy; tlačítko „Vytvořit návrh smlouvy (Word)“.
- **Plán údržby:** kalendář a tabulka plánovaných činností s upozorněním na termín.
- **Portál dodavatele (samostatný web):** seznam mých požadavků, detail, potvrzení přijetí, přidělení technika, doložení provedení (fotka, popis), hotovo; po uzavření jen čtení.

## 6. Konfigurovatelná pravidla (Nastavení → Servis, s historií)
- Limity schvalování objednávek servisu (dispečer / správce / vedení / jednatel); hodnoty doplní Igor.
- **SLA tabulka:** typ činnosti → doba reakce a vyřešení (jen indikace).
- Fotky: největší rozměr a kvalita (např. 1920 px, 80 %); platí pro celou aplikaci.
- Dny upozornění na konec smlouvy, četnosti plánů.
Změna se ukládá s datem a autorem (verzování seznamu nastavení + audit); starší listy se nepřepočítávají.

## 7. Architektura — varianty
| | **A – čistě SharePoint / M365** | **B – SharePoint + malý externí portál (doporučeno)** | **C – jiná databáze** |
|---|---|---|---|
| Princip | dodavatel dostane účet hosta v Microsoft 365 a pracuje přímo v SharePointu | data zůstávají v SharePointu; dodavatel pracuje jen v samostatném malém webu, který čte/zapisuje jen potřebné | data v samostatné DB (např. PostgreSQL), SharePoint jen dokumenty |
| Plus | nejméně vývoje, licence M365 | dodavatel nevidí nic jiného; jedno místo pravdy; M365 se využije maximálně | nejvolnější návrh dat |
| Mínus | hosté vidí strukturu webu, riziko chybného sdílení, nepohodlné na mobilu | je třeba malý hosting a bezpečné napojení | duplicita dat, synchronizace s PRMIS a Abrou, dvě místa pravdy |
| Bezpečnost | spoléhá na správné nastavení sdílení | prostředník má jen nejmenší práva (přístup `Sites.Selected` na vybrané seznamy), dodavatel nevidí ceny | nová DB k zabezpečení |
| Náklady | bez dalších | malý hosting + vývoj portálu; **ceny hostingu je třeba ověřit** (Azure nemáte) | hosting DB + vývoj + migrace |
**Doporučení: B.** Registrace aplikace v Entra ID Azure předplatné nevyžaduje; hosting portálu se může zvolit mimo Azure (konkrétní nabídku a ceny dohledám a předložím před rozhodnutím). Přihlášení dodavatele jednorázovým odkazem nebo kódem na e-mail. Heslo ani klíč nikdy neukládám ani nezadávám já; zadá je administrátor přímo do nástroje, který je potřebuje. Bezpečnost přístupu hostů (varianta A) jsem neověřoval; v případě zájmu se ověří prototypem.

## 8. MVP a 2. etapa
**MVP** = nejmenší verze, která už jde provozovat:
- sjednocení pojmů (soubor), složky lokality a souboru tlačítkem, doplnění stávajícího toku o druh listu (plánovaná / nahodilá), druh dokladu a časy pro SLA,
- checklist a smlouva (návrh Word) včetně sazeb s historií,
- portál dodavatele: e-mail, potvrzení přijetí, doložení provedení, hotovo,
- přehled s indikací SLA, zmenšování fotek.

**2. etapa:** plán údržby s kalendářem a automatickými požadavky, paušál v cash flow, ekonomické přehledy (marže servisu, SLA reporty), párování přijatých faktur s Abrou podle listu, přidělení technika, import stávajících lokalit.

## 9. Rizika, testy, otevřené otázky
**Rizika:** zvolený hosting a údržba portálu; záměna „soubor“ vs „zařízení“ ve starých datech; chybné nastavení práv SharePointu (aplikace jen skrývá, ochranu dělá SharePoint); synchronizace s Abrou čeká na API licenci; kvalita fotek po zmenšení.
**Testy:** logika v `src/core/` s jednotkovými testy (přechody stavů, SLA, sazby od–do, pravidla paušálu); mock repozitáře; kontrolní seznam v `docs/TESTOVANI.md`; zkoušení rolí přes „Zobrazit jako“ a s testovacím účtem ve skupině Servisu pro oprávnění SharePointu.
**Otevřeno:** 1) první návrh smlouvy od Igora (z něj checklist); 2) volba hostingu portálu; 3) limity objednávání; 4) kdo je interní zákazník u první lokality (Mastířovice); 5) text smlouvy za Revoltum Engineering & Services (právní znění připraví Igor / právník); 6) velikost fotek.

## 10. Co z existující aplikace se využije
Servis (0.45.1): lokality, soubory, požadavky, listy a jejich tok, číslování (SPO, SL), skryté servisní projekty, role, e-maily, přehled. K tomu: objednávky a schvalování, podklady k fakturaci, Data z účetnictví (Abra), modul fotek, zakládání složek, Nastavení, audit, upozornění a „Zobrazit jako“. Z nového vývoje je největší **portál dodavatele** a **checklist se smlouvou**.
