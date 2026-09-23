# Nasazení PRM Revoltum — krok za krokem

> Pro Igora. Otevři si tenhle soubor vedle prohlížeče a odškrtávej.
>
> **Stav k 23. 9. 2026:** Igor má správcovská práva **jen k webu
> *Revoltum Engineering & Services***, ne k celému SharePointu. Aplikace proto
> poběží na tomhle existujícím webu — nové weby se zakládat nebudou.
>
> Balíček verze **0.2.0.0**, leží v
> `C:\Projekty\prm-revoltum\spfx\sharepoint\solution\prm-revoltum.sppkg`.

---

## Krok 0 — bez správce to nejde dál ⛔

Jediná věc, kterou vlastními právy neuděláš, je dostat aplikaci do **katalogu
aplikací**. Bez toho ji nejde na stránku přidat.

- [ ] Otevři [`POZADAVEK-NA-SPRAVCE.md`](POZADAVEK-NA-SPRAVCE.md)
- [ ] Zjisti, kdo je správce Microsoftu 365 (návod je na konci toho souboru)
- [ ] Pošli mu připravený text
- [ ] Počkej, než to udělá

**Zbytek návodu má smysl až potom.** Kroky 1–3 si ale můžeš připravit hned,
ty práva nepotřebují.

---

## A. Co můžeš udělat hned (kroky 1–3)

### 1. Zkontroluj, že jsi vlastník webu

- [ ] Otevři `https://revoltum.sharepoint.com/sites/RevoltumEngineeringServices`
- [ ] Vpravo nahoře **ozubené kolo** → **Oprávnění webu**
- [ ] Ve skupině **Vlastníci** musíš být ty

Když tam nejsi, dál to nepůjde — doplň to do požadavku na správce.

### 2. Ověř cestu ke složkám projektů

- [ ] Otevři knihovnu **Dokumenty** → složka **General** → **01_PROJEKTY**
- [ ] Musí tam být složky `26001-…` až `26005-…` a `00_Project tools`
- [ ] Zkopíruj si adresu z prohlížeče, kdyby se nesešla s tím, co mám v nastavení

### 3. Rozmysli si, kdo bude v jaké roli

Budeš je zadávat v kroku 11. Připrav si jména:

- [ ] **Administrátor PRM** — ty + aspoň jeden další (kdyby tě nebylo)
- [ ] **Projektový manažer** — kdo zakládá a vede projekty
- [ ] **Asistent PM** — kdo pracuje na projektech, ale neschvaluje
- [ ] **Vedení** — kdo schvaluje objednávky nad limit PM
- [ ] **Čtenář** — kdo se má jen dívat

---

## B. Nahrání aplikace (kroky 4–6)

> Až správce udělá krok 0.

### 4. Otevři katalog aplikací webu

- [ ] Na webu RES: **ozubené kolo** → **Obsah webu**
- [ ] Najdi položku **Aplikace pro SharePoint** a otevři ji

> Přímá adresa:
> `https://revoltum.sharepoint.com/sites/RevoltumEngineeringServices/AppCatalog`
>
> Když tam nic takového není, správce krok 0 ještě neudělal — nebo zvolil
> variantu B (firemní katalog). Pak tenhle krok i krok 5 přeskoč a jdi na krok 7.

### 5. Nahraj balíček

- [ ] Klikni **Nahrát** (nebo přetáhni soubor do okna)
- [ ] Vyber `C:\Projekty\prm-revoltum\spfx\sharepoint\solution\prm-revoltum.sppkg`
- [ ] Objeví se okno „Chcete tomuto řešení důvěřovat?"
- [ ] Klikni **Nasadit**

### 6. Přidej aplikaci na web

- [ ] **Ozubené kolo** → **Přidat aplikaci**
- [ ] Vlevo vyber **Z vaší organizace**
- [ ] Najdi **PRM Revoltum** a klikni **Přidat**
- [ ] Počkej, než zmizí nápis „Přidávání…"

---

## C. Stránka s aplikací (kroky 7–9)

### 7. Založ stránku

- [ ] Na webu RES: **ozubené kolo** → **Obsah webu** → **Stránky webu**
- [ ] Klikni **+ Nový** → **Stránka**
- [ ] V galerii šablon vyber **Aplikace s jednou částí**
- [ ] Pojmenuj stránku **`PRM`**

