/**
 * Údaje pro servisní smlouvy (Nastavení servisu): zhotovitel, asset manager, výchozí parametry, sazebník, registr autorizací OEM,
 * výchozí kontakty a eskalace. Smlouva si z nich při založení vezme kopii (snapshot) a upraví ji; pozdější změna nastavení
 * už podepsané smlouvy nemění. Hodnoty z ukázkového vstupu smlouvy (ceny sazebníku, kontakty) jsou jen ilustrativní, proto je výchozí nastavení nenaplňuje.
 */

import { ContractContact, ContractEscalation, ContractOemAuthorization, ContractParameters, ContractParty, ContractRate } from './serviceContract';

export interface AssetManagerInfo {
  nazev: string;
  ico: string;
  sidlo: string;
}

export interface ContractSettings {
  zhotovitel: ContractParty;
  assetManager: AssetManagerInfo;
  mistoPodpisu: string;
  parametry: ContractParameters;
  sazebnik: ContractRate[];
  autorizaceOem: ContractOemAuthorization[];
  kontakty: ContractContact[];
  eskalace: ContractEscalation[];
}

/** Výchozí parametry smlouvy podle ukázkového vstupu; upřesní zadavatel. */
export const DEFAULT_CONTRACT_PARAMETERS: ContractParameters = {
  doba_let: 10,
  prodlouzeni_let: 1,
  vypovedni_lhuta_mesicu: 6,
  fakturace: 'čtvrtletně zpětně',
  splatnost_dni: 30,
  indexace_den: '1. lednu',
  indexace_prvni: '',
  limit_odpovednosti_pct: 100,
  pojisteni_mil_kc: 10,
  zaruka_prace_mesicu: 24,
  limit_bez_schvaleni_kc: 50000,
  servisni_zpravy_dni: 10,
  predani_mesicu: 3,
  planovana_udrzba_h_rok: 48,
  penale_dostupnost_pct: 2,
  penale_p1_kc_hod: 2000,
  penale_cap_pct: 20
};

export const DEFAULT_CONTRACT_SETTINGS: ContractSettings = {
  // Název a sídlo podle obchodního rejstříku (ARES, IČO 29713536); zbytek doplní zadavatel (tlačítko „Načíst z ARES“ doplní rejstřík a jednatele).
  zhotovitel: { nazev: 'Revoltum Engineering & Services s.r.o.', sidlo: 'Havířská 1021, 58001 Havlíčkův Brod', ico: '29713536' },
  assetManager: { nazev: 'Revoltum a.s.', ico: '', sidlo: '' },
  mistoPodpisu: 'Havlíčkově Brodě',
  parametry: DEFAULT_CONTRACT_PARAMETERS,
  sazebnik: [],
  autorizaceOem: [],
  kontakty: [],
  eskalace: [
    { uroven: '1', spoustec: 'Překročení Doby příjezdu P1/P2', res: 'Vedoucí servisu', objednatel: 'Technický kontakt' },
    { uroven: '2', spoustec: 'Překročení Doby odstranění P1 nebo opakovaná porucha', res: 'Technický ředitel', objednatel: 'Asset manager' },
    { uroven: '3', spoustec: 'Ohrožení garantované dostupnosti / spor', res: 'Jednatel RES', objednatel: 'Statutární orgán' }
  ]
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Doplní chybějící části uloženého nastavení výchozími hodnotami (starší uložené nastavení smlouvy nemá). */
export function contractSettingsWithDefaults(stored: Partial<ContractSettings> | undefined): ContractSettings {
  const d = clone(DEFAULT_CONTRACT_SETTINGS);
  if (!stored) {
    return d;
  }
  return {
    zhotovitel: { ...d.zhotovitel, ...(stored.zhotovitel || {}) },
    assetManager: { ...d.assetManager, ...(stored.assetManager || {}) },
    mistoPodpisu: typeof stored.mistoPodpisu === 'string' ? stored.mistoPodpisu : d.mistoPodpisu,
    parametry: { ...d.parametry, ...(stored.parametry || {}) },
    sazebnik: Array.isArray(stored.sazebnik) ? stored.sazebnik : d.sazebnik,
    autorizaceOem: Array.isArray(stored.autorizaceOem) ? stored.autorizaceOem : d.autorizaceOem,
    kontakty: Array.isArray(stored.kontakty) ? stored.kontakty : d.kontakty,
    eskalace: Array.isArray(stored.eskalace) ? stored.eskalace : d.eskalace
  };
}

/** Kontrola nastavení smluv (české věty); prázdné pole = v pořádku. */
export function validateContractSettings(s: ContractSettings): string[] {
  const out: string[] = [];
  (Object.keys(s.parametry) as (keyof ContractParameters)[]).forEach((k) => {
    const v = s.parametry[k];
    if (typeof v === 'number' && (!isFinite(v) || v < 0)) {
      out.push(`Parametr smlouvy „${k}“ musí být číslo, nula nebo víc.`);
    }
  });
  if (s.parametry.doba_let < 1) {
    out.push('Doba trvání smlouvy musí být aspoň 1 rok.');
  }
  s.sazebnik.forEach((r, i) => {
    if (r.polozka.trim() === '') {
      out.push(`Sazebník, řádek ${i + 1}: vyplňte položku.`);
    }
    if (!isFinite(r.cena) || r.cena < 0) {
      out.push(`Sazebník, řádek ${i + 1}: cena musí být číslo, nula nebo víc.`);
    }
  });
  s.autorizaceOem.forEach((a, i) => {
    if (a.vyrobce.trim() === '') {
      out.push(`Autorizace OEM, řádek ${i + 1}: vyplňte výrobce.`);
    }
  });
  if (s.zhotovitel.ico.trim() !== '' && !/^\d{8}$/.test(s.zhotovitel.ico.trim())) {
    out.push('IČO zhotovitele má mít 8 číslic.');
  }
  return out;
}
