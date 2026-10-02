/**
 * Zápisy ze stavby napříč projekty s filtry. Zápis se otevírá v panelu; jeho číslo je v adrese (`#/denik/12`), takže
 * jde poslat odkazem. Nový zápis se zakládá z detailu projektu (záložka Stavební deník) nebo tlačítkem tady.
 */

import * as React from 'react';
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { Toggle } from '@fluentui/react/lib/Toggle';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { PageHeading } from '../../ui/components/PageHeading';
import { CONTROL_HEIGHT, FilterField as Field } from '../../ui/components/FilterField';
import { useAutoRefresh } from '../../ui/useAutoRefresh';
import { navigate, RouteName } from '../../ui/router';
import { DiaryEntry, ENTRY_STATUS_ORDER, canWriteDiary, filterEntries, isHandover } from '../../core/siteDiary';
import { toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { normalizeLogin } from '../../core/roles';
import { Project } from '../../core/types';
import { EntriesTable } from './EntriesTable';
import { EntryPanel } from './EntryPanel';

export const DiaryPage: React.FC<{ entryId?: number }> = ({ entryId }) => {
  const { repos, user } = useApp();
  const [entries, setEntries] = React.useState<DiaryEntry[] | undefined>(undefined);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [search, setSearch] = React.useState('');
  const [statuses, setStatuses] = React.useState<string[]>([]);
  const [onlyMine, setOnlyMine] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setError(undefined);
    Promise.all([repos.diary.listEntries(), repos.projects.list({})])
      .then(([e, p]) => {
        if (!cancelled) {
          setEntries(e);
          setProjects(p);
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
  }, [repos, reloadKey]);

  useAutoRefresh(() => setReloadKey((k) => k + 1), creating || entryId !== undefined);

  const actor = React.useMemo(() => toActor(user), [user]);
  const mayWrite = projects.some((p) => canWriteDiary(toWorkflowProject(p), actor));
  const statusOptions: IDropdownOption[] = ENTRY_STATUS_ORDER.map((s) => ({ key: s, text: s }));
  const me = normalizeLogin(user.loginName);
  const shown = filterEntries((entries ?? []).filter((e) => !isHandover(e)), { search, statuses }).filter((e) => !onlyMine || normalizeLogin(e.createdByLogin) === me);

  return (
    <>
      <PageHeading
        title="Stavební deník"
        subtitle="Zápisy ze stavby a z jednání s dodavateli. Každý zápis má hlavičku, účastníky, body s fotkami a náčrty a úkoly; vznikne z něj PDF a Word."
        action={mayWrite ? <PrimaryButton iconProps={{ iconName: 'Add' }} text="Nový zápis" onClick={() => setCreating(true)} /> : undefined}
      />

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
        <Field label="Hledat">
          <SearchBox
            placeholder="Stavba, účastník, text zápisu…"
            ariaLabel="Hledat v zápisech"
            value={search}
            onChange={(_, v) => setSearch(v ?? '')}
            onClear={() => setSearch('')}
            styles={{ root: { width: 280, height: CONTROL_HEIGHT } }}
          />
        </Field>
        <Field label="Stav">
          <Dropdown
            ariaLabel="Stav zápisu"
            multiSelect
            options={statusOptions}
            selectedKeys={statuses}
            onChange={(_, o) => o && setStatuses((cur) => (o.selected ? [...cur, String(o.key)] : cur.filter((k) => k !== String(o.key))))}
            placeholder="Všechny stavy"
            styles={{ root: { width: 190 } }}
          />
        </Field>
        <Field label="Jen moje">
          <div style={{ height: CONTROL_HEIGHT, display: 'flex', alignItems: 'center' }}>
            <Toggle ariaLabel="Jen moje zápisy" checked={onlyMine} onChange={(_, c) => setOnlyMine(!!c)} styles={{ root: { margin: 0 } }} />
          </div>
        </Field>
        <div style={{ flex: '1 1 auto' }} />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', height: CONTROL_HEIGHT }}>
          {entries && (
            <span style={{ color: RES.gray, fontSize: 12 }}>
              {shown.length} z {entries.length}
            </span>
          )}
          <DefaultButton iconProps={{ iconName: 'Refresh' }} text="Obnovit" onClick={() => setReloadKey((k) => k + 1)} />
        </div>
      </div>

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {!entries && !error && <Spinner size={SpinnerSize.large} label="Načítám zápisy…" />}
      {entries && entries.length === 0 && !error && (
        <MessageBar messageBarType={MessageBarType.info} isMultiline>
          Zatím tu není žádný zápis. {mayWrite ? 'Založte první tlačítkem Nový zápis.' : ''}
        </MessageBar>
      )}
      {entries && entries.length > 0 && shown.length === 0 && <MessageBar messageBarType={MessageBarType.info}>Žádný zápis neodpovídá filtru.</MessageBar>}

      {shown.length > 0 && (
        <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4 }}>
          <EntriesTable entries={shown} onOpen={(id) => navigate(RouteName.Diary, String(id))} />
        </div>
      )}

      <EntryPanel
        isOpen={entryId !== undefined || creating}
        entryId={entryId}
        onDismiss={() => {
          setCreating(false);
          if (entryId !== undefined) {
            navigate(RouteName.Diary);
          }
        }}
        onChanged={() => setReloadKey((k) => k + 1)}
      />
    </>
  );
};
