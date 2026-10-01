/**
 * Výběr osoby z adresáře firmy (všichni uživatelé tenantu, i ti, kteří na webu ještě nikdy nebyli).
 *
 * Napíše se aspoň 3 znaky jména nebo e-mailu, po krátké odmlce se zobrazí nabídka a kliknutím se osoba vybere. Vybraná osoba je
 * „štítek“ s křížkem. Nabídka je přímo pod polem (ne plovoucí okno), aby fungovala i uvnitř postranního panelu.
 */

import * as React from 'react';
import { TextField } from '@fluentui/react/lib/TextField';
import { Icon } from '@fluentui/react/lib/Icon';
import { IconButton } from '@fluentui/react/lib/Button';
import { Label } from '@fluentui/react/lib/Label';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../AppContext';
import { RES } from '../theme';
import { Person } from '../../core/userAdmin';

export interface PickedPerson {
  name?: string;
  /** Přihlašovací jméno z adresáře; u osob, které se jen přečetly z uložených dat, chybí. */
  login?: string;
}

export const PersonPicker: React.FC<{
  label: string;
  description?: string;
  value: PickedPerson;
  onChange: (value: PickedPerson) => void;
}> = ({ label, description, value, onChange }) => {
  const { repos } = useApp();
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<Person[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    setError(undefined);
    const timer = setTimeout(() => {
      repos.userAdmin
        .searchPeople(q)
        .then((found) => {
          if (!cancelled) {
            setResults(found);
            setSearching(false);
          }
        })
        .catch((e: Error) => {
          if (!cancelled) {
            setError(e.message);
            setSearching(false);
          }
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, repos]);

  if (value.name) {
    return (
      <div>
        <Label>{label}</Label>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: RES.background,
            border: `1px solid ${RES.grayBlue}`,
            borderRadius: 16,
            padding: '2px 4px 2px 12px'
          }}
        >
          <Icon iconName="Contact" />
          <span>{value.name}</span>
          <IconButton
            iconProps={{ iconName: 'Cancel' }}
            ariaLabel={`Zrušit výběr: ${value.name}`}
            title="Zrušit výběr"
            onClick={() => {
              onChange({});
              setQuery('');
            }}
            styles={{ root: { width: 24, height: 24 }, icon: { fontSize: 11 } }}
          />
        </div>
        {description && <div style={{ fontSize: 12, color: RES.gray, marginTop: 4 }}>{description}</div>}
      </div>
    );
  }

  return (
    <div>
      <TextField
        label={label}
        value={query}
        autoComplete="off"
        placeholder="Napište jméno nebo e-mail (aspoň 3 znaky)"
        description={description}
        onChange={(_, v) => setQuery(v ?? '')}
      />
      {searching && <Spinner size={SpinnerSize.xSmall} label="Hledám…" labelPosition="right" styles={{ root: { justifyContent: 'flex-start', marginTop: 4 } }} />}
      {error && <div style={{ fontSize: 12, color: RES.red, marginTop: 4 }}>{error}</div>}
      {!searching && !error && query.trim().length >= 3 && results.length === 0 && (
        <div style={{ fontSize: 12, color: RES.gray, marginTop: 4 }}>Nikdo takový se v adresáři firmy nenašel.</div>
      )}
      {results.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, border: `1px solid ${RES.grayBlue}`, borderRadius: 3, maxHeight: 220, overflowY: 'auto', background: RES.white }}>
          {results.map((p) => (
            <li key={p.loginName}>
              <button
                type="button"
                onClick={() => {
                  onChange({ name: p.displayName, login: p.loginName });
                  setQuery('');
                  setResults([]);
                }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit' }}
              >
                <div style={{ fontWeight: 600 }}>{p.displayName}</div>
                {p.email && <div style={{ fontSize: 12, color: RES.gray }}>{p.email}</div>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
