# Testovací scénáře — Fáze 0 (Základ)

Co ověřit po nasazení Fáze 0. U každého bodu je uvedeno, **co udělat**
a **co má nastat**. Kde něco nesedí, napiš to běžnou řečí — stačí, co jsi
udělal a co se stalo místo toho.

Legenda: ✅ prošlo · ❌ neprošlo · ⏭ zatím nelze otestovat

---

## A. Automatické testy (bez SharePointu)

| # | Co udělat | Co má nastat | Výsledek |
|---|---|---|---|
| A1 | Ve složce `spfx` spustit `npm run test` | Vypíše `Successes: 120`, `Failures: 0` a skončí bez chyby | |
| A2 | Spustit `npm run package` | Vznikne soubor `spfx\sharepoint\solution\prm-revoltum.sppkg` | |

> Stav ke 11. 9. 2026: A1 i A2 ověřeno, prochází.

---

## B. Ukázkový režim (bez hotových seznamů)

Tohle jde otestovat hned po nasazení web partu, ještě před instalací seznamů.
Ve vlastnostech web partu přepni **Odkud brát data** na *Ukázková data*.

| # | Co udělat | Co má nastat | Výsledek |
|---|---|---|---|
| B1 | Otevřít stránku s aplikací | Nahoře tmavě modrý pruh s logem RES a nápisem „PRM Revoltum“, vpravo tvé jméno a e-mail | |
| B2 | Podívat se pod hlavičku | Žlutý pruh „Ukázkový režim. Zobrazená data jsou smyšlená…“ | |
| B3 | Prohlédnout dlaždice nahoře | Pět dlaždic: aktivní zakázky, hodnota, zakázky v červené, termíny do 14 dní, termíny po splatnosti | |
| B4 | Zkontrolovat tabulku zakázek | Sloupce: Číslo, Název, Projektový manažer, Rozpočet, Celková cena, Nejbližší termín, Zahájení, Ukončení, Stav | |
| B5 | Zkontrolovat formát čísel | Částky jako `12 400 000 Kč`, data jako `11. 9. 2026` | |
| B6 | Najet myší na barevný semafor u rozpočtu | Bublina s vysvětlením: schválený rozpočet, prognóza, odchylka v % | |
| B7 | Zkontrolovat, že semafor není jen barva | U každého semaforu je i ikona a slovo (Zelená / Žlutá / Červená / Bez rozpočtu) | |
| B8 | Do vyhledávacího pole napsat `Lipnice` | Tabulka se zúží na zakázku FVE Lipnice | |
| B9 | V poli **Stav** vybrat *Realizace* | Zůstanou jen zakázky ve stavu Realizace | |
| B10 | Zapnout přepínač **Jen moje zakázky** | Zůstanou jen zakázky, kde jsi projektový manažer | |
| B11 | Kliknout na číslo zakázky (např. `26-002`) | Otevře se detail s kartami Základní údaje / Finance / Termíny | |
| B12 | V detailu přepnout na záložku *Realizační rozpočet* | Hlášení „Připravuje se — Fáze 3“ s popisem, ne prázdná stránka ani chyba | |
| B13 | V prohlížeči kliknout na tlačítko Zpět | Vrátí se seznam zakázek (adresa se mění přes `#/zakazky`) | |
| B14 | Zkopírovat adresu z prohlížeče z detailu zakázky a vložit ji do nové záložky | Otevře se rovnou ten samý detail zakázky | |
| B15 | V levé navigaci kliknout na *Objednávky* | „Připravuje se — Fáze 2“ | |
| B16 | Kliknout na ikonu ☰ vlevo nahoře | Navigace se sbalí na ikony a zase rozbalí | |
| B17 | Zúžit okno prohlížeče na šířku tabletu | Rozložení se přizpůsobí, nic se neořízne | |
| B18 | Ručně dopsat do adresy `#/neexistuje` | Zobrazí se dashboard zakázek, ne chyba | |

---

## C. Role a oprávnění

| # | Co udělat | Co má nastat | Výsledek |
|---|---|---|---|
| C1 | Podívat se do patičky aplikace | Vypsané tvé role, např. „Vaše role: Administrátor PRM, Vedení“ | |
| C2 | Jako administrátor prohlédnout levou navigaci | Vidíš *Nastavení* i *Instalace a diagnostika* | |
| C3 | Požádat kolegu bez role administrátora, ať otevře aplikaci | *Nastavení* ani *Instalace* v navigaci **nevidí** | |
| C4 | Kolega bez role administrátora ručně zadá adresu `#/nastaveni` | Modrý pruh „Nastavení může měnit jen administrátor PRM.“, žádná data | |
| C5 | Dokud není web PRM-Finance založený | Položka *Firemní cashflow* se **nezobrazuje nikomu** | |
| C6 | Po založení PRM-Finance: kolega bez přístupu na ten web | *Firemní cashflow* nevidí, i když má roli Finance | |

> C5 a C6 jsou nejdůležitější testy celé fáze. Skutečnou ochranu dělá SharePoint —
> i kdyby modul někdo vyvolal ručně, SharePoint data nevydá.

---

## D. Instalace datové struktury (ostrá data)

Ve vlastnostech web partu přepni **Odkud brát data** na *Ostrá data ze SharePointu*.

