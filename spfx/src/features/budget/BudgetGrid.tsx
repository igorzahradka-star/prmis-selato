/**
 * Tabulka realizačního rozpočtu: skupiny a v nich libovolně přidávané položky. U každé položky: popis, dodavatel, kategorie,
 * měna, množství, nákup (za jednotku a celkem), přirážka, prodej a marže. Výchozí je nákup; přirážka se dědí ze skupiny,
 * dá se přepsat ručně — nebo se rovnou zadá prodejní cena a přirážka se dopočte.
 *
 * Tabulka jen upravuje dokument v paměti (`onChange`); ukládání řeší záložka rozpočtu.
 */

import * as React from 'react';
import { ActionButton, IconButton } from '@fluentui/react/lib/Button';

import { RES } from '../../ui/theme';
import { ReportCurrency } from '../../ui/useReportCurrency';
import { CurrencyCode, CURRENCY_CODES } from '../../core/currency';
import { formatMoney } from '../../core/format';
import {
  BudgetDoc,
  BudgetGroup,
  BudgetItem,
  addItem,
  itemCost,
  itemMarkup,
  itemSale,
  marginPercent,
  newItem,
  removeItem,
  updateGroup,
  updateItem,
  withMarkup,
  withSale
} from '../../core/budget';
import { CELL_INPUT, NumInput } from './NumInput';

export const pct = (v: number): string => `${v.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} %`;

const TH: React.CSSProperties = { textAlign: 'left', fontWeight: 600, fontSize: 12, color: RES.gray, padding: '6px 4px', whiteSpace: 'nowrap' };
const TD: React.CSSProperties = { padding: '3px 3px', verticalAlign: 'middle' };

export interface BudgetGridProps {
  doc: BudgetDoc;
  onChange: (doc: BudgetDoc) => void;
  editable: boolean;
  categories: string[];
  report: ReportCurrency;
  onRemoveGroup: (group: BudgetGroup) => void;
}

