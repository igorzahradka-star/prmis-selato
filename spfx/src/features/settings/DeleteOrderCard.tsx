/**
 * Jednorázové akce s doklady (jen administrátor): smazání objednávky, smazání podkladu pro fakturaci a oprava
 * duplicitních čísel objednávek. Samotné mazání je ve společné komponentě `DeleteDocumentCard` (stejně se bude
 * řešit u předávacích protokolů).
 */

import * as React from 'react';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { formatDate, formatMoney } from '../../core/format';
import { PurchaseOrder, ordersToRenumber } from '../../core/orders';
import { InvoiceBasis } from '../../core/invoiceBases';
import { DiaryEntry } from '../../core/siteDiary';
import { canDeleteOrder, toActor } from '../../core/orderWorkflow';
import { DeleteDocumentCard } from './DeleteDocumentCard';

/** Jednou větou, podle čeho se objednávky rozeznají. */
function describeOrder(o: PurchaseOrder): string {
  return `${o.created ? formatDate(o.created) : 'bez data'} · projekt ${o.projectNumber} · ${o.status} · ${o.subject || '—'} · ${
    o.supplierName || 'bez dodavatele'
  } · ${formatMoney(o.amountNet, o.currency)} bez DPH · vystavil ${o.requestedByName || '—'} · ID ${o.id}`;
}

function describeInvoice(i: InvoiceBasis): string {
  return `${i.issueDate ? formatDate(i.issueDate) : 'bez data'} · projekt ${i.projectNumber} · ${i.status} · ${i.customerName || 'bez odběratele'} · ${formatMoney(
    i.amountNet,
    i.currency
  )} bez DPH · vystavil ${i.requestedByName || '—'} · ID ${i.id}`;
}

function describeEntry(e: DiaryEntry): string {
  return `${formatDate(e.date)} · deník ${e.diaryTitle || e.diaryId} · ${e.status} · ${e.header.constructionName || '—'} · zapsal ${e.createdByName || '—'} · ID ${e.id}`;
}

export const DeleteOrderCard: React.FC = () => {
  const { repos, user } = useApp();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ text: string; type: MessageBarType } | undefined>(undefined);
  const [duplicates, setDuplicates] = React.useState<PurchaseOrder[] | undefined>(undefined);

  if (!canDeleteOrder(toActor(user))) {
    return null;
  }

  const checkDuplicates = (): void => {
    setBusy(true);
    setMessage(undefined);
    repos.orders
      .list()
      .then((all) => {
        setBusy(false);
        const dup = ordersToRenumber(all);
        setDuplicates(dup);
        if (dup.length === 0) {
          setMessage({ text: 'Žádná objednávka nemá duplicitní číslo, nic se opravovat nemusí.', type: MessageBarType.success });
        }
      })
      .catch((e: Error) => {
        setBusy(false);
        setMessage({ text: e.message, type: MessageBarType.error });
      });
  };

  const renumber = (): void => {
    setBusy(true);
    setMessage(undefined);
    repos.orders
      .renumberDuplicates(user)
      .then((changed) => {
        setBusy(false);
        setDuplicates(undefined);
        setMessage({
          text:
            changed.length === 0
              ? 'Žádná objednávka nemá duplicitní číslo.'
              : `Přečíslováno ${changed.length}: ${changed.map((c) => `${c.from} (ID ${c.id}) → ${c.to}`).join('; ')}. Nejstarší objednávka každého čísla si číslo ponechala.`,
          type: MessageBarType.success
        });
      })
      .catch((e: Error) => {
        setBusy(false);
        setMessage({ text: e.message, type: MessageBarType.error });
      });
  };

  return (
    <>
      <DeleteDocumentCard
        title="Smazat objednávku"
        noun="Objednávka"
        placeholder="OBJ-2026-0003"
        list={() => repos.orders.list().then((all) => all.map((o) => ({ id: o.id, number: o.orderNumber, description: describeOrder(o) })))}
        remove={(id) => repos.orders.delete(id, user)}
        onDeleted={() => setDuplicates(undefined)}
      />

      <DeleteDocumentCard
        title="Smazat podklad pro fakturaci"
        noun="Podklad"
        placeholder="FP26004"
        list={() => repos.invoices.list().then((all) => all.map((i) => ({ id: i.id, number: i.number, description: describeInvoice(i) })))}
        remove={(id) => repos.invoices.delete(id, user)}
      />

      <DeleteDocumentCard
        title="Smazat zápis ze stavby"
        noun="Zápis"
        placeholder="26001 Z1"
        list={() =>
          repos.diary
            .listEntries()
            .then((all) => all.map((e) => ({ id: e.id, number: `${e.projectNumber} Z${e.entryNo}`, description: describeEntry(e) })))
        }
        remove={(id) => repos.diary.delete(id, user)}
      />

      <div style={{ border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '14px 18px' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: RES.navy }}>Opravit duplicitní čísla objednávek</h3>
        <p style={{ margin: '4px 0 10px', fontSize: 12, color: RES.gray, lineHeight: 1.55 }}>
          Kdyby měly různé objednávky stejné číslo, tahle akce je opraví: nejstarší si číslo ponechá, ostatním přidělí další volná
          čísla. Nic nemaže. Už odeslané PDF ve složce projektu zůstane pod starým názvem. Dá se pustit opakovaně.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <DefaultButton text="Zkontrolovat" disabled={busy} onClick={checkDuplicates} />
          {duplicates && duplicates.length > 0 && (
            <PrimaryButton text={busy ? 'Opravuji…' : `Přečíslovat ${duplicates.length} objednávek`} disabled={busy} onClick={renumber} />
          )}
        </div>
        {message && (
          <MessageBar messageBarType={message.type} isMultiline onDismiss={() => setMessage(undefined)} styles={{ root: { marginTop: 10 } }}>
            {message.text}
          </MessageBar>
        )}
        {duplicates && duplicates.length > 0 && (
          <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}>
            {duplicates.map((d) => (
              <li key={d.id}>
                <strong>{d.orderNumber}</strong> — {describeOrder(d)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
};
