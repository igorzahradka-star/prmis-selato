/**
 * Lokální náhled aplikace PRM Revoltum.
 *
 * K čemu je: aplikace je web part SharePointu, takže bez firemního tenanta
 * se normálně spustit nedá. Tenhle náhled vezme **stejné komponenty** jako
 * ostrá aplikace, připojí k nim ukázková data a vykreslí je do obyčejné
 * stránky v prohlížeči. Slouží k prohlédnutí vzhledu a ovládání.
 *
 * Co náhled NEUMÍ a umět nemůže: cokoli, co sahá na SharePoint —
 * instalaci seznamů, ukládání nastavení, skutečné role. Tam všude se
 * chová jako ukázkový režim.
 */

import * as React from 'react';
import * as ReactDom from 'react-dom';

import { PrmApp } from '../spfx/lib/webparts/prm/components/Prm';
import { createMockRepositories } from '../spfx/lib/data/mock/mockRepositories';

ReactDom.render(
  React.createElement(PrmApp, {
    repos: createMockRepositories(),
    dataSource: 'mock',
    // Prázdné = finanční moduly se nezobrazí, stejně jako když web
    // PRM-Finance ještě neexistuje.
    financeSiteUrl: ''
  }),
  document.getElementById('app')
);
