# Historie změn

Formát: jedna verze = jedna dokončená fáze nebo významná oprava.
Datum ve tvaru den. měsíc. rok.

---

## 0.30.1 — 6. 10. 2026 — Partneři: kontrola duplicit a mazání

Podle dohody s RES CRM (společný seznam `PRM_Partners`, rozhodl Igor 6. 10. 2026):

- **Stejné IČO ve stejné zemi se neuloží.** Platí všude, kde se partner zakládá nebo mění: stránka Partneři, rychlé založení partnera z rozpočtu, kusovníku a objednávky. Porovnává se i s deaktivovanými partnery; IČO se čte „po lidsku“ (mezery, chybějící nuly). Zahraniční registrační číslo (např. HRB 12345) se porovnává jako písmena a číslice. Kontrola je **i v datové vrstvě** — i kdyby ji formulář vynechal, zápis se stejným IČO selže.
- **Stejné nebo podobné jméno jen upozorní** („Partner se stejným nebo podobným jménem už existuje: … Jde o jinou firmu?“) a uložení se potvrdí tlačítkem **Přesto uložit** (u rychlého založení **Přesto založit**). Podobnost ignoruje diakritiku, velikost písmen, interpunkci a právní formu (s.r.o., a.s., GmbH…) a toleruje drobný překlep.
- **Zákazník napsaný přímo v novém projektu nebo v úpravě projektu:** má-li podobné jméno jako existující partner, aplikace to ohlásí a nechá vybrat ze seznamu; jinou firmu je třeba založit v Partnerech (tam se podobnost potvrzuje).
- **Smazání partnera:** na stránce Partneři je u každého řádku **Smazat** (jen vedení a administrátor). Před smazáním aplikace ukáže, kde je partner použit (projekty, objednávky, podklady pro fakturaci, případy RES CRM). **Použitého partnera nelze smazat** — nabídne se **Nastavit jako neaktivního**. Nepoužitý partner jde do koše SharePointu (lze obnovit). Pravidlo se znovu ověřuje v datové vrstvě. Mazání položek **kusovníku** už existuje (Kusovník → Smazat, vedení a administrátor).
- Bez změny schématu; po nahrání balíčku se nic nespouští.

---

## 0.30.0 — 6. 10. 2026 — Project overview (marketingový přehled realizace)

**Nové:** v detailu projektu tlačítko **Project overview** (vidí PM projektu, asistent, vedení a administrátor). Vytvoří **1–3 stránkové PDF** ve stylu RES prezentace — marketingový přehled realizace, kterým se představujeme zákazníkům jako reference (use case). Obsah je jiný než v reportu projektu:

- **Úvodní strana:** předmět realizace (např. „Realizace bateriového úložiště“), lokalita, rok, instalovaný výkon a kapacita, titulní fotka.
- **O projektu:** popis realizace, údaje (zákazník, lokalita, rok, výkon, kapacita), technické parametry a **mapa umístění**.
- **Fotogalerie:** další vybrané fotky (do 6 celkem, první je titulní) z fotodokumentace projektu.
- **Česky i anglicky:** jazyk se volí při vytvoření PDF; texty a technické parametry se zadávají v obou jazycích, pevné popisky jsou přeložené.
- **Bez cen, nákladů a marže.** **Zákazník** je uvedený jménem jen při zaškrtnutém **souhlasu se zveřejněním**; jinak obecně („průmyslová společnost“, text lze upravit).
- **Text s pomocí AI bez napojení:** tlačítko **Návrh ze šablony** složí text z údajů (bez AI), tlačítko **Zkopírovat zadání pro AI** zkopíruje hotové zadání (fakta o projektu a pokyny), které vložíte do Copilota nebo Clauda; hotový text vložíte zpět. Zadání neobsahuje ceny a jméno zákazníka jen se souhlasem. Přímé volání AI z aplikace vyžaduje serverový mezičlánek (Azure) a je případným dalším krokem.
- Údaje (předmět, rok, výkon, kapacita, parametry, texty, fotky, souhlas) se ukládají k projektu a průběžně se zálohují v prohlížeči; hotové PDF jde prohlédnout a uložit do složky reportů projektu.
- Mapa se skládá z dlaždic OpenStreetMap; nepodaří-li se je načíst, přehled vznikne bez mapy.

**Co je potřeba udělat po nasazení:** spustit **Instalace a diagnostika** (schéma 18 — nový sloupec „Project overview“ v seznamu projektů; nic se nemaže).

---

## 0.29.2 — 6. 10. 2026

- Web part na webu má nadpis **„Běžící projekty Revoltum Engineering & Services“**. Už vložený web part s původním nadpisem „Běžící projekty“ ho dostane sám (stránku není třeba upravovat); vlastní nadpis zadaný v nastavení web partu zůstává.

---

## 0.29.1 — 6. 10. 2026

- Web part **Běžící projekty** je zatím **seřazený podle čísla projektu** (vzestupně, 26001 nahoře); stav na pořadí nemá vliv.

---

## 0.29.0 — 6. 10. 2026 — Web part „Běžící projekty“ pro stránky webu

- **Nový web part „Běžící projekty (PRM)“** — kompaktní seznam pro úvodní stránku RES a později pro stránku Revoltum. Sloupce: **Název** (odkaz na detail projektu v PRMIS), **Projektový manažer**, **Lokalita**, **Celková cena** (prodej z rozpočtu; neschválený rozpočet šedě se štítkem „neschváleno“, projekt bez rozpočtu ukáže smluvní cenu) a **Stav**. Bez součtových okének.
- **Řídí se jen stavem projektu**: výchozí je **Příprava a Realizace**, ostatní stavy (Nabídka, Pozastaveno, Reklamace, Dokončeno, Storno) a Režie se na web nedostanou. Řazení: nejdřív Realizace, pak Příprava, nejnovější číslo první.
- **Nastavení z PRMIS:** nová záložka **Nastavení → Projekty na webu** (stavy k zobrazení, počet řádků před „Zobrazit vše“, zapnutí sloupce Celková cena). Změna platí po obnovení stránky s web partem, není potřeba nic nahrávat.
- **Marže a náklady se do web partu nenačítají** (dotaz bere jen název, PM, lokalitu, prodejní cenu, stav).
- **Kopie na jiném webu** (Revoltum): v nastavení web partu se vyplní adresa webu s PRMIS; odkazy vedou na stránku `SitePages/PRM.aspx` toho webu (lze změnit).
- Web part je samostatný a lehký (nenačítá celou aplikaci). Bez změny schématu — po nahrání balíčku se nic nespouští.
- Náhled: `index.html?web=projekty`.

---

## 0.28.2 — 5. 10. 2026 — Partneři i mimo EU

- **Země partnera nejsou jen EU.** V seznamu Země je nově za členskými státy EU skupina **Ostatní země**: Čína, Tchaj-wan, USA, Kanada, Velká Británie, Švýcarsko, Norsko, Japonsko, Jižní Korea, Thajsko, Vietnam, Indie, Turecko, Ukrajina, Spojené arabské emiráty, Austrálie, Brazílie a další (celkem přes 45 zemí). Země se ukládá dvoupísmenným kódem do stávajícího sloupce, takže se nemění schéma a nic se nemusí spouštět.
- U zemí mimo EU se **DIČ / VAT ID nekontroluje** (tvary čísel se liší a dodavatel např. z Číny nebo USA má vlastní systém) — jen se uklidí mezery; předpona se nedoplňuje. U zemí EU zůstává kontrola tvaru jako upozornění beze změny.

---

## 0.28.1 — 5. 10. 2026 — Jeden posuvník místo dvou a dodavatel jen ze seznamu

**Opraveno**

- **Dvojitý posuvník u rozpočtu už nebliká.** V ostrém provozu se vedle zrcadleného posuvníku u dolního okraje objevoval ještě původní posuvník tabulky a oba se při posouvání přetahovaly. Původní posuvník je teď vypnutý a tabulku posouvá jediný posuvník u dolního okraje; dá se ale posouvat i kolečkem se Shiftem a vodorovným gestem na touchpadu. Oba posuvníky mají stejný rozsah (i když tabulka má svislý posuvník) a drobné zaokrouhlení při zvětšeném písmu je už nepřehazuje. Platí pro všechny široké tabulky v aplikaci.
- **Dodavatele jde jen vybrat, ne napsat.** Pole Dodavatel v rozpočtu **i v kusovníku** (nová položka, uložení z rozpočtu) je rolovací seznam partnerů: po kliknutí se ukáže celý seznam, psaním se zužuje; co není v seznamu, se po opuštění pole nepřijme. **Na konci seznamu je vždy „+ Založit nového partnera“** (předvyplní napsaný název a po založení partnera rovnou vybere). Stejná volba je i na konci seznamu dodavatelů v **objednávce**. Dodavatel, který v rozpočtu už je zapsaný jako volný text (např. z importu z Excelu), se ukáže **oranžově obtažený** s nápovědou, ať ho uživatel vybere ze seznamu nebo založí. Zákazník v novém projektu zůstává beze změny (nového zákazníka lze zapsat a založí se při uložení).

---

## 0.28.0 — 5. 10. 2026 — První poznatky z ostrého provozu: nic se neztratí, posuvníky, rozpočet v přehledu a v reportu

**Opraveno / nové (podle připomínek kolegů)**

- **Zadávané údaje se neztratí.** Když někdo uprostřed zadávání odskočí jinam (např. rychle vyřídit objednávku) a vrátí se, o rozepsanou práci nepřijde:
  - **Rozpočet a plán plateb se ukládají samy** — po krátké pauze od poslední úpravy (do podrobné historie se neukládá, aby se nezaplnila), a **hned při odchodu ze záložky**. Pod tlačítkem Uložit je vidět stav („Automaticky uloženo v 16:52“). Při zavření stránky s neuloženými změnami se prohlížeč zeptá. Rozpočet je pracovní dokument (nezamyká se), automatické uložení nic neschvaluje.
  - **Objednávka, podklad pro fakturaci, zápis ze stavby a předávací protokol** se průběžně zálohují v prohlížeči; po návratu nabídne okno **„Našli jsme rozepsaný formulář — Obnovit / Zahodit“**. Po úspěšném uložení se záloha smaže; starší než 14 dní se zahodí.
  - Záloha rozpočtu v prohlížeči slouží navíc jako pojistka, kdyby se automatické uložení nepovedlo (výpadek spojení, souběžná úprava kolegy).
