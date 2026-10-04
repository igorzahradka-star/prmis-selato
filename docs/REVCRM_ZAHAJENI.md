# REVCRM — zahájení v samostatné relaci

Připraveno 4. 10. 2026. Slouží k tomu, abys v **nové relaci Claude** rozjel projekt REVCRM, aniž by se míchal s PRMIS.
Igor je **dispečer obou projektů**: co se týká obou, předává mezi relacemi on (nebo přes soubory — viz [`REVCRM.md`](REVCRM.md)).

## Rozhodnutí z 4. 10. 2026 (odpovědi Igora)

| # | Téma | Rozhodnutí |
|---|---|---|
| 1 | Tenant | **Jeden společný** Microsoft 365 tenant (`revoltum.sharepoint.com`) pro matku i RES. |
| 2 | Kde běží REVCRM | **Na webu RES**, tedy tam, kde PRMIS (`/sites/RevoltumEngineeringServices`). Na webu matky bude jen **odkaz** (a „asi nějaká data“ — komerční část případu; upřesní se v relaci REVCRM). |
| 3 | Seznam partnerů | **Na webu RES.** Je to už existující seznam **PRM_Partners** — REVCRM ho použije přímo, žádné stěhování ani kopírování. Partnery tedy zakládá a upravuje kdokoli z obou aplikací do jednoho seznamu. |
| 4 | Uživatelé | Všichni z rolí PRMIS (PM, asistent, vedení, finance, administrátor, …); přístupový plán bude **podobný** jako v PRMIS. |
| 5 | Dnešní evidence | **Mix** — něco ve složkách (SharePoint/OneDrive), Excel to není. |
| 6 | Číslo případu | **`N{YY}-{NNNN}`**, např. **N26-0001** (N = nabídka/případ, dvojčíslí roku, pomlčka, pořadové číslo v roce; resetuje se každý rok). Probíráno v PRMIS. |
| 7 | Kalkulace nabídek | Původně součást PRMIS; **nakonec se odděluje** do REVCRM. Obchodní případ má **komerční část** (právní, podklady, modely, výpočty) a **technickou část**. **Nabídka má více fází** — rozebrat ve **vlastní relaci REVCRM**, aby se to nekomplikovalo v PRMIS. |

Důsledky pro PRMIS: **nic se tu nemění**, dokud REVCRM nedodá „předávací obálku“; partneři i číselné řady zůstávají. PRMIS jen čeká na tuto vstupní funkci: *založit projekt z vyhraného obchodního případu a přenést rozpočet*.

## Co vložit do nové relace (první zpráva)

1. Otevři v aplikaci Claude **novou relaci** a jako pracovní složku zvol **novou složku**, např. `C:\Projekty\revcrm` (založ ji; bude to samostatný git projekt).
2. Přidej také složku PRMIS (`C:\Projekty\prm-revoltum`) jako **dodatečnou pracovní složku jen ke čtení** — ať REVCRM vidí kód a dokumenty PRMIS, ale nic v nich nemění.
3. Vlož tento text:

```text
Zakládáme nový projekt REVCRM — evidence obchodních příležitostí (obchodních případů) pro společnost REVOLTUM a.s. (matka), běžící vedle informačního systému PRMIS pro RES.
Nejdřív si přečti v C:\Projekty\prm-revoltum tyto soubory: CLAUDE.md (trvalá pravidla spolupráce a technologie — platí i tady), docs/REVCRM.md (zadání a dohoda o spolupráci obou projektů), docs/REVCRM_ZAHAJENI.md (rozhodnutí z 4. 10. 2026), docs/ROZHODNUTI.md a NAVAZANI.md.
Pravidla z PRMIS platí i pro REVCRM (česky, po krocích, commit po každém kroku, nikdy nemazat ostrá data, změny schématu jen přidávací, jen licence MIT/Apache/BSD, nikdy se nepřihlašovat k firemním systémům).
V PRMIS nic neměň. Moje role: jsem dispečer obou projektů — co se týká PRMIS, vyřídím tam; pro to připrav v docs/ souboru popis, co od PRMIS potřebuješ.
Začni takto: (1) vytvoř v C:\Projekty\revcrm git repozitář, CLAUDE.md a NAVAZANI.md podle vzoru PRMIS; (2) zeptej se mě na zadání: obchodní případ, jeho komerční a technická část, fáze nabídky, stavy, role a oprávnění, složky, rozpočet/kalkulace; (3) navrhni architekturu (SPFx na webu RES jako PRMIS, sdílený seznam PRM_Partners, číslo případu N26-0001) a postup po krocích. Zatím nic nestav, dokud neodsouhlasím návrh.
```

## Pravidla dispečera (jak předávat mezi relacemi)

- Změna, která se týká **obou** projektů (partner, předávací obálka, formát rozpočtu, číselné řady), se napíše do **`docs/REVCRM.md`** (sekce „Dohodnutá rozhraní“) v repozitáři, který ji mění, s datem; druhá relace dostane od Igora větu *„přečti docs/REVCRM.md a navaž“*.
- Každá relace na konci práce aktualizuje svůj `NAVAZANI.md` (co je hotové, co čeká na druhou stranu).
- Žádná relace nezapisuje do repozitáře té druhé.
