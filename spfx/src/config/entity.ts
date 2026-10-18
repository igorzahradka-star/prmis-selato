/**
 * Parametry entity (firmy), pro kterou je PRMIS nasazený — jediné místo.
 *
 * Cokoli, co se mezi firmami liší (adresa webu, název aplikace, firma, odkazy, umístění složek),
 * patří sem, ne do roztroušených řetězců po kódu. Žádný import SharePointu, PnPjs ani Reactu.
 *
 * Hodnota `TODO_SELATO` = Igor ji zatím nedodal; před nasazením se musí nahradit (hlídá to test `entity.test.ts`
 * jen jako přehled, nasazení nebrání).
 *
 * Co tu zatím NENÍ (řeší se v dalších etapách, viz docs/PREDANI_SELATO.md kap. 6): název a id řešení
 * (`config/package-solution.json`, manifesty web partů — JSON nejde importovat z kódu), číselné řady,
 * struktura složek projektu a číselníky.
 */

/** Zástupná hodnota pro údaj, který zadavatel ještě nedodal. */
export const TODO = 'TODO_SELATO';

export const ENTITY = {
  /** Firma (do textů, PDF a e-mailů). */
  companyName: 'SELATO s.r.o.',
  /** Název této aplikace. */
  appName: 'PRMIS',
  /** Název sesterské aplikace pro nabídky a obchodní případy (v Revoltum „RES CRM“). */
  crmName: 'SELCRM',

  /** Adresa tenanta Microsoft 365. */
  tenantUrl: 'https://selatosro2025.sharepoint.com',
  /** Cesta webu, na kterém PRMIS běží (např. `/sites/…`). Zatím nerozhodnuto. */
  siteServerRelativeUrl: `/sites/${TODO}`,
  /** Stránka s PRMIS a stránka sesterské aplikace v `SitePages` (jen název souboru). */
  appPageFile: 'PRM.aspx',
  crmPageFile: 'SELCRM.aspx',

  /** Značka podle Corporate Visual Style Guide SELATO (modrá `#0030ac`, zelená `#00a600`, šedé `#EFEFEF` a `#A0A1A2`). */
  brand: {
    blue: '#0030ac',
    green: '#00a600',
    grayLight: '#EFEFEF',
    gray: '#A0A1A2',
    /** Grafické výstupy Poppins; v aplikaci se použije, jen když je v počítači, jinak Aptos (kancelářské aplikace podle manuálu). */
    font: 'Poppins',
    officeFont: 'Aptos'
  },

  /** Fakturační a kontaktní údaje (výchozí hodnoty Nastavení → Údaje firmy), z manuálu značky. */
  company: {
    street: 'Lučice 260',
    city: 'Lučice',
    zip: '582 35',
    ico: '03647862',
    dic: 'CZ03647862',
    email: 'info@selato.cz',
    claim: 'SERVIS | ELEKTRO | AUTOMATIZACE',
    /** Dvouřádkový závěrečný nápis reportů (česky, anglicky). */
    slogan: {
      cs: ['Servis | Elektro', 'Automatizace'],
      en: ['Service | Electrical', 'Automation']
    }
  },

  /**
   * Umístění složek v knihovně (jde přepsat v Nastavení → Složky a Servis). Rozhodl Igor 18. 10. 2026:
   * složka `General` patří kanálu Teams a nechává se být, vlastní struktura je v `OPERATIONS`.
   */
  folders: {
    /** Adresa webu s knihovnou; prázdné = stejný web jako aplikace. */
    siteUrl: '',
    libraryTitle: 'Dokumenty',
    /** Složky projektů (PRMIS). Členění podle roku zatím nerozhodnuto (výchozí: bez roku). */
    rootFolder: 'OPERATIONS/01_PROJEKTY',
    /** Servis (lokality a soubory). */
    serviceRoot: 'OPERATIONS/02_SERVIS',
    /** Obchodní příležitosti (SELCRM, jen informativně — PRMIS sem nezapisuje). */
    opportunitiesRoot: 'OPERATIONS/00_OBCHODNI PRILEZITOSTI'
  }
} as const;

/** Plná adresa webu s PRMIS (`tenant` + cesta webu). */
export function entitySiteUrl(): string {
  return `${ENTITY.tenantUrl}${ENTITY.siteServerRelativeUrl}`;
}

/** Adresa stránky sesterské aplikace na webu s PRMIS — pro vzorový text v Nastavení. */
export function entityCrmPageUrl(): string {
  return `${entitySiteUrl()}/SitePages/${ENTITY.crmPageFile}`;
}

/** Názvy všech parametrů, které jsou ještě `TODO_SELATO` (přehled, co chybí dodat). */
export function entityTodos(): string[] {
  const out: string[] = [];
  const walk = (obj: Record<string, unknown>, prefix: string): void => {
    Object.keys(obj).forEach((k) => {
      const v = obj[k];
      if (typeof v === 'string' && v.indexOf(TODO) !== -1) {
        out.push(prefix + k);
      } else if (v !== null && typeof v === 'object') {
        walk(v as Record<string, unknown>, prefix + k + '.');
      }
    });
  };
  walk(ENTITY as unknown as Record<string, unknown>, '');
  return out;
}