- **Vodorovný posuvník je pořád vidět** u dolního okraje obrazovky (nikoli až na konci tabulky): rozpočet, cashflow (tabulky plateb a milníků i přehled po obdobích), přehled projektů, objednávky, podklady pro fakturaci, zápisy a protokoly. Zrcadlený posuvník se lepí na dolní okraj okna, dokud je tabulka vidět, a je propojený s tabulkou. (Zvětšené písmo systému a nižší šířka okna dělají širokou tabulku ještě širší — posuvník to řeší.)
- **Přehled projektů ukazuje čísla z rozpočtu:** sloupec **Celková cena** = prodej rozpočtu, **Náklady** = plán nákupu, **Vyčerpáno** = skutečnost (koupeno). Dokud rozpočet nikdo neschválil, jsou čísla **provizorní — šedá kurzívou se štítkem „neschváleno“**. Projekt bez rozpočtu se chová jako dřív (cena z údajů projektu, čerpání z objednávek). Dlaždice „hodnota aktivních projektů“ počítá také z rozpočtu.
- **Report projektu (PDF) zahrnuje rozpočet:** nová strana **Realizační rozpočet** (plán, prodej, marže, skutečnost, zbývá, prognóza, objednáno, proinvestováno, semafor, tabulka po skupinách a stav schválení). Přehledová strana ukazuje cenu a vyčerpání z rozpočtu (s upozorněním „neschváleno“), „Na co dát pozor“ upozorní na neschválený či po schválení upravený rozpočet a na prognózu nad plánem. V okně reportu je nová volba **Realizační rozpočet**. Objednávky jsou v reportu prázdné, když projekt žádné objednávky v aplikaci nemá (nákupy zapsané jen v rozpočtu do Koupeno se do objednávek nepromítají).

**Co je potřeba udělat po nasazení**

1. Spustit **Instalace a diagnostika** (schéma 17 — do evidence projektů přibyly uložené součty rozpočtu a příznak schválení; nic se nemaže).
2. V téže stránce kliknout na **Přepočítat všechny projekty** (karta „Součty rozpočtů v přehledu projektů“) — doplní čísla ze všech už zadaných rozpočtů do přehledu. Dál se aktualizují sama.

---

## 0.27.0 — 4. 10. 2026 — Cashflow projektu a fakturační milníky (Fáze 3, krok 3c)

**Nové**

- **Záložka Cashflow** v detailu projektu (dosud „Připravujeme“): **graf** (příjmy nahoru, výdaje dolů — plán světle, skutečnost tmavě — a čáry kumulace plán/skutečnost) a **tabulka po měsících nebo týdnech** (příjmy, výdaje, saldo, kumulace — plán i skutečnost; řádek „Náklad v čase“ podle data faktur; sloupec aktuálního období je zvýrazněný). Měnu přepíná společný přepínač CZK/EUR/USD (kurz ČNB), částky jdou **s DPH i bez DPH** (přepínač).
- **Plán plateb nákladů (výdaje)** podle vzoru Excelu „Průběh plateb“: platba má popis, **položku rozpočtu**, částku bez DPH, měnu, **režim DPH** (21 % / 12 % / reverse charge / neplátce), **datum faktury** (náklad v čase), **splatnost** (kdy se platí = výdaj v cashflow) a **datum úhrady** a případně skutečnou částku (skutečnost). Tlačítko **Rozplánovat položku do plateb** rozloží náklady položky podle podílů (např. 30/40/30 nebo 20/30/30/10/10) do faktur v pravidelných odstupech; součet je vždy přesně celek.
- **Fakturační milníky (příjmy):** plánované datum faktury, částka bez DPH, měna, sazba DPH, splatnost ve dnech, **navázání na podklad pro fakturaci** (splatnost a úhrada se pak berou z podkladu — úhrada podkladu je skutečný příjem) a ruční datum úhrady.
- **„Zbývá naplánovat“:** porovnání prognózy nákladů každé položky rozpočtu s už naplánovanými platbami — seznam položek bez rozplánovaných plateb s tlačítkem Rozplánovat. Upozornění na platby a milníky bez data (v cashflow chybí).
- Platby a milníky jsou součástí rozpočtu projektu (jeden dokument) a ukládají se tlačítkem Uložit plán plateb (hlídá se souběžná úprava). Upravovat smí PM, asistent, vedení a administrátor.

**Bez změny schématu** — Instalaci spouštět nemusíte.

**Ještě není:** napojení na harmonogram (posun termínu posune platbu — Fáze 4), automatické platby z objednávek a import skutečných plateb z účetnictví (Fáze 5), celofiremní cashflow (Fáze 5).

---

## 0.26.0 — 4. 10. 2026 — Rozpočet: objednáno, prognóza, semafor a Objednat (Fáze 3, krok 3b)

**Nové**

- **Objednávka se dá navázat na položku rozpočtu.** Ve formuláři objednávky je nepovinná volba **Položka rozpočtu** (nabízí položky z běžných skupin rozpočtu projektu). Z rozpočtu: **⋯ u položky → Objednat** otevře novou objednávku předvyplněnou z položky (předmět, dodavatel, měna, řádek s množstvím a cenou) a rovnou ji naváže; množství a cenu upravíte, když objednáváte jen část položky.
  V detailu objednávky je vidět navázaná položka.
- **Sloupec Objednáno** v rozpočtu: součet navázaných objednávek (ve stavech Ke schválení, Schváleno, Odesláno, Dodáno, Uzavřeno — stejně jako „Vyčerpáno“ v přehledu projektů), v měně položky. Přečerpání plánu je červeně.
- **Sloupec Prognóza** (nákladů položky): PM ji může zadat ručně, jinak platí plán; **nikdy není nižší než objednáno a koupeno**. Součty po skupinách i celkem.
- **Semafor rozpočtu** (dlaždice v rozpočtu): baseline = **náklady posledního schválení**; **zelená** — prognóza není nad baseline, **žlutá** — nad ní do prahu (Nastavení, výchozí 5 %), **červená** — nad prahem, nebo plánovaná marže ((smluvní cena − prognóza) / cena) pod minimem z Nastavení. Bez schválení je „Bez rozpočtu“. Prahy a minimum jsou globální a platí pro všechny projekty (změna se hned projeví). Stav je napsaný slovem, nejen barvou.
- **Semafor v přehledu projektů:** výsledek se ukládá do projektu (cache) a přepočítá se při otevření a uložení rozpočtu a po změně objednávky; přehled ho čte bez načítání rozpočtů.

**Co je potřeba udělat po nasazení:** spustit **Instalace a diagnostika** (schéma 16 — do seznamu objednávek přibyly sloupce Položka rozpočtu (id) a Položka rozpočtu; nic se nemaže). Do té doby seznam objednávek ohlásí chybějící sloupce.

**Ještě není:** fakturační milníky a cashflow projektu (krok 3c); napojení skutečnosti (Koupeno) na účetnictví (Fáze 5).

---

## 0.25.0 — 4. 10. 2026 — Kusovník, dodavatel z partnerů, smluvní cena z rozpočtu

**Nové**

- **Kusovník** — společná databáze položek pro všechny projekty (know-how pro další nabídky a rozpočty). V menu **Projekty → Kusovník**: seznam s hledáním podle písmen (popis, dodavatel, kategorie), nová položka, úprava; smazat smí vedení a administrátor (do koše SharePointu).
  V rozpočtu: **⋯ u položky → Uložit do kusovníku** (okno s údaji; když tam stejná položka — popis a dodavatel — už je, nabídne **přepsání ceny** místo duplikátu) a tlačítko **Vložit z kusovníku** (hledání, zaškrtnutí více položek, volba skupiny; vloží se s množstvím 1 a cenou z kusovníku).
- **Dodavatel v rozpočtu = výběr z partnerů.** Píšete a seznam se zužuje podle písmen kdekoli v názvu (i podle IČO, bez ohledu na diakritiku). Není-li dodavatel v seznamu, nabídka **+ Založit nového partnera** (název, IČO s dotažením z ARES, typ, DIČ, adresa) — partner se uloží do Partnerů a hned se vybere.
- **Vodorovný posuvník rozpočtu je pořád vidět** dole na obrazovce (tabulka má omezenou výšku a rolují se v ní obě osy); záhlaví sloupců zůstává nahoře.

**Změněno**

- **Smluvní cena projektu = prodej schváleného rozpočtu.** Schválením rozpočtu se cena (a měna) projektu **přepíše prodejem rozpočtu**; zapíše se to do historie. Do prvního schválení jde cenu zadat ručně v Upravit projekt; po schválení je pole zamčené s vysvětlením.

**Co je potřeba udělat po nasazení:** spustit **Instalace a diagnostika** (schéma 15 — nový seznam „PRM – Kusovník“; nic se nemaže).

**Zatím vypnuto:** „⋯ → Objednat“ (objednávka z položky rozpočtu přijde s krokem 3b).

---

## 0.24.0 — 2. 10. 2026 — Rozpočet podruhé: jeden rozpočet na projekt, vlastní práce, rezerva, skutečnost

Podle zkoušení rozpočtu v 0.23.0 přepracováno:

**Změněno**

- **Jeden rozpočet na projekt**, který se průběžně upravuje a **nezamyká se** (dřívější „verze“ zmizely). **Schválení** nic nezamkne — uloží do **historie schválení** záznam: číslo, datum, kdo, **náklady, prodej a marže** (v Kč) a poznámku. Potřebuje-li PM další schválení, podá žádost znovu a vznikne další záznam.
  Cesta: PM „Požádat o schválení“ → vedení „Schválit“ (nebo „Vrátit k úpravě“ s důvodem; PM může žádost stáhnout). U rozpočtu je vidět, že byl **upraven od posledního schválení**.
- **Smluvní cena projektu** v souhrnu se bere z údajů projektu (Upravit projekt). Je-li **nižší než nákup rozpočtu**, dlaždice to červeně řekne — v obrázku z testu byla cena v projektu zadaná jako 10 Kč, proto vyšla plánovaná marže −9 900 %.

**Nové**

- **Vlastní práce** jako zvláštní druh skupiny: zadává se **počet hodin** a **profese**; náklad a prodej počítají **sazby profese** (nákladová a prodejní, marže se dopočte). Číselník profesí (výchozích 10, upravitelných) je v **Nastavení → Rozpočet a semafor**. Při založení rozpočtu si projekt sazby **zkopíruje a pak drží vlastní** — v projektu je lze upravit (tlačítko Sazby profesí), změna v Nastavení se do už založených rozpočtů nepromítá.
- **Rezerva** jako zvláštní druh skupiny (Realizační rezerva): **bez přirážky, nákup = prodej**. Zadává se částkou, nebo v **% z prodeje** — rezerva je pak p % z celkového prodeje včetně sebe (R = p / (100 − p) × prodej ostatních), takže nevzniká kruhový výpočet.
- **Skutečnost a zbývá:** u každé položky sloupce **Koupeno (množství, za kolik)** a **Zbývá (množství, částka)** — např. 100 ks po 1 Kč = 100 Kč, koupeno 60 ks za 60 Kč → zbývá 40 ks a 40 Kč. U práce se zapisují odpracované hodiny (částka se dopočte ze sazby). Souhrn ukazuje **Plán / Skutečnost / Zbývá a Proinvestováno v %** s ukazatelem. (Napojení na účetnictví a import hodin přijde později.)
- **Nabídka „⋯“ u každé položky:** Duplikovat, Přesunout do skupiny, Smazat; **Uložit do kusovníku** a **Objednat** jsou zatím vypnuté („Připravujeme“ — navážou další kroky).
- Nová skupina se zakládá s druhem (běžná / vlastní práce / rezerva); skupiny „Vlastní práce“ a „Rezerva“ z Nastavení dostanou druh automaticky.

**Co je potřeba udělat po nasazení:** spustit **Instalace a diagnostika** (schéma 14 — do seznamu rozpočtů přibyly sloupce Schválení, Žádost podal, Žádost podána dne; nic se nemaže). Rozpočet založený ve verzi 0.23.0 se načte (obsah se doplní o nové údaje).