export const BudgetGrid: React.FC<BudgetGridProps> = ({ doc, onChange, editable, categories, report, onRemoveGroup }) => {
  const [collapsed, setCollapsed] = React.useState<string[]>([]);
  const toggle = (id: string): void => setCollapsed((cur) => (cur.indexOf(id) === -1 ? [...cur, id] : cur.filter((x) => x !== id)));

  const setItem = (id: string, patch: Partial<BudgetItem>): void => onChange(updateItem(doc, id, patch));

  return (
    <div style={{ overflowX: 'auto', background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4 }}>
      <table style={{ width: '100%', minWidth: 1180, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 'auto' }} />
          <col style={{ width: 140 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 66 }} />
          <col style={{ width: 82 }} />
          <col style={{ width: 52 }} />
          <col style={{ width: 108 }} />
          <col style={{ width: 118 }} />
          <col style={{ width: 82 }} />
          <col style={{ width: 118 }} />
          <col style={{ width: 70 }} />
          <col style={{ width: 40 }} />
        </colgroup>
        <thead>
          <tr style={{ borderBottom: `1px solid ${RES.grayBlue}` }}>
            <th style={TH}>Popis položky</th>
            <th style={TH}>Dodavatel</th>
            <th style={TH}>Kategorie</th>
            <th style={TH}>Měna</th>
            <th style={{ ...TH, textAlign: 'right' }}>Množství</th>
            <th style={TH}>MJ</th>
            <th style={{ ...TH, textAlign: 'right' }}>Nákup / MJ</th>
            <th style={{ ...TH, textAlign: 'right' }}>Nákup celkem</th>
            <th style={{ ...TH, textAlign: 'right' }} title="Obchodní přirážka k nákupu: prodej = nákup × (1 + přirážka)">
              Přirážka %
            </th>
            <th style={{ ...TH, textAlign: 'right' }}>Prodej celkem</th>
            <th style={{ ...TH, textAlign: 'right' }} title="Podíl zisku na prodejní ceně">
              Marže %
            </th>
            <th style={TH} />
          </tr>
        </thead>
        <tbody>
          {doc.groups.map((group) => {
            const items = doc.items.filter((i) => i.groupId === group.id);
            const cost = items.reduce((s, i) => s + report.convert(itemCost(i), i.currency), 0);
            const sale = items.reduce((s, i) => s + report.convert(itemSale(i, group), i.currency), 0);
            const isCollapsed = collapsed.indexOf(group.id) !== -1;
            return (
              <React.Fragment key={group.id}>
                <tr style={{ background: RES.bluePale, borderTop: `1px solid ${RES.grayBlue}` }}>
                  <td colSpan={5} style={{ ...TD, padding: '5px 4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <IconButton
                        iconProps={{ iconName: isCollapsed ? 'ChevronRight' : 'ChevronDown' }}
                        ariaLabel={isCollapsed ? `Rozbalit skupinu ${group.name}` : `Sbalit skupinu ${group.name}`}
                        onClick={() => toggle(group.id)}
                        styles={{ root: { width: 24, height: 24 } }}
                      />
                      {editable ? (
                        <input
                          aria-label="Název skupiny"
                          value={group.name}
                          onChange={(e) => onChange(updateGroup(doc, group.id, { name: e.target.value }))}
                          style={{ ...CELL_INPUT, fontWeight: 600, maxWidth: 320, background: RES.white }}
                        />
                      ) : (
                        <strong>{group.name}</strong>
                      )}
                      <span style={{ color: RES.gray, fontSize: 12 }}>({items.length})</span>
                    </div>
                  </td>
                  <td colSpan={2} style={{ ...TD, textAlign: 'right', fontSize: 12, color: RES.gray }}>
                    výchozí přirážka skupiny
                  </td>
                  <td style={TD}>
                    <NumInput
                      value={group.defaultMarkupPercent}
                      ariaLabel={`Výchozí přirážka skupiny ${group.name}`}
                      disabled={!editable}
                      onCommit={(v) => onChange(updateGroup(doc, group.id, { defaultMarkupPercent: v ?? 0 }))}
                    />
                  </td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 600, fontSize: 13 }} title={`Nákup skupiny v ${report.label}`}>
                    {formatMoney(cost, report.currency)}
                  </td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 600, fontSize: 13 }} title={`Prodej skupiny v ${report.label}`}>
                    {formatMoney(sale, report.currency)}
                  </td>
                  <td style={{ ...TD, textAlign: 'right', fontSize: 12, color: RES.gray }}>{pct(marginPercent(cost, sale))}</td>
                  <td style={TD}>
                    {editable && (
                      <IconButton
                        iconProps={{ iconName: 'Delete' }}
                        title="Smazat skupinu i s položkami"
                        ariaLabel={`Smazat skupinu ${group.name}`}
                        onClick={() => onRemoveGroup(group)}
                        styles={{ root: { width: 28, height: 28 } }}
                      />
                    )}
                  </td>
                </tr>
                {!isCollapsed &&
                  items.map((item) => {
                    const markup = itemMarkup(item, group);
                    const inherited = item.markupPercent === undefined && item.salePriceOverride === undefined;
                    const c = itemCost(item);
                    const s = itemSale(item, group);
                    return (
                      <tr key={item.id} style={{ borderTop: `1px solid ${RES.background}` }}>
                        <td style={TD}>
                          <input
                            aria-label="Popis položky"
                            value={item.description}
                            disabled={!editable}
                            placeholder="Popis položky"
                            onChange={(e) => setItem(item.id, { description: e.target.value })}
                            style={{ ...CELL_INPUT, background: editable ? RES.white : RES.background }}
                          />
                        </td>
                        <td style={TD}>
                          <input
                            aria-label="Dodavatel"
                            value={item.supplier ?? ''}
                            disabled={!editable}
                            onChange={(e) => setItem(item.id, { supplier: e.target.value || undefined })}
                            style={{ ...CELL_INPUT, background: editable ? RES.white : RES.background }}
                          />
                        </td>
                        <td style={TD}>
                          <select
                            aria-label="Kategorie"
                            value={item.category ?? ''}
                            disabled={!editable}
                            onChange={(e) => setItem(item.id, { category: e.target.value || undefined })}
                            style={{ ...CELL_INPUT, background: editable ? RES.white : RES.background }}
                          >
                            <option value="">—</option>
                            {categories.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={TD}>
                          <select
                            aria-label="Měna"
                            value={item.currency}
                            disabled={!editable}
                            onChange={(e) => setItem(item.id, { currency: e.target.value as CurrencyCode })}
                            style={{ ...CELL_INPUT, background: editable ? RES.white : RES.background }}
                          >
                            {CURRENCY_CODES.map((cur) => (
                              <option key={cur} value={cur}>
                                {cur}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={TD}>
                          <NumInput value={item.quantity} ariaLabel="Množství" decimals={3} disabled={!editable} onCommit={(v) => setItem(item.id, { quantity: Math.max(0, v ?? 0) })} />
                        </td>
                        <td style={TD}>
                          <input
                            aria-label="Měrná jednotka"
                            value={item.unit ?? ''}
                            disabled={!editable}
                            onChange={(e) => setItem(item.id, { unit: e.target.value || undefined })}
                            style={{ ...CELL_INPUT, background: editable ? RES.white : RES.background }}
                          />
                        </td>
                        <td style={TD}>
                          <NumInput value={item.unitCost} ariaLabel="Nákup za jednotku" disabled={!editable} onCommit={(v) => setItem(item.id, { unitCost: Math.max(0, v ?? 0) })} />
                        </td>
                        <td style={{ ...TD, textAlign: 'right', fontSize: 13 }}>{formatMoney(c, item.currency)}</td>
                        <td style={TD}>
                          <NumInput
                            value={markup}
                            ariaLabel="Přirážka v procentech"
                            disabled={!editable}
                            inherited={inherited}
                            allowEmpty
                            placeholder={pct(group.defaultMarkupPercent)}
                            onCommit={(v) => onChange(updateItem(doc, item.id, v === undefined ? { markupPercent: undefined, salePriceOverride: undefined } : withMarkup(item, group, v)))}
                          />
                        </td>
                        <td style={TD}>
                          <NumInput
                            value={s}
                            ariaLabel="Prodej celkem"
                            disabled={!editable}
                            onCommit={(v) => onChange(updateItem(doc, item.id, withSale(item, group, v ?? 0)))}
                          />
                        </td>
                        <td style={{ ...TD, textAlign: 'right', fontSize: 13, color: marginPercent(c, s) < 0 ? RES.red : RES.text }}>{pct(marginPercent(c, s))}</td>
                        <td style={TD}>
                          {editable && (
                            <IconButton
                              iconProps={{ iconName: 'Delete' }}
                              title="Smazat položku"
                              ariaLabel={`Smazat položku ${item.description || ''}`}
                              onClick={() => onChange(removeItem(doc, item.id))}
                              styles={{ root: { width: 28, height: 28 } }}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                {!isCollapsed && editable && (
                  <tr>
                    <td colSpan={12} style={{ padding: '0 4px 4px' }}>
                      <ActionButton
                        iconProps={{ iconName: 'Add' }}
                        text="Přidat položku"
                        onClick={() => onChange(addItem(doc, newItem(group.id)))}
                        styles={{ root: { height: 26 } }}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
