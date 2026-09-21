# PRM Revoltum — návod pro uživatele

Pro projektové manažery a asistenty. Snímky obrazovek doplníme, až bude
aplikace nasazená.

> Stav: **Fáze 0**. Aplikace zatím umí zobrazit projekty a nastavení.
> Zakládání projektů, objednávky, rozpočty a harmonogramy přibývají postupně —
> v navigaci je u nich štítek „brzy“ a po kliknutí se dozvíte, kdy přijdou.

---

## Jak se přihlásit

Nijak. Aplikace běží na firemním SharePointu a pozná vás podle účtu Microsoft 365,
kterým jste přihlášeni v prohlížeči. Žádné další heslo neexistuje.

Vpravo nahoře vidíte své jméno, dole v patičce své role.

---

## Co jsou role

Role určují, co v aplikaci vidíte a smíte. Odpovídají skupinám v SharePointu —
přiděluje je administrátor PRM.

| Role | Co smí |
|---|---|
| **Projektový manažer** | zakládá projekty, spravuje své projekty, schvaluje objednávky ve svém limitu |
| **Asistent PM** | pracuje na projektech, kam je přiřazen; objednávky vytváří, ale neschvaluje |
| **Vedení** | vidí všechny projekty, schvaluje objednávky nad limit a realizační rozpočty |
| **Finance – důvěrné** | firemní cashflow a report pro holding |
| **Administrátor PRM** | Nastavení, instalace, správa rolí |
| **Čtenář** | jen čtení |

Rolí můžete mít víc najednou. Pokud vám něco chybí, ozvěte se administrátorovi —
není to chyba aplikace, ale nastavení skupin.

---

## Přehled projektů

Úvodní obrazovka. Nahoře jsou dlaždice s rychlým přehledem:

- **Aktivní projekty** — ve stavu Nabídka, Příprava, Realizace nebo Pozastaveno.
- **Hodnota aktivních projektů** — součet smluvních cen bez DPH.
- **Projekty v červené** — rozpočet výrazně překročen (viz semafor níže).
- **Termíny do 14 dní** — blížící se smluvní termíny plnění.
- **Termíny po splatnosti** — už zmeškané termíny.

Projekt **Režie** se do dlaždic nepočítá — není to obchodní případ.

### Filtrování a hledání

- **Hledání** funguje přes číslo, název, zákazníka, lokalitu i zkrácený název.
- **Projektový manažer** a **Stav** umožňují vybrat víc hodnot najednou.

Filtry se dají kombinovat. Když nic nezbude, aplikace to napíše.

---

## Semafor rozpočtu

Barevný štítek ve sloupci *Rozpočet* říká, jak si projekt stojí proti
schválenému realizačnímu rozpočtu.

| Štítek | Co znamená |
|---|---|
| 🟢 **Zelená** | prognóza nákladů nepřekračuje schválený rozpočet |
| 🟡 **Žlutá** | mírné překročení (práh nastavuje administrátor, výchozí 5 %) |
| 🔴 **Červená** | výraznější překročení, nebo marže pod minimem |
| ⚪ **Bez rozpočtu** | projekt nemá schválený realizační rozpočet |

**Najeďte na štítek myší** — zobrazí se konkrétní čísla: schválený rozpočet,
prognóza nákladů a odchylka v procentech.

Barva nikdy nestojí sama — vždy je doplněná ikonou a slovem, aby byl semafor
čitelný i při barvosleposti nebo černobílém tisku.

---

## Detail projektu

Otevřete kliknutím na číslo projektu.

- **Přehled** — základní údaje, finance, termíny.
- **Realizační rozpočet**, **Cashflow**, **Harmonogram**, **Objednávky**,
  **Fakturace**, **Dokumenty** — připravují se, po kliknutí uvidíte v jaké fázi.

Adresu detailu můžete zkopírovat z prohlížeče a poslat kolegovi — odkaz
otevře přesně ten samý projekt.

---

## Složky projektu

U projektu, který už má založenou složku, je tlačítko **Otevřít složku projektu**.
Otevře ji v SharePointu v novém okně.

### Proč se složka neotevře rovnou v Průzkumníku Windows

Prohlížeč z bezpečnostních důvodů nesmí spouštět programy ve Windows. Nedá se to
obejít — je to vlastnost všech prohlížečů, ne chyba aplikace.

**Řešení, které stačí udělat jednou:**

1. Otevřete knihovnu projektů v SharePointu.
2. Nahoře klikněte na **Synchronizovat** (nebo **Přidat zástupce do Mé soubory**).
3. Potvrďte otevření aplikace OneDrive.
4. Od té chvíle máte stejné složky v Průzkumníku pod stejnými názvy —
   pod ikonou firmy v levém sloupci.

Pak už si složku otevřete přímo v Průzkumníku a pracujete s ní jako s běžnou
složkou na disku.

---

## Když něco nefunguje

Aplikace se snaží psát chyby česky a srozumitelně: co se stalo a co dělat.
Technický detail je až na konci hlášky za slovem „Technicky:“.

Nejčastější příčiny:

| Hláška obsahuje | Co s tím |
|---|---|
| „nemáte dostatečná oprávnění“ | požádejte administrátora PRM o přidání do skupiny |
| „požadovaná data nebo seznam neexistují“ | administrátor má spustit *Instalace a diagnostika* |
| „záznam mezitím změnil někdo jiný“ | načtěte stránku znovu (F5) a změnu zopakujte |
| „SharePoint je momentálně zahlcený“ | zkuste to za chvíli znovu |

Když si nevíte rady, zkopírujte **celou** hlášku i s technickou částí
a pošlete ji administrátorovi.

---

## Nápověda přímo v aplikaci

V levé navigaci je položka **Nápověda**. Obsahuje to samé co tento návod,
ale doplněné o vaše konkrétní údaje — vaše role, aktuálně nastavený vzor
názvu projektu a platné prahy semaforu.
