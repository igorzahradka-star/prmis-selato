/**
 * Složky projektu — kde má projekt složky objednávek, podkladů pro fakturaci, zápisů a fotek.
 *
 * Každý projekt má vlastní mapu složek (uloženou při založení). Tady jde zkontrolovat a opravit: zobrazí se skutečné složky v projektu
 * a u každého druhu dokumentů cesta, kterou aplikace používá. Nic se nemaže ani nepřesouvá — mění se jen to, kam aplikace dál ukládá
 * a kde hledá. Chybějící složka vznikne až při prvním uložení dokumentu.
 */

import * as React from 'react';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { TextField } from '@fluentui/react/lib/TextField';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { Link } from '@fluentui/react/lib/Link';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { Project } from '../../core/types';
import { FolderLinkCheck } from '../../data/repositories';
import { FOLDER_ROLES, FolderMap, FolderRole, cleanRelativePath, folderFor, suggestPath } from '../../core/projectFolders';

export const ProjectFoldersDialog: React.FC<{
  project: Project;
  onClose: () => void;
  onSaved: (project: Project) => void;
  /** Projekt se změnil (opravený odkaz) a dialog zůstává otevřený. */
  onProjectUpdated: (project: Project) => void;
}> = ({ project, onClose, onSaved, onProjectUpdated }) => {
  const { repos, settings, user } = useApp();
  // U Režie má smysl jen složka objednávek (deník, fakturace ani fotky se na Režii nevedou).
  const roles = project.isOverhead ? FOLDER_ROLES.filter((r) => r.key === 'orders') : FOLDER_ROLES;
  const initial = (): Record<FolderRole, string> => {
    const out = {} as Record<FolderRole, string>;
    roles.forEach((r) => {
      out[r.key] = folderFor(project, r.key, settings.folders);
    });
    return out;
  };
  const [values, setValues] = React.useState<Record<FolderRole, string>>(initial);
  const [existing, setExisting] = React.useState<string[] | undefined>(undefined);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [link, setLink] = React.useState<FolderLinkCheck | undefined>(undefined);

  React.useEffect(() => {
    let cancelled = false;
    repos.projects
      .checkFolderLink(project.projectNumber)
      .then((l) => !cancelled && setLink(l))
      .catch(() => !cancelled && setLink(undefined));
    return () => {
      cancelled = true;
    };
  }, [repos, project.projectNumber, project.folderUrl]);

  React.useEffect(() => {
    let cancelled = false;
    repos.documents
      .listSubfolders(project, '')
      .then((list) => !cancelled && setExisting(list.map((f) => f.name).sort((a, b) => a.localeCompare(b, 'cs-CZ', { numeric: true }))))
      .catch((e: Error) => {
        if (!cancelled) {
          setExisting([]);
          setError(`Složky projektu se nepodařilo přečíst: ${e.message}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repos, project]);

  const set = (role: FolderRole, value: string): void => setValues((cur) => ({ ...cur, [role]: value }));

  /** Nahradí první část každé cesty skutečnou složkou stejného jména (tolerantně, i s jiným číslem). */
  const suggestAll = (): void => {
    if (!existing) {
      return;
    }
    setValues((cur) => {
      const next = { ...cur };
      roles.forEach((r) => {
        const s = suggestPath(existing, cur[r.key]);
        if (s.found) {
          next[r.key] = s.path;
        }
      });
      return next;
    });
  };

  const resetToDefaults = (): void => {
    const out = {} as Record<FolderRole, string>;
    roles.forEach((r) => {
      out[r.key] = folderFor({ isOverhead: project.isOverhead }, r.key, settings.folders);
    });
    setValues(out);
  };

  /** Opraví jen odkaz „Otevřít složku projektu“ (zkrátí ho z podsložky na složku projektu). Žádné složky nezakládá ani nemaže. */
  const repairLink = (): void => {
    setBusy(true);
    setError(undefined);
    repos.projects
      .repairFolderLink(project.projectNumber, user)
      .then((p) => {
        setBusy(false);
        onProjectUpdated(p);
      })
      .catch((e: Error) => {
        setBusy(false);
        setError(e.message);
      });
  };

  const save = (): void => {
    const map: FolderMap = { ...(project.folderMap || {}) };
    roles.forEach((r) => {
      const clean = cleanRelativePath(values[r.key]);
      if (clean !== '') {
        map[r.key] = clean;
      }
    });
    setBusy(true);
    setError(undefined);
    repos.projects
      .saveFolderMap(project.projectNumber, map, user)
      .then((p) => {
        setBusy(false);
        onSaved(p);
      })
      .catch((e: Error) => {
        setBusy(false);
        setError(e.message);
      });
  };

  return (
    <Dialog
      hidden={false}
      onDismiss={busy ? undefined : onClose}
      dialogContentProps={{
        type: DialogType.normal,
        title: `Složky projektu ${project.projectNumber}`,
        subText:
          'Tady je určeno, do které složky projektu aplikace ukládá a kde hledá objednávky, podklady pro fakturaci, zápisy a fotky. Nic se nemaže ani nepřesouvá; ' +
          'složka, která ještě neexistuje, vznikne při prvním uložení dokumentu. Změna šablony složek v Nastavení se u tohoto projektu neprojeví.'
      }}
      modalProps={{ isBlocking: true }}
      minWidth={620}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error && (
          <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>
            {error}
          </MessageBar>
        )}
        <div style={{ fontSize: 12, color: RES.gray }}>
          {project.folderMap ? 'Cesty jsou uložené u tohoto projektu.' : 'Projekt zatím nemá uložené vlastní cesty — používají se výchozí z Nastavení. Uložením se zafixují.'}
        </div>
        {link && link.state !== 'missing' && (
          <MessageBar messageBarType={link.state === 'ok' ? MessageBarType.success : MessageBarType.warning} isMultiline>
            {link.message}
            {link.state === 'deeper' && (
              <>
                {' '}
                <Link disabled={busy} onClick={repairLink}>
                  Opravit odkaz
                </Link>
              </>
            )}
          </MessageBar>
        )}
        {!existing && <Spinner size={SpinnerSize.small} label="Čtu složky projektu…" labelPosition="right" styles={{ root: { justifyContent: 'flex-start' } }} />}
        {existing && (
          <div style={{ fontSize: 12 }}>
            <strong>Skutečné složky v projektu:</strong> {existing.length > 0 ? existing.join(' · ') : 'žádné (nebo se nepodařilo přečíst)'}
          </div>
        )}

        {roles.map((r) => {
          const value = values[r.key];
          const s = existing ? suggestPath(existing, value) : undefined;
          const exact = s && s.found && s.path === cleanRelativePath(value);
          return (
            <div key={r.key}>
              <TextField label={r.label} description={r.purpose} value={value} onChange={(_, v) => set(r.key, v ?? '')} disabled={busy} />
              {s && (
                <div style={{ fontSize: 12, marginTop: 2, color: exact ? RES.greenDark : RES.gray }}>
                  {exact && '✓ Složka existuje.'}
                  {!exact && s.found && (
                    <>
                      Skutečná složka se jmenuje „{s.path}“. <Link onClick={() => set(r.key, s.path)}>Použít</Link>
                    </>
                  )}
                  {!s.found && value.trim() !== '' && 'Složka zatím neexistuje — vznikne při prvním uložení dokumentu.'}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <DialogFooter>
        <PrimaryButton text={busy ? 'Ukládám…' : 'Uložit'} disabled={busy} onClick={save} />
        <DefaultButton text="Navrhnout podle skutečných složek" disabled={busy || !existing} onClick={suggestAll} />
        <DefaultButton text="Výchozí z Nastavení" disabled={busy} onClick={resetToDefaults} />
        <DefaultButton text="Zrušit" disabled={busy} onClick={onClose} />
      </DialogFooter>
    </Dialog>
  );
};
