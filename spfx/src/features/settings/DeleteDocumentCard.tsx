/**
 * Jednorázová akce: smazání dokladu (objednávky, podkladu pro fakturaci; později předávacího protokolu) — jen administrátor.
 *
 * Běžně se doklady nemažou, ale stornují — číselná řada pak zůstane bez děr a je vidět, co se stalo. Mazání je pro omyly
 * (zkušební doklad, dvojité založení). Hledá se podle čísla; kdyby mělo stejné číslo víc dokladů (chyba číslování z dřívějška),
 * ukážou se všechny a maže se ta jedna vybraná. Před smazáním se musí opsat číslo. V SharePointu jde položka do koše webu
 * a do historie se zapíše, kdo ji smazal.
 */

import * as React from 'react';
import { TextField } from '@fluentui/react/lib/TextField';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { ChoiceGroup, IChoiceGroupOption } from '@fluentui/react/lib/ChoiceGroup';

import { RES } from '../../ui/theme';

/** Doklad v nabídce ke smazání: číslo a věta, podle které se doklady se stejným číslem rozeznají. */
export interface DeletableDocument {
  id: number;
  number: string;
  description: string;
}

export interface DeleteDocumentCardProps {
  /** Nadpis karty, např. „Smazat objednávku". */
  title: string;
  /** Jak se doklad jmenuje ve větách („Objednávka", „Podklad"). */
  noun: string;
  placeholder: string;
  /** Načte všechny doklady (hledá se mezi nimi podle čísla). */
  list: () => Promise<DeletableDocument[]>;
  remove: (id: number) => Promise<void>;
  /** Volá se po úspěšném smazání (např. aby se smazal seznam duplicit). */
  onDeleted?: () => void;
}

const CARD: React.CSSProperties = { border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '14px 18px' };

export const DeleteDocumentCard: React.FC<DeleteDocumentCardProps> = ({ title, noun, placeholder, list, remove, onDeleted }) => {
  const [number, setNumber] = React.useState('');
  const [hits, setHits] = React.useState<DeletableDocument[]>([]);
  const [selectedId, setSelectedId] = React.useState<number | undefined>(undefined);
  const [confirmText, setConfirmText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ text: string; type: MessageBarType } | undefined>(undefined);

  const found = hits.filter((h) => h.id === selectedId)[0];
  const same = (a: string, b: string): boolean => a.trim().toLocaleLowerCase('cs-CZ') === b.trim().toLocaleLowerCase('cs-CZ');

  const search = (): void => {
    if (number.trim() === '') {
      return;
    }
    setBusy(true);
    setMessage(undefined);
    setHits([]);
    setSelectedId(undefined);
    setConfirmText('');
    list()
      .then((all) => {
        setBusy(false);
        const matches = all.filter((d) => same(d.number, number));
        if (matches.length === 0) {
          setMessage({ text: `${noun} „${number.trim()}“ nebyl(a) nalezen(a). Zadejte číslo celé, např. ${placeholder}.`, type: MessageBarType.warning });
          return;
        }
        setHits(matches);
        if (matches.length === 1) {
          setSelectedId(matches[0].id);
        } else {
          setMessage({
            text: `Toto číslo má ${matches.length} dokladů (chyba číslování z dřívějška). Vyberte ten, který chcete smazat.`,
            type: MessageBarType.warning
          });
        }
      })
      .catch((e: Error) => {
        setBusy(false);
        setMessage({ text: e.message, type: MessageBarType.error });
      });
  };

  const doRemove = (): void => {
    if (!found) {
      return;
    }
    const target = found;
    setBusy(true);
    remove(target.id)
      .then(() => {
        setBusy(false);
        setHits([]);
        setSelectedId(undefined);
        setNumber('');
        setConfirmText('');
        setMessage({
          text: `${noun} ${target.number} (ID ${target.id}) je smazaný(á). Číslo se znovu nepřidělí, v řadě zůstane mezera.`,
          type: MessageBarType.success
        });
        if (onDeleted) {
          onDeleted();
        }
      })
      .catch((e: Error) => {
        setBusy(false);
        setMessage({ text: e.message, type: MessageBarType.error });
      });
  };

  const choices: IChoiceGroupOption[] = hits.map((h) => ({ key: String(h.id), text: h.description }));

  return (
    <div style={CARD}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: RES.navy }}>{title}</h3>
      <p style={{ margin: '4px 0 10px', fontSize: 12, color: RES.gray, lineHeight: 1.55 }}>
        Jen pro omyly (zkušební doklad, dvojité založení). Běžný doklad se <strong>stornuje</strong> — zůstane vidět a číselná řada nemá
        díry. Smazaný doklad se nedá v aplikaci vrátit; v SharePointu zůstane v koši webu a do historie se zapíše, kdo ho smazal.
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <TextField
          label="Číslo dokladu"
          placeholder={placeholder}
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
          label="Který doklad?"
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
            <strong>{found.number}</strong> · {found.description}
          </div>
          <TextField
            label={`Pro potvrzení opište číslo ${found.number}`}
            value={confirmText}
            onChange={(_, v) => setConfirmText(v ?? '')}
            styles={{ root: { width: 280 } }}
          />
          <div>
            <PrimaryButton
              text={busy ? 'Mažu…' : 'Smazat tento doklad'}
              disabled={busy || !same(confirmText, found.number)}
              onClick={doRemove}
              styles={{ root: { background: RES.red, borderColor: RES.red } }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
