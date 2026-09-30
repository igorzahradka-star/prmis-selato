/**
 * Kurzy ČNB — přehled zapsaných kurzů a ruční zápis.
 *
 * Veřejné rozhraní ČNB prohlížeči stahování kurzů nepovoluje (CORS), proto se kurzy zapisují do seznamu
 * PRM_ExchangeRates: ručně tady, nebo denně automaticky přes Power Automate (návod je ve Nápovědě).
 * Z tohoto seznamu se počítají součty v Kč i pásma schvalování objednávek v cizí měně.
 */

import * as React from 'react';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { TextField } from '@fluentui/react/lib/TextField';
import { DatePicker } from '@fluentui/react/lib/DatePicker';
import { PrimaryButton } from '@fluentui/react/lib/Button';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { CS_CALENDAR_STRINGS } from '../../ui/csCalendarStrings';
import { formatDate, parseAmount, parseCzechDate } from '../../core/format';
import { StoredRate, StoredRates, effectiveRates, isRateStale, validateRateEntry } from '../../core/currency';
import { fallbackRatesOf } from '../../core/settings';

export const RatesTab: React.FC = () => {
  const { repos, settings, user } = useApp();
  const [recent, setRecent] = React.useState<StoredRate[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [info, setInfo] = React.useState<string | undefined>(undefined);
  const [saving, setSaving] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  const [date, setDate] = React.useState<Date | undefined>(new Date());
  const [eur, setEur] = React.useState('');
  const [usd, setUsd] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    repos.rates
      .listRecent(12)
      .then((r) => !cancelled && setRecent(r))
      .catch((e: Error) => {
        if (!cancelled) {
          setRecent([]);
          setError(e.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repos, reloadKey]);

  const latest: StoredRates = {};
  (recent ?? []).forEach((r) => {
    if ((r.currency === 'EUR' || r.currency === 'USD') && !latest[r.currency]) {
      latest[r.currency] = r;
    }
  });
  const table = effectiveRates(latest, fallbackRatesOf(settings.approvals));
  const stale = recent !== undefined && isRateStale(table);

  const save = async (): Promise<void> => {
    setError(undefined);
    setInfo(undefined);
    const entries: StoredRate[] = [];
    const problems: string[] = [];
    [
      { currency: 'EUR' as const, text: eur },
      { currency: 'USD' as const, text: usd }
    ].forEach((e) => {
      if (e.text.trim() === '') {
        return;
      }
      const rate = parseAmount(e.text);
      const found = validateRateEntry({ currency: e.currency, rate, date });
      if (found.length > 0) {
        problems.push(`${e.currency}: ${found.join(' ')}`);
      } else {
        entries.push({ currency: e.currency, rate: rate as number, date: date as Date, source: 'ČNB (ruční zápis)' });
      }
    });
    if (problems.length > 0) {
      setError(problems.join(' '));
      return;
    }
    if (entries.length === 0) {
      setError('Vyplňte aspoň jeden kurz.');
      return;
    }
    setSaving(true);
    try {
      for (const entry of entries) {
        await repos.rates.add(entry, user);
      }
      setEur('');
      setUsd('');
      setInfo(`Zapsáno: ${entries.map((e) => e.currency).join(', ')}.`);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
  };

  return (
    <div
      style={{
        background: RES.white,
        border: `1px solid ${RES.grayBlue}`,
        borderRadius: 4,
        padding: '18px 22px',
        marginTop: 12,
        maxWidth: 720,
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }}
    >
      <div style={{ fontSize: 13, color: RES.gray, lineHeight: 1.55 }}>
        Součty v Kč a pásma schvalování objednávek v EUR a USD se počítají kurzem <strong>ČNB (střed)</strong>.
        Aplikace ho z internetu sama stáhnout nemůže (ČNB to prohlížeči nepovoluje), proto se zapisuje sem.
        Stačí při změně, typicky jednou týdně; automatický denní zápis jde nastavit přes Power Automate.
      </div>

      {stale && (
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          {recent && recent.length === 0
            ? 'Zatím není zapsaný žádný kurz. Počítá se nouzovými kurzy ze záložky Schvalování.'
            : `Nejnovější zapsaný kurz je starší než týden (${table.date ? formatDate(table.date) : '—'}). Doplňte aktuální.`}
        </MessageBar>
      )}
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>
          {error}
        </MessageBar>
      )}
      {info && (
        <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setInfo(undefined)}>
          {info}
        </MessageBar>
      )}

      <div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Kurzy, se kterými se právě počítá</div>
        {!recent && <Spinner size={SpinnerSize.small} label="Načítám…" labelPosition="right" />}
        {recent && (
          <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: RES.gray }}>
                <th style={{ padding: '4px 16px 4px 0' }}>Měna</th>
                <th style={{ padding: '4px 16px 4px 0' }}>Kč za 1 jednotku</th>
                <th style={{ padding: '4px 16px 4px 0' }}>Platí pro den</th>
                <th style={{ padding: '4px 0' }}>Zdroj</th>
              </tr>
            </thead>
            <tbody>
              {(['EUR', 'USD'] as const).map((c) => (
                <tr key={c}>
                  <td style={{ padding: '3px 16px 3px 0', fontWeight: 600 }}>{c}</td>
                  <td style={{ padding: '3px 16px 3px 0' }}>{String(table[c]).replace('.', ',')}</td>
                  <td style={{ padding: '3px 16px 3px 0' }}>{latest[c] ? formatDate(latest[c]?.date) : '—'}</td>
                  <td style={{ padding: '3px 0', color: table.source[c] === 'nouzový' ? RES.amber : RES.text }}>
                    {table.source[c] === 'nouzový' ? 'nouzový kurz z Nastavení' : latest[c]?.source || 'zapsaný'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Zapsat nový kurz</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <DatePicker
            label="Platí pro den"
            value={date}
            onSelectDate={(d) => setDate(d ?? undefined)}
            formatDate={(d) => (d ? formatDate(d) : '')}
            strings={CS_CALENDAR_STRINGS}
            parseDateFromString={(t) => parseCzechDate(t) ?? null}
            allowTextInput
            styles={{ root: { width: 170 } }}
          />
          <TextField
            label="EUR (Kč)"
            placeholder="např. 24,415"
            value={eur}
            onChange={(_, v) => setEur(v ?? '')}
            styles={{ root: { width: 130 } }}
          />
          <TextField
            label="USD (Kč)"
            placeholder="např. 21,501"
            value={usd}
            onChange={(_, v) => setUsd(v ?? '')}
            styles={{ root: { width: 130 } }}
          />
          <PrimaryButton
            text={saving ? 'Zapisuji…' : 'Zapsat'}
            disabled={saving}
            onClick={() => save().catch(() => undefined)}
          />
        </div>
        <div style={{ fontSize: 12, color: RES.gray, marginTop: 6 }}>
          Kurzy najdete na cnb.cz → Finanční trhy → Devizový trh → Kurzy devizového trhu (denní kurzový lístek).
        </div>
      </div>

      {recent && recent.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Poslední zápisy</div>
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            {recent.map((r, i) => (
              <div key={i}>
                {formatDate(r.date)} · <strong>{r.currency}</strong> {String(r.rate).replace('.', ',')} Kč
                {r.source ? ` · ${r.source}` : ''}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
