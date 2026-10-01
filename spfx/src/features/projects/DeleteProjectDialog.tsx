/**
 * Smazání projektu (jen administrátor). Velké červené varování s přesným rozsahem, potvrzení opsáním čísla projektu.
 *
 * Maže se do koše SharePointu (správce webu to 93 dní obnoví): projekt, jeho objednávky, podklady pro fakturaci, zápisy, termíny
 * a složka projektu i s dokumenty. Složku aplikace smaže jen tehdy, když leží přímo v kořenové složce projektů; jinak řekne, ať ji uživatel smaže ručně.
 */

import * as React from 'react';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { TextField } from '@fluentui/react/lib/TextField';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { Project } from '../../core/types';
import { ProjectRemovalPreview, ProjectRemovalResult } from '../../core/projectDeletion';

export const DeleteProjectDialog: React.FC<{ project: Project; onClose: () => void; onDeleted: () => void }> = ({ project, onClose, onDeleted }) => {
  const { repos, user } = useApp();
  const [preview, setPreview] = React.useState<ProjectRemovalPreview | undefined>(undefined);
  const [confirm, setConfirm] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [result, setResult] = React.useState<ProjectRemovalResult | undefined>(undefined);

  React.useEffect(() => {
    let cancelled = false;
    repos.projects
      .describeRemoval(project.projectNumber)
      .then((p) => !cancelled && setPreview(p))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [repos, project.projectNumber]);

  const run = (): void => {
    setBusy(true);
    setError(undefined);
    repos.projects
      .remove(project.projectNumber, user, reason.trim() || undefined)
      .then((r) => {
        setBusy(false);
        setResult(r);
      })
      .catch((e: Error) => {
        setBusy(false);
        setError(e.message);
      });
  };

  if (result) {
    return (
      <Dialog
        hidden={false}
        onDismiss={onDeleted}
        dialogContentProps={{ type: DialogType.normal, title: `Projekt ${project.projectNumber} je smazaný` }}
        modalProps={{ isBlocking: true }}
        minWidth={460}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {result.deleted.length > 0 && <div style={{ fontSize: 13 }}>Smazáno: {result.deleted.map((d) => `${d.label} (${d.count})`).join(', ')}.</div>}
          {result.folderRecycled && <MessageBar messageBarType={MessageBarType.success}>Složka projektu je v koši SharePointu.</MessageBar>}
          {result.folderWarning && (
            <MessageBar messageBarType={MessageBarType.warning} isMultiline>
              {result.folderWarning}
            </MessageBar>
          )}
        </div>
        <DialogFooter>
          <PrimaryButton text="Hotovo" onClick={onDeleted} />
        </DialogFooter>
      </Dialog>
    );
  }

  const confirmed = confirm.trim() === project.projectNumber;

  return (
    <Dialog
      hidden={false}
      onDismiss={busy ? undefined : onClose}
      dialogContentProps={{ type: DialogType.normal, title: `Smazat projekt ${project.projectNumber}?` }}
      modalProps={{ isBlocking: true }}
      minWidth={540}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          style={{
            background: '#FDE7E9',
            border: `2px solid ${RES.red}`,
            borderRadius: 4,
            padding: '12px 14px',
            color: '#7A0B14'
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>POZOR — smazání projektu se nedá vrátit tlačítkem v aplikaci</div>
          <div style={{ fontSize: 13 }}>
            Smaže se projekt <strong>{project.projectNumber} · {project.shortName || project.title}</strong> a s ním vše, co k němu patří:
          </div>
          {!preview && !error && <Spinner size={SpinnerSize.small} label="Zjišťuji, co se smaže…" labelPosition="right" styles={{ root: { justifyContent: 'flex-start', marginTop: 6 } }} />}
          {preview && (
            <ul style={{ margin: '6px 0 6px 18px', padding: 0, fontSize: 13 }}>
              <li>evidence projektu</li>
              {preview.counts.map((c) => (
                <li key={c.label}>
                  {c.label}: <strong>{c.count}</strong>
                </li>
              ))}
              {preview.folderUrl ? (
                <li>
                  <strong>složka projektu na SharePointu i se všemi dokumenty a fotkami</strong>
                </li>
              ) : (
                <li>složka projektu se automaticky nesmaže ({preview.folderWarning || 'viz níže'})</li>
              )}
            </ul>
          )}
          <div style={{ fontSize: 12 }}>
            Vše se přesune do koše SharePointu; správce webu to odtud může do 93 dnů obnovit. Zůstává záznam v auditním logu (kdo a kdy mazal).
          </div>
        </div>

        {preview && !preview.folderUrl && preview.folderWarning && (
          <MessageBar messageBarType={MessageBarType.warning} isMultiline>
            {preview.folderWarning}
          </MessageBar>
        )}
        {error && (
          <MessageBar messageBarType={MessageBarType.error} isMultiline>
            {error}
          </MessageBar>
        )}

        <TextField
          label={`Pro potvrzení opište číslo projektu (${project.projectNumber})`}
          value={confirm}
          autoComplete="off"
          onChange={(_, v) => setConfirm(v ?? '')}
        />
        <TextField label="Důvod (nepovinný, zapíše se do auditního logu)" value={reason} onChange={(_, v) => setReason(v ?? '')} />
      </div>
      <DialogFooter>
        <PrimaryButton
          text={busy ? 'Mažu…' : 'Smazat projekt'}
          disabled={!confirmed || !preview || busy}
          onClick={run}
          styles={{ root: { background: RES.red, borderColor: RES.red }, rootHovered: { background: '#8E0F1B', borderColor: '#8E0F1B' } }}
        />
        <DefaultButton text="Zrušit" disabled={busy} onClick={onClose} />
      </DialogFooter>
    </Dialog>
  );
};
