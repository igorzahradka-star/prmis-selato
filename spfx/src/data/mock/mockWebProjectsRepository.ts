/** Ukázkový seznam projektů pro web part „Běžící projekty“ — bere ukázkové projekty a nastavení aplikace. */

import { IProjectRepository, ISettingsRepository, IWebProjectsRepository, WebProjectsData } from '../repositories';

export class MockWebProjectsRepository implements IWebProjectsRepository {
  public constructor(private readonly projects: IProjectRepository, private readonly settings: ISettingsRepository) {}

  public async load(): Promise<WebProjectsData> {
    const settings = (await this.settings.get()).webList;
    const projects = await this.projects.list({ includeOverhead: false });
    return { settings, projects };
  }
}