---

## 0.23.0 — 2. 10. 2026 — Realizační rozpočet (Fáze 3, krok 3a)

**Nové**

- **Záložka Realizační rozpočet** v detailu projektu (dosud „Připravujeme“). Rozpočet se vede **v aplikaci**, ne v cizím Excelu: položky se dají libovolně přidávat a mazat, drží se vazby a historie.
- **Skupiny a položky.** Rozpočet má skupiny (po založení podle kategorií z Nastavení: Materiál, Subdodávky a služby, Vlastní práce, Doprava, Ostatní, Rezerva; skupiny jde přidávat, přejmenovávat, sbalovat a mazat). Každá skupina má **výchozí přirážku**.
- **Položka:** popis, dodavatel, kategorie, měna (CZK/EUR/USD), množství, MJ, **nákup** za jednotku a celkem, **přirážka %**, **prodej** celkem a **marže %**. Výchozí je vždy nákup. Přirážka se dědí ze skupiny a u položky jde přepsat; nebo se zadá rovnou prodejní cena a přirážka se dopočte.
  *Prodej = nákup × (1 + přirážka), např. nákup 100, přirážka 20 % → prodej 120.* **Marže** (podíl zisku na prodeji) se jen ukazuje a je menší: 120 − 100 = 20 → 16,7 %. Pod minimální maržou z Nastavení svítí červeně.
- **Souhrn** v zobrazené měně (přepínač CZK/EUR/USD, kurz ČNB): nákup, prodej, přirážka, marže a **smluvní cena projektu s plánovanou marží** (smluvní cena − nákup).
- **Verze a schvalování:** Koncept (PM, asistent upravují) → *Ke schválení* (zamčeno) → *Schváleno* (vedení) = **baseline**. Vedení může vrátit s důvodem, předkladatel stáhnout zpět. Schválená verze se nemění; úprava = **Nová verze** (začíná kopií schválené). Historie každé verze (kdo, kdy, co); souběžnou úpravu hlídá otisk verze.
- **Vložit z Excelu:** v Excelu označte buňky, zkopírujte a vložte do okna — aplikace pozná nadpisy (Položka/Popis, Plán/Nákup, Dodavatel, Množství, MJ, Cena za MJ, Měna), ukáže náhled a přidá položky do zvolené skupiny. Řádky CELKEM přeskočí.
  **Export do CSV** (otevře se v Excelu). Plnohodnotný export do Excelu s grafikou přijde s reporty pro Fázi 5.

**Co je potřeba udělat po nasazení:** spustit **Instalace a diagnostika** (schéma 13 — do seznamu verzí rozpočtu přibyly sloupce Obsah a Prodej celkem; nic se nemaže).

**Zatím není** (další kroky Fáze 3): objednáno / uhrazeno / zbývá u položek, semafor rozpočtu a jeho uložení do přehledu projektů, fakturační milníky a cashflow projektu.

---

## 0.22.0 — 2. 10. 2026 — Protokol v obou směrech, přílohy podkladu, hlášky nad tlačítky, guma v náčrtu, oprava lupy ARES

**Nové**

- **Předávací protokol v obou směrech.** Ve formuláři je volba **Směr předání**: *Předáváme dílo zákazníkovi* (my jsme zhotovitel, druhá strana objednatel) nebo *Přebíráme dílo od dodavatele* (druhá strana je dodavatel, my objednatel). Podle směru se prohodí strany v hlavičce,
  úvodní větě i podpisových polích PDF a Wordu. Starší protokoly mají směr „předáváme“.
- **Přílohy u podkladu pro fakturaci** (jako u objednávek): libovolné soubory (PDF apod.), u nového podkladu se nahrají po uložení. Navíc rozbalovací nabídka **Připojit předávací protokol** — nabídne uzavřené a podepsané protokoly projektu a připojí jejich PDF (kopii).
  Přílohy jdou přidávat a odebírat u konceptu a podkladu ke kontrole; po předání účtárně se nemění. Při předání účtárně e-mailem je lze přiložit (zaškrtávátko v okně odeslání).
- **Guma v náčrtu**: čtvercová, tři velikosti (malá, střední, velká); maže jen přejeté místo, u fotky se pod gumou vrací původní fotka. Čtvereček pod ukazatelem ukazuje, co se smaže. Vrátit jde tlačítkem Zpět.
- V přehledu projektů je **odkazem i název projektu** (dosud jen číslo).

**Změněno**

- **Hlášky „něco chybí“ a chyby uložení jsou nad tlačítky v patě panelu** (ne nahoře, kde se přehlédly): zápis a protokol, objednávka, podklad, úprava a založení projektu, termín, partner. Partner se nově dá zkusit uložit i bez názvu — aplikace řekne, co chybí.

**Opraveno**

- **Lupa (ARES) u partnera** nešla zmáčknout, když bylo IČO zapsané s mezerou, s nulami navíc (např. 9 číslic) nebo mělo špatnou kontrolní číslici — bez vysvětlení. Teď se IČO uklidí (mezery pryč, nuly doplněny/ubrány), lupa jde i s Enterem a políčko řekne, co je špatně. ARES samotný funguje (ověřeno 2. 10. 2026).

---

## 0.21.0 — 2. 10. 2026 — Předávací protokoly

**Nové**

- **Záložka „Předávací protokoly“ v detailu projektu** (dílčí i konečné předání; více protokolů na projekt). Tlačítko **Nový předávací protokol** otevře formulář s předvyplněnou hlavičkou z projektu.
- **Obsah protokolu:** datum předání, stavba a místo, **předává** (zhotovitel — projektový manažer) a **přebírá** (objednatel / zákazník), účastníci předání, **předmět předání** a **předané doklady** (položky s textem, fotkami, náčrty a přílohami jako u zápisů),
  **zjištěné vady a nedodělky** (popis, kdo odstraní, odstranit do) a **závěr předání**: *převzato bez výhrad / s výhradami / nepřevzato* a nepovinná **záruční doba v měsících** (aplikace spočítá, kdy záruka končí).
- **Cesta jako u zápisů ze stavby:** Koncept → Uzavřeno (zamčeno, vznikne PDF a Word, zapíše se otisk obsahu) → Podepsáno (podpis v aplikaci s podpisem z profilu a značkou elektronického podpisu, nebo nahraný podepsaný sken); Storno s důvodem. Koncepty PDF a Wordu se průběžně ukládají se značkou (KO).
- **PDF protokolu** v grafice RES: číslo **PP-26001-01** (řada PP podle projektu), úvodní věta, tabulky, závěr v rámečku (zelená / oranžová / červená), **podpisová pole za zhotovitele, za objednatele a pro každého přítomného účastníka**. Před uzavřením hlídá: výsledek předání, přebírající strana, předmět předání; při převzetí s výhradami aspoň jednu vadu.
- Soubory leží ve složce zápisů projektu: `04-Zápisy/Předávací protokoly/PP01` (žádná nová složka na nejvyšší úrovni projektu). Bez změny schématu — Instalaci spouštět nemusíte.

**Změněno**

- Mezi zápisy ze stavby, v Přehledu zápisů a v reportu projektu se protokoly neukazují (mají vlastní záložku).

---

## 0.20.1 — 2. 10. 2026 — Přepínač měny v přehledech, skupina Servis v nabídce

**Nové**

- **Přepínač měny CZK / EUR / USD** nad každým přehledem s cenami: Přehled projektů, Mapa projektů, Objednávky, Fakturace, objednávky a podklady v detailu projektu a Čeká na mě. Částky se přepočtou kurzem ČNB (stejně jako dosud). **Výchozí zobrazení zůstává podle Nastavení**
  (Výchozí měna přehledů); volba se **pamatuje v prohlížeči a platí pro všechny přehledy najednou**. Nastavením výchozí měny se nic nemění — doklady samotné zůstávají v měně dokladu. Report projektu (PDF) používá aktuálně zvolenou měnu.
- V nabídce je skupina **Servis** s položkou označenou „Připravujeme“ (modul servisu se doplní později).

---

## 0.20.0 — 1. 10. 2026 — Report projektu (PDF) ve stylu RES prezentace

**Nové**

- **Tlačítko „Report projektu“** v detailu projektu (ne u Režie). Vytvoří PDF o stavu projektu ve formátu **16:9 podle PowerPointové šablony RES**: úvodní strana (tmavý přechod, výboje, bílé logo), **Přehled projektu** (zákazník, lokalita, typ, projektový manažer, stav, rozpočet, termíny, ukazatele Celková cena / Vyčerpáno / Vyfakturováno / Uhrazeno a „Na co dát pozor“),
  **Objednávky a vyčerpání**, **Fakturace**, **Termíny a úkoly**, **Stavební deník** (poslední zápisy), **Fotodokumentace** (až 6 fotek z nejnovější dávky s poznámkami) a závěrečná strana „Revoltujte s námi“.
- V dialogu se dá zvolit, co report obsahuje (finance, termíny a úkoly, deník, fotky). Po vytvoření je **náhled**; projektový manažer, asistent a vedení ho mohou **uložit do složky projektu** (výchozí `07-Dokumentace a podklady/Reporty`, název `Report_<číslo projektu>_<datum>.pdf`).
- Částky jsou ve výchozí měně přehledů, bez DPH. Report se tvoří **z dat aplikace, bez umělé inteligence** — texty jsou jasně dané. Textové shrnutí od AI je možná další etapa.
- Nové nastavení **Složka reportů** (Nastavení → Složky) a nová role „Reporty“ v mapě složek projektu (Složky projektu). Bez změny schématu.

---

## 0.19.0 — 1. 10. 2026 — Podpis jako obrázek v profilu a značka elektronického podpisu, bublina na mapě, složka u starších zápisů, měření rychlosti

**Nové**

- **Můj profil** (klik na jméno vpravo nahoře): každý uživatel si uloží **obrázek svého podpisu** — nahraje sken nebo fotku (bílé pozadí se zprůhlední), nebo se podepíše myší, prstem či perem.
- **Značka elektronického podpisu v PDF.** V ostrých dokladech je podpisové pole: role (Vystavil, Projektový manažer, Vedení, Jednatel…), obrázek podpisu z profilu (když ho člověk má), čára, **značka (kolečko s fajfkou)**,
  jméno a „Elektronicky schváleno / podepsáno · datum a čas“. Objednávka: vystavitel (jen v ostrém dokladu) a každý schvalovatel; automatické schválení se označí jako automatické; podklad pro fakturaci: vystavitel; zápis ze stavby
  podepsaný v aplikaci: podepisující. Koncept s vodoznakem se nepodepisuje. Není to kvalifikovaný (certifikátový) podpis — je to doložení, že doklad v aplikaci vystavil či schválil konkrétní uživatel.
- **Měření rychlosti načítání** (Instalace a diagnostika → Rychlost načítání): změří hlavní seznamy aplikace (projekty, objednávky, podklady, partneři, kurzy, zápisy), každý dvakrát, a ukáže, který trvá. Slouží k hledání pomalého místa.

**Změněno**

- **Bublina u špendlíku na mapě**: Název, Projektový manažer, Celková cena (ve výchozí měně přehledů), Dokončení (předpokládané), Stav, Rozpočet. Typ a Termíny se nezobrazují.

