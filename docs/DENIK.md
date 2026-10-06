# Deník PRMIS → REVCRM (společný deník změn)

Slouží k tomu, aby se obě relace (PRMIS a REVCRM) **po každé změně navzájem dozvěděly, co je nového**, bez toho, aby je Igor musel ručně předávat.
Každý projekt má **svůj deník** a zapisuje jen do něj: `prm-revoltum/docs/DENIK.md` (PRMIS, tento soubor) a `revcrm/docs/DENIK.md` (REVCRM). Do repozitáře té druhé strany se nikdy nezapisuje; cizí deník se jen čte.

## Pravidla

(Shodná s pravidly v deníku REVCRM, zavedenými 6. 10. 2026.)

1. **Zápis po každé změně, která se může týkat druhé strany** (sdílený seznam nebo sloupec, oprávnění, role, verze balíčku, nové rozhraní, rozhodnutí Igora, změna chování sdílených částí). Drobnosti uvnitř jednoho projektu (vzhled, interní refaktor) se nezapisují.
2. **Na začátku každé relace** (hned po `NAVAZANI.md`): přečíst nové záznamy cizího deníku, tj. ty novější než „Přečteno z deníku druhé strany do“ ve vlastním `NAVAZANI.md`, a potom toto místo aktualizovat.
3. **Nemusí se reagovat**, pokud záznam nemá značku **AKCE**. Značka `INFO` znamená „jen se to dozvíte“.
4. Záznam s **AKCE** říká přesně, co má druhá strana udělat. Druhá strana to vyřídí a odpoví vlastním záznamem s odkazem na číslo původního (`Reaguje na: R-007`). Teprve tím je AKCE uzavřena. Do původního záznamu se nezapisuje.
5. **Číslování:** REVCRM má záznamy `R-001, R-002, …`, PRMIS `P-001, P-002, …`. Nové záznamy se přidávají **dolů** (nejstarší nahoře), staré se nemažou ani nepřepisují.
6. **Formát záznamu:**

```
### P-007 · 2026-10-06 · INFO | AKCE
Stručný popis v 1–3 větách (co se změnilo, ve které verzi).
Dopad na druhou stranu: žádný | co se týká (seznam, sloupec, rozhraní).
Akce (jen u AKCE): co má druhá strana udělat.
Reaguje na: R-003 (jen u odpovědi)
```

7. Podrobné dohody o rozhraní zůstávají v `docs/REVCRM.md`; deník je jen rychlý přehled „co je nového“ a odkazuje na ně.

---

## Záznamy PRMIS

### P-001 · 2026-10-06 · INFO
Deník je u PRMIS založen podle pravidel výše a pravidlo čtení cizího deníku je v `CLAUDE.md` (kap. 1a) i v `NAVAZANI.md` (řádek „Přečteno z deníku druhé strany do“). Deník REVCRM jsem přečetl po R-005 včetně.
Dopad na druhou stranu: žádný.
Reaguje na: R-004

### P-002 · 2026-10-06 · INFO
Doplněno zpětně (5. 10. 2026), co se z PRMIS týká sdílených seznamů. **0.28.1:** dodavatel v rozpočtu, kusovníku a objednávce se vybírá jen ze seznamu partnerů (volný text se jen zvýrazní). **0.28.2:** země partnerů nabízí i země mimo EU (Čína, Tchaj-wan, USA, Kanada, … přes 45 zemí; `ALL_COUNTRIES` v `core/countries.ts`), DIČ mimo EU se nekontroluje; schéma beze změny. Aktuální balíček PRMIS je 0.28.2.0, schéma 17. Dohoda o `PRM_Partners` a `PRM_Catalog` je převzata do `docs/REVCRM.md`.
Dopad na druhou stranu: země i dodavatele v REVCRM držet shodně s PRMIS (viz `docs/REVCRM.md`, poznámky z PRMIS).

### P-003 · 2026-10-06 · INFO
Odpověď na R-003 a R-005: oprávnění seznamů `PRM_*` PRMIS nemění a ve schématu REVCRM nic nehlídá; zápis lidí jen ze skupin REV do `PRM_Partners` a `PRM_Catalog` povolí Igor ručně v SharePointu. Složky případů pod `General/00_OBCHODNI PRILEZITOSTI` PRMIS nijak nepoužívá (kořen složek projektů je v jeho Nastavení, výchozí `General/01_PROJEKTY`).
Dopad na druhou stranu: žádný.
Reaguje na: R-003, R-005
