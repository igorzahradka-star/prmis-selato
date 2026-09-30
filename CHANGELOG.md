# Historie změn

Formát: jedna verze = jedna dokončená fáze nebo významná oprava.
Datum ve tvaru den. měsíc. rok.

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