**Opraveno**

- **Tlačítko se složkou u zápisů** (a odkazy „Otevřít složku“ u fotek) končilo u starších dokladů chybou 404 — adresa se skládala z uložené cesty. Teď se složka **hledá v SharePointu tolerantně** (číslo na začátku, pomlčka/podtržítko, diakritika) a otevře se ta skutečná.
- **PDF podkladu pro fakturaci uložené při prvním předání účtárně neslo vodoznak „NÁHLED – NEPŘEDÁNO“**, protože se vykreslilo ještě ve stavu před předáním. Teď se vykresluje jako předaný doklad.

**Schéma dat: 12** (nový seznam PRM_UserProfiles — podpisy uživatelů). **Po nahrání balíčku spusťte Instalaci a diagnostiku.** Bez ní jde aplikace používat, jen se podpis nedá uložit (aplikace to řekne).

---

## 0.18.0 — 1. 10. 2026 — Režie má vlastní strukturu složek, oprava odkazu na složku, Nastavení projektu (ozubené kolečko)

**Nové**

- **Nastavení projektu (ozubené kolečko)** v hlavičce detailu projektu: sem se schovaly věci, které projektový manažer nepotřebuje denně. Teď: **Složky projektu…**, u Režie **Založit složky Režie**
  a (jen administrátor, jen u běžných projektů) **Smazat projekt…**. Další položky nastavení projektu přibudou sem.
- **Režie má vlastní strukturu složek**, oddělenou od běžných projektů: složka `99900-Režie/<rok>` a v ní **šablona Režie** (Nastavení → Složky projektů; návrh: 01-Objednávky, 02-Smlouvy a pojištění,
  03-Faktury přijaté, 04-Ostatní) a vlastní **složka objednávek Režie**. U Režie se nepoužívají složky pro fakturaci, zápisy ani fotky. **Založit složky Režie** (kolečko) založí složku a nastaví odkaz;
  hledá tolerantně, zakládá jen to, co chybí, nic nemaže.
- **Oprava odkazu „Otevřít složku projektu“**: dialog Složky projektu teď kontroluje, jestli odkaz míří na **kořen složky projektu**. Když míří do podsložky (po chybě starší verze), nabídne **Opravit odkaz** —
  změní se jen odkaz, žádné složky se nezakládají ani nepřesouvají. Odkaz mimo kořenovou složku projektů se automaticky neopravuje (jen se ohlásí).
- Nastavení upozorní i na cestu objednávek Režie, která nepatří do šablony Režie.

**Poznámka:** Režie založená starší verzí (složka `General01_PROJEKTY/…` s podsložkami šablony) má odkaz mimo kořen projektů — použijte **Založit složky Režie** a starou složku smažte ručně.

**Bez změny schématu dat** (zůstává 11).

---

## 0.17.0 — 1. 10. 2026 — Mapa složek projektu (změna šablony nerozbije staré projekty), konec tlačítka Opravit složky

**Proč:** šablona složek (Nastavení) se používala i pro hledání složek u už založených projektů. Po její úpravě (přečíslování) se staré projekty „rozešly“ se šablonou a tlačítko
„Opravit složky“ zakládalo duplicitní složky. Teď jsou šablona a existující projekty **oddělené**.

**Nové**

- **Každý projekt má vlastní mapu složek** — kde má složku objednávek, podkladů pro fakturaci, zápisů ze stavby a fotek. Ukládá se při založení projektu podle Nastavení;
  pozdější změna šablony nebo cest v Nastavení se u už založených projektů **neprojeví**. Projekt bez uložené mapy (založený dřív) používá výchozí cesty z Nastavení a složku
  hledá tolerantně (číslo na začátku, pomlčka/podtržítko, diakritika a velikost písmen nerozhodují) — takže přečíslování složek aplikace nerozhodí.
- **Tlačítko „Složky projektu“** v detailu projektu (PM, asistent, administrátor): ukáže skutečné složky v projektu a cestu, kterou aplikace u každého druhu dokumentů používá, s poznámkou, jestli
  složka existuje. **Navrhnout podle skutečných složek** doplní správná jména (i při jiném čísle), jde také vrátit výchozí z Nastavení. Nic se nemaže ani nepřesouvá.
- **Zakládání složek je bezpečné proti duplicitám:** podsložky šablony se hledají tolerantně a zakládají se jen ty, které opravdu chybí.
- **Nastavení → Složky projektů** upozorní, když mají dvě složky šablony stejné číslo (např. dvě „03-“) nebo když cesta objednávek / fakturace / zápisů / fotek nepatří do žádné složky šablony,
  a vysvětluje, že šablona platí jen pro nové projekty.

**Odstraněno**

- Tlačítko **Opravit složky** v detailu projektu (zakládalo duplicity). Nahrazuje ho „Složky projektu“.

**Schéma dat: 11** (PRM_Projects → Mapa složek). **Po nahrání balíčku spusťte Instalaci a diagnostiku.** Do té doby aplikace funguje jako dřív (výchozí cesty z Nastavení).

---

## 0.16.0 — 1. 10. 2026 — Měna přehledů, Náklady a Vyčerpáno, záložky projektu, nástroje v náčrtu, mapa se skupinami

**Nové**

- **Výchozí měna přehledů** (Nastavení → Rozpočet a semafor; zatím CZK). Přehledy — seznam projektů, objednávek, podkladů pro fakturaci, dlaždice KPI — ukazují částky vždy
  v této měně; částky v jiné měně se přepočítají kurzem ČNB (původní částka je v bublince). **Doklady samotné** (objednávka, podklad) zůstávají v měně dokladu (CZK, EUR, USD).
  Stejné pravidlo bude platit pro budoucí grafy a přehledy (výchozí měna vždy z Nastavení; šlo by si ji v přehledu přepnout).
- **Přehled projektů: sloupce Náklady a Vyčerpáno** za Celkovou cenou. *Náklady* zatím ukazují „—“ (doplní se z realizačního rozpočtu ve Fázi 3). *Vyčerpáno* je součet vystavených
  objednávek projektu bez DPH (stavy Ke schválení, Schváleno, Odesláno dodavateli, Dodáno, Uzavřeno; ne koncepty, vrácené, zamítnuté ani stornované) ve výchozí měně. Celková cena se řadí podle přepočtené částky.
- **Detail projektu: záložky jsou menší a zalamují se do druhé řady**, nic se neschovává do nabídky „…“. Pořadí: Přehled, Objednávky, Fakturace, Stavební deník, Fotodokumentace, Dokumenty, Termíny, Realizační rozpočet, Cashflow, Harmonogram.
- **Náčrt k zápisu: nástroje** Pero, Čára, Obdélník (se Shiftem čtverec), Kolečko a Text (písmo Arial, velikost Malý / Střední / Velký). Tvary se táhnou s náhledem; Zpět vrátí poslední krok. Text: klik do obrázku, napsat, Enter.
- **Mapa projektů: skupiny špendlíků.** Projekty, které by se při aktuálním přiblížení překrývaly, se sloučí do kruhu s počtem. Po najetí se vypíší, po kliknutí se mapa přiblíží, aby byly vidět všechny;
  projekty na jednom místě (které přiblížení nerozdělí) se po kliknutí vypíšou v okně s odkazy na detail.

**Odstraněno**

- **Export přehledu projektů do Excelu** (tlačítko i funkce) a s ním knihovna ExcelJS — Excel export už se nebude potřebovat.

**Bez změny schématu dat** (zůstává 10).

---

## 0.15.0 — 1. 10. 2026 — Opravy složek, mazání projektu, koncepty (KO), zálohová faktura, výběr osob

**Opraveno**

- **Složky nového projektu.** Složka projektu se zakládá jako `26007-Název` (číslo, pomlčka, název — jako ve stávajících projektech) přímo v `General/01_PROJEKTY`
  a **vždy se založí celá struktura podsložek**. Odkaz „Otevřít složku projektu“ míří vždy na **kořen složky projektu**, ne na poslední podsložku
  (u projektů založených starší verzí to dělalo, že se otevřela např. `10-Servis`). Oprava starších projektů: tlačítko **Opravit složky** v detailu projektu
  založí chybějící složky na správném místě a přepíše odkaz; nic nemaže ani nepřesouvá.
- **Instalace a diagnostika** ukáže, jestli kořenová složka projektů z Nastavení v knihovně existuje, a upozorní na chybně slepenou složku `General01_PROJEKTY`.
- **Patička aplikace ukazuje verzi balíčku** (např. „verze 0.15.0.0“), aby šlo hned poznat, jaká verze na SharePointu opravdu běží.
- **Pole „Odpovídá“ u termínů** bylo obyčejné textové pole (prohlížeč nabízel dříve napsané texty) a neznámé jméno tiše zahazovalo. Teď je to **výběr osoby ze všech uživatelů
  tenantu** (napište aspoň 3 znaky jména nebo e-mailu); osoba, která na web ještě nebyla, se přidá automaticky.

**Nové**

- **Smazání projektu (jen administrátor).** Tlačítko **Smazat projekt** v detailu projektu: velké červené varování s přesným rozsahem, potvrzení opsáním čísla projektu.
  Smaže se (vše **do koše SharePointu**, obnovitelné 93 dní): evidence projektu, jeho objednávky se schvalováním, podklady pro fakturaci, stavební deníky a zápisy, termíny,
  rozpočtové položky a **složka projektu i s dokumenty a fotkami**. Složku aplikace smaže jen když leží přímo v `General/01_PROJEKTY`; jinak ji nechá a řekne to
  (smaže se ručně). Projekt Režie se nemaže. Zůstává záznam v auditním logu.
- **Koncepty (KO) ve složce projektu.** Objednávka, podklad pro fakturaci i zápis ze stavby se do složky projektu ukládají **už při uložení konceptu** jako
  `OBJ-2026-0001 (KO).pdf` (u zápisu PDF i Word). Ostrý dokument má stejný název bez `(KO)`; po vystavení (odeslání objednávky, předání podkladu účtárně, uzavření zápisu)
  se koncept nahradí ostrou verzí (koncept se smaže do koše). Při stornu nebo smazání dokumentu **koncept zůstává**.
- **Tlačítko se složkou** v hlavičce objednávky, podkladu a zápisu otevře v nové kartě složku, kde dokument leží (aby šel soubor rovnou odeslat).
- **Zálohová faktura.** Podklad pro fakturaci má **druh dokladu**: Faktura / Zálohová faktura (stejná řada čísel FP). Záloha má nadpis „Podklad pro zálohovou fakturu“,
  nemá DUZP a e-mail účtárně to říká. V seznamu je u zálohy popisek „záloha“. **Schéma dat 10 (nový sloupec Druh) — po nahrání balíčku spusťte Instalaci a diagnostiku.**

**Ručně:** projekty a složky založené starší verzí (např. `General01_PROJEKTY`, složka testovacího projektu 26007) je potřeba přesunout nebo smazat ručně;
aplikace staré složky sama nemaže.

**Schéma dat: 10** (přidáno: PRM_InvoiceBases → Druh).

---

## 0.14.0 — 1. 10. 2026 — Fotodokumentace jinak: dávky s názvem, poznámky, galerie, fotky do zápisu

**Nové**

