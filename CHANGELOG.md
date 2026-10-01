# Historie změn

Formát: jedna verze = jedna dokončená fáze nebo významná oprava.
Datum ve tvaru den. měsíc. rok.

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
