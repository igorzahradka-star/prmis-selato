/**
 * Můj profil — zatím podpis jako obrázek. Podpis se vkládá do ostrých PDF dokladů (objednávky, podklady pro fakturaci, zápisy)
 * pod jména těch, kdo doklad vystavili nebo schválili, spolu se značkou elektronického podpisu, jménem a časem.
 */

import * as React from 'react';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { Checkbox } from '@fluentui/react/lib/Checkbox';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { PageHeading } from '../../ui/components/PageHeading';
import { UserSignature } from '../../core/signatures';
import { formatDateTime } from '../../core/format';
import { prepareSignatureImage } from '../diary/imageUtils';
import { SignaturePadDialog } from './SignaturePadDialog';

/** Rámeček s „šachovnicí“ pod podpisem — je vidět, že pozadí je průhledné. */
const PREVIEW_BG = 'repeating-conic-gradient(#f3f3f3 0% 25%, #ffffff 0% 50%) 50% / 16px 16px';

export const ProfilePage: React.FC = () => {
  const { repos, user } = useApp();
  const [current, setCurrent] = React.useState<UserSignature | undefined | null>(undefined);
  const [pending, setPending] = React.useState<string | undefined>(undefined);
  const [removeBg, setRemoveBg] = React.useState(true);
  const [drawing, setDrawing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [notice, setNotice] = React.useState<string | undefined>(undefined);
  const fileRef = React.useRef<HTMLInputElement>(null);
  /** Původní vybraný soubor — kvůli přepnutí „odstranit bílé pozadí“ bez nového výběru. */
  const sourceRef = React.useRef<File | undefined>(undefined);

  const load = React.useCallback((): void => {
    repos.profiles
      .getSignature(user.loginName)
      .then((s) => setCurrent(s ?? null))
      .catch(() => setCurrent(null));
  }, [repos, user.loginName]);

  React.useEffect(load, [load]);

  const prepare = (file: File, removeBackground: boolean): void => {
    setBusy(true);
    setError(undefined);
    prepareSignatureImage(file, removeBackground)
      .then((url) => {
        setPending(url);
        setBusy(false);
      })
      .catch((e: Error) => {
        setBusy(false);
        setError(e.message);
      });
  };

  const onFile = (file: File | undefined): void => {
    if (!file) {
      return;
    }
    if (file.type.indexOf('image/') !== 0) {
      setError('Vyberte obrázek (JPG, PNG…) — sken nebo fotku podpisu.');
      return;
    }
    sourceRef.current = file;
    setNotice(undefined);
    prepare(file, removeBg);
  };

  const save = (): void => {
    if (!pending) {
      return;
    }
    setBusy(true);
    setError(undefined);
    repos.profiles
      .saveSignature(user, pending)
      .then((s) => {
        setCurrent(s);
        setPending(undefined);
        sourceRef.current = undefined;
        setBusy(false);
        setNotice('Podpis je uložený. Objeví se v dalších ostrých PDF, která vystavíte nebo schválíte.');
      })
      .catch((e: Error) => {
        setBusy(false);
        setError(e.message);
      });
  };

  const remove = (): void => {
    setBusy(true);
    setError(undefined);
    repos.profiles
      .removeSignature(user)
      .then(() => {
        setCurrent(null);
        setBusy(false);
        setNotice('Podpis je odstraněný. V dokladech bude jen jméno se značkou elektronického podpisu.');
      })
      .catch((e: Error) => {
        setBusy(false);
        setError(e.message);
      });
  };

  return (
    <>
      <PageHeading title="Můj profil" subtitle={`${user.displayName}${user.email ? ' · ' + user.email : ''}`} />

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>
          {error}
        </MessageBar>
      )}
      {notice && (
        <MessageBar messageBarType={MessageBarType.success} isMultiline onDismiss={() => setNotice(undefined)}>
          {notice}
        </MessageBar>
      )}

      <section style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '14px 18px', maxWidth: 760, marginTop: 8 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 15, color: RES.navy }}>Můj podpis</h2>
        <div style={{ fontSize: 13, color: RES.gray, marginBottom: 12 }}>
          Podpis se vloží do ostrých PDF dokladů, které vystavíte nebo schválíte (objednávky, podklady pro fakturaci, zápisy ze stavby). V dokladu je pod ním
          <strong> značka elektronického podpisu</strong>, vaše jméno a čas. Je to obrázek vašeho podpisu — nahrajte sken či fotku, nebo se podepište myší, prstem nebo perem.
          (Není to kvalifikovaný podpis certifikátem; doložení, že doklad vystavil nebo schválil konkrétní uživatel v aplikaci.)
        </div>

        {current === undefined && <Spinner size={SpinnerSize.small} label="Načítám podpis…" labelPosition="right" styles={{ root: { justifyContent: 'flex-start' } }} />}

        {current && !pending && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: RES.gray, marginBottom: 4 }}>
              Uložený podpis{current.updated ? ` (změněn ${formatDateTime(current.updated)})` : ''}:
            </div>
            <div style={{ background: PREVIEW_BG, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: 10, display: 'inline-block' }}>
              <img src={current.imageDataUrl} alt="Můj podpis" style={{ display: 'block', maxWidth: '100%', maxHeight: 120 }} />
            </div>
          </div>
        )}
        {current === null && !pending && <div style={{ fontSize: 13, marginBottom: 12 }}>Zatím nemáte uložený žádný podpis — v dokladech bude jen vaše jméno se značkou elektronického podpisu.</div>}

        {pending && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: RES.gray, marginBottom: 4 }}>Náhled nového podpisu (šachovnice = průhledné pozadí):</div>
            <div style={{ background: PREVIEW_BG, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: 10, display: 'inline-block' }}>
              <img src={pending} alt="Náhled nového podpisu" style={{ display: 'block', maxWidth: '100%', maxHeight: 120 }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <PrimaryButton text={busy ? 'Ukládám…' : 'Uložit podpis'} disabled={busy} onClick={save} />
              <DefaultButton
                text="Zahodit"
                disabled={busy}
                onClick={() => {
                  setPending(undefined);
                  sourceRef.current = undefined;
                }}
              />
            </div>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = (e.target.files ?? [])[0];
            e.target.value = '';
            onFile(file);
          }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <DefaultButton iconProps={{ iconName: 'Upload' }} text="Nahrát sken nebo fotku podpisu" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()} />
          <DefaultButton iconProps={{ iconName: 'Edit' }} text="Nakreslit podpis" disabled={busy} onClick={() => setDrawing(true)} />
          {current && <DefaultButton iconProps={{ iconName: 'Delete' }} text="Odstranit podpis" disabled={busy} onClick={remove} />}
        </div>
        <div style={{ marginTop: 10 }}>
          <Checkbox
            label="Odstranit bílé pozadí ze skenu (doporučeno)"
            checked={removeBg}
            onChange={(_, c) => {
              const v = !!c;
              setRemoveBg(v);
              if (sourceRef.current && pending) {
                prepare(sourceRef.current, v);
              }
            }}
          />
        </div>
      </section>

      {drawing && (
        <SignaturePadDialog
          onCancel={() => setDrawing(false)}
          onUse={(url) => {
            setDrawing(false);
            sourceRef.current = undefined;
            setNotice(undefined);
            setPending(url);
          }}
        />
      )}
    </>
  );
};
