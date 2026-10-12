/**
 * Fluent UI theme v barvách RES.
 *
 * Všechny komponenty berou barvy odtud — nikde v aplikaci se nepíše HEX natvrdo.
 * Zdroj barev: brand/BARVY.md (odvozeno z firemního motivu Office).
 */

import { createTheme, ITheme, IPalette } from '@fluentui/react/lib/Styling';

/** Barvy značky RES — jediné místo, kde jsou HEX hodnoty. */
export const RES = {
  /** Text a hlavní tmavá — logo „REVOLTUM". */
  text: '#030422',
  /** Navy tmavá — hlavička aplikace. */
  navyDark: '#0E2841',
  /** Navy. */
  navy: '#153D64',
  /** Modrá — primární akce, tlačítka, odkazy. */
  blue: '#0268A6',
  /** Modrá střední — hover. */
  blueMid: '#215E99',
  /** Modrá světlá. */
  blueLight: '#45B0E1',
  /** Azurová. */
  cyan: '#0F9ED5',
  /** Světle modrá — podbarvení. */
  bluePale: '#C1E4F5',
  /** Šedomodrá — oddělovače. */
  grayBlue: '#C7D4DD',
  /** Zelená RES — akcent značky. */
  green: '#00C667',
  /** Zelená tmavší — semafor, grafy. */
  greenDark: '#00A857',
  /** Šedá — popisky. */
  gray: '#9AA3AD',
  /** Semafor žlutá. */
  amber: '#E8A200',
  /** Semafor červená. */
  red: '#C4314B',
  white: '#FFFFFF',
  /** Podklad aplikace. */
  background: '#FAFBFC'
} as const;

/** Písmo podle grafického manuálu. Aptos je standardní písmo Microsoft 365. */
export const RES_FONT_FAMILY = "'Aptos', 'Segoe UI', system-ui, -apple-system, sans-serif";

/**
 * Barvy semaforu rozpočtu.
 * Vždy se používají spolu s ikonou nebo textem — barva sama o sobě nestačí
 * (barvoslepost, tisk černobíle).
 */
export const SEMAFOR = {
  'Zelená': { color: RES.greenDark, background: '#CDEFDC', icon: 'CompletedSolid' },
  'Světle zelená': { color: '#4C8A1F', background: '#E6F4D5', icon: 'CompletedSolid' },
  'Žlutá': { color: RES.amber, background: '#FDF3DC', icon: 'WarningSolid' },
  'Červená': { color: RES.red, background: '#FBE8EB', icon: 'StatusErrorFull' },
  'Tmavě červená': { color: '#FFFFFF', background: '#8B0F23', icon: 'StatusErrorFull' },
  'Bez rozpočtu': { color: RES.gray, background: '#F1F3F5', icon: 'Blocked2Solid' }
} as const;

const palette: Partial<IPalette> = {
  themePrimary: RES.blue,
  themeLighterAlt: '#F2F8FC',
  themeLighter: '#CFE6F3',
  themeLight: '#A9D2E9',
  themeTertiary: '#5EA8D1',
  themeSecondary: '#1C78B2',
  themeDarkAlt: '#025E95',
  themeDark: '#024F7E',
  themeDarker: '#013A5D',

  neutralDark: RES.text,
  neutralPrimary: RES.text,
  neutralPrimaryAlt: '#2B2D42',
  neutralSecondary: '#5A6472',
  neutralTertiary: RES.gray,
  neutralTertiaryAlt: RES.grayBlue,
  neutralQuaternary: '#DDE4EA',
  neutralQuaternaryAlt: '#E7ECF0',
  neutralLight: '#EDF1F4',
  neutralLighter: '#F4F6F8',
  neutralLighterAlt: '#FAFBFC',

  black: RES.text,
  white: RES.white,

  // Zelená RES je akcentová barva značky — používá se na potvrzovací akce.
  accent: RES.green
};

/** Hlavní theme aplikace. Předává se do `<ThemeProvider>` v kořeni web partu. */
export const resTheme: ITheme = createTheme({
  palette,
  defaultFontStyle: {
    fontFamily: RES_FONT_FAMILY
  },
  semanticColors: {
    bodyBackground: RES.background,
    bodyText: RES.text,
    link: RES.blue,
    linkHovered: RES.blueMid,
    errorText: RES.red,
    successIcon: RES.greenDark,
    warningIcon: RES.amber
  }
});

/** Rozměry používané v layoutu — aby byly na jednom místě. */
export const LAYOUT = {
  headerHeight: 64,
  navWidth: 236,
  navWidthCollapsed: 48,
  /** Pod touto šířkou se navigace sbalí — tablet na výšku a mobil. */
  breakpointNarrow: 900,
  contentMaxWidth: 1680,
  /** Vnitřní okraje `<main>` — na jednom místě, aby se podle nich dal spočítat "full-bleed" prvek (viz DashboardPage). */
  contentPaddingTop: 20,
  contentPaddingX: 24,
  contentPaddingBottom: 40
} as const;
