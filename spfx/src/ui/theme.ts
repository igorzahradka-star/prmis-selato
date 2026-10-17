/**
 * Fluent UI theme v barvách značky (SELATO, viz `config/entity.ts` a `brand/selato/`).
 *
 * Všechny komponenty berou barvy odtud — nikde v aplikaci se nepíše HEX natvrdo.
 * Zdroj barev: Corporate Visual Style Guide SELATO a motiv Office (brand/BARVY.md).
 */

import { createTheme, ITheme, IPalette } from '@fluentui/react/lib/Styling';
import { ENTITY } from '../config/entity';

/**
 * Barvy značky — jediné místo, kde jsou HEX hodnoty. Název `RES` zůstal z původní aplikace (je na něj navázáno
 * stovky míst); hodnoty jsou SELATO.
 */
export const RES = {
  /** Text a hlavní tmavá (motiv Office „dk2“). */
  text: '#262626',
  /** Tmavě modrá — hlavička aplikace. */
  navyDark: ENTITY.brand.blue,
  /** Tmavší modrá — přechody, hover v záhlaví. */
  navy: '#00227a',
  /** Modrá SELATO — primární akce, tlačítka, odkazy. */
  blue: ENTITY.brand.blue,
  /** Modrá střední — hover (motiv Office „accent4“). */
  blueMid: '#215E99',
  /** Modrá světlá. */
  blueLight: '#5F7FD6',
  /** Azurová (grafy). */
  cyan: '#215E99',
  /** Světle modrá — podbarvení. */
  bluePale: '#DCE4F7',
  /** Šedomodrá — oddělovače. */
  grayBlue: '#D4D8E2',
  /** Zelená SELATO — akcent značky. */
  green: ENTITY.brand.green,
  /** Zelená tmavší — semafor, grafy (text na světlém podkladu). */
  greenDark: '#008a00',
  /** Šedá — popisky. */
  gray: ENTITY.brand.gray,
  /** Semafor žlutá. */
  amber: '#E8A200',
  /** Semafor červená. */
  red: '#C4314B',
  white: '#FFFFFF',
  /** Podklad aplikace. */
  background: '#FAFAFA'
} as const;

/** Písmo: Poppins (grafika), záloha Aptos (písmo Microsoft 365 podle manuálu značky). */
export const RES_FONT_FAMILY = `'${ENTITY.brand.font}', '${ENTITY.brand.officeFont}', 'Segoe UI', system-ui, -apple-system, sans-serif`;

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
  themeLighterAlt: '#F3F6FD',
  themeLighter: '#D2DDF7',
  themeLight: '#AABDEE',
  themeTertiary: '#5F7FD6',
  themeSecondary: '#1E4BBE',
  themeDarkAlt: '#002A99',
  themeDark: '#002380',
  themeDarker: '#001A5F',

  neutralDark: RES.text,
  neutralPrimary: RES.text,
  neutralPrimaryAlt: '#3B3B3B',
  neutralSecondary: '#5F5F5F',
  neutralTertiary: RES.gray,
  neutralTertiaryAlt: RES.grayBlue,
  neutralQuaternary: '#E2E2E2',
  neutralQuaternaryAlt: '#EAEAEA',
  neutralLight: '#EFEFEF',
  neutralLighter: '#F5F5F5',
  neutralLighterAlt: '#FAFAFA',

  black: RES.text,
  white: RES.white,

  // Zelená značky je akcentová barva značky — používá se na potvrzovací akce.
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
