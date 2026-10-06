/**
 * Web part „Běžící projekty“ — kompaktní seznam projektů pro úvodní stránku webu RES (a jeho kopii na webu Revoltum).
 *
 * Je samostatný a lehký (nenačítá celou aplikaci PRMIS). Data čte jen pro čtení, které projekty se ukazují, řídí
 * Nastavení → Projekty na webu v PRMIS. Kopie na jiném webu má v nastavení web partu uvedenou adresu webu s PRMIS.
 */

import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import { type IPropertyPaneConfiguration, PropertyPaneChoiceGroup, PropertyPaneTextField } from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';

import { ProjectsList } from './components/ProjectsList';
import { IWebProjectsRepository } from '../../data/repositories';
import { createMockRepositories } from '../../data/mock/mockRepositories';
import { MockWebProjectsRepository } from '../../data/mock/mockWebProjectsRepository';
import { SpWebProjectsRepository } from '../../data/sharepoint/spWebProjectsRepository';
import { defaultAppPageUrl } from '../../core/webProjects';

export interface IProjectsWebPartProps {
  dataSource: 'sharepoint' | 'mock';
  title: string;
  /** Adresa webu, kde běží PRMIS. Prázdné = tento web. Vyplní se u kopie na jiném webu (např. Revoltum). */
  dataSiteUrl: string;
  /** Adresa stránky s aplikací PRMIS. Prázdné = `<web s PRMIS>/SitePages/PRM.aspx`. */
  appPageUrl: string;
}

/** Výchozí nadpis. Web part vložený ještě s původním nadpisem „Běžící projekty“ dostane nový nadpis sám, bez úpravy stránky. */
const DEFAULT_TITLE = 'Běžící projekty Revoltum Engineering & Services';
const OLD_DEFAULT_TITLE = 'Běžící projekty';

export default class ProjectsWebPart extends BaseClientSideWebPart<IProjectsWebPartProps> {
  public render(): void {
    const siteUrl = (this.properties.dataSiteUrl || '').trim().replace(/\/+$/, '');
    const webUrl = siteUrl || this.context.pageContext.web.absoluteUrl;
    const repo: IWebProjectsRepository =
      this.properties.dataSource === 'mock'
        ? ((): IWebProjectsRepository => {
            const m = createMockRepositories();
            return new MockWebProjectsRepository(m.projects, m.settings);
          })()
        : new SpWebProjectsRepository(this.context, siteUrl);
    const element = React.createElement(ProjectsList, {
      repo,
      title: this.properties.title === undefined || this.properties.title === OLD_DEFAULT_TITLE ? DEFAULT_TITLE : this.properties.title,
      appPageUrl: (this.properties.appPageUrl || '').trim() || defaultAppPageUrl(webUrl)
    });
    ReactDom.render(element, this.domElement);
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: { description: 'Které projekty se ukazují, se nastavuje v PRMIS (Nastavení → Projekty na webu).' },
          groups: [
            {
              groupName: 'Zobrazení',
              groupFields: [PropertyPaneTextField('title', { label: 'Nadpis (prázdný = bez nadpisu)' })]
            },
            {
              groupName: 'Data',
              groupFields: [
                PropertyPaneChoiceGroup('dataSource', {
                  label: 'Zdroj dat',
                  options: [
                    { key: 'sharepoint', text: 'Ostrá data z PRMIS' },
                    { key: 'mock', text: 'Ukázková data' }
                  ]
                }),
                PropertyPaneTextField('dataSiteUrl', {
                  label: 'Adresa webu s PRMIS (jen u kopie na jiném webu)',
                  description: 'Na webu RES nechte prázdné.',
                  placeholder: 'https://revoltum.sharepoint.com/sites/RevoltumEngineeringServices'
                }),
                PropertyPaneTextField('appPageUrl', {
                  label: 'Adresa stránky s PRMIS (nepovinné)',
                  description: 'Kam vedou odkazy na projekty. Prázdné = stránka SitePages/PRM.aspx webu s PRMIS.'
                })
              ]
            }
          ]
        }
      ]
    };
  }
}
