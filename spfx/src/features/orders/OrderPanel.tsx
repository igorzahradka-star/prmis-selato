/**
 * Objednávka v postranním panelu: nová, úprava konceptu, zobrazení a akce schvalování.
 *
 * Co smí člověk udělat, rozhoduje `core/orderWorkflow` (tlačítka se podle něj jen nabízejí);
 * skutečná kontrola oprávnění znovu probíhá v datové vrstvě při zápisu.
 */

import { UserSignature, signatureOf } from '../../core/signatures';
import { folderFor } from '../../core/projectFolders';
import * as React from 'react';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { TextField } from '@fluentui/react/lib/TextField';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { ComboBox, IComboBoxOption } from '@fluentui/react/lib/ComboBox';
import { DatePicker } from '@fluentui/react/lib/DatePicker';
import { PrimaryButton, DefaultButton, IconButton, ActionButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Dialog, DialogType, DialogFooter } from '@fluentui/react/lib/Dialog';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { Link } from '@fluentui/react/lib/Link';

import { DocumentFolderButton } from '../../ui/components/DocumentFolderButton';
import { PanelMessages } from '../../ui/components/PanelMessages';
import { removeConceptCopy, saveConceptCopy } from '../documents/conceptCopy';
import { useApp } from '../../ui/AppContext';
import { useAutoRefresh } from '../../ui/useAutoRefresh';
import { ExternalLink } from '../../ui/components/ExternalLink';
import { RES } from '../../ui/theme';
import { CS_CALENDAR_STRINGS } from '../../ui/csCalendarStrings';
import { buildHash, RouteName } from '../../ui/router';
import { Currency, Partner, PartnerType, Project } from '../../core/types';
import { formatDate, formatDateTime, formatMoney, parseAmount, parseCzechDate } from '../../core/format';
import {
  APPROVAL_LEVEL_LABELS,
  ApprovalLevel,
  OrderAttachment,
  OrderLine,
  OrderStatus,
  PurchaseOrder,
  amountNetInCzk,
  lineTotalNet,
  orderTotals,
  validateOrderDraft
} from '../../core/orders';
import {
  Assignee,
  OrderAction,
  approverCandidates,
  availableActions,
  buildApprovalChain,
  canAddAttachment,
  canIssueOrder,
  canRemoveAttachment,
  defaultApproverLogin,
  describeApprovalRoute,
  editResetsApproval,
  toActor,
  toWorkflowProject
} from '../../core/orderWorkflow';
import { RoleMembership } from '../../core/userAdmin';
import { defaultOrderMail } from '../../core/mail';
import {
  approvalRecipients,
  approvalRequestMail,
  decisionMail,
  orderLink,
  requesterRecipient
} from '../../core/orderNotify';
import { ApproverDialog, ApproverRow } from './ApproverDialog';
import { OrderPdfPreview } from './OrderPdfPreview';
import { SendOrderDialog, SendPayload } from './SendOrderDialog';
import { AttachmentsSection } from './AttachmentsSection';
import { refreshBudgetCache } from '../budget/budgetCache';
import { orderPdfData, orderPdfFileName, renderOrderPdf } from './orderPdf';
import { ApprovalRecord, MailAttachment, OrderInput } from '../../data/repositories';
import { CurrencyCode, StoredRates, describeRates, effectiveRates, toCzk } from '../../core/currency';
import { fallbackRatesOf } from '../../core/settings';
import { OrderStatusBadge } from './OrderStatusBadge';

/** Předvyplnění nové objednávky (např. z položky rozpočtu: ⋯ → Objednat). */
export interface OrderPrefill {
  subject: string;
  supplierName?: string;
  currency: string;
  lines: { description: string; quantity: number; unit?: string; unitPriceNet: number }[];
  budgetItemId?: string;
  budgetItemName?: string;
}

export interface OrderPanelProps {
  isOpen: boolean;
  /** Předvyplnění nové objednávky; u existující se nepoužije. */
  prefill?: OrderPrefill;
  /** Existující objednávka; bez ní se zakládá nová. */
  orderId?: number;
  /** U nové objednávky předvybraný projekt (např. z detailu projektu). */
  projectNumber?: string;
  onDismiss: () => void;
  /** Objednávka se změnila — seznam za panelem se má načíst znovu. */
  onChanged: () => void;
}

/** Položka ve formuláři. Čísla se drží jako text, aby šlo psát desetinnou čárku. */
interface LineForm {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
}

const emptyLine = (): LineForm => ({ description: '', quantity: '1', unit: 'ks', unitPrice: '' });

type DialogKind = 'approve' | 'return' | 'reject' | 'cancel';

const DIALOG_TEXT: Record<DialogKind, { title: string; label: string; required: boolean; confirm: string }> = {
  approve: { title: 'Schválit objednávku', label: 'Komentář (nepovinný)', required: false, confirm: 'Schválit' },
  return: { title: 'Vrátit k úpravě', label: 'Co se má změnit?', required: true, confirm: 'Vrátit k úpravě' },
  reject: { title: 'Zamítnout objednávku', label: 'Důvod zamítnutí', required: true, confirm: 'Zamítnout' },
  cancel: { title: 'Stornovat objednávku', label: 'Důvod storna', required: true, confirm: 'Stornovat' }
};

const VAT_OPTIONS: IDropdownOption[] = [
  { key: 21, text: '21 %' },
  { key: 12, text: '12 %' },
  { key: 0, text: '0 % (bez DPH / přenesená povinnost)' }
];
const CURRENCY_OPTIONS: IDropdownOption[] = [
  { key: 'CZK', text: 'CZK' },
  { key: 'EUR', text: 'EUR' },
  { key: 'USD', text: 'USD' }
];

