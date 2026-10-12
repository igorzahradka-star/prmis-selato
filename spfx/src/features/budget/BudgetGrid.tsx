/**
 * Tabulka realizačního rozpočtu: skupiny a v nich libovolně přidávané položky.
 *
 *  - běžná skupina: popis, dodavatel, kategorie, měna, množství, MJ, nákup (za jednotku a celkem) = plán nákupu;
 *  - vlastní práce: profese a hodiny; nákladové sazby se berou ze sazeb projektu;
 *  - rezerva: částka, nebo % z nákupu ostatních položek.
 *
 * U všech: objednáno, prognóza (ruční, jinak plán), skutečnost (koupeno / odpracováno: množství a částka) a zbývá. Nabídka „⋯“ u položky: duplikovat, přesunout,
 * do kusovníku, objednat, smazat. Tabulka jen upravuje dokument v paměti (`onChange`); ukládání řeší záložka rozpočtu.
 */

import * as React from 'react';
import { ActionButton, IconButton } from '@fluentui/react/lib/Button';
import { IContextualMenuItem } from '@fluentui/react/lib/ContextualMenu';

import { RES } from '../../ui/theme';
import { ReportCurrency } from '../../ui/useReportCurrency';
import { CurrencyCode, CURRENCY_CODES, convertAmount } from '../../core/currency';
import { formatMoney } from '../../core/format';
import {
  BudgetDoc,
  BudgetGroup,
  BudgetItem,
  GROUP_KIND_LABELS,
  OrderLike,
  ItemCalc,
  addItem,
  calcItems,
  duplicateItem,
  moveItem,
  newItem,
  removeItem,
  updateGroup,
  updateItem
} from '../../core/budget';
import { itemHasPlan } from '../../core/budgetMargin';
import { Partner } from '../../core/types';
import { CELL_INPUT, NumInput } from './NumInput';
import { StickyHScroll } from '../../ui/components/StickyHScroll';
import { SupplierPicker } from './SupplierPicker';

export const pct = (v: number): string => `${v.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} %`;

const TH: React.CSSProperties = { textAlign: 'left', fontWeight: 600, fontSize: 12, color: RES.gray, padding: '6px 4px', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: RES.white, zIndex: 1, boxShadow: `0 1px 0 ${RES.grayBlue}` };
const TD: React.CSSProperties = { padding: '3px 3px', verticalAlign: 'middle' };
const R: React.CSSProperties = { ...TD, textAlign: 'right', fontSize: 13 };
const COLS = 16;

export interface BudgetGridProps {
  doc: BudgetDoc;
  onChange: (doc: BudgetDoc) => void;
  editable: boolean;
  /** Plán nákupu je uzamčený (po schválení): plánované množství a ceny nejdou měnit, prognóza a skutečnost ano. */
  planLocked?: boolean;
  categories: string[];
  report: ReportCurrency;
  onRemoveGroup: (group: BudgetGroup) => void;
  /** Uložení položky do společného kusovníku; bez něj je volba v nabídce vypnutá. */
  onSaveToCatalog?: (item: BudgetItem) => void;
  /** Objednávka z položky; bez ní je volba v nabídce vypnutá. */
  onOrder?: (item: BudgetItem) => void;
  /** Objednávky projektu (navázané na položky se počítají do „Objednáno“). */
  orders: OrderLike[];
  /** Partneři pro výběr dodavatele a založení nového. */
  partners: Partner[];
  onCreatePartner: (suggestedName: string, itemId: string) => void;
}

