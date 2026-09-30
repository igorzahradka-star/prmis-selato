/**
 * Jednorázové akce s objednávkami (jen administrátor): smazání objednávky a oprava duplicitních čísel.
 *
 * Běžně se objednávky nemažou, ale stornují — číselná řada pak zůstane bez děr a je vidět, co se stalo.
 * Mazání je pro omyly (zkušební objednávka, dvojité založení). Hledá se podle čísla; kdyby měla stejné číslo
 * víc objednávek (chyba číslování z dřívějška), ukážou se všechny s datem, projektem a předmětem a maže se ta jedna vybraná.
 * Před smazáním se musí opsat číslo. V SharePointu jde položka do koše webu a do historie se zapíše, kdo ji smazal.
 * Stejná akce přibude u dalších dokumentů (předávací protokoly, podklady pro fakturaci).
 */

import * as React from 'react';
import { TextField } from '@fluentui/react/lib/TextField';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { ChoiceGroup, IChoiceGroupOption } from '@fluentui/react/lib/ChoiceGroup';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { formatDate, formatMoney } from '../../core/format';
import { PurchaseOrder, ordersToRenumber } from '../../core/orders';
import { canDeleteOrder, toActor } from '../../core/orderWorkflow';

const CARD: React.CSSProperties = { border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '14px 18px' };

/** Jednou větou, podle čeho se objednávky se stejným číslem rozeznají. */
function describe(o: PurchaseOrder): string {
  return `${o.created ? formatDate(o.created) : 'bez data'} · projekt ${o.projectNumber} · ${o.status} · ${o.subject || '—'} · ${
    o.supplierName || 'bez dodavatele'
  } · ${formatMoney(o.amountNet, o.currency)} bez DPH · vystavil ${o.requestedByName || '—'} · ID ${o.id}`;
}

export const DeleteOrderCard: React.FC = () => {
  const { repos, user } = useApp();
  const [number, setNumber] = React.useState('');
  const [hits, setHits] = React.useState<PurchaseOrder[]>([]);
  const [selectedId, setSelectedId] = React.useState<number | undefined>(undefined);
  const [confirmText, setConfirmText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ text: string; type: MessageBarType } | undefined>(undefined);
  const [duplicates, setDuplicates] = React.useState<PurchaseOrder[] | undefined>(undefined);

  if (!canDeleteOrder(toActor(user))) {
    return null;
  }

  const found = hits.filter((h) => h.id === selectedId)[0];

  const search = (): void => {
    const wanted = number.trim().toLocaleLowerCase('cs-CZ');
    if (wanted === '') {
      return;
    }
    setBusy(true);
    setMessage(undefined);
    setHits([]);
    setSelectedId(undefined);
    setConfirmText('');
    repos.orders
      .list()
      .then((all) => {
        setBusy(false);
        const matches = all.filter((o) => o.orderNumber.trim().toLocaleLowerCase('cs-CZ') === wanted);
        if (matches.length === 0) {
          setMessage({ text: `Objednávka „${number.trim()}“ nebyla nalezena. Zadejte číslo celé, např. OBJ-2026-0003.`, type: MessageBarType.warning });
          return;
        }
        setHits(matches);
        if (matches.length === 1) {
          setSelectedId(matches[0].id);
        } else {
          setMessage({
            text: `Toto číslo má ${matches.length} objednávek (chyba číslování z dřívějška). Vyberte tu, kterou chcete smazat — nebo nejdřív použijte „Opravit duplicitní čísla“ níže.`,
            type: MessageBarType.warning
          });
        }
      })
      .catch((e: Error) => {
        setBusy(false);
        setMessage({ text: e.message, type: MessageBarType.error });
      });
  };

  const remove = (): void => {
    if (!found) {
      return;
    }
    const target = found;
    setBusy(true);
    repos.orders
      .delete(target.id, user)
      .then(() => {
        setBusy(false);
        setHits([]);
        setSelectedId(undefined);
        setNumber('');
        setConfirmText('');
        setDuplicates(undefined);
        setMessage({
          text: `Objednávka ${target.orderNumber} (ID ${target.id}) je smazaná. Číslo se znovu nepřidělí, v řadě zůstane mezera.`,
          type: MessageBarType.success
        });
      })
      .catch((e: Error) => {
        setBusy(false);
        setMessage({ text: e.message, type: MessageBarType.error });
      });
  };

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
        setHits([]);
        setSelectedId(undefined);
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

  const choices: IChoiceGroupOption[] = hits.map((h) => ({ key: String(h.id), text: describe(h) }));

  return (
    <>
      <div style={CARD}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: RES.navy }}>Smazat objednávku</h3>
        <p style={{ margin: '4px 0 10px', fontSize: 12, color: RES.gray, lineHeight: 1.55 }}>
          Jen pro omyly (zkušební objednávka, dvojité založení). Běžná objednávka se <strong>stornuje</strong> — zůstane vidět a
          číselná řada nemá díry. Smazaná objednávka se nedá v aplikaci vrátit; v SharePointu zůstane v koši webu a do
          historie se zapíše, kdo ji smazal.
        </p>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <TextField
            label="Číslo objednávky"
            placeholder="OBJ-2026-0003"
            value={number}
            onChange={(_, v) => {
              setNumber(v ?? '');
              setHits([]);
              setSelectedId(undefined);
              setMessage(undefined);
            }}
            styles={{ root: { width: 220 } }}
          />
          <DefaultButton text="Najít" disabled={busy || number.trim() === ''} onClick={search} />
        </div>

        {message && (
          <MessageBar messageBarType={message.type} isMultiline onDismiss={() => setMessage(undefined)} styles={{ root: { marginTop: 10 } }}>
            {message.text}
          </MessageBar>
        )}

        {hits.length > 1 && (
          <ChoiceGroup
            label="Která objednávka?"
            options={choices}
            selectedKey={selectedId !== undefined ? String(selectedId) : undefined}
            onChange={(_, o) => {
              setSelectedId(o ? Number(o.key) : undefined);
              setConfirmText('');
            }}
            styles={{ root: { marginTop: 10 } }}
          />
        )}

        {found && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, lineHeight: 1.6, background: RES.background, padding: '8px 12px', borderRadius: 4 }}>
              <strong>{found.orderNumber}</strong> · {describe(found)}
            </div>
            <TextField
              label={`Pro potvrzení opište číslo ${found.orderNumber}`}
              value={confirmText}
              onChange={(_, v) => setConfirmText(v ?? '')}
              styles={{ root: { width: 280 } }}
            />
            <div>
              <PrimaryButton
                text={busy ? 'Mažu…' : 'Smazat tuto objednávku'}
                disabled={busy || confirmText.trim().toLocaleLowerCase('cs-CZ') !== found.orderNumber.trim().toLocaleLowerCase('cs-CZ')}
                onClick={remove}
                styles={{ root: { background: RES.red, borderColor: RES.red } }}
              />
            </div>
          </div>
        )}
      </div>

      <div style={CARD}>
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
        {duplicates && duplicates.length > 0 && (
          <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}>
            {duplicates.map((d) => (
              <li key={d.id}>
                <strong>{d.orderNumber}</strong> — {describe(d)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
};
