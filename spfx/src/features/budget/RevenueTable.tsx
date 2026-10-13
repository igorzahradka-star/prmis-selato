/**
 * Výnosy realizačního rozpočtu: řádky smluvních tržeb (smluvní cena, dodatky, vícepráce). Každý řádek má plán, prognózu
 * (bez ní platí plán) a vyfakturováno (zatím ručně). Součet plánu je smluvní cena projektu, vždy bez DPH.
 *
 * Výnosy se upravují i po schválení rozpočtu (rozpis fakturace se upřesňuje v průběhu realizace); zamčená je jen výchozí
 * marže zafixovaná ve schválení.
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
import { useColumnWidths } from '../../ui/components/useColumnWidths';

const TH: React.CSSProperties = { textAlign: 'left', fontWeight: 600, fontSize: 12, color: RES.gray, padding: '6px 4px', whiteSpace: 'nowrap', position: 'relative' };
const TD: React.CSSProperties = { padding: '3px 3px', verticalAlign: 'middle' };
const R: React.CSSProperties = { ...TD, textAlign: 'right', fontSize: 13 };

export const RevenueTable: React.FC<{
  doc: BudgetDoc;
  onChange: (doc: BudgetDoc) => void;
  editable: boolean;
  report: ReportCurrency;
  defaultCurrency: CurrencyCode;
  onImport?: () => void;
}> = ({ doc, onChange, editable, report, defaultCurrency, onImport }) => {
  const lines = doc.revenues ?? [];
  const cw = useColumnWidths('budget-revenue', [340, 74, 130, 130, 130, 130, 36], [6]);
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
        Po schválení rozpočtu lze výnosy dál přidávat a upravovat (např. upřesnění fakturace); marže zafixovaná při schválení zůstává v historii schválení.
      </div>
      <StickyHScroll>
        <table style={{ width: cw.total, borderCollapse: 'collapse', tableLayout: 'fixed', background: RES.white }}>
          {cw.cols}
          <thead>
            <tr style={{ borderBottom: `1px solid ${RES.grayBlue}` }}>
              <th style={TH}>
                Popis výnosu{cw.grip(0)}
              </th>
              <th style={TH}>
                Měna{cw.grip(1)}
              </th>
              <th style={{ ...TH, textAlign: 'right' }}>
                Plán (smluvní){cw.grip(2)}
              </th>
              <th style={{ ...TH, textAlign: 'right' }}>
                Prognóza{cw.grip(3)}
              </th>
              <th style={{ ...TH, textAlign: 'right', background: RES.bluePale }} title="Kolik už je vyfakturováno (bez DPH)">
                Vyfakturováno{cw.grip(4)}
              </th>
              <th style={{ ...TH, textAlign: 'right' }} title="Prognóza tržeb − vyfakturováno">
                Zbývá vyfakturovat{cw.grip(5)}
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
                    <select aria-label="Měna výnosu" value={l.currency} disabled={!editable} onChange={(e) => set(l.id, { currency: e.target.value as CurrencyCode })} style={{ ...CELL_INPUT, background: bg }}>
                      {CURRENCY_CODES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={TD}>
                    <NumInput value={l.plan} ariaLabel="Plán výnosu" disabled={!editable} onCommit={(v) => set(l.id, { plan: Math.max(0, v ?? 0) })} />
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
                        title="Smazat výnos"
                        ariaLabel="Smazat výnos"
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
            onClick={() => onChange({ ...doc, revenues: [...lines, newRevenueLine(defaultCurrency)] })}
          />
          {onImport && <ActionButton iconProps={{ iconName: 'Paste' }} text="Vložit výnosy z Excelu" onClick={onImport} />}
        </div>
      )}
    </div>
  );
};
