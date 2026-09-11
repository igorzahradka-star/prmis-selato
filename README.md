# PRM Revoltum

Informační systém pro řízení zakázek **Revoltum Engineering & Services**.
Běží jako aplikace na firemním SharePointu (Microsoft 365), bez vlastního serveru
a bez předplatného Azure.

- Kompletní zadání: [`docs/ZADANI.md`](docs/ZADANI.md)
- Pravidla projektu pro Claude Code: [`CLAUDE.md`](CLAUDE.md)
- Návod pro uživatele: [`docs/NAVOD_UZIVATEL.md`](docs/NAVOD_UZIVATEL.md)
- Historie změn: [`CHANGELOG.md`](CHANGELOG.md)

---

## Část A — Co potřebuješ na počítači (jen jednou)

Tohle už je hotové, je to tu pro případ přeinstalace počítače nebo pro kolegu.

### 1. Node.js verze 22

SPFx 1.23 běží **jen na Node.js 22**. Novější verze (24, 26) nefungují.

```bash
winget install OpenJS.NodeJS.22 --accept-source-agreements --accept-package-agreements
```

Po instalaci **zavři a znovu otevři** okno terminálu a ověř:

```bash
node --version
```

Musí vypsat `v22.něco`.

### 2. Nástroje pro SPFx

```bash
npm install @rushstack/heft yo @microsoft/generator-sharepoint --global
```

### 3. Git a editor

Git už nainstalovaný je. Editor kódu (Visual Studio Code) není nutný —
všechno potřebné dělá Claude Code — ale hodí se:

```bash
winget install Microsoft.VisualStudioCode
```

### 4. Závislosti projektu

V terminálu ve složce `C:\Projekty\prm-revoltum\spfx`:

```bash
npm install
```

Trvá to několik minut a stáhne se asi 1 300 balíčků. Proto projekt **nesmí ležet
v OneDrivu** — synchronizovalo by se to všem kolegům.

---

## Část B — Co musí udělat správce Microsoftu 365

Tohle nejde udělat z aplikace, je potřeba účet s právy správce M365.
Pokud správcem nejsi ty, pošli tuto část jemu.

### 1. Založit dva weby SharePointu

| Web | Adresa (návrh) | Šablona | Oprávnění |
|---|---|---|---|
| **PRM** | `/sites/RES-PRM` | Týmový web | Čtení pro všechny interní, zápis pro PM, asistenty a administrátory |
| **PRM-Finance** | `/sites/RES-PRM-Finance` | Týmový web | **Vlastní, nezděděná oprávnění** — jen skupina „PRM Finance – důvěrné" |

> Web **PRM-Finance** je klíčový pro bezpečnost. Musí mít **přerušenou dědičnost
> oprávnění** a přístup do něj má mít jen úzký okruh lidí. Důvěrná finanční data
> chrání SharePoint, ne aplikace.

### 2. Založit skupiny pro role

Na webu **PRM**: *Nastavení* (ozubené kolo) → *Oprávnění webu* → *Rozšířená nastavení oprávnění*
→ *Vytvořit skupinu*. Založ tyto skupiny:

| Skupina | Úroveň oprávnění |
|---|---|
| PRM Administrátoři | Úplné řízení |
| PRM Vedení | Přispívání |
| PRM Projektoví manažeři | Přispívání |
| PRM Asistenti | Přispívání |
| PRM Čtenáři | Čtení |

Na webu **PRM-Finance** navíc skupinu **PRM Finance – důvěrné** (Přispívání).

Názvy skupin jdou později změnit v aplikaci v *Nastavení → Role* — musí ale
odpovídat skutečným názvům v SharePointu.

### 3. Zapnout katalog aplikací (App Catalog)

Pokud firma katalog ještě nemá:
*Centrum pro správu SharePointu* → *Další funkce* → *Aplikace* → *Otevřít*
→ *Katalog aplikací* → založit.

---

## Část C — Nasazení aplikace

### 1. Sestavit balíček

V terminálu ve složce `C:\Projekty\prm-revoltum\spfx`:

```bash
npm run package
```

Vznikne soubor **`spfx\sharepoint\solution\prm-revoltum.sppkg`**.

### 2. Nahrát balíček do katalogu aplikací

1. Otevři *Centrum pro správu SharePointu* → *Další funkce* → *Aplikace* → *Katalog aplikací*.
2. Přetáhni soubor `prm-revoltum.sppkg` do knihovny **Aplikace pro SharePoint**.
3. Objeví se okno „Chcete tuto aplikaci zpřístupnit všem webům?“ →
   zaškrtni **Zpřístupnit tuto aplikaci všem webům** a klikni **Nasadit**.

### 3. Přidat aplikaci na web PRM

