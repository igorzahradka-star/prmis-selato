/**
 * Vstupní bod aplikace PRM Revoltum.
 *
 * Jeden full-width web part na stránce typu „single part app page" na webu PRM.
 * Stejný web part jde přidat i jako záložku do Microsoft Teams.
 *
 * Web part sám nedělá nic víc, než že poskládá repozitáře podle zvoleného
 * zdroje dat a předá je aplikaci. Veškerá logika je v `core/`, `data/` a `features/`.
 */

import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import {
  type IPropertyPaneConfiguration,
  PropertyPaneChoiceGroup,
  PropertyPaneTextField
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';

import * as strings from 'PrmWebPartStrings';
import { PrmApp, IPrmAppProps } from './components/Prm';
import { RepositorySet } from '../../data/repositories';
import { createMockRepositories } from '../../data/mock/mockRepositories';
import { SpUserRepository } from '../../data/sharepoint/spUserRepository';
import { SpUserAdminRepository } from '../../data/sharepoint/spUserAdminRepository';
import { SpSettingsRepository } from '../../data/sharepoint/spSettingsRepository';
import { SpProjectRepository } from '../../data/sharepoint/spProjectRepository';
import { SpPartnerRepository } from '../../data/sharepoint/spPartnerRepository';
import { SpTaskRepository } from '../../data/sharepoint/spTaskRepository';
import { SpOrderRepository } from '../../data/sharepoint/spOrderRepository';
import { SpDocumentRepository } from '../../data/sharepoint/spDocumentRepository';
import { SpNumberingRepository } from '../../data/sharepoint/spNumberingRepository';
import { SpInstallRepository } from '../../data/sharepoint/spInstallRepository';

export type DataSource = 'sharepoint' | 'mock';

export interface IPrmWebPartProps {
  /** Odkud brát data. `mock` = ukázková data pro zkoušení a školení. */
  dataSource: DataSource;
  /** Adresa webu s důvěrnými finančními daty. Prázdné = moduly se nezobrazí. */
  financeSiteUrl: string;
}

export default class PrmWebPart extends BaseClientSideWebPart<IPrmWebPartProps> {
  public render(): void {
    const props: IPrmAppProps = {
      repos: this.buildRepositories(),
      dataSource: this.dataSource,
      financeSiteUrl: (this.properties.financeSiteUrl || '').trim()
    };
    ReactDom.render(React.createElement(PrmApp, props), this.domElement);
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  /** Ostrá data jsou výchozí; ukázkový režim musí editor stránky zvolit výslovně. */
  private get dataSource(): DataSource {
    return this.properties.dataSource === 'mock' ? 'mock' : 'sharepoint';
  }

  private buildRepositories(): RepositorySet {
    if (this.dataSource === 'mock') {
      return createMockRepositories();
    }

    const financeSiteUrl = (this.properties.financeSiteUrl || '').trim();
    const settings = new SpSettingsRepository(this.context);
    const numbering = new SpNumberingRepository(this.context);
    const userId = (this.context.pageContext.legacyPageContext || {}).userId as number;
    const projects = new SpProjectRepository(this.context, userId, numbering, settings);
    const partners = new SpPartnerRepository(this.context);

    return {
      users: new SpUserRepository(this.context, financeSiteUrl),
      userAdmin: new SpUserAdminRepository(this.context),
      settings,
      // ID uživatele je už v kontextu stránky — kvůli filtru „moje projekty"
      // tak nemusíme čekat na další dotaz do SharePointu.
      projects,
      partners,
      tasks: new SpTaskRepository(this.context),
      documents: new SpDocumentRepository(this.context, settings),
      orders: new SpOrderRepository(this.context, numbering, projects, settings),
      numbering,
      install: new SpInstallRepository(this.context, financeSiteUrl, settings)
    };
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: { description: strings.PropertyPaneDescription },
          groups: [
            {
              groupName: strings.DataGroupName,
              groupFields: [
                PropertyPaneChoiceGroup('dataSource', {
                  label: strings.DataSourceFieldLabel,
                  options: [
                    { key: 'sharepoint', text: strings.DataSourceSharePoint },
                    { key: 'mock', text: strings.DataSourceMock }
                  ]
                }),
                PropertyPaneTextField('financeSiteUrl', {
                  label: strings.FinanceSiteUrlLabel,
                  description: strings.FinanceSiteUrlDescription,
                  placeholder: 'https://firma.sharepoint.com/sites/RES-PRM-Finance'
                })
              ]
            }
          ]
        }
      ]
    };
  }
}
