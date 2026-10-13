# Kontrolní seznam testování — verze 0.31 až 0.36 (zapsáno 8. 10. 2026)

Určeno pro Igora. Zkoušejte na ostrém SharePointu (nebo na testovacím projektu), po nahrání balíčku **0.36.0.0** a po spuštění **Správa → Instalace a diagnostika** (schéma 20 přidává dva sloupce do seznamu rozpočtů). U každého bodu stačí zapsat **OK**, nebo co se stalo jinak. Automatické testy (1164) prošly, ale na živých datech a ve skutečném prohlížeči je zkouší teprve tento seznam.

Doporučení: založte si **testovací projekt** (číslo s názvem „TESTOVACÍ“) a zkoušejte na něm, ať se nic nemíchá se skutečnými projekty.

## 0. Nahrání balíčku a kontrola

Postup nahrání (jinak se aplikace nenasadí, i když katalog ukazuje novou verzi):

1. Katalog aplikací → **Upload** → `spfx/sharepoint/solution/prm-revoltum.sppkg`.
2. V dialogu zvolit **Deploy** (nasadit).
3. Dialog s nabídkou synchronizace do Teams potvrdit tlačítkem **I'll do it later**. Nezavírat křížkem a nepřeskakovat — bez toho se balíček nenasadí.
4. Na `PRM.aspx` stisknout `Ctrl+F5` a zkontrolovat verzi v patičce.

Kontrola:
- [ ] V Instalaci a diagnostice nic nechybí (zelené), schéma 20.
- [ ] Verze v patičce / O aplikaci je 0.36.0.0.
- [ ] Domovská stránka se načte, seznam projektů se zobrazí.

## 1. Schvalování rozpočtu (0.32 a 0.36)
- [ ] V Realizačním rozpočtu se zobrazí tlačítko **Požádat o schválení** (vpravo).
- [ ] Po kliknutí se otevře okno **Schvaluje: Vedení** s výběrem „Kdokoli z role“ a jmen členů vedení / administrátorů (žadatel v nabídce není).
- [ ] Vyberte **konkrétního člověka** → u rozpočtu stojí „čeká na schválení: <jeho jméno>“.
- [ ] Přihlášený **vybraný schvalovatel** vidí rozpočet na stránce **Čeká na mě** a tlačítka **Schválit** (zelené) a **Vrátit k úpravě** (žluté), vpravo vedle sebe.
- [ ] **Jiný člen vedení** (ne vybraný) rozpočet na Čeká na mě nevidí a schválit ho nemůže. Administrátor ano.
- [ ] Žadatel může **Stáhnout žádost**; po stažení výběr zmizí.
- [ ] Žádost bez výběru („Kdokoli z role“) smí schválit kdokoli z vedení.
- [ ] Po Schválení / Vrácení se rozpočet zobrazí bez chyby (žádná bílá stránka — oprava z 0.32.2).
- [ ] Barvy tlačítek: Schválit zelená, Vrátit k úpravě žlutá, Zamítnout červená — i u objednávek a podkladů pro fakturaci.
- [ ] Na stránce Čeká na mě jsou rozpočty ke schválení i objednávky.

## 2. Partneři (0.30.1 a 0.36)
- [ ] V seznamu partnerů klik na ikonu koše u nepoužitého partnera → nabídne smazání (do koše SharePointu).
- [ ] Použitého partnera nejde smazat, nabídne se **Nastavit jako neaktivního**.
- [ ] **Nové:** v panelu **Upravit partnera** je dole vpravo tlačítko **Smazat partnera…**, otevře stejné okno. (Vidí ho jen ten, kdo smí mazat.)
- [ ] Při zakládání partnera s podobným názvem se objeví upozornění na duplicitu.

## 3. Fakturace (0.31)
- [ ] U podkladu pro fakturaci jde změnit **Odběratele** i **Objednatele**; výchozí je zákazník projektu.
- [ ] Na PDF je blok **OBJEDNATEL** jen tehdy, když se liší od odběratele.

