/**
 * České popisky pro Fluent UI `DatePicker` a `Calendar` — knihovna sama
 * lokalizaci nedodává, musí se předat přes prop `strings`.
 */

import { IDatePickerStrings } from '@fluentui/react/lib/DatePicker';

export const CS_CALENDAR_STRINGS: IDatePickerStrings = {
  months: [
    'Leden',
    'Únor',
    'Březen',
    'Duben',
    'Květen',
    'Červen',
    'Červenec',
    'Srpen',
    'Září',
    'Říjen',
    'Listopad',
    'Prosinec'
  ],
  shortMonths: ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čvn', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro'],
  days: ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'],
  shortDays: ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'],
  goToToday: 'Dnes',
  prevMonthAriaLabel: 'Předchozí měsíc',
  nextMonthAriaLabel: 'Další měsíc',
  prevYearAriaLabel: 'Předchozí rok',
  nextYearAriaLabel: 'Další rok',
  closeButtonAriaLabel: 'Zavřít kalendář',
  isRequiredErrorMessage: 'Datum je povinné.',
  invalidInputErrorMessage: 'Neplatný formát data.'
};