> **Když šablonu „Aplikace s jednou částí" nevidíš:** vyber **Prázdná**.
> Pak klikni na ikonu sekce vlevo a zvol rozložení **Na celou šířku**.

- [ ] V prostoru pro webovou část klikni na **+**
- [ ] Do hledání napiš `PRM` a vyber **PRM Revoltum**
- [ ] Vpravo nahoře **Publikovat**

### 8. Nastav webovou část

- [ ] Na publikované stránce klikni vpravo nahoře **Upravit**
- [ ] Najeď myší na webovou část a klikni na **tužku**
- [ ] Vpravo v panelu:
  - **Odkud brát data:** **Ostrá data ze SharePointu**
  - **Adresa webu PRM-Finance:** **nech prázdné**
- [ ] Zavři panel → **Publikovat znovu**

> Prázdná adresa PRM-Finance je záměr. Důvěrné finanční moduly se pak nikomu
> nezobrazí. Řeší se až ve Fázi 5 a bude na to potřeba samostatný web.

### 9. Přidej stránku do menu

- [ ] Vlevo v navigaci webu klikni **Upravit**
- [ ] **+** → **Odkaz** → vyber stránku **PRM** → **OK** → **Uložit**

---

## D. Rozjezd aplikace (kroky 10–13)

> Od téhle chvíle klikáš už jen v aplikaci. **Pořadí je důležité** —
> každý krok staví na předchozím.

### 10. Instalace datové struktury

- [ ] V aplikaci klikni vlevo **Instalace a diagnostika**
- [ ] Průvodce vypíše, co chybí — bude toho hodně, to je správně
- [ ] Klikni **Doplnit chybějící části**
- [ ] Počkej **1–3 minuty**, nezavírej stránku
- [ ] Na konci má být všechno **zelené**

> **Vznikne 21 seznamů** v *Obsahu webu* tohohle webu. Vypadá to jako nepořádek,
> ale pracuje se s nimi jen přes aplikaci — otevírat je ručně není potřeba.
>
> Co zůstane **modré**, vyžaduje ruční zásah a průvodce u toho napíše co.
> Co zůstane **červené**, mi pošli jako printscreen a **nepokračuj**.

### 11. Skupiny rolí a lidi

- [ ] Vlevo **Uživatelé a role**
- [ ] Vpravo nahoře **Založit chybějící skupiny** (vznikne šest skupin)
- [ ] U každé role klikni **Přidat** a zadej jméno nebo e-mail (aspoň tři písmena)
- [ ] **Administrátor PRM:** přidej aspoň ještě jednoho člověka kromě sebe

### 12. Import stávajících projektů ⚠️

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

### 13. Založ projekt Režie

- [ ] Pořád v **Nastavení** → **Jednorázové akce**
- [ ] U karty *Projekt Režie 2026* klikni **Založit Režii** (dostane číslo `26999`)

---

## E. Kontrola (krok 14)

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
| V *Obsahu webu* není *Aplikace pro SharePoint* | Správce krok 0 neudělal, nebo zvolil variantu B. Zkus rovnou krok 7. |
| *Přidat aplikaci* nenabízí PRM Revoltum | Nahrání v kroku 5 neproběhlo. Vrať se do katalogu a zkontroluj, že je u řádku *Nasazeno: Ano*. |
| Aplikace hlásí „Nemáte oprávnění" | Jsi ve skupině *Vlastníci* webu? Ozubené kolo → Oprávnění webu. |
| Instalace končí červeně | Pošli mi printscreen té červené části. **Nepokračuj.** |
| Záložka Dokumenty je prázdná | Nastavení → *Složky projektů*: sedí knihovna `Dokumenty` a kořenová složka `General/01_PROJEKTY`? |
| Import ukazuje 0 projektů | Totéž — kořenová složka musí být `General/01_PROJEKTY`. |
| Nový projekt nabízí 26001 | Import neproběhl. Zpátky na krok 12. |

---

## Co se doplní až po nasazení

- **Údaje firmy** (IČO, DIČ, e-mail účtárny) — do hlaviček PDF ve Fázi 2
- **Jména schvalovatelů** objednávek — limity už zadané jsou (100 tis. / 500 tis. / 1 mil.)
- **Šablona složek projektu** — teď je tam návrh, porovnáme ho s tím, co máte
  ve složkách skutečných projektů
- **Web PRM-Finance** — až Fáze 5. Bude potřeba samostatný web s vlastními
  oprávněními, tedy znovu správce.