## 4. Harmonogram (0.32 – 0.35)
- [ ] V záložce Harmonogram přidejte 3 úkoly a 1 milník, závislosti zapište do sloupce Předchůdci (např. `1`, `2SS+2`).
- [ ] Termíny se spočítají v pracovních dnech (víkendy a státní svátky se přeskočí).
- [ ] Kritická cesta je červeně; při smyčce v závislostech se objeví chyba a export je vypnutý.
- [ ] **Uložit harmonogram**, obnovit stránku — vše zůstane.
- [ ] Zafixovat baseline → po posunu úkolu se ukáže odchylka.
- [ ] Smluvní termín: úkol, který ho nestíhá, je označený.
- [ ] **Ganttův diagram**: pruhy, milník, šipky, dnešek (zelená čára), tlačítka Dny / Týdny / Měsíce a Dnes.
- [ ] Vodorovný posuvník diagramu je lepený na dolní okraj okna.
- [ ] Termíny z harmonogramu se promítnou do Nejbližšího termínu na přehledu projektu / dashboardu.

## 4a. Úpravy přímo v Ganttově diagramu (0.37)
- [ ] Po otevření Harmonogramu **nehlásí** „Našli jsme rozepsaný harmonogram“ (jednou stačí kliknout **Zahodit**; po uložení se hláška už nesmí vracet).
- [ ] **Přesun:** chytněte pruh úkolu a posuňte ho — během tažení se ukáže bublina s daty, po puštění se termín změní (víkendy se přeskočí).
- [ ] Úkol **s předchůdcem** posunutý doprava: v tabulce předchůdců přibyla prodleva (např. `1FS+2`); posun předchůdce potáhne i tento úkol.
- [ ] **Délka:** tažení pravého okraje pruhu změní trvání. **Hotovo %:** tažení trojúhelníčku v pruhu.
- [ ] **Vazba:** najeďte na pruh, chyťte kuličku na konci a pusťte na jiný pruh (na jeho začátek nebo konec) — vznikne šipka, otevře se editor vazby (typ, prodleva, smazat).
- [ ] Vazba do smyčky nebo duplicitní se odmítne s vysvětlením.
- [ ] Kliknutí na šipku → změna typu (FS/SS/FF/SF) a prodlevy, tlačítko Smazat vazbu (nebo klávesa Delete).
- [ ] **Nový úkol:** tažením v prázdném řádku dole; název jde hned psát.
- [ ] **Přeskládání řádků** za úchyt ⋮⋮ vlevo — vazby se nepřetrhnou, čísla se přečíslují.
- [ ] **Zpět / Znovu** (tlačítka i Ctrl+Z / Ctrl+Y) vrací všechny úpravy z diagramu.
- [ ] Po **Uložit harmonogram** a obnovení stránky vše zůstane (pořadí, vazby, termíny).
- [ ] Tažení myší funguje i na dotykové obrazovce (pokud ji používáte).

## 4b. Stavební deník (0.38)
- [ ] **Nový zápis:** mezi účastníky je hned přihlášený uživatel (jméno, firma, role „zapisovatel“, přítomen); jde odebrat nebo upravit.
- [ ] Nový **předávací protokol** má mezi účastníky také autora.
- [ ] **Uzavřený zápis:** v detailu je sekce „Dodatečné přílohy“ s tlačítkem „Přiložit sken nebo fotku“; nahrajte PDF i fotku — objeví se dlaždice a zápis zůstane uzavřený.
- [ ] **Podepsaný zápis:** totéž (tlačítko je vidět i po podpisu); stav zůstane „Podepsáno“, PDF a podpis se nezmění.
- [ ] V **Historii** zápisu přibyl řádek „Dodatečně přiloženo (n): názvy souborů“ s jménem a časem.
- [ ] Ve složce zápisu na SharePointu je podsložka „Dodatečné přílohy“ se soubory.
- [ ] U **konceptu** sekce dodatečných příloh není (soubory se přidávají v bodech); u **stornovaného** zápisu také ne.
- [ ] Cizí uživatel (nikoli autor, PM, vedení, administrátor) tlačítko nevidí.

