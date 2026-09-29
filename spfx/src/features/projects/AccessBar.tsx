/**
 * Pruh o omezeném přístupu — vidí ho jen administrátor, a to u projektu Režie.
 *
 * Ukazuje skutečný stav oprávnění přečtený ze SharePointu, ne to, co si
 * aplikace pamatuje: jen tak je vidět, kdyby někdo omezení ručně zrušil.
 * Ostatní role projekt Režie vůbec nevidí (SharePoint ho před nimi skryje),
 * takže pro ně žádný pruh není potřeba.
 */

import * as React from 'react';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { DefaultButton } from '@fluentui/react/lib/Button';

import { useApp } from '../../ui/AppContext';
import { Project } from '../../core/types';
import {
  OVERHEAD_ACCESS_ROLES,
  ProjectAccessState,
  accessGroupsForRoles,
  isFullyRestricted,
  unexpectedAccess
} from '../../core/projectAccess';

export const AccessBar: React.FC<{ project: Project }> = ({ project }) => {
  const { repos, settings, user } = useApp();
  const [state, setState] = React.useState<ProjectAccessState | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [busy, setBusy] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  const groups = React.useMemo(
    () => accessGroupsForRoles(OVERHEAD_ACCESS_ROLES, settings.roles),
    [settings.roles]
  );

  React.useEffect(() => {
    let cancelled = false;
    repos.projects
      .getAccessState(project)
      .then((s) => {
        if (!cancelled) {
          setState(s);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repos, project, reloadKey]);

  const omezit = (): void => {
    setBusy(true);
    setError(undefined);
    repos.projects
      .restrictAccess(project, user, groups)
      .then(() => {
        setBusy(false);
        setReloadKey((k) => k + 1);
      })
      .catch((e: Error) => {
        setBusy(false);
        setError(e.message);
      });
  };

  if (error) {
    return (
      <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>
        {error}
      </MessageBar>
    );
  }
  if (!state) {
    return null;
  }

  if (!isFullyRestricted(state)) {
    return (
      <MessageBar
        messageBarType={MessageBarType.severeWarning}
        isMultiline
        actions={
          <DefaultButton
            text={busy ? 'Omezuji…' : 'Omezit přístup'}
            disabled={busy}
            onClick={omezit}
          />
        }
      >
        <strong>Režii zatím vidí všichni členové webu.</strong>{' '}
        {state.recordRestricted && state.folderRestricted === false
          ? 'Záznam je omezený, ale složka s dokumenty ještě ne.'
          : 'Omezením ji uvidí jen: ' + groups.map((g) => g.groupName).join(', ') + '.'}
      </MessageBar>
    );
  }

  const navic = unexpectedAccess(state, groups);
  return (
    <MessageBar messageBarType={MessageBarType.success} isMultiline>
      <strong>Přístup je omezený.</strong> Záznam i složku vidí jen: {state.allowed.join(', ')}.
      {navic.length > 0 && ` Mimo očekávané skupiny (${groups.map((g) => g.groupName).join(', ')}) tu má přístup i: ${navic.join(', ')}.`}
    </MessageBar>
  );
};
