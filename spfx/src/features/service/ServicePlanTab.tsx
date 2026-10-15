/**
 * Roční plán servisu: plánované činnosti lokalit a souborů na kalendářní rok. Kalendář po měsících nebo seznam; filtr podle roku, lokality
 * a souborů. Plán jde načíst ze šablony (FVE, BESS…), zkopírovat do dalšího roku a uložit jako šablonu; z položky vzniká servisní požadavek.
 */

import * as React from 'react';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Checkbox } from '@fluentui/react/lib/Checkbox';
import { IContextualMenuItem } from '@fluentui/react/lib/ContextualMenu';
import { ChoiceGroup } from '@fluentui/react/lib/ChoiceGroup';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { TextField } from '@fluentui/react/lib/TextField';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { ServiceDevice, ServiceSite, canDeleteAnyInService } from '../../core/service';
import {
  MONTH_NAMES,
  PLAN_JOB_KINDS,
  PlanItem,
  PlanItemState,
  copyPlanItems,
  filterPlan,
  instantiateTemplate,
  periodLabel,
  planByMonth,
  planItemState,
  templateFromItems
} from '../../core/servicePlan';
import { cleanChecklist, evaluateChecklist, isEmptyChecklist } from '../../core/serviceCatalog';
import { SERVICE_CATALOG as CATALOG } from '../../core/serviceCatalog.data';
import { newPlanItemsOnly, planFromChecklist } from '../../core/servicePlanCatalog';
import { PlanItemInput } from '../../data/repositories';
import { DATE_INPUT, TD, TH, dateToInput, inputToDate } from './serviceUi';

const STATE_COLOR: Record<PlanItemState, string> = { hotovo: '#2E9E5B', 'po-terminu': '#C4314B', 'tento-mesic': '#0268A6', budouci: '#9AA3AD' };
const STATE_LABEL: Record<PlanItemState, string> = { hotovo: 'požadavek vytvořen', 'po-terminu': 'po termínu', 'tento-mesic': 'aktuální', budouci: 'naplánováno' };

const kindText = (k: string): string => (k === 'Plánovaná' ? 'Plánovaná — v paušálu' : 'Nahodilá — mimo paušál');

