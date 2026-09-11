# Historie změn

Formát: jedna verze = jedna dokončená fáze nebo významná oprava.
Datum ve tvaru den. měsíc. rok.

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
  navigace přes adresu v prohlížeči (`#/zakazky`, `#/zakazka/26-014`).
- Rozpoznání přihlášeného uživatele a jeho rolí ze skupin SharePointu.
  Přístup k důvěrným finančním modulům se ověřuje **skutečným dotazem**
  na web PRM-Finance, ne jen podle role.
- Dashboard zakázek: dlaždice KPI, tabulka se sloupci podle zadání,
  filtry (stav, typ, jen moje), fulltext, semafor rozpočtu s vysvětlením.
- Detail zakázky — záložka Přehled; ostatní záložky připravené s popisem,
  ve které fázi přijdou.
- **Instalace a diagnostika**: aplikace si sama zkontroluje a založí
  21 seznamů a knihoven včetně sloupců a indexů. Nikdy nic nemaže,
  jde spustit opakovaně.
- **Nastavení**: složky zakázek a jejich šablona, vzor názvu zakázky, typy
  zakázek, kategorie rozpočtu, prahy semaforu, limity schvalování, názvy
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
