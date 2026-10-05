/**
 * Zápis ze stavby v postranním panelu: nový, úprava konceptu, zobrazení a akce (uzavření, podpis v aplikaci, nahrání
 * podepsaného skenu, znovuotevření, storno), fotky, náčrty a přílohy u bodů jednání, náhled PDF a stažení Wordu.
 *
 * Co smí člověk udělat, rozhoduje `core/siteDiary` (tlačítka se podle něj jen nabízejí); skutečná kontrola oprávnění
 * znovu probíhá v datové vrstvě při zápisu. Soubory (fotky, náčrty, přílohy, PDF, Word) leží ve složce zápisu ve složce
 * projektu; v seznamu je obsah zápisu a odkazy.
 *
 * Okna (náhled, náčrt, komentář) jsou uvnitř panelu — jinak by klik v nich panel považoval za klik „ven" a zavřel se.
 */

import { folderFor } from '../../core/projectFolders';
import * as React from 'react';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { TextField } from '@fluentui/react/lib/TextField';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { ComboBox, IComboBoxOption } from '@fluentui/react/lib/ComboBox';
import { DatePicker } from '@fluentui/react/lib/DatePicker';
import { Checkbox } from '@fluentui/react/lib/Checkbox';
import { Icon } from '@fluentui/react/lib/Icon';
import { PrimaryButton, DefaultButton, IconButton, ActionButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Dialog, DialogType, DialogFooter } from '@fluentui/react/lib/Dialog';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { Link } from '@fluentui/react/lib/Link';

import { DocumentFolderButton } from '../../ui/components/DocumentFolderButton';
import { PanelMessages } from '../../ui/components/PanelMessages';
import { removeConceptCopy, saveConceptCopy } from '../documents/conceptCopy';
import { useApp } from '../../ui/AppContext';
import { useFormDraft } from '../../ui/useFormDraft';
import { DraftBanner } from '../../ui/components/DraftBanner';
import { draftKey } from '../../core/drafts';
import { RES } from '../../ui/theme';
import { CS_CALENDAR_STRINGS } from '../../ui/csCalendarStrings';
import { useAutoRefresh } from '../../ui/useAutoRefresh';
import { ExternalLink } from '../../ui/components/ExternalLink';
import { buildHash, RouteName } from '../../ui/router';
import { Partner, Project } from '../../core/types';
import { formatDate, formatDateTime, parseCzechDate } from '../../core/format';
import { attachmentKind } from '../../core/orders';
import {
  DiaryEntry,
  DiaryPoint,
  DiaryTask,
  EntryAction,
  EntryHeader,
  EntryInput,
  EntryKind,
  EntryStatus,
  HANDOVER_DIARY_TITLE,
  HANDOVER_DIRECTIONS,
  HANDOVER_DIRECTION_LABELS,
  HANDOVER_RESULTS,
  HANDOVER_RESULT_LABELS,
  HandoverDirection,
  HandoverResult,
  Participant,
  SIGNATURE_LABELS,
  SiteDiary,
  availableEntryActions,
  canWriteDiary,
  emptyHeader,
  entryFileName,
  entryFilesPath,
  entryTitle,
  fileExtension,
  handoverDirectionOf,
  handoverParties,
  isHandover,
  isHandoverDiary,
  isImageFile,
  protocolNumber,
  isoDay,
  parseIsoDay,
  pointFiles,
  validateEntry,
  warrantyEnd
} from '../../core/siteDiary';
import { computeEntryHash, sha256Hex } from '../../core/entryHash';
import { toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { DiaryHistoryEntry } from '../../data/repositories';
import { OrderPdfPreview } from '../orders/OrderPdfPreview';
import { EntryDocData, EntryImage, closureNote, companyForEntry, handoverResultColor, nonImageAttachments, renderEntryPdf, signatureNote, warrantyNote } from './entryDocument';
import { renderEntryDocx } from './entryDocx';
import { extensionForType, photoFileName, readBlob, resizeImage, toDataUrl, uniqueFileName } from './imageUtils';
import { SketchDialog } from './SketchDialog';
import { PhotoPickerDialog, PickedPhoto } from '../photos/PhotoPickerDialog';
import { EntryStatusBadge } from './EntryStatusBadge';

export interface EntryPanelProps {
  isOpen: boolean;
  /** Existující zápis; bez něj se zakládá nový. */
  entryId?: number;
  /** U nového zápisu předvybraný projekt (např. z detailu projektu) a deník. */
  projectNumber?: string;
  diaryId?: number;
  /** Druh nového zápisu: běžný zápis ze stavby (výchozí), nebo předávací protokol. U existujícího zápisu se bere z něj. */
  kind?: EntryKind;
  onDismiss: () => void;
  /** Zápis se změnil — seznam za panelem se má načíst znovu. */
  onChanged: () => void;
}

type DialogKind = 'reopen' | 'cancel' | 'sign';

const today = (): Date => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};

const emptyPoint = (): DiaryPoint => ({ title: '', text: '', files: [] });

