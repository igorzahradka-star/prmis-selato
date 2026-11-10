# Nasazovaný balíček

`prmis-selato.sppkg` je poslední **nasazená** verze PRMIS SELATO (nahrává se do katalogu aplikací).

Pravidla (aby repozitář zbytečně nenarůstal, každá verze balíčku má asi 2,6 MB — před balením smazat `spfx/dist`, viz NAVAZANI kap. 6):
- V repozitáři je **jediný soubor** se stejným názvem; nová verze ho přepíše.
- Commitují se jen verze, které se opravdu nasazují. Testovací buildy se sem nedávají.
- Verze v balíčku: `spfx/config/package-solution.json` (`version`).

Aktuální soubor: verze 0.69.2.0 (10. 11. 2026; přehled projektů po 9; import partnerů z Excelu; Abra a Servis vypnuté přepínačem `ENTITY.modules`; průběh importu s ukazatelem; Doplnit chybějící složky podle šablony; editor šablony složek s libovolnou hloubkou; obsahuje i 0.68.0.0: číslování `26ZA…`, šablona složek SELATO, import ze seznamu).

Stažení do lokálního klonu: `git remote add origin https://github.com/igorzahradka-star/prmis-selato`, potom `git pull origin selato`.
