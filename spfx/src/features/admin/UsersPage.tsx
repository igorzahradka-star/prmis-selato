/**
 * Uživatelé a role (jen administrátor).
 *
 * **Role = členství ve skupině SharePointu.** Tahle stránka je pohodlnější
 * cesta ke stejné věci, kterou jde udělat v Nastavení webu → Oprávnění;
 * navíc rovnou ukazuje, co která role smí a co v nastavení nedává smysl.
 *
 * Co **nedělá**: nezakládá uživatelské účty. Ty vznikají v Microsoftu 365
 * a spravuje je správce tenanta — aplikace k tomu nemá ani oprávnění,
 * ani by to neměla mít.
 */

import * as React from 'react';
import { Pivot, PivotItem } from '@fluentui/react/lib/Pivot';
import { DetailsList, DetailsListLayoutMode, IColumn, SelectionMode } from '@fluentui/react/lib/DetailsList';
import { TextField } from '@fluentui/react/lib/TextField';
import { PrimaryButton, DefaultButton, IconButton } from '@fluentui/react/lib/Button';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Dialog, DialogType, DialogFooter } from '@fluentui/react/lib/Dialog';
import { Persona, PersonaSize } from '@fluentui/react/lib/Persona';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { PageHeading } from '../../ui/components/PageHeading';
import { canOpenAdmin } from '../../core/roles';
import { Role, ROLE_LABELS } from '../../core/types';
import {
  peopleWithRoles,
  roleSetupIssues,
  sortMemberships,
  isMember,
  Person,
  PersonRoles,
  RoleMembership,
  ROLE_PURPOSE
} from '../../core/userAdmin';