## 4c. Realizační rozpočet, výnosy, marže a semafor (0.39)
Po nahrání: **Instalace a diagnostika** (schéma 21) a na téže stránce **Přepočítat všechny projekty**. Zkoušejte nejdřív na testovacím projektu, potom na jednom skutečném.
- [ ] **Starý projekt:** po otevření Realizačního rozpočtu je v sekci Výnosy řádek „Smluvní cena“ s dosavadní cenou projektu; **Nákup – plán** vychází stejně jako dřív (žádné číslo nákupu se nezměnilo, ani u procentní rezervy).
- [ ] Sloupce Přirážka, Prodej a Marže u položek zmizely; zbyl sloupec Rezerva % (jen u rezervy).
- [ ] **Výnosy:** přidejte řádek, zadejte plán, prognózu a vyfakturováno; součet plánu je smluvní cena; „Vložit výnosy z Excelu“ funguje.
- [ ] Hlavička ukazuje Tržby plán/prognóza, Nákup plán/prognóza a vedle sebe **Marži zadání** a **Marži prognózu** (v % i v Kč); mění se s přepínačem měny jen částky, ne procenta.
- [ ] **První schválení:** prognóza se přepíše plánem; v historii schválení je plán nákupu, smluvní cena, marže v % a v Kč. Smluvní cena projektu (Upravit projekt) je součet plánu výnosů a jde jen číst.
- [ ] Po schválení je **plán uzamčený** (pole plánu jsou šedá, „Přidat výnos“ vypnuté); **prognóza, koupeno a vyfakturováno** jdou měnit dál.
- [ ] **Odemknout plán ke změně** → rozpočet je koncept, plán jde upravit (např. nový výnos „Dodatek č. 1“); **Požádat o schválení** → po dalším schválení se prognóza **nepřepíše** a smluvní cena se změní.
- [ ] Zamítnutí / stažení žádosti vrací rozpočet do konceptu.
- [ ] **Semafor** odpovídá marži z prognózy: od 15 % zelená, 10–15 % světle zelená, 5–10 % žlutá, pod 5 % červená, záporná tmavě červená; hranice jde změnit v Nastavení → Rozpočet a v přehledu se projeví hned.
- [ ] **Přehled projektů:** sloupec Rozp. je jen terčík (bublina vysvětlí důvod), Celková cena je smluvní, Náklady jsou prognóza, vedle je Marže a vzadu Marže zadání.
- [ ] Report projektu (PDF) a export rozpočtu do CSV obsahují nové údaje (marže, výnosy) a nemají prodej ani přirážku.

## 4d. Rozpočet: celkové částky, slovník, cashflow a výnosy, RES CRM (0.40)
- [ ] Tabulka nákupu nemá sloupce Množství, MJ, Nákup/MJ, Koupeno ks ani Zbývá ks; sloupce jsou Nákup – plán, Rezerva %, Objednáno, Nákup – prognóza, Nakoupeno, Zbývá nakoupit. Úprava plánu celkovou částkou funguje a **počty kusů ve starých datech zůstanou** (kontrola např. přes „Objednat“ z položky: předvyplní se množství).
- [ ] U vlastní práce jde zadat plán i nakoupeno částkou (hodiny se dopočtou ze sazby profese); bez sazby je pole šedé.
- [ ] V rozpočtu není kusovník (žádné „Vložit z kusovníku“ ani „Uložit do kusovníku“).
- [ ] Hlavička rozpočtu: 1. řádek Nákup – plán, Tržby – plán, Marže – plán; 2. řádek Nákup – prognóza, Tržby – prognóza, Marže – prognóza, Semafor; 3. řádek Nakoupeno, Zbývá nakoupit, **Prostavěnost**. Dlaždice Objednáno tam není.
- [ ] **Slovník:** nikde už není Vyčerpáno, Proinvestováno ani Koupeno (přehled projektů, detail, report PDF, nápověda, export CSV).
- [ ] Přehled projektů: sloupce Nákup, Marže, Prost. (procento) a vzadu Marže plán.
- [ ] **Cashflow:** u fakturačního milníku je výběr „Výnos z rozpočtu“ (včetně „Nový výnos (dodatek)…“); panel „Výnosy z rozpočtu a plán fakturace“ ukazuje prognózu výnosu, naplánované milníky a rozdíl; milníky bez vazby se hlásí.
- [ ] „Nový výnos“ z milníku při uzamčeném plánu vytvoří výnos s plánem 0 a prognózou podle milníku a upozorní, že pro dodatek je třeba plán odemknout.
- [ ] **Rezerva** je v samostatné tabulce pod nákupem (Popis, % z nákupu, Měna, plán, prognóza, čerpáno, zbývá); ostatní skupiny mají stejnou tabulku bez Rezerva %; procento i pevná částka fungují.
- [ ] V záhlaví je tlačítko **RES CRM** (obrys, ikona + text); vede na stránku RES CRM; v Nastavení → Odkazy v záhlaví jde změnit adresu nebo ho skrýt; v režimu celého okna zůstane celé okno i v RES CRM.

