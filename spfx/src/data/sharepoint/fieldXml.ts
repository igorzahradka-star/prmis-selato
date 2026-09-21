/**
 * Převod definice sloupce (schema.ts) na CAML XML pro SharePoint.
 *
 * Proč XML a ne `fields.addText()` a spol.: jen přes XML se dá spolehlivě
 * nastavit zároveň **interní název** (anglicky, bez diakritiky) a **zobrazovaný
 * název** (česky). Kdybychom použili `addText('Číslo projektu')`, SharePoint by
 * z českého názvu vyrobil nečitelný interní název a všechny dotazy by byly
 * nesrozumitelné.
 *
 * Vrstva bez závislosti na PnPjs — jde otestovat samostatně.
 */

import { FieldDef } from '../schema';

/** LCID pro češtinu — kvůli formátu měny (Kč) a desetinné čárce. */
export const LCID_CS = 1029;

/**
 * Volba `AddFieldInternalNameHint` (hodnota 8) přinutí SharePoint použít
 * atribut `Name` jako interní název. Bez ní si ho odvodí z DisplayName.
 */
export const ADD_FIELD_INTERNAL_NAME_HINT = 8;

/** Ošetří znaky, které v XML nesmí být holé. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Vyrobí CAML XML jednoho sloupce.
 *
 * @param field      definice sloupce
 * @param lookupListId GUID cílového seznamu — povinné u typu Lookup
 */
export function buildFieldXml(field: FieldDef, lookupListId?: string): string {
  const common =
    `DisplayName="${escapeXml(field.title)}" ` +
    `Name="${field.name}" ` +
    `StaticName="${field.name}"` +
    (field.required ? ' Required="TRUE"' : '') +
    (field.indexed ? ' Indexed="TRUE"' : '');

  const description = field.description
    ? `<Description>${escapeXml(field.description)}</Description>`
    : '';

  const defaultValue = field.defaultValue !== undefined
    ? `<Default>${escapeXml(field.defaultValue)}</Default>`
    : '';

  switch (field.type) {
    case 'Text':
      return `<Field Type="Text" ${common} MaxLength="255">${description}${defaultValue}</Field>`;

    case 'Note':
      return `<Field Type="Note" ${common} NumLines="6" RichText="FALSE" RichTextMode="Compatible" AppendOnly="FALSE">${description}</Field>`;

    case 'Number':
      return `<Field Type="Number" ${common} Decimals="${field.decimals ?? 0}">${description}${defaultValue}</Field>`;

    case 'Currency':
      return `<Field Type="Currency" ${common} Decimals="${field.decimals ?? 2}" LCID="${LCID_CS}">${description}${defaultValue}</Field>`;

    case 'DateTime':
      // DateOnly: v harmonogramu ani u splatností nás čas nezajímá a jen mate
      // kvůli časovým pásmům.
      return `<Field Type="DateTime" ${common} Format="DateOnly">${description}${defaultValue}</Field>`;

    case 'Boolean':
      return `<Field Type="Boolean" ${common}>${description}${defaultValue || '<Default>0</Default>'}</Field>`;

    case 'Choice':
    case 'MultiChoice': {
      const choices = (field.choices ?? [])
        .map((c) => `<CHOICE>${escapeXml(c)}</CHOICE>`)
        .join('');
      const type = field.type === 'MultiChoice' ? 'MultiChoice' : 'Choice';
      const format = field.type === 'MultiChoice' ? '' : ' Format="Dropdown"';
      // FillInChoice="FALSE": uživatel nesmí dopsat vlastní hodnotu —
      // číselníky se mění v Nastavení, ne překlepem v seznamu.
      return `<Field Type="${type}" ${common}${format} FillInChoice="FALSE">${description}<CHOICES>${choices}</CHOICES>${defaultValue}</Field>`;
    }

    case 'User':
      return `<Field Type="User" ${common} UserSelectionMode="PeopleOnly" UserSelectionScope="0">${description}</Field>`;

    case 'UserMulti':
      return `<Field Type="UserMulti" ${common} Mult="TRUE" UserSelectionMode="PeopleOnly" UserSelectionScope="0">${description}</Field>`;

    case 'Lookup': {
      if (!lookupListId) {
        throw new Error(
          `Sloupec „${field.title}" (${field.name}) je typu Lookup, ale není známé ID cílového seznamu ${field.lookupList}.`
        );
      }
      const showField = field.lookupField ?? 'Title';
      return `<Field Type="Lookup" ${common} List="${lookupListId}" ShowField="${showField}">${description}</Field>`;
    }

    case 'Url':
      return `<Field Type="URL" ${common} Format="Hyperlink">${description}</Field>`;

    default: {
      // Nepokrytý typ radši nahlásíme, než abychom tiše založili textový sloupec.
      const unknown: never = field.type;
      throw new Error(`Neznámý typ sloupce: ${String(unknown)}`);
    }
  }
}
