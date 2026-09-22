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
| 21. 9. 2026 | Formát čísla projektu (ot. 1) | Formát podle návrhu v zadání (`{YY}-{N}`, např. `26-014`) zůstává. Od jakého čísla navázat se nastaví v *Nastavení* (počáteční hodnota čítače) — konkrétní hodnotu doplníme při zakládání číselné řady. |
| 21. 9. 2026 | Šablona složek projektu (ot. 2) | Jedna společná šablona pro všechny typy projektů (ne různá podle typu). Zůstává ale editovatelná v *Nastavení*, kdyby se to v budoucnu změnilo. |
| 21. 9. 2026 | Import stávajících projektů (ot. 11) | Žádný Excel k dispozici — Igor dodá printscreen složky se seznamem projektů (čísla a názvy). Import/navázání číslování se podle toho navrhne ručně, ne přes hromadný import z Excelu. |
| 21. 9. 2026 | Terminologie: „zakázka" vs. „projekt" | Aplikace nikde nepoužívá slovo „zakázka" — správný a jediný pojem je **projekt** (viz kap. 2, „Cíl aplikace"). Přejmenováno v celém kódu, UI i dokumentaci (route `#/zakazky` → `#/projekty` apod.). |
| 22. 9. 2026 | Kdo smí mazat projekt | **Jen administrátor PRM.** Projektový manažer smí projekt založit a upravit, ale ne smazat — má na to stav *Storno*. Maže se do koše SharePointu (93 dní na obnovu), složka projektu s dokumenty zůstává a do `PRM_AuditLog` se zapíše kdo, kdy a proč. |
| 22. 9. 2026 | Číslo projektu Režie | Tvar `{RR}-000` — mimo běžnou řadu projektů. Důvod: čítač se nezvyšuje, Režie nikomu neukradne číslo a nula ji v seznamech řadí první. |
| 22. 9. 2026 | Schvalovací limity objednávek (ot. 3, částečně) | Zadány částky **100 000 / 500 000 / 1 000 000 Kč** bez DPH (PM / vedení / jednatel). Uloženy jako výchozí hodnoty v *Nastavení → Schvalování*, kde se dají kdykoli změnit. **Jména schvalovatelů a celé workflow zadavatel upřesní ve Fázi 2.** |
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