## 4e. Marže v přehledu, Režie, stav při schválení, filtr dokončených (0.42)
- [ ] Přehled projektů: marže se ukazuje procenty u projektů s Celkovou cenou a Nákupem (bez přepočtu); po „Přepočítat všechny projekty“ se karta nehlásí varováním o sloupcích.
- [ ] Přehled projektů: po spuštění nejsou vidět Dokončené a Stornované; vypnutí přepínače je ukáže; výběr stavu „Dokončeno“ ve filtru Stav je ukáže i při zapnutém přepínači.
- [ ] Schválení rozpočtu u projektu ve stavu Nabídka: v dialogu je volba nového stavu (výchozí Příprava); po schválení je projekt v tom stavu. U projektu v Realizaci volba není.
- [ ] Režie: záložka Fakturace dovolí „Nový podklad“; záložka Realizační rozpočet nabídne Založit rozpočet a ukáže jen Výnosy (bez nákupu a schvalování).

## 5. Cashflow — vazby na harmonogram (0.34)
- [ ] U platby nákladů zvolte **úkol harmonogramu**, kotvu (zahájení / dokončení), posun a splatnost → datum faktury a splatnost se vyplní samy a jsou zamčené.
- [ ] Posuňte úkol v harmonogramu a uložte → platba v cashflow se posune.
- [ ] Smažte navázaný úkol → v cashflow se objeví upozornění a platí ručně zadané datumy.
- [ ] V sekci **Dodávky a harmonogram** navažte položku rozpočtu na úkol; u objednávky této položky s termínem dodání po zahájení úkolu se nahoře objeví **červené upozornění** (a zmínka o kritické cestě, je-li úkol kritický).

## 6. Export harmonogramu (0.35)
- [ ] **Export do Excelu** stáhne CSV, v Excelu se otevře česky (diakritika, sloupce).
- [ ] **PDF (A3)** se stáhne; je na šířku, vlevo tabulka, vpravo Gantt, nic se nepřekrývá, červená kritická cesta, popisky čitelné. **Pošlete mi případné chyby vzhledu (dosud jsem PDF neviděl).**
- [ ] U dlouhého harmonogramu (nad 30 úkolů) je víc stran se stejnou osou.

## 7. Web part Běžící projekty (0.29)
- [ ] Na stránce webu se zobrazují jen projekty ve stavu Aktivní a Příprava, seřazené podle čísla.
- [ ] Změna nastavení v PRMIS se projeví na webu.

## 8. Ostatní drobnosti z 0.28
- [ ] Dodavatele jde zvolit jen ze seznamu (nebo přidat nového na konci seznamu).
- [ ] U zahraničního partnera jsou země mimo EU (Čína, Tchaj-wan, USA, Kanada…).
- [ ] Posuvníky tabulek neblikají.

## Nález z testování
Zapište sem (nebo mi napište): co, kde, jak se to mělo chovat a jak se chovalo. Screenshot pomůže.
