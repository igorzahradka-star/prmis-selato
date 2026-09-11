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

## Zatím nezodpovězené

Tyto otázky blokují nebo ovlivní další práci. U každé je uvedeno,
kdy nejpozději ji potřebujeme znát.

| # | Otázka | Potřeba ve fázi | Proč na tom záleží |
|---|---|---|---|
| 8 | Kdo je správce Microsoftu 365 a může nahrát aplikaci do katalogu aplikací | **0** | Bez toho se aplikace nedostane na SharePoint a Fázi 0 nelze otestovat v ostrém provozu. |
| 9 | Adresa tenanta (`https://<firma>.sharepoint.com`) a adresy webů PRM a PRM-Finance | **0** | Potřebné pro ladění i pro nastavení web partu. |
| 1 | Přesný formát čísla zakázky a dosavadní číslování (od jakého čísla navázat) | 1 | Určuje číselnou řadu. Špatné nastavení by znamenalo přečíslování dokladů. |
| 2 | Finální šablona složek projektu, případně různá podle typu zakázky | 1 | Podle ní se zakládají složky každé nové zakázky. |
| 10 | Kde přesně leží knihovna zakázek (web, knihovna, kořenová složka) | 1 | Cíl, kam aplikace zakládá složky. |
| 11 | Stávající seznam zakázek v Excelu k importu | 1 | Formát určuje podobu importu. |
| 3 | Limity schvalování objednávek a jména schvalovatelů | 2 | Peníze a oprávnění — nelze odhadovat. |
| 4 | Vzory PDF (objednávka, podklad pro fakturaci, protokol) a fakturační údaje RES (IČO, DIČ, e-mail účtárny) | 2 | Dokumenty jdou ven k dodavatelům a zákazníkům. |
| 5 | Účetní systém a formát exportu skutečných plateb | 3 | Určuje podobu importu skutečnosti do cashflow. |
| 6 | Kategorie rozpočtu, prahy semaforu, minimální marže | 3 | Výchozí hodnoty v aplikaci jsou zatím jen návrh. |
| 7 | Struktura reportu pro finančního ředitele holdingu, perioda odevzdání, kategorie firemního CF | 5 | Report se má přizpůsobit šabloně holdingu. |
