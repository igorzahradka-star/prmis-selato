# Nasazení PRM Revoltum — krok za krokem

> Pro Igora. Otevři si tenhle soubor vedle prohlížeče a odškrtávej.
>
> **Stav k 29. 9. 2026:** Igor má roli **Správce SharePointu** — dostane se do
> Centra pro správu. Nasazení tedy zvládne celé sám, bez PowerShellu
> a bez cizí pomoci.
>
> Aplikace poběží na existujícím webu **Revoltum Engineering & Services**.
> Nové weby se zakládat nebudou.
>
> Balíček verze **0.2.0.0**:
> `C:\Projekty\prm-revoltum\spfx\sharepoint\solution\prm-revoltum.sppkg`

---

## A. Katalog aplikací (kroky 1–3)

Aplikace se na stránku nedá přidat, dokud není v **katalogu aplikací**.
Zakládá se jednou a pak už tam jen nahráváš nové verze.

### 1. Otevři katalog aplikací

- [ ] Jdi na `https://revoltum-admin.sharepoint.com`
- [ ] Vlevo úplně dole klikni **Další funkce**
- [ ] V dlaždici **Aplikace** klikni **Otevřít**
- [ ] Klikni **Katalog aplikací**

> **Když katalog ještě neexistuje**, SharePoint nabídne jeho vytvoření.
> Vyber *Vytvořit nový katalog aplikací* a nech adresu, kterou navrhne.
> Trvá to **5–15 minut** — dej si kafe a pak stránku načti znovu.

### 2. Nahraj balíček

- [ ] Vlevo klikni **Aplikace pro SharePoint**
- [ ] Klikni **Nahrát** (nebo přetáhni soubor do okna)
- [ ] Vyber `C:\Projekty\prm-revoltum\spfx\sharepoint\solution\prm-revoltum.sppkg`
- [ ] Objeví se okno „Chcete tomuto řešení důvěřovat?"
- [ ] **Zaškrtni ✅ „Zpřístupnit toto řešení všem webům v organizaci"**
- [ ] Klikni **Nasadit**

### 3. Zkontroluj

- [ ] V seznamu je řádek **PRM Revoltum**, verze **0.2.0.0**
- [ ] Ve sloupci *Nasazeno* je **Ano**

> Díky zaškrtnutí v kroku 2 je aplikace rovnou dostupná na všech webech.
> Nemusíš ji nikam zvlášť přidávat.

---

## B. Stránka s aplikací (kroky 4–6)

### 4. Založ stránku

- [ ] Otevři `https://revoltum.sharepoint.com/sites/RevoltumEngineeringServices`
- [ ] **Ozubené kolo** → **Obsah webu** → **Stránky webu**
- [ ] Klikni **+ Nový** → **Stránka**
- [ ] V galerii šablon vyber **Aplikace s jednou částí**
- [ ] Pojmenuj stránku **`PRM`**

> **Když šablonu „Aplikace s jednou částí" nevidíš:** vyber **Prázdná**.
> Pak klikni na ikonu sekce vlevo a zvol rozložení **Na celou šířku**.

- [ ] V prostoru pro webovou část klikni na **+**
- [ ] Do hledání napiš `PRM` a vyber **PRM Revoltum**
- [ ] Vpravo nahoře **Publikovat**

### 5. Nastav webovou část

- [ ] Na publikované stránce klikni vpravo nahoře **Upravit**
- [ ] Najeď myší na webovou část a klikni na **tužku**
- [ ] Vpravo v panelu:
  - **Odkud brát data:** **Ostrá data ze SharePointu**
  - **Adresa webu PRM-Finance:** **nech prázdné**
- [ ] Zavři panel → **Publikovat znovu**

> Prázdná adresa PRM-Finance je záměr. Důvěrné finanční moduly se pak nikomu
> nezobrazí. Řeší se až ve Fázi 5, kdy na ně založíme samostatný web.

### 6. Přidej stránku do menu

- [ ] Vlevo v navigaci webu klikni **Upravit**
- [ ] **+** → **Odkaz** → vyber stránku **PRM** → **OK** → **Uložit**

---

## C. Rozjezd aplikace (kroky 7–10)

> Od téhle chvíle klikáš už jen v aplikaci. **Pořadí je důležité** —
> každý krok staví na předchozím.

