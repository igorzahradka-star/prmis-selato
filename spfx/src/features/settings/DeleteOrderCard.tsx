/**
 * Jednorázová akce: smazání objednávky (jen administrátor).
 *
 * Běžně se objednávky nemažou, ale stornují — číselná řada pak zůstane bez děr a je vidět, co se stalo.
 * Mazání je pro omyly (zkušební objednávka, dvojité založení). Před smazáním se ukáže, o jakou objednávku jde,
 * a administrátor musí opsat její číslo. V SharePointu jde položka do koše webu a do historie se zapíše, kdo ji smazal.
 * Stejná akce přibude u dalších dokumentů (předávací protokoly, podklady pro fakturaci).
 */

import * as React from 'react';
import { TextField } from '@fluentui/react/lib/TextField';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { formatDate, formatMoney } from '../../core/format';
import { PurchaseOrder } from '../../core/orders';
import { canDeleteOrder, toActor } from '../../core/orderWorkflow';

export const DeleteOrderCard: React.FC = () => {
  const { repos, user } = useApp();
  const [number, setNumber] = React.useState('');
  const [found, setFound] = React.useState<PurchaseOrder | undefined>(undefined);
  const [confirmText, setConfirmText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ text: string; type: MessageBarType } | undefined>(undefined);

  if (!canDeleteOrder(toActor(user))) {
    return null;
  }

  const search = (): void => {
    const wanted = number.trim().toLocaleLowerCase('cs-CZ');
    if (wanted === '') {
      return;
    }
    setBusy(true);
    setMessage(undefined);
    setFound(undefined);
    setConfirmText('');
    repos.orders
      .list()
      .then((all) => {
        setBusy(false);
        const hit = all.filter((o) => o.orderNumber.toLocaleLowerCase('cs-CZ') === wanted)[0];
        if (hit) {
          setFound(hit);
        } else {
          setMessage({ text: `Objednávka „${number.trim()}“ nebyla nalezena. Zadejte číslo celé, např. OBJ-2026-0003.`, type: MessageBarType.warning });
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
        setFound(undefined);
        setNumber('');
        setConfirmText('');
        setMessage({
          text: `Objednávka ${target.orderNumber} je smazaná. Číslo se znovu nepřidělí, v řadě zůstane mezera.`,
          type: MessageBarType.success
        });
      })
      .catch((e: Error) => {
        setBusy(false);
        setMessage({ text: e.message, type: MessageBarType.error });
      });
  };

  return (
    <div style={{ border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '14px 18px' }}>
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
            setFound(undefined);
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

      {found && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, lineHeight: 1.6, background: RES.background, padding: '8px 12px', borderRadius: 4 }}>
            <strong>{found.orderNumber}</strong> · projekt {found.projectNumber} · stav <strong>{found.status}</strong>
            <br />
            {found.subject || '—'} · {found.supplierName || 'bez dodavatele'} · {formatMoney(found.amountNet, found.currency)} bez DPH
            <br />
            Vystavil {found.requestedByName || '—'}, {found.created ? formatDate(found.created) : '—'}
          </div>
          <TextField
            label={`Pro potvrzení opište číslo ${found.orderNumber}`}
            value={confirmText}
            onChange={(_, v) => setConfirmText(v ?? '')}
            styles={{ root: { width: 280 } }}
          />
          <div>
            <PrimaryButton
              text={busy ? 'Mažu…' : 'Smazat objednávku'}
              disabled={busy || confirmText.trim().toLocaleLowerCase('cs-CZ') !== found.orderNumber.toLocaleLowerCase('cs-CZ')}
              onClick={remove}
              styles={{ root: { background: RES.red, borderColor: RES.red } }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
