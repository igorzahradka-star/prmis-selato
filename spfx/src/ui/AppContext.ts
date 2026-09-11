/**
 * Sdílený kontext aplikace — přihlášený uživatel, nastavení a repozitáře.
 *
 * Komponenty si ho berou přes `useApp()`. Díky tomu nikde neprotéká
 * `WebPartContext` ani PnPjs do UI.
 */

import * as React from 'react';
import { CurrentUser } from '../core/types';
import { AppSettings, DEFAULT_SETTINGS } from '../core/settings';
import { RepositorySet } from '../data/repositories';

export interface AppContextValue {
  user: CurrentUser;
  settings: AppSettings;
  repos: RepositorySet;
  /** Zdroj dat — `mock` se zobrazuje v hlavičce, aby bylo jasné, že data nejsou ostrá. */
  dataSource: 'sharepoint' | 'mock';
  /** Adresa webu PRM-Finance. Prázdná = finanční moduly nejsou nastavené. */
  financeSiteUrl: string;
  /** Znovu načte nastavení po uložení změn. */
  reloadSettings: () => Promise<void>;
}

const placeholder: AppContextValue = {
  user: {
    id: 0,
    loginName: '',
    displayName: '',
    email: '',
    roles: [],
    isSiteAdmin: false,
    hasFinanceAccess: false
  },
  settings: DEFAULT_SETTINGS,
  repos: undefined as unknown as RepositorySet,
  dataSource: 'mock',
  financeSiteUrl: '',
  reloadSettings: async () => undefined
};

export const AppContext = React.createContext<AppContextValue>(placeholder);

/** Zkratka pro komponenty. */
export function useApp(): AppContextValue {
  return React.useContext(AppContext);
}