export const UsersPage: React.FC = () => {
  const { repos, settings, user } = useApp();

  const [memberships, setMemberships] = React.useState<RoleMembership[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [info, setInfo] = React.useState<string | undefined>(undefined);
  const [busy, setBusy] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [addTo, setAddTo] = React.useState<RoleMembership | undefined>(undefined);
  const [toRemove, setToRemove] = React.useState<{ membership: RoleMembership; person: Person } | undefined>(
    undefined
  );

  React.useEffect(() => {
    let cancelled = false;
    setMemberships(undefined);
    setError(undefined);
    repos.userAdmin
      .listRoleMembers(settings.roles)
      .then((data) => {
        if (!cancelled) {
          setMemberships(sortMemberships(data));
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
  }, [repos, settings.roles, reloadKey]);

  if (!canOpenAdmin(user.roles)) {
    return (
      <MessageBar messageBarType={MessageBarType.warning} isMultiline>
        Správu uživatelů a rolí vidí jen administrátor PRM.
      </MessageBar>
    );
  }

  const refresh = (): void => setReloadKey((k) => k + 1);

  const zalozitSkupiny = (): void => {
    setBusy(true);
    setError(undefined);
    setInfo(undefined);
    repos.userAdmin
      .ensureRoleGroups(settings.roles)
      .then((r) => {
        setBusy(false);
        const casti: string[] = [];
        if (r.created.length > 0) {
          casti.push(`Založeno: ${r.created.join(', ')}.`);
        }
        if (r.granted.length > 0) {
          casti.push(
            `Oprávnění na webu: ${r.granted.map((g) => `${g.groupName} → ${g.level}`).join(', ')}.`
          );
        }
        setInfo(
          casti.length === 0
            ? 'Všechny skupiny už existovaly a mají oprávnění, nic se nemění.'
            : `${casti.join(' ')} Oprávnění půjde kdykoli upravit v Nastavení webu.`
        );
        refresh();
      })
      .catch((e: Error) => {
        setBusy(false);
        setError(e.message);
      });
  };

  const odebrat = (): void => {
    if (!toRemove) {
      return;
    }
    setBusy(true);
    setError(undefined);
    repos.userAdmin
      .removeFromRole(toRemove.membership.groupName, toRemove.person.id)
      .then(() => {
        setBusy(false);
        setToRemove(undefined);
        refresh();
      })
      .catch((e: Error) => {
        setBusy(false);
        setToRemove(undefined);
        setError(e.message);
      });
  };

  const issues = memberships ? roleSetupIssues(memberships) : [];
  const lide = memberships ? peopleWithRoles(memberships) : [];

  return (
    <>
      <PageHeading
        title="Uživatelé a role"
        subtitle="Kdo smí v aplikaci co. Role odpovídají skupinám SharePointu."
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <DefaultButton
              iconProps={{ iconName: 'Refresh' }}
              text="Načíst znovu"
              onClick={refresh}
              disabled={busy}
            />
            <DefaultButton
              iconProps={{ iconName: 'AddGroup' }}
              text="Založit chybějící skupiny"
              onClick={zalozitSkupiny}
              disabled={busy}
            />
          </div>
        }
      />

      <MessageBar messageBarType={MessageBarType.info} isMultiline>
        Aplikace <strong>nezakládá uživatelské účty</strong> — ty vznikají v Microsoftu 365 a spravuje
        je správce tenanta. Tady se lidem, kteří účet už mají, přiděluje role v PRM. Změna se projeví,
        až se dotyčný příště přihlásí nebo načte stránku znovu.
      </MessageBar>

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>
          {error}
        </MessageBar>
      )}
      {info && (
        <MessageBar messageBarType={MessageBarType.success} isMultiline onDismiss={() => setInfo(undefined)}>
          {info}
        </MessageBar>
      )}

      {issues.map((i) => (
        <MessageBar
          key={i.message}
          messageBarType={
            i.severity === 'error'
              ? MessageBarType.error
              : i.severity === 'warning'
                ? MessageBarType.warning
                : MessageBarType.info
          }
          isMultiline
        >
          {i.message}
        </MessageBar>
      ))}

      {!memberships && !error && <Spinner size={SpinnerSize.large} label="Načítám role…" />}

      {memberships && (
        <Pivot styles={{ root: { marginTop: 12 } }} overflowBehavior="menu" overflowAriaLabel="Další záložky">
          <PivotItem headerText="Podle rolí" itemIcon="SecurityGroup">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
              {memberships.map((m) => (
                <RoleCard
                  key={m.role}
                  membership={m}
                  disabled={busy}
                  onAdd={() => setAddTo(m)}
                  onRemove={(person) => setToRemove({ membership: m, person })}
                />
              ))}
            </div>
          </PivotItem>

          <PivotItem headerText="Podle lidí" itemIcon="People">
            <PeopleTable people={lide} />
          </PivotItem>
        </Pivot>
      )}

      {addTo && (
        <AddPersonDialog
          membership={addTo}
          onDismiss={() => setAddTo(undefined)}
          onAdded={() => {
            setAddTo(undefined);
            refresh();
          }}
        />
      )}

      <Dialog
        hidden={!toRemove}
        onDismiss={() => setToRemove(undefined)}
        dialogContentProps={{ type: DialogType.normal, title: 'Odebrat roli?' }}
        modalProps={{ isBlocking: true }}
      >
        <div style={{ fontSize: 13 }}>
          {toRemove && (
            <>
              <strong>{toRemove.person.displayName}</strong> přijde o roli{' '}
              <strong>{ROLE_LABELS[toRemove.membership.role]}</strong>. Účet v Microsoftu 365 mu zůstane,
              odebere se jen ze skupiny „{toRemove.membership.groupName}&ldquo;.
            </>
          )}
        </div>
        <DialogFooter>
          <PrimaryButton text={busy ? 'Odebírám…' : 'Odebrat'} disabled={busy} onClick={odebrat} />
          <DefaultButton text="Zrušit" disabled={busy} onClick={() => setToRemove(undefined)} />
        </DialogFooter>
      </Dialog>
    </>
  );
};

/** Jedna role: co smí, kdo v ní je, tlačítko na přidání. */
const RoleCard: React.FC<{
  membership: RoleMembership;
  disabled: boolean;
  onAdd: () => void;
  onRemove: (person: Person) => void;
}> = ({ membership, disabled, onAdd, onRemove }) => (
  <section
    style={{
      background: RES.white,
      border: `1px solid ${membership.groupExists ? RES.grayBlue : RES.red}`,
      borderRadius: 4,
      padding: '14px 18px'
    }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: RES.navy }}>
          {ROLE_LABELS[membership.role]}{' '}
          <span style={{ fontWeight: 400, fontSize: 12, color: RES.gray }}>
            ({membership.members.length})
          </span>
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: RES.gray, lineHeight: 1.5 }}>
          {ROLE_PURPOSE[membership.role]}
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: RES.gray }}>
          Skupina SharePointu: <code>{membership.groupName || '—'}</code>
          {!membership.groupExists && (
            <strong style={{ color: RES.red }}> · skupina neexistuje</strong>
          )}
        </p>
      </div>
      <DefaultButton
        iconProps={{ iconName: 'AddFriend' }}
        text="Přidat"
        onClick={onAdd}
        disabled={disabled || !membership.groupExists}
      />
    </div>

    {membership.members.length > 0 && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {membership.members.map((p) => (
          <div
            key={p.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: RES.background,
              borderRadius: 16,
              padding: '2px 4px 2px 8px'
            }}
          >
            <Persona text={p.displayName} secondaryText={p.email} size={PersonaSize.size24} />
            <IconButton
              iconProps={{ iconName: 'Cancel' }}
              title={`Odebrat ${p.displayName} z role`}
              ariaLabel={`Odebrat ${p.displayName} z role`}
              onClick={() => onRemove(p)}
              disabled={disabled}
              styles={{ root: { height: 24, width: 24 } }}
            />
          </div>
        ))}
      </div>
    )}

    {membership.groupExists && membership.members.length === 0 && (
      <p style={{ margin: '10px 0 0', fontSize: 12, color: RES.gray, fontStyle: 'italic' }}>
        Tuhle roli zatím nemá nikdo.
      </p>
    )}
  </section>
);