export const ServicePlanTab: React.FC<{
  sites: ServiceSite[];
  devices: ServiceDevice[];
  mayManage: boolean;
  mayWork: boolean;
  onRequestCreated: () => void;
}> = ({ sites, devices, mayManage, mayWork, onRequestCreated }) => {
  const { repos, user, settings, reloadSettings } = useApp();
  const thisYear = new Date().getFullYear();
  const [plan, setPlan] = React.useState<PlanItem[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [notice, setNotice] = React.useState<string | undefined>(undefined);
  const [year, setYear] = React.useState(thisYear);
  const [site, setSite] = React.useState('');
  const [devs, setDevs] = React.useState<string[]>([]);
  const [view, setView] = React.useState<'kalendar' | 'seznam'>('kalendar');
  const [reloadKey, setReloadKey] = React.useState(0);
  const [editing, setEditing] = React.useState<{ item?: PlanItem } | undefined>(undefined);
  const [templateDlg, setTemplateDlg] = React.useState(false);
  const [checklistDlg, setChecklistDlg] = React.useState(false);
  const [copyDlg, setCopyDlg] = React.useState(false);
  const [saveTplDlg, setSaveTplDlg] = React.useState(false);
  const [selected, setSelected] = React.useState<number[]>([]);
  const [deleteDlg, setDeleteDlg] = React.useState<PlanItem[] | undefined>(undefined);
  const isAdmin = canDeleteAnyInService(user.roles);

  React.useEffect(() => {
    let cancelled = false;
    repos.service
      .listPlan()
      .then((l) => {
        if (!cancelled) {
          setPlan(l);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setPlan([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repos, reloadKey]);

  const reload = (): void => setReloadKey((k) => k + 1);
  const activeSites = sites.filter((s) => s.isActive);
  const deviceOptions = [
    ...(site ? [{ key: site, text: 'Celá lokalita (společné činnosti)' }] : []),
    ...devices.filter((d) => d.isActive && (!site || d.siteNumber === site)).map((d) => ({ key: d.number, text: `${d.number} ${d.name}` }))
  ];
  const shown = filterPlan(plan ?? [], { year, site, devices: devs });
  const byMonth = planByMonth(shown);
  const label = (i: Pick<PlanItem, 'siteNumber' | 'deviceNumber'>): string => {
    const d = i.deviceNumber ? devices.filter((x) => x.number === i.deviceNumber)[0] : undefined;
    const s = sites.filter((x) => x.number === i.siteNumber)[0];
    return d ? `${d.number} ${d.name}` : s ? `${s.number} ${s.name} (celá lokalita)` : i.siteNumber;
  };
  const today = new Date();
  const shownIds = shown.map((i) => i.id).join(',');
  React.useEffect(() => {
    setSelected((cur) => cur.filter((id) => shown.some((i) => i.id === id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownIds]);
  const stats = {
    pausal: shown.filter((i) => i.jobKind === 'Plánovaná').length,
    extra: shown.filter((i) => i.jobKind !== 'Plánovaná').length,
    late: shown.filter((i) => planItemState(i, today) === 'po-terminu').length
  };
  const addMenu: IContextualMenuItem[] = [
    { key: 'one', text: 'Jednu činnost…', iconProps: { iconName: 'Add' }, disabled: activeSites.length === 0, onClick: () => setEditing({}) },
    { key: 'checklist', text: 'Z checklistu lokality…', iconProps: { iconName: 'CheckList' }, disabled: activeSites.length === 0, onClick: () => setChecklistDlg(true) },
    { key: 'template', text: 'Ze šablony…', iconProps: { iconName: 'Library' }, disabled: activeSites.length === 0, onClick: () => setTemplateDlg(true) },
    { key: 'copy', text: 'Zkopírovat zobrazené do jiného roku…', iconProps: { iconName: 'Copy' }, disabled: shown.length === 0, onClick: () => setCopyDlg(true) }
  ];
  const moreMenu: IContextualMenuItem[] = [
    { key: 'delete', text: 'Smazat všechny zobrazené položky…', iconProps: { iconName: 'Delete' }, disabled: shown.length === 0, onClick: () => setDeleteDlg(shown) },
    ...(isAdmin ? [{ key: 'tpl', text: 'Uložit zobrazené jako šablonu…', iconProps: { iconName: 'SaveTemplate' }, disabled: shown.length === 0, onClick: () => setSaveTplDlg(true) }] : [])
  ];

  const createRequest = (item: PlanItem): void => {
    setError(undefined);
    repos.service
      .createRequestFromPlan(item.id, user)
      .then((req) => {
        setNotice(`Požadavek ${req.number} je vytvořený z plánu.`);
        setEditing(undefined);
        reload();
        onRequestCreated();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };

  const chip = (i: PlanItem): React.ReactNode => {
    const st = planItemState(i, today);
    const planned = i.jobKind === 'Plánovaná';
    return (
      <div
        key={i.id}
        role="button"
        tabIndex={0}
        onClick={() => setEditing({ item: i })}
        onKeyDown={(e) => e.key === 'Enter' && setEditing({ item: i })}
        title={`${i.title} — ${periodLabel(i)} — ${planned ? 'v paušálu' : 'mimo paušál'} — ${STATE_LABEL[st]}`}
        style={{ cursor: 'pointer', background: planned ? '#E4F6EC' : '#FDE4CF', borderLeft: `4px solid ${STATE_COLOR[st]}`, borderRadius: 3, padding: '4px 8px', marginBottom: 4, fontSize: 12 }}
      >
        <div style={{ fontWeight: 600 }}>
          {st === 'hotovo' ? '✓ ' : st === 'po-terminu' ? '! ' : ''}
          {i.title}
        </div>
        <div style={{ color: RES.gray }}>
          {label(i)}
          {i.dueDate ? ` · ${i.dueDate.getDate()}. ${i.dueDate.getMonth() + 1}.` : ''}
        </div>
      </div>
    );
  };

  return (
    <div style={{ marginTop: 10 }}>
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
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
        <Dropdown label="Rok" selectedKey={year} options={[thisYear - 1, thisYear, thisYear + 1, thisYear + 2, thisYear + 3].map((y) => ({ key: y, text: String(y) }))} onChange={(_, o) => o && setYear(Number(o.key))} styles={{ root: { width: 100 } }} />
        <Dropdown
          label="Lokalita"
          selectedKey={site}
          options={[{ key: '', text: 'Všechny lokality' }, ...activeSites.map((s) => ({ key: s.number, text: `${s.number} ${s.name}` }))]}
          onChange={(_, o) => {
            if (o) {
              setSite(String(o.key));
              setDevs([]);
            }
          }}
          styles={{ root: { width: 230 } }}
        />
        <Dropdown
          label="Soubory"
          multiSelect
          placeholder="Všechny soubory"
          selectedKeys={devs}
          options={deviceOptions}
          onChange={(_, o) => o && setDevs((cur) => (o.selected ? [...cur, String(o.key)] : cur.filter((k) => k !== String(o.key))))}
          styles={{ root: { width: 260 } }}
        />
        <ChoiceGroup
          label="Zobrazení"
          selectedKey={view}
          options={[{ key: 'kalendar', text: 'Kalendář' }, { key: 'seznam', text: 'Seznam' }]}
          onChange={(_, o) => o && setView(o.key as 'kalendar' | 'seznam')}
          styles={{ flexContainer: { display: 'flex', gap: 12 } }}
        />
        <span style={{ flex: '1 1 auto' }} />
        {mayManage && <PrimaryButton iconProps={{ iconName: 'Add' }} text="Přidat do plánu" menuProps={{ items: addMenu }} />}
        {mayManage && <DefaultButton text="Další" menuProps={{ items: moreMenu }} />}
      </div>
      <div style={{ fontSize: 13, marginBottom: 6 }}>
        Zobrazeno <strong>{shown.length}</strong> činností na rok {year}
        {shown.length > 0 && (
          <span style={{ color: RES.gray }}>
            {' '}
            · {stats.pausal} v paušálu · {stats.extra} mimo paušál{stats.late > 0 ? ` · ${stats.late} po termínu` : ''}
          </span>
        )}
        <details style={{ display: 'inline-block', marginLeft: 12, fontSize: 12, color: RES.gray }}>
          <summary style={{ cursor: 'pointer' }}>Legenda</summary>
          Zeleně činnosti v paušálu, oranžově nahodilé (mimo paušál). Proužek vlevo: červený = po termínu, modrý = aktuální, zelený = požadavek už vytvořen. Kliknutím na činnost ji upravíte nebo z ní vytvoříte servisní požadavek.
        </details>
      </div>
      {!plan && <Spinner size={SpinnerSize.large} label="Načítám plán…" />}
      {plan && shown.length === 0 && (
        <MessageBar messageBarType={MessageBarType.info} isMultiline>
          Pro tento výběr zatím není v plánu na rok {year} žádná činnost. {mayManage ? 'Použijte Přidat do plánu → Z checklistu lokality, Ze šablony, nebo přidejte jednu činnost.' : ''}
        </MessageBar>
      )}
      {plan && shown.length > 0 && view === 'kalendar' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {byMonth.map((items, m) => (
            <div key={m} style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, minHeight: 90 }}>
              <div style={{ background: year === today.getFullYear() && m === today.getMonth() ? RES.bluePale : RES.background, padding: '4px 10px', fontWeight: 600, textTransform: 'capitalize' }}>
                {MONTH_NAMES[m]} {year}
              </div>
              <div style={{ padding: 6 }}>{items.length === 0 ? <span style={{ color: RES.gray, fontSize: 12 }}>—</span> : items.map(chip)}</div>
            </div>
          ))}
        </div>
      )}
      {plan && shown.length > 0 && view === 'seznam' && mayManage && selected.length > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: RES.bluePale, padding: '6px 10px', marginBottom: 6, borderRadius: 3 }}>
          <strong>Vybráno {selected.length}</strong>
          <DefaultButton iconProps={{ iconName: 'Delete' }} text="Smazat vybrané…" onClick={() => setDeleteDlg(shown.filter((i) => selected.indexOf(i.id) >= 0))} />
          <DefaultButton text="Zrušit výběr" onClick={() => setSelected([])} />
        </div>
      )}
      {plan && shown.length > 0 && view === 'seznam' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: RES.white, border: `1px solid ${RES.grayBlue}` }}>
            <thead>
              <tr>
                {mayManage && (
                  <th style={{ ...TH, width: 36 }}>
                    <Checkbox ariaLabel="Vybrat všechny zobrazené" checked={selected.length === shown.length && shown.length > 0} indeterminate={selected.length > 0 && selected.length < shown.length} onChange={(_, v) => setSelected(v ? shown.map((i) => i.id) : [])} />
                  </th>
                )}
                <th style={TH}>Období</th>
                <th style={TH}>Lokalita / soubor</th>
                <th style={TH}>Činnost</th>
                <th style={TH}>Druh</th>
                <th style={TH}>Stav</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => {
                const st = planItemState(i, today);
                return (
                  <tr key={i.id} style={{ borderTop: `1px solid ${RES.background}`, cursor: 'pointer', background: selected.indexOf(i.id) >= 0 ? RES.bluePale : undefined }} onClick={() => setEditing({ item: i })}>
                    {mayManage && (
                      <td style={TD} onClick={(e) => e.stopPropagation()}>
                        <Checkbox ariaLabel={`Vybrat ${i.title}`} checked={selected.indexOf(i.id) >= 0} onChange={(_, v) => setSelected((cur) => (v ? [...cur, i.id] : cur.filter((x) => x !== i.id)))} />
                      </td>
                    )}
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>{periodLabel(i)}</td>
                    <td style={TD}>{label(i)}</td>
                    <td style={TD}>
                      <strong>{i.title}</strong>
                      {i.description && <div style={{ color: RES.gray, fontSize: 12 }}>{i.description}</div>}
                    </td>
                    <td style={TD}>{kindText(i.jobKind)}</td>
                    <td style={{ ...TD, color: STATE_COLOR[st], fontWeight: 600 }}>
                      {STATE_LABEL[st]}
                      {i.requestNumber ? ` (${i.requestNumber})` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <PlanItemDialog
          item={editing.item}
          defaultYear={year}
          defaultSite={site}
          sites={activeSites}
          devices={devices}
          mayManage={mayManage}
          mayWork={mayWork}
          onClose={() => setEditing(undefined)}
          onSave={(input) =>
            repos.service.savePlanItem(input, user).then(() => {
              setEditing(undefined);
              reload();
            })
          }
          onDelete={(id) =>
            repos.service.deletePlanItem(id, user).then(() => {
              setEditing(undefined);
              reload();
            })
          }
          onCreateRequest={createRequest}
        />
      )}
      {checklistDlg && (
        <ChecklistPlanDialog
          sites={activeSites}
          devices={devices}
          plan={plan || []}
          year={year}
          defaultSite={site}
          onClose={() => setChecklistDlg(false)}
          onApply={(items) =>
            repos.service.createPlanItems(items, user).then((created) => {
              setChecklistDlg(false);
              setNotice(`Z checklistu se do plánu přidalo ${created.length} činností.`);
              reload();
            })
          }
        />
      )}
      {templateDlg && (
        <TemplateDialog
          sites={activeSites}
          devices={devices}
          templates={settings.service.planTemplates}
          year={year}
          defaultSite={site}
          onClose={() => setTemplateDlg(false)}
          onApply={(items) =>
            repos.service.createPlanItems(items, user).then((created) => {
              setTemplateDlg(false);
              setNotice(`Ze šablony se do plánu přidalo ${created.length} činností.`);
              reload();
            })
          }
        />
      )}
      {copyDlg && (
        <CopyDialog
          count={shown.length}
          fromYear={year}
          onClose={() => setCopyDlg(false)}
          onApply={(toYear) =>
            repos.service.createPlanItems(copyPlanItems(shown, toYear), user).then((created) => {
              setCopyDlg(false);
              setYear(toYear);
              setNotice(`Do plánu na rok ${toYear} se zkopírovalo ${created.length} činností.`);
              reload();
            })
          }
        />
      )}
      {deleteDlg && (
        <DeleteItemsDialog
          items={deleteDlg}
          year={year}
          onClose={() => setDeleteDlg(undefined)}
          onApply={() =>
            repos.service.deletePlanItems(deleteDlg.map((i) => i.id), user).then((n) => {
              setDeleteDlg(undefined);
              setSelected([]);
              setNotice(`Z plánu se smazalo ${n} činností. V SharePointu jsou v koši webu, odkud jdou obnovit.`);
              reload();
            })
          }
        />
      )}
      {saveTplDlg && (
        <SaveTemplateDialog
          onClose={() => setSaveTplDlg(false)}
          onApply={async (name, kind) => {
            const tpl = templateFromItems(name, kind, shown);
            const others = settings.service.planTemplates.filter((t) => t.name.trim().toLocaleLowerCase('cs-CZ') !== tpl.name.toLocaleLowerCase('cs-CZ'));
            await repos.settings.saveSection('service', { ...settings.service, planTemplates: [...others, tpl] });
            await reloadSettings();
            setSaveTplDlg(false);
            setNotice(`Šablona „${tpl.name}“ je uložená (${tpl.items.length} činností).`);
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

/** Sdílená kostra dialogu s chybou, potvrzením a zrušením. */
const DialogShell: React.FC<{ title: string; subText?: string; error?: string; busy: boolean; confirm?: string; onConfirm?: () => void; onClose: () => void; extra?: React.ReactNode; children: React.ReactNode }> = ({ title, subText, error, busy, confirm, onConfirm, onClose, extra, children }) => (
  <Dialog hidden={false} onDismiss={busy ? undefined : onClose} dialogContentProps={{ type: DialogType.normal, title, subText }} modalProps={{ isBlocking: true }} minWidth={580}>
    {error && (
      <MessageBar messageBarType={MessageBarType.error} isMultiline>
        {error}
      </MessageBar>
    )}
    {children}
    <DialogFooter>
      {confirm && onConfirm && <PrimaryButton text={busy ? 'Ukládám…' : confirm} disabled={busy} onClick={onConfirm} />}
      {extra}
      <DefaultButton text="Zavřít" disabled={busy} onClick={onClose} />
    </DialogFooter>
  </Dialog>
);

function useAsync(): { busy: boolean; error?: string; run: (job: () => Promise<unknown>) => void } {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const run = (job: () => Promise<unknown>): void => {
    setBusy(true);
    setError(undefined);
    job().then(
      () => setBusy(false),
      (e: unknown) => {
        setBusy(false);
        setError(e instanceof Error ? e.message : String(e));
      }
    );
  };
  return { busy, error, run };
}

const PlanItemDialog: React.FC<{
  item?: PlanItem;
  defaultYear: number;
  defaultSite: string;
  sites: ServiceSite[];
  devices: ServiceDevice[];
  mayManage: boolean;
  mayWork: boolean;
  onClose: () => void;
  onSave: (input: PlanItemInput) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  onCreateRequest: (item: PlanItem) => void;
}> = ({ item, defaultYear, defaultSite, sites, devices, mayManage, mayWork, onClose, onSave, onDelete, onCreateRequest }) => {
  const [siteNumber, setSiteNumber] = React.useState(item ? item.siteNumber : defaultSite || (sites[0] ? sites[0].number : ''));
  const [deviceNumber, setDeviceNumber] = React.useState(item && item.deviceNumber ? item.deviceNumber : '');
  const [title, setTitle] = React.useState(item ? item.title : '');
  const [description, setDescription] = React.useState(item ? item.description ?? '' : '');
  const [mode, setMode] = React.useState<'mesic' | 'datum'>(item && item.dueDate ? 'datum' : 'mesic');
  const [month, setMonth] = React.useState(item ? item.month : new Date().getMonth() + 1);
  const [date, setDate] = React.useState(dateToInput(item ? item.dueDate : undefined));
  const [kind, setKind] = React.useState(item ? item.jobKind : 'Plánovaná');
  const [note, setNote] = React.useState(item ? item.note ?? '' : '');
  const { busy, error, run } = useAsync();
  const year = item ? item.year : defaultYear;
  const editable = mayManage;

  const save = (): void => {
    const due = mode === 'datum' ? inputToDate(date) : undefined;
    if (mode === 'datum' && !due) {
      run(() => Promise.reject(new Error('Vyplňte konkrétní datum, nebo zvolte jen měsíc.')));
      return;
    }
    run(() =>
      onSave({
        id: item ? item.id : undefined,
        year: due ? due.getFullYear() : year,
        siteNumber,
        deviceNumber: deviceNumber || undefined,
        title,
        description: description.trim() || undefined,
        month: due ? due.getMonth() + 1 : month,
        dueDate: due,
        jobKind: kind,
        note: note.trim() || undefined
      })
    );
  };

  return (
    <DialogShell
      title={item ? 'Činnost v ročním plánu' : `Nová činnost v plánu na rok ${year}`}
      subText={item && item.requestId ? `Z činnosti už vznikl požadavek ${item.requestNumber || item.requestId}.` : undefined}
      error={error}
      busy={busy}
      confirm={editable ? 'Uložit' : undefined}
      onConfirm={editable ? save : undefined}
      onClose={onClose}
      extra={
        <>
          {item && mayWork && !item.requestId && <DefaultButton iconProps={{ iconName: 'Add' }} text="Vytvořit servisní požadavek" disabled={busy} onClick={() => onCreateRequest(item)} />}
          {item && editable && <DefaultButton iconProps={{ iconName: 'Delete' }} text="Smazat činnost" disabled={busy} onClick={() => run(() => onDelete(item.id))} />}
        </>
      }
    >
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Dropdown label="Lokalita" required disabled={!editable || !!item} selectedKey={siteNumber} options={sites.map((s) => ({ key: s.number, text: `${s.number} ${s.name}` }))} onChange={(_, o) => { if (o) { setSiteNumber(String(o.key)); setDeviceNumber(''); } }} styles={{ root: { flex: '1 1 240px' } }} />
        <Dropdown label="Soubor" disabled={!editable || !!item} selectedKey={deviceNumber} options={[{ key: '', text: '— celá lokalita —' }, ...devices.filter((d) => d.siteNumber === siteNumber && d.isActive).map((d) => ({ key: d.number, text: `${d.number} ${d.name}` }))]} onChange={(_, o) => o && setDeviceNumber(String(o.key))} styles={{ root: { flex: '1 1 240px' } }} />
      </div>
      <TextField label="Činnost (preventivní úkon)" required disabled={!editable} value={title} onChange={(_, v) => setTitle(v ?? '')} />
      <TextField label="Popis" multiline rows={3} disabled={!editable} value={description} onChange={(_, v) => setDescription(v ?? '')} />
      <ChoiceGroup
        label="Kdy"
        selectedKey={mode}
        disabled={!editable}
        options={[{ key: 'mesic', text: 'Jen měsíc v roce' }, { key: 'datum', text: 'Konkrétní datum' }]}
        onChange={(_, o) => o && setMode(o.key as 'mesic' | 'datum')}
        styles={{ flexContainer: { display: 'flex', gap: 16 } }}
      />
      {mode === 'mesic' ? (
        <Dropdown label="Měsíc" disabled={!editable} selectedKey={month} options={MONTH_NAMES.map((n, i) => ({ key: i + 1, text: `${n} ${year}` }))} onChange={(_, o) => o && setMonth(Number(o.key))} styles={{ root: { width: 220 } }} />
      ) : (
        <label style={{ fontSize: 14, display: 'block', margin: '6px 0' }}>
          <div>Datum</div>
          <input type="date" disabled={!editable} value={date} onChange={(e) => setDate(e.target.value)} style={DATE_INPUT} />
        </label>
      )}
      <Dropdown label="Druh" disabled={!editable} selectedKey={kind} options={PLAN_JOB_KINDS.map((k) => ({ key: k, text: kindText(k) }))} onChange={(_, o) => o && setKind(String(o.key))} />
      <TextField label="Poznámka" disabled={!editable} multiline rows={2} value={note} onChange={(_, v) => setNote(v ?? '')} />
    </DialogShell>
  );
};

/** Potvrzení smazání položek plánu (vybraných, nebo všech zobrazených). */
const DeleteItemsDialog: React.FC<{ items: PlanItem[]; year: number; onClose: () => void; onApply: () => Promise<unknown> }> = ({ items, year, onClose, onApply }) => {
  const { busy, error, run } = useAsync();
  const withRequest = items.filter((i) => i.requestId).length;
  return (
    <DialogShell
      title={`Smazat ${items.length} činností z plánu na rok ${year}?`}
      subText="Položky se přesunou do koše webu SharePoint, odkud jdou obnovit. Už vytvořené servisní požadavky zůstanou."
      error={error}
      busy={busy}
      confirm={`Smazat ${items.length} činností`}
      onConfirm={() => run(onApply)}
      onClose={onClose}
    >
      <div style={{ fontSize: 13 }}>
        {items.slice(0, 5).map((i) => (
          <div key={i.id}>
            • {i.title} <span style={{ color: RES.gray }}>({periodLabel(i)})</span>
          </div>
        ))}
        {items.length > 5 && <div style={{ color: RES.gray }}>… a dalších {items.length - 5}</div>}
      </div>
      {withRequest > 0 && (
        <MessageBar messageBarType={MessageBarType.warning} isMultiline styles={{ root: { marginTop: 8 } }}>
          {withRequest} z těchto činností už má vytvořený servisní požadavek; požadavek se nemaže, jen jeho vazba na plán.
        </MessageBar>
      )}
    </DialogShell>
  );
};

/** Roční plán lokality z jejího checklistu: činnosti z katalogu O&M podle příznaků, modulů a periody. Existující položky plánu se nemění ani nemažou. */
const ChecklistPlanDialog: React.FC<{
  sites: ServiceSite[];
  devices: ServiceDevice[];
  plan: PlanItem[];
  year: number;
  defaultSite: string;
  onClose: () => void;
  onApply: (items: PlanItemInput[]) => Promise<unknown>;
}> = ({ sites, devices, plan, year, defaultSite, onClose, onApply }) => {
  const [siteNumber, setSiteNumber] = React.useState(defaultSite);
  const [startYear, setStartYear] = React.useState(year);
  const { busy, error, run } = useAsync();
  const site = sites.filter((s) => s.number === siteNumber)[0];
  const siteDevices = site ? devices.filter((d) => d.siteNumber === siteNumber && d.isActive) : [];
  const checklist = cleanChecklist(CATALOG, (site && site.checklist) || { flags: [], modules: [], disabled: [], enabled: [], periods: {} });
  const items = site ? evaluateChecklist(CATALOG, checklist, siteDevices.map((d) => d.kind)) : [];
  const all = site ? planFromChecklist(CATALOG, items, siteDevices, { siteNumber, year, startYear }) : [];
  const fresh = newPlanItemsOnly(plan, all);
  const monitoring = items.filter((i) => i.active).length - new Set(all.map((a) => a.title)).size;

  return (
    <DialogShell
      title={`Plán lokality z checklistu na rok ${year}`}
      subText="Z činností checklistu lokality (Servis → Lokality a soubory → Checklist) se do ročního plánu přidají ty, které mají pevnou periodu. Činnosti lokality jdou na lokalitu, činnosti zařízení na soubory jejich typu. Už existující položky plánu se nemění ani nemažou."
      error={error}
      busy={busy}
      confirm={!site ? 'Vyberte lokalitu' : fresh.length > 0 ? `Přidat ${fresh.length} činností` : 'Není co přidat'}
      onConfirm={() => {
        if (!site) {
          run(() => Promise.reject(new Error('Nejdřív vyberte lokalitu, pro kterou se má plán vytvořit.')));
          return;
        }
        if (fresh.length === 0) {
          run(() => Promise.reject(new Error('Všechny činnosti z checklistu už v plánu jsou, nebo checklist žádné s pevnou periodou nemá.')));
          return;
        }
        run(() => onApply(fresh));
      }}
      onClose={onClose}
    >
      <Dropdown label="Lokalita" required placeholder="Vyberte lokalitu" selectedKey={siteNumber || null} options={sites.map((s) => ({ key: s.number, text: `${s.number} ${s.name}` }))} onChange={(_, o) => o && setSiteNumber(String(o.key))} />
      <Dropdown label="První rok smlouvy (pro činnosti jednou za více let)" selectedKey={startYear} options={[year - 2, year - 1, year, year + 1].map((y) => ({ key: y, text: String(y) }))} onChange={(_, o) => o && setStartYear(Number(o.key))} styles={{ root: { width: 220 } }} />
      {site && isEmptyChecklist(checklist) && <MessageBar messageBarType={MessageBarType.warning} isMultiline>Lokalita nemá vyplněný checklist (příznaky a moduly), nabídnou se jen činnosti základního servisu. Checklist upravíte v Servis → Lokality a soubory → Checklist.</MessageBar>}
      {site && siteDevices.length === 0 && <MessageBar messageBarType={MessageBarType.info} isMultiline>Lokalita nemá žádný soubor — vzniknou jen činnosti lokality a vyvedení výkonu.</MessageBar>}
      {site && <div style={{ fontSize: 13, marginTop: 8 }}>
        V checklistu je <strong>{items.filter((i) => i.active).length}</strong> činností; do plánu na rok {year} se jich podle period vytvoří <strong>{all.length}</strong> položek, z toho <strong>{fresh.length}</strong> nových ({all.length - fresh.length} už v plánu je).
      </div>}
      {site && <div style={{ fontSize: 12, color: RES.gray, marginTop: 4 }}>
        Do plánu se nezařazují činnosti bez pevné periody (monitoring 24/7, denní a týdenní kontroly, sezónní a nárazové činnosti){monitoring > 0 ? ` — v tomto checklistu ${monitoring}` : ''}. Měsíce se rozkládají rovnoměrně; po vytvoření je lze v plánu upravit.
      </div>}
    </DialogShell>
  );
};

const TemplateDialog: React.FC<{
  sites: ServiceSite[];
  devices: ServiceDevice[];
  templates: { name: string; kind: string; items: { title: string }[] }[];
  year: number;
  defaultSite: string;
  onClose: () => void;
  onApply: (items: PlanItemInput[]) => Promise<unknown>;
}> = ({ sites, devices, templates, year, defaultSite, onClose, onApply }) => {
  const { settings } = useApp();
  const [siteNumber, setSiteNumber] = React.useState(defaultSite || (sites[0] ? sites[0].number : ''));
  const [deviceNumber, setDeviceNumber] = React.useState('');
  const [name, setName] = React.useState(templates[0] ? templates[0].name : '');
  const { busy, error, run } = useAsync();
  const tpl = settings.service.planTemplates.filter((t) => t.name === name)[0];
  const siteDevices = devices.filter((d) => d.siteNumber === siteNumber && d.isActive);
  const device = siteDevices.filter((d) => d.number === deviceNumber)[0];

  return (
    <DialogShell
      title={`Načíst šablonu do plánu na rok ${year}`}
      subText="Činnosti ze šablony se přidají do plánu vybrané lokality nebo souboru; pak je můžete upravit. Už existující činnosti plánu se nemění."
      error={error}
      busy={busy}
      confirm="Načíst šablonu"
      onConfirm={() => {
        if (!tpl) {
          run(() => Promise.reject(new Error('Vyberte šablonu.')));
          return;
        }
        run(() => onApply(instantiateTemplate(tpl, { siteNumber, deviceNumber: deviceNumber || undefined }, year)));
      }}
      onClose={onClose}
    >
      <Dropdown label="Šablona" selectedKey={name} options={templates.map((t) => ({ key: t.name, text: `${t.name} (${t.items.length} činností)` }))} onChange={(_, o) => o && setName(String(o.key))} />
      <Dropdown label="Lokalita" selectedKey={siteNumber} options={sites.map((s) => ({ key: s.number, text: `${s.number} ${s.name}` }))} onChange={(_, o) => { if (o) { setSiteNumber(String(o.key)); setDeviceNumber(''); } }} />
      <Dropdown label="Soubor" selectedKey={deviceNumber} options={[{ key: '', text: '— celá lokalita (společné činnosti) —' }, ...siteDevices.map((d) => ({ key: d.number, text: `${d.number} ${d.name} (${d.kind})` }))]} onChange={(_, o) => o && setDeviceNumber(String(o.key))} />
      {tpl && device && device.kind !== tpl.kind && tpl.kind !== 'Lokalita' && <MessageBar messageBarType={MessageBarType.warning}>Šablona je určena pro druh „{tpl.kind}“, soubor je „{device.kind}“. Můžete ji přesto načíst a upravit.</MessageBar>}
      {tpl && <div style={{ fontSize: 12, color: RES.gray, marginTop: 6 }}>Přidá se {tpl.items.length} činností.</div>}
    </DialogShell>
  );
};

const CopyDialog: React.FC<{ count: number; fromYear: number; onClose: () => void; onApply: (toYear: number) => Promise<unknown> }> = ({ count, fromYear, onClose, onApply }) => {
  const [toYear, setToYear] = React.useState(fromYear + 1);
  const { busy, error, run } = useAsync();
  return (
    <DialogShell
      title="Kopírovat plán do jiného roku"
      subText={`Zkopíruje se ${count} činností z aktuálního výběru (rok ${fromYear}). Konkrétní data se přenesou na stejný den a měsíc, vytvořené požadavky se nekopírují. Původní plán zůstane beze změny.`}
      error={error}
      busy={busy}
      confirm="Zkopírovat"
      onConfirm={() => run(() => (toYear === fromYear ? Promise.reject(new Error('Vyberte jiný rok, než ze kterého kopírujete.')) : onApply(toYear)))}
      onClose={onClose}
    >
      <Dropdown label="Do roku" selectedKey={toYear} options={[fromYear - 1, fromYear + 1, fromYear + 2, fromYear + 3].map((y) => ({ key: y, text: String(y) }))} onChange={(_, o) => o && setToYear(Number(o.key))} styles={{ root: { width: 140 } }} />
    </DialogShell>
  );
};

const SaveTemplateDialog: React.FC<{ onClose: () => void; onApply: (name: string, kind: string) => Promise<unknown> }> = ({ onClose, onApply }) => {
  const [name, setName] = React.useState('');
  const [kind, setKind] = React.useState('FVE');
  const { busy, error, run } = useAsync();
  return (
    <DialogShell
      title="Uložit plán jako šablonu"
      subText="Činnosti aktuálního výběru se uloží jako šablona bez lokality a roku. Šablona se stejným názvem se přepíše."
      error={error}
      busy={busy}
      confirm="Uložit šablonu"
      onConfirm={() => run(() => (name.trim() === '' ? Promise.reject(new Error('Vyplňte název šablony.')) : onApply(name, kind)))}
      onClose={onClose}
    >
      <TextField label="Název šablony" required value={name} onChange={(_, v) => setName(v ?? '')} />
      <Dropdown label="Pro druh souboru" selectedKey={kind} options={['FVE', 'BESS', 'MVE', 'Kogenerace', 'Jiné', 'Lokalita'].map((k) => ({ key: k, text: k }))} onChange={(_, o) => o && setKind(String(o.key))} />
    </DialogShell>
  );
};