- **Dávka fotek má název a datum** — složka `FOTO/2026-03-01 Mělký výkop` (přímo ve složce FOTO, bez podsložky roku). Název je libovolný text
  (nejvýš 60 znaků; znaky nepovolené v názvu složky SharePointu se vynechají). Nahrazuje dřívější jednoslovný přídomek.
- **Nahrávání fotek v detailu projektu → Fotodokumentace → Nahrát fotky.** Fotky se přidají (na počítači *Vybrat fotky*, na telefonu *Vyfotit*),
  **ke každé jde napsat poznámku** (mělký výkop, křivé provedení…). Pak se **označí fotky, které k sobě patří, a uloží se do dávky** (nová dávka
  s názvem a datem, nebo existující). Potom stejně další dávka. Datum složky je výchozí dnešek, jde změnit nebo vzít z data pořízení fotky.
- **Dodatečné přidání do dávky:** tlačítko *Přidat fotky* u dávky v galerii; fotky se přidají k těm, které tam už jsou.
- **Galerie tříděná podle složek:** záložka Fotodokumentace ukazuje dávky od nejnovější (název, datum, počet), rozbalení dává miniatury s poznámkami,
  kliknutí otevře fotku. Poznámku jde dodatečně přidat nebo upravit. **Aktualizovat** načte složky znovu — objeví se i fotky vložené do FOTO mimo aplikaci
  (aplikace nic nekopíruje, čte přímo SharePoint). Starší složky `FOTO/2026/2026-10-01_KD` se v galerii zobrazí taky.
- **Fotka z galerie do zápisu:** v bodu zápisu nové tlačítko **Z galerie projektu** — vybere se jedna nebo víc fotek z dávek projektu a zkopírují se
  do složky zápisu (zápis tak drží svou podobu a podpis/otisk platí dál).
- Poznámka k fotce se ukládá **přímo k souboru** (pole Název souboru v knihovně), takže s fotkou putuje při přesunu nebo kopírování.
- `#/foto` zůstává jako zkratka pro mobil (vybrat projekt a rovnou fotit); v levé nabídce není.

**Opraveno:** kontrola data `RRRR-MM-DD` už nepřijme neexistující den (`2026-13-45`).

**Bez změny schématu dat** (zůstává 9).

---

## 0.13.0 — 1. 10. 2026 — Složka Režie, deník a fotky jen z detailu projektu

**Opraveno**

- **Paralelní složka `General01_PROJEKTY`.** Při zakládání složek se z kořenové složky `General/01_PROJEKTY` mazalo lomítko, takže vznikla složka
  `General01_PROJEKTY` vedle skutečné. Teď se každý díl cesty čistí zvlášť a lomítko zůstane. Týkalo se i nově zakládaných projektů, nejen Režie.
- **Odkaz na složku nového projektu** mířil na poslední podsložku šablony místo na složku projektu. Teď míří na složku projektu.

**Nové**

- **Složka Režie je výjimka:** `General/01_PROJEKTY/99900-Režie/<rok>/…` — společná složka Režie, pod ní složky jednotlivých let a v každé běžná struktura složek
  projektu (03-Nákup, 04-Zápisy, …). Import projektů složku `99900-Režie` přeskočí. Číslo projektu Režie v aplikaci zůstává `26999`, `27999`…
- **Nabídka vlevo:** ve skupině Projekty zůstává Přehled projektů, Mapa projektů, Objednávky a Fakturace. **Stavební deník a Fotodokumentace** se otevírají
  až z detailu projektu (záložky). Nový zápis se tam otevře s předvyplněným projektem a jeho údaji; vše jde ve formuláři změnit.
  Objednávku a podklad pro fakturaci jde vytvořit i v detailu projektu (záložky Objednávky a Fakturace).

**Ručně:** složku `General01_PROJEKTY` (vznikla chybou) a případné projektové složky v ní přesuňte do skutečné `General/01_PROJEKTY` nebo smažte;
u Režie pak v detailu projektu klikněte na založení složek znovu (vznikne `99900-Režie/2026`) a odkaz na složku se přepíše.

**Bez změny schématu dat** (zůstává 9).

---

## 0.12.1 — 1. 10. 2026 — Jedna konvence složek podle skutečných projektů

**Opraveno**

- Aplikace zakládala ve složce projektu vlastní složky (`Zápisy`, `03_Nákup`), i když projekty mají `04-Zápisy` a podobně. Všechny výchozí názvy složek
  jsou teď **přesně podle skutečného projektu 26001** — dvojčíslí, pomlčka, název:
  - zápisy a stavební deníky → `04-Zápisy`,
  - fotodokumentace → `07-Dokumentace a podklady/FOTO`,
  - PDF objednávek → `03-Nákup/Objednávky` (složku `03-Nákup` zadavatel schválil),
  - PDF podkladů pro fakturaci → `03-Rozpočet projektu/Fakturace`.
- Názvy složek už nejsou v kódu napevno: **Nastavení → Složky projektů** má pole pro zápisy, fotky, objednávky i podklady pro fakturaci.
- **Šablona složek nového projektu** je shodná se skutečnou strukturou: 01-Nabídky, 02-Harmonogram, 03-Nákup (Objednávky), 03-Rozpočet projektu (Fakturace),
  04-Zápisy, 05-Smlouvy, 06-Dodavatelé, 07-Dokumentace a podklady, 09-Projektová dokumentace, 10-Servis.
- Hledání existující složky umí navíc **ignorovat číselnou předponu**: požadavek na `Zápisy` použije existující `04-Zápisy` (a naopak), takže ani
  starší uložená nastavení bez předpony nezaloží druhou složku. Datum `2026-10-01` se tím nezkrátí.

**Ručně:** v nastavení, které už někdo uložil, zůstávají staré hodnoty (např. `Zápisy`) — díky tolerantnímu hledání nevadí, ale doporučujeme je přepsat.
Zbylé složky `Zápisy` a `03_Nákup` v projektech (vznikly při zkoušení) je potřeba ručně přesunout/smazat; aplikace nic nemaže.

**Bez změny schématu dat** (zůstává 9).

---

## 0.12.0 — 1. 10. 2026 — Dávky fotek, jedna konvence složek, skupiny v nabídce, oprava kreslení

**Opraveno**

- **Náčrt nešel kreslit.** Okno s plátnem se vykreslovalo až po prvním průchodu, takže plátno zpočátku neexistovalo a kreslení zůstalo
  vypnuté. Plátno se teď sleduje správně; kreslení myší i prstem funguje a náčrt se vloží k bodu zápisu.
- **Dvě téměř stejné složky** (`07_Dokumentace a podklady` a `07-Dokumentace a podklady`). Výchozí cesta fotodokumentace je teď
  `07-Dokumentace a podklady/FOTO` (s pomlčkou, jak je ve vašich projektech). Navíc aplikace při ukládání souborů **hledá existující složku
  tolerantně**: podtržítko, pomlčka a mezera jsou totéž, velikost písmen a diakritika nerozhodují. Existující složka se použije, nová vznikne
  jen když opravdu chybí. Platí pro fotky, zápisy ze stavby, PDF objednávek a podkladů.

**Nové**

- **Fotky po dávkách.** 1. krok: *Nová dávka* — zvolíte, jestli se složka s datem určí **podle dne vložení** (výchozí), nebo **podle dne pořízení**
  každé fotky, a zadáte nepovinný **jednoslovný přídomek** (např. KD = kontrolní den; písmena, číslice a pomlčka, nejvýš 12 znaků, bez mezer).
  Složka dávky se jmenuje `rok-měsíc-den_PŘÍDOMEK`, např. `…/FOTO/2026/2026-10-01_KD`. 2. krok: do dávky se vkládají fotky (Vyfotit / Vybrat z galerie).
  Když složka dávky už existuje, nové fotky se přidají k ostatním. Dávku ukončíte tlačítkem a začnete další.
- **Nabídka vlevo ve skupinách.** Skupina **Projekty** (Přehled projektů, Mapa projektů, Objednávky, Fakturace, Stavební deník, Fotodokumentace)
  a skupina **Nastavení** (Nastavení aplikace, Uživatelé a role, Instalace a diagnostika). Skupiny jdou sbalit a rozbalit (aplikace si to pamatuje),
  skupina s otevřenou obrazovkou se rozbalí sama. Skupinu Servis přidáme, až bude modul hotový.
- **Odeslání e-mailu: oprávnění v tokenu.** Při chybě oprávnění hláška navíc ukáže, **která oprávnění přihlašovací token skutečně obsahuje**,
  a řekne, jestli v něm Mail.Send je (chyba je jinde) nebo chybí (odhlásit se a přihlásit znovu).

**Bez změny schématu dat** (zůstává 9).

---

## 0.11.1 — 1. 10. 2026 — Odesílání e-mailů: technický detail chyby

- Když se e-mail nepodaří odeslat, hláška teď **vždy obsahuje technický detail od Microsoftu** (stavový kód, kód chyby a jeho text).
  Dřív se každá chyba typu 401/403 zobrazila jako „chybí oprávnění" bez dalších údajů, takže nešlo poznat, jestli chybí schválení správce,
  prohlížeč drží starý přístupový token, nebo je problém se schránkou uživatele. Platí pro objednávky, podklady pro fakturaci,
  upozornění schvalovatelům i odeslání účtárně.

---

## 0.11.0 — 1. 10. 2026 — Fáze 2, krok 4: fotodokumentace z mobilu

**Nové**

- **Fotodokumentace** (nová položka v nabídce a záložka v detailu projektu), určená hlavně pro mobil: vybrat projekt, stisknout
  **Vyfotit** (foťák se spustí rovnou, dá se vyfotit víc fotek za sebou) nebo **Vybrat z galerie**. Naposledy zvolený projekt si
  prohlížeč pamatuje.
- Fotky se uloží do složky projektu **`07_Dokumentace a podklady / FOTO / rok / den`** (např. `…/FOTO/2026/2026-10-01`);
  složky vznikají samy při první fotce. Název souboru je z času pořízení a volitelného popisu, např. `Foto_20261001_142530_panely-jih.jpg`.
  Cesta základní složky se mění v *Nastavení → Složky*.
