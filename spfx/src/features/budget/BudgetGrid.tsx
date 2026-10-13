/**
 * Tabulka nákupu realizačního rozpočtu: skupiny a v nich libovolně přidávané položky. V projektu se řeší jen **celkové částky**
 * (počty kusů, MJ a ceny za MJ patří do nabídkového nástroje RES CRM; ve starých datech zůstávají uložené a nemění se).
 *
 *  - běžná skupina: popis, dodavatel, kategorie, měna, **plán nákupu** (celkem);
 *  - vlastní práce: profese a plán celkem (hodiny se dopočtou z nákladové sazby profese);
 *  - rezerva: samostatná tabulka s vlastním pořadím sloupců — procento z nákupu ostatních položek, nebo částka.
 *
 * U všech: objednáno, prognóza (ruční, jinak plán), nakoupeno (částka) a zbývá nakoupit. Nabídka „⋯“ u položky: duplikovat,
 * přesunout, objednat, smazat. Tabulka jen upravuje dokument v paměti (`onChange`); ukládání řeší záložka rozpočtu.
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
  findRate,
  moveItem,
  newItem,
  removeItem,
  updateGroup,
  updateItem,
  withLabourActual,
  withLabourTotal,
  withPlanTotal
} from '../../core/budget';
import { itemHasPlan } from '../../core/budgetMargin';
import { Partner } from '../../core/types';
import { CELL_INPUT, NumInput } from './NumInput';
import { StickyHScroll } from '../../ui/components/StickyHScroll';
import { useColumnWidths } from '../../ui/components/useColumnWidths';
import { SupplierPicker } from './SupplierPicker';

export const pct = (v: number): string => `${v.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} %`;

const TH: React.CSSProperties = { textAlign: 'left', fontWeight: 600, fontSize: 12, color: RES.gray, padding: '6px 4px', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: RES.white, zIndex: 1, boxShadow: `0 1px 0 ${RES.grayBlue}` };
const TD: React.CSSProperties = { padding: '3px 3px', verticalAlign: 'middle' };
const R: React.CSSProperties = { ...TD, textAlign: 'right', fontSize: 13 };
const COLS = 10;
const RESERVE_COLS = 8;

export interface BudgetGridProps {
  doc: BudgetDoc;
  onChange: (doc: BudgetDoc) => void;
  editable: boolean;
  /** Plán nákupu je uzamčený (po schválení): plánované částky nejdou měnit, prognóza a skutečnost ano. */
  planLocked?: boolean;
  categories: string[];
  report: ReportCurrency;
  onRemoveGroup: (group: BudgetGroup) => void;
  /** Objednávka z položky; bez ní je volba v nabídce vypnutá. */
  onOrder?: (item: BudgetItem) => void;
  /** Objednávky projektu (navázané na položky se počítají do „Objednáno“). */
  orders: OrderLike[];
  /** Partneři pro výběr dodavatele a založení nového. */
  partners: Partner[];
  onCreatePartner: (suggestedName: string, itemId: string) => void;
  /** Otevře doklady z účetnictví přiřazené položce; bez něj se tlačítko „Doklady“ neukazuje. */
  onOpenDocs?: (itemId: string) => void;
}

