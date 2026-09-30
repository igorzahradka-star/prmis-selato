/**
 * Kurzy pro přepočet částek objednávek na koruny (poslední zapsané kurzy ČNB, jinak nouzové z Nastavení).
 * Přehledy objednávek ukazují částky vždy v Kč, takže potřebují kurzy i bez otevřené objednávky.
 */

import * as React from 'react';

import { useApp } from '../../ui/AppContext';
import { RateTable, StoredRates, effectiveRates } from '../../core/currency';
import { fallbackRatesOf } from '../../core/settings';

export function useOrderRates(): RateTable {
  const { repos, settings } = useApp();
  const [stored, setStored] = React.useState<StoredRates>({});

  React.useEffect(() => {
    let cancelled = false;
    repos.rates
      .getLatest()
      .then((r) => !cancelled && setStored(r))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [repos]);

  return React.useMemo(() => effectiveRates(stored, fallbackRatesOf(settings.approvals)), [stored, settings.approvals]);
}
