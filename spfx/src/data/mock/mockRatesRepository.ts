/**
 * Kurzy v ukázkovém režimu — v paměti. Výchozí hodnoty jsou skutečný střed ČNB z 29. 9. 2026.
 */

import { CurrentUser, Role } from '../../core/types';
import { StoredRate, StoredRates, validateRateEntry } from '../../core/currency';
import { IRatesRepository } from '../repositories';

function delay<T>(value: T, ms: number = 120): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export const MOCK_RATES: StoredRate[] = [
  { currency: 'EUR', rate: 24.415, date: new Date(2026, 8, 29), source: 'ČNB' },
  { currency: 'USD', rate: 21.501, date: new Date(2026, 8, 29), source: 'ČNB' }
];

export class MockRatesRepository implements IRatesRepository {
  private rates: StoredRate[];

  public constructor(seed: StoredRate[] = MOCK_RATES) {
    this.rates = seed.map((r) => ({ ...r }));
  }

  public getLatest(): Promise<StoredRates> {
    const latest: StoredRates = {};
    this.sorted().forEach((r) => {
      if ((r.currency === 'EUR' || r.currency === 'USD') && !latest[r.currency]) {
        latest[r.currency] = { ...r };
      }
    });
    return delay(latest);
  }

  public listRecent(limit: number = 30): Promise<StoredRate[]> {
    return delay(this.sorted().slice(0, limit).map((r) => ({ ...r })));
  }

  public async add(rate: StoredRate, actor: CurrentUser): Promise<void> {
    if (actor.roles.indexOf(Role.Administrator) === -1) {
      throw new Error('Kurzy smí zapisovat jen administrátor PRM.');
    }
    const problems = validateRateEntry({ currency: rate.currency, rate: rate.rate, date: rate.date });
    if (problems.length > 0) {
      throw new Error(problems.join(' '));
    }
    this.rates = [...this.rates, { ...rate, source: rate.source ?? 'ruční zápis' }];
    return delay(undefined);
  }

  /** Nejnovější den první; při stejném dni později zapsaný před dřívějším. */
  private sorted(): StoredRate[] {
    return this.rates
      .map((r, i) => ({ r, i }))
      .sort((a, b) => b.r.date.getTime() - a.r.date.getTime() || b.i - a.i)
      .map((x) => x.r);
  }
}
