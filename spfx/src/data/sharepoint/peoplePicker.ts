/**
 * Dotaz a odpověď výběru osob (ClientPeoplePickerSearchUser).
 *
 * Schválně **bez importu SharePointu a PnPjs** — stejně jako `fieldXml.ts`
 * a `documentQuery.ts`. Jen tak jde tahle část otestovat: testy běží v Jestu,
 * který moduly PnPjs (ESM) nepřeloží.
 *
 * Rozhraní vrací JSON zabalený v několika obalech a se seznamem výsledků
 * jako **řetězcem** s dalším JSONem uvnitř. Rozbaluje se tady, aby ta
 * ošklivost nebyla rozsypaná po repozitáři.
 */

import { Person } from '../../core/userAdmin';

/**
 * Typ hledaných objektů: 1 = uživatel. Skupiny (2, 4) schválně nehledáme —
 * role má dostat konkrétní člověk, ne vnořená skupina, u které pak nikdo
 * nedohledá, kdo v ní vlastně je.
 */
const PRINCIPAL_TYPE_USER = 1;

/** Zdroj: 15 = všechny zdroje včetně adresáře firmy (Entra ID), ne jen uživatelé webu. */
const PRINCIPAL_SOURCE_ALL = 15;

/**
 * Tělo požadavku pro ClientPeoplePickerSearchUser.
 *
 * Tvar je citlivý na detaily — rozhraní je staré a na cokoli nečekaného
 * odpovídá HTTP 400 bez vysvětlení:
 *  - **žádné `__metadata`.** Patří ke starému formátu `odata=verbose`, který
 *    se tluče s hlavičkou `OData-Version: 4.0`, kterou SPHttpClient přidává sám.
 *  - **`SharePointGroupID` musí být v těle**, i když hledáme napříč webem.
 *    Když chybí, endpoint požadavek odmítne.
 */
export function peoplePickerQuery(searchText: string, maxResults: number = 15): object {
  return {
    queryParams: {
      AllowEmailAddresses: true,
      AllowMultipleEntities: false,
      AllUrlZones: false,
      MaximumEntitySuggestions: maxResults,
      PrincipalSource: PRINCIPAL_SOURCE_ALL,
      PrincipalType: PRINCIPAL_TYPE_USER,
      QueryString: searchText,
      // 0 = nehledáme uvnitř konkrétní skupiny webu, ale všude.
      SharePointGroupID: 0
    }
  };
}

/** Jeden výsledek, jak ho rozhraní vrací. */
interface PickerEntity {
  Key?: string;
  DisplayText?: string;
  EntityData?: { Email?: string; PrincipalType?: string };
}

/**
 * Rozbalí odpověď na seznam lidí.
 *
 * Odpověď má tvar `{ d: { ClientPeoplePickerSearchUser: "<json jako text>" } }`
 * — vnitřek je opravdu řetězec, ne objekt. Když se tvar nečekaně změní,
 * vrátí se prázdný seznam místo pádu: hledání lidí není nic, kvůli čemu
 * má spadnout celá stránka.
 */
export function parsePeoplePickerResults(response: unknown): Person[] {
  const raw = extractRawResults(response);
  if (!raw) {
    return [];
  }

  let entities: PickerEntity[];
  try {
    entities = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(entities)) {
    return [];
  }

  return entities
    .filter((e) => !!e && !!e.Key)
    .map((e) => ({
      // ID zatím neznáme — přidělí ho SharePoint, až člověka přidáme do skupiny.
      id: 0,
      loginName: e.Key as string,
      displayName: e.DisplayText || (e.Key as string),
      email: e.EntityData?.Email
    }));
}

function extractRawResults(response: unknown): string | undefined {
  const r = response as
    | { d?: { ClientPeoplePickerSearchUser?: string }; ClientPeoplePickerSearchUser?: string; value?: string }
    | undefined;
  const raw = r?.d?.ClientPeoplePickerSearchUser ?? r?.ClientPeoplePickerSearchUser ?? r?.value;
  return typeof raw === 'string' ? raw : undefined;
}
