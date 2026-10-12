# Kontrolní seznam testování — verze 0.31 až 0.36 (zapsáno 8. 10. 2026)

Určeno pro Igora. Zkoušejte na ostrém SharePointu (nebo na testovacím projektu), po nahrání balíčku **0.36.0.0** a po spuštění **Správa → Instalace a diagnostika** (schéma 20 přidává dva sloupce do seznamu rozpočtů). U každého bodu stačí zapsat **OK**, nebo co se stalo jinak. Automatické testy (1164) prošly, ale na živých datech a ve skutečném prohlížeči je zkouší teprve tento seznam.

Doporučení: založte si **testovací projekt** (číslo s názvem „TESTOVACÍ“) a zkoušejte na něm, ať se nic nemíchá se skutečnými projekty.

## 0. Po nahrání balíčku
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