### 7. Instalace datové struktury

- [ ] V aplikaci klikni vlevo **Instalace a diagnostika**
- [ ] Průvodce vypíše, co chybí — bude toho hodně, to je správně
- [ ] Klikni **Doplnit chybějící části**
- [ ] Počkej **1–3 minuty**, nezavírej stránku
- [ ] Na konci má být všechno **zelené**

> **Vznikne 17 seznamů** v *Obsahu webu*. Vypadá to jako nepořádek, ale
> pracuje se s nimi jen přes aplikaci — otevírat je ručně není potřeba.
>
> Co zůstane **modré**, vyžaduje ruční zásah a průvodce u toho napíše co.
> Co zůstane **červené**, mi pošli jako printscreen a **nepokračuj**.

### 8. Skupiny rolí a lidi

- [ ] Vlevo **Uživatelé a role**
- [ ] Vpravo nahoře **Založit chybějící skupiny**
- [ ] Aplikace vypíše, co udělala. Očekávej tohle:

| Skupina | Oprávnění na webu |
|---|---|
| PRM Administrátoři | Úplné řízení |
| PRM Projektoví manažeři | Úpravy |
| PRM Asistenti | Úpravy |
| PRM Vedení | Úpravy |
| PRM Finance – důvěrné | Čtení |
| PRM Čtenáři | Čtení |

> **Oprávnění se přidělují samy.** Skupina bez oprávnění na webu vůbec
> nefunguje — člen role by aplikaci neotevřel. Aplikace proto skupině bez
> oprávnění přidělí výchozí úroveň z tabulky. **Skupině, která už nějaké
> oprávnění má, nesahá** — mohl ho nastavit správce ručně.
>
> Kdyby ti něco z tabulky nevyhovovalo, upravíš to kdykoli v Nastavení webu
> → *Oprávnění webu* → *Rozšířená nastavení oprávnění*.

- [ ] Teď přidej lidi: u každé role klikni **Přidat**, zadej jméno nebo e-mail
      (aspoň tři písmena) a vyber ze seznamu
- [ ] **Administrátor PRM:** přidej sebe a aspoň jednoho dalšího člověka

> **Když hledání lidí nic nenajde**, můžeš roli přidělit přímo v SharePointu.
> Skupiny neuvidíš na stránce *Oprávnění webu*, ale tady:
> `https://revoltum.sharepoint.com/sites/RevoltumEngineeringServices/_layouts/15/groups.aspx`
> → klikni na skupinu → **Nové** → **Přidat uživatele**.

---

### 9. Import stávajících projektů ⚠️

> **Udělej to dřív, než kdokoli založí první projekt.** Dokud import neproběhne,
> aplikace neví, kde skončila dosavadní řada, a nový projekt by dostal číslo
> **26001** — které už má složka.

- [ ] Vlevo **Nastavení** → záložka **Jednorázové akce**
- [ ] Klikni **Otevřít import**
- [ ] Zkontroluj tabulku: pět projektů „naimportuje se",
      `00_Project tools` jako „není projekt"
- [ ] Vyber projektového manažera
- [ ] Klikni **Naimportovat 5 projektů**

> Kdyby tabulka ukázala něco jiného, **na Naimportovat neklikej** a pošli mi
> printscreen.

### 10. Založ projekt Režie

- [ ] Pořád v **Nastavení** → **Jednorázové akce**
- [ ] U karty *Projekt Režie 2026* klikni **Založit Režii** (dostane číslo `26999`)

---

## D. Kontrola (krok 11)

- [ ] **Projekty** — je tam pět projektů 26001–26005 a Režie 26999
- [ ] Klikni na **26001** — otevře se detail
- [ ] Záložka **Dokumenty** — ukazuje soubory ze složky projektu
- [ ] Tlačítko **Otevřít složku projektu** — hodí tě do knihovny
- [ ] **Nový projekt** — náhled čísla ukazuje **26006**
      (projekt **neukládej**, jen zkontroluj číslo a zavři)

Když všech pět sedí, je nasazeno. **Dej mi vědět a pošli printscreen seznamu projektů.**

---

## Co dělat, když něco nesedí