export const OrderPanel: React.FC<OrderPanelProps> = ({ isOpen, orderId, projectNumber, prefill, onDismiss, onChanged }) => {
  const { repos, settings, user } = useApp();
  const actor = React.useMemo(() => toActor(user), [user]);

  const [loading, setLoading] = React.useState(false);
  const [order, setOrder] = React.useState<PurchaseOrder | undefined>(undefined);
  const [approvals, setApprovals] = React.useState<ApprovalRecord[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [partners, setPartners] = React.useState<Partner[]>([]);
  const [storedRates, setStoredRates] = React.useState<StoredRates>({});
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [issues, setIssues] = React.useState<string[]>([]);
  const [dialog, setDialog] = React.useState<{ kind: DialogKind; comment: string } | undefined>(undefined);
  const [roleMembers, setRoleMembers] = React.useState<RoleMembership[]>([]);
  const [attachments, setAttachments] = React.useState<OrderAttachment[]>([]);
  const [pendingFiles, setPendingFiles] = React.useState<File[]>([]);
  const [approverDialog, setApproverDialog] = React.useState<
    { key: number; mode: 'submit' | 'reassign'; orderId: number; rows: ApproverRow[] } | undefined
  >(undefined);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewBlob, setPreviewBlob] = React.useState<Blob | undefined>(undefined);
  const [sendOpen, setSendOpen] = React.useState<'send' | 'resend' | undefined>(undefined);
  const [sendError, setSendError] = React.useState<string | undefined>(undefined);
  const [notice, setNotice] = React.useState<{ text: string; type: MessageBarType } | undefined>(undefined);

  const [fProject, setFProject] = React.useState<string | undefined>(undefined);
  const [fSupplierId, setFSupplierId] = React.useState<number | undefined>(undefined);
  const [fSubject, setFSubject] = React.useState('');
  const [fLines, setFLines] = React.useState<LineForm[]>([emptyLine()]);
  const [fVat, setFVat] = React.useState(21);
  const [fCurrency, setFCurrency] = React.useState<Currency>('CZK');
  const [fDelivery, setFDelivery] = React.useState<Date | undefined>(undefined);
  const [fPayment, setFPayment] = React.useState('30');
  const [fNote, setFNote] = React.useState('');
  /** Navázání na položku realizačního rozpočtu (nepovinné). */
  const [fBudgetItem, setFBudgetItem] = React.useState<{ id: string; name: string } | undefined>(undefined);
  const [budgetItems, setBudgetItems] = React.useState<{ id: string; name: string }[]>([]);

  const fillForm = (o: PurchaseOrder | undefined, preset: string | undefined): void => {
    setFProject(o ? o.projectNumber : preset);
    setFSupplierId(o?.supplierId);
    setFSubject(o ? o.subject : '');
    setFLines(
      o && o.lines.length > 0
        ? o.lines.map((l) => ({
            description: l.description,
            quantity: String(l.quantity).replace('.', ','),
            unit: l.unit ?? '',
            unitPrice: String(l.unitPriceNet).replace('.', ',')
          }))
        : [emptyLine()]
    );
    setFVat(o ? o.vatRate : 21);
    setFCurrency((o?.currency as Currency) || 'CZK');
    setFDelivery(o?.deliveryDate);
    setFPayment(o?.paymentTermDays !== undefined ? String(o.paymentTermDays) : '30');
    setFNote(o?.note ?? '');
    setFBudgetItem(o && o.budgetItemId ? { id: o.budgetItemId, name: o.budgetItemName || '' } : undefined);
    if (!o && prefill) {
      setFSubject(prefill.subject);
      setFCurrency((prefill.currency as Currency) || 'CZK');
      setFLines(
        prefill.lines.length > 0
          ? prefill.lines.map((l) => ({
              description: l.description,
              quantity: String(l.quantity).replace('.', ','),
              unit: l.unit ?? '',
              unitPrice: String(l.unitPriceNet).replace('.', ',')
            }))
          : [emptyLine()]
      );
      setFBudgetItem(prefill.budgetItemId ? { id: prefill.budgetItemId, name: prefill.budgetItemName || '' } : undefined);
    }
  };

  // Načtení dat při otevření panelu.
  React.useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    let cancelled = false;
    setError(undefined);
    setIssues([]);
    setDialog(undefined);
    setBusy(false);
    setLoading(true);
    setOrder(undefined);
    setApprovals([]);
    setAttachments([]);
    setPendingFiles([]);
    setApproverDialog(undefined);
    setPreviewOpen(false);
    setSendOpen(undefined);
    setNotice(undefined);

    Promise.all([
      repos.projects.list({ includeOverhead: true }),
      repos.partners.list({}),
      orderId !== undefined ? repos.orders.getById(orderId) : Promise.resolve(undefined),
      repos.rates.getLatest().catch((): StoredRates => ({})),
      repos.userAdmin.listRoleMembers(settings.roles).catch((): RoleMembership[] => [])
    ])
      .then(([projectList, partnerList, loaded, ratesList, membersList]) => {
        if (cancelled) {
          return;
        }
        setProjects(projectList);
        setPartners(partnerList);
        setStoredRates(ratesList);
        setRoleMembers(membersList);
        setOrder(loaded);
        fillForm(loaded, projectNumber);
        if (!loaded && prefill && prefill.supplierName) {
          const wanted = prefill.supplierName.trim().toLocaleLowerCase('cs-CZ');
          const found = partnerList.filter((p) => p.name.trim().toLocaleLowerCase('cs-CZ') === wanted)[0];
          if (found) {
            setFSupplierId(found.id);
          }
        }
        setEditing(orderId === undefined);
        setLoading(false);
        if (orderId !== undefined && !loaded) {
          setError('Objednávka nebyla nalezena. Nejspíš ji někdo smazal, nebo k ní nemáte oprávnění.');
        }
        if (loaded) {
          repos.orders
            .listApprovals(loaded.id)
            .then((a) => !cancelled && setApprovals(a))
            .catch(() => undefined);
          repos.orders
            .listAttachments(loaded.id)
            .then((a) => !cancelled && setAttachments(a))
            .catch(() => undefined);
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
  }, [isOpen, orderId, projectNumber, repos]);

  const workflowProject = React.useMemo(() => {
    const p = projects.filter((x) => x.projectNumber === (order ? order.projectNumber : fProject))[0];
    return p ? toWorkflowProject(p) : undefined;
  }, [projects, order, fProject]);

  const issuableProjects = React.useMemo(
    () => projects.filter((p) => canIssueOrder(toWorkflowProject(p), actor)),
    [projects, actor]
  );
  const projectOptions: IDropdownOption[] = (order ? projects : issuableProjects)
    .slice()
    .sort((a, b) => a.projectNumber.localeCompare(b.projectNumber, 'cs-CZ', { numeric: true }))
    .map((p) => ({ key: p.projectNumber, text: `${p.projectNumber} · ${p.shortName || p.title}` }));

  const suppliers = partners.filter((p) => p.partnerType !== PartnerType.Zakaznik);
  const supplierOptions: IComboBoxOption[] = suppliers.map((p) => ({ key: p.id, text: p.name }));

  const buildLines = (): OrderLine[] =>
    fLines
      .filter((l) => l.description.trim() !== '' || l.unitPrice.trim() !== '')
      .map((l) => ({
        description: l.description,
        quantity: parseAmount(l.quantity) ?? 0,
        unit: l.unit.trim() || undefined,
        unitPriceNet: parseAmount(l.unitPrice) ?? 0
      }));

  const buildInput = (): OrderInput => ({
    projectNumber: fProject ?? '',
    supplierId: fSupplierId,
    supplierName: suppliers.filter((s) => s.id === fSupplierId)[0]?.name,
    subject: fSubject,
    lines: buildLines(),
    vatRate: fVat,
    currency: fCurrency,
    deliveryDate: fDelivery,
    paymentTermDays: parseAmount(fPayment),
    note: fNote.trim() || undefined,
    budgetItemId: fBudgetItem ? fBudgetItem.id : undefined,
    budgetItemName: fBudgetItem ? fBudgetItem.name : undefined
  });

  // Položky rozpočtu vybraného projektu (jen běžné skupiny — práce a rezerva se neobjednávají).
  React.useEffect(() => {
    const number = order ? order.projectNumber : fProject;
    if (!isOpen || !number) {
      setBudgetItems([]);
      return undefined;
    }
    let cancelled = false;
    repos.budgets
      .get(number)
      .then((b) => {
        if (cancelled) {
          return;
        }
        const standard = b ? b.doc.groups.filter((g) => g.kind === 'standard') : [];
        setBudgetItems(
          b
            ? b.doc.items
                .filter((i) => standard.some((g) => g.id === i.groupId) && i.description.trim() !== '')
                .map((i) => ({ id: i.id, name: `${(standard.filter((g) => g.id === i.groupId)[0] || { name: '' }).name} · ${i.description}` }))
            : []
        );
      })
      .catch(() => !cancelled && setBudgetItems([]));
    return () => {
      cancelled = true;
    };
  }, [repos, isOpen, fProject, order]);

  const afterChange = (saved: PurchaseOrder): void => {
    setOrder(saved);
    setBusy(false);
    onChanged();
    // Změna objednávky mění „objednáno“ a prognózu rozpočtu — přepočítá se semafor projektu (best-effort).
    const proj = projects.filter((p) => p.projectNumber === saved.projectNumber)[0];
    if (proj) {
      refreshBudgetCache(repos, proj, settings, rates).catch(() => undefined);
    }
    repos.orders
      .listApprovals(saved.id)
      .then(setApprovals)
      .catch(() => undefined);
  };

  const reloadAttachments = (id: number): void => {
    repos.orders
      .listAttachments(id)
      .then(setAttachments)
      .catch(() => undefined);
  };

  /** Nahraje soubory čekající na uložení objednávky. Nepovedený soubor nezdrží ostatní; o chybách se řekne. */
  const uploadPending = async (id: number): Promise<string[]> => {
    const failed: string[] = [];
    for (const file of pendingFiles) {
      try {
        await repos.orders.addAttachment(id, file, user);
      } catch (e) {
        failed.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setPendingFiles([]);
    if (pendingFiles.length > 0) {
      reloadAttachments(id);
    }
    return failed;
  };

  /**
   * Koncept PDF (KO) do složky projektu: objednávka se do složky ukládá už při uložení konceptu, aby s ní projektový manažer mohl pracovat dřív.
   * Běží na pozadí; když se nepovede, objednávka je uložená a uživatel se to dozví upozorněním.
   */
  const saveConcept = (saved: PurchaseOrder): void => {
    const proj = projects.filter((p) => p.projectNumber === saved.projectNumber)[0];
    if (!proj || !proj.folderUrl) {
      return;
    }
    const supplier = partners.filter((p) => p.id === saved.supplierId)[0];
    const data = orderPdfData(
      saved,
      proj.shortName || proj.title,
      {
        name: supplier ? supplier.name : saved.supplierName || '—',
        address: supplier ? supplier.address : undefined,
        ico: supplier ? supplier.ico : undefined,
        dic: supplier ? supplier.dic : undefined,
        email: supplier ? supplier.email : undefined
      },
      settings.company
    );
    withSignatures(data)
      .then(renderOrderPdf)
      .then((blob) => saveConceptCopy(repos.documents, proj, folderFor(proj, 'orders', settings.folders), orderPdfFileName(saved.orderNumber), blob))
      .catch((e: unknown) =>
        setNotice({
          text: `Objednávka je uložená, ale koncept PDF (KO) se do složky projektu nepodařilo uložit: ${e instanceof Error ? e.message : String(e)}`,
          type: MessageBarType.warning
        })
      );
  };

  const save = async (thenSubmit: boolean): Promise<void> => {
    const input = buildInput();
    const found = validateOrderDraft(input, thenSubmit);
    if (found.length > 0) {
      setIssues(found.map((i) => i.message));
      return;
    }
    setIssues([]);
    setError(undefined);
    setBusy(true);
    try {
      const saved = order ? await repos.orders.update(order.id, input, user) : await repos.orders.create(input, user);
      // Hned po uložení si objednávku pamatujeme — kdyby selhalo odeslání, další pokus koncept upraví, nezaloží druhý.
      setOrder(saved);
      onChanged();
      const failedFiles = await uploadPending(saved.id);
      afterChange(saved);
      setEditing(false);
      saveConcept(saved);
      if (failedFiles.length > 0) {
        setError(`Objednávka je uložená, ale tyto přílohy se nenahrály — ${failedFiles.join(' | ')}`);
      } else if (thenSubmit) {
        beginSubmit(saved);
      }
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /**
   * Odeslání ke schválení: u každého nevyřízeného kroku si žadatel může vybrat schvalovatele (předvyplněný
   * z číselníku). Když krok schvalovat nikdo nemusí (vlastní objednávka PM v limitu), odešle se rovnou.
   */
  const beginSubmit = (target: PurchaseOrder): void => {
    const project = projects.filter((p) => p.projectNumber === target.projectNumber)[0];
    if (!project) {
      setError(`Projekt ${target.projectNumber} nebyl nalezen, nebo na něj nemáte oprávnění.`);
      return;
    }
    const wf = toWorkflowProject(project);
    const chain = buildApprovalChain({
      amountNetCzk: amountNetInCzk(target.amountNet, target.currency, rates),
      issuerLogin: target.requestedByLogin,
      projectManagerLogin: project.projectManagerLogin,
      isOverhead: project.isOverhead,
      settings: settings.approvals
    });
    const pending = chain.steps.filter((st) => !st.approved);
    if (pending.length === 0) {
      run(() => repos.orders.submit(target.id, user), notifyApprovers);
      return;
    }
    const rows: ApproverRow[] = pending.map((st) => {
      const candidates = approverCandidates(st.level, roleMembers, wf, target.requestedByLogin);
      return {
        level: st.level,
        candidates,
        selected: defaultApproverLogin(st.level, candidates, wf, settings.approvals.defaultApprovers, target.requestedByLogin)
      };
    });
    setApproverDialog({ key: Date.now(), mode: 'submit', orderId: target.id, rows });
  };

  /** Změna schvalovatele: dialog nabídne všechny ještě nevyřízené kroky (třeba když je určený člověk na dovolené). */
  const beginReassign = (): void => {
    if (!order || !workflowProject) {
      return;
    }
    const pendingSteps = order.approvalChain.filter((st) => !st.approved);
    const wf = workflowProject;
    const orderNow = order;
    setApproverDialog({
      key: Date.now(),
      mode: 'reassign',
      orderId: order.id,
      rows: pendingSteps.map((step) => ({
        level: step.level,
        candidates: approverCandidates(step.level, roleMembers, wf, orderNow.requestedByLogin),
        selected: step.assignedLogin ? step.assignedLogin : ''
      }))
    });
  };

  const confirmApprovers = (assignees: Partial<Record<ApprovalLevel, Assignee>>): void => {
    const d = approverDialog;
    setApproverDialog(undefined);
    if (!d) {
      return;
    }
    if (d.mode === 'submit') {
      run(() => repos.orders.submit(d.orderId, user, assignees), notifyApprovers);
      return;
    }
    // Mění se jen ty kroky, u kterých se výběr opravdu změnil; každá změna jde do historie zvlášť.
    const current = order ? order.approvalChain : [];
    const changed = d.rows
      .map((r) => r.level)
      .filter((level) => {
        const step = current.filter((st) => st.level === level && !st.approved)[0];
        const before = step && step.assignedLogin ? step.assignedLogin : '';
        const picked = assignees[level];
        return before !== (picked ? picked.login : '');
      });
    if (changed.length === 0) {
      return;
    }
    run(async () => {
      let saved: PurchaseOrder | undefined;
      for (const level of changed) {
        saved = await repos.orders.reassign(d.orderId, level, assignees[level], user);
      }
      return saved as PurchaseOrder;
    }, notifyApprovers);
  };

  // --- přílohy ---
  const addFiles = (files: File[]): void => {
    if (!order) {
      setPendingFiles((cur) => [...cur, ...files]);
      return;
    }
    setError(undefined);
    setBusy(true);
    (async (): Promise<void> => {
      const failed: string[] = [];
      for (const file of files) {
        try {
          await repos.orders.addAttachment(order.id, file, user);
        } catch (e) {
          failed.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      reloadAttachments(order.id);
      setBusy(false);
      if (failed.length > 0) {
        setError(failed.join(' | '));
      }
    })().catch(() => setBusy(false));
  };

  const removeSavedAttachment = (name: string): void => {
    if (!order) {
      return;
    }
    setError(undefined);
    setBusy(true);
    repos.orders
      .removeAttachment(order.id, name, user)
      .then(() => {
        reloadAttachments(order.id);
        setBusy(false);
      })
      .catch((e: Error) => {
        setBusy(false);
        setError(e.message);
      });
  };

  // --- náhled PDF a odeslání dodavateli ---
  const supplierOf = (id: number | undefined): Partner | undefined => partners.filter((p) => p.id === id)[0];

  const pdfSource = (): { data: ReturnType<typeof orderPdfData>; project?: Project } => {
    const projectNo = editing || !order ? fProject : order.projectNumber;
    const project = projects.filter((p) => p.projectNumber === projectNo)[0];
    const supplierId = editing || !order ? fSupplierId : order.supplierId;
    const supplier = supplierOf(supplierId);
    const current: PurchaseOrder =
      editing || !order
        ? {
            id: order ? order.id : 0,
            orderNumber: order ? order.orderNumber : 'NÁVRH',
            projectNumber: fProject ?? '',
            supplierId: fSupplierId,
            supplierName: supplier ? supplier.name : '',
            subject: fSubject,
            lines: buildLines(),
            amountNet: orderTotals(buildLines(), fVat).net,
            vatRate: fVat,
            currency: fCurrency,
            deliveryDate: fDelivery,
            paymentTermDays: parseAmount(fPayment),
            note: fNote.trim() || undefined,
            status: order ? order.status : OrderStatus.Koncept,
            requestedByName: order ? order.requestedByName : user.displayName,
            requestedByLogin: order ? order.requestedByLogin : user.loginName,
            approvalChain: order ? order.approvalChain : [],
            created: order && order.created ? order.created : new Date()
          }
        : order;
    return {
      data: orderPdfData(
        current,
        project ? project.shortName || project.title : '',
        {
          name: supplier ? supplier.name : current.supplierName || '—',
          address: supplier ? supplier.address : undefined,
          ico: supplier ? supplier.ico : undefined,
          dic: supplier ? supplier.dic : undefined,
          email: supplier ? supplier.email : undefined
        },
        settings.company
      ),
      project
    };
  };

  /**
   * Doplní do PDF obrázky podpisů z profilů (vystavitel a schvalovatelé). Bez obrázku nebo když se podpisy nepodaří načíst zůstane v poli jen jméno
   * se značkou elektronického podpisu — doklad se nikdy kvůli podpisu nezastaví.
   */
  const withSignatures = async (data: ReturnType<typeof orderPdfData>): Promise<ReturnType<typeof orderPdfData>> => {
    const logins = [data.issuer ? data.issuer.login : '', ...data.approvals.map((a) => a.login || '')].filter((l) => l !== '');
    if (logins.length === 0) {
      return data;
    }
    const sigs = await repos.profiles.getSignatures(logins).catch((): Record<string, UserSignature> => ({}));
    return {
      ...data,
      issuer: data.issuer ? { ...data.issuer, image: signatureOf(sigs, data.issuer.login) } : undefined,
      approvals: data.approvals.map((a) => ({ ...a, image: signatureOf(sigs, a.login) }))
    };
  };

  const openPreview = (): void => {
    setError(undefined);
    setPreviewBlob(undefined);
    setPreviewOpen(true);
    withSignatures(pdfSource().data)
      .then(renderOrderPdf)
      .then(setPreviewBlob)
      .catch((e: Error) => {
        setPreviewOpen(false);
        setError(`Náhled se nepodařilo vytvořit: ${e.message}`);
      });
  };

  /**
   * Odeslání dodavateli: vytvoří PDF, uloží ho do složky projektu, (volitelně) pošle e-mail a teprve potom
   * označí objednávku jako odeslanou. Kdyby e-mail selhal, objednávka zůstane „Schváleno" a dá se to zkusit znovu.
   */
  const runSend = async (payload: SendPayload | undefined, again: boolean): Promise<void> => {
    if (!order) {
      return;
    }
    const { data, project } = pdfSource();
    if (!project) {
      setSendError('Projekt objednávky nebyl nalezen.');
      return;
    }
    setBusy(true);
    setSendError(undefined);
    // Které kroky už proběhly — kvůli chybové hlášce (hlavně aby bylo jasné, jestli e-mail odešel).
    let stage = 'Vytvoření PDF';
    let mailSent = false;
    const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));
    try {
      const blob = await renderOrderPdf(await withSignatures(data));
      const fileName = orderPdfFileName(order.orderNumber);
      stage = 'Uložení PDF do složky projektu';
      let pdfUrl: string | undefined;
      try {
        pdfUrl = await repos.documents.saveProjectFile(project, folderFor(project, 'orders', settings.folders), fileName, blob);
      } catch (e) {
        // U opakovaného odeslání PDF ve složce už je; jeho neúspěšné přepsání nesmí bránit odeslání e-mailu.
        if (!again) {
          throw e;
        }
        pdfUrl = order.pdfUrl;
      }
      if (payload) {
        stage = 'Příprava příloh e-mailu';
        const files: MailAttachment[] = [{ name: fileName, contentType: 'application/pdf', content: blob }];
        if (payload.includeAttachments) {
          for (const a of attachments) {
            files.push({ name: a.name, contentType: 'application/octet-stream', content: await repos.orders.readAttachment(order.id, a.name) });
          }
        }
        stage = 'Odeslání e-mailu';
        await repos.mail.send({ to: payload.to, cc: payload.cc, subject: payload.subject, bodyText: payload.body, attachments: files });
        mailSent = true;
      }
      stage = again ? 'Zápis opakovaného odeslání do objednávky' : 'Zápis odeslání do objednávky';
      const options = { sentTo: payload ? payload.to.join(', ') : undefined, pdfUrl };
      const updated = again ? await repos.orders.resend(order.id, user, options) : await repos.orders.send(order.id, user, options);
      // Ostrá verze je uložená — koncept (KO) už není potřeba (maže se do koše SharePointu).
      await removeConceptCopy(repos.documents, project, folderFor(project, 'orders', settings.folders), fileName);
      setSendOpen(undefined);
      afterChange(updated);
    } catch (e) {
      setBusy(false);
      setSendError(
        `${stage} se nepodařilo: ${why(e)}` +
          (mailSent
            ? ` E-mail už ODEŠEL — neposílejte ho znovu, jen zapište odeslání (tlačítko „Jen uložit PDF a ${again ? 'zapsat odeslání' : 'označit jako odesláno'}“).`
            : '')
      );
    }
  };

  /**
   * Provede změnu a po ní (nepovinně) upozorní e-mailem. Když e-mail selže, změna zůstává platná
   * a člověk se to dozví — schvalovatel objednávku v každém případě uvidí v přehledu „Čeká na mě“.
   */
  const run = (action: () => Promise<PurchaseOrder>, after?: (saved: PurchaseOrder) => Promise<void>): void => {
    setError(undefined);
    setNotice(undefined);
    setBusy(true);
    action()
      .then((o) => {
        afterChange(o);
        if (after) {
          after(o).catch(() => undefined);
        }
      })
      .catch((e: Error) => {
        setBusy(false);
        setError(e.message);
      });
  };

  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const projectOf = (o: PurchaseOrder): Project | undefined => projects.filter((p) => p.projectNumber === o.projectNumber)[0];

  /** E-mail schvalovateli, že objednávka čeká na jeho rozhodnutí, s odkazem přímo na ni. */
  const notifyApprovers = async (saved: PurchaseOrder): Promise<void> => {
    if (saved.status !== OrderStatus.KeSchvaleni) {
      return;
    }
    const project = projectOf(saved);
    const step = saved.approvalChain.filter((s) => !s.approved)[0];
    if (!project || !step) {
      return;
    }
    const recipients = approvalRecipients(saved, toWorkflowProject(project), roleMembers);
    if (recipients.length === 0) {
      setNotice({
        text: 'Schvalovateli se nepodařilo poslat upozornění e-mailem (nenašla se jeho adresa). Objednávku uvidí v přehledu Čeká na mě.',
        type: MessageBarType.warning
      });
      return;
    }
    const mail = approvalRequestMail({
      orderNumber: saved.orderNumber,
      projectNumber: saved.projectNumber,
      projectName: project.shortName || project.title,
      subject: saved.subject,
      supplierName: saved.supplierName,
      amountText: formatMoney(saved.amountNet, saved.currency),
      requesterName: saved.requestedByName,
      level: step.level,
      link: orderLink(pageUrl, RouteName.WaitingForMe, saved.id),
      companyName: settings.company.name
    });
    try {
      await repos.mail.send({ to: recipients.map((r) => r.email), subject: mail.subject, bodyText: mail.body, attachments: [] });
      setNotice({
        text: `Schvalovatel byl upozorněn e-mailem: ${recipients.map((r) => r.name).join(', ')}.`,
        type: MessageBarType.success
      });
    } catch (e) {
      setNotice({
        text: `Objednávka čeká na schválení, ale e-mail schvalovateli se nepodařilo odeslat (${e instanceof Error ? e.message : String(e)}). Objednávku uvidí v přehledu Čeká na mě.`,
        type: MessageBarType.warning
      });
    }
  };

  /** Po rozhodnutí: další schvalovatel dostane výzvu, při posledním kroku / vrácení / zamítnutí vystavitel výsledek. */
  const notifyAfterDecision =
    (kind: 'approve' | 'return' | 'reject', comment: string): ((saved: PurchaseOrder) => Promise<void>) =>
    async (saved: PurchaseOrder): Promise<void> => {
      if (kind === 'approve' && saved.status === OrderStatus.KeSchvaleni) {
        await notifyApprovers(saved);
        return;
      }
      const requester = requesterRecipient(saved, roleMembers);
      if (!requester || requester.email.toLowerCase() === (user.email || '').toLowerCase()) {
        return;
      }
      const mail = decisionMail({
        orderNumber: saved.orderNumber,
        subject: saved.subject,
        outcome: kind === 'approve' ? 'schvaleno' : kind === 'return' ? 'vraceno' : 'zamitnuto',
        decidedBy: user.displayName,
        comment: comment.trim() || undefined,
        link: orderLink(pageUrl, RouteName.Orders, saved.id),
        companyName: settings.company.name
      });
      try {
        await repos.mail.send({ to: [requester.email], subject: mail.subject, bodyText: mail.body, attachments: [] });
        setNotice({ text: `Vystavitel (${requester.name}) byl o rozhodnutí informován e-mailem.`, type: MessageBarType.success });
      } catch (e) {
        setNotice({
          text: `Rozhodnutí je uložené, ale e-mail vystaviteli se nepodařilo odeslat (${e instanceof Error ? e.message : String(e)}).`,
          type: MessageBarType.warning
        });
      }
    };

  const confirmDialog = (): void => {
    if (!dialog || !order) {
      return;
    }
    const { kind, comment } = dialog;
    setDialog(undefined);
    if (kind === 'cancel') {
      run(() => repos.orders.cancel(order.id, comment, user));
    } else {
      run(() => repos.orders.decide(order.id, kind, comment, user), notifyAfterDecision(kind, comment));
    }
  };

  // Objednávku mezitím mohl schválit, vrátit nebo změnit někdo jiný — otevřený detail se sám obnoví.
  const refreshOrder = (): void => {
    if (!order) {
      return;
    }
    const id = order.id;
    const before = order.modified ? order.modified.getTime() : 0;
    repos.orders
      .getById(id)
      .then((fresh) => {
        if (fresh && (fresh.modified ? fresh.modified.getTime() : 0) !== before) {
          setOrder(fresh);
          repos.orders
            .listApprovals(id)
            .then(setApprovals)
            .catch(() => undefined);
          reloadAttachments(id);
          onChanged();
        }
      })
      .catch(() => undefined);
  };
  useAutoRefresh(refreshOrder, !isOpen || !order || editing || busy || !!dialog || !!approverDialog || previewOpen || !!sendOpen);

  const rates = effectiveRates(storedRates, fallbackRatesOf(settings.approvals));

  // Náhled cesty schvalování ve formuláři — ať vystavitel ví, co ho čeká, ještě než objednávku odešle.
  const input = buildInput();
  const totals = orderTotals(input.lines, fVat);
  const formProject = projects.filter((p) => p.projectNumber === fProject)[0];
  const route = formProject
    ? buildApprovalChain({
        amountNetCzk: amountNetInCzk(totals.net, fCurrency, rates),
        issuerLogin: order ? order.requestedByLogin : user.loginName,
        projectManagerLogin: formProject.projectManagerLogin,
        isOverhead: formProject.isOverhead,
        settings: settings.approvals
      })
    : undefined;

  const actions: OrderAction[] = order && workflowProject ? availableActions(order, workflowProject, actor) : [];

  const headerText = order ? `Objednávka ${order.orderNumber}` : 'Nová objednávka';

  const footer = (): JSX.Element | null => {
    if (loading) {
      return null;
    }
    if (editing) {
      return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <DefaultButton text={busy ? 'Ukládám…' : 'Uložit koncept'} disabled={busy} onClick={() => save(false).catch(() => undefined)} />
          <PrimaryButton
            text="Uložit a odeslat ke schválení"
            disabled={busy}
            onClick={() => save(true).catch(() => undefined)}
          />
          <DefaultButton iconProps={{ iconName: 'PDF' }} text="Náhled objednávky" disabled={busy} onClick={openPreview} />
          {order && (
            <DefaultButton
              text="Zrušit úpravy"
              disabled={busy}
              onClick={() => {
                fillForm(order, undefined);
                setIssues([]);
                setError(undefined);
                setEditing(false);
              }}
            />
          )}
        </div>
      );
    }
    if (!order) {
      return null;
    }
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {actions.indexOf('edit') !== -1 && (
          <DefaultButton iconProps={{ iconName: 'Edit' }} text="Upravit" disabled={busy} onClick={() => setEditing(true)} />
        )}
        {actions.indexOf('submit') !== -1 && (
          <PrimaryButton text="Odeslat ke schválení" disabled={busy} onClick={() => beginSubmit(order)} />
        )}
        {actions.indexOf('approve') !== -1 && (
          <PrimaryButton text="Schválit" disabled={busy} onClick={() => setDialog({ kind: 'approve', comment: '' })} />
        )}
        {actions.indexOf('return') !== -1 && (
          <DefaultButton text="Vrátit k úpravě" disabled={busy} onClick={() => setDialog({ kind: 'return', comment: '' })} />
        )}
        {actions.indexOf('reject') !== -1 && (
          <DefaultButton text="Zamítnout" disabled={busy} onClick={() => setDialog({ kind: 'reject', comment: '' })} />
        )}
        {actions.indexOf('reassign') !== -1 && (
          <DefaultButton iconProps={{ iconName: 'Contact' }} text="Změnit schvalovatele" disabled={busy} onClick={beginReassign} />
        )}
        {actions.indexOf('send') !== -1 && (
          <PrimaryButton
            text="Odeslat dodavateli"
            disabled={busy}
            onClick={() => {
              setSendError(undefined);
              setSendOpen('send');
            }}
          />
        )}
        {actions.indexOf('resend') !== -1 && (
          <DefaultButton
            iconProps={{ iconName: 'Mail' }}
            text="Odeslat znovu"
            disabled={busy}
            onClick={() => {
              setSendError(undefined);
              setSendOpen('resend');
            }}
          />
        )}
        {actions.indexOf('deliver') !== -1 && (
          <PrimaryButton text="Označit jako dodané" disabled={busy} onClick={() => run(() => repos.orders.deliver(order.id, user))} />
        )}
        {actions.indexOf('close') !== -1 && (
          <PrimaryButton text="Uzavřít" disabled={busy} onClick={() => run(() => repos.orders.close(order.id, user))} />
        )}
        {actions.indexOf('cancel') !== -1 && (
          <DefaultButton text="Stornovat" disabled={busy} onClick={() => setDialog({ kind: 'cancel', comment: '' })} />
        )}
        <DefaultButton iconProps={{ iconName: 'PDF' }} text="Náhled objednávky" disabled={busy} onClick={openPreview} />
      </div>
    );
  };

  const setLine = (index: number, patch: Partial<LineForm>): void =>
    setFLines((cur) => cur.map((l, i) => (i === index ? { ...l, ...patch } : l)));

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
            <DocumentFolderButton project={projects.filter((p) => p.projectNumber === (order ? order.projectNumber : fProject))[0]} relativeFolder={folderFor(projects.filter((p) => p.projectNumber === (order ? order.projectNumber : fProject))[0], 'orders', settings.folders)} />
            {defaultRender ? defaultRender(props) : null}
          </>
        )}
        isFooterAtBottom
        onRenderFooterContent={() => footerWithMessages}
      >
        {loading && <Spinner size={SpinnerSize.large} label="Načítám…" />}

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

        {!loading && editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
            {order && editResetsApproval(order) && (
              <MessageBar messageBarType={MessageBarType.warning} isMultiline>
                Objednávka je {order.status === OrderStatus.Schvaleno ? 'schválená' : 'zamítnutá'}.{' '}
                <strong>Po uložení úprav se dosavadní schvalování smaže</strong> a objednávku bude nutné znovu odeslat ke schválení.
              </MessageBar>
            )}

            {order && order.status === OrderStatus.VracenoKUprave && (
              <MessageBar messageBarType={MessageBarType.severeWarning} isMultiline>
                Objednávka byla vrácena k úpravě. {lastComment(approvals)}
              </MessageBar>
            )}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Dropdown
                label="Projekt"
                required
                disabled={!!order}
                options={projectOptions}
                selectedKey={fProject ?? null}
                onChange={(_, o) => o && setFProject(String(o.key))}
                placeholder="Vyberte projekt"
                styles={{ root: { flex: '1 1 280px' } }}
              />
              <Dropdown
                label="Položka rozpočtu (nepovinné)"
                disabled={!fProject || budgetItems.length === 0}
                options={[{ key: '', text: '— bez navázání —' }, ...budgetItems.map((b) => ({ key: b.id, text: b.name }))]}
                selectedKey={fBudgetItem ? fBudgetItem.id : ''}
                onChange={(_, o) => o && setFBudgetItem(String(o.key) === '' ? undefined : { id: String(o.key), name: String(o.text).replace(/^.*? · /, '') })}
                placeholder={fProject && budgetItems.length === 0 ? 'Projekt nemá rozpočet' : 'Navázat na položku rozpočtu'}
                styles={{ root: { flex: '1 1 280px' } }}
              />
              <ComboBox
                label="Dodavatel"
                required
                allowFreeform={false}
                autoComplete="on"
                options={supplierOptions}
                selectedKey={fSupplierId ?? null}
                onChange={(_, o) => {
                  if (o) {
                    const id = o.key as number;
                    setFSupplierId(id);
                    const partner = suppliers.filter((s) => s.id === id)[0];
                    if (partner && partner.paymentTermDays !== undefined) {
                      setFPayment(String(partner.paymentTermDays));
                    }
                  }
                }}
                placeholder="Vyberte dodavatele z partnerů"
                styles={{ root: { flex: '1 1 280px' } }}
              />
            </div>
            {suppliers.length === 0 && (
              <div style={{ fontSize: 12, color: RES.gray }}>
                V Partnerech zatím není žádný dodavatel. Založte ho v části Partneři (typ Dodavatel) a vraťte se.
              </div>
            )}

            <TextField label="Předmět objednávky" required value={fSubject} onChange={(_, v) => setFSubject(v ?? '')} />

            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Položky</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {fLines.map((l, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <TextField
                      placeholder="Popis položky"
                      ariaLabel={`Popis položky ${i + 1}`}
                      value={l.description}
                      onChange={(_, v) => setLine(i, { description: v ?? '' })}
                      styles={{ root: { flex: '1 1 220px' } }}
                    />
                    <TextField
                      placeholder="Množství"
                      ariaLabel={`Množství položky ${i + 1}`}
                      value={l.quantity}
                      onChange={(_, v) => setLine(i, { quantity: v ?? '' })}
                      styles={{ root: { width: 80 } }}
                    />
                    <TextField
                      placeholder="Jedn."
                      ariaLabel={`Jednotka položky ${i + 1}`}
                      value={l.unit}
                      onChange={(_, v) => setLine(i, { unit: v ?? '' })}
                      styles={{ root: { width: 64 } }}
                    />
                    <TextField
                      placeholder="Cena za jednotku bez DPH"
                      ariaLabel={`Cena položky ${i + 1}`}
                      value={l.unitPrice}
                      onChange={(_, v) => setLine(i, { unitPrice: v ?? '' })}
                      styles={{ root: { width: 150 } }}
                    />
                    <div style={{ width: 110, textAlign: 'right', paddingTop: 6, fontSize: 13 }}>
                      {formatMoney(
                        lineTotalNet({
                          description: l.description,
                          quantity: parseAmount(l.quantity) ?? 0,
                          unitPriceNet: parseAmount(l.unitPrice) ?? 0
                        }),
                        fCurrency
                      )}
                    </div>
                    <IconButton
                      iconProps={{ iconName: 'Delete' }}
                      ariaLabel={`Odebrat položku ${i + 1}`}
                      disabled={fLines.length === 1}
                      onClick={() => setFLines((cur) => cur.filter((_, idx) => idx !== i))}
                    />
                  </div>
                ))}
              </div>
              <ActionButton
                iconProps={{ iconName: 'Add' }}
                text="Přidat položku"
                onClick={() => setFLines((cur) => [...cur, emptyLine()])}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Dropdown
                label="Sazba DPH"
                options={VAT_OPTIONS}
                selectedKey={fVat}
                onChange={(_, o) => o && setFVat(Number(o.key))}
                styles={{ root: { flex: '1 1 200px' } }}
              />
              <Dropdown
                label="Měna"
                options={CURRENCY_OPTIONS}
                selectedKey={fCurrency}
                onChange={(_, o) => o && setFCurrency(String(o.key) as Currency)}
                styles={{ root: { width: 100 } }}
              />
              <DatePicker
                label="Termín dodání"
                value={fDelivery}
                onSelectDate={(d) => setFDelivery(d ?? undefined)}
                formatDate={(d) => (d ? formatDate(d) : '')}
                strings={CS_CALENDAR_STRINGS}
                parseDateFromString={(t) => parseCzechDate(t) ?? null}
                allowTextInput
                styles={{ root: { flex: '1 1 180px' } }}
              />
              <TextField
                label="Splatnost (dnů)"
                value={fPayment}
                onChange={(_, v) => setFPayment(v ?? '')}
                styles={{ root: { width: 120 } }}
              />
            </div>

            <TextField label="Poznámka" multiline rows={2} value={fNote} onChange={(_, v) => setFNote(v ?? '')} />

            <AttachmentsSection
              attachments={attachments}
              pending={pendingFiles}
              canAdd={!order || (!!workflowProject && canAddAttachment(order, workflowProject, actor))}
              canRemove={!order || (!!workflowProject && canRemoveAttachment(order, workflowProject, actor))}
              busy={busy}
              onAdd={addFiles}
              onRemoveSaved={removeSavedAttachment}
              onRemovePending={(i) => setPendingFiles((cur) => cur.filter((_, idx) => idx !== i))}
            />

            <TotalsBox net={totals.net} vat={totals.vat} gross={totals.gross} currency={fCurrency} vatRate={fVat} />
            <CzkNote net={totals.net} currency={fCurrency} rates={rates} />

            {route && (
              <MessageBar messageBarType={MessageBarType.info} isMultiline>
                <strong>Schvaluje:</strong> {describeApprovalRoute(route.steps)}.
              </MessageBar>
            )}
          </div>
        )}

        {!loading && !editing && order && (
          <OrderDetail
            order={order}
            approvals={approvals}
            rates={rates}
            attachments={attachments}
            canAddAttachment={!!workflowProject && canAddAttachment(order, workflowProject, actor)}
            canRemoveAttachment={!!workflowProject && canRemoveAttachment(order, workflowProject, actor)}
            busy={busy}
            onAddFiles={addFiles}
            onRemoveAttachment={removeSavedAttachment}
          />
        )}

      {approverDialog && (
        <ApproverDialog
          key={approverDialog.key}
          title={approverDialog.mode === 'submit' ? 'Odeslat ke schválení' : 'Změnit schvalovatele'}
          description={
            approverDialog.mode === 'submit'
              ? 'Schvalovatel se předvyplňuje podle číselníku. Můžete ho změnit, nebo nechat „kdokoli z role“.'
              : 'Nový schvalovatel dostane objednávku do přehledu Čeká na mě a e-mail s odkazem. Nemůže jím být vystavitel. Už schválené kroky se nemění.'
          }
          confirmText={approverDialog.mode === 'submit' ? 'Odeslat ke schválení' : 'Uložit'}
          rows={approverDialog.rows}
          busy={busy}
          onConfirm={confirmApprovers}
          onDismiss={() => setApproverDialog(undefined)}
        />
      )}

      {previewOpen && (
        <OrderPdfPreview
          blob={previewBlob}
          fileName={orderPdfFileName(order ? order.orderNumber : 'NAVRH')}
          title={order ? `Náhled objednávky ${order.orderNumber}` : 'Náhled objednávky (návrh)'}
          onDismiss={() => setPreviewOpen(false)}
        />
      )}

      {sendOpen && order && (
        <SendOrderDialog
          resend={sendOpen === 'resend'}
          folderLabel={folderFor(projects.filter((p) => p.projectNumber === order.projectNumber)[0], 'orders', settings.folders)}
          orderNumber={order.orderNumber}
          initialTo={(supplierOf(order.supplierId) || { email: '' }).email || ''}
          initialCc={user.email || ''}
          initialSubject={
            defaultOrderMail({
              orderNumber: order.orderNumber,
              projectNumber: order.projectNumber,
              companyName: settings.company.name,
              senderName: user.displayName,
              senderEmail: user.email,
              deliveryDate: order.deliveryDate ? formatDate(order.deliveryDate) : undefined,
              paymentTermDays: order.paymentTermDays
            }).subject
          }
          initialBody={
            defaultOrderMail({
              orderNumber: order.orderNumber,
              projectNumber: order.projectNumber,
              companyName: settings.company.name,
              senderName: user.displayName,
              senderEmail: user.email,
              deliveryDate: order.deliveryDate ? formatDate(order.deliveryDate) : undefined,
              paymentTermDays: order.paymentTermDays
            }).body
          }
          attachmentCount={attachments.length}
          busy={busy}
          error={sendError}
          onSendMail={(payload) => runSend(payload, sendOpen === 'resend').catch(() => undefined)}
          onMarkOnly={() => runSend(undefined, sendOpen === 'resend').catch(() => undefined)}
          onDismiss={() => setSendOpen(undefined)}
        />
      )}

      {dialog && (
        <Dialog
          hidden={false}
          onDismiss={() => setDialog(undefined)}
          dialogContentProps={{ type: DialogType.normal, title: DIALOG_TEXT[dialog.kind].title }}
          modalProps={{ isBlocking: true }}
        >
          <TextField
            label={DIALOG_TEXT[dialog.kind].label}
            multiline
            rows={3}
            value={dialog.comment}
            onChange={(_, v) => setDialog({ ...dialog, comment: v ?? '' })}
            autoFocus
          />
          <DialogFooter>
            <PrimaryButton
              text={DIALOG_TEXT[dialog.kind].confirm}
              disabled={DIALOG_TEXT[dialog.kind].required && dialog.comment.trim() === ''}
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

/** Poslední komentář schvalovatele — ukáže se nad vrácenou objednávkou, aby bylo hned vidět, co má opravit. */
function lastComment(approvals: ApprovalRecord[]): string {
  const last = approvals.filter((a) => a.comment).slice(-1)[0];
  return last ? `${last.approverName}: „${last.comment}“` : '';
}

/** U objednávky v cizí měně: kolik to je v korunách a z jakého kurzu. U korun nic. */
export const CzkNote: React.FC<{ net: number; currency: string; rates: ReturnType<typeof effectiveRates> }> = ({ net, currency, rates }) => {
  if (currency === 'CZK') {
    return null;
  }
  return (
    <div style={{ alignSelf: 'flex-end', fontSize: 12, color: RES.gray, textAlign: 'right', marginTop: 4 }}>
      Bez DPH v Kč: <strong style={{ color: RES.text }}>≈ {formatMoney(toCzk(net, currency, rates), 'CZK')}</strong>
      <br />
      {describeRates(rates, [currency as CurrencyCode])}
    </div>
  );
};

export const TotalsBox: React.FC<{ net: number; vat: number; gross: number; currency: string; vatRate: number }> = ({
  net,
  vat,
  gross,
  currency,
  vatRate
}) => (
  <div
    style={{
      alignSelf: 'flex-end',
      minWidth: 280,
      padding: '8px 14px',
      border: `1px solid ${RES.grayBlue}`,
      borderRadius: 4,
      background: RES.white,
      fontSize: 13
    }}
  >
    <Row label="Celkem bez DPH" value={formatMoney(net, currency)} />
    <Row label={`DPH ${vatRate} %`} value={formatMoney(vat, currency)} />
    <Row label="Celkem s DPH" value={formatMoney(gross, currency)} bold />
  </div>
);

export const Row: React.FC<{ label: string; value: React.ReactNode; bold?: boolean }> = ({ label, value, bold }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '2px 0', fontWeight: bold ? 600 : 400 }}>
    <span style={{ color: bold ? RES.text : RES.gray }}>{label}</span>
    <span>{value}</span>
  </div>
);

/** Zobrazení objednávky jen ke čtení: údaje, položky, součty, cesta schvalování a historie. */
const OrderDetail: React.FC<{
  order: PurchaseOrder;
  approvals: ApprovalRecord[];
  rates: ReturnType<typeof effectiveRates>;
  attachments: OrderAttachment[];
  canAddAttachment: boolean;
  canRemoveAttachment: boolean;
  busy: boolean;
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (name: string) => void;
}> = ({ order, approvals, rates, attachments, canAddAttachment: mayAdd, canRemoveAttachment: mayRemove, busy, onAddFiles, onRemoveAttachment }) => {
  const totals = orderTotals(order.lines, order.vatRate);
  const currentIndex = order.approvalChain.findIndex((s) => !s.approved);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <OrderStatusBadge status={order.status} />
        {order.status === OrderStatus.KeSchvaleni && order.currentApprovalLevel && (
          <span style={{ fontSize: 13, color: RES.gray }}>
            čeká na: <strong style={{ color: RES.text }}>{APPROVAL_LEVEL_LABELS[order.currentApprovalLevel]}</strong>
          </span>
        )}
      </div>

      {order.status === OrderStatus.Storno && order.cancelReason && (
        <MessageBar messageBarType={MessageBarType.blocked} isMultiline>
          <strong>Stornováno.</strong> {order.cancelReason}
        </MessageBar>
      )}

      <Section title="Údaje">
        <Row
          label="Projekt"
          value={<Link href={buildHash(RouteName.ProjectDetail, order.projectNumber)}>{order.projectNumber}</Link>}
        />
        <Row label="Dodavatel" value={order.supplierName || '—'} />
        {order.budgetItemName && <Row label="Položka rozpočtu" value={order.budgetItemName} />}
        <Row label="Předmět" value={order.subject || '—'} />
        <Row label="Termín dodání" value={order.deliveryDate ? formatDate(order.deliveryDate) : '—'} />
        <Row label="Splatnost" value={order.paymentTermDays !== undefined ? `${order.paymentTermDays} dnů` : '—'} />
        <Row label="Vystavil" value={order.requestedByName || '—'} />
        <Row label="Vystaveno" value={order.created ? formatDate(order.created) : '—'} />
        {order.sentDate && <Row label="Odesláno dodavateli" value={formatDate(order.sentDate)} />}
        {order.pdfUrl && (
          <Row label="PDF objednávky" value={<ExternalLink href={order.pdfUrl}>otevřít v nové záložce</ExternalLink>} />
        )}
        {order.note && <Row label="Poznámka" value={order.note} />}
      </Section>

      <Section title="Položky">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: RES.gray }}>
              <th style={{ padding: '4px 6px' }}>Popis</th>
              <th style={{ padding: '4px 6px', textAlign: 'right' }}>Množství</th>
              <th style={{ padding: '4px 6px', textAlign: 'right' }}>Cena/jedn.</th>
              <th style={{ padding: '4px 6px', textAlign: 'right' }}>Celkem</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${RES.background}` }}>
                <td style={{ padding: '4px 6px' }}>{l.description}</td>
                <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                  {l.quantity} {l.unit || ''}
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'right' }}>{formatMoney(l.unitPriceNet, order.currency)}</td>
                <td style={{ padding: '4px 6px', textAlign: 'right' }}>{formatMoney(lineTotalNet(l), order.currency)}</td>
              </tr>
            ))}
            {order.lines.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 8, color: RES.gray }}>
                  Objednávka zatím nemá žádné položky.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <TotalsBox net={totals.net} vat={totals.vat} gross={totals.gross} currency={order.currency} vatRate={order.vatRate} />
        <CzkNote net={totals.net} currency={order.currency} rates={rates} />
      </Section>

      {order.approvalChain.length > 0 && (
        <Section title="Schvalování">
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.7 }}>
            {order.approvalChain.map((s, i) => (
              <li key={i} style={{ fontWeight: i === currentIndex && order.status === OrderStatus.KeSchvaleni ? 600 : 400 }}>
                {s.approved ? '✓ ' : i === currentIndex && order.status === OrderStatus.KeSchvaleni ? '⏳ ' : '○ '}
                {APPROVAL_LEVEL_LABELS[s.level]}
                {s.approved && s.auto && ' — schváleno automaticky (vystavitel je projektový manažer)'}
                {s.approved && !s.auto && s.byName && ` — ${s.byName}${s.at ? `, ${formatDateTime(s.at)}` : ''}`}
                {!s.approved && ` — ${s.assignedName ? s.assignedName : 'kdokoli z role'}`}
              </li>
            ))}
          </ol>
        </Section>
      )}

      <Section title="Přílohy">
        <AttachmentsSection
          hideTitle
          attachments={attachments}
          pending={[]}
          canAdd={mayAdd}
          canRemove={mayRemove}
          busy={busy}
          onAdd={onAddFiles}
          onRemoveSaved={onRemoveAttachment}
          onRemovePending={() => undefined}
        />
      </Section>

      {approvals.length > 0 && (
        <Section title="Historie rozhodnutí">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            {approvals.map((a, i) => (
              <div key={i}>
                <strong>{a.decision}</strong> — {a.approverName}
                {a.decidedAt ? `, ${formatDateTime(a.decidedAt)}` : ''}
                {a.comment && <div style={{ color: RES.gray }}>„{a.comment}“</div>}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
};

export const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section
    style={{
      background: RES.white,
      border: `1px solid ${RES.grayBlue}`,
      borderRadius: 4,
      padding: '10px 14px'
    }}
  >
    <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: RES.navy }}>{title}</h3>
    {children}
  </section>
);