/** Opačný pohled: člověk a všechny jeho role. Rychle ukáže, kdo toho smí moc. */
const PeopleTable: React.FC<{ people: PersonRoles[] }> = ({ people }) => {
  if (people.length === 0) {
    return (
      <MessageBar messageBarType={MessageBarType.info} styles={{ root: { marginTop: 16 } }}>
        Zatím nemá roli nikdo.
      </MessageBar>
    );
  }

  const columns: IColumn[] = [
    {
      key: 'person',
      name: 'Člověk',
      minWidth: 200,
      maxWidth: 280,
      isResizable: true,
      onRender: (r: PersonRoles) => (
        <Persona text={r.person.displayName} secondaryText={r.person.email} size={PersonaSize.size32} />
      )
    },
    {
      key: 'roles',
      name: 'Role',
      minWidth: 280,
      isResizable: true,
      onRender: (r: PersonRoles) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingTop: 6 }}>
          {r.roles.map((role) => (
            <span
              key={role}
              style={{
                background: role === Role.Administrator ? RES.navy : RES.bluePale,
                color: role === Role.Administrator ? RES.white : RES.navy,
                borderRadius: 3,
                padding: '1px 7px',
                fontSize: 11,
                fontWeight: 600
              }}
            >
              {ROLE_LABELS[role]}
            </span>
          ))}
        </div>
      )
    }
  ];

  return (
    <div style={{ marginTop: 16 }}>
      <DetailsList
        items={people}
        columns={columns}
        selectionMode={SelectionMode.none}
        layoutMode={DetailsListLayoutMode.justified}
      />
    </div>
  );
};

/** Vyhledání člověka v adresáři firmy a přidání do role. */
const AddPersonDialog: React.FC<{
  membership: RoleMembership;
  onDismiss: () => void;
  onAdded: () => void;
}> = ({ membership, onDismiss, onAdded }) => {
  const { repos } = useApp();

  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<Person[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  // Hledá se až po odmlce — jinak by každé písmeno znamenalo dotaz do adresáře.
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
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

  const pridat = (person: Person): void => {
    setAdding(true);
    setError(undefined);
    repos.userAdmin
      .addToRole(membership.groupName, person.loginName)
      .then(() => {
        setAdding(false);
        onAdded();
      })
      .catch((e: Error) => {
        setAdding(false);
        setError(e.message);
      });
  };

  return (
    <Dialog
      hidden={false}
      onDismiss={onDismiss}
      dialogContentProps={{
        type: DialogType.normal,
        title: `Přidat do role ${ROLE_LABELS[membership.role]}`,
        subText: ROLE_PURPOSE[membership.role]
      }}
      modalProps={{ isBlocking: true }}
      minWidth={480}
    >
      <TextField
        label="Jméno nebo e-mail"
        description="Hledá v adresáři firmy. Zadejte aspoň tři písmena."
        value={query}
        onChange={(_, v) => setQuery(v ?? '')}
        autoFocus
      />

      {searching && <Spinner size={SpinnerSize.small} label="Hledám…" styles={{ root: { marginTop: 12 } }} />}

      {!searching && query.trim().length >= 3 && results.length === 0 && (
        <MessageBar messageBarType={MessageBarType.info} styles={{ root: { marginTop: 12 } }}>
          Nikdo takový se nenašel. Zkontrolujte zápis, nebo se zeptejte správce Microsoftu 365,
          jestli má ten člověk účet.
        </MessageBar>
      )}

      {results.length > 0 && (
        <div style={{ marginTop: 12, maxHeight: 260, overflowY: 'auto' }}>
          {results.map((p) => {
            const uzJeClenem = isMember(membership, p.loginName);
            return (
              <div
                key={p.loginName}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 4px',
                  borderBottom: `1px solid ${RES.background}`
                }}
              >
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <Persona text={p.displayName} secondaryText={p.email} size={PersonaSize.size32} />
                </div>
                {uzJeClenem ? (
                  <span style={{ fontSize: 12, color: RES.gray }}>už tu roli má</span>
                ) : (
                  <PrimaryButton text="Přidat" disabled={adding} onClick={() => pridat(p)} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline styles={{ root: { marginTop: 12 } }}>
          {error}
        </MessageBar>
      )}

      <DialogFooter>
        <DefaultButton text="Zavřít" onClick={onDismiss} disabled={adding} />
      </DialogFooter>
    </Dialog>
  );
};
