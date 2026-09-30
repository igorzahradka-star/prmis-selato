/**
 * Číselník výchozích schvalovatelů: koho předvyplnit u kroku vedení a jednatele.
 * U kroku projektového manažera je výchozí vždy PM projektu, proto tu není.
 * Žadatel může předvyplněného schvalovatele při odeslání objednávky změnit.
 */

import * as React from 'react';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { Role } from '../../core/types';
import { RoleMembership } from '../../core/userAdmin';
import { ApprovalSettings } from '../../core/settings';

type Defaults = NonNullable<ApprovalSettings['defaultApprovers']>;

export const DefaultApproversEditor: React.FC<{
  value: ApprovalSettings['defaultApprovers'];
  onChange: (value: Defaults) => void;
}> = ({ value, onChange }) => {
  const { repos, settings } = useApp();
  const [members, setMembers] = React.useState<RoleMembership[] | undefined>(undefined);

  React.useEffect(() => {
    let cancelled = false;
    repos.userAdmin
      .listRoleMembers(settings.roles)
      .then((m) => !cancelled && setMembers(m))
      .catch(() => !cancelled && setMembers([]));
    return () => {
      cancelled = true;
    };
  }, [repos, settings.roles]);

  const current: Defaults = value ?? {};

  const optionsFor = (role: Role, selectedLogin: string | undefined): IDropdownOption[] => {
    const people = (members ?? []).filter((m) => m.role === role).flatMap((m) => m.members);
    const options: IDropdownOption[] = [{ key: '', text: 'Nikdo — schválí kdokoli z role' }];
    const seen: string[] = [];
    people.forEach((p) => {
      if (seen.indexOf(p.loginName) === -1) {
        seen.push(p.loginName);
        options.push({ key: p.loginName, text: p.displayName });
      }
    });
    // Uložený schvalovatel, který už v roli není, zůstane vidět — ať je jasné, že je potřeba ho nahradit.
    if (selectedLogin && seen.indexOf(selectedLogin) === -1) {
      options.push({ key: selectedLogin, text: `${selectedLogin} (už není v roli)` });
    }
    return options;
  };

  const nameOf = (role: Role, login: string): string => {
    const found = (members ?? [])
      .filter((m) => m.role === role)
      .flatMap((m) => m.members)
      .filter((p) => p.loginName === login)[0];
    return found ? found.displayName : login;
  };

  const set = (level: 'vedeni' | 'jednatel', role: Role, login: string): void => {
    const next: Defaults = { ...current };
    if (login === '') {
      delete next[level];
    } else {
      next[level] = { login, name: nameOf(role, login) };
    }
    onChange(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: RES.gray, lineHeight: 1.55 }}>
        <strong>Výchozí schvalovatelé.</strong> U kroku projektového manažera se předvyplní PM projektu. U vedení a
        jednatele tady určíte, koho předvyplnit; žadatel ho při odeslání objednávky může změnit. Když tu nikoho nevyberete,
        krok smí schválit kdokoli z příslušné role.
      </div>
      <Dropdown
        label="Výchozí schvalovatel — vedení"
        options={optionsFor(Role.Vedeni, current.vedeni && current.vedeni.login)}
        selectedKey={current.vedeni ? current.vedeni.login : ''}
        onChange={(_, o) => o && set('vedeni', Role.Vedeni, String(o.key))}
        disabled={members === undefined}
        styles={{ root: { maxWidth: 420 } }}
      />
      <Dropdown
        label="Výchozí schvalovatel — jednatel"
        options={optionsFor(Role.Jednatel, current.jednatel && current.jednatel.login)}
        selectedKey={current.jednatel ? current.jednatel.login : ''}
        onChange={(_, o) => o && set('jednatel', Role.Jednatel, String(o.key))}
        disabled={members === undefined}
        styles={{ root: { maxWidth: 420 } }}
      />
    </div>
  );
};
