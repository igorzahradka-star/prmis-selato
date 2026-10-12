/**
 * Výnosy realizačního rozpočtu: řádky smluvních tržeb (smluvní cena, dodatky, vícepráce). Každý řádek má plán, prognózu
 * (bez ní platí plán) a vyfakturováno (zatím ručně). Součet plánu je smluvní cena projektu, vždy bez DPH.
 *
 * Plán je po schválení uzamčený (`planLocked`); prognózu a vyfakturováno smí projektový manažer měnit vždy.
 */

import * as React from 'react';
import { ActionButton, IconButton } from '@fluentui/react/lib/Button';

import { RES } from '../../ui/theme';
import { ReportCurrency } from '../../ui/useReportCurrency';
import { CURRENCY_CODES, CurrencyCode, convertAmount } from '../../core/currency';
import { formatMoney } from '../../core/format';
import { BudgetDoc, RevenueLine, newRevenueLine, revenueForecast } from '../../core/budget';
import { CELL_INPUT, NumInput } from './NumInput';
import { StickyHScroll } from '../../ui/components/StickyHScroll';

const TH: React.CSSProperties = { textAlign: 'left', fontWeight: 600, fontSize: 12, color: RES.gray, padding: '6px 4px', whiteSpace: 'nowrap' };
const TD: React.CSSProperties = { padding: '3px 3px', verticalAlign: 'middle' };
const R: React.CSSProperties = { ...TD, textAlign: 'right', fontSize: 13 };

