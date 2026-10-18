import { ENTITY, TODO, entityCrmPageUrl, entitySiteUrl, entityTodos } from './entity';

describe('ENTITY', () => {
  it('nemá nic z Revoltum', () => {
    expect(JSON.stringify(ENTITY).toLowerCase()).not.toContain('revoltum');
  });

  it('adresa webu a stránky CRM se skládá z tenanta a cesty webu', () => {
    expect(entitySiteUrl()).toBe(`https://selatosro2025.sharepoint.com/sites/${TODO}`);
    expect(entityCrmPageUrl()).toBe(`https://selatosro2025.sharepoint.com/sites/${TODO}/SitePages/SELCRM.aspx`);
  });

  it('vypíše, co ještě chybí dodat', () => {
    expect(entityTodos()).toEqual(['siteServerRelativeUrl']);
  });
});
