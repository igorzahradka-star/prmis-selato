/**
 * Report projektu (PDF) — dialog: vybrat, co report obsahuje, vytvořit ho, prohlédnout a uložit do složky projektu.
 * PDF je ve stylu RES PowerPointové šablony (viz `projectReportPdf.ts`). Report se tvoří z dat aplikace, bez AI.
 */

import * as React from 'react';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { Checkbox } from '@fluentui/react/lib/Checkbox';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { ExternalLink } from '../../ui/components/ExternalLink';
import { useReportCurrency } from '../../ui/useReportCurrency';
import { Project } from '../../core/types';
import { ALL_REPORT_SECTIONS, ReportSections, reportFileName } from '../../core/projectReport';
import { folderFor } from '../../core/projectFolders';
import { canWriteDiary } from '../../core/siteDiary';
import { toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { OrderPdfPreview } from '../orders/OrderPdfPreview';
import { collectProjectReport, loadReportAssets } from './reportRuntime';
import { renderProjectReportPdf } from './projectReportPdf';

export const ProjectReportDialog: React.FC<{ project: Project; onClose: () => void }> = ({ project, onClose }) => {
  const { repos, settings, user } = useApp();
  const report = useReportCurrency();
  const [sections, setSections] = React.useState<ReportSections>(ALL_REPORT_SECTIONS);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<string | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [blob, setBlob] = React.useState<Blob | undefined>(undefined);
  const [fileName, setFileName] = React.useState('');
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [savedUrl, setSavedUrl] = React.useState<string | undefined>(undefined);
  const [saving, setSaving] = React.useState(false);

  const maySave = canWriteDiary(toWorkflowProject(project), toActor(user)) && !!project.folderUrl;
  const saveFolder = folderFor(project, 'reports', settings.folders);

  const toggle = (key: keyof ReportSections, on: boolean): void => setSections((cur) => ({ ...cur, [key]: on }));

  const create = (): void => {
    setBusy(true);
    setError(undefined);
    setBlob(undefined);
    setSavedUrl(undefined);
    (async (): Promise<void> => {
      const model = await collectProjectReport(repos, project, settings, report, user, sections, setProgress);
      setProgress('Vytvářím PDF…');
      const assets = await loadReportAssets();
      const pdf = await renderProjectReportPdf(model, assets);
      setFileName(reportFileName(project.projectNumber, model.generatedAt));
      setBlob(pdf);
      setPreviewOpen(true);
    })()
      .catch((e: unknown) => setError(`Report se nepodařilo vytvořit: ${e instanceof Error ? e.message : String(e)}`))
      .then(() => {
        setBusy(false);
        setProgress(undefined);
      })
      .catch(() => undefined);
  };

  const save = (): void => {
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
        setError(`Report se nepodařilo uložit do složky projektu: ${e.message}`);
      });
  };

  return (
    <>
      <Dialog
        hidden={false}
        onDismiss={busy || saving ? undefined : onClose}
        dialogContentProps={{
          type: DialogType.normal,
          title: `Report projektu ${project.projectNumber}`,
          subText: 'PDF se stavem projektu ve stylu RES prezentace: přehled, realizační rozpočet, objednávky, fakturace, termíny a úkoly, zápisy ze stavby a fotky. Tvoří se z dat aplikace (bez AI).'
        }}
        modalProps={{ isBlocking: true }}
        minWidth={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {error && (
            <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>
              {error}
            </MessageBar>
          )}
          <div style={{ fontSize: 13, fontWeight: 600, color: RES.navy }}>Co má report obsahovat</div>
          <Checkbox label="Přehled projektu (vždy)" checked disabled />
          <Checkbox label="Realizační rozpočet: plán, skutečnost, zbývá, semafor" checked={sections.budget} disabled={busy} onChange={(_, c) => toggle('budget', !!c)} />
          <Checkbox label="Finance: objednávky a fakturace" checked={sections.finance} disabled={busy} onChange={(_, c) => toggle('finance', !!c)} />
          <Checkbox label="Termíny a úkoly ze zápisů" checked={sections.deadlines} disabled={busy} onChange={(_, c) => toggle('deadlines', !!c)} />
          <Checkbox label="Stavební deník — poslední zápisy" checked={sections.diary} disabled={busy} onChange={(_, c) => toggle('diary', !!c)} />
          <Checkbox label="Fotodokumentace — až 6 fotek z nejnovější dávky" checked={sections.photos} disabled={busy} onChange={(_, c) => toggle('photos', !!c)} />
          <div style={{ fontSize: 12, color: RES.gray }}>Částky jsou v měně zvolené nad přehledy ({report.label}), bez DPH.</div>

          {busy && <Spinner size={SpinnerSize.small} label={progress || 'Pracuji…'} labelPosition="right" styles={{ root: { justifyContent: 'flex-start', marginTop: 4 } }} />}

          {blob && !busy && (
            <MessageBar messageBarType={MessageBarType.success} isMultiline>
              Report je hotový ({fileName}).{' '}
              {savedUrl ? (
                <>
                  Uložený ve složce projektu: <ExternalLink href={savedUrl}>otevřít</ExternalLink>.
                </>
              ) : maySave ? (
                <>Můžete ho prohlédnout a uložit do složky projektu ({saveFolder}).</>
              ) : (
                <>Můžete ho prohlédnout a stáhnout (ukládat do složky projektu smí projektový manažer, asistent a vedení).</>
              )}
            </MessageBar>
          )}
        </div>
        <DialogFooter>
          <PrimaryButton text={busy ? 'Vytvářím…' : blob ? 'Vytvořit znovu' : 'Vytvořit report'} iconProps={{ iconName: 'PDF' }} disabled={busy} onClick={create} />
          {blob && !busy && <DefaultButton text="Zobrazit náhled" iconProps={{ iconName: 'View' }} onClick={() => setPreviewOpen(true)} />}
          {blob && !busy && maySave && !savedUrl && <DefaultButton text={saving ? 'Ukládám…' : 'Uložit do složky projektu'} iconProps={{ iconName: 'Save' }} disabled={saving} onClick={save} />}
          <DefaultButton text="Zavřít" disabled={busy || saving} onClick={onClose} />
        </DialogFooter>
      </Dialog>
      {previewOpen && blob && <OrderPdfPreview blob={blob} fileName={fileName} title={`Report projektu ${project.projectNumber}`} onDismiss={() => setPreviewOpen(false)} />}
    </>
  );
};
