/**
 * Kurzy ČNB v seznamu PRM_ExchangeRates.
 *
 * Čtení kurzů **nikdy nesmí shodit aplikaci**: před doplněním schématu seznam na webu ještě není a objednávky
 * i přehled projektů se mají v tu chvíli počítat nouzovými kurzy z Nastavení, ne skončit chybou.
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { CurrentUser, Role } from '../../core/types';
import { toDate } from '../../core/format';
import { StoredRate, StoredRates, validateRateEntry } from '../../core/currency';
import { IRatesRepository } from '../repositories';
import { getSp, describeSpError } from './spContext';

const RATES_LIST = 'PRM_ExchangeRates';

interface RateItem {
  Title?: string;
  RateDate?: string;
  Rate?: number;
  Source?: string;
}

export class SpRatesRepository implements IRatesRepository {
  public constructor(private readonly context: WebPartContext) {}

  public async getLatest(): Promise<StoredRates> {
    try {
      const recent = await this.read(100);
      const latest: StoredRates = {};
      // Seznam je od nejnovějšího, takže první výskyt měny je nejnovější kurz.
      recent.forEach((r) => {
        if ((r.currency === 'EUR' || r.currency === 'USD') && !latest[r.currency]) {
          latest[r.currency] = r;
        }
      });
      return latest;
    } catch {
      return {};
    }
  }

  public async listRecent(limit: number = 30): Promise<StoredRate[]> {
    try {
      return await this.read(limit);
    } catch (error) {
      throw new Error(
        describeSpError(error, 'Nepodařilo se načíst kurzy. Pokud seznam kurzů ještě není, spusťte Instalace a diagnostika')
      );
    }
  }

  public async add(rate: StoredRate, actor: CurrentUser): Promise<void> {
    if (actor.roles.indexOf(Role.Administrator) === -1) {
      throw new Error('Kurzy smí zapisovat jen administrátor PRM.');
    }
    const problems = validateRateEntry({ currency: rate.currency, rate: rate.rate, date: rate.date });
    if (problems.length > 0) {
      throw new Error(problems.join(' '));
    }
    try {
      const sp = getSp(this.context);
      await sp.web.lists.getByTitle(RATES_LIST).items.add({
        Title: rate.currency,
        RateDate: rate.date.toISOString(),
        Rate: rate.rate,
        Source: rate.source ?? 'ruční zápis'
      });
    } catch (error) {
      throw new Error(describeSpError(error, 'Kurz se nepodařilo zapsat'));
    }
  }

  private async read(limit: number): Promise<StoredRate[]> {
    const sp = getSp(this.context);
    const items: RateItem[] = await sp.web.lists
      .getByTitle(RATES_LIST)
      .items.select('Title', 'RateDate', 'Rate', 'Source')
      .orderBy('RateDate', false)
      .top(limit)();
    const rates: StoredRate[] = [];
    items.forEach((i) => {
      const date = toDate(i.RateDate);
      if ((i.Title === 'EUR' || i.Title === 'USD') && date && i.Rate && i.Rate > 0) {
        rates.push({ currency: i.Title, rate: i.Rate, date, source: i.Source || undefined });
      }
    });
    return rates;
  }
}