1. Otevři web **PRM**.
2. *Nastavení* (ozubené kolo) → *Přidat aplikaci*.
3. Najdi **PRM Revoltum** a klikni na ni.

### 4. Vytvořit stránku aplikace

1. Na webu PRM: *Nastavení* → *Obsah webu* → *Stránky webu*.
2. *Nový* → **Stránka** → v galerii šablon zvol **Aplikace s jednou částí**
   (*Single part app page*).
3. Vyber web part **PRM Revoltum**.
4. Pojmenuj stránku „PRM“ a klikni **Publikovat**.
5. Stránku přidej do levé navigace webu, ať ji lidé najdou.

### 5. Nastavit web part

Na stránce klikni *Upravit* → ozubené kolo u web partu:

| Volba | Hodnota |
|---|---|
| **Odkud brát data** | Ostrá data ze SharePointu |
| **Adresa webu PRM-Finance** | `https://<firma>.sharepoint.com/sites/RES-PRM-Finance` |

Nech adresu prázdnou, dokud web PRM-Finance neexistuje — finanční moduly se
pak nikomu nezobrazí.

### 6. Spustit instalaci datové struktury

1. V aplikaci otevři **Instalace a diagnostika** (v levé navigaci, jen administrátor).
2. Průvodce vypíše, co chybí.
3. Klikni **Doplnit chybějící části** a počkej 1–3 minuty.
4. Na konci musí být všechno zelené. Co zůstane modré, vyžaduje správce M365.

> Průvodce je bezpečný: **nikdy nic nemaže ani nepřepisuje**, jen přidává.
> Dá se spustit opakovaně.

### 7. Vyplnit Nastavení

V aplikaci **Nastavení** vyplň hlavně:
- knihovnu a kořenovou složku, kam se zakládají složky zakázek,
- šablonu složek projektu,
- názvy skupin rolí (musí odpovídat SharePointu),
- fakturační údaje RES.

### 8. Volitelně: záložka v Microsoft Teams

Web part podporuje i Teams. V kanálu týmu: **+** → *SharePoint* → vyber stránku PRM.

---

## Část D — Aktualizace na novou verzi

1. Ve `spfx/package.json` zvyš `version` (např. `0.1.0` → `0.2.0`).
2. Ve `spfx/config/package-solution.json` zvyš `solution.version` **a** `features[0].version`
   na čtyřmístný tvar (`0.2.0.0`). Bez toho SharePoint aktualizaci nepřijme.
3. `npm run package`
4. Nový `.sppkg` nahraj do katalogu aplikací (přepíše starý) → **Nasadit**.
5. Na webu PRM: *Obsah webu* → u aplikace PRM Revoltum se objeví **Aktualizovat** → klikni.
6. V aplikaci otevři **Instalace a diagnostika** a doplň případné nové sloupce.

---

## Část E — Vývoj

```bash
cd C:\Projekty\prm-revoltum\spfx

npm run test      # spustí build, kontrolu kódu a unit testy
npm run start     # vývojový server s automatickým překladem
npm run package   # produkční .sppkg
npm run clean     # smaže výstupy buildu
```

### Ladění proti živému SharePointu

1. Jednou důvěřuj vývojovému certifikátu:
   ```bash
   npm run trust-dev-cert
   ```
2. Nastav proměnnou prostředí s adresou tenanta (aby `npm run start` věděl, kam se připojit):
   ```bash
   setx SPFX_SERVE_TENANT_DOMAIN firma.sharepoint.com
   ```
   Pak zavři a otevři terminál znovu.
3. `npm run start` a v prohlížeči otevři adresu, kterou vypíše.

> Microsoft **ruší hostovaný workbench k 1. 12. 2026**. Pro vývoj vzhledu proto
> používej **ukázkový režim** — ve vlastnostech web partu přepni „Odkud brát data“
> na *Ukázková data*. Aplikace pak běží kompletně na smyšlených datech.

### Struktura kódu

```
spfx/src/
  core/       čistá logika (formáty, role, nastavení) + unit testy
  data/       schéma seznamů, rozhraní repozitářů
  data/sharepoint/  ostrá implementace přes PnPjs
  data/mock/  ukázková data
  features/   obrazovky: projects, admin, settings, help
  ui/         theme RES, layout, router, sdílené komponenty
  webparts/prm/  vstupní web part
```

Pravidlo: **UI nikdy nevolá SharePoint přímo**, vždy přes rozhraní repozitáře
(`src/data/repositories.ts`). Díky tomu se dá později přejít na jinou databázi
bez přepsání aplikace.

---

## Použité knihovny a licence

| Knihovna | Licence |
|---|---|
| SharePoint Framework, Fluent UI React | MIT |
| React, React DOM | MIT |
| PnPjs | MIT |

Nic pod GPL ani komerční licencí.
