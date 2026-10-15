/**
 * Šablony ročních plánů servisu (záložka Šablony na stránce Servisní plány): pro každý druh souboru (FVE, BESS…) a pro společné činnosti lokality
 * seznam činností s měsícem (nebo dnem) a druhem (v paušálu / nahodilá). Šablona se v ročním plánu načte do lokality nebo souboru a upraví.
 * Šablony jsou součástí nastavení aplikace, proto je ukládá administrátor; ostatní role je vidí.
 */

import * as React from 'react';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { canDeleteAnyInService } from '../../core/service';
import { DEFAULT_PLAN_TEMPLATES, MONTH_NAMES, PlanTemplate, validatePlanTemplates } from '../../core/servicePlan';
import { PlanTemplatesEditor } from '../settings/PlanTemplatesEditor';
import { TD, TH } from './serviceUi';

export const PlanTemplatesPanel: React.FC = () => {
  const { repos, user, settings, reloadSettings } = useApp();
  const saved = settings.service.planTemplates;
  const [draft, setDraft] = React.useState<PlanTemplate[]>(saved);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [notice, setNotice] = React.useState<string | undefined>(undefined);
  const mayEdit = canDeleteAnyInService(user.roles);
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const problems = validatePlanTemplates(draft);

  React.useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const save = (): void => {
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    repos.settings
      .saveSection('service', { ...settings.service, planTemplates: draft })
      .then(() => reloadSettings())
      .then(() => setNotice('Šablony jsou uložené. Platí pro další načtení šablony do plánu; už vytvořené plány se nemění.'))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .then(() => setSaving(false), () => setSaving(false));
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 13, color: RES.gray, marginBottom: 10 }}>
        Šablona je pojmenovaný seznam činností pro druh souboru (FVE, BESS…) nebo pro společné činnosti lokality. V ročním plánu ji tlačítkem <strong>Načíst ze šablony</strong> vložíte
        do lokality nebo souboru a dál upravíte. Činnost má měsíc (volitelně den) a druh: <strong>plánovaná</strong> je v paušálu, <strong>nahodilá</strong> mimo paušál.
      </div>
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
      {!mayEdit && (
        <MessageBar messageBarType={MessageBarType.info} isMultiline>
          Šablony vidíte jen ke čtení — upravuje je administrátor (jsou součástí nastavení aplikace).
        </MessageBar>
      )}
      {mayEdit ? (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
            <PrimaryButton text={saving ? 'Ukládám…' : 'Uložit šablony'} iconProps={{ iconName: 'Save' }} disabled={!changed || saving || problems.length > 0} onClick={save} />
            <DefaultButton text="Zahodit změny" disabled={!changed || saving} onClick={() => setDraft(saved)} />
            <DefaultButton text="Vrátit výchozí šablony" title="Nahradí šablony výchozím návrhem (FVE, BESS, společné činnosti lokality); platí až po uložení" disabled={saving} onClick={() => setDraft(DEFAULT_PLAN_TEMPLATES.map((t) => ({ ...t, items: t.items.map((i) => ({ ...i })) })))} />
          </div>
          {problems.length > 0 && (
            <MessageBar messageBarType={MessageBarType.warning} isMultiline>
              {problems.map((p) => (
                <div key={p}>{p}</div>
              ))}
            </MessageBar>
          )}
          <PlanTemplatesEditor templates={draft} onChange={setDraft} />
        </>
      ) : (
        saved.map((t) => (
          <div key={t.name} style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: 10, marginBottom: 10 }}>
            <div style={{ fontWeight: 600 }}>
              {t.name} <span style={{ color: RES.gray, fontWeight: 400 }}>· {t.kind}</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
              <thead>
                <tr>
                  <th style={TH}>Činnost</th>
                  <th style={TH}>Kdy</th>
                  <th style={TH}>Druh</th>
                </tr>
              </thead>
              <tbody>
                {t.items.map((i, k) => (
                  <tr key={k} style={{ borderTop: `1px solid ${RES.background}` }}>
                    <td style={TD}>
                      {i.title}
                      {i.description && <div style={{ color: RES.gray, fontSize: 12 }}>{i.description}</div>}
                    </td>
                    <td style={TD}>{i.day ? `${i.day}. ${MONTH_NAMES[i.month - 1]}` : MONTH_NAMES[i.month - 1]}</td>
                    <td style={TD}>{i.jobKind === 'Plánovaná' ? 'Plánovaná (paušál)' : 'Nahodilá'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
};