| # | Co udělat | Co má nastat | Výsledek |
|---|---|---|---|
| D1 | Otevřít *Instalace a diagnostika* před instalací | „Verze dat na SharePointu: neinstalováno“ a seznam chybějících seznamů | |
| D2 | Kliknout **Doplnit chybějící části** | Potvrzovací okno s vysvětlením, že se nic nemaže | |
| D3 | Potvrdit **Doplnit** | Ukazatel průběhu s názvem právě zakládaného seznamu | |
| D4 | Počkat na dokončení | Zelené hlášení „Instalace doběhla“ | |
| D5 | Prohlédnout výsledek kontroly | Všechny seznamy zelené s textem „Existuje, všech N sloupců je na místě“ | |
| D6 | Kliknout **Zkontrolovat znovu** | Stejný zelený výsledek | |
| D7 | **Spustit instalaci podruhé** | Nic se nerozbije, nevzniknou duplicitní seznamy — průvodce je idempotentní | |
| D8 | Otevřít *Obsah webu* na webu PRM | Seznamy mají české názvy (`PRM – Zakázky`) a anglické adresy (`/Lists/PRM_Projects`) | |
| D9 | Otevřít seznam `PRM – Zakázky` → *Nastavení seznamu* | Sloupce mají české názvy; historie verzí je zapnutá | |
| D10 | *Nastavení seznamu* → *Indexované sloupce* | Indexy na Číslo zakázky, Stav, Projektový manažer, Rok, Typ | |
| D11 | Bez webu PRM-Finance (prázdná adresa ve vlastnostech) | V diagnostice modrá položka „Web PRM-Finance — není zadaná adresa“ s návodem | |
| D12 | Přihlásit se jako uživatel bez práva zakládat seznamy a otevřít diagnostiku | Hlášení, že nemá oprávnění, a koho požádat. Tlačítko *Doplnit* je nedostupné | |

---

## E. Nastavení

| # | Co udělat | Co má nastat | Výsledek |
|---|---|---|---|
| E1 | Otevřít *Nastavení* | Šest záložek: Složky zakázek, Zakázky, Rozpočet a semafor, Schvalování, Role, Údaje firmy | |
| E2 | Vymazat *Název knihovny dokumentů* | Oranžové hlášení „Nastavení zatím nejde uložit“ a tlačítko *Uložit* je nedostupné | |
| E3 | Nastavit limit vedení nižší než limit PM | Hlášení, že limit vedení musí být vyšší | |
| E4 | Upravit šablonu složek (odsadit řádek dvěma mezerami) | Odsazený řádek je podsložka předchozí složky | |
| E5 | Vyplnit fakturační údaje RES a uložit | Zelené hlášení „Nastavení uloženo“ | |
| E6 | Načíst stránku znovu (F5) | Uložené hodnoty tam zůstaly | |
| E7 | Kliknout **Zahodit změny** po úpravě | Hodnoty se vrátí na naposledy uložené | |
| E8 | Změnit claim v *Údaje firmy* a uložit | Nový text se hned objeví v patičce aplikace | |

---

## F. Chybové stavy

| # | Co udělat | Co má nastat | Výsledek |
|---|---|---|---|
| F1 | Otevřít aplikaci v ostrém režimu **před** instalací seznamů | Aplikace se spustí, běží na výchozím nastavení, u zakázek srozumitelná česká hláška s odkazem na instalaci | |
| F2 | Přečíst si jakoukoli chybovou hlášku | Je česky, říká co se stalo a co dělat; technický detail je až na konci za slovem „Technicky:“ | |
| F3 | Otevřít detail neexistující zakázky (`#/zakazka/99-999`) | „Zakázka nebyla nalezena…“ s odkazem zpět na seznam, ne prázdná stránka | |

---

## G. Vzhled a značka

| # | Co udělat | Co má nastat | Výsledek |
|---|---|---|---|
| G1 | Zkontrolovat hlavičku | Tmavě modrá `#0E2841`, logo RES s bleskem, čitelné | |
| G2 | Zkontrolovat barvy tlačítek a odkazů | Modrá RES `#0268A6`, ne výchozí modrá SharePointu | |
| G3 | Zkontrolovat písmo | Aptos (případně Segoe UI, pokud Aptos na počítači není) | |
| G4 | Zkontrolovat patičku | Claim „Revoltujte s námi za moderní decentralizovanou energetiku“ | |
| G5 | Zkontrolovat, že claim **není** v hlavičce | Podle grafického manuálu patří jen do patičky a PDF | |

---

## Co Fáze 0 ještě neumí (a je to v pořádku)

Tyhle věci se ve Fázi 0 netestují — přijdou v dalších fázích:

- zakládání zakázek a přidělování čísel (Fáze 1),
- zakládání složek projektu na SharePointu (Fáze 1),
- import stávajících zakázek z Excelu (Fáze 1),
- export tabulky do Excelu (Fáze 1),
- objednávky, schvalování, PDF (Fáze 2),
- rozpočet, cashflow, harmonogram (Fáze 3 a 4),
- firemní cashflow a report pro holding (Fáze 5).

Tlačítko *Nová zakázka* je proto zatím zašedlé a moduly v navigaci mají
štítek „brzy“.
