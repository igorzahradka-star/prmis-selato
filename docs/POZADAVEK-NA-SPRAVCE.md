# Požadavek na správce Microsoftu 365

> **K čemu to je:** Igor má správcovská práva jen k webu *Revoltum Engineering & Services*,
> ne k celému SharePointu. Jedna jediná věc, kterou sám udělat nemůže, je dostat
> aplikaci do **katalogu aplikací** — a bez toho ji nejde na stránku vůbec přidat.
>
> Text níže je připravený k přeposlání. Stačí doplnit oslovení.

---

## Text k odeslání

**Předmět:** SharePoint — prosba o zpřístupnění katalogu aplikací pro web Revoltum Engineering & Services

Dobrý den,

vyvíjíme si vlastní aplikaci pro řízení projektů (PRM Revoltum), která poběží
na našem SharePointu jako webová část na stránce. Je to standardní řešení
SharePoint Framework (SPFx) — běží v prohlížeči pod přihlášeným uživatelem,
nepotřebuje žádný server ani Azure a nemá **žádné** zvláštní API oprávnění.

Abych ji mohl nasadit, potřebuji jednu z těchto dvou věcí. **Preferuji možnost A**,
protože pak už vás nebudu muset obtěžovat při každé aktualizaci.

### A) Zapnout katalog aplikací pro jeden web (preferované)

Zapnout katalog aplikací pro web
`https://revoltum.sharepoint.com/sites/RevoltumEngineeringServices`.

V SharePoint Online Management Shell:

```powershell
Connect-SPOService -Url https://revoltum-admin.sharepoint.com
Add-SPOSiteCollectionAppCatalog -Site https://revoltum.sharepoint.com/sites/RevoltumEngineeringServices
```

Nebo přes PnP PowerShell:

```powershell
Connect-PnPOnline -Url https://revoltum-admin.sharepoint.com -Interactive
Add-PnPSiteCollectionAppCatalog -Site https://revoltum.sharepoint.com/sites/RevoltumEngineeringServices
```

Je to **jednorázový příkaz**. Aplikace bude platit jen pro tenhle jeden web,
nikam jinam se nerozšíří, a další verze už si tam nahraju sám.

### B) Nahrát balíček do firemního katalogu aplikací

Když možnost A nepřipadá v úvahu, pošlu vám soubor `prm-revoltum.sppkg`
a poprosím o nahrání do katalogu aplikací tenanta:

- SharePoint admin centrum → *Další funkce* → *Aplikace* → *Katalog aplikací*
- → *Aplikace pro SharePoint* → **Nahrát**
- při dotazu zaškrtnout **„Zpřístupnit toto řešení všem webům v organizaci"**

Nevýhoda: každou další verzi bych vám musel posílat znovu.

### Co aplikace dělá a nedělá

- Běží **jen v prohlížeči** pod právy přihlášeného uživatele — nevidí nic,
  na co ten člověk nemá právo i bez ní.
- Data ukládá do **seznamů SharePointu** na našem webu. Žádná data neopouštějí
  Microsoft 365.
- **Nežádá žádná API oprávnění** (v balíčku není `webApiPermissionRequests`),
  takže není co schvalovat na stránce *Přístup k rozhraní API*.
- Jediné externí volání je do **veřejného rejstříku ARES** (`ares.gov.cz`) pro
  dotažení adresy firmy podle IČO. Nikam se neposílají naše data, jen IČO.
- Není to aplikace z obchodu, je naše vlastní a její zdrojový kód máme.

Děkuji,
Igor Zahrádka

---

## Až to správce udělá

### Když zvolil A (katalog pro jeden web)

1. Otevři `https://revoltum.sharepoint.com/sites/RevoltumEngineeringServices/AppCatalog`
   — nebo ozubené kolo → *Obsah webu* → *Aplikace pro SharePoint*.
2. Nahraj `prm-revoltum.sppkg`, potvrď **Nasadit**.
3. Pokračuj podle [`NASAZENI.md`](NASAZENI.md), krok 6.

> Při katalogu pro jeden web se aplikace **nerozšíří automaticky**. Po nahrání
> ji ještě musíš na web přidat: ozubené kolo → *Přidat aplikaci* → *Z vaší organizace*
> → **PRM Revoltum**.

### Když zvolil B (firemní katalog)

Pošli mu soubor `spfx\sharepoint\solution\prm-revoltum.sppkg`.
Po nasazení pokračuj podle [`NASAZENI.md`](NASAZENI.md), krok 8 — aplikace
už bude dostupná na všech webech.

---

## Jak zjistit, kdo je správce

Když nevíš, na koho se obrátit:

- Zkus **`https://admin.microsoft.com`**. Když tě to pustí dovnitř, správce jsi ty.
- V Outlooku hledej zprávy od *Microsoft 365 Message Center* — chodí správcům.
- Ve firmě/holdingu se zeptej toho, kdo zakládal e-mailové účty a Teams.
- Kdo vám zakládal web *Revoltum Engineering & Services*, ten práva má.