- Fotka se před nahráním zmenší (delší strana nejvýš 2 000 bodů, JPEG), takže nahrávání z mobilu je rychlé a složka nebobtná.
- **Fronta nahrávání:** fotky se nahrávají po jedné se stavem (čeká, nahrává, nahráno). Když se při slabém signálu některá nepovede,
  zůstane ve frontě a jde ji poslat znovu (jednotlivě nebo „Zkusit znovu vše"). Stránku je nutné nechat otevřenou, dokud nejsou nahrané.
- **Dnešní fotky projektu** jako miniatury (klik otevře fotku v nové kartě) a odkaz **Otevřít složku FOTO**.
- Fotky nahrává projektový manažer, asistent projektu a vedení (stejně jako zápisy ze stavby); ostatní fotky ve složce projektu vidí.

**Bez změny schématu dat** (zůstává 9). Po nahrání není nutná Instalace a diagnostika.

---

## 0.10.0 — 1. 10. 2026 — Fáze 2, krok 3: zápisy ze stavby a stavební deníky

**Nové**

- **Stavební deník** (nová položka v nabídce a záložka v detailu projektu): k jednomu projektu **víc deníků**, v každém zápisy
  s vlastním pořadovým číslem. Deník jde přejmenovat, vypnout a zapnout (tlačítko *Deníky projektu*).
- **Zápis** má hlavičku předepsanou z projektu (název stavby, místo, datum, projektový manažer) **a firemní údaje z Nastavení —
  vše jde před uzavřením upravit**; dále počasí a podmínky, účastníky (z Partnerů i jiné subjekty, přítomen / omluven),
  *Jednání s* (dodavatel nebo jiný subjekt), body jednání a dohodnuté úkoly (kdo, do kdy).
- **Fotky, náčrty a přílohy u bodů jednání:** tlačítko *Vyfotit* (v mobilu rovnou spustí foťák), *Přidat soubor nebo fotku*
  a *Nakreslit náčrt* (kreslení prstem nebo myší). Do fotky jde i **kreslit** (šipky, zakroužkování, popis závady). Fotky se před
  uložením zmenší (delší strana nejvýš 2 000 bodů) a leží ve složce zápisu ve složce projektu.
- **Výstupy:** PDF v grafice RES (vodoznak KONCEPT do uzavření, podpisové řádky přítomných) a **editovatelný Word** — obojí se při uzavření
  uloží do složky zápisu (*Zápisy / název deníku / Z007*, přílohy v podsložce *Přílohy*).
- **Podpis podle situace v terénu:** (1) **podpis v aplikaci** — zápis se uzavře (zamkne), zapíše se kdo a kdy a **otisk obsahu**
  (SHA-256 textu i všech fotek); podpis projde jen když se obsah od uzavření nezměnil; (2) **vytisknout, podepsat a nahrát sken** —
  sken se připojí k zápisu. Podepsaný zápis se už nemění. Jde o jednoduchý elektronický podpis, ne kvalifikovaný.
- **Znovu otevřít** (s důvodem, dokud není podepsaný), **storno** a **historie** zápisu z auditního logu. Smazání jen administrátorem
  (Nastavení → Jednorázové akce).
- **Nastavení → Složky:** *Složka zápisů a stavebních deníků* (výchozí `Zápisy`) a *Složka fotodokumentace* (výchozí
  `07_Dokumentace a podklady/FOTO`, využije se v dalším kroku). Chybějící složky vznikají při prvním uložení.

**Vyžaduje po nahrání:** *Instalace a diagnostika → Doplnit chybějící části* (schéma 9: nové seznamy *PRM – Stavební deníky* a
*PRM – Zápisy ze stavby*; nic se nemaže). V *Nastavení → Složky* zkontrolovat názvy složek podle skutečné struktury projektů.

---

## 0.9.0 — 30. 9. 2026 — Fáze 2, krok 2: podklady pro fakturaci

**Nové**

- **Fakturace** (nová položka v nabídce a záložka Fakturace v detailu projektu): seznam podkladů pro fakturaci napříč projekty s filtrem
  (hledání, stav, datum vystavení od–do, jen moje), řazením podle záhlaví a částkami v Kč; automaticky se obnovuje.
- **Podklad pro fakturaci:** číslo z řady **FP** (společná řada, reset každý rok, např. FP26004), odběratel = zákazník projektu
  (adresa, IČO a DIČ z Partnerů), položky, sazba DPH, měna, datum vystavení, DUZP a splatnost ve dnech (předvyplní se ze splatnosti
  zákazníka). Na projekt Režie se nefakturuje.
- **Cesta podkladu:** Koncept → Ke kontrole → Předáno účtárně → Vyfakturováno (číslo faktury z účetnictví) → Uhrazeno (datum úhrady),
  kdykoli před úhradou Storno s důvodem. Podklad vystavený asistentem nejdřív zkontroluje projektový manažer projektu (upozorní ho
  e-mail s odkazem); PM, vedení a administrátor mohou předat účtárně rovnou. Kontrolor může podklad vrátit s komentářem (vystavitel
  dostane e-mail), vystavitel ho může stáhnout zpět. Číslo faktury a úhradu zapisuje vystavitel, PM, vedení, administrátor nebo finance.
- **PDF podkladu v grafice RES** (hlavička firmy, odběratel, položky, DPH, termíny, místo pro číslo faktury z účetnictví), náhled
  před předáním a vodoznak, dokud podklad nebyl předán. Při předání se uloží do složky projektu `04_Fakturace`.
- **Předání účtárně e-mailem** (adresa z *Nastavení → Údaje firmy → E-mail účtárny*, upravitelná): e-mail s PDF odchází ze schránky
  přihlášeného uživatele; jde i „Jen uložit PDF a označit jako předáno". Podklad jde **poslat účtárně znovu**.
- **Historie podkladu** (kdo, kdy, co) z auditního logu, zobrazená v detailu.
- **Čeká na mě** ukazuje i podklady ke kontrole.
- **Smazání podkladu** (jen administrátor, Nastavení → Jednorázové akce) stejným postupem jako u objednávek: opsání čísla, koš webu, audit.
- Společné části PDF (hlavička, patička, tabulky) jsou ve sdíleném souboru, objednávky se chovají beze změny.

**Vyžaduje po nahrání:** *Instalace a diagnostika → Doplnit chybějící části* (schéma 8: do seznamu PRM – Podklady pro fakturaci přibude
Měna, Vystavil, Poznámka, Důvod storna, Předáno účtárně dne; nic se nemaže). V *Nastavení → Údaje firmy* vyplnit **E-mail účtárny**.

---

## 0.8.3 — 30. 9. 2026 — Opakované odeslání objednávky

- **Opakované odeslání objednávky končilo chybou „Soubor nebo složka … 03_Nákup již existuje“.** Při ukládání PDF do složky projektu se složka zakládala i tehdy, když už existovala. Teď se zakládá jen chybějící (platí i pro zakládání složek nového projektu).

---

## 0.8.2 — 30. 9. 2026 — Odeslání objednávky: srozumitelná chyba

- Když se odeslání (i opakované) nepovede, hláška říká, **který krok selhal** (vytvoření PDF, uložení PDF do složky projektu, odeslání e-mailu, zápis do objednávky) a proč; pokud e-mail už odešel, upozorní, že se nemá posílat znovu.
- U **opakovaného** odeslání už neblokuje odeslání e-mailu to, že se nepovedlo přepsat PDF ve složce projektu (PDF tam už je).

---

## 0.8.1 — 30. 9. 2026 — Číslování objednávek, částky v Kč, vzhled filtrů, šedá mapa

**Opraveno**

- **Všechny objednávky měly stejné číslo (OBJ-2026-0001).** Čítač se hledal filtrem na prázdný klíč rozsahu, který SharePoint
  nespolehlivě vyhodnocuje, takže se pro každé číslo založil nový čítač. Teď se řádek čítače vybírá v aplikaci
  (a při více řádcích platí ten s nejvyšší hodnotou). Navíc se před uložením objednávky ověří, že číslo nemá jiná objednávka;
  kdyby čítač zaostával, sám se dorovná podle nejvyššího existujícího čísla (jen nahoru) a číslo se přidělí znovu.
- **Sloupec Bez DPH ukazuje vždy koruny.** Objednávky v EUR a USD se přepočtou kurzem ČNB z Nastavení → Kurzy (před částkou je ≈,
  původní částka je v bublině). Podle sloupce jde i řadit.
- **Filtry v přehledu objednávek jsou zarovnané** na jednu linii (každý prvek má popisek nad sebou, tlačítko Obnovit a počet vpravo).
- **Mapa projektů: šedý podklad** (výchozí), aby zelené špendlíky nesplývaly s lesy a poli. Vpravo dole jde přepnout na původní
  barevnou mapu; volba se pamatuje. Platí i pro výběr polohy v projektu.

**Nové**

- **Mazání objednávek (Nastavení → Jednorázové akce) rozliší objednávky se stejným číslem**: ukáže je všechny s datem, projektem,
  předmětem, částkou a ID a smaže se jen ta vybraná.
- **Opravit duplicitní čísla objednávek** (Jednorázové akce): nejstarší objednávka si číslo ponechá, ostatním se přidělí další volná.
  Nic se nemaže, každá změna jde do historie objednávky.

**Bez změny schématu dat** (zůstává 7).

---

## 0.8.0 — 30. 9. 2026 — Objednávky: zpětná vazba z ostrého zkoušení

**Opraveno**

- **Náhled PDF zavřel celou objednávku.** Okna (náhled PDF, odeslání, výběr schvalovatele, komentář) se otevírala
  vedle panelu objednávky, takže klik v nich panel považoval za klik „ven" a zavřel se. Teď jsou uvnitř panelu;
  náhled se zavře sám a rozepsaná objednávka zůstane.
- **Objednávka nad 1 000 000 Kč nešla schválit** („schvaluje se mimo aplikaci"). Schvaluje se v aplikaci: projektový
  manažer → vedení → jednatel, stejně jako v pásmu jednatele. Nic už nezůstane viset mimo aplikaci.
- **Seznam objednávek neukázal změnu od někoho jiného** (např. zamítnutí). Seznam, „Čeká na mě", záložka projektu
  i otevřený detail se obnovují sami každých 30 sekund a při návratu do okna; v seznamu je i tlačítko Obnovit.
- **Soubory a PDF ve složce projektu** se otevírají vždy v nové kartě (a odpojeně od aplikace), takže jejich zavření
  nezavře aplikaci. Platí pro PDF objednávky, přílohy, dokumenty projektu i tlačítko Otevřít složku.
- **Zakládání skupin rolí** (např. PRM Jednatelé): jedna neúspěšná skupina nezastaví ostatní, chyba se ukáže celá
  s návodem na ruční založení, a u chybějící role je na kartě tlačítko **Založit skupinu**.

**Nové**

- **Přílohy jako dlaždice s miniaturou** (velikost středních ikon ve Windows): obrázek přímo, u PDF první strana,
  ostatní ikonou podle typu souboru. Kliknutím se soubor otevře v nové kartě.
- **Změna schvalovatele tlačítkem** *Změnit schvalovatele* u objednávky čekající na schválení (i když je určený člověk
  na dovolené); nabídne všechny nevyřízené kroky. Už schválený krok ani schválenou objednávku nejde měnit.
- **E-mail schvalovateli** s odkazem přímo na objednávku: po odeslání ke schválení, po schválení předchozího kroku a po
  změně schvalovatele. Vystavitel dostane e-mail o výsledku (schváleno, vráceno, zamítnuto). Odchází ze schránky
  toho, kdo akci provedl (Microsoft Graph, stejné oprávnění jako odeslání dodavateli). Nepodaří-li se, objednávka
  zůstane platná a aplikace na to upozorní.
- **Úprava po schválení a zamítnutí.** Schválenou (ještě neodeslanou) i zamítnutou objednávku jde upravit; úprava smaže
  dosavadní schvalování a objednávku je nutné znovu odeslat ke schválení (aplikace na to před uložením upozorní).
- **Odeslat znovu** u odeslané objednávky — na stejnou nebo jinou adresu. Stav se nemění, do historie se zapíše komu a kdy.
- **Smazání objednávky jen administrátorem** (*Nastavení → Jednorázové akce*): ukáže se, o jakou objednávku jde, a musí se
  opsat její číslo. V SharePointu zůstane v koši webu, do historie se zapíše, kdo ji smazal. Běžně se objednávky stornují.
- **Datum vystavení** v přehledu objednávek, filtr *Vystaveno od – do* a řazení kliknutím na záhlaví sloupců.
- V přehledu se u čekající objednávky místo role ukazuje jméno určeného schvalovatele.

**Bez změny schématu dat** (zůstává 7). Po nahrání není nutná Instalace a diagnostika.

---

## 0.7.0 — 30. 9. 2026 — Objednávky: PDF, e-mail, přílohy, měny, schvalovatel

**Opraveno**

- **„Neznámá nebo neaktivní číselná řada OBJ"** při zakládání objednávky. Na webu byla v seznamu řad jen řada
  pro projekty. Chybějící výchozí řada (OBJ, FP, PP) se teď doplní sama při prvním použití; existující řádky
  se nikdy nepřepisují a vypnutá řada zůstane vypnutá.
- **Součet hodnoty aktivních projektů sčítal Kč i EUR dohromady.** Součet je teď vždy v Kč, cizí měny se
  přepočítají kurzem ČNB.

**Nové**

- **PDF objednávky v grafice RES** (logo, údaje firmy, dodavatel, položky, DPH, schvalovatelé) a tlačítko
  **Náhled objednávky**. Neschválená objednávka má přes stránku vodoznak „NÁHLED – NESCHVÁLENO".
- **Odeslání dodavateli:** po schválení tlačítko Odeslat dodavateli — adresát předvyplněný z partnera, kopie,
  předmět a text jdou upravit. E-mail odchází ze schránky přihlášeného uživatele (Microsoft Graph) s PDF
  a volitelně s přílohami. PDF se uloží do složky projektu (`03_Nákup/Objednávky`). Bez schváleného oprávnění
  e-mailu je k dispozici cesta „Jen uložit PDF a označit jako odesláno".
- **Přílohy objednávky** (více souborů, odebrání jen u konceptu a vrácené objednávky).
- **Měny CZK, EUR a USD.** Objednávka se sčítá v měně, kterou zvolíte (výchozí CZK), u cizí měny se ukáže
  přepočet do Kč. Kurzy ČNB se zapisují v *Nastavení → Kurzy* (návod na automatiku: docs/KURZY-CNB.md).
- **Výběr schvalovatele.** Při odeslání ke schválení je schvalovatel předvyplněný (PM projektu; vedení a
  jednatel podle číselníku v *Nastavení → Schvalování*) a žadatel ho může změnit. Dokud objednávka čeká,
  jde schvalovatele změnit odkazem Změnit. Vystavitel nemůže být schvalovatelem.
- **Schéma dat 7:** nový seznam PRM – Kurzy, měna USD.

**Vyžaduje po nahrání:** *Instalace a diagnostika*; v SharePoint admin centru potvrdit požadavek na oprávnění
*Microsoft Graph – Mail.Send* (Zabezpečení → Přístup k rozhraní API), jinak e-maily neodejdou; v *Nastavení → Kurzy*
zapsat kurzy ČNB.

---

## 0.6.0 — 30. 9. 2026 — Fáze 2, krok 1: objednávky a schvalování

**Nové**

- **Objednávky** (menu Objednávky, záložka Objednávky v detailu projektu, stránka Čeká na mě):
  vystavení, položky s DPH, schvalování, odeslání dodavateli, dodání, uzavření, storno s důvodem.
  Čísla `OBJ-2026-0001` bez děr; objednávky se nemažou, jen stornují.
- **Schvalování podle limitů z Nastavení:** do limitu PM schvaluje PM projektu, nad ním navíc vedení,
  nad limitem vedení navíc jednatel, nad limitem jednatele se schvaluje mimo aplikaci. Vlastní objednávku
  nesmí schválit nikdo. Objednávku vystavenou PM schvaluje vedení (rozhodnutí zadavatele; přepínač
  v Nastavení to umí změnit). Režii schvaluje vždy vedení. Eura se pro určení pásma přepočítají kurzem z
  Nastavení.
- **Nová role Jednatel** (skupina „PRM Jednatelé").
- Každé rozhodnutí se zapisuje do historie schvalování a každá změna stavu do auditního logu; zápis
  stavu hlídá souběh (dva schvalovatelé najednou).
- **Schéma dat 6:** nové sloupce v seznamu objednávek (kdo je na řadě, řetěz schválení, důvod storna).
- **Tlačítko Domeček** v hlavičce: zpět na úvodní stránku webu SharePointu, když je aplikace na celé okno.

**Zatím není** (další kroky Fáze 2): PDF objednávky, e-maily schvalovatelům, podklady pro fakturaci.

---

## 0.5.4 — 30. 9. 2026 — Tlačítko Celé okno: úprava

**Změněno**

- Tlačítko „Celé okno" je **úplně vpravo v hlavičce** (za jménem) a má **pořád stejnou ikonu**.
  Dřív se ikona měnila podle stavu a šipky ukazovaly opačně, než bylo potřeba.

---

## 0.5.3 — 30. 9. 2026 — Aplikace na celé okno

**Nové**

- **Tlačítko „Celé okno" v hlavičce aplikace** (vpravo nahoře, vedle jména). Schová horní lištu
  SharePointu, záhlaví webu i jeho navigaci, takže aplikace má celé okno prohlížeče. Stránku
  znovu otevře se zapnutým `env=WebView` a zůstane na stejné obrazovce; druhým kliknutím se
  lišta vrátí. Řeší to, že odkaz z úvodní stránky webu parametr ztrácel.

---

## 0.5.2 — 30. 9. 2026 — Oprava odkazů na složky projektů

**Opraveno**

- **Tlačítko „Otevřít složku projektu" vedlo na „404 NOT FOUND"** u naimportovaných projektů.
  Import skládal odkaz z názvu knihovny, který lidé vidí („Dokumenty"), místo z její skutečné
  adresy („Shared Documents"). Stejný chybný odkaz používala i záložka Dokumenty a omezení
  přístupu ke složce. Import teď adresu skládá správně.
- **Nové tlačítko Opravit odkazy** (Nastavení → Jednorázové akce) opraví už uložené odkazy.
  Přepisuje jen odkazy poznatelně tohoto špatného tvaru; správné a jinam mířící nechává být,
  dá se pustit opakovaně.

---

## 0.5.1 — 30. 9. 2026 — Ikona aplikace

**Nové**

- **Ikona PRM Revoltum** (navy dlaždice se zeleným bleskem z loga RES). Ikonu má balíček
  aplikace (Obsah webu, katalog aplikací) i web part v nabídce při úpravě stránky.
  Zdrojové soubory jsou v `brand/ikona/` (SVG a PNG 40, 96, 192 a 512 px), např. pro
  dlaždici na úvodní stránce webu.

---

## 0.5.0 — 30. 9. 2026 — Stav v seznamu, hromádky na mapě, pořadí sloupců

**Nové**

- **Stav projektu jde změnit přímo v seznamu** (rozbalovací štítek ve sloupci Stav),
  bez otevření detailu. Mění se jen stav, ostatní údaje projektu zůstanou. Kdo projekt
  upravovat nesmí, vidí obyčejný štítek. Při přepnutí na Dokončeno bez skutečného
  ukončení se doplní dnešní datum a aplikace to řekne.
- **Pořadí sloupců si každý nastaví sám** přetažením záhlaví. Pamatuje si ho prohlížeč,
  zvlášť pro každého uživatele; odkaz „Obnovit výchozí pořadí" vrátí původní.
  Výchozí pořadí: Číslo, Název, Projektový manažer, **Stav**, Rozpočet, Cena, Termín…
- **Filtry, hledání a řazení seznamu se zapamatují** po dobu otevřené karty, takže po
  návratu z detailu projektu je seznam tak, jak jste ho nechali.
- **Tlačítko „Zpět na seznam projektů"** v detailu projektu.
- **Projekty na stejném místě se na mapě rozestoupí do hromádky** (špendlíky vedle sebe
  za sebou); najetím myší se špendlík vysune dopředu a ukáže bublinu.

---

## 0.4.0 — 30. 9. 2026 — Stavy projektů a barvy na mapě

**Změněno**

- **Stav „Uzavřeno" je zrušený** (byl nadbytečný vedle „Dokončeno"). Projekty, které ho
  mají uložené, se berou jako dokončené; ve SharePointu se nic nepřepisuje.
- **Nový stav „Reklamace"** (červený, mezi Dokončeno a Storno). Projekt v reklamaci se
  zatím nepočítá mezi aktivní v přehledových dlaždicích.
- **Špendlíky na mapě mají barvu podle stavu projektu**, ne podle typu: Nabídka bílá,
  Příprava nazelenalá, Realizace sytě zelená, Pozastaveno žlutá, Dokončeno tmavě zelená,
  Reklamace a Storno červená. Stejnou paletu mají štítky stavu v seznamu projektů.
- **Legenda v rohu mapy** ukazuje všechny stavy s počty; kliknutím se stav skryje nebo
  znovu zobrazí. Typ projektu zůstává v bublině po najetí, přibyl v ní řádek Stav.
- **Seznam projektů: Stav je první sloupec.**
- **Schéma dat 5:** instalační průvodce umí do stávajících sloupců typu Volba **doplnit
  nové volby** (nic neubere, nic nepřepíše) — tak se do sloupce Stav doplní „Reklamace".

---

## 0.3.1 — 29. 9. 2026 — Srozumitelná hláška, když web nemá doplněné schéma

**Opraveno**

- **Uložení polohy projektu na webu bez schématu 4 skončilo nesrozumitelnou chybou**
  („property Latitude does not exist"). Po nahrání nového balíčku je nutné jednou
  spustit Správa → Instalace a diagnostika. Aplikace teď před zápisem ověří, že
  sloupce existují, a když ne, řekne co udělat; nic se neuloží a při zakládání
  projektu se nespotřebuje číslo. Totéž platí pro zahraničního partnera a sloupec Země.

---

## 0.3.0 — 29. 9. 2026 — Režie jen pro vybrané, zahraniční partneři, výběr PM

**Nové**

- **Projekt Režie je omezený.** Záznam i složka dostanou vlastní oprávnění: uvidí
  ji jen Administrátoři, Vedení a Finance. Projektoví manažeři a asistenti ji
  v seznamu ani v knihovně dokumentů neuvidí (skrývá to SharePoint, ne aplikace).
  Nová Režie se zamyká hned při založení. Už založenou Režii zamkne administrátor
  tlačítkem „Omezit přístup" v jejím detailu; pruh tam ukazuje skutečný stav
  oprávnění přečtený ze SharePointu. Nic se nemaže, jen se přidávají skupiny.
- **Zahraniční partneři.** V kartě partnera je výběr země (členské státy EU).
  U zahraničních firem se místo ARES vyplňuje registrační číslo a DIČ / VAT ID
  s předponou země; formát DIČ se kontroluje jako upozornění, ne zákaz uložení.
  Automatické dohledání v zahraničních registrech zatím není (viz ROZHODNUTI).
- **Řazení seznamu projektů.** Výchozí je podle čísla vzestupně. Klik na záhlaví
  (Číslo, Název, Projektový manažer, Celková cena, Termín, Zahájení, Ukončení, Stav)
  řazení přepne, druhý klik obrátí směr. Projekty bez hodnoty jsou vždy na konci.
  Export do Excelu drží stejné pořadí jako na obrazovce.
- **Schéma dat 3:** nový sloupec „Země" v PRM_Partners. Po nahrání balíčku ho
  doplní Správa → Instalace a diagnostika (jen přidá, nic nesmaže).

- **Mapa projektů** (nová položka v menu). Špendlík má barvu podle typu projektu.
  Po najetí se ukáže bublina: název, typ, semafor rozpočtu, semafor termínů
  (červená po termínu, žlutá do 14 dní) a projektový manažer; po kliknutí se
  otevře projekt. Legenda nad mapou umí typy skrývat. Projekty bez polohy jsou
  vypsané pod mapou.
- **Výběr lokality z mapy.** V úpravě i zakládání projektu: napíšete místo, kliknete
  na „Najít na mapě“, mapa se otevře se špendlíkem na nalezeném místě; špendlík jde
  přesunout kliknutím nebo přetažením. Mapy: OpenStreetMap, hledání míst: Nominatim
  (bez klíče a bez poplatků).
- **Schéma dat 4:** sloupce Zeměpisná šířka a délka v PRM_Projects (jen přidání).
  Dokud se schéma nedoplní, aplikace funguje dál, jen bez polohy.

**Opraveno**

- **Zákazníka v úpravě projektu nešlo vybrat.** Kliknutí do pole seznam neotevřelo,
  otevírala ho jen malá šipka vpravo. Teď se seznam otevře i klikem do pole (v úpravě
  i v zakládání projektu). Když v Partnerech nikdo není, pole to řekne.
- **Typy projektů (a šablonu složek) v Nastavení nešlo upravit.** Pole po každém
  stisku klávesy smazalo prázdný řádek, takže nový řádek nešlo přidat. Teď jde
  přidávat, přepisovat i mazat položky normálně.
- **Nabídka projektových manažerů obsahovala jen lidi, kteří už nějaký projekt
  mají** — v filtru dashboardu, v úpravě projektu i při zakládání. Teď se bere
  z členů rolí Projektový manažer a Administrátor.

---

## 0.2.4 — 29. 9. 2026 — Oprava po prvním nasazení

První verze nasazená na ostrý SharePoint. Instalace datové struktury proběhla
napoprvé, hledání lidí ne.

**Opraveno**

- **Záložky se při úzké ploše odřízly a byly nedostupné** (v Nastavení „Údaje
  firmy" a „Jednorázové akce", v detailu projektu poslední záložky). Aplikace
  běží uvnitř stránky SharePointu s vlastním záhlavím a menu, takže je na ni
  míň místa, než se čekalo. Nevešlé záložky se teď schovají pod tlačítko
  „Další záložky". Ověřeno v okně o šířce 1000 px.
- **Knihovna „Dokumenty" se nenašla — import, záložka Dokumenty i zakládání
  složek.** SharePoint zobrazuje výchozí knihovnu lokalizovaně („Dokumenty"),
  ale hledání podle názvu pracuje s názvem uloženým při založení webu
  („Documents"). Na anglicky založeném webu prohlíženém česky proto vracelo
  404, i když knihovna je před očima. Aplikace teď knihovnu hledá i podle názvu
  v adrese (`Shared Documents`). Když ji nenajde, hláška vypíše knihovny,
  které na webu skutečně jsou, takže je jasné, co zadat.
- **Skupiny rolí vznikly bez jakéhokoli oprávnění na webu.** Na stránce
  *Oprávnění webu* se proto neobjevily a člen role by aplikaci neotevřel.
  Hláška v aplikaci přitom tvrdila, že mají právo Číst — nemaly žádné.
  „Založit chybějící skupiny" teď skupinám bez oprávnění přidělí výchozí úroveň
  (administrátoři Úplné řízení, PM/asistenti/vedení Úpravy, finance a čtenáři
  Čtení). **Skupině, která už oprávnění má, nesahá.** Úrovně se hledají podle
  jazykově nezávislého typu, ne podle českého názvu. Šest už založených
  skupin se opraví dalším kliknutím.
- **Hledání lidí při přiřazování rolí končilo HTTP 400.** Tři chyby najednou
  v požadavku na `ClientPeoplePickerSearchUser`:
  - posílalo se `__metadata` ze starého formátu `odata=verbose`, který se tluče
    s hlavičkou `OData-Version: 4.0`, kterou SPHttpClient přidává sám,
  - chybělo `SharePointGroupID`, bez kterého endpoint požadavek odmítne,
  - chybová hláška zahazovala odpověď serveru, takže z ní nešlo zjistit příčinu.
  Nález jde jen na ostrém tenantu — v ukázkovém režimu se toto rozhraní nevolá.

---

## 0.2.0 — 23. 9. 2026 — Fáze 1: Projekty (MVP)

Aplikace umí vést projekt od založení po předání: dá mu číslo, složky,
termíny a dokumenty. Stávající projekty RES se naimportují ze složek.

**Přidáno**

- **Číselné řady a čítače dokladů.** Číslo se přiděluje až při uložení, ne
  při otevření průvodce. Souběh (dva lidé zakládají projekt naráz) řeší
  optimistický zámek — nikdo nedostane číslo, které už má někdo jiný.
- **Partneři** — zákazníci a dodavatelé, s **dotažením údajů z ARES podle
  IČO**: název, sídlo, DIČ a příznak plátce DPH.
- **Založení projektu** průvodcem: náhled čísla a názvu, výběr nebo založení
  zákazníka, cena, termíny. Po uložení vznikne struktura složek podle šablony
  z Nastavení. Když se složky nepodaří založit, projekt zůstane uložený
  a nabídne se opakování.
- **Úprava projektu** — stav, zákazník, cena, termíny, název. Číslo projektu
  se nemění nikdy. Aplikace hlídá termíny pozpátku, zápornou cenu a ukončený
  projekt bez data ukončení. Při souběžné úpravě dvou lidí se druhé uložení
  zastaví, místo aby přepsalo cizí změnu.
- **Mazání projektu** — jen administrátor, s potvrzením opsáním čísla.
  Maže se do koše SharePointu (93 dní na obnovu), složka s dokumenty zůstává
  a do auditního logu se zapíše kdo, kdy a proč.
- **Projekt Režie** pro režijní objednávky a náklady mimo zakázky. Číslo má
  tvar `{RR}999` — jedna Režie na rok, čítač projektů nezvyšuje.
- **Uživatelé a role** — přiřazování rolí lidem, kteří mají účet v Microsoftu 365.
  Role odpovídají skupinám SharePointu; aplikace účty nezakládá.
- **Import stávajících projektů ze složek** — přečte složky v knihovně, ukáže
  plán a založí k nim záznamy. Složky nepřejmenovává ani nepřesouvá. Po importu
  čítač navazuje za nejvyšším existujícím číslem.
- **Smluvní termíny plnění** jako milníky, se sledováním nejbližšího termínu
  na dashboardu. Zmeškaný termín má přednost před budoucím.
- **Záložka Dokumenty** — posledních 10 změněných souborů ve složce projektu
  včetně podsložek, s odkazem na otevření v SharePointu.
- **Export tabulky do Excelu** — stáhne to, co je právě vyfiltrované. Částky
  a data jsou čísla a data, ne text, takže se s nimi dá v Excelu počítat.
- **Limity schvalování objednávek** v Nastavení (100 tis. / 500 tis. / 1 mil.)
  s výpisem vět, co zadaná čísla znamenají. Workflow přijde ve Fázi 2.
- Dashboard: kompaktní pruh KPI na podkladové grafice RES, filtr podle
  projektového manažera.
- Do formulářů jde datum **napsat** česky (`20. 9. 2026`), nejen vyklikat.
- 351 unit testů.

**Změněno**

- Terminologie: v celé aplikaci i dokumentaci je „projekt", nikde „zakázka".
- Formát čísla projektu je **`26001`** (bez pomlčky) — navazuje na čísla, která
  RES používá na složkách. Dřívější návrh `26-001` byl chybný zápis.

---

## 0.1.0 — 11. 9. 2026 — Fáze 0: Základ

První funkční verze. Aplikace běží, ví, kdo jste a co smíte, a umí si sama
založit svou datovou strukturu na SharePointu.

**Přidáno**

- Kostra SPFx 1.23.2 (React 17, TypeScript 5.8, Fluent UI v8, PnPjs v4),
  build přes Heft. Verze schématu dat: 1.
- Vzhled v barvách RES — vlastní Fluent UI theme, logo v hlavičce,
  claim v patičce, české formáty čísel a dat (`1 234 567 Kč`, `11. 9. 2026`).
- Rámec aplikace: hlavička, levá navigace skládaná podle rolí, patička,
  navigace přes adresu v prohlížeči (`#/projekty`, `#/projekt/26-014`).
- Rozpoznání přihlášeného uživatele a jeho rolí ze skupin SharePointu.
  Přístup k důvěrným finančním modulům se ověřuje **skutečným dotazem**
  na web PRM-Finance, ne jen podle role.
- Dashboard projektů: dlaždice KPI, tabulka se sloupci podle zadání,
  filtry (stav, typ, jen moje), fulltext, semafor rozpočtu s vysvětlením.
- Detail projektu — záložka Přehled; ostatní záložky připravené s popisem,
  ve které fázi přijdou.
- **Instalace a diagnostika**: aplikace si sama zkontroluje a založí
  17 seznamů a knihoven na webu PRM (+4 na webu PRM-Finance) včetně sloupců a indexů. Nikdy nic nemaže,
  jde spustit opakovaně.
- **Nastavení**: složky projektů a jejich šablona, vzor názvu projektu, typy
  projektů, kategorie rozpočtu, prahy semaforu, limity schvalování, názvy
  skupin rolí, fakturační údaje RES.
- Nápověda v aplikaci — mimo jiné vysvětlení, proč prohlížeč neotevře
  Průzkumník a jak si knihovnu synchronizovat přes OneDrive.
- **Ukázkový režim** — celá aplikace funguje na smyšlených datech bez
  SharePointu. Přepíná se ve vlastnostech web partu.
- 120 unit testů (formáty, role a oprávnění, nastavení, schéma dat,
  generování XML sloupců, router, výpočty dlaždic).
- Dokumentace: `README.md` (nasazení krok za krokem), `CLAUDE.md`
  (pravidla projektu), `docs/testy/faze-0.md` (testovací scénáře),
  `brand/BARVY.md` (paleta RES).

**Rozhodnutí, která stojí za zmínku**

- Projekt leží v `C:\Projekty\prm-revoltum`, **mimo OneDrive** — složka
  `node_modules` má přes 100 000 souborů a synchronizovala by se celé firmě.
- Seznamy se zakládají pod anglickým názvem a teprve pak přejmenují na český.
  Adresa seznamu tak zůstane čitelná (`/Lists/PRM_Projects`).
- Nové sloupce se **nepřidávají** do výchozího zobrazení seznamu — u 25 sloupců
  by bylo nečitelné. S daty se pracuje v aplikaci.
- Zjištěno a ověřeno v dokumentaci Microsoftu: SPFx od verze 1.22 **nepoužívá
  gulp**, ale Heft. Starší návody z internetu proto neplatí.
