/**
 * Doklady z ABRA Flexi v rozpočtu projektu: přehled přijatých a vydaných faktur s přiřazením k položkám nákupu a k výnosům,
 * „Nezařazeno“ (co ještě není přiřazené) a zálohy bokem (zobrazené, ale nezapočítané). Stahování z Abry dělá prostředník;
 * tady se jen ukazuje stav a dá se požádat o okamžitou aktualizaci.
 */

import * as React from 'react';
import { ActionButton, DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';

import { RES } from '../../ui/theme';
import { CurrencyCode, RateTable } from '../../core/currency';
import { formatDate, formatDateTime, formatMoney } from '../../core/format';
import { BudgetDoc } from '../../core/budget';
import { ABRA_DOC_LABELS, AbraDoc, advanceSummary, allocatedOfDoc, assignDoc, isAdvance, orphanAllocations, targetKindOf, unallocatedOfDoc, unallocatedTotals, unassignDoc } from '../../core/abraDocs';
import { AbraSyncStatus } from '../../data/repositories';

const TH: React.CSSProperties = { textAlign: 'left', fontWeight: 600, fontSize: 12, color: RES.gray, padding: '5px 6px', whiteSpace: 'nowrap' };
const TD: React.CSSProperties = { padding: '4px 6px', fontSize: 13, verticalAlign: 'top' };
const R: React.CSSProperties = { ...TD, textAlign: 'right', whiteSpace: 'nowrap' };

export const AbraDocsPanel: React.FC<{
  doc: BudgetDoc;
  docs: AbraDoc[];
  status: AbraSyncStatus | undefined;
  rates: RateTable;
  reportCurrency: CurrencyCode;
  editable: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onChange: (doc: BudgetDoc) => void;
}> = ({ doc, docs, status, rates, reportCurrency, editable, refreshing, onRefresh, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const [targets, setTargets] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | undefined>(undefined);

  const items = doc.items.filter((i) => {
    const g = doc.groups.filter((x) => x.id === i.groupId)[0];
    return !g || g.kind !== 'prace';
  });
  const labelOfItem = (id: string): string => {
    const i = doc.items.filter((x) => x.id === id)[0];
    const g = i ? doc.groups.filter((x) => x.id === i.groupId)[0] : undefined;
    return i ? `${g ? g.name + ' · ' : ''}${i.description || '(bez popisu)'}` : '(smazaná položka)';
  };
  const labelOfRevenue = (id: string): string => {
    const r = (doc.revenues || []).filter((x) => x.id === id)[0];
    return r ? r.description || '(bez popisu)' : '(smazaný výnos)';
  };
  const optionsFor = (d: AbraDoc): IDropdownOption[] =>
    targetKindOf(d) === 'item'
      ? items.map((i) => ({ key: i.id, text: labelOfItem(i.id) }))
      : (doc.revenues || []).map((r) => ({ key: r.id, text: labelOfRevenue(r.id) }));

  const booked = docs.filter((d) => !isAdvance(d));
  const adv = advanceSummary(docs, reportCurrency, rates);
  const open_ = unallocatedTotals(docs, doc.allocations, reportCurrency, rates);
  const orphans = orphanAllocations(docs, doc.allocations);

  const assign = (d: AbraDoc): void => {
    const kind = targetKindOf(d);
    const target = targets[d.abraId];
    if (!kind || !target) {
      return;
    }
    const r = assignDoc(doc.allocations, d, kind, target);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    setError(undefined);
    onChange({ ...doc, allocations: r.allocations });
  };

  const where = (d: AbraDoc): string =>
    (doc.allocations || [])
      .filter((a) => a.docId === d.abraId)
      .map((a) => `${a.kind === 'item' ? labelOfItem(a.targetId) : labelOfRevenue(a.targetId)}${(doc.allocations || []).filter((x) => x.docId === d.abraId).length > 1 ? ` (${formatMoney(a.amount, a.currency)})` : ''}`)
      .join('; ');

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, color: RES.navy, fontSize: 15 }}>Doklady z Abry</h3>
        <span style={{ fontSize: 12, color: RES.gray }}>
          {status && !status.configured
            ? 'Seznam dokladů na webu ještě není (spusťte Instalaci a diagnostiku).'
            : status && status.lastSyncAt
            ? `Naposledy staženo ${formatDateTime(status.lastSyncAt)}${status.lastOk === false ? ' — s chybou' : ''}.`
            : 'Zatím nic nebylo staženo.'}
          {status && status.pendingSince ? ' Aktualizace čeká na stažení…' : ''}
        </span>
        <span style={{ flex: '1 1 auto' }} />
        <DefaultButton text={refreshing || (status && status.pendingSince) ? 'Čeká na stažení…' : 'Aktualizovat z Abry'} iconProps={{ iconName: 'Sync' }} disabled={refreshing || !!(status && (status.pendingSince || !status.configured))} onClick={onRefresh} />
        <ActionButton iconProps={{ iconName: open ? 'ChevronUp' : 'ChevronDown' }} text={open ? 'Skrýt doklady' : `Zobrazit doklady (${docs.length})`} onClick={() => setOpen((o) => !o)} />
      </div>
      {status && status.lastOk === false && status.lastMessage && (
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          Poslední stahování z Abry skončilo chybou: {status.lastMessage}
        </MessageBar>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '8px 0' }}>
        <Tile label={`Nezařazeno – nákup (${reportCurrency})`} value={formatMoney(open_.cost, reportCurrency)} hint="přijaté faktury, které ještě nejsou přiřazené k položce" warn={Math.abs(open_.cost) > 0.5} />
        <Tile label={`Nezařazeno – výnosy (${reportCurrency})`} value={formatMoney(open_.revenue, reportCurrency)} hint="vydané faktury, které ještě nejsou přiřazené k výnosu" warn={Math.abs(open_.revenue) > 0.5} />
        <Tile label={`Zálohy přijaté / vydané (${reportCurrency})`} value={`${formatMoney(adv.received, reportCurrency)} / ${formatMoney(adv.issued, reportCurrency)}`} hint="jen přehled, do Nakoupeno ani Vyfakturováno se nezapočítávají" />
      </div>
      {orphans.length > 0 && (
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          {orphans.length} přiřazení patří k dokladům, které už v Abře nejsou (smazané nebo přečíslované). Počítají se dál; po ověření je odeberte v seznamu dokladů položky.
        </MessageBar>
      )}
      {error && (
        <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError(undefined)}>
          {error}
        </MessageBar>
      )}
      {open && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: RES.white, border: `1px solid ${RES.grayBlue}` }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${RES.grayBlue}` }}>
                <th style={TH}>Doklad</th>
                <th style={TH}>Partner</th>
                <th style={TH}>Datum</th>
                <th style={{ ...TH, textAlign: 'right' }}>Částka bez DPH</th>
                <th style={TH}>Přiřazeno k</th>
                <th style={{ ...TH, textAlign: 'right' }}>Zbývá</th>
                {editable && <th style={TH}>Přiřadit</th>}
              </tr>
            </thead>
            <tbody>
              {booked.map((d) => {
                const left = unallocatedOfDoc(d, doc.allocations);
                return (
                  <tr key={d.abraId} style={{ borderTop: `1px solid ${RES.background}` }}>
                    <td style={TD} title={d.description}>
                      <strong>{d.number}</strong>
                      <div style={{ color: RES.gray, fontSize: 12 }}>{ABRA_DOC_LABELS[d.type]}</div>
                    </td>
                    <td style={TD}>{d.partnerName || '—'}</td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>{d.issueDate ? formatDate(d.issueDate) : '—'}</td>
                    <td style={{ ...R, color: d.amountNet < 0 ? RES.red : RES.text }}>{formatMoney(d.amountNet, d.currency)}</td>
                    <td style={TD}>{where(d) || <span style={{ color: RES.amber }}>Nezařazeno</span>}</td>
                    <td style={{ ...R, color: Math.abs(left) > 0.005 ? RES.amber : RES.gray }}>{allocatedOfDoc(doc.allocations, d.abraId) === 0 || Math.abs(left) > 0.005 ? formatMoney(left, d.currency) : '—'}</td>
                    {editable && (
                      <td style={{ ...TD, minWidth: 330 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {Math.abs(left) > 0.005 && (
                            <>
                              <Dropdown
                                ariaLabel={`Přiřadit doklad ${d.number}`}
                                placeholder={targetKindOf(d) === 'item' ? 'K položce nákupu…' : 'K výnosu…'}
                                selectedKey={targets[d.abraId]}
                                options={optionsFor(d)}
                                onChange={(_, o) => o && setTargets({ ...targets, [d.abraId]: String(o.key) })}
                                styles={{ root: { width: 230 } }}
                              />
                              <PrimaryButton text="Přiřadit" disabled={!targets[d.abraId]} onClick={() => assign(d)} styles={{ root: { height: 28, minWidth: 0 } }} />
                            </>
                          )}
                          {allocatedOfDoc(doc.allocations, d.abraId) !== 0 && <ActionButton text="Zrušit přiřazení" onClick={() => onChange({ ...doc, allocations: unassignDoc(doc.allocations, d.abraId) })} styles={{ root: { height: 28 } }} />}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {booked.length === 0 && (
                <tr>
                  <td colSpan={editable ? 7 : 6} style={{ ...TD, color: RES.gray }}>
                    Pro tento projekt zatím nejsou v Abře žádné faktury (zakázka {doc.items.length >= 0 ? 'musí odpovídat číslu projektu' : ''}).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ fontSize: 12, color: RES.gray, margin: '4px 0 8px' }}>
            Částku jde rozdělit mezi víc položek: u položky nebo výnosu klikněte na „Doklady“ a přiřaďte jen část dokladu.
          </div>

          {adv.docs.length > 0 && (
            <>
              <h4 style={{ margin: '10px 0 4px', color: RES.navy, fontSize: 14 }}>Zálohy (jen přehled — do Nakoupeno ani Vyfakturováno se nezapočítávají)</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', background: RES.white, border: `1px solid ${RES.grayBlue}` }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${RES.grayBlue}` }}>
                    <th style={TH}>Doklad</th>
                    <th style={TH}>Partner</th>
                    <th style={TH}>Datum</th>
                    <th style={TH}>Splatnost</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Částka bez DPH</th>
                  </tr>
                </thead>
                <tbody>
                  {adv.docs.map((d) => (
                    <tr key={d.abraId} style={{ borderTop: `1px solid ${RES.background}` }}>
                      <td style={TD} title={d.description}>
                        <strong>{d.number}</strong>
                        <div style={{ color: RES.gray, fontSize: 12 }}>{ABRA_DOC_LABELS[d.type]}</div>
                      </td>
                      <td style={TD}>{d.partnerName || '—'}</td>
                      <td style={TD}>{d.issueDate ? formatDate(d.issueDate) : '—'}</td>
                      <td style={TD}>{d.dueDate ? formatDate(d.dueDate) : '—'}</td>
                      <td style={R}>{formatMoney(d.amountNet, d.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </div>
  );
};

const Tile: React.FC<{ label: string; value: string; hint?: string; warn?: boolean }> = ({ label, value, hint, warn }) => (
  <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderLeft: `4px solid ${warn ? RES.amber : RES.grayBlue}`, borderRadius: 4, padding: '6px 12px', minWidth: 150, flex: '1 1 200px' }} title={hint}>
    <div style={{ fontSize: 12, color: RES.gray }}>{label}</div>
    <div style={{ fontSize: 16, fontWeight: 600, color: RES.navy }}>{value}</div>
  </div>
);