export const BudgetGrid: React.FC<BudgetGridProps> = ({ doc, onChange, editable, planLocked, categories, report, onRemoveGroup, onOrder, partners, onCreatePartner, orders, onOpenDocs }) => {
  const [collapsed, setCollapsed] = React.useState<string[]>([]);
  const toggle = (id: string): void => setCollapsed((cur) => (cur.indexOf(id) === -1 ? [...cur, id] : cur.filter((x) => x !== id)));
  const calcs = React.useMemo(() => calcItems(doc, report.rates, orders), [doc, report.rates, orders]);
  const calcOf = (id: string): ItemCalc => calcs.filter((c) => c.item.id === id)[0];
  const inReport = (amount: number, from: CurrencyCode): number => convertAmount(amount, from, report.currency, report.rates);

  const mainGroups = doc.groups.filter((g) => g.kind !== 'rezerva');
  const reserveGroups = doc.groups.filter((g) => g.kind === 'rezerva');

  const setItem = (id: string, patch: Partial<BudgetItem>): void => onChange(updateItem(doc, id, patch));
  const setWhole = (item: BudgetItem): void => onChange({ ...doc, items: doc.items.map((i) => (i.id === item.id ? item : i)) });
  const bg = editable ? RES.white : RES.background;
  // Šířky sloupců si uživatel mění tažením záhlaví (pamatují se v prohlížeči); Popis je ve výchozím stavu nejširší.
  const mainCols = useColumnWidths('budget-main', [340, 170, 130, 66, 130, 120, 130, 130, 120, 36], [9]);
  const resCols = useColumnWidths('budget-reserve', [340, 110, 66, 130, 130, 130, 130, 36], [7]);
  /** Plánované hodnoty (částky, měna, profese, rezerva) smí PM měnit, dokud plán není uzamčený. */
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
          ariaLabel="Prognóza nákupu položky"
          disabled={!editable}
          inherited={c.item.forecastCost === undefined}
          allowEmpty
          placeholder="podle plánu"
          onCommit={(v) => setItem(c.item.id, { forecastCost: v === undefined ? undefined : Math.max(0, v) })}
        />
      </td>
    </>
  );

  /** Nakoupeno (částka) a zbývá nakoupit. U práce se částka dopočítává z odpracovaných hodin a zapisuje přes sazbu profese. */
  const actualCells = (c: ItemCalc, onCost: (v: number | undefined) => void, valueOverride?: number): JSX.Element => (
    <>
      <td style={TD} title={c.docBacked ? 'Součet přiřazených dokladů z účetnictví (ručně se nemění)' : undefined}>
        <NumInput
          value={c.docBacked ? c.actualCost : valueOverride !== undefined ? valueOverride : c.item.actualCost}
          ariaLabel="Nakoupeno (částka)"
          allowEmpty
          disabled={!editable || c.docBacked}
          onCommit={onCost}
        />
        {onOpenDocs && !(c.group && c.group.kind === 'prace') && (
          <button
            type="button"
            onClick={() => onOpenDocs(c.item.id)}
            title="Doklady z účetnictví přiřazené této položce"
            style={{ border: 'none', background: 'none', padding: '2px 4px', cursor: 'pointer', fontSize: 12, color: c.docBacked ? RES.navy : RES.gray, textDecoration: 'underline' }}
          >
            {c.docBacked ? `Doklady (${c.docCount})` : 'Doklady'}
          </button>
        )}
      </td>
      <td style={{ ...R, color: c.remainingCost < 0 ? RES.red : RES.text }} title="Zbývá nakoupit: plán − nakoupeno (záporné = překročeno)">
        {formatMoney(c.remainingCost, c.currency)}
      </td>
    </>
  );

  /** Samostatná tabulka rezerv: popis, % z nákupu, měna, plán, prognóza, nakoupeno, zbývá (jiné pořadí sloupců než u nákupu). */
  const reserveTable = (): JSX.Element => (
    <div style={{ marginTop: 14 }}>
      <h3 style={{ margin: '0 0 4px', color: RES.navy, fontSize: 15 }}>Rezerva</h3>
      <div style={{ fontSize: 12, color: RES.gray, marginBottom: 6 }}>
        Rezervu zadejte <strong>procentem z nákupu ostatních položek</strong> (sleduje změny rozpočtu), nebo pevnou <strong>částkou</strong> (pak procento nechte prázdné).
      </div>
      <StickyHScroll>
        <table style={{ width: resCols.total, borderCollapse: 'collapse', tableLayout: 'fixed', background: RES.white }}>
          {resCols.cols}
          <thead>
            <tr style={{ borderBottom: `1px solid ${RES.grayBlue}` }}>
              <th style={TH}>
                Popis rezervy{resCols.grip(0)}
              </th>
              <th style={{ ...TH, textAlign: 'right' }} title="Velikost rezervy v % z nákupu ostatních položek rozpočtu. Prázdné = pevná částka.">
                % z nákupu{resCols.grip(1)}
              </th>
              <th style={TH}>
                Měna{resCols.grip(2)}
              </th>
              <th style={{ ...TH, textAlign: 'right' }} title="Plán rezervy: z procenta, nebo zadaná částka">
                Rezerva – plán{resCols.grip(3)}
              </th>
              <th style={{ ...TH, textAlign: 'right' }} title="Prognóza rezervy: ruční, jinak plán">
                Rezerva – prognóza{resCols.grip(4)}
              </th>
              <th style={{ ...TH, textAlign: 'right', background: RES.bluePale }} title="Kolik z rezervy už bylo čerpáno (nakoupeno)">
                Čerpáno{resCols.grip(5)}
              </th>
              <th style={{ ...TH, textAlign: 'right' }} title="Plán rezervy − čerpáno">
                Zbývá{resCols.grip(6)}
              </th>
              <th style={TH} />
            </tr>
          </thead>
          <tbody>
            {reserveGroups.map((group) => {
              const gItems = doc.items.filter((i) => i.groupId === group.id);
              return (
                <React.Fragment key={group.id}>
                  <tr style={{ background: RES.bluePale, borderTop: `1px solid ${RES.grayBlue}` }}>
                    <td colSpan={RESERVE_COLS - 1} style={{ ...TD, padding: '5px 4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {editable ? (
                          <input aria-label="Název skupiny" value={group.name} onChange={(e) => onChange(updateGroup(doc, group.id, { name: e.target.value }))} style={{ ...CELL_INPUT, fontWeight: 600, maxWidth: 300, background: RES.white }} />
                        ) : (
                          <strong>{group.name}</strong>
                        )}
                        <span style={{ color: RES.gray, fontSize: 12 }}>({gItems.length}) · {GROUP_KIND_LABELS[group.kind]}</span>
                      </div>
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
                  {gItems.map((item) => {
                    const c = calcOf(item.id);
                    if (!c) {
                      return null;
                    }
                    return (
                      <tr key={item.id} style={{ borderTop: `1px solid ${RES.background}` }}>
                        <td style={TD}>{textInput('Popis rezervy', item.description, (v) => setItem(item.id, { description: v }), 'Popis rezervy')}</td>
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
                        <td style={{ ...TD, fontSize: 13 }}>
                          {item.reservePercent !== undefined ? (
                            'CZK'
                          ) : (
                            <select aria-label="Měna rezervy" value={item.currency} disabled={!planEditable} onChange={(e) => setItem(item.id, { currency: e.target.value as CurrencyCode })} style={{ ...CELL_INPUT, background: bg }}>
                              {CURRENCY_CODES.map((cur) => (
                                <option key={cur} value={cur}>
                                  {cur}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td style={TD}>
                          <NumInput value={c.cost} ariaLabel="Rezerva – částka" disabled={!planEditable || item.reservePercent !== undefined} onCommit={(v) => setWhole(withPlanTotal(item, v ?? 0))} />
                        </td>
                        <td style={TD}>
                          <NumInput value={c.forecast} ariaLabel="Prognóza rezervy" disabled={!editable} inherited={item.forecastCost === undefined} allowEmpty placeholder="podle plánu" onCommit={(v) => setItem(item.id, { forecastCost: v === undefined ? undefined : Math.max(0, v) })} />
                        </td>
                        <td style={TD}>
                          <NumInput value={item.actualCost} ariaLabel="Rezerva – čerpáno" allowEmpty disabled={!editable} onCommit={(v) => setItem(item.id, { actualCost: v === undefined ? undefined : Math.max(0, v) })} />
                        </td>
                        <td style={{ ...R, color: c.remainingCost < 0 ? RES.red : RES.text }}>{formatMoney(c.remainingCost, c.currency)}</td>
                        <td style={TD}>{rowMenu(item)}</td>
                      </tr>
                    );
                  })}
                  {editable && (
                    <tr>
                      <td colSpan={RESERVE_COLS} style={{ padding: '0 4px 4px' }}>
                        <ActionButton
                          iconProps={{ iconName: 'Add' }}
                          text="Přidat rezervu"
                          title={planLocked ? 'Plán je uzamčený — nová rezerva vznikne s plánem 0' : undefined}
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
    </div>
  );

  // Vodorovný posuvník je zrcadlený a lepí se na dolní okraj okna (viz StickyHScroll); záhlaví sloupců zůstává nahoře.
  return (
    <>
    <StickyHScroll maxHeight="calc(100vh - 240px)">
      <table style={{ width: mainCols.total, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        {mainCols.cols}
        <thead>
          <tr style={{ borderBottom: `1px solid ${RES.grayBlue}` }}>
            <th style={TH}>
              Popis položky{mainCols.grip(0)}
            </th>
            <th style={TH}>
              Dodavatel / profese{mainCols.grip(1)}
            </th>
            <th style={TH}>
              Kategorie{mainCols.grip(2)}
            </th>
            <th style={TH}>
              Měna{mainCols.grip(3)}
            </th>
            <th style={{ ...TH, textAlign: 'right' }} title="Plán nákupu položky celkem (bez DPH)">
              Nákup – plán{mainCols.grip(4)}
            </th>
            <th style={{ ...TH, textAlign: 'right' }} title="Součet objednávek navázaných na položku (stavy, které se počítají jako vystavené)">
              Objednáno{mainCols.grip(5)}
            </th>
            <th style={{ ...TH, textAlign: 'right' }} title="Prognóza nákupu položky: ruční, jinak plán; nikdy méně než objednáno a nakoupeno">
              Nákup – prognóza{mainCols.grip(6)}
            </th>
            <th style={{ ...TH, textAlign: 'right', background: RES.bluePale }} title="Skutečnost: za kolik se už nakoupilo (u práce odpracováno)">
              Nakoupeno{mainCols.grip(7)}
            </th>
            <th style={{ ...TH, textAlign: 'right' }} title="Plán nákupu − nakoupeno">
              Zbývá nakoupit{mainCols.grip(8)}
            </th>
            <th style={TH} />
          </tr>
        </thead>
        <tbody>
          {mainGroups.map((group) => {
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
                  <td colSpan={4} style={{ ...TD, padding: '5px 4px' }}>
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
                  <td style={{ ...R, fontWeight: 600 }} title={`Plán nákupu skupiny v ${report.label}`}>
                    {formatMoney(cost, report.currency)}
                  </td>
                  <td style={{ ...R, fontWeight: 600 }} title={`Objednáno ve skupině v ${report.label}`}>
                    {formatMoney(gOrdered, report.currency)}
                  </td>
                  <td style={{ ...R, fontWeight: 600 }} title={`Prognóza skupiny v ${report.label}`}>
                    {formatMoney(gForecast, report.currency)}
                  </td>
                  <td style={{ ...R, fontWeight: 600 }} title={`Nakoupeno ve skupině v ${report.label}`}>
                    {formatMoney(actual, report.currency)}
                  </td>
                  <td style={{ ...R, fontWeight: 600 }} title={`Zbývá nakoupit ve skupině v ${report.label}`}>
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
                    const rate = group.kind === 'prace' ? findRate(doc, item.rateId) : undefined;
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
                            <td style={TD} title={planEditable && (!rate || rate.costRate <= 0) ? 'Částku nejde zadat: profese nemá nákladovou sazbu. Doplňte ji v tabulce sazeb profesí (Kč/hod) nebo vyberte jinou profesi.' : undefined}>
                              <NumInput
                                value={c.cost}
                                ariaLabel="Plán práce celkem"
                                disabled={!planEditable || !rate || rate.costRate <= 0}
                                onCommit={(v) => {
                                  const next = withLabourTotal(item, v ?? 0, rate ? rate.costRate : 0);
                                  if (next) {
                                    setWhole(next);
                                  }
                                }}
                              />
                            </td>
                            {planCells(c)}
                            {actualCells(
                              c,
                              (v) => {
                                const next = withLabourActual(item, v, rate ? rate.costRate : 0);
                                if (next) {
                                  setWhole(next);
                                }
                              },
                              c.actualCost
                            )}
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
                              <NumInput value={c.cost} ariaLabel="Plán nákupu celkem" disabled={!planEditable} onCommit={(v) => setWhole(withPlanTotal(item, v ?? 0))} />
                            </td>
                            {planCells(c)}
                            {actualCells(c, (v) => setItem(item.id, { actualCost: v === undefined ? undefined : Math.max(0, v) }))}
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
    {reserveGroups.length > 0 && reserveTable()}
    </>
  );
};