export const RevenueTable: React.FC<{
  doc: BudgetDoc;
  onChange: (doc: BudgetDoc) => void;
  editable: boolean;
  planLocked: boolean;
  report: ReportCurrency;
  defaultCurrency: CurrencyCode;
  onImport?: () => void;
}> = ({ doc, onChange, editable, planLocked, report, defaultCurrency, onImport }) => {
  const lines = doc.revenues ?? [];
  const planEditable = editable && !planLocked;
  const bg = editable ? RES.white : RES.background;
  const set = (id: string, patch: Partial<RevenueLine>): void => onChange({ ...doc, revenues: lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const inReport = (amount: number, from: CurrencyCode): number => convertAmount(amount, from, report.currency, report.rates);
  const sum = (pick: (l: RevenueLine) => number): number => lines.reduce((s, l) => s + inReport(pick(l), l.currency), 0);

  return (
    <div style={{ marginTop: 14 }}>
      <h3 style={{ margin: '0 0 4px', color: RES.navy, fontSize: 15 }}>Výnosy (smluvní tržby)</h3>
      <div style={{ fontSize: 12, color: RES.gray, marginBottom: 6 }}>
        Součet plánu je <strong>smluvní cena projektu</strong> (bez DPH). Dodatek nebo vícepráci přidejte jako další řádek (např. „Dodatek č. 1“). Prognóza tržeb: když nic nezadáte, platí plán.
        Vyfakturováno zatím zapisujete ručně.
        {planLocked && ' Plán je po schválení uzamčený — odemkněte ho tlačítkem „Odemknout plán“, pokud se smluvní cena mění; po úpravě se rozpočet schvaluje znovu.'}
      </div>
      <StickyHScroll>
        <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', tableLayout: 'fixed', background: RES.white }}>
          <colgroup>
            <col style={{ width: 'auto' }} />
            <col style={{ width: 74 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 36 }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: `1px solid ${RES.grayBlue}` }}>
              <th style={TH}>Popis výnosu</th>
              <th style={TH}>Měna</th>
              <th style={{ ...TH, textAlign: 'right' }}>Plán (smluvní)</th>
              <th style={{ ...TH, textAlign: 'right' }}>Prognóza</th>
              <th style={{ ...TH, textAlign: 'right', background: RES.bluePale }} title="Kolik už je vyfakturováno (bez DPH)">
                Vyfakturováno
              </th>
              <th style={{ ...TH, textAlign: 'right' }} title="Prognóza tržeb − vyfakturováno">
                Zbývá vyfakturovat
              </th>
              <th style={TH} />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const forecast = revenueForecast(l);
              const left = forecast - (l.invoiced ?? 0);
              return (
                <tr key={l.id} style={{ borderTop: `1px solid ${RES.background}` }}>
                  <td style={TD}>
                    <input aria-label="Popis výnosu" value={l.description} disabled={!editable} placeholder="např. Smluvní cena, Dodatek č. 1, Vícepráce" onChange={(e) => set(l.id, { description: e.target.value })} style={{ ...CELL_INPUT, background: bg }} />
                  </td>
                  <td style={TD}>
                    <select aria-label="Měna výnosu" value={l.currency} disabled={!planEditable} onChange={(e) => set(l.id, { currency: e.target.value as CurrencyCode })} style={{ ...CELL_INPUT, background: bg }}>
                      {CURRENCY_CODES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={TD}>
                    <NumInput value={l.plan} ariaLabel="Plán výnosu" disabled={!planEditable} onCommit={(v) => set(l.id, { plan: Math.max(0, v ?? 0) })} />
                  </td>
                  <td style={TD}>
                    <NumInput value={forecast} ariaLabel="Prognóza výnosu" disabled={!editable} inherited={l.forecast === undefined} allowEmpty placeholder="podle plánu" onCommit={(v) => set(l.id, { forecast: v === undefined ? undefined : Math.max(0, v) })} />
                  </td>
                  <td style={TD}>
                    <NumInput value={l.invoiced} ariaLabel="Vyfakturováno" allowEmpty disabled={!editable} onCommit={(v) => set(l.id, { invoiced: v === undefined ? undefined : Math.max(0, v) })} />
                  </td>
                  <td style={{ ...R, color: left < 0 ? RES.red : RES.text }}>{formatMoney(left, l.currency)}</td>
                  <td style={TD}>
                    {editable && (
                      <IconButton
                        iconProps={{ iconName: 'Delete' }}
                        title={planLocked && l.plan !== 0 ? 'Výnos má plán — po schválení ho nejde smazat' : 'Smazat výnos'}
                        ariaLabel="Smazat výnos"
                        disabled={planLocked && l.plan !== 0}
                        onClick={() => onChange({ ...doc, revenues: lines.filter((x) => x.id !== l.id) })}
                        styles={{ root: { width: 28, height: 28 } }}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 10, fontSize: 13, color: RES.red }}>
                  Rozpočet zatím nemá žádný výnos — bez něj nejde spočítat marži. Přidejte smluvní cenu.
                </td>
              </tr>
            )}
            {lines.length > 0 && (
              <tr style={{ borderTop: `1px solid ${RES.grayBlue}`, fontWeight: 600 }}>
                <td style={{ ...TD, paddingLeft: 6 }}>Celkem ({report.label})</td>
                <td />
                <td style={R} title="Smluvní cena projektu">
                  {formatMoney(sum((l) => l.plan), report.currency)}
                </td>
                <td style={R}>{formatMoney(sum((l) => revenueForecast(l)), report.currency)}</td>
                <td style={R}>{formatMoney(sum((l) => l.invoiced ?? 0), report.currency)}</td>
                <td style={R}>{formatMoney(sum((l) => revenueForecast(l) - (l.invoiced ?? 0)), report.currency)}</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </StickyHScroll>
      {editable && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <ActionButton
            iconProps={{ iconName: 'Add' }}
            text="Přidat výnos (dodatek, vícepráce…)"
            disabled={planLocked}
            title={planLocked ? 'Plán je uzamčený — odemkněte ho, změna smluvní ceny se schvaluje znovu' : undefined}
            onClick={() => onChange({ ...doc, revenues: [...lines, newRevenueLine(defaultCurrency)] })}
          />
          {onImport && <ActionButton iconProps={{ iconName: 'Paste' }} text="Vložit výnosy z Excelu" disabled={planLocked} onClick={onImport} />}
        </div>
      )}
    </div>
  );
};
