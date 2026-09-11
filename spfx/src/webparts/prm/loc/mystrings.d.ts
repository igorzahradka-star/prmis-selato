declare interface IPrmWebPartStrings {
  PropertyPaneDescription: string;
  DataGroupName: string;
  DataSourceFieldLabel: string;
  DataSourceSharePoint: string;
  DataSourceMock: string;
  FinanceSiteUrlLabel: string;
  FinanceSiteUrlDescription: string;
}

declare module 'PrmWebPartStrings' {
  const strings: IPrmWebPartStrings;
  export = strings;
}