export const BudgetGrid: React.FC<BudgetGridProps> = ({ doc, onChange, editable, planLocked, categories, report, onRemoveGroup, onSaveToCatalog, onOrder, partners, onCreatePartner, orders }) => {
  const [collapsed, setCollapsed] = React.useState<string[]>([]);
  const toggle = (id: string): void => setCollapsed((cur) => (cur.indexOf(id) === -1 ? [...cur, id] : cur.filter((x) => x !== id)));
  const calcs = React.useMemo(() => calcItems(doc, report.rates, orders), [doc, report.rates, orders]);
  const calcOf = (id: string): ItemCalc => calcs.filter((c) => c.item.id === id)[0];
  const inReport = (amount: number, from: CurrencyCode): number => convertAmount(amount, from, report.currency, report.rates);

  const setItem = (id: string, patch: Partial<BudgetItem>): void => onChange(updateItem(doc, id, patch));
  const bg = editable ? RES.white : RES.background;
  /** Plánované hodnoty (množství, ceny, měna, profese, rezerva) smí PM měnit, dokud plán není uzamčený. */
  const planEditable = editable && !planLocked;

  const menuFor = (item: BudgetItem): IContextualMenuItem[] => [
    { key: 'dup', text: 'Duplikovat položku', iconProps: { iconName: 'Copy' }, disabled: !planEditable, title: planLocked ? 'Plán je uzamčený — duplikát by měl plán' : undefined, onClick: () => onChange(duplicateItem(doc, item.id)) },
    {
      key: 'move',
      text: 'Přesunout do skupiny',
      iconProps: { iconName: 'MoveToFolder' },
      disabled: !editable || doc.groups.length < 2,
      subMenuProps: {
        items: doc.groups
          .filter((g) => g.id !== item.groupId)
          .map((g) => ({ key: g.id, text: g.name, onClick: () => onChange(moveItem(doc, item.id, g.id)) }))
      }
    },
    { key: 'catalog', text: 'Uložit do kusovníku', iconProps: { iconName: 'Library' }, disabled: !onSaveToCatalog, title: onSaveToCatalog ? undefined : 'Připravujeme', onClick: () => onSaveToCatalog && onSaveToCatalog(item) },
    { key: 'order', text: 'Objednat', iconProps: { iconName: 'ShoppingCart' }, disabled: !onOrder || (doc.groups.filter((g) => g.id === item.groupId)[0] || { kind: 'standard' }).kind !== 'standard', title: onOrder ? 'Nová objednávka předvyplněná z položky' : 'Nemáte právo vystavovat objednávky', onClick: () => onOrder && onOrder(item) },
    { key: 'sep', itemType: 1 },
    { key: 'del', text: 'Smazat položku', iconProps: { iconName: 'Delete' }, disabled: !editable || (!!planLocked && itemHasPlan(doc, item)), title: planLocked && itemHasPlan(doc, item) ? 'Položka má plán — po schválení ji nejde smazat' : undefined, onClick: () => onChange(removeItem(doc, item.id)) }
  ];

  const rowMenu = (item: BudgetItem): JSX.Element => (
    <IconButton
      iconProps={{ iconName: 'More' }}
      title="Další funkce položky"
      ariaLabel={`Další funkce položky ${item.description || ''}`}
      menuIconProps={{ iconName: '' }}
      menuProps={{ items: menuFor(item) }}
      styles={{ root: { width: 28, height: 28 } }}
    />
  );

  const textInput = (label: string, value: string | undefined, onSet: (v: string) => void, placeholder?: string): JSX.Element => (
    <input aria-label={label} value={value ?? ''} disabled={!editable} placeholder={placeholder} onChange={(e) => onSet(e.target.value)} style={{ ...CELL_INPUT, background: bg }} />
  );

  /** Objednáno (z navázaných objednávek) a prognóza položky. */
  const planCells = (c: ItemCalc): JSX.Element => (
    <>
      <td style={{ ...R, color: c.ordered > c.cost ? RES.red : RES.text }} title={c.ordered > 0 ? 'Součet navázaných objednávek (bez DPH)' : 'Žádná navázaná objednávka'}>
        {c.ordered > 0 ? formatMoney(c.ordered, c.currency) : '—'}
      </td>
      <td style={TD}>
        <NumInput
          value={c.forecast}
          ariaLabel="Prognóza nákladů položky"
          disabled={!editable}
          inherited={c.item.forecastCost === undefined}
          allowEmpty
          placeholder="podle plánu"
          onCommit={(v) => setItem(c.item.id, { forecastCost: v === undefined ? undefined : Math.max(0, v) })}
        />
      </td>
    </>
  );

  const actualCells = (c: ItemCalc, qtyDecimals: number, onQty: (v: number | undefined) => void, onCost?: (v: number | undefined) => void): JSX.Element => (
    <>
      <td style={TD}>
        <NumInput value={c.item.actualQty} ariaLabel="Koupené množství" decimals={qtyDecimals} allowEmpty disabled={!editable} onCommit={onQty} />
      </td>
      <td style={TD}>
        {onCost ? (
          <NumInput value={c.item.actualCost} ariaLabel="Koupeno za (v měně položky)" allowEmpty disabled={!editable} onCommit={onCost} />
        ) : (
          <div style={{ ...R, color: RES.text }}>{formatMoney(c.actualCost, c.currency)}</div>
        )}
      </td>
      <td style={{ ...R, color: c.remainingQty < 0 ? RES.red : RES.text }} title="Zbývá koupit (množství)">
        {c.remainingQty.toLocaleString('cs-CZ', { maximumFractionDigits: 3 })}
      </td>
      <td style={{ ...R, color: c.remainingCost < 0 ? RES.red : RES.text }} title="Zbývá v rozpočtu (částka)">
        {formatMoney(c.remainingCost, c.currency)}
      </td>
    </>
  );

  return (
    // Vodorovný posuvník je zrcadlený a lepí se na dolní okraj okna (viz StickyHScroll); záhlaví sloupců zůstává nahoře.
    <StickyHScroll maxHeight="calc(100vh - 240px)">
      <table style={{ width: '100%', minWidth: 1620, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 'auto' }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 62 }} />
          <col style={{ width: 78 }} />
          <col style={{ width: 48 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 112 }} />
          <col style={{ width: 80 }} />
          <col style={{ width: 106 }} />
          <col style={{ width: 106 }} />
          <col style={{ width: 80 }} />
          <col style={{ width: 106 }} />
          <col style={{ width: 80 }} />
          <col style={{ width: 106 }} />
          <col style={{ width: 36 }} />
        </colgroup>
        <thead>
          <tr style={{ borderBottom: `1px solid ${RES.grayBlue}` }}>
            <th style={TH}>Popis položky</th>
            <th style={TH}>Dodavatel / profese</th>
            <th style={TH}>Kategorie</th>
            <th style={TH}>Měna</th>
            <th style={{ ...TH, textAlign: 'right' }}>Množství</th>
            <th style={TH}>MJ</th>
            <th style={{ ...TH, textAlign: 'right' }}>Nákup / MJ</th>
            <th style={{ ...TH, textAlign: 'right' }}>Nákup celkem</th>
            <th style={{ ...TH, textAlign: 'right' }} title="Jen u rezervy: velikost v % z nákupu ostatních položek (jinak se zadává částkou).">
              Rezerva %
            </th>
            <th style={{ ...TH, textAlign: 'right' }} title="Součet objednávek navázaných na položku (stavy, které se počítají jako vystavené)">
              Objednáno
            </th>
            <th style={{ ...TH, textAlign: 'right' }} title="Prognóza nákladů položky: ruční, jinak plán; nikdy méně než objednáno a koupeno">
              Prognóza
            </th>
            <th style={{ ...TH, textAlign: 'right', background: RES.bluePale }} title="Skutečnost: koupené množství (u práce odpracované hodiny)">
              Koupeno ks
            </th>
            <th style={{ ...TH, textAlign: 'right', background: RES.bluePale }} title="Skutečnost: za kolik se koupilo">
              Koupeno za
            </th>
            <th style={{ ...TH, textAlign: 'right' }}>Zbývá ks</th>
            <th style={{ ...TH, textAlign: 'right' }}>Zbývá částka</th>
            <th style={TH} />
          </tr>
        </thead>
        <tbody>
          {doc.groups.map((group) => {
            const gItems = doc.items.filter((i) => i.groupId === group.id);
            const gCalcs = gItems.map((i) => calcOf(i.id)).filter((c) => !!c);
            const cost = gCalcs.reduce((s, c) => s + inReport(c.cost, c.currency), 0);
            const actual = gCalcs.reduce((s, c) => s + inReport(c.actualCost, c.currency), 0);
            const gOrdered = gCalcs.reduce((s, c) => s + inReport(c.ordered, c.currency), 0);
            const gForecast = gCalcs.reduce((s, c) => s + inReport(c.forecast, c.currency), 0);
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
                          style={{ ...CELL_INPUT, fontWeight: 600, maxWidth: 300, background: RES.white }}
                        />
                      ) : (
                        <strong>{group.name}</strong>
                      )}
                      <span style={{ color: RES.gray, fontSize: 12 }}>
                        ({gItems.length}) · {GROUP_KIND_LABELS[group.kind]}
                      </span>
                    </div>
                  </td>
                  <td colSpan={2} />
                  <td style={{ ...R, fontWeight: 600 }} title={`Plán nákupu skupiny v ${report.label}`}>
                    {formatMoney(cost, report.currency)}
                  </td>
                  <td />
                  <td style={{ ...R, fontWeight: 600 }} title={`Objednáno ve skupině v ${report.label}`}>
                    {formatMoney(gOrdered, report.currency)}
                  </td>
                  <td style={{ ...R, fontWeight: 600 }} title={`Prognóza skupiny v ${report.label}`}>
                    {formatMoney(gForecast, report.currency)}
                  </td>
                  <td />
                  <td style={{ ...R, fontWeight: 600 }} title={`Skutečnost skupiny v ${report.label}`}>
                    {formatMoney(actual, report.currency)}
                  </td>
                  <td />
                  <td style={{ ...R, fontWeight: 600 }} title={`Zbývá ve skupině v ${report.label}`}>
                    {formatMoney(cost - actual, report.currency)}
                  </td>
                  <td style={TD}>
                    {editable && (
                      <IconButton
                        iconProps={{ iconName: 'Delete' }}
                        title="Smazat skupinu i s položkami"
                        ariaLabel={`Smazat skupinu ${group.name}`}
                        disabled={!!planLocked && gItems.some((i) => itemHasPlan(doc, i))}
                        onClick={() => onRemoveGroup(group)}
                        styles={{ root: { width: 28, height: 28 } }}
                      />
                    )}
                  </td>
                </tr>
                {!isCollapsed &&
                  gItems.map((item) => {
                    const c = calcOf(item.id);
                    if (!c) {
                      return null;
                    }
                    return (
                      <tr key={item.id} style={{ borderTop: `1px solid ${RES.background}` }}>
                        <td style={TD}>{textInput('Popis položky', item.description, (v) => setItem(item.id, { description: v }), group.kind === 'prace' ? 'Co se dělá (nepovinné)' : 'Popis položky')}</td>

                        {group.kind === 'prace' ? (
                          <>
                            <td style={TD}>
                              <select
                                aria-label="Profese"
                                value={item.rateId ?? ''}
                                disabled={!planEditable}
                                onChange={(e) => setItem(item.id, { rateId: e.target.value || undefined })}
                                style={{ ...CELL_INPUT, background: bg }}
                              >
                                <option value="">— profese —</option>
                                {doc.rates.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={TD} />
                            <td style={{ ...TD, fontSize: 13 }}>CZK</td>
                            <td style={TD}>
                              <NumInput value={item.quantity} ariaLabel="Plánované hodiny" decimals={2} disabled={!planEditable} onCommit={(v) => setItem(item.id, { quantity: Math.max(0, v ?? 0) })} />
                            </td>
                            <td style={{ ...TD, fontSize: 13 }}>h</td>
                            <td style={{ ...R, color: RES.gray }}>{item.quantity > 0 ? formatMoney(c.cost / item.quantity, 'CZK') : '—'}</td>
                            <td style={R}>{formatMoney(c.cost, c.currency)}</td>
                            <td style={TD} />
                            {planCells(c)}
                            {actualCells(c, 2, (v) => setItem(item.id, { actualQty: v === undefined ? undefined : Math.max(0, v) }))}
                          </>
                        ) : group.kind === 'rezerva' ? (
                          <>
                            <td style={TD} />
                            <td style={TD}>
                              <select aria-label="Kategorie" value={item.category ?? ''} disabled={!editable} onChange={(e) => setItem(item.id, { category: e.target.value || undefined })} style={{ ...CELL_INPUT, background: bg }}>
                                <option value="">—</option>
                                {categories.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={{ ...TD, fontSize: 13 }}>{c.currency}</td>
                            <td style={TD}>
                              <NumInput value={item.quantity} ariaLabel="Množství" decimals={3} disabled={!planEditable || item.reservePercent !== undefined} onCommit={(v) => setItem(item.id, { quantity: Math.max(0, v ?? 0) })} />
                            </td>
                            <td style={TD}>{textInput('Měrná jednotka', item.unit, (v) => setItem(item.id, { unit: v || undefined }))}</td>
                            <td style={TD}>
                              <NumInput value={item.unitCost} ariaLabel="Částka rezervy za jednotku" disabled={!planEditable || item.reservePercent !== undefined} onCommit={(v) => setItem(item.id, { unitCost: Math.max(0, v ?? 0) })} />
                            </td>
                            <td style={R}>{formatMoney(c.cost, c.currency)}</td>
                            <td style={TD}>
                              <NumInput
                                value={item.reservePercent}
                                ariaLabel="Rezerva v procentech z nákupu ostatních položek"
                                placeholder="% z nákupu"
                                allowEmpty
                                disabled={!planEditable}
                                onCommit={(v) => setItem(item.id, v === undefined ? { reservePercent: undefined } : { reservePercent: Math.min(100, Math.max(0, v)), currency: 'CZK' })}
                              />
                            </td>
                            {planCells(c)}
                            {actualCells(c, 3, (v) => setItem(item.id, { actualQty: v === undefined ? undefined : Math.max(0, v) }), (v) => setItem(item.id, { actualCost: v === undefined ? undefined : Math.max(0, v) }))}
                          </>
                        ) : (
                          <>
                            <td style={TD}>
                              <SupplierPicker value={item.supplier} partners={partners} disabled={!editable} onChange={(name) => setItem(item.id, { supplier: name })} onCreate={(text) => onCreatePartner(text, item.id)} />
                            </td>
                            <td style={TD}>
                              <select aria-label="Kategorie" value={item.category ?? ''} disabled={!editable} onChange={(e) => setItem(item.id, { category: e.target.value || undefined })} style={{ ...CELL_INPUT, background: bg }}>
                                <option value="">—</option>
                                {categories.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={TD}>
                              <select aria-label="Měna" value={item.currency} disabled={!planEditable} onChange={(e) => setItem(item.id, { currency: e.target.value as CurrencyCode })} style={{ ...CELL_INPUT, background: bg }}>
                                {CURRENCY_CODES.map((cur) => (
                                  <option key={cur} value={cur}>
                                    {cur}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={TD}>
                              <NumInput value={item.quantity} ariaLabel="Množství" decimals={3} disabled={!planEditable} onCommit={(v) => setItem(item.id, { quantity: Math.max(0, v ?? 0) })} />
                            </td>
                            <td style={TD}>{textInput('Měrná jednotka', item.unit, (v) => setItem(item.id, { unit: v || undefined }))}</td>
                            <td style={TD}>
                              <NumInput value={item.unitCost} ariaLabel="Nákup za jednotku" disabled={!planEditable} onCommit={(v) => setItem(item.id, { unitCost: Math.max(0, v ?? 0) })} />
                            </td>
                            <td style={R}>{formatMoney(c.cost, c.currency)}</td>
                            <td style={TD} />
                            {planCells(c)}
                            {actualCells(c, 3, (v) => setItem(item.id, { actualQty: v === undefined ? undefined : Math.max(0, v) }), (v) => setItem(item.id, { actualCost: v === undefined ? undefined : Math.max(0, v) }))}
                          </>
                        )}
                        <td style={TD}>{rowMenu(item)}</td>
                      </tr>
                    );
                  })}
                {!isCollapsed && editable && (
                  <tr>
                    <td colSpan={COLS} style={{ padding: '0 4px 4px' }}>
                      <ActionButton
                        iconProps={{ iconName: 'Add' }}
                        text={group.kind === 'prace' ? 'Přidat práci' : 'Přidat položku'}
                        title={planLocked ? 'Plán je uzamčený — nová položka vznikne s plánem 0 (vyplňte prognózu)' : undefined}
                        onClick={() => onChange(addItem(doc, newItem(group, doc.rates, 'CZK', planLocked ? 0 : 1)))}
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
    </StickyHScroll>
  );
};
