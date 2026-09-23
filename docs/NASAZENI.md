# Nasazení PRM Revoltum — krok za krokem

> Pro Igora. Otevři si tenhle soubor vedle prohlížeče a odškrtávej.
> Celé to zabere zhruba **hodinu**, z toho půlka je čekání na Microsoft.
>
> **Nic z toho není nevratné** kromě kroku 12 (import) — a ten se dá pustit znovu.
>
> Stav k 23. 9. 2026, balíček verze **0.2.0.0**.

---

## Než začneš

- [ ] Přihlaš se do prohlížeče účtem **zahradka@revoltum.cz** (ten má správcovská práva)
- [ ] Najdi si soubor **`C:\Projekty\prm-revoltum\spfx\sharepoint\solution\prm-revoltum.sppkg`**
      — budeš ho nahrávat v kroku 6. Nech si otevřený Průzkumník na téhle složce.

---

## A. Založení webů (kroky 1–4)

### 1. Otevři správu SharePointu

- [ ] Do adresního řádku napiš: **`https://revoltum-admin.sharepoint.com`**
- [ ] Vlevo v menu klikni na **Weby** → **Aktivní weby**

### 2. Založ web PRM

- [ ] Nahoře klikni **+ Vytvořit**
- [ ] Vyber dlaždici **Komunikační web**
- [ ] Šablona: **Standardní** (nebo „Prázdný", je to jedno)
- [ ] **Název webu:** `PRM Revoltum`
- [ ] **Adresa webu:** přepiš na `PRM` — celá adresa musí vyjít
      `https://revoltum.sharepoint.com/sites/PRM`
- [ ] **Popis:** `Řízení projektů RES`
- [ ] **Jazyk:** Čeština
- [ ] Klikni **Další** → **Dokončit**

> Když ti to řekne, že adresa je obsazená, zkus `PRM-Revoltum` a **dej mi vědět** —
> musím ji doplnit do nastavení.

### 3. Založ web PRM-Finance

- [ ] Znovu **+ Vytvořit** → **Komunikační web**
- [ ] **Název webu:** `PRM Finance`
- [ ] **Adresa webu:** `PRM-Finance` → `https://revoltum.sharepoint.com/sites/PRM-Finance`
- [ ] **Popis:** `Důvěrná finanční data PRM`
- [ ] **Jazyk:** Čeština
- [ ] **Další** → **Dokončit**

### 4. Zamkni web PRM-Finance ⚠️

> **Tenhle krok nepřeskakuj.** Na tomhle webu budou firemní příjmy, výdaje
> a zůstatky. Ve výchozím stavu je vidí každý, kdo najde adresu.

- [ ] Otevři `https://revoltum.sharepoint.com/sites/PRM-Finance`
- [ ] Vpravo nahoře **ozubené kolo** → **Oprávnění webu**
- [ ] Dole klikni **Rozšířená nastavení oprávnění**
- [ ] Na pásu karet klikni **Zastavit dědění oprávnění** → potvrď **OK**
- [ ] Ze seznamu skupin odeber všechny kromě **PRM Finance Vlastníci**
      (zaškrtni řádek → **Odebrat oprávnění uživatele**)
- [ ] Zkontroluj, že ty sám jsi ve skupině Vlastníci

---

## B. Nahrání aplikace (kroky 5–7)

### 5. Otevři katalog aplikací

- [ ] Zpátky na **`https://revoltum-admin.sharepoint.com`**
- [ ] Vlevo dole **Další funkce**
- [ ] V dlaždici **Aplikace** klikni **Otevřít**
- [ ] Klikni **Katalog aplikací**

> **Když katalog ještě neexistuje**, SharePoint nabídne jeho vytvoření.
> Vyber *Vytvořit nový katalog aplikací* a nech adresu, kterou navrhne.
> Vytvoření trvá **5–15 minut** — dej si mezitím kafe a pak stránku načti znovu.

### 6. Nahraj balíček

- [ ] V katalogu klikni vlevo **Aplikace pro SharePoint**
- [ ] Klikni **Nahrát** (nebo přetáhni soubor do okna)
- [ ] Vyber `C:\Projekty\prm-revoltum\spfx\sharepoint\solution\prm-revoltum.sppkg`
- [ ] Objeví se okno „Chcete tomuto řešení důvěřovat?"
- [ ] **Zaškrtni ✅ „Zpřístupnit toto řešení všem webům v organizaci"**
- [ ] Klikni **Nasadit**

### 7. Ověř, že je nasazená

- [ ] V seznamu aplikací musí být řádek **PRM Revoltum**, verze **0.2.0.0**
- [ ] Ve sloupci *Nasazeno* musí být **Ano**

---

## C. Stránka s aplikací (kroky 8–9)

### 8. Založ stránku na webu PRM

- [ ] Otevři `https://revoltum.sharepoint.com/sites/PRM`
- [ ] **Ozubené kolo** → **Obsah webu** → **Stránky webu**
- [ ] Klikni **+ Nový** → **Stránka**
- [ ] V galerii šablon vyber **Aplikace s jednou částí**
- [ ] Pojmenuj stránku **`PRM`**

> **Když šablonu „Aplikace s jednou částí" nevidíš:** vyber **Prázdná**,
> a v kroku 9 si nejdřív klikni na *přidat sekci* → **Na celou šířku**.

- [ ] V prostoru pro web part klikni na **+**
- [ ] Ve vyhledávání napiš `PRM` a vyber **PRM Revoltum**
- [ ] Vpravo nahoře **Publikovat**

### 9. Nastav web part

- [ ] Na publikované stránce klikni vpravo nahoře **Upravit**
- [ ] Najeď myší na web part a klikni na **tužku** (upravit web part)
- [ ] Vpravo se otevře panel:
  - **Odkud brát data:** vyber **Ostrá data ze SharePointu**
  - **Adresa webu PRM-Finance:** vlož `https://revoltum.sharepoint.com/sites/PRM-Finance`
- [ ] Zavři panel a klikni **Publikovat znovu**

### 10. Přidej stránku do menu

- [ ] Vlevo v navigaci webu klikni **Upravit**
- [ ] **+** → **Odkaz** → vyber stránku **PRM** → **OK** → **Uložit**

---

## D. Rozjezd aplikace (kroky 11–14)

> **Od téhle chvíle už klikáš jen v aplikaci.** Pořadí je důležité —
> každý krok staví na předchozím.

### 11. Instalace datové struktury

- [ ] V aplikaci klikni vlevo **Instalace a diagnostika**
- [ ] Průvodce vypíše, co chybí — bude toho hodně, to je v pořádku
- [ ] Klikni **Doplnit chybějící části**
- [ ] Počkej **1–3 minuty**, nezavírej stránku
- [ ] Na konci musí být všechno **zelené**

> Co zůstane **modré**, vyžaduje ruční zásah a průvodce u toho napíše, co udělat.
> Co zůstane **červené**, mi pošli jako printscreen.

### 12. Založ skupiny rolí

- [ ] Vlevo **Uživatelé a role**
- [ ] Vpravo nahoře klikni **Založit chybějící skupiny**
- [ ] Založí se šest skupin. Zatím jsi v nich jen ty.

### 13. Přiřaď lidi do rolí

- [ ] U každé role klikni **Přidat**
- [ ] Napiš jméno nebo e-mail (aspoň tři písmena) a vyber ze seznamu
- [ ] **Administrátor PRM:** přidej aspoň ještě jednoho člověka kromě sebe
- [ ] **Projektový manažer:** kdo zakládá a vede projekty
- [ ] **Finance – důvěrné:** jen ty a kdo opravdu má vidět firemní čísla

> Kdo tady přibude do role *Finance*, ještě **nemá přístup na web PRM-Finance**.
> Toho musíš přidat zvlášť: na webu PRM-Finance → ozubené kolo → *Oprávnění webu*.

### 14. Import stávajících projektů ⚠️

> **Tohle udělej dřív, než kdokoli založí první projekt.** Dokud import
> neproběhne, aplikace neví, kde skončila dosavadní řada, a nový projekt
> by dostal číslo 26001 — které už má složka.

- [ ] Vlevo **Nastavení** → záložka **Jednorázové akce**
- [ ] Klikni **Otevřít import**
- [ ] Zkontroluj tabulku — má ukázat pět projektů „naimportuje se"
      a `00_Project tools` jako „není projekt"
- [ ] Vyber projektového manažera
- [ ] Klikni **Naimportovat 5 projektů**

### 15. Založ projekt Režie

- [ ] Pořád v **Nastavení** → **Jednorázové akce**
- [ ] U karty *Projekt Režie 2026* klikni **Založit Režii**
- [ ] Dostane číslo `26999`

---

## E. Kontrola (krok 16)

- [ ] Otevři **Projekty** — musí tam být pět tvých projektů 26001–26005 a Režie 26999
- [ ] Klikni na **26001** — musí se otevřít detail
- [ ] V detailu klikni záložku **Dokumenty** — musí ukázat soubory ze složky
- [ ] Klikni **Otevřít složku projektu** — musí tě to hodit do knihovny
- [ ] Zkus **Nový projekt** — náhled čísla musí ukázat **26006**
      (projekt zatím **neukládej**, jen zkontroluj číslo a zavři)

Když všech pět sedí, je nasazeno. **Dej mi vědět a pošli printscreen seznamu projektů.**

---

## Co dělat, když něco nesedí

| Co se stane | Co s tím |
|---|---|
| Aplikace hlásí „Nemáte oprávnění" | Jsi ve skupině *Vlastníci* webu PRM? Ozubené kolo → Oprávnění webu. |
| Instalace končí červeně | Pošli mi printscreen té červené části. Nepokračuj dál. |
| Záložka Dokumenty je prázdná | Nastavení → Složky projektů — sedí adresa webu, knihovna a kořenová složka? |
| Import ukazuje 0 projektů | Nastavení → Složky projektů → *Kořenová složka* musí být `General/01_PROJEKTY`. |
| Import ukazuje špatné složky | Nic neklikej na *Naimportovat*, pošli mi printscreen té tabulky. |
| Nový projekt nabízí 26001 | Import neproběhl. Vrať se na krok 14. |

---

## Nastavení, které se doplní až po nasazení

Tyhle hodnoty mám jen odhadnuté — po nasazení je spolu projdeme:

- **Údaje firmy** (IČO, DIČ, e-mail účtárny) — do hlaviček PDF ve Fázi 2
- **Jména schvalovatelů** objednávek — limity už zadané jsou (100 tis. / 500 tis. / 1 mil.)
- **Šablona složek projektu** — teď je tam návrh, porovnáme ho s tím, co máte ve složkách
