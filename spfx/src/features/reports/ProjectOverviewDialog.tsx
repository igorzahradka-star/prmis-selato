/**
 * Project overview — dialog: údaje marketingového přehledu (předmět, rok, výkon, kapacita, parametry, texty CZ/EN, fotky,
 * mapa, souhlas zákazníka), návrh textu ze šablony, zadání pro AI a vytvoření PDF (česky nebo anglicky).
 *
 * AI se v aplikaci nevolá: tlačítko zkopíruje připravené zadání, uživatel ho vloží do Copilota nebo Clauda
 * a hotový text vloží zpět. Údaje se ukládají k projektu a průběžně zálohují v prohlížeči.
 */

import * as React from 'react';
import { PrimaryButton, DefaultButton, IconButton } from '@fluentui/react/lib/Button';
import { Checkbox } from '@fluentui/react/lib/Checkbox';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Pivot, PivotItem } from '@fluentui/react/lib/Pivot';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { TextField } from '@fluentui/react/lib/TextField';
import { Toggle } from '@fluentui/react/lib/Toggle';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { ExternalLink } from '../../ui/components/ExternalLink';
import { DraftBanner } from '../../ui/components/DraftBanner';
import { useFormDraft } from '../../ui/useFormDraft';
import { Project } from '../../core/types';
import { canEditProject } from '../../core/roles';
import { draftKey } from '../../core/drafts';
import { folderFor } from '../../core/projectFolders';
import { canWriteDiary } from '../../core/siteDiary';
import { toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { parseAmount } from '../../core/format';
import {
  CAPACITY_UNITS,
  CapacityUnit,
  MAX_OVERVIEW_PHOTOS,
  OverviewLang,
  POWER_UNITS,
  PowerUnit,
  ProjectOverview,
  aiPrompt,
  overviewFileName,
  overviewWarnings,
  templateText
} from '../../core/projectOverview';
import { OrderPdfPreview } from '../orders/OrderPdfPreview';
import { PhotoPickerDialog } from '../photos/PhotoPickerDialog';
import { loadReportAssets } from './reportRuntime';
import { collectOverviewModel } from './overviewRuntime';
import { renderProjectOverviewPdf } from './projectOverviewPdf';

const LANG_LABEL: Record<OverviewLang, string> = { cs: 'Česky', en: 'Anglicky' };
const num = (v: number | undefined): string => (v === undefined ? '' : String(v).replace('.', ','));

export const ProjectOverviewDialog: React.FC<{ project: Project; onClose: () => void }> = ({ project, onClose }) => {
  const { repos, settings, user } = useApp();
  const [data, setData] = React.useState<ProjectOverview | undefined>(undefined);
  const [saved, setSaved] = React.useState('');
  const [lang, setLang] = React.useState<OverviewLang>('cs');
  const [textLang, setTextLang] = React.useState<OverviewLang>('cs');
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<string | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [notice, setNotice] = React.useState<string | undefined>(undefined);
  const [blob, setBlob] = React.useState<Blob | undefined>(undefined);
  const [fileName, setFileName] = React.useState('');
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [promptOpen, setPromptOpen] = React.useState(false);
  const [savedUrl, setSavedUrl] = React.useState<string | undefined>(undefined);
  const [saving, setSaving] = React.useState(false);
  // Texty polí s čísly se drží jako text (čárka, prázdno), převádí se při změně.
  const [powerText, setPowerText] = React.useState('');
  const [capacityText, setCapacityText] = React.useState('');
  const [yearText, setYearText] = React.useState('');

  const mayEdit = canEditProject(user.roles, user.loginName, { projectManagerLogin: project.projectManagerLogin, assistantLogins: project.assistantLogins });
  const maySave = canWriteDiary(toWorkflowProject(project), toActor(user)) && !!project.folderUrl;
  const saveFolder = folderFor(project, 'reports', settings.folders);

  const applyLoaded = (o: ProjectOverview): void => {
    setData(o);
    setPowerText(num(o.power));
    setCapacityText(num(o.capacity));
    setYearText(o.year === undefined ? '' : String(o.year));
  };

  React.useEffect(() => {
    let cancelled = false;
    repos.projects
      .getOverview(project)
      .then((o) => {
        if (!cancelled) {
          applyLoaded(o);
          setSaved(JSON.stringify(o));
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [repos, project]);

  const draft = useFormDraft<ProjectOverview | null>({
    key: mayEdit ? draftKey(user.loginName, 'overview', project.projectNumber) : undefined,
    value: data ?? null,
    active: !!data && mayEdit,
    onRestore: (d) => {
      if (d) {
        applyLoaded(d);
      }
    }
  });

  const dirty = !!data && JSON.stringify(data) !== saved;
  const patch = (p: Partial<ProjectOverview>): void => setData((cur) => (cur ? { ...cur, ...p } : cur));
  const patchBi = (key: 'subject' | 'params' | 'text' | 'customerAnonymous', l: OverviewLang, value: string): void =>
    setData((cur) => (cur ? { ...cur, [key]: { ...cur[key], [l]: value } } : cur));

  const persist = async (): Promise<void> => {
    if (!data) {
      return;
    }
    await repos.projects.saveOverview(project, data, user);
    setSaved(JSON.stringify(data));
    draft.clear();
  };

  const saveData = (): void => {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    persist()
      .then(() => setNotice('Údaje přehledu jsou uložené.'))
      .catch((e: Error) => setError(e.message))
      .then(() => setBusy(false))
      .catch(() => undefined);
  };

  const create = (): void => {
    if (!data) {
      return;
    }
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    setBlob(undefined);
    setSavedUrl(undefined);
    (async (): Promise<void> => {
      if (mayEdit && dirty) {
        await persist();
      }
      const model = await collectOverviewModel(repos, project, data, settings, lang, setProgress);
      setProgress('Vytvářím PDF…');
      const assets = await loadReportAssets();
      const pdf = await renderProjectOverviewPdf(model, assets);
      setFileName(overviewFileName(project.projectNumber, lang));
      setBlob(pdf);
      setPreviewOpen(true);
    })()
      .catch((e: unknown) => setError(`Project overview se nepodařilo vytvořit: ${e instanceof Error ? e.message : String(e)}`))
      .then(() => {
        setBusy(false);
        setProgress(undefined);
      })
      .catch(() => undefined);
  };

  const saveToFolder = (): void => {
    if (!blob) {
      return;
    }
    setSaving(true);
    setError(undefined);
    repos.documents
      .saveProjectFile(project, saveFolder, fileName, blob)
      .then((url) => {
        setSavedUrl(url);
        setSaving(false);
      })
      .catch((e: Error) => {
        setSaving(false);
        setError(`PDF se nepodařilo uložit do složky projektu: ${e.message}`);
      });
  };

  const prompt = data ? aiPrompt(data, project, settings.company.name, textLang) : '';
  const copyPrompt = (): void => {
    setPromptOpen(true);
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (clip && clip.writeText) {
      clip
        .writeText(prompt)
        .then(() => setNotice('Zadání pro AI je zkopírované. Vložte ho do Copilota nebo Clauda (Ctrl+V) a hotový text vložte zpět do pole níže.'))
        .catch(() => setNotice('Zadání se nepodařilo zkopírovat automaticky — označte ho v poli níže a zkopírujte (Ctrl+C).'));
    } else {
      setNotice('Zadání se nepodařilo zkopírovat automaticky — označte ho v poli níže a zkopírujte (Ctrl+C).');
    }
  };

  const movePhoto = (i: number, d: number): void => {
    if (!data) {
      return;
    }
    const arr = data.photos.slice();
    const j = i + d;
    if (j < 0 || j >= arr.length) {
      return;
    }
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
    patch({ photos: arr });
  };

  const warnings = data ? overviewWarnings(data, lang) : [];
  const hasCoords = project.latitude !== undefined && project.longitude !== undefined;

  return (
    <>
      <Dialog
        hidden={pickerOpen}
        onDismiss={busy || saving ? undefined : onClose}
        dialogContentProps={{
          type: DialogType.normal,
          title: `Project overview ${project.projectNumber}`,
          subText: 'Marketingový přehled realizace pro zákazníky (1–3 strany PDF, česky nebo anglicky). Bez cen a marží; zákazník jménem jen se souhlasem.'
        }}
        modalProps={{ isBlocking: true }}
        minWidth={760}
        maxWidth={900}
      >
        {!data && !error && <Spinner size={SpinnerSize.medium} label="Načítám údaje…" />}
        {draft.pending && <DraftBanner savedAt={draft.pending.savedAt} what="Project overview" onRestore={draft.restore} onDiscard={draft.discard} />}
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
        {data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '58vh', overflowY: 'auto', paddingRight: 6 }}>
            {!mayEdit && (
              <MessageBar messageBarType={MessageBarType.info}>Údaje může upravovat jen projektový manažer projektu, asistent, vedení a administrátor.</MessageBar>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <TextField label="Předmět realizace (česky)" value={data.subject.cs} disabled={!mayEdit || busy} onChange={(_, v) => patchBi('subject', 'cs', v ?? '')} styles={{ root: { flex: '1 1 300px' } }} placeholder="např. Realizace bateriového úložiště" />
              <TextField label="Předmět realizace (anglicky)" value={data.subject.en} disabled={!mayEdit || busy} onChange={(_, v) => patchBi('subject', 'en', v ?? '')} styles={{ root: { flex: '1 1 300px' } }} placeholder="e.g. Battery energy storage system" />
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <TextField
                label="Rok realizace"
                value={yearText}
                disabled={!mayEdit || busy}
                onChange={(_, v) => {
                  setYearText(v ?? '');
                  const y = parseInt((v ?? '').trim(), 10);
                  patch({ year: isNaN(y) ? undefined : y });
                }}
                styles={{ root: { width: 110 } }}
              />
              <TextField
                label="Instalovaný výkon"
                value={powerText}
                disabled={!mayEdit || busy}
                onChange={(_, v) => {
                  setPowerText(v ?? '');
                  patch({ power: parseAmount(v ?? '') ?? undefined });
                }}
                styles={{ root: { width: 140 } }}
              />
              <Dropdown label="Jednotka" selectedKey={data.powerUnit} options={POWER_UNITS.map((u) => ({ key: u, text: u }))} disabled={!mayEdit || busy} onChange={(_, o) => o && patch({ powerUnit: o.key as PowerUnit })} styles={{ root: { width: 90 } }} />
              <TextField
                label="Kapacita úložiště"
                value={capacityText}
                disabled={!mayEdit || busy}
                onChange={(_, v) => {
                  setCapacityText(v ?? '');
                  patch({ capacity: parseAmount(v ?? '') ?? undefined });
                }}
                styles={{ root: { width: 140 } }}
              />
              <Dropdown label="Jednotka" selectedKey={data.capacityUnit} options={CAPACITY_UNITS.map((u) => ({ key: u, text: u }))} disabled={!mayEdit || busy} onChange={(_, o) => o && patch({ capacityUnit: o.key as CapacityUnit })} styles={{ root: { width: 90 } }} />
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <TextField label="Technické parametry (česky) — jeden na řádek" multiline rows={3} value={data.params.cs} disabled={!mayEdit || busy} onChange={(_, v) => patchBi('params', 'cs', v ?? '')} styles={{ root: { flex: '1 1 300px' } }} placeholder={'Baterie: LFP\nStřídače: 4 ks'} />
              <TextField label="Technické parametry (anglicky)" multiline rows={3} value={data.params.en} disabled={!mayEdit || busy} onChange={(_, v) => patchBi('params', 'en', v ?? '')} styles={{ root: { flex: '1 1 300px' } }} placeholder={'Batteries: LFP\nInverters: 4 pcs'} />
            </div>

            <div style={{ border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '8px 12px' }}>
              <Toggle
                label="Zákazník souhlasí se zveřejněním jména"
                checked={data.customerConsent}
                disabled={!mayEdit || busy}
                onChange={(_, c) => patch({ customerConsent: !!c })}
                onText={project.customerName ? `V přehledu bude uvedeno: ${project.customerName}` : 'Projekt nemá zadaného zákazníka'}
                offText="Zákazník se v přehledu uvede jen obecně"
              />
              {!data.customerConsent && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <TextField label="Obecné označení (česky)" value={data.customerAnonymous.cs} disabled={!mayEdit || busy} onChange={(_, v) => patchBi('customerAnonymous', 'cs', v ?? '')} styles={{ root: { flex: '1 1 240px' } }} />
                  <TextField label="Obecné označení (anglicky)" value={data.customerAnonymous.en} disabled={!mayEdit || busy} onChange={(_, v) => patchBi('customerAnonymous', 'en', v ?? '')} styles={{ root: { flex: '1 1 240px' } }} />
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Popis realizace</div>
              <Pivot selectedKey={textLang} onLinkClick={(i) => i && i.props.itemKey && setTextLang(i.props.itemKey as OverviewLang)} headersOnly>
                <PivotItem headerText="Česky" itemKey="cs" />
                <PivotItem headerText="Anglicky" itemKey="en" />
              </Pivot>
              <TextField
                multiline
                rows={6}
                value={data.text[textLang]}
                disabled={!mayEdit || busy}
                onChange={(_, v) => patchBi('text', textLang, v ?? '')}
                placeholder="Prázdné pole = použije se návrh ze šablony. Text můžete napsat sami, nebo použít AI."
                styles={{ root: { marginTop: 6 } }}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                <DefaultButton text="Návrh ze šablony" iconProps={{ iconName: 'Edit' }} disabled={!mayEdit || busy} onClick={() => patchBi('text', textLang, templateText(data, project, settings.company.name, textLang))} />
                <DefaultButton text="Zkopírovat zadání pro AI" iconProps={{ iconName: 'Copy' }} onClick={copyPrompt} title="Zkopíruje připravené zadání — vložte ho do Copilota nebo Clauda a hotový text vložte zpět" />
              </div>
              {promptOpen && (
                <TextField
                  label="Zadání pro AI (zkopírujte do Copilota nebo Clauda)"
                  multiline
                  rows={8}
                  readOnly
                  value={prompt}
                  onFocus={(e) => (e.target as HTMLTextAreaElement).select()}
                  styles={{ root: { marginTop: 8 } }}
                />
              )}
            </div>

            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Fotky (první je titulní, nejvýš {MAX_OVERVIEW_PHOTOS})</div>
              {data.photos.length === 0 && <div style={{ fontSize: 13, color: RES.gray }}>Zatím nejsou vybrané žádné fotky.</div>}
              {data.photos.map((ph, i) => (
                <div key={`${ph.folder}/${ph.name}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '2px 0' }}>
                  <span style={{ width: 70, color: i === 0 ? RES.blue : RES.gray, fontWeight: i === 0 ? 600 : 400 }}>{i === 0 ? 'titulní' : `${i + 1}.`}</span>
                  <span style={{ flex: '1 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ph.name}</span>
                  {mayEdit && (
                    <>
                      <IconButton iconProps={{ iconName: 'Up' }} ariaLabel="Posunout výš" disabled={i === 0 || busy} onClick={() => movePhoto(i, -1)} />
                      <IconButton iconProps={{ iconName: 'Down' }} ariaLabel="Posunout níž" disabled={i === data.photos.length - 1 || busy} onClick={() => movePhoto(i, 1)} />
                      <IconButton iconProps={{ iconName: 'Delete' }} ariaLabel="Odebrat fotku" disabled={busy} onClick={() => patch({ photos: data.photos.filter((_, k) => k !== i) })} />
                    </>
                  )}
                </div>
              ))}
              {mayEdit && (
                <DefaultButton text="Vybrat fotky z galerie projektu" iconProps={{ iconName: 'Photo2' }} disabled={busy || data.photos.length >= MAX_OVERVIEW_PHOTOS} onClick={() => setPickerOpen(true)} styles={{ root: { marginTop: 6 } }} />
              )}
            </div>

            <Checkbox label={hasCoords ? 'Mapa s umístěním projektu' : 'Mapa s umístěním projektu (projekt nemá zadanou polohu)'} checked={data.showMap && hasCoords} disabled={!mayEdit || busy || !hasCoords} onChange={(_, c) => patch({ showMap: !!c })} />

            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Dropdown label="Jazyk PDF" selectedKey={lang} options={(['cs', 'en'] as OverviewLang[]).map((l) => ({ key: l, text: LANG_LABEL[l] }))} disabled={busy} onChange={(_, o) => o && setLang(o.key as OverviewLang)} styles={{ root: { width: 160 } }} />
            </div>
            {warnings.length > 0 && (
              <MessageBar messageBarType={MessageBarType.warning} isMultiline>
                <strong>Pozor, přehled je zatím poloprázdný:</strong> {warnings.join(' ')}
              </MessageBar>
            )}
            {busy && <Spinner size={SpinnerSize.small} label={progress || 'Pracuji…'} labelPosition="right" styles={{ root: { justifyContent: 'flex-start' } }} />}
            {blob && !busy && (
              <MessageBar messageBarType={MessageBarType.success} isMultiline>
                Project overview je hotový ({fileName}).{' '}
                {savedUrl ? (
                  <>
                    Uložený ve složce projektu: <ExternalLink href={savedUrl}>otevřít</ExternalLink>.
                  </>
                ) : maySave ? (
                  <>Můžete ho prohlédnout a uložit do složky projektu ({saveFolder}).</>
                ) : (
                  <>Můžete ho prohlédnout a stáhnout.</>
                )}
              </MessageBar>
            )}
          </div>
        )}
        <DialogFooter>
          <PrimaryButton text={busy ? 'Vytvářím…' : blob ? 'Vytvořit znovu' : 'Vytvořit PDF'} iconProps={{ iconName: 'PDF' }} disabled={busy || !data} onClick={create} />
          {mayEdit && <DefaultButton text="Uložit údaje" iconProps={{ iconName: 'Save' }} disabled={busy || !dirty} onClick={saveData} />}
          {blob && !busy && <DefaultButton text="Zobrazit náhled" iconProps={{ iconName: 'View' }} onClick={() => setPreviewOpen(true)} />}
          {blob && !busy && maySave && !savedUrl && <DefaultButton text={saving ? 'Ukládám…' : 'Uložit PDF do složky projektu'} iconProps={{ iconName: 'Save' }} disabled={saving} onClick={saveToFolder} />}
          <DefaultButton text="Zavřít" disabled={busy || saving} onClick={onClose} />
        </DialogFooter>
      </Dialog>
      {pickerOpen && data && (
        <PhotoPickerDialog
          project={project}
          title="Vybrat fotky do Project overview"
          confirmText="Použít vybrané"
          onClose={() => setPickerOpen(false)}
          onPick={(picked) => {
            const have = new Set(data.photos.map((x) => `${x.folder}/${x.name}`));
            const added = picked.filter((x) => !have.has(`${x.folder}/${x.name}`)).map((x) => ({ folder: x.folder, name: x.name, caption: x.note }));
            patch({ photos: [...data.photos, ...added].slice(0, MAX_OVERVIEW_PHOTOS) });
            setPickerOpen(false);
          }}
        />
      )}
      {previewOpen && blob && <OrderPdfPreview blob={blob} fileName={fileName} title={`Project overview ${project.projectNumber}`} onDismiss={() => setPreviewOpen(false)} />}
    </>
  );
};
