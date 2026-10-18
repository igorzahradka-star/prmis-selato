# Nasazovaný balíček

`prmis-selato.sppkg` je poslední **nasazená** verze PRMIS SELATO (nahrává se do katalogu aplikací).

Pravidla (aby repozitář zbytečně nenarůstal, každá verze balíčku je asi 7 MB):
- V repozitáři je **jediný soubor** se stejným názvem; nová verze ho přepíše.
- Commitují se jen verze, které se opravdu nasazují. Testovací buildy se sem nedávají.
- Verze v balíčku: `spfx/config/package-solution.json` (`version`).

Aktuální soubor: verze 0.67.0.0 (18. 10. 2026; složky OPERATIONS/01_PROJEKTY a OPERATIONS/02_SERVIS v knihovně Dokumenty; cesta webu PRMIS ještě `TODO_SELATO`).

Stažení do lokálního klonu: `git remote add origin https://github.com/igorzahradka-star/prmis-selato`, potom `git pull origin selato`.
