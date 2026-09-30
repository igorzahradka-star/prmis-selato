/**
 * Odeslání schválené objednávky dodavateli: adresát (předvyplněný z partnera), kopie, předmět a text
 * e-mailu. E-mail odchází ze schránky přihlášeného uživatele i s PDF objednávky.
 *
 * Když e-mail poslat nejde (oprávnění ještě není schválené) nebo ho chce uživatel poslat sám, je tu druhá cesta:
 * PDF se uloží do složky projektu, objednávka se označí jako odeslaná a e-mail pošle člověk po svém.
 */

import * as React from 'react';
import { Dialog, DialogType, DialogFooter } from '@fluentui/react/lib/Dialog';
import { TextField } from '@fluentui/react/lib/TextField';
import { Checkbox } from '@fluentui/react/lib/Checkbox';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';

import { parseRecipients } from '../../core/mail';

export interface SendPayload {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  includeAttachments: boolean;
}

export interface SendOrderDialogProps {
  orderNumber: string;
  initialTo: string;
  initialCc: string;
  initialSubject: string;
  initialBody: string;
  attachmentCount: number;
  busy: boolean;
  error?: string;
  onSendMail: (payload: SendPayload) => void;
  onMarkOnly: () => void;
  onDismiss: () => void;
}

export const SendOrderDialog: React.FC<SendOrderDialogProps> = ({
  orderNumber,
  initialTo,
  initialCc,
  initialSubject,
  initialBody,
  attachmentCount,
  busy,
  error,
  onSendMail,
  onMarkOnly,
  onDismiss
}) => {
  const [to, setTo] = React.useState(initialTo);
  const [cc, setCc] = React.useState(initialCc);
  const [subject, setSubject] = React.useState(initialSubject);
  const [body, setBody] = React.useState(initialBody);
  const [includeAttachments, setIncludeAttachments] = React.useState(attachmentCount > 0);
  const [problem, setProblem] = React.useState<string | undefined>(undefined);

  const send = (): void => {
    const toParsed = parseRecipients(to);
    const ccParsed = parseRecipients(cc);
    if (toParsed.valid.length === 0) {
      setProblem('Vyplňte adresu dodavatele (komu se objednávka pošle).');
      return;
    }
    const wrong = [...toParsed.invalid, ...ccParsed.invalid];
    if (wrong.length > 0) {
      setProblem(`Tyto adresy nevypadají správně: ${wrong.join(', ')}.`);
      return;
    }
    if (subject.trim() === '') {
      setProblem('Vyplňte předmět e-mailu.');
      return;
    }
    setProblem(undefined);
    onSendMail({ to: toParsed.valid, cc: ccParsed.valid, subject: subject.trim(), body, includeAttachments });
  };

  return (
    <Dialog
      hidden={false}
      onDismiss={busy ? undefined : onDismiss}
      dialogContentProps={{ type: DialogType.normal, title: `Odeslat objednávku ${orderNumber} dodavateli` }}
      modalProps={{ isBlocking: true }}
      minWidth={560}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(problem || error) && (
          <MessageBar messageBarType={MessageBarType.error} isMultiline>
            {problem || error}
          </MessageBar>
        )}
        <TextField label="Komu" required value={to} onChange={(_, v) => setTo(v ?? '')} description="Více adres oddělte čárkou nebo středníkem." />
        <TextField label="Kopie" value={cc} onChange={(_, v) => setCc(v ?? '')} />
        <TextField label="Předmět" required value={subject} onChange={(_, v) => setSubject(v ?? '')} />
        <TextField label="Text e-mailu" multiline rows={8} value={body} onChange={(_, v) => setBody(v ?? '')} />
        <div style={{ fontSize: 13 }}>
          Přiloží se <strong>PDF objednávky</strong>.
        </div>
        {attachmentCount > 0 && (
          <Checkbox
            label={`Přiložit i přílohy objednávky (${attachmentCount})`}
            checked={includeAttachments}
            onChange={(_, c) => setIncludeAttachments(!!c)}
          />
        )}
        <div style={{ fontSize: 12, color: '#5A6472' }}>
          PDF se zároveň uloží do složky projektu (03_Nákup/Objednávky) a objednávka se označí jako odeslaná dodavateli.
          E-mail odejde z vaší schránky a bude i ve vaší poště Odeslané.
        </div>
      </div>
      <DialogFooter>
        <PrimaryButton text={busy ? 'Odesílám…' : 'Odeslat e-mailem'} disabled={busy} onClick={send} />
        <DefaultButton text="Jen uložit PDF a označit jako odesláno" disabled={busy} onClick={onMarkOnly} />
        <DefaultButton text="Zpět" disabled={busy} onClick={onDismiss} />
      </DialogFooter>
    </Dialog>
  );
};
