# Kurzy ČNB v aplikaci

Součty v Kč a pásma schvalování objednávek v EUR a USD se počítají kurzem **ČNB (střed)**.

## Proč je aplikace nestahuje sama

Veřejné rozhraní ČNB (`https://api.cnb.cz/cnbapi/exrates/daily`) **neposílá prohlížeči povolení** (hlavičku CORS),
takže jeho data webová stránka na SharePointu přečíst nemůže. Ověřeno 30. 9. 2026. Proto kurzy leží ve SharePointovém
seznamu **PRM – Kurzy** (`PRM_ExchangeRates`) a aplikace počítá z něj.

## Jak se kurzy do seznamu dostanou

### 1. Ručně (funguje hned)

*Nastavení → Kurzy*: zvolíte den, napíšete kurz EUR a USD (kolik Kč stojí 1 jednotka) a kliknete na **Zapsat**.
Kurzy jsou na cnb.cz → Finanční trhy → Devizový trh → Kurzy devizového trhu. Stačí při změně, třeba jednou týdně.
Když je nejnovější kurz starší než týden, aplikace na to upozorní.

Dokud v seznamu žádný kurz není, počítá se **nouzovými kurzy** ze záložky *Nastavení → Schvalování*.

### 2. Automaticky přes Power Automate (volitelné)

> **Pozor:** akce „HTTP" v Power Automate je **prémiová** (vyžaduje licenci Power Automate, nestačí běžné M365).
> Pokud ji nemáte, zůstaňte u ručního zápisu — je to půl minuty týdně.

Plánovaný tok (*Automatizovaný cloudový tok → Opakování*):

1. **Opakování**: každý den v 15:00, časové pásmo Central Europe (ČNB vyhlašuje kurzy kolem 14:30).
2. **HTTP** (metoda GET): `https://api.cnb.cz/cnbapi/exrates/daily?lang=EN`
3. **Parsovat JSON**: obsah z kroku 2, schéma z ukázkové odpovědi (pole `rates` s položkami
   `validFor`, `amount`, `currencyCode`, `rate`).
4. **Filtrovat pole**: z `rates` jen `currencyCode` rovno `EUR` nebo `USD`.
5. **Pro každou** položku: **Vytvořit položku** v seznamu *PRM – Kurzy* na webu PRM:
   - Název = `currencyCode`
   - Platí pro den = `validFor`
   - Kurz = `rate` děleno `amount` (u EUR a USD je `amount` 1)
   - Zdroj = `ČNB`

Zápis stejného dne víckrát nevadí: aplikace bere nejnovější záznam.
