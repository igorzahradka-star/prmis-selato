/* eslint-disable */
// Katalog O&M činností RES, verze 0.1 (2026-10-15) — vygenerováno z res_om_katalog_v01.json. Nová verze katalogu = nový soubor.
import type { ServiceCatalog } from './serviceCatalog';

export const SERVICE_CATALOG: ServiceCatalog = {
 "meta": {
  "nazev": "Katalog O&M činností RES",
  "verze": "0.1",
  "datum": "2026-10-15",
  "vlastnik": "Revoltum Engineering & Services, s.r.o.",
  "pravidla_aktivace": "Činnost je aktivní, pokud (a) asset lokality odpovídá poli 'asset' (LOK a BOP platí pro každou lokalitu), (b) jsou splněny všechny položky pole 'aktivace' (položka 'a|b' = alespoň jeden z příznaků), (c) je aktivní 'modul' a (d) uživatel činnost ručně nevypnul. 'vychozi_zapnuto' = výchozí stav přepínače.",
  "stav": "NÁVRH k odborné a právní revizi"
 },
 "typy_assetu": {
  "LOK": "Lokalita – společné (administrativa, areál, bezpečnost)",
  "BOP": "Balance of Plant – VN/NN infrastruktura, trafostanice, připojení k DS",
  "FVE": "Fotovoltaická elektrárna",
  "BESS": "Bateriové úložiště energie",
  "MVE": "Malá vodní elektrárna",
  "VTE": "Větrná elektrárna",
  "ENC": "Energocentrum (KGJ, kotelna, tepelná čerpadla)"
 },
 "priznaky": {
  "vn_pripojeni": "Lokalita připojena na hladině VN (22/35 kV) – vlastní VN rozvodna / předávací místo",
  "trafo_olejove": "Vlastní olejový transformátor (VN/NN)",
  "trafo_suche": "Vlastní suchý (zalitý) transformátor",
  "kompenzace": "Kompenzace jalového výkonu / tlumivky",
  "rizeni_pds": "Dálkové řízení výkonu ze strany PDS / dispečinku (RTU, HDO, ŘVO)",
  "ups": "UPS / záložní napájení vlastní spotřeby, řídicích a ochranných obvodů",
  "hromosvod": "Samostatná ochrana před bleskem (LPS) – jímače, svody",
  "oploceni": "Oplocený areál s bránou",
  "ezs": "Elektrická zabezpečovací signalizace (PZTS) – infrazávory, čidla, ústředna",
  "cctv": "Kamerový systém (CCTV) s NVR / cloudovým záznamem",
  "eps": "Elektrická požární signalizace (EPS) mimo kontejnery BESS",
  "hasici_pristroje": "Přenosné hasicí přístroje v areálu",
  "osvetleni": "Venkovní / bezpečnostní / nouzové osvětlení",
  "travni_porost": "Travní porost v areálu (údržba vegetace)",
  "komunikace_areal": "Vlastní přístupová komunikace / zpevněné plochy v areálu",
  "meteostanice": "Meteostanice (pyranometr, teplota modulů, vítr)",
  "bankovni_financovani": "Projekt financovaný bankou (reporting a součinnost s technickým dozorem banky)",
  "fve_pozemni": "FVE – pozemní instalace",
  "fve_strecha": "FVE – střešní instalace",
  "fve_tracker": "FVE – natáčecí konstrukce (tracker)",
  "fve_bifacial": "FVE – bifaciální moduly",
  "stridace_stringove": "FVE – stringové střídače",
  "stridace_centralni": "FVE – centrální střídače / inverter stanice",
  "optimizery": "FVE – optimizéry / MLPE",
  "string_boxy": "FVE – DC rozvaděče / string boxy (RDC)",
  "bess_kapalinove_chlazeni": "BESS – kapalinové chlazení (chiller, čerpadla, chladivo/glykol)",
  "bess_vzduchove_chlazeni": "BESS – vzduchové chlazení (HVAC jednotky)",
  "bess_hasici_system": "BESS – integrovaný hasicí systém (aerosol / plyn / voda)",
  "bess_detekce_plynu": "BESS – detekce plynů (H2, CO, VOC) a odvětrání / deflagrace",
  "bess_pcs_samostatne": "BESS – samostatné PCS / střídačové stanice (mimo bateriový kontejner)",
  "bess_ems_vlastni": "BESS – EMS / PPC (power plant controller) dodaný třetí stranou",
  "f_plyny": "Zařízení s náplní F-plynů nad zákonný práh (chiller, HVAC, tepelná čerpadla)",
  "bess_agregator": "BESS – řízení agregátorem / obchodníkem (SVR, obchodní flexibilita)",
  "mve_cesle": "MVE – česle a čisticí stroj česlí",
  "mve_hydraulika": "MVE – hydraulický agregát (regulace rozváděcího / oběžného kola, stavidla)",
  "vte_vytah": "VTE – výtah / šplhací zařízení ve věži",
  "enc_kgj": "Energocentrum – kogenerační jednotka (plyn)",
  "enc_kotelna": "Energocentrum – plynová kotelna",
  "enc_tc": "Energocentrum – tepelná čerpadla",
  "enc_tlakove_nadoby": "Energocentrum – tlakové nádoby / expanzní systémy"
 },
 "moduly": {
  "ZAKLAD": {
   "nazev": "Základní servis",
   "popis": "Dálkový monitoring 24/7, dispečink poruch, preventivní údržba dle plánu, zákonné revize a kontroly, reporting. Vždy aktivní.",
   "povinny": true
  },
  "KOREKTIVA": {
   "nazev": "Korektivní údržba",
   "popis": "Odstraňování poruch v režimu SLA (práce techniků v ceně paušálu do limitu hodin; náhradní díly dle modulu ND).",
   "povinny": false
  },
  "ND": {
   "nazev": "Náhradní díly a sklad strategických dílů",
   "popis": "Správa skladu strategických náhradních dílů, dodávky dílů mimo záruku do ročního limitu.",
   "povinny": false
  },
  "TECHMGMT": {
   "nazev": "Technický management",
   "popis": "Správa záruk a LTSA, koordinace OEM, komunikace s PDS/OTE/ERÚ, pojistné události, součinnost s bankou a technickým dozorem, správa dokumentace.",
   "povinny": false
  },
  "AREAL": {
   "nazev": "Údržba areálu",
   "popis": "Údržba vegetace, oplocení, komunikací, zimní údržba.",
   "povinny": false
  },
  "MYTI": {
   "nazev": "Mytí FV modulů",
   "popis": "Čištění FV modulů demineralizovanou vodou.",
   "povinny": false
  },
  "BEZPECNOST": {
   "nazev": "Bezpečnostní systémy",
   "popis": "Servis EZS, CCTV, osvětlení, výjezd na poplach (ve spolupráci s PCO).",
   "povinny": false
  },
  "IT_OT": {
   "nazev": "Kybernetická bezpečnost OT",
   "popis": "Správa vzdálených přístupů, záloh, aktualizací a bezpečnostních událostí OT sítě dle zákona č. 264/2025 Sb.",
   "povinny": false
  }
 },
 "kvalifikace": {
  "DISP": "Dispečer monitoringu RES",
  "TECH": "Servisní technik RES / servisního partnera (osoba poučená dle § 4 NV 194/2022 Sb.)",
  "EL6": "Elektrotechnik dle § 6 NV č. 194/2022 Sb.",
  "EL7": "Vedoucí elektrotechnik dle § 7 NV č. 194/2022 Sb.",
  "RT_E1B": "Revizní technik E1B – el. zařízení bez omezení napětí (§ 8 NV 194/2022 Sb., příl. 3 NV 190/2022 Sb.)",
  "RT_E2B": "Revizní technik E2B – el. zařízení do 1 kV AC / 1,5 kV DC",
  "RT_E3B": "Revizní technik E3B – hromosvody",
  "OCHRANAR": "Specialista ochran a řídicích systémů VN (sekundární technika)",
  "OEM_BESS": "Technik autorizovaný výrobcem BESS (certifikát OEM)",
  "OEM_INV": "Technik autorizovaný výrobcem střídačů / PCS",
  "TERMO": "Termograf s certifikací min. úrovně 1 (ČSN EN ISO 9712 / ISO 18436-7)",
  "FPLYN": "Osoba s certifikátem pro práci s F-plyny (nař. (EU) 2024/573)",
  "PO": "Odborně způsobilá osoba / technik PO (zák. 133/1985 Sb., vyhl. 246/2001 Sb.)",
  "EPS_TECH": "Technik EPS / SHZ s oprávněním výrobce systému",
  "EZS_TECH": "Technik zabezpečovacích a kamerových systémů",
  "IT": "Specialista IT/OT a kybernetické bezpečnosti",
  "AREAL": "Pracovník údržby areálu (mimo el. zařízení, s poučením o rizicích)",
  "GWO": "Technik VTE s certifikací GWO (práce ve výškách, záchrana) a autorizací OEM",
  "PLYN": "Revizní technik plynových zařízení / servis KGJ s oprávněním TIČR",
  "TLAK": "Revizní technik tlakových zařízení",
  "VODOHOSP": "Technik vodních děl / obsluha MVE",
  "ADMIN": "Asset / technický manažer RES"
 },
 "periodicity": {
  "KONT": {
   "nazev": "Kontinuálně 24/7",
   "mesicu": 0
  },
  "D": {
   "nazev": "Denně",
   "mesicu": 0
  },
  "T": {
   "nazev": "Týdně",
   "mesicu": 0
  },
  "1M": {
   "nazev": "Měsíčně",
   "mesicu": 1
  },
  "3M": {
   "nazev": "Čtvrtletně",
   "mesicu": 3
  },
  "6M": {
   "nazev": "Pololetně",
   "mesicu": 6
  },
  "12M": {
   "nazev": "Ročně",
   "mesicu": 12
  },
  "24M": {
   "nazev": "Jednou za 2 roky",
   "mesicu": 24
  },
  "36M": {
   "nazev": "Jednou za 3 roky",
   "mesicu": 36
  },
  "48M": {
   "nazev": "Jednou za 4 roky",
   "mesicu": 48
  },
  "60M": {
   "nazev": "Jednou za 5 let",
   "mesicu": 60
  },
  "SEZ": {
   "nazev": "Sezónně (dle počasí / vegetace)",
   "mesicu": null
  },
  "NP": {
   "nazev": "Dle potřeby / při události",
   "mesicu": null
  },
  "UVOD": {
   "nazev": "Jednorázově při převzetí do servisu",
   "mesicu": null
  }
 },
 "typy_ukonu": {
  "MON": "Dálkový monitoring / analýza dat",
  "VIZ": "Vizuální kontrola",
  "FUN": "Funkční zkouška",
  "MER": "Měření",
  "REV": "Zákonná revize / kontrola",
  "CIS": "Čištění",
  "UDR": "Údržba / seřízení / výměna",
  "SW": "Software / firmware / IT",
  "ADM": "Administrativa / reporting",
  "SKO": "Školení"
 },
 "zahrnuti": {
  "PAUSAL": "Zahrnuto v ročním paušálu",
  "MODUL": "Zahrnuto v ceně aktivovaného modulu",
  "EXTRA": "Účtuje se zvlášť dle sazebníku / nabídky"
 },
 "rozsah_oem": {
  "RES": "Provádí RES / servisní partner RES",
  "RES_OEM": "Provádí RES jako autorizovaný partner OEM dle postupů OEM",
  "OEM": "Provádí OEM v rámci záruky / LTSA – RES koordinuje, přebírá a kontroluje"
 },
 "cinnosti": [
  {
   "id": "LOK-001",
   "asset": "LOK",
   "podsystem": "Převzetí do servisu",
   "nazev": "Vstupní audit lokality a převzetí do servisu",
   "typ": "VIZ",
   "perioda": "UVOD",
   "perioda_nastavitelna": false,
   "kvalifikace": [
    "ADMIN",
    "EL7"
   ],
   "predpis": "Smlouva, ČSN 33 1500",
   "vystup": "Protokol vstupního auditu, seznam vad, fotodokumentace",
   "postup": [
    "Převzít projektovou a skutečnou dokumentaci, revizní zprávy, PBŘ, MPP, návody OEM",
    "Prohlídka všech zařízení, soupis vad a nedodělků z výstavby (punch list)",
    "Ověřit funkčnost monitoringu, alarmů a vzdálených přístupů",
    "Založit pasport zařízení (sériová čísla, firmware, záruky) do CMMS",
    "Navrhnout a odsouhlasit roční plán údržby"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "EXTRA",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": "Jednorázově; cena dle nabídky nebo součást prvního roku."
  },
  {
   "id": "LOK-002",
   "asset": "LOK",
   "podsystem": "Plán a reporting",
   "nazev": "Roční plán údržby a harmonogram výjezdů",
   "typ": "ADM",
   "perioda": "12M",
   "perioda_nastavitelna": false,
   "kvalifikace": [
    "ADMIN"
   ],
   "predpis": "Smlouva",
   "vystup": "Roční plán údržby odsouhlasený objednatelem",
   "postup": [
    "Sestavit plán z aktivních položek checklistu",
    "Rozvrhnout údržbu mimo období vysoké výroby / dle obchodní strategie BESS",
    "Odsouhlasit s objednatelem a agregátorem odstávky",
    "Zaslat do 30. 11. na následující rok"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "LOK-003",
   "asset": "LOK",
   "podsystem": "Plán a reporting",
   "nazev": "Měsíční provozní report",
   "typ": "ADM",
   "perioda": "1M",
   "perioda_nastavitelna": false,
   "kvalifikace": [
    "ADMIN",
    "DISP"
   ],
   "predpis": "Smlouva, Příloha 5",
   "vystup": "Měsíční report (výroba/propustnost, dostupnost, PR, poruchy, SLA, plán)",
   "postup": [
    "Vyhodnotit výrobu, PR, dostupnost a KPI dle Přílohy 5",
    "Seznam událostí a poruch vč. dodržení SLA",
    "Stav otevřených požadavků a reklamací",
    "Plán prací na další měsíc"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "LOK-004",
   "asset": "LOK",
   "podsystem": "Plán a reporting",
   "nazev": "Roční technická zpráva",
   "typ": "ADM",
   "perioda": "12M",
   "perioda_nastavitelna": false,
   "kvalifikace": [
    "ADMIN",
    "EL7"
   ],
   "predpis": "Smlouva",
   "vystup": "Roční zpráva o stavu zařízení a doporučení investic",
   "postup": [
    "Shrnutí KPI, degradace, dostupnosti",
    "Přehled revizí a jejich závad",
    "Doporučení oprav, výměn a CAPEX na další rok",
    "Vyhodnocení skladu náhradních dílů"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "LOK-005",
   "asset": "LOK",
   "podsystem": "Dokumentace a BOZP",
   "nazev": "Provozní deník, MPP a dokumentace zařízení",
   "typ": "ADM",
   "perioda": "NP",
   "perioda_nastavitelna": false,
   "kvalifikace": [
    "ADMIN",
    "EL7"
   ],
   "predpis": "ČSN EN 50110-1, zák. 309/2006 Sb.",
   "vystup": "Aktualizovaný provozní deník, MPP, pasport",
   "postup": [
    "Zapisovat všechny zásahy do provozního deníku / CMMS",
    "Aktualizovat místní provozní předpisy (MPP) po změnách",
    "Udržovat aktuální jednopólová schémata a pasport"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "LOK-006",
   "asset": "LOK",
   "podsystem": "Dokumentace a BOZP",
   "nazev": "Koordinace BOZP při souběhu více zhotovitelů",
   "typ": "ADM",
   "perioda": "NP",
   "perioda_nastavitelna": false,
   "kvalifikace": [
    "ADMIN"
   ],
   "predpis": "zák. 309/2006 Sb., zák. 262/2006 Sb.",
   "vystup": "Záznam o předání pracoviště, příkaz B / pracovní příkaz",
   "postup": [
    "Předání pracoviště a seznámení s riziky",
    "Vydání příkazu B pro práce na el. zařízení",
    "Kontrola dodržování BOZP subdodavateli"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "LOK-007",
   "asset": "LOK",
   "podsystem": "Dokumentace a BOZP",
   "nazev": "Kontrola a zkoušky ochranných a pracovních pomůcek (VN)",
   "typ": "MER",
   "perioda": "6M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EL6"
   ],
   "predpis": "ČSN EN 61111, ČSN EN 50508, návod výrobce",
   "vystup": "Evidence zkoušek pomůcek",
   "postup": [
    "Vizuální kontrola dielektrických rukavic, bot, tyčí, zkoušečky",
    "Zkouška dielektrických rukavic à 6 měsíců",
    "Kontrola zkratovací soupravy a výstražných tabulek"
   ],
   "aktivace": [
    "vn_pripojeni"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "LOK-008",
   "asset": "LOK",
   "podsystem": "Školení",
   "nazev": "Školení a přezkoušení obsluhy objednatele",
   "typ": "SKO",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EL7",
    "TECH"
   ],
   "predpis": "NV 194/2022 Sb., MPP",
   "vystup": "Prezenční listina, záznam o školení",
   "postup": [
    "Seznámení s MPP, nebezpečím a postupy při havárii",
    "Školení obsluhy BESS / FVE / EZS dle rozsahu lokality",
    "Přezkoušení a záznam"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "LOK-009",
   "asset": "LOK",
   "podsystem": "Technický management",
   "nazev": "Správa záruk, reklamace a koordinace OEM / LTSA",
   "typ": "ADM",
   "perioda": "NP",
   "perioda_nastavitelna": false,
   "kvalifikace": [
    "ADMIN"
   ],
   "predpis": "Smlouvy o dílo, záruční listy, LTSA",
   "vystup": "Registr záruk a reklamací, záznamy komunikace s OEM",
   "postup": [
    "Evidovat záruční lhůty a podmínky (motohodiny, cykly, teploty)",
    "Uplatňovat reklamace u OEM jménem objednatele",
    "Hlídat plnění povinností objednatele podmiňujících záruku",
    "Koordinovat a přebírat zásahy OEM"
   ],
   "aktivace": [],
   "modul": "TECHMGMT",
   "zahrnuti": "MODUL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "LOK-010",
   "asset": "LOK",
   "podsystem": "Technický management",
   "nazev": "Součinnost s PDS, OTE a ERÚ",
   "typ": "ADM",
   "perioda": "NP",
   "perioda_nastavitelna": false,
   "kvalifikace": [
    "ADMIN"
   ],
   "predpis": "zák. 458/2000 Sb., PPDS",
   "vystup": "Záznamy komunikace, hlášení",
   "postup": [
    "Hlášení poruch a odstávek PDS",
    "Součinnost při zkouškách PDS a změnách řízení výkonu",
    "Podklady pro výkazy ERÚ / OTE dle zadání objednatele"
   ],
   "aktivace": [],
   "modul": "TECHMGMT",
   "zahrnuti": "MODUL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "LOK-011",
   "asset": "LOK",
   "podsystem": "Technický management",
   "nazev": "Součinnost s bankou a technickým dozorem banky",
   "typ": "ADM",
   "perioda": "NP",
   "perioda_nastavitelna": false,
   "kvalifikace": [
    "ADMIN"
   ],
   "predpis": "Úvěrová dokumentace",
   "vystup": "Podklady a reporty pro banku / inspekční společnost",
   "postup": [
    "Poskytnout reporty a záznamy z údržby",
    "Umožnit inspekci lokality",
    "Hlásit podstatné události dle Smlouvy"
   ],
   "aktivace": [
    "bankovni_financovani"
   ],
   "modul": "TECHMGMT",
   "zahrnuti": "MODUL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": true,
   "poznamka": ""
  },
  {
   "id": "LOK-012",
   "asset": "LOK",
   "podsystem": "Technický management",
   "nazev": "Pojistné události – dokumentace a součinnost",
   "typ": "ADM",
   "perioda": "NP",
   "perioda_nastavitelna": false,
   "kvalifikace": [
    "ADMIN"
   ],
   "predpis": "Pojistná smlouva objednatele",
   "vystup": "Hlášení škody, fotodokumentace, odhad nákladů",
   "postup": [
    "Zajistit místo a fotodokumentaci",
    "Podklady pro likvidátora",
    "Návrh a realizace opravy po schválení"
   ],
   "aktivace": [],
   "modul": "TECHMGMT",
   "zahrnuti": "MODUL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "LOK-013",
   "asset": "LOK",
   "podsystem": "Náhradní díly",
   "nazev": "Správa skladu strategických náhradních dílů",
   "typ": "ADM",
   "perioda": "6M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "ADMIN"
   ],
   "predpis": "Smlouva, doporučení OEM",
   "vystup": "Inventura a návrh doplnění skladu",
   "postup": [
    "Inventura dle seznamu strategických ND",
    "Kontrola skladovacích podmínek (moduly BESS: teplota, SoC)",
    "Návrh doplnění objednateli"
   ],
   "aktivace": [],
   "modul": "ND",
   "zahrnuti": "MODUL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": true,
   "poznamka": "Sklad strategických dílů je předpokladem dodržení opravy kritické poruchy do 72 h."
  },
  {
   "id": "MON-001",
   "asset": "LOK",
   "podsystem": "Monitoring",
   "nazev": "Dálkový monitoring 24/7 a příjem alarmů",
   "typ": "MON",
   "perioda": "KONT",
   "perioda_nastavitelna": false,
   "kvalifikace": [
    "DISP"
   ],
   "predpis": "Smlouva, Příloha 3 (SLA)",
   "vystup": "Záznam alarmu, založený servisní požadavek (ticket)",
   "postup": [
    "Nepřetržitý příjem alarmů ze SCADA / portálů OEM",
    "Klasifikace priority P1–P4",
    "Vzdálená diagnostika a reset, kde je bezpečný",
    "Eskalace a dispečink technika dle SLA"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": true,
   "poznamka": ""
  },
  {
   "id": "MON-002",
   "asset": "LOK",
   "podsystem": "Monitoring",
   "nazev": "Denní kontrola výroby / provozu a datové kompletnosti",
   "typ": "MON",
   "perioda": "D",
   "perioda_nastavitelna": false,
   "kvalifikace": [
    "DISP"
   ],
   "predpis": "Smlouva",
   "vystup": "Denní log anomálií",
   "postup": [
    "Porovnat výrobu / dostupnost s očekáváním",
    "Identifikovat nedostupné střídače, stringy, PCS",
    "Ověřit kompletnost dat a komunikaci"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "MON-003",
   "asset": "LOK",
   "podsystem": "Monitoring",
   "nazev": "Kontrola komunikace, dataloggerů a datových připojení (SIM, router)",
   "typ": "FUN",
   "perioda": "3M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "TECH"
   ],
   "predpis": "Smlouva",
   "vystup": "Záznam v servisním listu",
   "postup": [
    "Kontrola dataloggerů, routerů, switchů, napájení",
    "Kontrola síly signálu a stavu SIM",
    "Ověření časové synchronizace"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "MON-004",
   "asset": "LOK",
   "podsystem": "Monitoring",
   "nazev": "Kontrola fakturačního a podružného měření",
   "typ": "MON",
   "perioda": "1M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "DISP"
   ],
   "predpis": "zák. 458/2000 Sb., vyhl. ERÚ o měření",
   "vystup": "Porovnání měření v reportu",
   "postup": [
    "Porovnat data fakturačního elektroměru (PDS) a interního měření",
    "Kontrola vlastní spotřeby (vč. spotřeby BESS)",
    "Prověřit odchylky > 2 %"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "MON-005",
   "asset": "LOK",
   "podsystem": "Meteostanice",
   "nazev": "Čištění a kontrola čidel meteostanice",
   "typ": "CIS",
   "perioda": "1M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "TECH"
   ],
   "predpis": "IEC 61724-1",
   "vystup": "Záznam v servisním listu",
   "postup": [
    "Očistit pyranometry / referenční články",
    "Kontrola vodorovnosti a uchycení",
    "Kontrola čidla teploty modulu"
   ],
   "aktivace": [
    "meteostanice"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "MON-006",
   "asset": "LOK",
   "podsystem": "Meteostanice",
   "nazev": "Kalibrace pyranometrů",
   "typ": "MER",
   "perioda": "24M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "TECH"
   ],
   "predpis": "ISO 9847, IEC 61724-1",
   "vystup": "Kalibrační list",
   "postup": [
    "Demontáž a kalibrace / výměna za kalibrovaný kus",
    "Aktualizace koeficientů ve SCADA"
   ],
   "aktivace": [
    "meteostanice"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "EXTRA",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "IT-001",
   "asset": "LOK",
   "podsystem": "Kybernetická bezpečnost",
   "nazev": "Revize vzdálených přístupů a účtů",
   "typ": "SW",
   "perioda": "3M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "IT"
   ],
   "predpis": "zák. 264/2025 Sb.",
   "vystup": "Seznam přístupů, záznam revize",
   "postup": [
    "Seznam aktivních účtů a VPN přístupů (RES, OEM, agregátor)",
    "Zrušit nepotřebné přístupy",
    "Ověřit MFA a změny hesel"
   ],
   "aktivace": [],
   "modul": "IT_OT",
   "zahrnuti": "MODUL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "IT-002",
   "asset": "LOK",
   "podsystem": "Kybernetická bezpečnost",
   "nazev": "Ověření, že aktivní prvky nejsou přístupné z veřejné sítě",
   "typ": "SW",
   "perioda": "6M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "IT"
   ],
   "predpis": "zák. 264/2025 Sb., požadavky banky",
   "vystup": "Protokol o kontrole síťové segmentace",
   "postup": [
    "Kontrola firewallu a segmentace OT sítě",
    "Ověřit, že střídače / PCS / EMS jsou ovládány jen přes privátní síť",
    "Sken otevřených portů"
   ],
   "aktivace": [],
   "modul": "IT_OT",
   "zahrnuti": "MODUL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": true,
   "poznamka": ""
  },
  {
   "id": "IT-003",
   "asset": "LOK",
   "podsystem": "Kybernetická bezpečnost",
   "nazev": "Zálohy konfigurací (SCADA, EMS, PPC, ochrany, routery)",
   "typ": "SW",
   "perioda": "3M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "IT"
   ],
   "predpis": "zák. 264/2025 Sb.",
   "vystup": "Záloha uložená mimo lokalitu, test obnovy 1× ročně",
   "postup": [
    "Zálohovat konfigurace",
    "Uložit mimo lokalitu",
    "Ročně provést test obnovy"
   ],
   "aktivace": [],
   "modul": "IT_OT",
   "zahrnuti": "MODUL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "IT-004",
   "asset": "LOK",
   "podsystem": "Kybernetická bezpečnost",
   "nazev": "Správa aktualizací firmware a bezpečnostních záplat",
   "typ": "SW",
   "perioda": "6M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "IT",
    "OEM_INV"
   ],
   "predpis": "zák. 264/2025 Sb., doporučení OEM",
   "vystup": "Registr verzí firmware",
   "postup": [
    "Sledovat bulletiny OEM",
    "Plánovat aktualizace v servisním okně se souhlasem objednatele",
    "Aktualizovat registr verzí"
   ],
   "aktivace": [],
   "modul": "IT_OT",
   "zahrnuti": "MODUL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "IT-005",
   "asset": "LOK",
   "podsystem": "Kybernetická bezpečnost",
   "nazev": "Hlášení a řešení kybernetických bezpečnostních událostí",
   "typ": "ADM",
   "perioda": "NP",
   "perioda_nastavitelna": false,
   "kvalifikace": [
    "IT"
   ],
   "predpis": "zák. 264/2025 Sb.",
   "vystup": "Záznam incidentu",
   "postup": [
    "Detekce a izolace incidentu",
    "Oznámení objednateli bez zbytečného odkladu",
    "Součinnost při hlášení dle zákona"
   ],
   "aktivace": [],
   "modul": "IT_OT",
   "zahrnuti": "MODUL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BOP-001",
   "asset": "BOP",
   "podsystem": "VN rozvodna",
   "nazev": "Vizuální kontrola VN rozvodny / předávací stanice",
   "typ": "VIZ",
   "perioda": "3M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EL6"
   ],
   "predpis": "ČSN EN 50110-1, MPP",
   "vystup": "Servisní list, fotodokumentace",
   "postup": [
    "Kontrola stavu rozvaděčů, indikací, tlaku SF6",
    "Kontrola vlhkosti, čistoty, těsnosti a hlodavců",
    "Kontrola výstražných tabulek, pomůcek a schémat"
   ],
   "aktivace": [
    "vn_pripojeni"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BOP-002",
   "asset": "BOP",
   "podsystem": "VN rozvodna",
   "nazev": "Údržba VN rozvaděčů – mechanická funkce spínacích prvků",
   "typ": "UDR",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EL7",
    "EL6"
   ],
   "predpis": "návod výrobce rozvaděče",
   "vystup": "Protokol údržby",
   "postup": [
    "Vypnutí a zajištění pracoviště",
    "Kontrola a mazání pohonů, blokád, uzemňovačů",
    "Kontrola dotažení spojů",
    "Zkouška funkce vypínačů"
   ],
   "aktivace": [
    "vn_pripojeni"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BOP-003",
   "asset": "BOP",
   "podsystem": "VN rozvodna",
   "nazev": "Pravidelná revize VN zařízení",
   "typ": "REV",
   "perioda": "24M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "RT_E1B"
   ],
   "predpis": "ČSN 33 1500, ČSN EN 61936-1, ČSN EN 50522",
   "vystup": "Revizní zpráva",
   "postup": [
    "Prohlídka, zkoušení a měření dle ČSN 33 1500",
    "Měření zemního odporu a dotykových napětí",
    "Vyhodnocení a zápis závad"
   ],
   "aktivace": [
    "vn_pripojeni"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": true,
   "poznamka": "Lhůtu stanoví revizní technik / MPP; výchozí 2 roky."
  },
  {
   "id": "BOP-004",
   "asset": "BOP",
   "podsystem": "Ochrany a řízení",
   "nazev": "Zkouška ochran VN (sekundární injekce) a vypínacích obvodů",
   "typ": "MER",
   "perioda": "48M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "OCHRANAR"
   ],
   "predpis": "PPDS, nastavení ochran schválené PDS",
   "vystup": "Protokol zkoušky ochran",
   "postup": [
    "Ověřit nastavení dle schváleného listu ochran",
    "Zkouška sekundární injekcí",
    "Zkouška vypínacích obvodů a signalizace"
   ],
   "aktivace": [
    "vn_pripojeni"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "EXTRA",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BOP-005",
   "asset": "BOP",
   "podsystem": "Ochrany a řízení",
   "nazev": "Funkční zkouška dálkového řízení PDS (RTU / ŘVO)",
   "typ": "FUN",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "OCHRANAR",
    "EL6"
   ],
   "predpis": "PPDS příl. 4, smlouva o připojení",
   "vystup": "Protokol zkoušky s dispečinkem PDS",
   "postup": [
    "Koordinace termínu s dispečinkem PDS",
    "Zkouška omezení výkonu a odpojení",
    "Ověřit přenos měření a stavů"
   ],
   "aktivace": [
    "rizeni_pds"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BOP-006",
   "asset": "BOP",
   "podsystem": "Transformátor",
   "nazev": "Vizuální kontrola transformátoru",
   "typ": "VIZ",
   "perioda": "3M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EL6"
   ],
   "predpis": "návod výrobce",
   "vystup": "Servisní list",
   "postup": [
    "Kontrola úniků oleje, stavu oleje v konzervátoru, silikagelu",
    "Kontrola teploty a ventilace",
    "Kontrola hluku a průchodek"
   ],
   "aktivace": [
    "trafo_olejove"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BOP-007",
   "asset": "BOP",
   "podsystem": "Transformátor",
   "nazev": "Rozbor transformátorového oleje (DGA, průrazné napětí, vlhkost)",
   "typ": "MER",
   "perioda": "36M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EL7"
   ],
   "predpis": "IEC 60599, IEC 60422, návod výrobce",
   "vystup": "Protokol laboratoře",
   "postup": [
    "Odběr vzorku oleje",
    "Laboratorní rozbor",
    "Vyhodnocení trendu"
   ],
   "aktivace": [
    "trafo_olejove"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "EXTRA",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BOP-008",
   "asset": "BOP",
   "podsystem": "Transformátor",
   "nazev": "Kontrola suchého transformátoru, čištění a dotažení spojů",
   "typ": "UDR",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EL6"
   ],
   "predpis": "návod výrobce",
   "vystup": "Servisní list",
   "postup": [
    "Vypnutí a zajištění",
    "Odstranění prachu",
    "Dotažení spojů momentem",
    "Kontrola teplotních čidel a ventilátorů"
   ],
   "aktivace": [
    "trafo_suche"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BOP-009",
   "asset": "BOP",
   "podsystem": "NN rozvody",
   "nazev": "Vizuální kontrola NN rozvaděčů vlastní spotřeby a hlavních NN rozvaděčů",
   "typ": "VIZ",
   "perioda": "3M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EL6"
   ],
   "predpis": "ČSN EN 50110-1",
   "vystup": "Servisní list",
   "postup": [
    "Kontrola stavu jističů, svodičů přepětí, indikací",
    "Kontrola teploty, vlhkosti, čistoty",
    "Kontrola uzamčení a označení"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BOP-010",
   "asset": "BOP",
   "podsystem": "NN rozvody",
   "nazev": "Termovizní kontrola VN/NN rozvaděčů a spojů pod zatížením",
   "typ": "MER",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "TERMO"
   ],
   "predpis": "ČSN EN ISO 18434-1",
   "vystup": "Termografická zpráva",
   "postup": [
    "Měření při zatížení > 40 % jmenovitého",
    "Identifikace hot-spotů",
    "Doporučení náprav"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BOP-011",
   "asset": "BOP",
   "podsystem": "NN rozvody",
   "nazev": "Pravidelná revize NN zařízení (AC, vlastní spotřeba)",
   "typ": "REV",
   "perioda": "24M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "RT_E2B"
   ],
   "predpis": "ČSN 33 1500, ČSN 33 2000-6",
   "vystup": "Revizní zpráva",
   "postup": [
    "Prohlídka, zkoušení, měření izolačních odporů a impedancí smyček",
    "Kontrola ochran před úrazem",
    "Zápis závad"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": true,
   "poznamka": ""
  },
  {
   "id": "BOP-012",
   "asset": "BOP",
   "podsystem": "Kompenzace",
   "nazev": "Kontrola kompenzačního zařízení / tlumivek",
   "typ": "UDR",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EL6"
   ],
   "predpis": "návod výrobce",
   "vystup": "Servisní list s naměřenými kapacitami",
   "postup": [
    "Měření kapacit kondenzátorů",
    "Kontrola stykačů a regulátoru",
    "Kontrola ventilace a teploty"
   ],
   "aktivace": [
    "kompenzace"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BOP-013",
   "asset": "BOP",
   "podsystem": "Záložní napájení",
   "nazev": "Kontrola UPS a zkouška autonomie",
   "typ": "FUN",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EL6"
   ],
   "predpis": "návod výrobce",
   "vystup": "Protokol zkoušky autonomie",
   "postup": [
    "Kontrola stavu baterií UPS",
    "Zkouška přepnutí a doby zálohy",
    "Plán výměny baterií"
   ],
   "aktivace": [
    "ups"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BOP-014",
   "asset": "BOP",
   "podsystem": "Uzemnění a hromosvod",
   "nazev": "Revize hromosvodu (LPS)",
   "typ": "REV",
   "perioda": "24M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "RT_E3B"
   ],
   "predpis": "ČSN EN 62305-3",
   "vystup": "Revizní zpráva",
   "postup": [
    "Prohlídka jímačů a svodů",
    "Měření přechodových odporů a zemničů",
    "Zápis závad"
   ],
   "aktivace": [
    "hromosvod"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": "Lhůta dle třídy LPS (2–4 roky)."
  },
  {
   "id": "BOP-015",
   "asset": "BOP",
   "podsystem": "Kabelové trasy",
   "nazev": "Kontrola kabelových tras, šachet a kabelových koncovek",
   "typ": "VIZ",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EL6"
   ],
   "predpis": "ČSN 33 2000-5-52",
   "vystup": "Servisní list",
   "postup": [
    "Kontrola šachet a krytů",
    "Kontrola koncovek VN kabelů",
    "Kontrola poškození tras (zemní práce třetích stran)"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "FVE-001",
   "asset": "FVE",
   "podsystem": "FV pole",
   "nazev": "Vizuální kontrola FV modulů a kabeláže",
   "typ": "VIZ",
   "perioda": "6M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "TECH"
   ],
   "predpis": "ČSN EN 62446-1, návod výrobce",
   "vystup": "Servisní list, fotodokumentace vad",
   "postup": [
    "Kontrola rozbitých skel, delaminace, hnědnutí, hot-spotů",
    "Kontrola konektorů MC4 a vyvazování kabelů",
    "Kontrola stínění vegetací"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "FVE-002",
   "asset": "FVE",
   "podsystem": "FV pole",
   "nazev": "Kontrola nosné konstrukce, ukotvení a uzemnění konstrukce",
   "typ": "VIZ",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "TECH"
   ],
   "predpis": "návod výrobce konstrukce",
   "vystup": "Servisní list",
   "postup": [
    "Kontrola koroze a deformací",
    "Výběrová kontrola utahovacích momentů (min. 5 %)",
    "Kontrola pospojování a zemních šroubů"
   ],
   "aktivace": [
    "fve_pozemni"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "FVE-003",
   "asset": "FVE",
   "podsystem": "FV pole",
   "nazev": "Kontrola střešní instalace – kotvení, zátěž, hydroizolace, průchodky",
   "typ": "VIZ",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "TECH"
   ],
   "predpis": "návod výrobce konstrukce, PBŘ",
   "vystup": "Servisní list",
   "postup": [
    "Kontrola kotvení / balastu",
    "Kontrola hydroizolace a průchodek",
    "Kontrola požárních úseků a DC vypínačů"
   ],
   "aktivace": [
    "fve_strecha"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "FVE-004",
   "asset": "FVE",
   "podsystem": "Tracker",
   "nazev": "Údržba trackerů – pohony, ložiska, řízení",
   "typ": "UDR",
   "perioda": "6M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "TECH"
   ],
   "predpis": "návod výrobce trackeru",
   "vystup": "Servisní list",
   "postup": [
    "Kontrola pohonů a převodovek, mazání",
    "Kontrola koncových poloh a režimu stow (vítr)",
    "Kontrola řídicích jednotek a komunikace"
   ],
   "aktivace": [
    "fve_tracker"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "FVE-005",
   "asset": "FVE",
   "podsystem": "FV pole",
   "nazev": "Termografická kontrola FV pole",
   "typ": "MER",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "TERMO"
   ],
   "predpis": "IEC TS 62446-3",
   "vystup": "Termografická zpráva dle IEC TS 62446-3",
   "postup": [
    "Měření při ozáření > 600 W/m² (dron / ručně)",
    "Klasifikace anomálií",
    "Seznam modulů k reklamaci / výměně"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "FVE-006",
   "asset": "FVE",
   "podsystem": "FV pole",
   "nazev": "Měření I-V charakteristik stringů (výběrově)",
   "typ": "MER",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EL6"
   ],
   "predpis": "ČSN EN 62446-1",
   "vystup": "Protokol měření",
   "postup": [
    "Výběrové měření min. 5 % stringů",
    "Měření všech stringů s anomálií z monitoringu",
    "Porovnání s STC a předchozím měřením"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "EXTRA",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "FVE-007",
   "asset": "FVE",
   "podsystem": "DC rozvody",
   "nazev": "Kontrola DC rozvaděčů / string boxů",
   "typ": "VIZ",
   "perioda": "6M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EL6"
   ],
   "predpis": "ČSN 33 2000-7-712",
   "vystup": "Servisní list",
   "postup": [
    "Kontrola pojistek, odpojovačů a svodičů přepětí",
    "Kontrola těsnosti, vlhkosti a teploty",
    "Kontrola dotažení svorek"
   ],
   "aktivace": [
    "string_boxy"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "FVE-008",
   "asset": "FVE",
   "podsystem": "Střídače",
   "nazev": "Kontrola stringových střídačů – stav, chybové logy, chlazení",
   "typ": "FUN",
   "perioda": "6M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EL6"
   ],
   "predpis": "návod výrobce",
   "vystup": "Servisní list",
   "postup": [
    "Odečet chybových logů",
    "Kontrola a čištění chladičů a ventilátorů",
    "Kontrola AC/DC svorek a přepěťových ochran",
    "Kontrola izolačního odporu z logu"
   ],
   "aktivace": [
    "stridace_stringove"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "FVE-009",
   "asset": "FVE",
   "podsystem": "Střídače",
   "nazev": "Preventivní údržba centrálních střídačů / inverter stanic",
   "typ": "UDR",
   "perioda": "6M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EL6",
    "OEM_INV"
   ],
   "predpis": "návod výrobce",
   "vystup": "Protokol údržby OEM",
   "postup": [
    "Výměna / čištění filtrů vzduchu",
    "Kontrola ventilátorů, chladicího okruhu",
    "Dotažení výkonových spojů",
    "Odečet logů a kontrola IGBT dle OEM"
   ],
   "aktivace": [
    "stridace_centralni"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "FVE-010",
   "asset": "FVE",
   "podsystem": "Střídače",
   "nazev": "Kontrola optimizérů / MLPE",
   "typ": "MON",
   "perioda": "3M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "DISP"
   ],
   "predpis": "návod výrobce",
   "vystup": "Záznam v reportu",
   "postup": [
    "Vyhodnocení výkonu jednotlivých modulů z portálu",
    "Seznam neaktivních optimizérů k výměně"
   ],
   "aktivace": [
    "optimizery"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "FVE-011",
   "asset": "FVE",
   "podsystem": "Revize",
   "nazev": "Pravidelná revize FVE – DC a AC strana",
   "typ": "REV",
   "perioda": "24M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "RT_E2B"
   ],
   "predpis": "ČSN 33 1500, ČSN EN 62446-1, ČSN 33 2000-7-712",
   "vystup": "Revizní zpráva",
   "postup": [
    "Prohlídka, zkoušky a měření dle ČSN EN 62446-1",
    "Izolační odpor DC, polarita, Uoc, Isc výběrově",
    "Kontrola ochrany před úrazem a přepětím"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": true,
   "poznamka": "Lhůtu stanoví revizní technik; výchozí 2 roky (u střešních FVE dle PBŘ)."
  },
  {
   "id": "FVE-012",
   "asset": "FVE",
   "podsystem": "FV pole",
   "nazev": "Mytí FV modulů",
   "typ": "CIS",
   "perioda": "SEZ",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "TECH"
   ],
   "predpis": "návod výrobce modulů",
   "vystup": "Záznam o mytí, porovnání PR před a po",
   "postup": [
    "Mytí demineralizovanou vodou bez chemie",
    "Měkké kartáče, bez tlakové vody nad limit OEM",
    "U bifaciálních i zadní strana dle potřeby"
   ],
   "aktivace": [],
   "modul": "MYTI",
   "zahrnuti": "MODUL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": false,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "FVE-013",
   "asset": "FVE",
   "podsystem": "Výkon",
   "nazev": "Vyhodnocení PR a degradace, reklamace výkonu modulů",
   "typ": "MON",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "ADMIN"
   ],
   "predpis": "IEC 61724-1",
   "vystup": "Kapitola v roční technické zprávě",
   "postup": [
    "Výpočet teplotně korigovaného PR",
    "Porovnání s garantovanou degradací OEM",
    "Návrh reklamace výkonu"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BESS-001",
   "asset": "BESS",
   "podsystem": "Monitoring BESS",
   "nazev": "Vyhodnocení SoC/SoH, napětí a teplot článků (odchylky, balancování)",
   "typ": "MON",
   "perioda": "1M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "DISP",
    "OEM_BESS"
   ],
   "predpis": "návod OEM, LTSA",
   "vystup": "Kapitola BESS v měsíčním reportu",
   "postup": [
    "Trend SoH a dostupné kapacity",
    "Rozptyl napětí článků a teplot proti limitům OEM",
    "Kontrola balancování a alarmů BMS"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BESS-002",
   "asset": "BESS",
   "podsystem": "Monitoring BESS",
   "nazev": "Kontrola plnění záručních podmínek OEM (cykly, C-rate, teploty, SoC okno)",
   "typ": "MON",
   "perioda": "1M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "ADMIN"
   ],
   "predpis": "Záruka OEM, LTSA",
   "vystup": "Záznam v měsíčním reportu",
   "postup": [
    "Počet ekvivalentních cyklů vs. limit záruky",
    "Překročení teplot a SoC okna",
    "Upozornění objednatele a agregátora na rizika"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": true,
   "poznamka": ""
  },
  {
   "id": "BESS-003",
   "asset": "BESS",
   "podsystem": "Bateriové kontejnery",
   "nazev": "Vizuální kontrola kontejnerů BESS",
   "typ": "VIZ",
   "perioda": "1M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "TECH",
    "OEM_BESS"
   ],
   "predpis": "návod OEM",
   "vystup": "Servisní list, fotodokumentace",
   "postup": [
    "Kontrola koroze, těsnění dveří, průchodek",
    "Kontrola úniků chladiva, kondenzace, zápachu",
    "Kontrola okolí (vegetace, odstupové vzdálenosti)",
    "Kontrola stavu E-STOP a výstražného značení"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BESS-004",
   "asset": "BESS",
   "podsystem": "Bateriové moduly",
   "nazev": "Kontrola bateriových racků a modulů – spoje, kabeláž, BMS",
   "typ": "UDR",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "OEM_BESS"
   ],
   "predpis": "návod OEM",
   "vystup": "Protokol údržby dle OEM",
   "postup": [
    "Vypnutí a zajištění dle OEM",
    "Výběrová kontrola utahovacích momentů výkonových spojů",
    "Kontrola komunikační kabeláže BMS",
    "Kontrola izolačního odporu"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BESS-005",
   "asset": "BESS",
   "podsystem": "Bateriové moduly",
   "nazev": "Kalibrace SoC (řízené plné nabití / vybití)",
   "typ": "FUN",
   "perioda": "3M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "OEM_BESS",
    "DISP"
   ],
   "predpis": "návod OEM",
   "vystup": "Záznam v CMMS",
   "postup": [
    "Koordinace s agregátorem (okno mimo obchodování)",
    "Plné nabití a balancování dle OEM",
    "Ověření korekce SoC"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": "Periodicita dle OEM (typicky 1–3 měsíce)."
  },
  {
   "id": "BESS-006",
   "asset": "BESS",
   "podsystem": "Bateriové moduly",
   "nazev": "Kapacitní test (SoH) a test účinnosti RTE",
   "typ": "MER",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "OEM_BESS"
   ],
   "predpis": "IEC 62933-2-1, LTSA",
   "vystup": "Protokol kapacitního testu, výpočet RTE",
   "postup": [
    "Plné nabití / vybití definovaným výkonem",
    "Měření na předávacím místě i na DC straně",
    "Vyhodnocení SoH a RTE vůči garanci OEM"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": true,
   "poznamka": ""
  },
  {
   "id": "BESS-007",
   "asset": "BESS",
   "podsystem": "Bateriové moduly",
   "nazev": "Termovizní kontrola racků, DC rozvaděčů a spojů",
   "typ": "MER",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "TERMO"
   ],
   "predpis": "ČSN EN ISO 18434-1",
   "vystup": "Termografická zpráva",
   "postup": [
    "Měření při zatížení",
    "Identifikace hot-spotů",
    "Doporučení náprav"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BESS-008",
   "asset": "BESS",
   "podsystem": "PCS",
   "nazev": "Údržba PCS / bateriových střídačů",
   "typ": "UDR",
   "perioda": "6M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "OEM_INV",
    "EL6"
   ],
   "predpis": "návod OEM",
   "vystup": "Protokol údržby",
   "postup": [
    "Výměna / čištění filtrů",
    "Kontrola ventilátorů a chladicího okruhu PCS",
    "Dotažení výkonových spojů",
    "Odečet logů a chybových kódů"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BESS-009",
   "asset": "BESS",
   "podsystem": "PCS",
   "nazev": "Měření kvality elektřiny a harmonických",
   "typ": "MER",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EL6"
   ],
   "predpis": "ČSN EN 50160, PPDS příl. 3",
   "vystup": "Protokol měření",
   "postup": [
    "Měření analyzátorem min. 7 dní",
    "Vyhodnocení THD a flikru vůči limitům PDS"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "EXTRA",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BESS-010",
   "asset": "BESS",
   "podsystem": "Chlazení",
   "nazev": "Kontrola kapalinového chlazení – hladina, tlak, úniky, čerpadla",
   "typ": "VIZ",
   "perioda": "1M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "TECH",
    "OEM_BESS"
   ],
   "predpis": "návod OEM (Liquid-cooling ESS O&M)",
   "vystup": "Servisní list s naměřenými hodnotami",
   "postup": [
    "Odečet tlaku a hladiny chladiva",
    "Kontrola úniků na spojích a rychlospojkách",
    "Kontrola funkce čerpadel a hluku"
   ],
   "aktivace": [
    "bess_kapalinove_chlazeni"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BESS-011",
   "asset": "BESS",
   "podsystem": "Chlazení",
   "nazev": "Čištění kondenzátoru / výměníku chilleru",
   "typ": "CIS",
   "perioda": "6M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "TECH",
    "OEM_BESS"
   ],
   "predpis": "návod OEM",
   "vystup": "Servisní list",
   "postup": [
    "Vypnutí chilleru dle OEM",
    "Čištění lamel tlakovým vzduchem / nízkotlakou vodou",
    "Kontrola ventilátorů"
   ],
   "aktivace": [
    "bess_kapalinove_chlazeni"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": "V prašném prostředí 3M."
  },
  {
   "id": "BESS-012",
   "asset": "BESS",
   "podsystem": "Chlazení",
   "nazev": "Rozbor a výměna chladicí kapaliny (glykol)",
   "typ": "UDR",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "OEM_BESS"
   ],
   "predpis": "návod OEM",
   "vystup": "Protokol rozboru (pH, koncentrace, vodivost)",
   "postup": [
    "Odběr vzorku a rozbor",
    "Výměna dle OEM (typicky 3–5 let)",
    "Odvzdušnění okruhu"
   ],
   "aktivace": [
    "bess_kapalinove_chlazeni"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BESS-013",
   "asset": "BESS",
   "podsystem": "Chlazení",
   "nazev": "Kontrola a servis HVAC jednotek kontejnerů",
   "typ": "UDR",
   "perioda": "6M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "TECH",
    "FPLYN"
   ],
   "predpis": "návod OEM",
   "vystup": "Servisní list",
   "postup": [
    "Výměna filtrů",
    "Čištění výměníků",
    "Kontrola odvodu kondenzátu",
    "Kontrola teplot a regulace"
   ],
   "aktivace": [
    "bess_vzduchove_chlazeni"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BESS-014",
   "asset": "BESS",
   "podsystem": "Chlazení",
   "nazev": "Kontrola těsnosti okruhů s F-plyny",
   "typ": "REV",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "FPLYN"
   ],
   "predpis": "nař. (EU) 2024/573, zák. 73/2012 Sb.",
   "vystup": "Záznam o kontrole těsnosti, evidence F-plynů",
   "postup": [
    "Kontrola těsnosti dle náplně v t CO2e",
    "Zápis do evidence",
    "Hlášení dle zákona"
   ],
   "aktivace": [
    "f_plyny"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": "Četnost dle náplně v t CO2e (12M / 6M / 3M); s detekcí úniku lze prodloužit."
  },
  {
   "id": "BESS-015",
   "asset": "BESS",
   "podsystem": "Požární bezpečnost",
   "nazev": "Kontrola detekce plynů a kouře, odvětrání a deflagračních prvků",
   "typ": "FUN",
   "perioda": "6M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EPS_TECH",
    "OEM_BESS"
   ],
   "predpis": "NFPA 855 / návod OEM, PBŘ",
   "vystup": "Protokol funkční zkoušky",
   "postup": [
    "Funkční test detektorů plynů (H2, CO) a kouře",
    "Zkouška spuštění ventilace / odvětrání",
    "Kontrola deflagračních panelů"
   ],
   "aktivace": [
    "bess_detekce_plynu"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": true,
   "poznamka": ""
  },
  {
   "id": "BESS-016",
   "asset": "BESS",
   "podsystem": "Požární bezpečnost",
   "nazev": "Kalibrace detektorů plynů",
   "typ": "MER",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EPS_TECH"
   ],
   "predpis": "návod výrobce detektorů",
   "vystup": "Kalibrační protokol",
   "postup": [
    "Kalibrace kalibračním plynem",
    "Výměna čidel po životnosti"
   ],
   "aktivace": [
    "bess_detekce_plynu"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BESS-017",
   "asset": "BESS",
   "podsystem": "Požární bezpečnost",
   "nazev": "Kontrola provozuschopnosti hasicího systému BESS",
   "typ": "REV",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EPS_TECH"
   ],
   "predpis": "vyhl. 246/2001 Sb., návod výrobce SHZ",
   "vystup": "Doklad o kontrole provozuschopnosti",
   "postup": [
    "Kontrola tlaku / hmotnosti nádob, aktivačních prvků",
    "Zkouška řídicí logiky bez vypuštění",
    "Kontrola blokace a signalizace do monitoringu"
   ],
   "aktivace": [
    "bess_hasici_system"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": true,
   "poznamka": ""
  },
  {
   "id": "BESS-018",
   "asset": "BESS",
   "podsystem": "Bezpečnost",
   "nazev": "Zkouška nouzového vypnutí (E-STOP) a vazeb na ochrany",
   "typ": "FUN",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "OEM_BESS",
    "EL6"
   ],
   "predpis": "návod OEM",
   "vystup": "Protokol zkoušky",
   "postup": [
    "Zkouška všech tlačítek E-STOP",
    "Ověřit vypnutí PCS a DC stykačů",
    "Ověřit signalizaci do SCADA"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BESS-019",
   "asset": "BESS",
   "podsystem": "Řízení",
   "nazev": "Kontrola EMS / PPC – nastavení, limity, komunikace s agregátorem",
   "typ": "SW",
   "perioda": "3M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "IT",
    "OEM_BESS"
   ],
   "predpis": "smlouva s agregátorem, PPDS",
   "vystup": "Záznam v CMMS",
   "postup": [
    "Kontrola limitů výkonu, SoC okna a rampy",
    "Ověřit komunikaci s agregátorem a PDS",
    "Kontrola časové synchronizace a logů"
   ],
   "aktivace": [
    "bess_agregator"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BESS-020",
   "asset": "BESS",
   "podsystem": "Řízení",
   "nazev": "Aktualizace firmware BMS / PCS / EMS dle OEM",
   "typ": "SW",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "OEM_BESS"
   ],
   "predpis": "návod OEM, zák. 264/2025 Sb.",
   "vystup": "Registr verzí firmware",
   "postup": [
    "Plán aktualizace se souhlasem objednatele a agregátora",
    "Záloha konfigurace",
    "Aktualizace a funkční ověření"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BESS-021",
   "asset": "BESS",
   "podsystem": "Revize",
   "nazev": "Pravidelná revize BESS – DC a AC strana, uzemnění",
   "typ": "REV",
   "perioda": "24M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "RT_E2B"
   ],
   "predpis": "ČSN 33 1500, ČSN EN 62485-5, návod OEM",
   "vystup": "Revizní zpráva",
   "postup": [
    "Prohlídka, zkoušení a měření",
    "Izolační odpory DC",
    "Kontrola pospojování kontejnerů"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": true,
   "poznamka": "Část nad 1 kV DC / VN revize provádí RT_E1B."
  },
  {
   "id": "BESS-022",
   "asset": "BESS",
   "podsystem": "Bateriové kontejnery",
   "nazev": "Kontrola pomocného napájení a UPS řídicích systémů BESS",
   "typ": "FUN",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EL6"
   ],
   "predpis": "návod OEM",
   "vystup": "Protokol",
   "postup": [
    "Zkouška přepnutí na zálohu",
    "Kontrola baterií UPS"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BESS-023",
   "asset": "BESS",
   "podsystem": "Bateriové kontejnery",
   "nazev": "Kontrola kontejneru – nátěry, těsnění, střecha, kotvení",
   "typ": "UDR",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "TECH"
   ],
   "predpis": "návod OEM",
   "vystup": "Servisní list",
   "postup": [
    "Opravy nátěrů",
    "Výměna poškozených těsnění",
    "Kontrola kotvení k základům"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BESS-024",
   "asset": "BESS",
   "podsystem": "Údržba dle OEM",
   "nazev": "Roční preventivní údržba dle O&M manuálu OEM (komplexní)",
   "typ": "UDR",
   "perioda": "12M",
   "perioda_nastavitelna": false,
   "kvalifikace": [
    "OEM_BESS"
   ],
   "predpis": "O&M manuál OEM, LTSA",
   "vystup": "Protokol OEM / RES jako autorizovaného partnera",
   "postup": [
    "Provedení všech úkonů ročního intervalu dle OEM",
    "Výměna dílů s omezenou životností dle OEM",
    "Potvrzení OEM pro zachování záruky"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": true,
   "poznamka": "Rozsah se řídí O&M manuálem OEM v aktuální verzi; při rozporu má přednost OEM."
  },
  {
   "id": "BEZ-001",
   "asset": "LOK",
   "podsystem": "EZS",
   "nazev": "Kontrola EZS – infrazávory, čidla, ústředna, přenos na PCO",
   "typ": "FUN",
   "perioda": "3M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EZS_TECH"
   ],
   "predpis": "ČSN EN 50131-1",
   "vystup": "Protokol funkční zkoušky",
   "postup": [
    "Test infrazávorů a čidel (čištění čoček)",
    "Test ústředny a záložních akumulátorů",
    "Test přenosu poplachu na PCO / RES"
   ],
   "aktivace": [
    "ezs"
   ],
   "modul": "BEZPECNOST",
   "zahrnuti": "MODUL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BEZ-002",
   "asset": "LOK",
   "podsystem": "CCTV",
   "nazev": "Kontrola CCTV – kamery, záznam, noční režim, vzdálený přístup",
   "typ": "FUN",
   "perioda": "3M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EZS_TECH"
   ],
   "predpis": "ČSN EN 62676, GDPR",
   "vystup": "Servisní list",
   "postup": [
    "Kontrola obrazu a ostrosti, čištění krytů",
    "Kontrola délky záznamu NVR",
    "Ověření vzdáleného přístupu"
   ],
   "aktivace": [
    "cctv"
   ],
   "modul": "BEZPECNOST",
   "zahrnuti": "MODUL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BEZ-003",
   "asset": "LOK",
   "podsystem": "Osvětlení",
   "nazev": "Kontrola venkovního, bezpečnostního a nouzového osvětlení",
   "typ": "FUN",
   "perioda": "6M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EL6"
   ],
   "predpis": "ČSN EN 1838",
   "vystup": "Servisní list",
   "postup": [
    "Funkce svítidel a čidel",
    "Zkouška nouzového osvětlení"
   ],
   "aktivace": [
    "osvetleni"
   ],
   "modul": "BEZPECNOST",
   "zahrnuti": "MODUL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BEZ-004",
   "asset": "LOK",
   "podsystem": "Požární ochrana",
   "nazev": "Kontrola hasicích přístrojů",
   "typ": "REV",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "PO"
   ],
   "predpis": "vyhl. 246/2001 Sb., ČSN EN 3",
   "vystup": "Doklad o kontrole",
   "postup": [
    "Kontrola dle vyhl. 246/2001 Sb.",
    "Výměna / tlaková zkouška dle lhůt"
   ],
   "aktivace": [
    "hasici_pristroje"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BEZ-005",
   "asset": "LOK",
   "podsystem": "Požární ochrana",
   "nazev": "Kontrola provozuschopnosti EPS",
   "typ": "REV",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "EPS_TECH"
   ],
   "predpis": "vyhl. 246/2001 Sb., ČSN 34 2710",
   "vystup": "Doklad o kontrole provozuschopnosti",
   "postup": [
    "Test hlásičů a ústředny",
    "Test přenosu na PCO / RES"
   ],
   "aktivace": [
    "eps"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "BEZ-006",
   "asset": "LOK",
   "podsystem": "Výjezd na poplach",
   "nazev": "Výjezd na poplach EZS / narušení areálu",
   "typ": "FUN",
   "perioda": "NP",
   "perioda_nastavitelna": false,
   "kvalifikace": [
    "TECH",
    "EZS_TECH"
   ],
   "predpis": "Smlouva",
   "vystup": "Záznam o zásahu",
   "postup": [
    "Ověření poplachu kamerami",
    "Koordinace s PCO / Policií ČR",
    "Zabezpečení areálu"
   ],
   "aktivace": [
    "ezs"
   ],
   "modul": "BEZPECNOST",
   "zahrnuti": "EXTRA",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "ARE-001",
   "asset": "LOK",
   "podsystem": "Areál",
   "nazev": "Kontrola oplocení, bran, zámků a značení",
   "typ": "VIZ",
   "perioda": "3M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "AREAL"
   ],
   "predpis": "Smlouva",
   "vystup": "Servisní list",
   "postup": [
    "Kontrola celistvosti oplocení",
    "Funkce bran a zámků",
    "Výstražné tabulky"
   ],
   "aktivace": [
    "oploceni"
   ],
   "modul": "AREAL",
   "zahrnuti": "MODUL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "ARE-002",
   "asset": "LOK",
   "podsystem": "Areál",
   "nazev": "Údržba vegetace (sekání, odstranění náletů, okolí kontejnerů BESS)",
   "typ": "UDR",
   "perioda": "SEZ",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "AREAL"
   ],
   "predpis": "Smlouva, PBŘ",
   "vystup": "Záznam o provedení",
   "postup": [
    "Sekání 3–5× ročně dle vegetace",
    "Odstranění stínící vegetace",
    "Udržování nehořlavého pásu kolem BESS dle PBŘ"
   ],
   "aktivace": [
    "travni_porost"
   ],
   "modul": "AREAL",
   "zahrnuti": "MODUL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "ARE-003",
   "asset": "LOK",
   "podsystem": "Areál",
   "nazev": "Údržba komunikací, odvodnění a zimní údržba",
   "typ": "UDR",
   "perioda": "SEZ",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "AREAL"
   ],
   "predpis": "Smlouva",
   "vystup": "Záznam o provedení",
   "postup": [
    "Kontrola propustků a odvodnění",
    "Zimní údržba přístupu k trafostanici a BESS"
   ],
   "aktivace": [
    "komunikace_areal"
   ],
   "modul": "AREAL",
   "zahrnuti": "MODUL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": false,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "MVE-001",
   "asset": "MVE",
   "podsystem": "Vodní část",
   "nazev": "Čištění česlí a kontrola čisticího stroje",
   "typ": "CIS",
   "perioda": "T",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "VODOHOSP",
    "TECH"
   ],
   "predpis": "manipulační řád",
   "vystup": "Záznam v provozním deníku",
   "postup": [
    "Čištění česlí",
    "Kontrola čisticího stroje a odvozu shrabků"
   ],
   "aktivace": [
    "mve_cesle"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "MVE-002",
   "asset": "MVE",
   "podsystem": "Vodní část",
   "nazev": "Kontrola dodržení minimálního zůstatkového průtoku a manipulačního řádu",
   "typ": "MON",
   "perioda": "D",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "DISP"
   ],
   "predpis": "vodoprávní povolení, manipulační řád",
   "vystup": "Záznam v reportu",
   "postup": [
    "Kontrola hladin a průtoků",
    "Hlášení odchylek"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "MVE-003",
   "asset": "MVE",
   "podsystem": "Soustrojí",
   "nazev": "Kontrola turbíny a generátoru – ložiska, těsnění, vibrace, teploty",
   "typ": "UDR",
   "perioda": "3M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "TECH",
    "EL6"
   ],
   "predpis": "návod výrobce",
   "vystup": "Servisní list s naměřenými hodnotami",
   "postup": [
    "Měření vibrací a teplot ložisek",
    "Mazání dle mazacího plánu",
    "Kontrola ucpávek"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "MVE-004",
   "asset": "MVE",
   "podsystem": "Soustrojí",
   "nazev": "Servis hydraulického agregátu",
   "typ": "UDR",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "TECH"
   ],
   "predpis": "návod výrobce",
   "vystup": "Protokol",
   "postup": [
    "Výměna filtrů, kontrola oleje",
    "Zkouška tlaků a těsnosti"
   ],
   "aktivace": [
    "mve_hydraulika"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "MVE-005",
   "asset": "MVE",
   "podsystem": "Soustrojí",
   "nazev": "Generální prohlídka soustrojí",
   "typ": "UDR",
   "perioda": "60M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "TECH"
   ],
   "predpis": "návod výrobce",
   "vystup": "Protokol generální prohlídky",
   "postup": [
    "Demontáž a kontrola oběžného kola",
    "Výměna ložisek a těsnění dle stavu"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "EXTRA",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "VTE-001",
   "asset": "VTE",
   "podsystem": "Turbína",
   "nazev": "Pololetní / roční servis VTE dle OEM",
   "typ": "UDR",
   "perioda": "6M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "GWO"
   ],
   "predpis": "O&M manuál OEM",
   "vystup": "Protokol OEM",
   "postup": [
    "Úkony dle servisního plánu OEM",
    "Kontrola převodovky, ložisek, natáčení gondoly a listů"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "VTE-002",
   "asset": "VTE",
   "podsystem": "Turbína",
   "nazev": "Kontrola dotažení šroubových spojů věže a rotoru",
   "typ": "UDR",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "GWO"
   ],
   "predpis": "O&M manuál OEM",
   "vystup": "Protokol utahování",
   "postup": [
    "Kontrola spojů dle plánu OEM (výběr / 100 %)"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "VTE-003",
   "asset": "VTE",
   "podsystem": "Turbína",
   "nazev": "Inspekce rotorových listů (dron / lano)",
   "typ": "VIZ",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "GWO"
   ],
   "predpis": "doporučení OEM",
   "vystup": "Inspekční zpráva",
   "postup": [
    "Inspekce náběžných hran, trhlin, ochrany proti blesku"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "EXTRA",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "VTE-004",
   "asset": "VTE",
   "podsystem": "Turbína",
   "nazev": "Rozbor oleje převodovky",
   "typ": "MER",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "GWO"
   ],
   "predpis": "O&M manuál OEM",
   "vystup": "Protokol laboratoře",
   "postup": [
    "Odběr a rozbor oleje"
   ],
   "aktivace": [],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "VTE-005",
   "asset": "VTE",
   "podsystem": "Bezpečnost",
   "nazev": "Revize výtahu / šplhacího zařízení a záchranných prostředků",
   "typ": "REV",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "GWO"
   ],
   "predpis": "NV 122/2016 Sb., návod výrobce",
   "vystup": "Revizní / kontrolní zpráva",
   "postup": [
    "Kontrola výtahu",
    "Kontrola záchranných a jisticích prostředků"
   ],
   "aktivace": [
    "vte_vytah"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "ENC-001",
   "asset": "ENC",
   "podsystem": "KGJ",
   "nazev": "Servis KGJ dle motohodin (výměna oleje, svíčky, filtry, ventily)",
   "typ": "UDR",
   "perioda": "NP",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "PLYN"
   ],
   "predpis": "návod výrobce KGJ",
   "vystup": "Servisní protokol",
   "postup": [
    "Servis dle intervalu motohodin",
    "Rozbor oleje",
    "Seřízení emisí"
   ],
   "aktivace": [
    "enc_kgj"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES_OEM",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": "Interval dle motohodin (typicky 1 000–2 000 mth)."
  },
  {
   "id": "ENC-002",
   "asset": "ENC",
   "podsystem": "Plynová zařízení",
   "nazev": "Kontrola a revize plynových zařízení",
   "typ": "REV",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "PLYN"
   ],
   "predpis": "vyhl. 85/1978 Sb., ČSN EN 1775, TPG 704 01",
   "vystup": "Zpráva o kontrole / revizní zpráva",
   "postup": [
    "Roční kontrola plynového zařízení",
    "Revize 1× za 3 roky"
   ],
   "aktivace": [
    "enc_kgj|enc_kotelna"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "ENC-003",
   "asset": "ENC",
   "podsystem": "Kotelna",
   "nazev": "Servis plynových kotlů a kontrola spalinových cest",
   "typ": "UDR",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "PLYN"
   ],
   "predpis": "vyhl. 34/2016 Sb., návod výrobce",
   "vystup": "Servisní protokol, zpráva o kontrole spalinové cesty",
   "postup": [
    "Servis hořáků a seřízení",
    "Kontrola spalinové cesty"
   ],
   "aktivace": [
    "enc_kotelna"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "ENC-004",
   "asset": "ENC",
   "podsystem": "Tepelná čerpadla",
   "nazev": "Servis tepelných čerpadel a kontrola těsnosti F-plynů",
   "typ": "UDR",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "FPLYN"
   ],
   "predpis": "nař. (EU) 2024/573, návod výrobce",
   "vystup": "Servisní protokol",
   "postup": [
    "Kontrola těsnosti",
    "Čištění výměníků",
    "Kontrola parametrů"
   ],
   "aktivace": [
    "enc_tc"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "ENC-005",
   "asset": "ENC",
   "podsystem": "Tlaková zařízení",
   "nazev": "Provozní revize tlakových nádob",
   "typ": "REV",
   "perioda": "12M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "TLAK"
   ],
   "predpis": "ČSN 69 0012, NV 219/2016 Sb.",
   "vystup": "Revizní zpráva",
   "postup": [
    "Provozní revize 1× ročně",
    "Vnitřní revize a tlaková zkouška dle lhůt"
   ],
   "aktivace": [
    "enc_tlakove_nadoby"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "PAUSAL",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": ""
  },
  {
   "id": "ENC-006",
   "asset": "ENC",
   "podsystem": "Emise",
   "nazev": "Autorizované měření emisí",
   "typ": "MER",
   "perioda": "36M",
   "perioda_nastavitelna": true,
   "kvalifikace": [
    "PLYN"
   ],
   "predpis": "zák. 201/2012 Sb.",
   "vystup": "Protokol autorizovaného měření",
   "postup": [
    "Měření autorizovanou osobou dle povolení provozu"
   ],
   "aktivace": [
    "enc_kgj"
   ],
   "modul": "ZAKLAD",
   "zahrnuti": "EXTRA",
   "rozsah_oem": "RES",
   "vychozi_zapnuto": true,
   "kriticka_pro_banku": false,
   "poznamka": "Lhůtu stanoví povolení provozu / zákon dle příkonu zdroje."
  }
 ],
 "sla": {
  "priority": [
   {
    "kod": "P1",
    "nazev": "Kritická",
    "definice": "Ohrožení bezpečnosti osob nebo majetku (požár, alarm thermal runaway, únik, úraz); výpadek celé lokality, celého BESS nebo více než 30 % instalovaného výkonu; odpojení od DS; požadavek dispečinku PDS / agregátora s dopadem na plnění závazků."
   },
   {
    "kod": "P2",
    "nazev": "Vysoká",
    "definice": "Výpadek 5–30 % instalovaného výkonu / kapacity (střídač, PCS, rack, transformátor stanice); ztráta monitoringu celé lokality; porucha chlazení BESS vyžadující omezení výkonu; porucha EZS celého areálu."
   },
   {
    "kod": "P3",
    "nazev": "Střední",
    "definice": "Výpadek do 5 % výkonu (stringy, jednotlivé moduly); dílčí porucha komunikace; porucha CCTV / osvětlení; varovné alarmy bez vlivu na výkon."
   },
   {
    "kod": "P4",
    "nazev": "Nízká",
    "definice": "Závady bez vlivu na výrobu a bezpečnost, kosmetické vady, požadavky na optimalizaci, administrativa."
   }
  ],
  "profily": {
   "STANDARD": {
    "nazev": "Standard (výchozí, splňuje požadavky banky)",
    "casy": {
     "P1": {
      "reakce": "1 h (24/7)",
      "reakce_h": 1,
      "prijezd": "8 h (24/7)",
      "prijezd_h": 8,
      "docasne": "24 h",
      "docasne_h": 24,
      "odstraneni": "72 h",
      "odstraneni_h": 72
     },
     "P2": {
      "reakce": "2 h (24/7)",
      "reakce_h": 2,
      "prijezd": "24 h",
      "prijezd_h": 24,
      "docasne": "48 h",
      "docasne_h": 48,
      "odstraneni": "5 pracovních dnů",
      "odstraneni_h": 120
     },
     "P3": {
      "reakce": "4 h v pracovní době",
      "reakce_h": 4,
      "prijezd": "3 pracovní dny",
      "prijezd_h": 72,
      "docasne": "—",
      "docasne_h": null,
      "odstraneni": "10 pracovních dnů",
      "odstraneni_h": 240
     },
     "P4": {
      "reakce": "1 pracovní den",
      "reakce_h": 24,
      "prijezd": "při nejbližší plánované návštěvě",
      "prijezd_h": null,
      "docasne": "—",
      "docasne_h": null,
      "odstraneni": "30 dnů",
      "odstraneni_h": 720
     }
    }
   },
   "PREMIUM": {
    "nazev": "Premium (lokality s vysokou hodnotou výpadku / obchodované BESS)",
    "casy": {
     "P1": {
      "reakce": "30 min (24/7)",
      "reakce_h": 0.5,
      "prijezd": "4 h (24/7)",
      "prijezd_h": 4,
      "docasne": "12 h",
      "docasne_h": 12,
      "odstraneni": "48 h",
      "odstraneni_h": 48
     },
     "P2": {
      "reakce": "1 h (24/7)",
      "reakce_h": 1,
      "prijezd": "12 h",
      "prijezd_h": 12,
      "docasne": "24 h",
      "docasne_h": 24,
      "odstraneni": "3 pracovní dny",
      "odstraneni_h": 72
     },
     "P3": {
      "reakce": "4 h v pracovní době",
      "reakce_h": 4,
      "prijezd": "2 pracovní dny",
      "prijezd_h": 48,
      "docasne": "—",
      "docasne_h": null,
      "odstraneni": "5 pracovních dnů",
      "odstraneni_h": 120
     },
     "P4": {
      "reakce": "1 pracovní den",
      "reakce_h": 24,
      "prijezd": "při nejbližší plánované návštěvě",
      "prijezd_h": null,
      "docasne": "—",
      "docasne_h": null,
      "odstraneni": "30 dnů",
      "odstraneni_h": 720
     }
    }
   }
  },
  "pravidla": [
   "Reakce = potvrzení přijetí hlášení / alarmu, přidělení priority a zahájení vzdálené diagnostiky.",
   "Příjezd = příjezd kvalifikovaného technika na lokalitu, pokud porucha nebyla vyřešena dálkově.",
   "Dočasné opatření = obnovení bezpečného provozu, případně v omezeném režimu.",
   "Odstranění = obnovení plné funkce, příp. dočasné obnovení provozu do doby dodání dílu, který není součástí skladu strategických ND a nelze jej opatřit v uvedené lhůtě; tato výjimka se nevztahuje na P1 u projektů s aktivním příznakem bankovni_financovani.",
   "Lhůty běží od okamžiku alarmu v monitoringu nebo nahlášení objednatelem, podle toho, co nastane dříve.",
   "Lhůty neběží po dobu: vyšší moci; nebezpečných povětrnostních podmínek znemožňujících bezpečnou práci; nepřístupnosti lokality z důvodů na straně objednatele, PDS nebo třetích osob; čekání na zásah OEM v rámci záruky / LTSA, pokud RES prokazatelně zásah objednal bez zbytečného odkladu."
  ]
 },
 "validace": [
  {
   "kod": "BANKA_P1_72H",
   "pravidlo": "Je-li aktivní příznak bankovni_financovani, musí platit SLA P1.odstraneni_h ≤ 72.",
   "zavaznost": "chyba"
  },
  {
   "kod": "BANKA_DOBA_10",
   "pravidlo": "Je-li aktivní příznak bankovni_financovani, musí parametry.doba_let ≥ 10.",
   "zavaznost": "chyba"
  },
  {
   "kod": "BESS_AUTORIZACE",
   "pravidlo": "Obsahuje-li smlouva asset BESS, musí autorizace_oem obsahovat platný záznam pro výrobce BESS.",
   "zavaznost": "chyba"
  },
  {
   "kod": "BANKA_UJEDNANI",
   "pravidlo": "Je-li aktivní příznak bankovni_financovani, doporučuje se volby.bankovni_ujednani = true.",
   "zavaznost": "varování"
  },
  {
   "kod": "BESS_ND",
   "pravidlo": "U BESS s bankovním financováním má být vyplněn seznam strategických náhradních dílů.",
   "zavaznost": "varování"
  },
  {
   "kod": "PENALE_SKUPINA",
   "pravidlo": "Je-li volby.skupina_revoltum = true, má být volby.penale = false.",
   "zavaznost": "varování"
  }
 ],
 "dostupnost": {
  "garance_vychozi": {
   "FVE": 98,
   "BESS": 97,
   "MVE": 95,
   "VTE": 95,
   "ENC": 95
  },
  "monitoring_dostupnost": 99,
  "metodika": "Časová dostupnost vážená výkonem; FVE počítá jen hodiny s ozářením ≥ 50 W/m² v rovině modulů, BESS všechny hodiny období."
 }
};
