# Barvy a značka RES

Zdroj: firemní motiv Office ze šablony `brand/sablony/Revoltum ES_šablona prezentace_v02.pptx`
(motiv „Vlastní 1") a loga v `brand/loga/`.

> Pokud RES dodá tištěný grafický manuál a bude se od tohoto souboru lišit,
> **má přednost manuál** — pak tento soubor uprav.

## Základní paleta

| Role | HEX | Použití v aplikaci |
|---|---|---|
| Text / hlavní tmavá | `#030422` | veškerý text, logo „REVOLTUM" |
| Navy tmavá | `#0E2841` | hlavička aplikace, patičky PDF |
| Navy | `#153D64` | druhotné plochy, ohraničení |
| Modrá (primární akce) | `#0268A6` | tlačítka, odkazy, aktivní záložka |
| Modrá střední | `#215E99` | hover stavy, grafy |
| Modrá světlá | `#45B0E1` | zvýraznění, grafy |
| Azurová | `#0F9ED5` | grafy |
| Světle modrá | `#C1E4F5` | podbarvení řádků, informační pruhy |
| Šedomodrá | `#C7D4DD` | oddělovače, neaktivní prvky |
| **Zelená RES** | `#00C667` | akcent značky, blesk v logu, potvrzovací akce |
| Zelená tmavší | `#00A857` | grafy, semafor zelená |
| Šedá | `#9AA3AD` | grafy, popisky |

## Semafor rozpočtu

Vždy **barva + text nebo ikona** (kvůli přístupnosti a barvosleposti).

| Stav | Barva | Ikona | Význam |
|---|---|---|---|
| Zelená | `#00A857` | ✓ | odchylka prognózy proti baseline ≤ 0 % |
| Žlutá | `#E8A200` | ! | odchylka 0 až +5 % |
| Červená | `#C4314B` | ✕ | odchylka > +5 % **nebo** marže pod minimem |
| Šedá | `#9AA3AD` | – | bez schválené baseline („bez rozpočtu") |

Prahy jsou konfigurovatelné v *Nastavení*, tyto hodnoty jsou výchozí.

## Písmo

- Primární: **Aptos** (standardní písmo Microsoft 365, na firemních počítačích je).
- Záloha: `'Segoe UI', system-ui, -apple-system, sans-serif`.
- **Do PDF Aptos nevkládat** — licence to nedovoluje. Použít volný font
  s plnou podporou české diakritiky (Noto Sans / Roboto, oba Apache-2.0).

## Loga

Složka `brand/loga/`. Čtyři varianty:

| Soubor | Kdy použít |
|---|---|
| `RES_color white backround.*` | na světlém podkladu — **hlavní varianta v aplikaci** |
| `RES color_dark Backround.*` | na tmavém podkladu (tmavá hlavička) |
| `RES white.*` | jednobarevné bílé — na fotky a barevné plochy |
| `RES black.*` | jednobarevné černé — tisk, faxy, razítka |

Každá varianta je v `.svg` (vektor, do webu) i `.png` (rastr, do PDF a Office).
`RES banner.png` je široký banner s bleskem — hodí se na úvodní obrazovku.

## Texty značky

- Název aplikace v hlavičce: **PRM Revoltum**
- Claim (jen patička aplikace a PDF): *Revoltujte s námi za moderní decentralizovanou energetiku*
- Adresa do patičky PDF: Revoltum Engineering & Services, Havířská 1021, 580 01 Havlíčkův Brod
  (IČO/DIČ se doplňuje z *Nastavení*)