/** Miniatura souboru (obrázek přímo, ostatní ikonou) s tlačítky Kreslit a Odebrat. */
const FileTile: React.FC<{
  name: string;
  url?: string;
  editable: boolean;
  onRemove?: () => void;
  onAnnotate?: () => void;
}> = ({ name, url, editable, onRemove, onAnnotate }) => {
  const image = isImageFile(name);
  const kind = attachmentKind(name);
  const icon = kind === 'pdf' ? 'PDF' : kind === 'word' ? 'WordDocument' : kind === 'excel' ? 'ExcelDocument' : kind === 'archive' ? 'ZipFolder' : 'Page';
  return (
    <div style={{ position: 'relative', width: 112 }}>
      <ExternalLink href={url} title={`Otevřít ${name}`} styles={{ root: { display: 'block', textDecoration: 'none' } }}>
        <div
          style={{
            height: 84,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: RES.background,
            borderRadius: 3,
            overflow: 'hidden'
          }}
        >
          {image && url ? (
            <img src={url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          ) : (
            <Icon iconName={icon} styles={{ root: { fontSize: 36, color: RES.gray } }} />
          )}
        </div>
        <div title={name} style={{ fontSize: 11, color: RES.text, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </div>
      </ExternalLink>
      {editable && (
        <div style={{ position: 'absolute', top: 2, right: 2, display: 'flex', gap: 2 }}>
          {image && onAnnotate && (
            <IconButton
              iconProps={{ iconName: 'Edit' }}
              title="Kreslit do fotky"
              ariaLabel={`Kreslit do ${name}`}
              onClick={onAnnotate}
              styles={{ root: { width: 24, height: 24, background: 'rgba(255,255,255,0.9)', borderRadius: 12 }, icon: { fontSize: 12 } }}
            />
          )}
          {onRemove && (
            <IconButton
              iconProps={{ iconName: 'Delete' }}
              title="Odebrat"
              ariaLabel={`Odebrat ${name}`}
              onClick={onRemove}
              styles={{ root: { width: 24, height: 24, background: 'rgba(255,255,255,0.9)', borderRadius: 12 }, icon: { fontSize: 12 } }}
            />
          )}
        </div>
      )}
    </div>
  );
};

/** Prázdné položky předávacího protokolu: o čem protokol je a co se předává. */
const protocolPoints = (): DiaryPoint[] => [
  { title: 'Předmět předání', text: '', files: [] },
  { title: 'Předané doklady (dokumentace skutečného provedení, revizní zprávy, atesty, návody, záruční listy)', text: '', files: [] }
];

export const EntryPanel: React.FC<EntryPanelProps> = ({ isOpen, entryId, projectNumber, diaryId, kind, onDismiss, onChanged }) => {
  const { repos, settings, user } = useApp();
  const actor = React.useMemo(() => toActor(user), [user]);

  const [loading, setLoading] = React.useState(false);
  const [entry, setEntry] = React.useState<DiaryEntry | undefined>(undefined);
  const [history, setHistory] = React.useState<DiaryHistoryEntry[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [diaries, setDiaries] = React.useState<SiteDiary[]>([]);
  const [partners, setPartners] = React.useState<Partner[]>([]);
  const [files, setFiles] = React.useState<Record<string, string>>({});
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<string | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [issues, setIssues] = React.useState<string[]>([]);
  const [notice, setNotice] = React.useState<{ text: string; type: MessageBarType } | undefined>(undefined);
  const [dialog, setDialog] = React.useState<{ kind: DialogKind; text: string } | undefined>(undefined);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewBlob, setPreviewBlob] = React.useState<Blob | undefined>(undefined);
  const [sketch, setSketch] = React.useState<{ point: number; background?: Blob; base?: string } | undefined>(undefined);
  const [gallery, setGallery] = React.useState<{ point: number } | undefined>(undefined);
  const [showCompany, setShowCompany] = React.useState(false);

  const [fProject, setFProject] = React.useState<string | undefined>(undefined);
  const [fDiary, setFDiary] = React.useState<number | undefined>(undefined);
  const [fDate, setFDate] = React.useState<Date | undefined>(today());
  const [fHeader, setFHeader] = React.useState<EntryHeader>(emptyHeader(settings.company));
  const [fParticipants, setFParticipants] = React.useState<Participant[]>([]);
  const [fPoints, setFPoints] = React.useState<DiaryPoint[]>([emptyPoint()]);
  const [fTasks, setFTasks] = React.useState<DiaryTask[]>([]);
  const [fConditions, setFConditions] = React.useState('');
  const [fResult, setFResult] = React.useState<HandoverResult | undefined>(undefined);
  const [fDirection, setFDirection] = React.useState<HandoverDirection>('predavame');
  const [fWarranty, setFWarranty] = React.useState('');

  const cameraRef = React.useRef<HTMLInputElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const scanRef = React.useRef<HTMLInputElement>(null);
  const targetPoint = React.useRef(0);

  /** Hlavička nového zápisu se předvyplní z projektu a Nastavení; vše jde upravit. */
  const headerFromProject = (p: Project | undefined): EntryHeader => ({
    ...emptyHeader(settings.company),
    constructionName: p ? p.shortName || p.title : '',
    place: p && p.location ? p.location : '',
    managerName: p && p.projectManagerName ? p.projectManagerName : ''
  });

  const fillForm = (e: DiaryEntry | undefined, preset: string | undefined, presetDiary: number | undefined, projectList: Project[], diaryList: SiteDiary[]): void => {
    if (e) {
      setFProject(e.projectNumber);
      setFDiary(e.diaryId);
      setFDate(e.date);
      setFHeader({ ...e.header, company: { ...e.header.company } });
      setFParticipants(e.participants.map((p) => ({ ...p })));
      setFPoints(e.points.length > 0 ? e.points.map((p) => ({ ...p, files: p.files.slice() })) : [emptyPoint()]);
      setFTasks(e.tasks.map((t) => ({ ...t })));
      setFConditions(e.conditions ?? '');
      setFResult(e.handover ? e.handover.result : undefined);
      setFDirection(handoverDirectionOf(e));
      setFWarranty(e.handover && e.handover.warrantyMonths !== undefined ? String(e.handover.warrantyMonths) : '');
      return;
    }
    const p = projectList.filter((x) => x.projectNumber === preset)[0];
    setFProject(preset);
    setFDiary(presetDiary ?? pickDiary(preset, diaryList));
    setFDate(today());
    setFHeader(headerFromProject(p));
    setFParticipants([]);
    setFPoints(kind === 'predani' ? protocolPoints() : [emptyPoint()]);
    setFTasks([]);
    setFConditions('');
    setFResult(undefined);
    setFDirection('predavame');
    setFWarranty('');
  };

  /** Deník, do kterého zápis patří: u protokolu vyhrazený deník Předávací protokoly (když už je), u zápisu první aktivní stavební deník. */
  const pickDiary = (projectNo: string | undefined, diaryList: SiteDiary[]): number | undefined => {
    const mine = diaryList.filter((d) => d.projectNumber === projectNo && d.isActive && isHandoverDiary(d) === (kind === 'predani'));
    return mine.length > 0 ? mine[0].id : undefined;
  };

  // Načtení dat při otevření panelu.
  React.useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    let cancelled = false;
    setError(undefined);
    setIssues([]);
    setNotice(undefined);
    setDialog(undefined);
    setBusy(false);
    setProgress(undefined);
    setLoading(true);
    setEntry(undefined);
    setHistory([]);
    setFiles({});
    setPreviewOpen(false);
    setSketch(undefined);

    Promise.all([
      repos.projects.list({}),
      repos.diary.listDiaries(),
      repos.partners.list({}),
      entryId !== undefined ? repos.diary.getEntry(entryId) : Promise.resolve(undefined)
    ])
      .then(([projectList, diaryList, partnerList, loaded]) => {
        if (cancelled) {
          return;
        }
        setProjects(projectList);
        setDiaries(diaryList);
        setPartners(partnerList);
        setEntry(loaded);
        fillForm(loaded, projectNumber, diaryId, projectList, diaryList);
        setEditing(entryId === undefined);
        setLoading(false);
        if (entryId !== undefined && !loaded) {
          setError('Zápis nebyl nalezen. Nejspíš ho někdo smazal, nebo k němu nemáte oprávnění.');
        }
        if (loaded) {
          repos.diary
            .history(loaded.id)
            .then((h) => !cancelled && setHistory(h))
            .catch(() => undefined);
          loadFileList(loaded, projectList);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setLoading(false);
          setError(e.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, entryId, projectNumber, diaryId, kind, repos]);

  /** Předávací protokol (jiné popisky, závěr předání), nebo běžný zápis ze stavby. */
  const protocol = entry ? isHandover(entry) : kind === 'predani';
  const currentProjectNumber = entry ? entry.projectNumber : fProject;
  const project = projects.filter((p) => p.projectNumber === currentProjectNumber)[0];
  const workflowProject = React.useMemo(() => (project ? toWorkflowProject(project) : undefined), [project]);
  const writableProjects = React.useMemo(() => projects.filter((p) => canWriteDiary(toWorkflowProject(p), actor)), [projects, actor]);
  const projectOptions: IDropdownOption[] = (entry ? projects : writableProjects)
    .slice()
    .sort((a, b) => a.projectNumber.localeCompare(b.projectNumber, 'cs-CZ', { numeric: true }))
    .map((p) => ({ key: p.projectNumber, text: `${p.projectNumber} · ${p.shortName || p.title}` }));
  const diaryOptions: IDropdownOption[] = diaries
    .filter((d) => d.projectNumber === fProject && (d.isActive || d.id === fDiary) && (isHandoverDiary(d) === protocol || d.id === fDiary))
    .map((d) => ({ key: d.id, text: d.title }));
  const partnerOptions: IComboBoxOption[] = partners.map((p) => ({ key: p.id, text: p.name }));

  const actions: EntryAction[] = entry && workflowProject ? availableEntryActions(entry, workflowProject, actor) : [];

  const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

  // --- složka zápisu a soubory ---

  const filesFolder = (e: DiaryEntry): string => entryFilesPath(e.folderPath);

  const loadFileList = (e: DiaryEntry, projectList: Project[]): void => {
    const p = projectList.filter((x) => x.projectNumber === e.projectNumber)[0];
    if (!p || !p.folderUrl) {
      return;
    }
    repos.documents
      .listFolderFiles(p, filesFolder(e))
      .then((list) => {
        const map: Record<string, string> = {};
        list.forEach((f) => (map[f.name] = f.url));
        setFiles(map);
      })
      .catch(() => undefined);
  };

  const buildInput = (diaryOverride?: number): EntryInput => ({
    diaryId: diaryOverride ?? fDiary ?? 0,
    projectNumber: fProject ?? '',
    date: fDate ?? today(),
    header: {
      ...fHeader,
      constructionName: fHeader.constructionName.trim(),
      place: fHeader.place.trim(),
      managerName: fHeader.managerName.trim(),
      counterparty: fHeader.counterparty && fHeader.counterparty.trim() !== '' ? fHeader.counterparty.trim() : undefined
    },
    participants: fParticipants.filter((p) => p.name.trim() !== '').map((p) => ({ ...p, name: p.name.trim() })),
    points: fPoints
      // U protokolu se prázdné předvyplněné položky (jen nadpis) nezakládají.
      .filter((p) => p.text.trim() !== '' || p.files.length > 0 || (!protocol && p.title && p.title.trim() !== ''))
      .map((p) => ({ title: p.title && p.title.trim() !== '' ? p.title.trim() : undefined, text: p.text, files: p.files })),
    tasks: fTasks.filter((t) => t.description.trim() !== '' || (t.responsible && t.responsible.trim() !== '')),
    conditions: !protocol && fConditions.trim() !== '' ? fConditions.trim() : undefined,
    ...(protocol ? { kind: 'predani' as EntryKind, handover: { result: fResult, warrantyMonths: warrantyMonthsOf(fWarranty), ...(fDirection === 'prebirame' ? { direction: 'prebirame' as HandoverDirection } : {}) } } : {})
  });

  /** Počet měsíců záruky z textu políčka; prázdné nebo nesmyslné = bez záruky. */
  const warrantyMonthsOf = (text: string): number | undefined => {
    const n = parseInt(text.trim(), 10);
    return isNaN(n) || n < 0 || n > 600 ? undefined : n;
  };

  /** Deník Předávací protokoly projektu: najde se, nebo se při prvním protokolu založí. U zápisu se bere zvolený deník. */
  const resolveDiary = async (projectNo: string): Promise<number | undefined> => {
    if (!protocol || fDiary) {
      return fDiary;
    }
    const found = (await repos.diary.listDiaries(projectNo)).filter((d) => isHandoverDiary(d) && d.isActive)[0];
    const diary = found || (await repos.diary.createDiary(projectNo, HANDOVER_DIARY_TITLE, 'Předávací protokoly projektu (zakládá aplikace).', user));
    setDiaries((cur) => (cur.some((d) => d.id === diary.id) ? cur : [...cur, diary]));
    setFDiary(diary.id);
    return diary.id;
  };

  /** Uloží rozepsaný zápis jako koncept, pokud ještě neexistuje (soubory se dají ukládat až do složky existujícího zápisu). */
  const ensureSaved = async (): Promise<DiaryEntry> => {
    if (entry) {
      return entry;
    }
    const diaryNo = fProject ? await resolveDiary(fProject) : undefined;
    const input = buildInput(diaryNo);
    const found = validateEntry(input, false);
    if (found.length > 0) {
      throw new Error(`Nejdřív vyplňte: ${found.map((f) => f.message).join(' ')}`);
    }
    const saved = await repos.diary.createEntry(input, user);
    draft.clear();
    setEntry(saved);
    onChanged();
    return saved;
  };

  const addFiles = async (pointIndex: number, list: File[], fromCamera: boolean): Promise<void> => {
    if (list.length === 0) {
      return;
    }
    setError(undefined);
    setBusy(true);
    const failed: string[] = [];
    try {
      const e = await ensureSaved();
      const p = projects.filter((x) => x.projectNumber === e.projectNumber)[0];
      if (!p) {
        throw new Error('Projekt zápisu nebyl nalezen.');
      }
      const folder = filesFolder(e);
      const taken: string[] = Object.keys(files);
      const added: string[] = [];
      const urls: Record<string, string> = {};
      for (const f of list) {
        try {
          setProgress(`Nahrávám ${added.length + failed.length + 1} z ${list.length}…`);
          const isImg = f.type.indexOf('image/') === 0 || isImageFile(f.name);
          const blob = isImg ? await resizeImage(f) : f;
          let name: string;
          if (isImg && fromCamera) {
            name = photoFileName(new Date(), taken.concat(added), extensionForType(blob.type) || '.jpg');
          } else {
            const ext = fileExtension(f.name) || extensionForType(blob.type);
            const base = f.name.indexOf('.') === -1 ? f.name : f.name.slice(0, f.name.lastIndexOf('.'));
            name = uniqueFileName(`${isImg && blob !== f ? base + (extensionForType(blob.type) || ext) : base + ext}`, taken.concat(added));
          }
          urls[name] = await repos.documents.saveProjectFile(p, folder, name, blob);
          added.push(name);
        } catch (err) {
          failed.push(`${f.name}: ${why(err)}`);
        }
      }
      setFiles((cur) => ({ ...cur, ...urls }));
      if (added.length > 0) {
        setFPoints((cur) => cur.map((pt, i) => (i === pointIndex ? { ...pt, files: [...pt.files, ...added] } : pt)));
      }
    } catch (err) {
      failed.push(why(err));
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
    if (failed.length > 0) {
      setError(failed.join(' | '));
    }
  };

  /** Fotky z galerie projektu se zkopírují do složky zápisu (zápis tak drží svou podobu, i kdyby se fotky v galerii později změnily). */
  const attachFromGallery = async (pointIndex: number, picked: PickedPhoto[]): Promise<void> => {
    setGallery(undefined);
    if (!project || picked.length === 0) {
      return;
    }
    setError(undefined);
    setBusy(true);
    const failed: string[] = [];
    const loaded: File[] = [];
    try {
      for (const p of picked) {
        try {
          setProgress(`Načítám fotku ${loaded.length + failed.length + 1} z ${picked.length}…`);
          const blob = await repos.documents.readProjectFile(project, p.folder, p.name);
          loaded.push(new File([blob], p.name, { type: blob.type || 'image/jpeg' }));
        } catch (err) {
          failed.push(`${p.name}: ${why(err)}`);
        }
      }
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
    if (loaded.length > 0) {
      await addFiles(pointIndex, loaded, false);
    }
    if (failed.length > 0) {
      setError(failed.join(' | '));
    }
  };

  const removeFile = (pointIndex: number, name: string): void => {
    const stillUsed = fPoints.some((pt, i) => i !== pointIndex && pt.files.indexOf(name) !== -1);
    setFPoints((cur) => cur.map((pt, i) => (i === pointIndex ? { ...pt, files: pt.files.filter((f) => f !== name) } : pt)));
    if (!stillUsed && entry && project) {
      repos.documents.deleteProjectFile(project, filesFolder(entry), name).catch(() => undefined);
      setFiles((cur) => {
        const next = { ...cur };
        delete next[name];
        return next;
      });
    }
  };

  const openAnnotate = (pointIndex: number, name: string): void => {
    if (!entry || !project) {
      return;
    }
    setBusy(true);
    repos.documents
      .readProjectFile(project, filesFolder(entry), name)
      .then((blob) => {
        setBusy(false);
        setSketch({ point: pointIndex, background: blob, base: name.replace(/\.[^.]+$/, '') });
      })
      .catch((e: Error) => {
        setBusy(false);
        setError(e.message);
      });
  };

  const saveSketch = (blob: Blob, annotated: boolean): void => {
    const s = sketch;
    setSketch(undefined);
    if (!s) {
      return;
    }
    const name = annotated
      ? uniqueFileName(`${s.base || 'Foto'}_poznamky.jpg`, Object.keys(files))
      : photoFileName(new Date(), Object.keys(files), '.png', 'Nacrt');
    const file = new File([blob], name, { type: blob.type });
    addFiles(s.point, [file], false).catch(() => undefined);
  };

  // --- ukládání ---

  const afterChange = (saved: DiaryEntry): void => {
    setEntry(saved);
    setBusy(false);
    setProgress(undefined);
    onChanged();
    repos.diary
      .history(saved.id)
      .then(setHistory)
      .catch(() => undefined);
  };

  /**
   * Koncepty PDF a Wordu (KO) do složky zápisu: zápis se do složky ukládá už při uložení konceptu, aby s ním šlo pracovat dřív
   * (Word je upravitelný). Běží na pozadí; když se nepovede, zápis je uložený a uživatel se to dozví upozorněním.
   */
  const saveConcept = (saved: DiaryEntry): void => {
    const p = projects.filter((x) => x.projectNumber === saved.projectNumber)[0];
    if (!p || !p.folderUrl) {
      return;
    }
    (async (): Promise<void> => {
      const blobs = await loadPointFiles(saved, p);
      const data = await docDataOf(saved, blobs);
      const pdf = await renderEntryPdf(data);
      const docx = await renderEntryDocx(data);
      await saveConceptCopy(repos.documents, p, saved.folderPath, entryFileName(saved.projectNumber, saved.entryNo, 'pdf', saved.kind), pdf);
      await saveConceptCopy(repos.documents, p, saved.folderPath, entryFileName(saved.projectNumber, saved.entryNo, 'docx', saved.kind), docx);
    })().catch((e: unknown) =>
      setNotice({ text: `Zápis je uložený, ale koncept PDF a Wordu (KO) se do složky projektu nepodařilo uložit: ${why(e)}`, type: MessageBarType.warning })
    );
  };

  // Rozepsaný zápis / protokol se průběžně ukládá do prohlížeče — když uživatel odskočí jinam a vrátí se, nabídne se obnovení.
  const draftValue = React.useMemo(
    () => ({ fProject, fDiary, fDate, fHeader, fParticipants, fPoints, fTasks, fConditions, fResult, fDirection, fWarranty }),
    [fProject, fDiary, fDate, fHeader, fParticipants, fPoints, fTasks, fConditions, fResult, fDirection, fWarranty]
  );
  const draft = useFormDraft({
    key: isOpen ? draftKey(user.loginName, 'entry', entry ? entry.id : entryId !== undefined ? entryId : `new-${projectNumber || ''}-${kind || 'zapis'}`) : undefined,
    value: draftValue,
    active: isOpen && !loading && editing,
    onRestore: (d) => {
      setFProject(d.fProject);
      setFDiary(d.fDiary);
      setFDate(d.fDate);
      setFHeader(d.fHeader);
      setFParticipants(d.fParticipants);
      setFPoints(d.fPoints);
      setFTasks(d.fTasks);
      setFConditions(d.fConditions);
      setFResult(d.fResult);
      setFDirection(d.fDirection);
      setFWarranty(d.fWarranty);
    }
  });

  const save = async (thenClose: boolean): Promise<void> => {
    setError(undefined);
    let diaryNo: number | undefined;
    try {
      diaryNo = !entry && fProject ? await resolveDiary(fProject) : fDiary;
    } catch (e) {
      setError(why(e));
      return;
    }
    const input = buildInput(diaryNo);
    const found = validateEntry(input, thenClose);
    if (found.length > 0) {
      setIssues(found.map((i) => i.message));
      return;
    }
    setIssues([]);
    setError(undefined);
    setNotice(undefined);
    setBusy(true);
    try {
      const saved = entry ? await repos.diary.updateEntry(entry.id, input, user) : await repos.diary.createEntry(input, user);
      draft.clear();
      afterChange(saved);
      setEditing(false);
      if (!entry) {
        const p = projects.filter((x) => x.projectNumber === saved.projectNumber)[0];
        if (p) {
          loadFileList(saved, projects);
        }
      }
      if (thenClose) {
        await doClose(saved);
      } else {
        saveConcept(saved);
      }
    } catch (e) {
      setBusy(false);
      setProgress(undefined);
      setError(why(e));
    }
  };

  // --- dokument: soubory, otisk, PDF a Word ---

  /** Načte soubory použité v bodech zápisu (obsah se potřebuje pro otisk a pro vložení do PDF a Wordu). */
  const loadPointFiles = async (e: DiaryEntry, p: Project): Promise<Record<string, Blob>> => {
    const out: Record<string, Blob> = {};
    for (const name of pointFiles(e.points)) {
      out[name] = await repos.documents.readProjectFile(p, filesFolder(e), name);
    }
    return out;
  };

  const hashOf = async (e: DiaryEntry, blobs: Record<string, Blob>): Promise<string> => {
    const hashes: Record<string, string> = {};
    for (const name of Object.keys(blobs)) {
      hashes[name] = await sha256Hex(await readBlob(blobs[name]));
    }
    return computeEntryHash({ projectNumber: e.projectNumber, diaryId: e.diaryId, entryNo: e.entryNo, date: e.date }, e, hashes);
  };

  const docDataOf = async (e: DiaryEntry, blobs: Record<string, Blob>): Promise<EntryDocData> => {
    const images: Record<string, EntryImage> = {};
    for (const name of Object.keys(blobs)) {
      if (isImageFile(name)) {
        images[name] = await toDataUrl(blobs[name]);
      }
    }
    const p = projects.filter((x) => x.projectNumber === e.projectNumber)[0];
    return { entry: e, projectTitle: p ? p.shortName || p.title : '', company: companyForEntry(e, settings.company), images };
  };

  const saveOutputs = async (e: DiaryEntry, data: EntryDocData, p: Project): Promise<{ pdfUrl: string; docxUrl: string }> => {
    setProgress('Vytvářím PDF…');
    const pdf = await renderEntryPdf(data);
    setProgress('Vytvářím Word…');
    const docx = await renderEntryDocx(data);
    setProgress('Ukládám do složky projektu…');
    const pdfUrl = await repos.documents.saveProjectFile(p, e.folderPath, entryFileName(e.projectNumber, e.entryNo, 'pdf', e.kind), pdf);
    const docxUrl = await repos.documents.saveProjectFile(p, e.folderPath, entryFileName(e.projectNumber, e.entryNo, 'docx', e.kind), docx);
    return { pdfUrl, docxUrl };
  };

  /** Uzavření: otisk obsahu, PDF a Word do složky zápisu, zamčení. */
  const doClose = async (e: DiaryEntry): Promise<void> => {
    const p = projects.filter((x) => x.projectNumber === e.projectNumber)[0];
    if (!p) {
      throw new Error('Projekt zápisu nebyl nalezen.');
    }
    setBusy(true);
    setError(undefined);
    let stage = 'Načtení souborů zápisu';
    try {
      setProgress('Načítám soubory zápisu…');
      const blobs = await loadPointFiles(e, p);
      stage = 'Výpočet otisku';
      setProgress('Počítám otisk obsahu…');
      const hash = await hashOf(e, blobs);
      stage = 'Vytvoření PDF a Wordu';
      const stamped: DiaryEntry = { ...e, status: EntryStatus.Uzavreno, closedByName: user.displayName, closedAt: new Date(), contentHash: hash };
      const data = await docDataOf(stamped, blobs);
      const urls = await saveOutputs(e, data, p);
      // Ostrá verze je uložená — koncepty (KO) už nejsou potřeba (mažou se do koše SharePointu).
      await removeConceptCopy(repos.documents, p, e.folderPath, entryFileName(e.projectNumber, e.entryNo, 'pdf', e.kind));
      await removeConceptCopy(repos.documents, p, e.folderPath, entryFileName(e.projectNumber, e.entryNo, 'docx', e.kind));
      stage = 'Zápis uzavření';
      const closed = await repos.diary.close(e.id, hash, urls, user);
      afterChange(closed);
      setNotice({ text: `${protocol ? 'Protokol je uzavřený' : 'Zápis je uzavřený'}. PDF a Word jsou uložené ve složce ${protocol ? 'protokolu' : 'zápisu'}. Teď ho můžete podepsat v aplikaci, nebo vytisknout, nechat podepsat oběma stranami a nahrát sken.`, type: MessageBarType.success });
    } catch (err) {
      setBusy(false);
      setProgress(undefined);
      setError(`${stage} se nepodařilo: ${why(err)}`);
    }
  };

  /** Podpis v aplikaci: znovu spočítá otisk (musí souhlasit s uzavřením), zapíše podpis a přepíše PDF a Word s podpisem. */
  const doSign = async (): Promise<void> => {
    if (!entry || !project) {
      return;
    }
    setBusy(true);
    setError(undefined);
    let stage = 'Načtení zápisu';
    try {
      const fresh = await repos.diary.getEntry(entry.id);
      if (!fresh) {
        throw new Error('Zápis nebyl nalezen.');
      }
      setProgress('Kontroluji, že se zápis od uzavření nezměnil…');
      const blobs = await loadPointFiles(fresh, project);
      stage = 'Výpočet otisku';
      const hash = await hashOf(fresh, blobs);
      stage = 'Podpis';
      const signed = await repos.diary.signInApp(fresh.id, hash, user);
      afterChange(signed);
      stage = 'Přepsání PDF a Wordu s podpisem';
      try {
        const mine = await repos.profiles.getSignature(user.loginName).catch(() => undefined);
        const data = { ...(await docDataOf(signed, blobs)), signature: mine ? mine.imageDataUrl : undefined };
        await saveOutputs(signed, data, project);
      } catch (err) {
        setNotice({ text: `Zápis je podepsaný, ale PDF s podpisem se nepodařilo přepsat (${why(err)}). Uložené PDF je ze stavu před podpisem.`, type: MessageBarType.warning });
        return;
      }
      setNotice({ text: `${protocol ? 'Protokol je podepsaný' : 'Zápis je podepsaný'}. PDF a Word ve složce obsahují údaje o podpisu.`, type: MessageBarType.success });
    } catch (err) {
      setBusy(false);
      setProgress(undefined);
      setError(`${stage} se nepodařilo: ${why(err)}`);
    }
  };

  /** Podpis skenem: nahraje podepsaný sken do složky zápisu a připojí ho. */
  const doScan = async (file: File): Promise<void> => {
    if (!entry || !project) {
      return;
    }
    const ext = fileExtension(file.name);
    if (['.pdf', '.jpg', '.jpeg', '.png'].indexOf(ext) === -1) {
      setError('Podepsaný sken musí být PDF nebo obrázek (JPG, PNG).');
      return;
    }
    setBusy(true);
    setError(undefined);
    setProgress('Nahrávám podepsaný sken…');
    try {
      const name = entryFileName(entry.projectNumber, entry.entryNo, 'podepsano.pdf', entry.kind).replace(/\.pdf$/, ext === '.jpeg' ? '.jpg' : ext);
      const blob = ext === '.pdf' ? file : await resizeImage(file, { maxSide: 3000, quality: 0.9 });
      const url = await repos.documents.saveProjectFile(project, entry.folderPath, name, blob);
      const signed = await repos.diary.attachScan(entry.id, url, user);
      afterChange(signed);
      setNotice({ text: `Podepsaný sken je připojený, ${protocol ? 'protokol' : 'zápis'} je podepsaný.`, type: MessageBarType.success });
    } catch (err) {
      setBusy(false);
      setProgress(undefined);
      setError(`Nahrání podepsaného skenu se nepodařilo: ${why(err)}`);
    }
  };

  const confirmDialog = (): void => {
    if (!dialog || !entry) {
      return;
    }
    const { kind, text } = dialog;
    setDialog(undefined);
    if (kind === 'sign') {
      doSign().catch(() => undefined);
      return;
    }
    setBusy(true);
    setError(undefined);
    const action = kind === 'reopen' ? repos.diary.reopen(entry.id, text, user) : repos.diary.cancel(entry.id, text, user);
    action.then(afterChange).catch((e: Error) => {
      setBusy(false);
      setError(e.message);
    });
  };

  const openPreview = (): void => {
    setError(undefined);
    setPreviewBlob(undefined);
    setPreviewOpen(true);
    const e: DiaryEntry =
      editing || !entry
        ? {
            ...buildInput(),
            id: entry ? entry.id : 0,
            diaryTitle: (diaries.filter((d) => d.id === fDiary)[0] || { title: '' }).title,
            entryNo: entry ? entry.entryNo : 0,
            folderPath: entry ? entry.folderPath : '',
            status: entry ? entry.status : EntryStatus.Koncept,
            createdByName: entry ? entry.createdByName : user.displayName,
            createdByLogin: entry ? entry.createdByLogin : user.loginName
          }
        : entry;
    (async (): Promise<void> => {
      const blobs: Record<string, Blob> = {};
      if (entry && project) {
        for (const name of pointFiles(e.points)) {
          try {
            blobs[name] = await repos.documents.readProjectFile(project, filesFolder(entry), name);
          } catch {
            // Chybějící soubor se v náhledu jen vynechá.
          }
        }
      }
      const data = await docDataOf(e, blobs);
      setPreviewBlob(await renderEntryPdf(data));
    })().catch((err: Error) => {
      setPreviewOpen(false);
      setError(`Náhled se nepodařilo vytvořit: ${err.message}`);
    });
  };

  // Zápis mezitím mohl změnit někdo jiný — otevřený detail se sám obnoví.
  const refreshEntry = (): void => {
    if (!entry) {
      return;
    }
    const id = entry.id;
    const before = entry.modified ? entry.modified.getTime() : 0;
    repos.diary
      .getEntry(id)
      .then((fresh) => {
        if (fresh && (fresh.modified ? fresh.modified.getTime() : 0) !== before) {
          setEntry(fresh);
          repos.diary
            .history(id)
            .then(setHistory)
            .catch(() => undefined);
          onChanged();
        }
      })
      .catch(() => undefined);
  };
  useAutoRefresh(refreshEntry, !isOpen || !entry || editing || busy || !!dialog || previewOpen || !!sketch || !!gallery);

  // --- úpravy formuláře ---

  const setPoint = (i: number, patch: Partial<DiaryPoint>): void => setFPoints((cur) => cur.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const setPart = (i: number, patch: Partial<Participant>): void => setFParticipants((cur) => cur.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const setTask = (i: number, patch: Partial<DiaryTask>): void => setFTasks((cur) => cur.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const setCompany = (patch: Partial<EntryHeader['company']>): void => setFHeader((h) => ({ ...h, company: { ...h.company, ...patch } }));

  const changeProject = (key: string): void => {
    setFProject(key);
    const p = projects.filter((x) => x.projectNumber === key)[0];
    setFDiary(pickDiary(key, diaries));
    if (!entry) {
      setFHeader(headerFromProject(p));
    }
  };

  const createDefaultDiary = (): void => {
    if (!fProject) {
      return;
    }
    setBusy(true);
    repos.diary
      .createDiary(fProject, 'Hlavní deník', undefined, user)
      .then((d) => {
        setDiaries((cur) => [...cur, d]);
        setFDiary(d.id);
        setBusy(false);
      })
      .catch((e: Error) => {
        setBusy(false);
        setError(e.message);
      });
  };

  const addParticipantFromPartner = (id: number): void => {
    const p = partners.filter((x) => x.id === id)[0];
    if (p) {
      setFParticipants((cur) => [...cur, { name: p.contactName || '', organization: p.name, present: true }]);
    }
  };

  // --- zobrazení ---

  const headerText = entry
    ? protocol
      ? entryTitle(entry)
      : `Zápis č. ${entry.entryNo}${entry.diaryTitle ? ` · ${entry.diaryTitle}` : ''}`
    : protocol
    ? 'Nový předávací protokol'
    : 'Nový zápis ze stavby';

  const footer = (): JSX.Element | null => {
    if (loading) {
      return null;
    }
    if (editing) {
      return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <DefaultButton text={busy ? 'Pracuji…' : 'Uložit koncept'} disabled={busy} onClick={() => save(false).catch(() => undefined)} />
          <PrimaryButton text={protocol ? 'Uložit a uzavřít protokol' : 'Uložit a uzavřít zápis'} disabled={busy} onClick={() => save(true).catch(() => undefined)} />
          <DefaultButton iconProps={{ iconName: 'PDF' }} text="Náhled" disabled={busy} onClick={openPreview} />
          {entry && (
            <DefaultButton
              text="Zrušit úpravy"
              disabled={busy}
              onClick={() => {
                fillForm(entry, undefined, undefined, projects, diaries);
                setIssues([]);
                setError(undefined);
                setEditing(false);
              }}
            />
          )}
        </div>
      );
    }
    if (!entry) {
      return null;
    }
    const has = (a: EntryAction): boolean => actions.indexOf(a) !== -1;
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {has('edit') && <DefaultButton iconProps={{ iconName: 'Edit' }} text="Upravit" disabled={busy} onClick={() => setEditing(true)} />}
        {has('close') && <PrimaryButton text={protocol ? 'Uzavřít protokol' : 'Uzavřít zápis'} disabled={busy} onClick={() => doClose(entry).catch(() => undefined)} />}
        {has('sign') && <PrimaryButton iconProps={{ iconName: 'Edit' }} text="Podepsat v aplikaci" disabled={busy} onClick={() => setDialog({ kind: 'sign', text: '' })} />}
        {has('scan') && (
          <DefaultButton iconProps={{ iconName: 'Upload' }} text="Nahrát podepsaný sken" disabled={busy} onClick={() => scanRef.current && scanRef.current.click()} />
        )}
        {has('reopen') && <DefaultButton text="Znovu otevřít" disabled={busy} onClick={() => setDialog({ kind: 'reopen', text: '' })} />}
        {has('cancel') && <DefaultButton text="Stornovat" disabled={busy} onClick={() => setDialog({ kind: 'cancel', text: '' })} />}
        <DefaultButton iconProps={{ iconName: 'PDF' }} text="Náhled" disabled={busy} onClick={openPreview} />
      </div>
    );
  };

  const DIALOG_TEXT: Record<DialogKind, { title: string; label: string; required: boolean; confirm: string }> = {
    reopen: { title: protocol ? 'Znovu otevřít protokol' : 'Znovu otevřít zápis', label: protocol ? 'Proč se protokol otevírá? (zapíše se do historie)' : 'Proč se zápis otevírá? (zapíše se do historie)', required: true, confirm: 'Znovu otevřít' },
    cancel: { title: protocol ? 'Stornovat protokol' : 'Stornovat zápis', label: 'Důvod storna', required: true, confirm: 'Stornovat' },
    sign: { title: protocol ? 'Podepsat protokol v aplikaci' : 'Podepsat zápis v aplikaci', label: '', required: false, confirm: 'Podepsat' }
  };

  const hasDiary = diaryOptions.length > 0;

  const footerNode = footer();
  // Hlášky (co chybí, co se nepovedlo) jsou nad tlačítky v patě, kde je uživatel uvidí; bez paty (načítání, nenalezeno) zůstávají nahoře.
  const footerWithMessages = footerNode ? (
    <div>
      <PanelMessages issues={issues} error={error} onDismissError={() => setError(undefined)} />
      {footerNode}
    </div>
  ) : null;

  return (
    <>
      <Panel
        isOpen={isOpen}
        onDismiss={onDismiss}
        type={PanelType.large}
        headerText={headerText}
        closeButtonAriaLabel="Zavřít"
        onRenderNavigationContent={(props, defaultRender) => (
          <>
            <DocumentFolderButton project={project} relativeFolder={entry ? entry.folderPath : folderFor(project, 'diary', settings.folders)} />
            {defaultRender ? defaultRender(props) : null}
          </>
        )}
        isFooterAtBottom
        onRenderFooterContent={() => footerWithMessages}
      >
        {loading && <Spinner size={SpinnerSize.large} label="Načítám…" />}
        {progress && <Spinner size={SpinnerSize.small} label={progress} styles={{ root: { justifyContent: 'flex-start', margin: '6px 0' } }} />}

        {error && !footerNode && (
          <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>
            {error}
          </MessageBar>
        )}
        {notice && (
          <MessageBar messageBarType={notice.type} isMultiline onDismiss={() => setNotice(undefined)}>
            {notice.text}
          </MessageBar>
        )}

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            e.target.value = '';
            addFiles(targetPoint.current, list, true).catch(() => undefined);
          }}
        />
        <input
          ref={fileRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            e.target.value = '';
            addFiles(targetPoint.current, list, false).catch(() => undefined);
          }}
        />
        <input
          ref={scanRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = (e.target.files ?? [])[0];
            e.target.value = '';
            if (f) {
              doScan(f).catch(() => undefined);
            }
          }}
        />

        {!loading && editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
            {draft.pending && <DraftBanner savedAt={draft.pending.savedAt} what={protocol ? 'formulář protokolu' : 'formulář zápisu'} onRestore={draft.restore} onDiscard={draft.discard} />}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Dropdown
                label="Projekt"
                required
                disabled={!!entry}
                options={projectOptions}
                selectedKey={fProject ?? null}
                onChange={(_, o) => o && changeProject(String(o.key))}
                placeholder="Vyberte projekt"
                styles={{ root: { flex: '1 1 260px' } }}
              />
              {!protocol && (
                <Dropdown
                  label="Deník"
                  required
                  disabled={!!entry}
                  options={diaryOptions}
                  selectedKey={fDiary ?? null}
                  onChange={(_, o) => o && setFDiary(Number(o.key))}
                  placeholder={fProject ? 'Vyberte deník' : 'Nejdřív projekt'}
                  styles={{ root: { flex: '1 1 200px' } }}
                />
              )}
              <DatePicker
                label={protocol ? 'Datum předání' : 'Datum'}
                value={fDate}
                onSelectDate={(d) => setFDate(d ?? undefined)}
                formatDate={(d) => (d ? formatDate(d) : '')}
                strings={CS_CALENDAR_STRINGS}
                parseDateFromString={(t) => parseCzechDate(t) ?? null}
                allowTextInput
                styles={{ root: { width: 150 } }}
              />
            </div>
            {!protocol && fProject && !hasDiary && !entry && (
              <MessageBar
                messageBarType={MessageBarType.info}
                isMultiline
                actions={
                  <div>
                    <PrimaryButton text="Založit „Hlavní deník“" disabled={busy} onClick={createDefaultDiary} />
                  </div>
                }
              >
                Tento projekt zatím nemá stavební deník. K jednomu projektu jich může být víc (např. pro různé části stavby).
              </MessageBar>
            )}

            {protocol && (
              <Dropdown
                label="Směr předání"
                required
                disabled={!!entry && entry.status !== EntryStatus.Koncept}
                options={HANDOVER_DIRECTIONS.map((d) => ({ key: d, text: HANDOVER_DIRECTION_LABELS[d] }))}
                selectedKey={fDirection}
                onChange={(_, o) => o && setFDirection(o.key as HandoverDirection)}
              />
            )}

            <div style={{ border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '10px 12px', background: RES.white }}>
              <div style={{ fontWeight: 600, color: RES.navy, marginBottom: 6 }}>{protocol ? 'Hlavička protokolu' : 'Hlavička zápisu'}</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <TextField label="Název stavby" required value={fHeader.constructionName} onChange={(_, v) => setFHeader((h) => ({ ...h, constructionName: v ?? '' }))} styles={{ root: { flex: '1 1 260px' } }} />
                <TextField label="Místo stavby" required value={fHeader.place} onChange={(_, v) => setFHeader((h) => ({ ...h, place: v ?? '' }))} styles={{ root: { flex: '1 1 200px' } }} />
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <TextField label={protocol ? 'Za naši firmu (projektový manažer)' : 'Projektový manažer stavby'} value={fHeader.managerName} onChange={(_, v) => setFHeader((h) => ({ ...h, managerName: v ?? '' }))} styles={{ root: { flex: '1 1 220px' } }} />
                <ComboBox
                  label={protocol ? (fDirection === 'prebirame' ? 'Předává (dodavatel)' : 'Přebírá (objednatel / zákazník)') : 'Jednání s (dodavatel nebo jiný subjekt)'}
                  required={protocol}
                  allowFreeform
                  autoComplete="on"
                  options={partnerOptions}
                  text={fHeader.counterparty ?? ''}
                  onChange={(_, o, __, v) => {
                    if (o) {
                      setFHeader((h) => ({ ...h, counterparty: o.text, counterpartyId: o.key as number }));
                    } else {
                      setFHeader((h) => ({ ...h, counterparty: v ?? '', counterpartyId: undefined }));
                    }
                  }}
                  onInputValueChange={(v) => setFHeader((h) => ({ ...h, counterparty: v, counterpartyId: undefined }))}
                  styles={{ root: { flex: '1 1 260px' } }}
                />
              </div>
              <ActionButton iconProps={{ iconName: showCompany ? 'ChevronUp' : 'ChevronDown' }} text="Firemní údaje v hlavičce" onClick={() => setShowCompany((s) => !s)} />
              {showCompany && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <TextField label="Firma" value={fHeader.company.name} onChange={(_, v) => setCompany({ name: v ?? '' })} styles={{ root: { flex: '1 1 240px' } }} />
                  <TextField label="Ulice" value={fHeader.company.street} onChange={(_, v) => setCompany({ street: v ?? '' })} styles={{ root: { flex: '1 1 200px' } }} />
                  <TextField label="PSČ" value={fHeader.company.zip} onChange={(_, v) => setCompany({ zip: v ?? '' })} styles={{ root: { width: 90 } }} />
                  <TextField label="Město" value={fHeader.company.city} onChange={(_, v) => setCompany({ city: v ?? '' })} styles={{ root: { width: 160 } }} />
                  <TextField label="IČO" value={fHeader.company.ico} onChange={(_, v) => setCompany({ ico: v ?? '' })} styles={{ root: { width: 110 } }} />
                  <TextField label="DIČ" value={fHeader.company.dic} onChange={(_, v) => setCompany({ dic: v ?? '' })} styles={{ root: { width: 130 } }} />
                </div>
              )}
              {!protocol && (
                <TextField
                  label="Počasí a podmínky na stavbě (nepovinné)"
                  value={fConditions}
                  onChange={(_, v) => setFConditions(v ?? '')}
                  placeholder="např. jasno, 12 °C, bez srážek"
                />
              )}
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{protocol ? 'Účastníci předání (kdo protokol podepisuje)' : 'Účastníci'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {fParticipants.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <TextField placeholder="Jméno" ariaLabel={`Jméno účastníka ${i + 1}`} value={p.name} onChange={(_, v) => setPart(i, { name: v ?? '' })} styles={{ root: { flex: '1 1 150px' } }} />
                    <TextField placeholder="Firma / subjekt" ariaLabel={`Firma účastníka ${i + 1}`} value={p.organization ?? ''} onChange={(_, v) => setPart(i, { organization: v ?? '' })} styles={{ root: { flex: '1 1 170px' } }} />
                    <TextField placeholder="Funkce" ariaLabel={`Funkce účastníka ${i + 1}`} value={p.role ?? ''} onChange={(_, v) => setPart(i, { role: v ?? '' })} styles={{ root: { width: 140 } }} />
                    <Checkbox label="přítomen" checked={p.present} onChange={(_, c) => setPart(i, { present: !!c })} styles={{ root: { paddingTop: 6 } }} />
                    <IconButton iconProps={{ iconName: 'Delete' }} ariaLabel={`Odebrat účastníka ${i + 1}`} onClick={() => setFParticipants((cur) => cur.filter((_, k) => k !== i))} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <ActionButton iconProps={{ iconName: 'AddFriend' }} text="Přidat účastníka" onClick={() => setFParticipants((cur) => [...cur, { name: '', present: true }])} />
                <Dropdown
                  placeholder="Přidat z Partnerů…"
                  ariaLabel="Přidat účastníka z Partnerů"
                  options={partnerOptions.map((o) => ({ key: o.key, text: o.text }))}
                  selectedKey={null}
                  onChange={(_, o) => o && addParticipantFromPartner(Number(o.key))}
                  styles={{ root: { width: 240 } }}
                />
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{protocol ? 'Předmět předání a předané doklady' : 'Body jednání'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {fPoints.map((pt, i) => (
                  <div key={i} style={{ border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '8px 10px', background: RES.white }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: RES.navy }}>{i + 1}.</span>
                      <TextField placeholder={protocol ? 'Nadpis položky' : 'Nadpis bodu (nepovinný)'} ariaLabel={`Nadpis bodu ${i + 1}`} value={pt.title ?? ''} onChange={(_, v) => setPoint(i, { title: v ?? '' })} styles={{ root: { flex: '1 1 auto' } }} />
                      <IconButton
                        iconProps={{ iconName: 'Delete' }}
                        ariaLabel={`Odebrat bod ${i + 1}`}
                        disabled={fPoints.length === 1}
                        onClick={() => setFPoints((cur) => cur.filter((_, k) => k !== i))}
                      />
                    </div>
                    <TextField
                      multiline
                      autoAdjustHeight
                      rows={3}
                      placeholder={protocol ? 'Text — co se předává, v jakém stavu, jaké doklady a zkoušky…' : 'Text bodu — co se zjistilo, domluvilo, provedlo…'}
                      ariaLabel={`Text bodu ${i + 1}`}
                      value={pt.text}
                      onChange={(_, v) => setPoint(i, { text: v ?? '' })}
                    />
                    {pt.files.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '8px 0' }}>
                        {pt.files.map((name) => (
                          <FileTile key={name} name={name} url={files[name]} editable onRemove={() => removeFile(i, name)} onAnnotate={() => openAnnotate(i, name)} />
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <DefaultButton
                        iconProps={{ iconName: 'Camera' }}
                        text="Vyfotit"
                        disabled={busy}
                        onClick={() => {
                          targetPoint.current = i;
                          if (cameraRef.current) {
                            cameraRef.current.click();
                          }
                        }}
                      />
                      <DefaultButton
                        iconProps={{ iconName: 'Attach' }}
                        text="Přidat soubor nebo fotku"
                        disabled={busy}
                        onClick={() => {
                          targetPoint.current = i;
                          if (fileRef.current) {
                            fileRef.current.click();
                          }
                        }}
                      />
                      <DefaultButton
                        iconProps={{ iconName: 'Photo2' }}
                        text="Z galerie projektu"
                        disabled={busy || !project}
                        onClick={() => setGallery({ point: i })}
                      />
                      <DefaultButton
                        iconProps={{ iconName: 'Edit' }}
                        text="Nakreslit náčrt"
                        disabled={busy}
                        onClick={() => {
                          ensureSaved()
                            .then(() => setSketch({ point: i }))
                            .catch((e: Error) => setError(e.message));
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <ActionButton iconProps={{ iconName: 'Add' }} text={protocol ? 'Přidat položku' : 'Přidat bod jednání'} onClick={() => setFPoints((cur) => [...cur, emptyPoint()])} />
              <div style={{ fontSize: 12, color: RES.gray }}>
                Fotky a soubory se ukládají rovnou do složky zápisu ve složce projektu; první nahrání uloží zápis jako koncept.
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{protocol ? 'Zjištěné vady a nedodělky' : 'Dohodnuté úkoly'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {fTasks.map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <TextField placeholder={protocol ? 'Vada / nedodělek' : 'Úkol'} ariaLabel={`Úkol ${i + 1}`} value={t.description} onChange={(_, v) => setTask(i, { description: v ?? '' })} styles={{ root: { flex: '2 1 240px' } }} />
                    <TextField placeholder={protocol ? 'Kdo odstraní' : 'Odpovědný'} ariaLabel={`Odpovědný za úkol ${i + 1}`} value={t.responsible ?? ''} onChange={(_, v) => setTask(i, { responsible: v ?? '' })} styles={{ root: { flex: '1 1 140px' } }} />
                    <DatePicker
                      placeholder={protocol ? 'Odstranit do' : 'Termín'}
                      ariaLabel={`Termín úkolu ${i + 1}`}
                      value={parseIsoDay(t.due)}
                      onSelectDate={(d) => setTask(i, { due: d ? isoDay(d) : undefined })}
                      formatDate={(d) => (d ? formatDate(d) : '')}
                      strings={CS_CALENDAR_STRINGS}
                      parseDateFromString={(text) => parseCzechDate(text) ?? null}
                      allowTextInput
                      styles={{ root: { width: 140 } }}
                    />
                    <IconButton iconProps={{ iconName: 'Delete' }} ariaLabel={`Odebrat úkol ${i + 1}`} onClick={() => setFTasks((cur) => cur.filter((_, k) => k !== i))} />
                  </div>
                ))}
              </div>
              <ActionButton iconProps={{ iconName: 'Add' }} text={protocol ? 'Přidat vadu / nedodělek' : 'Přidat úkol'} onClick={() => setFTasks((cur) => [...cur, { description: '' }])} />
            </div>

            {protocol && (
              <div style={{ border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '10px 12px', background: RES.white }}>
                <div style={{ fontWeight: 600, color: RES.navy, marginBottom: 6 }}>Závěr předání</div>
                <Dropdown
                  label="Výsledek předání"
                  required
                  options={HANDOVER_RESULTS.map((r) => ({ key: r, text: HANDOVER_RESULT_LABELS[r] }))}
                  selectedKey={fResult ?? null}
                  onChange={(_, o) => o && setFResult(o.key as HandoverResult)}
                  placeholder="Vyberte výsledek"
                />
                <TextField
                  label="Záruční doba (měsíců, nepovinné)"
                  value={fWarranty}
                  onChange={(_, v) => setFWarranty((v ?? '').replace(/[^0-9]/g, ''))}
                  placeholder="např. 60"
                  description={
                    warrantyMonthsOf(fWarranty) && fDate && fResult !== 'neprevzato'
                      ? `Záruka končí ${formatDate(warrantyEnd(fDate, warrantyMonthsOf(fWarranty) as number))}.`
                      : undefined
                  }
                  styles={{ root: { maxWidth: 260 } }}
                />
              </div>
            )}
          </div>
        )}

        {!loading && !editing && entry && (
          <EntryDetail
            entry={entry}
            history={history}
            files={files}
            project={project}
            onScan={() => scanRef.current && scanRef.current.click()}
            canScan={actions.indexOf('scan') !== -1}
          />
        )}

        {previewOpen && (
          <OrderPdfPreview
            blob={previewBlob}
            fileName={entry ? entryFileName(entry.projectNumber, entry.entryNo, 'pdf', entry.kind) : protocol ? 'Predavaci_protokol_navrh.pdf' : 'Zapis_navrh.pdf'}
            title={entry ? `Náhled: ${entryTitle(entry)}` : protocol ? 'Náhled protokolu (návrh)' : 'Náhled zápisu (návrh)'}
            onDismiss={() => setPreviewOpen(false)}
          />
        )}

        {gallery && project && (
          <PhotoPickerDialog
            project={project}
            onPick={(picked) => {
              attachFromGallery(gallery.point, picked).catch(() => undefined);
            }}
            onClose={() => setGallery(undefined)}
          />
        )}

        {sketch && (
          <SketchDialog
            title={sketch.background ? 'Kreslení do fotky' : 'Náčrt'}
            background={sketch.background}
            onSave={saveSketch}
            onCancel={() => setSketch(undefined)}
          />
        )}

        {dialog && (
          <Dialog
            hidden={false}
            onDismiss={() => setDialog(undefined)}
            dialogContentProps={{ type: DialogType.normal, title: DIALOG_TEXT[dialog.kind].title }}
            modalProps={{ isBlocking: true }}
          >
            {dialog.kind === 'sign' ? (
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                Podepisujete jako <strong>{user.displayName}</strong>. Do {protocol ? 'protokolu' : 'zápisu'} se zapíše vaše jméno, čas a otisk obsahu; {protocol ? 'protokol' : 'zápis'} se pak už nedá měnit.
                <br />
                Jde o jednoduchý elektronický podpis — hodí se pro vnitřní evidenci. Potřebujete-li podpis {protocol ? 'objednatele' : 'dodavatele nebo zákazníka'}, vytiskněte {protocol ? 'protokol' : 'zápis'}
                a nahrajte podepsaný sken.
              </div>
            ) : (
              <TextField label={DIALOG_TEXT[dialog.kind].label} multiline rows={3} value={dialog.text} onChange={(_, v) => setDialog({ ...dialog, text: v ?? '' })} autoFocus />
            )}
            <DialogFooter>
              <PrimaryButton
                text={DIALOG_TEXT[dialog.kind].confirm}
                disabled={DIALOG_TEXT[dialog.kind].required && dialog.text.trim() === ''}
                onClick={confirmDialog}
              />
              <DefaultButton text="Zpět" onClick={() => setDialog(undefined)} />
            </DialogFooter>
          </Dialog>
        )}
      </Panel>
    </>
  );
};

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '2px 0' }}>
    <span style={{ color: RES.gray }}>{label}</span>
    <span style={{ textAlign: 'right' }}>{value}</span>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4, padding: '10px 14px' }}>
    <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: RES.navy }}>{title}</h3>
    {children}
  </section>
);

/** Zobrazení zápisu jen ke čtení: hlavička, účastníci, body s fotkami, úkoly, výstupy a historie. */
const EntryDetail: React.FC<{
  entry: DiaryEntry;
  history: DiaryHistoryEntry[];
  files: Record<string, string>;
  project: Project | undefined;
  onScan: () => void;
  canScan: boolean;
}> = ({ entry, history, files, project, onScan, canScan }) => {
  const closure = closureNote(entry);
  const signature = signatureNote(entry);
  const others = nonImageAttachments(entry);
  const protocol = isHandover(entry);
  const warranty = warrantyNote(entry);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <EntryStatusBadge status={entry.status} signatureKind={entry.signatureKind} />
      </div>

      {entry.status === EntryStatus.Uzavreno && (
        <MessageBar messageBarType={MessageBarType.info} isMultiline>
          {protocol ? 'Protokol je uzavřený a zamčený' : 'Zápis je uzavřený a zamčený'}. Podepište ho v aplikaci, nebo vytiskněte PDF, nechte podepsat a nahrajte sken
          {canScan ? (
            <>
              {' '}
              (<Link onClick={onScan}>nahrát sken</Link>)
            </>
          ) : null}
          .
        </MessageBar>
      )}
      {entry.status === EntryStatus.Storno && entry.cancelReason && (
        <MessageBar messageBarType={MessageBarType.blocked} isMultiline>
          <strong>Stornováno.</strong> {entry.cancelReason}
        </MessageBar>
      )}

      <Section title={protocol ? 'Hlavička protokolu' : 'Hlavička'}>
        <Row
          label="Projekt"
          value={
            <Link href={buildHash(RouteName.ProjectDetail, entry.projectNumber)}>
              {entry.projectNumber}
              {project ? ` · ${project.shortName || project.title}` : ''}
            </Link>
          }
        />
        {!protocol && <Row label="Deník" value={entry.diaryTitle || '—'} />}
        {protocol && <Row label="Číslo protokolu" value={protocolNumber(entry.projectNumber, entry.entryNo)} />}
        <Row label="Stavba" value={entry.header.constructionName || '—'} />
        <Row label="Místo stavby" value={entry.header.place || '—'} />
        <Row label={protocol ? 'Datum předání' : 'Datum'} value={formatDate(entry.date)} />
        {protocol ? (
          <>
            <Row label="Směr předání" value={HANDOVER_DIRECTION_LABELS[handoverDirectionOf(entry)]} />
            <Row label={`Předává (${handoverParties(entry, '').giverRole})`} value={handoverParties(entry, entry.header.company.name).giver || '—'} />
            <Row label={`Přebírá (${handoverParties(entry, '').receiverRole})`} value={handoverParties(entry, entry.header.company.name).receiver || '—'} />
          </>
        ) : (
          <>
            <Row label="Projektový manažer stavby" value={entry.header.managerName || '—'} />
            <Row label="Jednání s" value={entry.header.counterparty || '—'} />
          </>
        )}
        {entry.conditions && <Row label="Počasí a podmínky" value={entry.conditions} />}
        <Row label={protocol ? 'Vystavil' : 'Zapsal'} value={entry.createdByName || '—'} />
      </Section>

      {entry.participants.length > 0 && (
        <Section title={protocol ? 'Účastníci předání' : 'Účastníci'}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {entry.participants.map((p, i) => (
                <tr key={i} style={{ borderTop: i === 0 ? 'none' : `1px solid ${RES.background}` }}>
                  <td style={{ padding: '3px 6px' }}>{p.name}</td>
                  <td style={{ padding: '3px 6px', color: RES.gray }}>{[p.organization, p.role].filter((x) => !!x).join(' · ')}</td>
                  <td style={{ padding: '3px 6px', textAlign: 'right' }}>{p.present ? 'přítomen' : 'omluven'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title={protocol ? 'Předmět předání a předané doklady' : 'Body jednání'}>
        {entry.points.length === 0 && <div style={{ color: RES.gray, fontSize: 13 }}>{protocol ? 'Protokol zatím nemá žádnou položku.' : 'Zápis zatím nemá žádný bod.'}</div>}
        {entry.points.map((p, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600 }}>
              {i + 1}. {p.title && p.title.trim() !== '' ? p.title : protocol ? 'Předmět předání' : 'Bod jednání'}
            </div>
            {p.text && <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, margin: '2px 0 6px' }}>{p.text}</div>}
            {p.files.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {p.files.map((name) => (
                  <FileTile key={name} name={name} url={files[name]} editable={false} />
                ))}
              </div>
            )}
          </div>
        ))}
        {others.length > 0 && <div style={{ fontSize: 12, color: RES.gray }}>Další přílohy: {others.join(', ')}</div>}
      </Section>

      {entry.tasks.length > 0 && (
        <Section title={protocol ? 'Zjištěné vady a nedodělky' : 'Dohodnuté úkoly'}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {entry.tasks.map((t, i) => (
                <tr key={i} style={{ borderTop: i === 0 ? 'none' : `1px solid ${RES.background}` }}>
                  <td style={{ padding: '3px 6px' }}>{t.description}</td>
                  <td style={{ padding: '3px 6px', color: RES.gray }}>{t.responsible || ''}</td>
                  <td style={{ padding: '3px 6px', textAlign: 'right' }}>{t.due ? formatDate(parseIsoDay(t.due)) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {protocol && (
        <Section title="Závěr předání">
          <div style={{ fontWeight: 600, color: handoverResultColor(entry.handover ? entry.handover.result : undefined) }}>
            {entry.handover && entry.handover.result ? HANDOVER_RESULT_LABELS[entry.handover.result] : '—'}
          </div>
          {warranty && <div style={{ fontSize: 13, marginTop: 4 }}>{warranty}</div>}
        </Section>
      )}

      {(entry.pdfUrl || entry.docxUrl || entry.signedUrl || closure || signature) && (
        <Section title="Výstupy a podpis">
          {entry.pdfUrl && <Row label={protocol ? 'PDF protokolu' : 'PDF zápisu'} value={<ExternalLink href={entry.pdfUrl}>otevřít v nové záložce</ExternalLink>} />}
          {entry.docxUrl && <Row label="Word (editovatelný)" value={<ExternalLink href={entry.docxUrl}>otevřít / stáhnout</ExternalLink>} />}
          {entry.signedUrl && <Row label="Podepsaný sken" value={<ExternalLink href={entry.signedUrl}>otevřít v nové záložce</ExternalLink>} />}
          {closure && <div style={{ fontSize: 12, color: RES.gray, marginTop: 6, wordBreak: 'break-all' }}>{closure}</div>}
          {signature && <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{signature}</div>}
          {entry.signatureKind && <div style={{ fontSize: 12, color: RES.gray }}>Způsob podpisu: {SIGNATURE_LABELS[entry.signatureKind]}</div>}
        </Section>
      )}

      {history.length > 0 && (
        <Section title="Historie">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            {history.map((h, i) => (
              <div key={i}>
                <strong>{h.action}</strong> — {h.byName}
                {h.at ? `, ${formatDateTime(h.at)}` : ''}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
};
