/**
 * Přepínač měny přehledů: CZK / EUR / USD. Volba platí pro všechny přehledy s cenami (viz `ui/currencyChoice`);
 * bez volby platí výchozí měna z Nastavení. Přepočet dělá kurz ČNB — doklady samotné zůstávají v měně dokladu.
 */

import * as React from 'react';
import { DefaultButton } from '@fluentui/react/lib/Button';
import { Label } from '@fluentui/react/lib/Label';

import { RES } from '../theme';
import { CURRENCY_CODES } from '../../core/currency';
import { useReportCurrency } from '../useReportCurrency';

export const CurrencySwitch: React.FC<{
  /** Popisek nad tlačítky (jako u ostatních filtrů); bez něj je popisek „Zobrazit v:“ vedle nich. */
  stacked?: boolean;
}> = ({ stacked }) => {
  const report = useReportCurrency();
  const checkedStyle = { background: RES.navy, color: RES.white, borderColor: RES.navy };
  const buttons = (
    <div role="group" aria-label="Měna přehledu" style={{ display: 'inline-flex' }}>
      {CURRENCY_CODES.map((code, i) => (
        <DefaultButton
          key={code}
          text={code}
          checked={report.currency === code}
          onClick={() => report.setCurrency(code)}
          title={
            code === report.defaultCurrency
              ? `Zobrazit částky v ${code} (výchozí měna z Nastavení)`
              : `Zobrazit částky v ${code} (přepočet kurzem ČNB)`
          }
          styles={{
            root: {
              minWidth: 52,
              padding: '0 10px',
              borderRadius: i === 0 ? '2px 0 0 2px' : i === CURRENCY_CODES.length - 1 ? '0 2px 2px 0' : 0,
              marginLeft: i === 0 ? 0 : -1
            },
            rootChecked: checkedStyle,
            rootCheckedHovered: checkedStyle,
            rootCheckedPressed: checkedStyle
          }}
        />
      ))}
    </div>
  );
  if (stacked) {
    return (
      <div>
        <Label>Zobrazit v</Label>
        {buttons}
      </div>
    );
  }
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: RES.gray, fontSize: 12 }}>Zobrazit v:</span>
      {buttons}
    </div>
  );
};