| Co se stane | Co s tím |
|---|---|
| V *Dalších funkcích* není dlaždice *Aplikace* | Zkus přímo `https://revoltum-admin.sharepoint.com/_layouts/15/online/AppCatalogSiteSettings.aspx` |
| Web part *PRM Revoltum* se v hledání nenabízí | Nahrání neproběhlo, nebo nebylo zaškrtnuto „všem webům". Zkontroluj v katalogu sloupec *Nasazeno*. |
| Aplikace hlásí „Nemáte oprávnění" | Jsi ve skupině *Vlastníci* webu RES? Ozubené kolo → Oprávnění webu. |
| Instalace končí červeně | Pošli mi printscreen té červené části. **Nepokračuj.** |
| Záložka Dokumenty je prázdná | Nastavení → *Složky projektů*: sedí knihovna `Dokumenty` a kořenová složka `General/01_PROJEKTY`? |
| Import ukazuje 0 projektů | Totéž — kořenová složka musí být `General/01_PROJEKTY`. |
| Nový projekt nabízí 26001 | Import neproběhl. Zpátky na krok 9. |

---

## Co se doplní až po nasazení

- **Obchodní příležitosti** — Igor zmínil, že jsou v Dokumentech taky. Ještě jsme
  se nedohodli, jestli je importovat jako projekty ve stavu *Nabídka*.
- **Údaje firmy** (IČO, DIČ, e-mail účtárny) — do hlaviček PDF ve Fázi 2
- **Jména schvalovatelů** objednávek — limity už zadané jsou (100 tis. / 500 tis. / 1 mil.)
- **Šablona složek projektu** — teď je tam návrh, porovnáme ho se skutečnými složkami
- **Web PRM-Finance** — až Fáze 5, na důvěrná firemní čísla. Igor si ho jako
  správce SharePointu založí sám.

---

## Jak se nasazují další verze

Aplikace se bude ještě hodně měnit — Fáze 2 až 5. Nahrávat balíček **do katalogu
musí vždycky Igor**; Claude k vašemu SharePointu přístup nemá a mít nebude.
Většina vývoje se ale bez nahrávání obejde.

### Při vývoji — bez nahrávání

Webová část se dá načíst **z Claudova počítače na tvou skutečnou stránku**,
včetně ostrých dat. Nic se přitom nikam nenasazuje a ostatní lidé pořád vidí
starou verzi.

1. Claude spustí `npm run start` (vývojový server na `https://localhost:4321`)
2. Ty otevřeš svou stránku PRM s přívěskem v adrese:

```
https://revoltum.sharepoint.com/sites/RevoltumEngineeringServices/SitePages/PRM.aspx?loadSPFX=true&debugManifestsFile=https://localhost:4321/temp/build/manifests.js
```

3. Prohlížeč se zeptá, jestli načíst ladicí skripty — potvrdíš
4. Vidíš rozpracovanou verzi na ostrých datech. Po zavření karty je po všem.

> Přesnou cestu k `manifests.js` ověříme, až to poprvé pustíme — mezi verzemi
> SPFx se občas mění.
>
> Tohle funguje jen na tvém počítači, kde běží vývojový server.

### Při vydání verze — nahrání do katalogu

1. Claude zvýší číslo verze a sestaví balíček
2. Ty otevřeš **Katalog aplikací** → *Aplikace pro SharePoint*
3. Přetáhneš nový `prm-revoltum.sppkg` do okna
4. SharePoint se zeptá, jestli nahradit — potvrdíš **Nahradit**
5. **Nasadit**

Trvá to zhruba půl minuty. Uživatelé dostanou novou verzi při dalším načtení
stránky, nic nemusí dělat.

> **Verzi poznáš** v katalogu ve sloupci *Verze*. Claude ji zvyšuje při každém
> vydání, takže je vždycky vidět, co je nasazené: 0.2.0.0 = Fáze 1.

### Dá se to zautomatizovat?

Jde to (PnP PowerShell, `Add-PnPApp -Overwrite -Publish`), ale novější verze
PnP vyžadují **vlastní registraci aplikace v Entra ID** — což je jiné oprávnění
než správce SharePointu a nemusíš ho mít. Necháváme to na později; kdyby tě
ruční nahrávání začalo obtěžovat, vrátíme se k tomu.
